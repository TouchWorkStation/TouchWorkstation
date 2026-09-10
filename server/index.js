import express from 'express';
import jwt from 'jsonwebtoken';
import os from 'os';
import fs from 'fs';
import path from 'path';
import {execFile, exec, spawn} from 'child_process';
import {promisify} from 'util';
import crypto from 'crypto';
import http from 'http';
import https from 'https';
import net from 'net';
import {attachPty} from './pty.js';
import {mountAppRoutes} from './apps-routes.js';
import {mountAgentRoutes} from './agents-routes.js';
import {mountBoardRoutes} from './agent-board-routes.js';
import {mountDockerRoutes} from './docker-routes.js';

const sh=promisify(exec);
const app=express();
app.set('trust proxy','loopback');
app.use(express.json({limit:'5mb'}));
const PORT=Number(process.env.PORT||8787);
const HOME=process.env.TW_HOME||os.homedir();

const CRASH_LOG_FILE=path.join(HOME,'.touchworkstation','crash-log.json');
function recordCrash(kind,err){
  try{
    fs.mkdirSync(path.dirname(CRASH_LOG_FILE),{recursive:true});
    let log=[];
    try{log=JSON.parse(fs.readFileSync(CRASH_LOG_FILE,'utf8'))}catch{}
    log.push({
      at:new Date().toISOString(),
      kind, // 'uncaughtException' | 'unhandledRejection'
      message:String(err?.message||err),
      stack:String(err?.stack||''),
    });
    // Keep this bounded — a crash loop shouldn't grow this file forever.
    if(log.length>20)log=log.slice(-20);
    fs.writeFileSync(CRASH_LOG_FILE,JSON.stringify(log,null,2));
  }catch{ /* if we can't even write the crash log, there's nothing more to do here */ }
}
process.on('uncaughtException',(err)=>{
  recordCrash('uncaughtException',err);
  console.error('Uncaught exception — exiting for a clean restart:',err);
  process.exit(1);
});
process.on('unhandledRejection',(reason)=>{
  recordCrash('unhandledRejection',reason);
  console.error('Unhandled rejection — exiting for a clean restart:',reason);
  process.exit(1);
});
// Build a PATH that includes the user's own install dirs so npm/node/vite and
// user-installed CLIs run under the minimal systemd service PATH. This is the
// same fix applied to detection and the terminal — without it, a freshly
// cloned repo's dev server can't find its tools and dies, so the preview
// never comes up.
function twPath(){
  const extra=[`${HOME}/.local/bin`,`${HOME}/.npm-global/bin`,`${HOME}/bin`,`${HOME}/.cargo/bin`,`${HOME}/.deno/bin`,`${HOME}/.bun/bin`,'/usr/local/bin','/usr/bin','/bin','/snap/bin'];
  try{const nvm=`${HOME}/.nvm/versions/node`;if(fs.existsSync(nvm))for(const v of fs.readdirSync(nvm))extra.push(`${nvm}/${v}/bin`)}catch{}
  return [...new Set([...(process.env.PATH||'').split(':'),...extra])].filter(Boolean).join(':');
}
const {NODE_ENV:_ignoredNodeEnv,...ENV_NO_NODE_ENV}=process.env;
// Never let NODE_ENV=production leak into project installs/dev servers.
// With it set, `npm install` silently skips ALL devDependencies (exit 0, no
// error) — and vite/next/etc. live there, so the dev server binary never
// gets installed even though the install step reports success. This was the
// actual root cause of "vite: not found" after an install that looked fine.
const SPAWN_ENV={...ENV_NO_NODE_ENV,PATH:twPath()};

// Hermes ships a local web gateway. This endpoint finds the running gateway
// (or starts it) and returns a same-origin proxied URL so the UI opens in a
// webview instead of a terminal. We probe the ports Hermes commonly uses.
const HERMES_PORTS=[8787+1,8080,3000,7860,8000,5000,8788];
async function probePort(p){return new Promise(r=>{const s=net.createConnection({host:'127.0.0.1',port:p,timeout:600});s.once('connect',()=>{s.destroy();r(true)});s.once('error',()=>{s.destroy();r(false)});s.once('timeout',()=>{s.destroy();r(false)})})}
// APP_PASSWORD is mutable at runtime: a fresh install ships a random
// generated password and PW_MUST_CHANGE=1, and the user is required to set
// their own before using the app. Changing it rewrites the env file on disk
// (the source of truth postinst/systemd read) and updates this process's
// in-memory copy, so no restart is needed.
let APP_PASSWORD=process.env.APP_PASSWORD||'changeme';
let PW_MUST_CHANGE=process.env.PW_MUST_CHANGE==='1';
const ENV_FILE=process.env.TW_ENV_FILE||'/etc/touchworkstation/touchworkstation.env';
const JWT_SECRET=process.env.JWT_SECRET||'dev-only-change-me';
const STATE_DIR=process.env.TW_STATE_DIR||path.join(HOME,'.local/share/touchworkstation');
const RUN_DIR=path.join(STATE_DIR,'run');
const CONFIG_FILE=path.join(STATE_DIR,'config.json');
const PROJECTS_DEFAULT=path.join(HOME,'TouchWorkstation','Projects');
fs.mkdirSync(RUN_DIR,{recursive:true});
fs.mkdirSync(PROJECTS_DEFAULT,{recursive:true});
let runners=new Map();

function parseCookies(req){return Object.fromEntries((req.headers.cookie||'').split(';').map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf('=');return [x.slice(0,i),decodeURIComponent(x.slice(i+1))]}));}
function auth(req,res,next){try{const t=parseCookies(req).tw_session||req.headers.authorization?.replace('Bearer ','');if(!t)throw 0;req.user=jwt.verify(t,JWT_SECRET);next()}catch{res.status(401).json({error:'Not authenticated'})}}
app.post('/api/login',(req,res)=>{if(req.body.password!==APP_PASSWORD)return res.status(401).json({error:'Invalid password'});const token=jwt.sign({sub:os.userInfo().username},JWT_SECRET,{expiresIn:'30d'});res.setHeader('Set-Cookie',`tw_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`);res.json({ok:true,mustChangePassword:PW_MUST_CHANGE})});
app.get('/api/me',auth,(req,res)=>res.json({hostname:os.hostname(),user:os.userInfo().username,version:'1.0.0-beta.26',mustChangePassword:PW_MUST_CHANGE}));

// Rewrite APP_PASSWORD= (and clear PW_MUST_CHANGE) in the env file in place,
// preserving every other line, so systemd/postinst keep reading the same
// source of truth on the next boot or upgrade.
function persistPassword(newPassword){
  let lines=[];
  try{lines=fs.readFileSync(ENV_FILE,'utf8').split('\n')}catch{ /* fresh/dev env, nothing to preserve */ }
  let sawPw=false,sawFlag=false;
  lines=lines.map(l=>{
    if(l.startsWith('APP_PASSWORD=')){sawPw=true;return `APP_PASSWORD=${newPassword}`}
    if(l.startsWith('PW_MUST_CHANGE=')){sawFlag=true;return 'PW_MUST_CHANGE=0'}
    return l;
  });
  if(!sawPw)lines.push(`APP_PASSWORD=${newPassword}`);
  if(!sawFlag)lines.push('PW_MUST_CHANGE=0');
  const out=lines.filter((l,i)=>l!==''||i<lines.length-1).join('\n');
  try{fs.writeFileSync(ENV_FILE,out.endsWith('\n')?out:out+'\n',{mode:0o640})}
  catch(e){throw new Error('Could not save the new password to '+ENV_FILE+': '+e.message)}
}

app.post('/api/change-password',auth,(req,res)=>{
  const {currentPassword,newPassword}=req.body||{};
  if(currentPassword!==APP_PASSWORD)return res.status(401).json({error:'Current password is incorrect'});
  const np=String(newPassword||'');
  if(np.length<8)return res.status(400).json({error:'New password must be at least 8 characters'});
  if(np===APP_PASSWORD)return res.status(400).json({error:'Choose a password different from the current one'});
  try{persistPassword(np)}catch(e){return res.status(500).json({error:e.message})}
  APP_PASSWORD=np;PW_MUST_CHANGE=false;
  res.json({ok:true});
});
let lastCpuSample=null;
function cpuSnapshot(){const cpus=os.cpus();let idle=0,total=0;for(const c of cpus){idle+=c.times.idle;for(const t of Object.values(c.times))total+=t}return{idle,total}}
function liveCpu(){const cur=cpuSnapshot();if(!lastCpuSample){lastCpuSample=cur;return Math.max(0,Math.min(100,Math.round((1-cur.idle/cur.total)*100)))}const di=cur.idle-lastCpuSample.idle,dt=cur.total-lastCpuSample.total;lastCpuSample=cur;if(dt<=0)return 0;return Math.max(0,Math.min(100,Math.round((1-di/dt)*100)))}
// List active tmux sessions TouchWorkstation created (prefixed tw-), so the
// terminal switcher can show what's really running instead of guessing.
// Sessions persist across app closes/reconnects by design (tmux -A
// reattaches), so this is the only reliable source of truth for "what
// terminals do I actually have open right now".
// Whether the shared 'main' terminal session is free to reuse right now.
// "Free" means its foreground process is a plain shell (bash/sh/zsh) —
// anything else (an agent CLI mid-conversation, a long-running command)
// means typing another command into it would go to the wrong program, so
// the caller should open a fresh session instead. This is what lets
// "one terminal by default" behave safely: reuse main when it's idle,
// don't silently interrupt something that's actively running.
const SHELL_NAMES=new Set(['bash','sh','zsh','fish','dash']);
app.get('/api/terminal/main-busy',auth,async(req,res)=>{
  try{
    const {stdout}=await sh("tmux list-panes -t tw-main -F '#{pane_current_command}' 2>/dev/null || true",{env:SPAWN_ENV});
    const cmd=stdout.trim().split('\n')[0]||'';
    if(!cmd)return res.json({exists:false,busy:false}); // session doesn't exist yet -> definitely free
    res.json({exists:true,busy:!SHELL_NAMES.has(cmd),runningCommand:cmd});
  }catch{
    res.json({exists:false,busy:false});
  }
});
app.get('/api/terminal/sessions',auth,async(req,res)=>{
  try{
    // Use an explicit delimiter unlikely to appear in a session name, rather
    // than a literal tab — a tab character passed through exec's shell
    // quoting was getting silently mangled, corrupting the parsed fields.
    const {stdout}=await sh("tmux list-sessions -F '#{session_name}::TWSEP::#{session_created}::TWSEP::#{session_attached}' 2>/dev/null || true",{env:SPAWN_ENV});
    const sessions=stdout.trim().split('\n').filter(Boolean).map(line=>{
      const [name,created,attached]=line.split('::TWSEP::');
      if(!name||!name.startsWith('tw-'))return null;
      return {id:name.slice(3),createdAt:Number(created)*1000,attached:attached==='1'};
    }).filter(Boolean);
    res.json({sessions,tmux:true});
  }catch{
    res.json({sessions:[],tmux:false});
  }
});
// Close (kill) a specific terminal session entirely, rather than just
// detaching from it. Used by the switcher's "close" action.
app.post('/api/terminal/sessions/:id/close',auth,async(req,res)=>{
  const id=String(req.params.id||'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,64);
  if(!id)return res.status(400).json({error:'Invalid session id'});
  try{await sh(`tmux kill-session -t ${JSON.stringify('tw-'+id)}`,{env:SPAWN_ENV});res.json({ok:true})}
  catch(e){res.status(400).json({error:String(e.stderr||e.message)})}
});
app.get('/api/terminal/sessions/:id/history',auth,async(req,res)=>{
  const id=String(req.params.id||'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,64);
  if(!id)return res.status(400).json({error:'Invalid session id'});
  try{
    const {stdout}=await sh(`tmux capture-pane -t ${JSON.stringify('tw-'+id)} -p -e -S -3000`,{env:SPAWN_ENV});
    res.json({text:stdout});
  }catch(e){res.status(400).json({error:String(e.stderr||e.message)})}
});
app.get('/api/crash-log',auth,(req,res)=>{
  try{
    const log=JSON.parse(fs.readFileSync(CRASH_LOG_FILE,'utf8'));
    res.json({crashes:Array.isArray(log)?log:[]});
  }catch{res.json({crashes:[]})}
});
app.post('/api/crash-log/ack',auth,(req,res)=>{
  try{fs.writeFileSync(CRASH_LOG_FILE,'[]')}catch{}
  res.json({ok:true});
});
let lastNet=null; // {rx,tx,at} — previous /proc/net/dev sample, for rate calculation
function netRates(){
  try{
    const lines=fs.readFileSync('/proc/net/dev','utf8').split('\n').slice(2);
    let rx=0,tx=0;
    for(const line of lines){
      const m=line.trim().match(/^([^:]+):\s*(.+)$/);
      if(!m||m[1]==='lo')continue;
      const cols=m[2].trim().split(/\s+/).map(Number);
      rx+=cols[0]||0; tx+=cols[8]||0;
    }
    const now=Date.now();
    let rxRate=0,txRate=0;
    if(lastNet){
      const dt=(now-lastNet.at)/1000;
      if(dt>0){rxRate=Math.max(0,(rx-lastNet.rx)/dt);txRate=Math.max(0,(tx-lastNet.tx)/dt)}
    }
    lastNet={rx,tx,at:now};
    return {rxBps:rxRate,txBps:txRate};
  }catch{return {rxBps:0,txBps:0}}
}
app.get('/api/status',auth,async(req,res)=>{
  let disk=0,diskUsedGB=0,diskTotalGB=0;
  try{
    // df -P gives POSIX-stable column order: size, used, avail, %used, mount.
    // Values come back in 1K blocks; convert to GB for a human-readable spec.
    const {stdout}=await sh("df -P / | tail -1 | awk '{print $2, $3, $5}'");
    const [totalKB,usedKB,pct]=stdout.trim().split(/\s+/);
    disk=parseInt(pct)||0;
    diskTotalGB=Math.round((Number(totalKB)||0)/1024/1024*10)/10;
    diskUsedGB=Math.round((Number(usedKB)||0)/1024/1024*10)/10;
  }catch{}
  const cpu=liveCpu();
  const memTotalBytes=os.totalmem(),memFreeBytes=os.freemem();
  const memory=Math.round((1-memFreeBytes/memTotalBytes)*100);
  const memTotalGB=Math.round(memTotalBytes/1073741824*10)/10;
  const memUsedGB=Math.round((memTotalBytes-memFreeBytes)/1073741824*10)/10;
  const cpus=os.cpus();
  const ip=Object.values(os.networkInterfaces()).flat().find(x=>x&&x.family==='IPv4'&&!x.internal)?.address;
  const net=netRates();
  res.json({
    cpu,memory,disk,ip,uptime:os.uptime(),net,
    specs:{
      cpuCores:cpus.length,
      cpuModel:(cpus[0]?.model||'').replace(/\s+/g,' ').trim(),
      memUsedGB,memTotalGB,
      diskUsedGB,diskTotalGB,
    },
  });
});

function safeHome(p=''){const resolved=path.resolve(p||HOME);if(!resolved.startsWith(path.resolve(HOME)))throw new Error('Path outside home directory is blocked');return resolved}
app.get('/api/files',auth,(req,res)=>{try{const p=safeHome(req.query.path||HOME);const entries=fs.readdirSync(p,{withFileTypes:true}).filter(x=>!x.name.startsWith('.')).map(x=>({name:x.name,directory:x.isDirectory(),path:path.join(p,x.name)})).sort((a,b)=>Number(b.directory)-Number(a.directory)||a.name.localeCompare(b.name));const parent=p===HOME?null:path.dirname(p);res.json({path:p,parent,entries})}catch(e){res.status(400).json({error:e.message})}});

app.post('/api/terminal/exec',auth,async(req,res)=>{const command=String(req.body.command||'').trim();if(!command)return res.json({output:''});try{const {stdout,stderr}=await sh(command,{cwd:HOME,timeout:30000,maxBuffer:2_000_000,shell:'/bin/bash'});res.json({output:(stdout||'')+(stderr||'')})}catch(e){res.status(400).json({error:(e.stdout||'')+(e.stderr||e.message)})}});

const projectRoots=()=>[PROJECTS_DEFAULT,path.join(HOME,'Projects'),path.join(HOME,'Developer'),path.join(HOME,'Code'),path.join(HOME,'src')].filter((x,i,a)=>a.indexOf(x)===i&&fs.existsSync(x));
import {execSync} from 'child_process';
function sync(cmd,env){try{return execSync(cmd,{encoding:'utf8',stdio:['ignore','pipe','ignore'],shell:'/bin/bash',env:env||process.env}).trim()}catch{return''}}
function detectProject(dir){let stack='Project',runCommand='',port=null,installCommand='';const pkgPath=path.join(dir,'package.json');if(fs.existsSync(pkgPath)){try{const p=JSON.parse(fs.readFileSync(pkgPath,'utf8'));const deps={...(p.dependencies||{}),...(p.devDependencies||{})};if(deps.vite){stack='Vite';port=5173}else if(deps.next){stack='Next.js';port=3000}else if(deps.react){stack='React';port=3000}else if(deps.vue){stack='Vue';port=5173}else if(deps['@angular/core']){stack='Angular';port=4200}else{stack='Node.js';port=3000}if(p.scripts?.dev)runCommand='npm run dev';else if(p.scripts?.start)runCommand='npm start';
  // --include=dev forces devDependencies to install even if NODE_ENV is set
  // to "production" somewhere in the environment (a user's shell profile,
  // inherited from another tool, etc). Without this, `npm install` silently
  // exits 0 while skipping every devDependency — which is exactly where
  // vite/next/etc. live — so the dev server binary never gets installed and
  // Run fails with "not found" despite the install step reporting success.
  installCommand=fs.existsSync(path.join(dir,'pnpm-lock.yaml'))?'pnpm install':fs.existsSync(path.join(dir,'yarn.lock'))?'yarn install':'npm install --include=dev'}catch{}}
else if(fs.existsSync(path.join(dir,'pyproject.toml'))||fs.existsSync(path.join(dir,'requirements.txt'))){stack='Python';runCommand='python3 -m http.server 8000';port=8000;installCommand=fs.existsSync(path.join(dir,'requirements.txt'))?'python3 -m pip install -r requirements.txt':''}
else if(fs.existsSync(path.join(dir,'Cargo.toml'))){stack='Rust';runCommand='cargo run';installCommand='cargo build'}
else if(fs.existsSync(path.join(dir,'go.mod'))){stack='Go';runCommand='go run .';port=8080}
const branch=sync(`git -C ${JSON.stringify(dir)} branch --show-current`);const changes=sync(`git -C ${JSON.stringify(dir)} status --porcelain`).split('\n').filter(Boolean).length;const running=[...runners.entries()].find(([,v])=>v.cwd===dir);
const remoteUrl=sync(`git -C ${JSON.stringify(dir)} remote get-url origin 2>/dev/null`);
const ghMatch=remoteUrl&&remoteUrl.match(/github\.com[:/]+([^/]+)\/([^/.]+?)(?:\.git)?\/?$/);
const nameWithOwner=ghMatch?`${ghMatch[1]}/${ghMatch[2]}`:null;
return{name:path.basename(dir),path:dir,stack,branch,changes,runCommand,installCommand,port:running?.[1]?.port||port,running:!!running,ready:!!running?.[1]?.ready,nameWithOwner}}
function scanProjects(){const out=[];for(const root of projectRoots()){for(const ent of fs.readdirSync(root,{withFileTypes:true}).filter(x=>x.isDirectory()&&!x.name.startsWith('.'))){const d=path.join(root,ent.name);if(fs.existsSync(path.join(d,'.git'))||fs.existsSync(path.join(d,'package.json'))||fs.existsSync(path.join(d,'pyproject.toml'))||fs.existsSync(path.join(d,'Cargo.toml'))||fs.existsSync(path.join(d,'go.mod')))out.push(detectProject(d));}}return out.sort((a,b)=>a.name.localeCompare(b.name))}
app.get('/api/projects',auth,(req,res)=>res.json({projects:scanProjects()}));
async function projectAction(req,res,kind){try{const dir=safeHome(req.body.path);if(kind==='install'){const p=detectProject(dir);if(!p.installCommand)throw new Error('No install command detected');const {stdout,stderr}=await sh(p.installCommand,{cwd:dir,timeout:10*60*1000,maxBuffer:10_000_000,shell:'/bin/bash',env:SPAWN_ENV});return res.json({message:(stdout+stderr).slice(-4000)})}if(kind==='run'){const p=detectProject(dir);if(!p.runCommand)throw new Error('No run command detected');
// Fresh clones have no node_modules — a dev server started without deps dies
// instantly and the preview shows a white screen. Auto-install first.
// Also catches the "node_modules exists but is broken" case: a partial or
// interrupted install (or one copied in from another machine/arch) leaves
// node_modules present but missing the actual package internals — e.g.
// vite/bin/vite.js exists but vite/dist/node/cli.js it imports does not.
// Checking only for node_modules' existence misses this entirely and the
// dev server crashes with ERR_MODULE_NOT_FOUND on every Run.
function installLooksBroken(dir){
  const nm=path.join(dir,'node_modules');
  if(!fs.existsSync(nm))return true;
  let pkg;try{pkg=JSON.parse(fs.readFileSync(path.join(dir,'package.json'),'utf8'))}catch{return false}
  const deps=Object.keys({...(pkg.dependencies||{}),...(pkg.devDependencies||{})});
  const critical=deps.filter(d=>['vite','next','vue','@angular/core','@angular/cli','react-scripts'].some(k=>d===k||d.startsWith(k)));
  for(const dep of critical){
    const depDir=path.join(nm,dep);
    if(!fs.existsSync(depDir))return true;
    let dpkg;
    try{
      const dpkgPath=path.join(depDir,'package.json');
      if(!fs.existsSync(dpkgPath))return true;
      dpkg=JSON.parse(fs.readFileSync(dpkgPath,'utf8'));
    }catch{return true}
    const bins=typeof dpkg.bin==='string'?{[dpkg.name]:dpkg.bin}:(dpkg.bin||{});
    for(const [binName,b] of Object.entries(bins)){
      const binPath=path.join(depDir,b);
      if(!fs.existsSync(binPath))return true;
      // npm run dev / bare `vite` resolves through node_modules/.bin/<name>,
      // a symlink npm creates as part of a real `npm install`. If the
      // package files were placed some other way (a raw copy/rsync/tarball
      // extraction, or an install that got interrupted after unpacking but
      // before linking), the package itself can be completely intact while
      // this symlink is simply never created — the shell then reports
      // "<name>: not found" even though nothing about the package is
      // actually broken. This was the real root cause here: vite/bin/vite.js
      // and vite/dist/node/cli.js were both fine; node_modules/.bin/vite
      // just didn't exist.
      const linkPath=path.join(nm,'.bin',binName);
      if(!fs.existsSync(linkPath))return true;
      // The bin wrapper existing on disk isn't enough — it's commonly a thin
      // file that imports/requires the tool's real entry point one level
      // deeper (e.g. vite/bin/vite.js containing `import '../dist/node/cli.js'`).
      // A truncated/interrupted install can leave the wrapper in place while
      // what it points to is missing, which crashes on Run with
      // ERR_MODULE_NOT_FOUND. We statically read the wrapper's own
      // import/require specifiers and confirm each resolved target exists —
      // this never executes the file (so it can't start a dev server or
      // have any other side effect), and it generalizes across frameworks
      // instead of hardcoding each one's internal layout.
      let src;try{src=fs.readFileSync(binPath,'utf8')}catch{return true}
      const specifiers=[...src.matchAll(/(?:from\s+|import\s+|import\s*\(|require\s*\(\s*)['"](\.[^'"]+)['"]/g)].map(m=>m[1]);
      for(const spec of specifiers){
        const base=path.join(path.dirname(binPath),spec);
        const candidates=[base,base+'.js',base+'.mjs',base+'.cjs',path.join(base,'index.js')];
        if(!candidates.some(c=>fs.existsSync(c)))return true;
      }
    }
  }
  return false;
}
const isNode=fs.existsSync(path.join(dir,'package.json'));
if(isNode&&installLooksBroken(dir)&&p.installCommand){
  try{await sh(`rm -rf node_modules package-lock.json && ${p.installCommand}`,{cwd:dir,timeout:10*60*1000,maxBuffer:20_000_000,shell:'/bin/bash',env:SPAWN_ENV})}
  catch(e){return res.status(400).json({error:'Dependency install failed:\n'+String(e.stderr||e.message).slice(-3000)})}
}
let port=p.port||5173;while([...runners.values()].some(x=>x.port===port))port++;let cmd=p.runCommand;if(p.stack==='Vite')cmd+=` -- --host 0.0.0.0 --port ${port}`;else if(p.stack==='Next.js')cmd+=` -- -H 0.0.0.0 -p ${port}`;else if(p.stack==='Vue')cmd+=` -- --host 0.0.0.0 --port ${port}`;else if(p.stack==='Angular')cmd+=` -- --host 0.0.0.0 --port ${port}`;const log=path.join(RUN_DIR,crypto.createHash('sha1').update(dir).digest('hex')+'.log');const fd=fs.openSync(log,'a');const child=spawn('/bin/bash',['-lc',cmd],{cwd:dir,detached:true,stdio:['ignore',fd,fd],env:{...SPAWN_ENV,HOST:'0.0.0.0',PORT:String(port)}});child.unref();const runnerEntry={pid:child.pid,cwd:dir,port,log,ready:false};runners.set(child.pid,runnerEntry);
// Wait up to ~20s for the port to actually accept connections, so we don't
// report success (and show a doomed preview) before the server is ready.
// A real TCP connect attempt (not a process/port-table check) is used
// because it doesn't depend on `ss`/`netstat` being installed, and it tests
// the exact thing the preview proxy will do a moment later.
async function portIsOpen(p){
  return new Promise((resolve)=>{
    const sock=net.createConnection({host:'127.0.0.1',port:p,timeout:900});
    sock.once('connect',()=>{sock.destroy();resolve(true)});
    sock.once('error',()=>{sock.destroy();resolve(false)});
    sock.once('timeout',()=>{sock.destroy();resolve(false)});
  });
}
let up=false;for(let i=0;i<40;i++){await new Promise(r=>setTimeout(r,500));if(await portIsOpen(port)){up=true;runnerEntry.ready=true;break}try{process.kill(child.pid,0)}catch{break}}
// Some dev servers (Next.js first compile, Angular) take longer than the
// 20s window above. Keep probing in the background so `ready` still flips
// true and the client's next poll of /api/projects picks it up, instead of
// requiring the user to hit Run again.
if(!up){(async()=>{for(let i=0;i<60;i++){await new Promise(r=>setTimeout(r,2000));if(!runners.has(child.pid))return;if(await portIsOpen(port)){runnerEntry.ready=true;return}}})();}
if(!up){const tail=(()=>{try{return fs.readFileSync(log,'utf8').slice(-2000)}catch{return''}})();return res.json({message:`Started on port ${port}, but it isn\u2019t responding yet. Still trying in the background \u2014 check back in a bit. Recent log:\n${tail}`,port,ready:false})}
return res.json({message:`Running on port ${port}`,port,ready:true})}if(kind==='stop'){for(const [pid,v]of runners){if(v.cwd===dir){try{process.kill(-pid,'SIGTERM')}catch{}runners.delete(pid)}}return res.json({message:'Stopped'})}if(kind==='pull'){const {stdout,stderr}=await sh('git pull',{cwd:dir});return res.json({message:stdout+stderr})}if(kind==='push'){const {stdout,stderr}=await sh('git push',{cwd:dir});return res.json({message:stdout+stderr})}if(kind==='commit'){const m=String(req.body.message||'').trim();if(!m)throw new Error('Commit message required');await sh('git add -A',{cwd:dir});const {stdout,stderr}=await sh(`git commit -m ${JSON.stringify(m)}`,{cwd:dir,shell:'/bin/bash'});return res.json({message:stdout+stderr})}}catch(e){res.status(400).json({error:e.stderr||e.message})}}
for(const k of ['install','run','stop','pull','push','commit'])app.post('/api/projects/'+k,auth,(req,res)=>projectAction(req,res,k));

app.post('/api/github/clone',auth,async(req,res)=>{try{const url=String(req.body.url||'').trim();if(!/^https?:\/\/github\.com\//.test(url)&&!/^git@github\.com:/.test(url))throw new Error('Enter a GitHub repository URL');const name=url.split('/').pop().replace(/\.git$/,'');const dest=path.join(PROJECTS_DEFAULT,name);await sh(`git clone ${JSON.stringify(url)} ${JSON.stringify(dest)}`,{timeout:10*60*1000,shell:'/bin/bash'});res.json({message:'Repository cloned',path:dest})}catch(e){res.status(400).json({error:e.stderr||e.message})}});
app.post('/api/github/login',auth,async(req,res)=>{const ok=sync('command -v gh');if(!ok)return res.json({message:'GitHub CLI is not installed. Install `gh` for your Linux distribution, then run `gh auth login` in Terminal.'});res.json({message:'Open Terminal and run: gh auth login. TouchWorkstation will use the credentials stored by GitHub CLI on this workstation.'})});
async function ghSafe(cmd){try{const {stdout}=await sh(cmd,{shell:'/bin/bash'});return stdout.trim()}catch{return''}}
app.get('/api/github/status',auth,async(req,res)=>{
  const connected=!!(await ghSafe('gh auth status 2>/dev/null && echo yes'));
  if(!connected)return res.json({connected:false,repos:[]});
  const [user,repoJson]=await Promise.all([
    ghSafe("gh api user --jq '.login' 2>/dev/null"),
    ghSafe("gh repo list --limit 8 --json nameWithOwner,description,stargazerCount,url,isPrivate,updatedAt 2>/dev/null"),
  ]);
  let repos=[];try{repos=JSON.parse(repoJson||'[]')}catch{}
  res.json({connected:true,user,repos});
});
app.get('/api/github/repos',auth,async(req,res)=>{
  const repoJson=await ghSafe("gh repo list --limit 50 --json nameWithOwner,description,stargazerCount,url,isPrivate,updatedAt 2>/dev/null");
  let repos=[];try{repos=JSON.parse(repoJson||'[]')}catch{}
  res.json({repos});
});

// Find a running Hermes web gateway and return a proxied URL for it. If none
// is running, report that so the client can offer to start it in a terminal.
app.get('/api/hermes/ui',auth,async(req,res)=>{
  for(const p of HERMES_PORTS){
    if(await probePort(p))return res.json({ready:true,url:`/preview/${p}/`,port:p});
  }
  res.json({ready:false});
});
// Start the Hermes gateway in a tracked background process, then report when
// its port is up so the client can open the UI.
app.post('/api/hermes/start',auth,async(req,res)=>{
  // Try the known gateway subcommands; whichever the installed hermes supports
  // will bind a port, the others fail harmlessly.
  const log=path.join(RUN_DIR,'hermes-gateway.log');
  const fd=fs.openSync(log,'a');
  const cmd='hermes serve 2>/dev/null || hermes gateway 2>/dev/null || hermes web 2>/dev/null || hermes daemon 2>/dev/null';
  const child=spawn('/bin/bash',['-lc',cmd],{cwd:HOME,detached:true,stdio:['ignore',fd,fd],env:SPAWN_ENV});
  child.unref();
  // Wait up to ~15s for any known gateway port to come up.
  for(let i=0;i<30;i++){
    await new Promise(r=>setTimeout(r,500));
    for(const p of HERMES_PORTS){if(await probePort(p))return res.json({ready:true,url:`/preview/${p}/`,port:p})}
    try{process.kill(child.pid,0)}catch{break}
  }
  const tail=(()=>{try{return fs.readFileSync(log,'utf8').slice(-1500)}catch{return''}})();
  res.json({ready:false,message:'Could not detect the Hermes web gateway automatically.',log:tail});
});
function loadConfig(){try{return JSON.parse(fs.readFileSync(CONFIG_FILE,'utf8'))}catch{return{projectFolders:projectRoots(),agentRuntime:null,onboarded:false}}}
function saveConfig(c){fs.mkdirSync(path.dirname(CONFIG_FILE),{recursive:true});fs.writeFileSync(CONFIG_FILE,JSON.stringify(c,null,2))}
app.post('/api/setup/complete',auth,(req,res)=>{const c=loadConfig();c.onboarded=true;saveConfig(c);res.json({ok:true})});
app.get('/api/settings',auth,(req,res)=>{const c=loadConfig();res.json({...c,github:!!sync('gh auth status 2>/dev/null && echo yes')})});
app.post('/api/settings',auth,(req,res)=>{
  const c=loadConfig();
  const body=req.body||{};
  if('theme' in body)c.theme=body.theme;
  if('uiVariant' in body&&(body.uiVariant==='omarchy'||body.uiVariant==='standard'))c.uiVariant=body.uiVariant;
  if('homeTiles' in body){
    const t=body.homeTiles;
    if(Array.isArray(t)&&t.every(x=>typeof x==='string'))c.homeTiles=t;
  }
  saveConfig(c);
  res.json({ok:true,theme:c.theme,homeTiles:c.homeTiles,uiVariant:c.uiVariant});
});
function classifyConnection(req){
  const host=(req.hostname||'').toLowerCase();
  if(host.endsWith('.ts.net'))return 'tailscale';
  const raw=(req.ip||req.socket?.remoteAddress||'').replace(/^::ffff:/,'');
  if(raw==='127.0.0.1'||raw==='::1')return 'local';
  const o=raw.split('.').map(Number);
  if(o.length===4){
    if(o[0]===100&&o[1]>=64&&o[1]<=127)return 'tailscale'; // Tailscale's CGNAT range
    if(o[0]===10||(o[0]===192&&o[1]===168)||(o[0]===172&&o[1]>=16&&o[1]<=31))return 'lan';
  }
  return 'other';
}
app.get('/api/vpn/status',auth,(req,res)=>{
  const connectionType=classifyConnection(req);
  const installed=!!sync('command -v tailscale',SPAWN_ENV);
  if(!installed)return res.json({installed:false,connected:false,ip:null,hostname:null,connectionType,viaTailscale:connectionType==='tailscale',secure:req.secure});
  const ip=sync('tailscale ip -4 2>/dev/null',SPAWN_ENV);
  let hostname=null,backendState=null;
  try{const j=JSON.parse(sync('tailscale status --json 2>/dev/null',SPAWN_ENV)||'{}');hostname=j.Self?.DNSName?.replace(/\\.$/,'')||null;backendState=j.BackendState||null}catch{}
  res.json({installed:true,connected:!!ip,ip:ip||null,hostname,backendState,connectionType,viaTailscale:connectionType==='tailscale',secure:req.secure,httpsUrl:hostname?`https://${hostname}`:null});
});
// Attempt to install Tailscale. Returns installed:true if it worked, or a
// terminal command for the user to run if we lack passwordless sudo.
app.post('/api/vpn/install',auth,async(req,res)=>{
  if(sync('command -v tailscale',SPAWN_ENV))return res.json({installed:true,message:'Tailscale is already installed.'});
  try{
    await sh('sudo -n sh -c "curl -fsSL https://tailscale.com/install.sh | sh"',{timeout:10*60*1000,env:SPAWN_ENV});
    if(sync('command -v tailscale',SPAWN_ENV))return res.json({installed:true,message:'Tailscale installed.'});
    throw new Error('not installed after attempt');
  }catch{
    // No passwordless sudo — hand the user a one-line command to run in Terminal.
    res.json({installed:false,needsTerminal:true,command:'curl -fsSL https://tailscale.com/install.sh | sh',message:'TouchWorkstation needs one command in Terminal to install Tailscale (it requires administrator access).'});
  }
});
// Bring Tailscale up and capture the sign-in URL so the user can authenticate
// by tapping a link instead of hunting through terminal output.
app.post('/api/vpn/up',auth,async(req,res)=>{
  if(!sync('command -v tailscale',SPAWN_ENV))return res.status(400).json({error:'Tailscale is not installed yet.'});
  if(sync('tailscale ip -4 2>/dev/null',SPAWN_ENV))return res.json({connected:true,message:'Remote access is already connected.'});
  try{
    // tailscale up prints the auth URL to stderr; run non-interactively and capture it.
    const {stdout,stderr}=await sh('sudo -n tailscale up --timeout=5s 2>&1 || tailscale up --timeout=5s 2>&1',{timeout:20000,env:SPAWN_ENV}).catch(e=>({stdout:e.stdout||'',stderr:e.stderr||e.message||''}));
    const out=(stdout||'')+(stderr||'');
    const m=out.match(/https:\/\/login\.tailscale\.com\/[^\s]+/);
    if(m)return res.json({authUrl:m[0],message:'Open this link to sign in, then return here.'});
    if(sync('tailscale ip -4 2>/dev/null',SPAWN_ENV))return res.json({connected:true,message:'Connected.'});
    // Couldn't run tailscale up (needs sudo) — give the terminal fallback.
    res.json({needsTerminal:true,command:'sudo tailscale up',message:'Run this in Terminal to sign in, then return here.'});
  }catch(e){
    res.json({needsTerminal:true,command:'sudo tailscale up',message:'Run this in Terminal to sign in, then return here.'});
  }
});
app.get('/api/update/check',auth,(req,res)=>res.json({message:'You are running the GitHub-ready beta. Automatic signed update checks will be enabled after the first public release.'}));

// Preview reverse proxy: /preview/:port/* -> local dev server, served from
// the SAME origin as TouchWorkstation so it's reachable from any device
// (LAN or Tailscale) without exposing the raw dev port.
//
// Dev servers (Vite, webpack-dev-server, etc.) commonly emit ROOT-ABSOLUTE
// asset paths — Vite always injects `<script src="/@vite/client">`, and a
// typical index.html has `<script src="/src/main.jsx">`; the client script
// itself further imports things like `/node_modules/vite/dist/client/env.mjs`.
// Those resolve against the page's real origin per the URL spec — <base href>
// does NOT change resolution for root-absolute URLs, only relative ones — so
// they bypass the /preview/:port/ prefix entirely and hit TouchWorkstation's
// own root, which 404s or serves the wrong thing. That's what actually causes
// "the app loads but looks unstyled" — CSS/JS never really load.
// Rewriting every absolute reference in every HTML/JS/CSS response is
// fragile and incomplete (it's arbitrary JS). Instead: for HTML we rewrite
// the obvious src/href attributes AND set <base>, AND — the fix that
// actually closes the gap — a catch-all just before the SPA handler checks
// the Referer header; if a request arrived without the /preview/:port
// prefix but its Referer shows it came from a preview page, we know it's
// exactly this bypass case and proxy it to that same dev server.
async function proxyToDevServer(req,res,port){
  const target=`http://127.0.0.1:${port}${req.url}`;
  let lastErr=null;
  for(let attempt=0;attempt<4;attempt++){
    try{
      const r=await fetch(target,{headers:{...req.headers,host:`127.0.0.1:${port}`},redirect:'manual'});
      const ct=r.headers.get('content-type')||'';
      res.status(r.status);
      for(const [k,v]of r.headers){if(!['content-encoding','content-length','transfer-encoding','content-security-policy'].includes(k.toLowerCase()))res.setHeader(k,v)}
      if(ct.includes('text/html')){
        let html=await r.text();
        const base=`/preview/${port}`;
        html=html.replace(/((?:src|href)=)(["'])\/(?!\/)/gi,(m,attr,q)=>`${attr}${q}${base}/`);
        if(!/<base /i.test(html)) html=html.replace(/<head([^>]*)>/i,`<head$1><base href="${base}/">`);
        return res.send(html);
      }
      return res.send(Buffer.from(await r.arrayBuffer()));
    }catch(e){lastErr=e;await new Promise(r=>setTimeout(r,600))}
  }
  const refused=/ECONNREFUSED/.test(String(lastErr?.cause?.code||lastErr?.message||''));
  res.status(502).send(`<html><body style="font-family:system-ui;background:#0b090d;color:#e8e2ea;padding:24px;text-align:center"><h3 style="color:#ff7647">Dev server on port ${port} isn\u2019t reachable</h3><p style="color:#a99fae;font-size:14px">${refused?'Nothing is listening on that port yet. The dev server may still be starting, or it may have exited \u2014 check the Dev log on the project screen.':'The dev server returned an error. Check the Dev log on the project screen.'}</p></body></html>`);
}
app.use('/preview/:port',auth,async(req,res)=>{
  const port=Number(req.params.port);
  if(!Number.isInteger(port)||port<1024||port>65535)return res.status(400).send('Invalid port');
  await proxyToDevServer(req,res,port);
});
// Rescue root-absolute asset requests that escaped the /preview/:port
// prefix (see comment above) by checking whether the request's Referer
// shows it came from a preview page — this only fires for requests that
// didn't match the route above, so it never interferes with
// TouchWorkstation's own UI/API.
app.use((req,res,next)=>{
  const ref=req.headers.referer||'';
  const m=ref.match(/\/preview\/(\d+)\//);
  if(!m)return next();
  const port=Number(m[1]);
  if(!Number.isInteger(port)||port<1024||port>65535)return next();
  proxyToDevServer(req,res,port);
});

// API routes must be registered BEFORE the static handler and SPA catch-all,
// otherwise the catch-all returns index.html for /api/* requests.
mountAppRoutes(app,{auth,HOME});
mountAgentRoutes(app,{auth,HOME,stateDir:STATE_DIR});
mountBoardRoutes(app,{auth,stateDir:STATE_DIR});
mountDockerRoutes(app,{auth});
const dist=path.resolve(process.cwd(),'dist');
app.use(express.static(dist,{
  maxAge:'1y',
  immutable:true,
  setHeaders:(res,filePath)=>{
    // Only /assets/*.<hash>.js|css are safe to cache long — anything else
    // (index.html, sw.js, the manifest) must always be revalidated, or a
    // deploy can silently keep serving the previous build.
    if(!filePath.includes(`${path.sep}assets${path.sep}`)){
      res.setHeader('Cache-Control','no-store');
    }
  },
}));
app.use((req,res)=>res.set('Cache-Control','no-store').sendFile(path.join(dist,'index.html')));
const server=http.createServer(app);
attachPty(server,{jwtSecret:JWT_SECRET,home:HOME});
server.listen(PORT,'0.0.0.0',()=>console.log(`TouchWorkstation listening on :${PORT}`));

// Optional HTTPS listener. This is what actually flips isSecureContext to
// true in the browser, which is required for the Clipboard API (native
// copy/paste) to work at all — Tailscale alone (a private network path)
// does not do this on its own.
//
// Deliberately non-privileged (8443, not 443): binding 443 needs either
// root or a capability grant on the systemd unit, which isn't something
// this app can set up for itself. 8443 needs nothing extra and works
// immediately with the existing service as-is.
//
// Fully optional and backwards-compatible: if no cert is present yet, this
// block does nothing at all and the existing HTTP server on PORT keeps
// working exactly as it does today. See TLS-SETUP.md for how to generate
// the cert with `tailscale cert`.
const HTTPS_PORT=Number(process.env.HTTPS_PORT||8443);
const TLS_DIR=process.env.TW_TLS_DIR||path.join(HOME,'.touchworkstation','tls');
const tlsCertPath=path.join(TLS_DIR,'cert.pem'),tlsKeyPath=path.join(TLS_DIR,'key.pem');
if(fs.existsSync(tlsCertPath)&&fs.existsSync(tlsKeyPath)){
  try{
    const httpsServer=https.createServer({cert:fs.readFileSync(tlsCertPath),key:fs.readFileSync(tlsKeyPath)},app);
    attachPty(httpsServer,{jwtSecret:JWT_SECRET,home:HOME});
    httpsServer.listen(HTTPS_PORT,'0.0.0.0',()=>console.log(`TouchWorkstation HTTPS listening on :${HTTPS_PORT}`));
  }catch(e){
    console.error(`Found a TLS cert at ${TLS_DIR} but couldn't start HTTPS: ${e.message}`);
  }
}else{
  console.log(`No TLS cert at ${TLS_DIR} — HTTPS not started. See TLS-SETUP.md.`);
}
