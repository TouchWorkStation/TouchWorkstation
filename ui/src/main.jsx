import React,{useEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {
  Home,Grid3X3,Folder,TerminalSquare,Settings,Bot,Play,Square,RefreshCcw,
  ShieldCheck,Palette,Smartphone,CheckCircle2,Cpu,HardDrive,MemoryStick,Wifi,
  ChevronRight,Star,ExternalLink,Code2,GitBranch,Search,Monitor,Download,Upload,
  ArrowLeft,ChevronDown,Copy,Globe2,PanelLeft,Command,Plus,Send,FileText,GitCommit,
  RotateCcw,Maximize2,Activity,Clock3,Server,Cloud,LockKeyhole,SlidersHorizontal,
  LayoutGrid,House,PlugZap,Network,Info,Check,AlertTriangle,X,Eye,Menu,Trash2,LogIn,Loader,
  Sparkles,Cpu as CpuIcon,Zap,Circle,PauseCircle,PlayCircle,Share,Box,Image as ImageIcon
} from 'lucide-react';
import TerminalPTY from './TerminalPTY.jsx';
import MinimalTerminalPTY from './MinimalTerminalPTY.jsx';
import MinimalDashboard from './MinimalDashboard.jsx';
import { AppsV2, WebviewApp, useAppLauncher, ModeChooserSheet, ICONS } from './AppsV2.jsx';
import { HomeTileSettings, buildTileCatalog, resolveHomeTiles, DEFAULT_HOME_TILES } from './HomeTiles.jsx';
import { AgentDetail } from './AgentDetail.jsx';
import { RemoteAccess } from './RemoteAccess.jsx';
import { WallpaperPicker } from './WallpaperPicker.jsx';
import { DockerView } from './DockerView.jsx';
import './styles.css';

// The Arch/Omarchy package builds with VITE_THEME=minimal (see
// packaging/arch/PKGBUILD) — every other distro's build (.deb/.rpm/generic)
// never sets it. This is only the *default* though: Settings > Appearance
// can override it per-install (settings.uiVariant), since the build-time
// flag depends on whatever produced the binary actually having set it
// correctly — a packaging pipeline outside this repo can drift out of sync
// with it. The effective value is computed per-render in App() from
// settings, with this constant as the fallback before settings load / for
// distros that never touch it.
const BUILD_OMARCHY=import.meta.env.VITE_THEME==='minimal';

const API='/api';
export async function api(path,opts={}){
  const r=await fetch(API+path,{credentials:'include',headers:{'Content-Type':'application/json',...(opts.headers||{})},...opts});
  const text=await r.text(); let body={}; try{body=text?JSON.parse(text):{}}catch{body={raw:text}};
  if(r.status===401) throw new Error('AUTH'); if(!r.ok) throw new Error(body.error||`HTTP ${r.status}`); return body;
}
const fmtUptime=s=>{if(!s&&s!==0)return'—';const d=Math.floor(s/86400),h=Math.floor((s%86400)/3600),m=Math.floor((s%3600)/60);return d?`${d}d ${h}h ${m}m`:`${h}h ${m}m`};
const shortPath=p=>p?.replace(/^\/home\/[^/]+/,'~')||'';
const fmtWhen=iso=>{if(!iso)return'never';const d=new Date(iso),diff=(Date.now()-d)/1000;if(diff<60)return'just now';if(diff<3600)return`${Math.floor(diff/60)}m ago`;if(diff<86400)return`${Math.floor(diff/3600)}h ago`;return d.toLocaleDateString()};

// Decide which terminal session a launch should land in. The product intent
// is ONE terminal by default — every ordinary launch reuses 'main' — but
// typing a new command into a session that's already running something
// interactive (an agent CLI, a long process) would go to the wrong program
// instead of a shell. So: reuse 'main' when it's idle, and only fall back to
// a dedicated session (named after what's launching) when main is genuinely
// busy. This is what makes "one terminal unless you need more" safe rather
// than just a preference.
export async function resolveTerminalTarget(fallbackId){
  try{
    const r=await api('/terminal/main-busy');
    if(!r.busy)return 'main';
  }catch{ /* if we can't tell, fall back to a dedicated session to be safe */ }
  return fallbackId;
}

function useMedia(query){const[get,set]=useState(()=>window.matchMedia(query).matches);useEffect(()=>{const m=window.matchMedia(query),f=()=>set(m.matches);m.addEventListener?.('change',f);return()=>m.removeEventListener?.('change',f)},[query]);return get}
function useLoad(fn,deps=[]){const[data,setData]=useState(null),[error,setError]=useState('');useEffect(()=>{let alive=true;Promise.resolve(fn()).then(x=>alive&&setData(x)).catch(e=>alive&&setError(e.message));return()=>{alive=false}},deps);return[data,setData,error]}
// Like useLoad, but keeps refetching on an interval — for data that's
// actually live (system stats) rather than a one-time snapshot. Silently
// keeps the last good value on a failed poll instead of clearing the UI.
export function usePoll(fn,intervalMs,deps=[]){
 const[data,setData]=useState(null);
 useEffect(()=>{
  let alive=true;
  const tick=()=>Promise.resolve(fn()).then(x=>{if(alive)setData(x)}).catch(()=>{});
  tick();
  const t=setInterval(tick,intervalMs);
  return()=>{alive=false;clearInterval(t)};
 },deps);
 return[data];
}

function App(){
 const[me,setMe]=useState(null),[loading,setLoading]=useState(true),[settings,setSettings]=useState(null),[loginPw,setLoginPw]=useState('');
 useEffect(()=>{api('/me').then(async m=>{setMe(m);setSettings(await api('/settings'))}).catch(()=>setMe(null)).finally(()=>setLoading(false))},[]);
 // Apply the chosen theme to <html> so the CSS variable overrides take effect.
 useEffect(()=>{const t=settings?.theme||'aubergine';if(t==='aubergine')delete document.documentElement.dataset.theme;else document.documentElement.dataset.theme=t},[settings?.theme]);
 // Effective Omarchy variant: settings.uiVariant (set from Settings >
 // Appearance) wins when present, otherwise fall back to whatever the build
 // itself was compiled with. Applied to <html> reactively rather than once
 // at module load, since it can now change at runtime without a rebuild.
 const omarchy=settings?.uiVariant?settings.uiVariant==='omarchy':BUILD_OMARCHY;
 useEffect(()=>{document.documentElement.classList.toggle('omarchy-build',omarchy)},[omarchy]);
 if(loading)return <Splash/>;
 if(!me)return <Login onDone={async(pw)=>{setLoginPw(pw);setMe(await api('/me'));setSettings(await api('/settings'))}}/>;
 // A fresh install ships a temporary generated password. Nothing else in the
 // app is reachable until the user sets their own.
 if(me.mustChangePassword)return <ChangePassword currentPassword={loginPw} onDone={()=>{setMe(m=>({...m,mustChangePassword:false}))}}/>;
 if(settings?.onboarded===false)return <SetupWizard me={me} onDone={async()=>{await api('/setup/complete',{method:'POST',body:'{}'});setSettings(await api('/settings'))}}/>;
 return <Shell me={me} settings={settings} setSettings={setSettings} omarchy={omarchy}/>;
}

function Mark(){return <div className="tw-mark"><span>›</span><span>_</span></div>}
function Brand({compact=false}){return <div className={'brand '+(compact?'compact':'')}><Mark/>{!compact&&<div><strong>Touch<span>Workstation</span></strong><small>Linux Mobile</small></div>}</div>}
function Dot({tone='ok'}){return <i className={'dot '+tone}/>}
export function Button({children,className='',...p}){return <button className={'btn '+className} {...p}>{children}</button>}
export function Pill({children,tone=''}){return <span className={'pill '+tone}>{children}</span>}
function Empty({children}){return <div className="empty-state">{children}</div>}
function SectionHead({title,action}){return <div className="section-head"><h2>{title}</h2>{action}</div>}

function Splash(){return <div className="splash"><Mark/><h1>TouchWorkstation</h1><p>Your Linux workstation. In your pocket.</p></div>}
function Login({onDone}){const[pw,setPw]=useState(''),[err,setErr]=useState(''),[busy,setBusy]=useState(false);async function submit(e){e.preventDefault();setBusy(true);setErr('');try{await api('/login',{method:'POST',body:JSON.stringify({password:pw})});await onDone(pw)}catch(e){setErr(e.message==='AUTH'?'That password did not work.':'Can’t reach TouchWorkstation right now — make sure it’s still running, then try again.')}finally{setBusy(false)}}return <div className="auth-page"><form className="auth-card" onSubmit={submit}><Mark/><span className="kicker">WELCOME BACK</span><h1>Open your workstation.</h1><p>Connect securely to this computer.</p><input autoFocus type="password" placeholder="TouchWorkstation password" value={pw} onChange={e=>setPw(e.target.value)}/><Button className="primary" disabled={busy}>{busy?'Connecting…':'Unlock'}</Button>{err&&<div className="inline-error">{err}</div>}</form></div>}

function ChangePassword({currentPassword,onDone}){
 const[cur,setCur]=useState(currentPassword||''),[next,setNext]=useState(''),[confirm,setConfirm]=useState(''),[err,setErr]=useState(''),[busy,setBusy]=useState(false);
 async function submit(e){
  e.preventDefault();setErr('');
  if(next.length<8){setErr('Choose a password with at least 8 characters.');return}
  if(next!==confirm){setErr('Passwords don\u2019t match.');return}
  setBusy(true);
  try{await api('/change-password',{method:'POST',body:JSON.stringify({currentPassword:cur,newPassword:next})});onDone()}
  catch(e){setErr(e.message)}
  finally{setBusy(false)}
 }
 return <div className="auth-page">
  <form className="auth-card" onSubmit={submit}>
   <Mark/><span className="kicker">FIRST LOGIN</span>
   <h1>Choose your password.</h1>
   <p>This workstation was set up with a temporary password. Set your own before continuing \u2014 you\u2019ll use it every time you open TouchWorkstation.</p>
   {!currentPassword&&<input type="password" placeholder="Current (temporary) password" value={cur} onChange={e=>setCur(e.target.value)} autoFocus/>}
   <input type="password" placeholder="New password (min. 8 characters)" value={next} onChange={e=>setNext(e.target.value)} autoFocus={!!currentPassword}/>
   <input type="password" placeholder="Confirm new password" value={confirm} onChange={e=>setConfirm(e.target.value)}/>
   <Button className="primary" disabled={busy}>{busy?'Saving\u2026':'Set password & continue'}</Button>
   {err&&<div className="inline-error">{err}</div>}
  </form>
 </div>;
}

function SetupWizard({me,onDone}){
 const[step,setStep]=useState(0),[mode,setMode]=useState('development'),[remote,setRemote]=useState(false),[busy,setBusy]=useState(false),[note,setNote]=useState('');
 const[showRA,setShowRA]=useState(false);
 // Saying "yes, walk me through it" now genuinely runs the Tailscale
 // walkthrough right here, in the moment — not a promise to "do it later in
 // Settings" that's easy to forget. Only advance past this step once the
 // walkthrough is dismissed (finished, skipped, or closed).
 const next=async()=>{setNote('');if(step===3&&remote){setShowRA(true);return}if(step===4)return onDone();setStep(v=>v+1)};
 return <div className="setup-page"><div className="setup-shell">
 {showRA&&<RemoteAccess onClose={()=>{setShowRA(false);setStep(v=>v+1)}}/>}
 <div className="setup-brand"><Brand/><span>Step {step+1} of 5</span></div><div className="progress">{[0,1,2,3,4].map(i=><i key={i} className={i<=step?'on':''}/>)}</div>
 {step===0&&<SetupPane kicker="WELCOME" title={`Make ${me.hostname} feel native on your phone.`} body="TouchWorkstation turns this computer into a touch-first mobile workspace without replacing your desktop."/>}
 {step===1&&<div><SetupPane kicker="YOUR WORKFLOW" title="What do you use this computer for?" body="We will arrange Mobile Mode around what matters most. You can change this later."/><Choice active={mode==='development'} onClick={()=>setMode('development')} title="Development" sub="Projects, GitHub, agents, previews and terminal"/><Choice active={mode==='general'} onClick={()=>setMode('general')} title="General use" sub="Applications, browser, files and desktop"/><Choice active={mode==='server'} onClick={()=>setMode('server')} title="Server / homelab" sub="Terminal, services, Docker and monitoring"/></div>}
 {step===2&&<div><SetupPane kicker="GITHUB" title="Do you want your GitHub projects here?" body="TouchWorkstation can use GitHub CLI credentials stored locally on this computer. Nothing needs to be pasted into your phone."/><Choice active title="Connect after setup" sub="Run gh auth login once, then projects can clone, pull and push" icon={GitBranch}/></div>}
 {step===3&&<div><SetupPane kicker="AWAY FROM HOME" title="Do you want access outside your home?" body="We recommend a private VPN. No port forwarding and no exposing your workstation directly to the internet."/><Choice active={remote} onClick={()=>setRemote(true)} title="Yes, walk me through it" sub="Sets up Tailscale right now, in this step" icon={ShieldCheck}/><Choice active={!remote} onClick={()=>setRemote(false)} title="Not yet" sub="Keep this workstation on your home network \u2014 set up anytime from Settings" icon={House}/>{note&&<div className="setup-note">{note}</div>}</div>}
 {step===4&&<div><SetupPane kicker="READY" title="Your mobile workspace is ready." body="Open the same address on your iPhone or iPad and add it to your Home Screen."/><div className="ready-grid"><Ready text="Mobile shell"/><Ready text="Projects & Git"/><Ready text="Applications"/><Ready text="Files & terminal"/></div></div>}
 <div className="setup-actions">{step>0&&<Button onClick={()=>{setNote('');setStep(v=>v-1)}}>Back</Button>}<Button className="primary" onClick={next} disabled={busy}>{step===4?'Open TouchWorkstation':'Continue'}</Button></div></div></div>
}
function SetupPane({kicker,title,body}){return <div className="setup-copy"><span className="kicker">{kicker}</span><h1>{title}</h1><p>{body}</p></div>}
function Choice({active,title,sub,onClick=()=>{},icon:Icon}){return <button className={'choice '+(active?'active':'')} onClick={onClick}>{Icon?<Icon/>:<span className="choice-radio">{active&&<Check/>}</span>}<div><strong>{title}</strong><small>{sub}</small></div><ChevronRight/></button>}
function Ready({text}){return <div><CheckCircle2/><span>{text}</span></div>}

const NAV=[
 ['home',Home,'Home'],['projects',Code2,'Projects'],['agents',Bot,'Agents'],['apps',Grid3X3,'Apps'],['files',Folder,'Files'],['terminal',TerminalSquare,'Terminal'],['settings',Settings,'Settings']
];

function Shell({me,settings,setSettings,omarchy}){
 const mobile=useMedia('(max-width: 820px)');
 const[view,setView]=useState('home'),[project,setProject]=useState(null),[mobileMenu,setMobileMenu]=useState(false);
 const[navState,setNavState]=useState(null);
 // A short "transition" flag drives a CSS fade on view change, so navigation
 // feels intentional instead of a hard swap. Purely visual; no data impact.
 const[transitioning,setTransitioning]=useState(false);
 const go=(v,state=null)=>{
   setProject(null);
   setTransitioning(true);
   setView(v);
   setNavState(state);
   setMobileMenu(false);
   window.scrollTo({top:0,behavior:'instant'in window?'instant':'auto'});
   setTimeout(()=>setTransitioning(false),180);
 };
 const openProject=(p)=>{setProject(p);setTransitioning(true);setTimeout(()=>setTransitioning(false),180)};
 const openWebview=(app)=>go('webview',{app});
 const openAgent=(agentId)=>go('agent-detail',{agentId});
 // Omarchy/Arch build (VITE_THEME=minimal) gets a bare, chrome-free shell —
 // no sidebar/topbar/dock — on both the home screen and the terminal, so the
 // terminal starts flush at the very top of the screen instead of sitting
 // under a topbar the way every other distro's build still does.
 const bare=omarchy&&(view==='home'||view==='terminal')&&!project;
 return <div className={'shell '+(mobile?'is-mobile':'is-desktop')}>
 {!mobile&&!bare&&<aside className="sidebar"><Brand/><nav>{NAV.map(([id,Icon,label])=><button key={id} className={view===id&&!project?'active':''} onClick={()=>go(id)}><Icon/><span>{label}</span></button>)}</nav><div className="sidebar-bottom"><div className="machine-chip"><Dot/><div><strong>{me.hostname}</strong><small>Connected</small></div></div><span className="version">{me.version}</span></div></aside>}
 <main className={'main'+(bare?' main-bare':'')}>{!bare&&<Topbar me={me} mobile={mobile} view={view} project={project} onMenu={()=>setMobileMenu(!mobileMenu)} go={go}/>}<div className={'view'+(transitioning?' view-transition':'')+(bare?' view-bare':'')}><Router view={view} go={go} openProject={openProject} openWebview={openWebview} openAgent={openAgent} navState={navState} me={me} project={project} setProject={setProject} settings={settings} setSettings={setSettings} omarchy={omarchy}/></div></main>
 {mobile&&!bare&&<MobileDock view={view} project={project} go={go}/>} {mobile&&mobileMenu&&<MobileSheet go={go} onClose={()=>setMobileMenu(false)}/>}</div>
}
function Topbar({me,mobile,view,project,onMenu,go}){
 const label=project?project.name:(NAV.find(n=>n[0]===view)?.[2]||'Home');
 return <header className="topbar">{mobile?<button className="icon-btn" onClick={onMenu}><Menu/></button>:<div className="crumb">TouchWorkstation <ChevronRight/> <span>{label}</span></div>}<div className="top-status"><span><Dot/> Connected</span>{!mobile&&<Pill>{me.version}</Pill>}<button className="icon-btn" onClick={()=>go('settings')}><Settings/></button></div></header>}
function MobileDock({view,project,go}){const items=[['home',Home,'Home'],['apps',Grid3X3,'Apps'],['projects',Code2,'Projects'],['agents',Bot,'Agents'],['terminal',TerminalSquare,'Terminal']];return <nav className="mobile-dock">{items.map(([id,Icon,label])=><button className={view===id&&!project?'active':''} key={id} onClick={()=>go(id)}><Icon/><span>{label}</span></button>)}</nav>}
function MobileSheet({go,onClose}){return <><div className="mobile-sheet-backdrop" onClick={onClose}/><div className="mobile-sheet"><div className="sheet-handle"/>{NAV.map(([id,Icon,label])=><button key={id} onClick={()=>go(id)}><Icon/><span>{label}</span><ChevronRight/></button>)}</div></>}

function Router(p){
 if(p.project)return <DeveloperWorkspace project={p.project} go={p.go} back={()=>p.go('projects')}/>;
 switch(p.view){
   case'projects':return <Projects go={p.go}/>;
   case'project-detail':return <ProjectDetail item={p.navState?.item} go={p.go} back={()=>p.go('projects')} openProject={p.openProject}/>;
   case'agents':return <Agents go={p.go} openAgent={p.openAgent} navState={p.navState}/>;case'agent-detail':return <AgentDetail agentId={p.navState?.agentId} go={p.go} back={()=>p.go('agents')}/>;
   case'apps':return <AppsV2 go={p.go} project={p.project}/>;
   case'webview':return <WebviewApp app={p.navState?.app} back={()=>p.go('apps')}/>;
   case'preview-full':return <PreviewFullscreen nav={p.navState} go={p.go}/>;
   case'docker':return <DockerView go={p.go}/>;
   case'files':return <Files/>;
   case'terminal':return <TerminalScreen go={p.go} omarchy={p.omarchy} initialSessionId={p.navState?.sessionId} cwd={p.navState?.cwd} pendingCommand={p.navState?.pendingCommand}/>;
   case'settings':return <SettingsView settings={p.settings} setSettings={p.setSettings} go={p.go}/>;
   default:return p.omarchy ? <MinimalDashboard go={p.go}/> : <Dashboard me={p.me} go={p.go} openProject={p.openProject} settings={p.settings}/>;
 }
}

// ------------------------------- DASHBOARD ---------------------------------
function CrashRecoveryBanner(){
 const[crashes,setCrashes]=useState([]);
 const[expanded,setExpanded]=useState(false);
 useEffect(()=>{api('/crash-log').then(r=>setCrashes(r.crashes||[])).catch(()=>{})},[]);
 if(!crashes.length)return null;
 const latest=crashes[crashes.length-1];
 async function dismiss(){
  setCrashes([]);
  try{await api('/crash-log/ack',{method:'POST',body:'{}'})}catch{}
 }
 return (
  <div className="crash-nudge">
   <Info/>
   <div className="crash-nudge-body">
    <strong>Something's crashed since the server started.</strong>
    <small>{crashes.length===1?'1 crash':`${crashes.length} crashes`} \u00b7 most recent {fmtWhen(latest.at)}</small>
    <button className="crash-details-toggle" onClick={()=>setExpanded(e=>!e)}>{expanded?'Hide details':'View details'}</button>
    {expanded&&(
     <div className="crash-details">
      {crashes.slice().reverse().map((c,i)=>(
       <div key={i} className="crash-entry">
        <div className="crash-entry-head"><span>{fmtWhen(c.at)}</span><span>{c.kind}</span></div>
        <pre>{c.message}</pre>
       </div>
      ))}
     </div>
    )}
   </div>
   <button className="a2hs-dismiss" onClick={dismiss} aria-label="Dismiss"><X/></button>
  </div>
 );
}

function AddToHomeScreenBanner(){
 const[dismissed,setDismissed]=useState(()=>{try{return localStorage.getItem('tw-a2hs-dismissed')==='1'}catch{return false}});
 const isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent)&&!window.MSStream;
 const isStandalone=window.navigator.standalone===true||window.matchMedia('(display-mode: standalone)').matches;
 if(dismissed||!isIOS||isStandalone)return null;
 function dismiss(){setDismissed(true);try{localStorage.setItem('tw-a2hs-dismissed','1')}catch{}}
 return (
  <div className="a2hs-nudge">
   <Smartphone/>
   <div><strong>Add this to your Home Screen</strong><small>Tap <b>Share</b> <Share/> below, then <b>Add to Home Screen</b> \u2014 it opens full-screen, without Safari's address bar, just like any other app.</small></div>
   <button className="a2hs-dismiss" onClick={dismiss} aria-label="Dismiss"><X/></button>
  </div>
 );
}

function Dashboard({me,go,openProject,settings}){
 const[status]=usePoll(()=>api('/status'),4000,[]);
 const[projects]=useLoad(()=>api('/projects'),[]),[github]=useLoad(()=>api('/github/status'),[]),[agents]=useLoad(()=>api('/agents').catch(()=>({agents:[]})),[]);
 const[apps]=useLoad(()=>api('/apps').catch(()=>({apps:[]})),[]);
 const[vpn]=useLoad(()=>api('/vpn/status').catch(()=>null),[]);
 const ps=projects?.projects||[];
 const agentList=agents?.agents||[];
 const runningAgents=agentList.filter(a=>a.running).length;
 const blockedAgents=agentList.filter(a=>a.state==='blocked').length;
 // Home-screen tiles are user-configurable (Settings > Home screen). ids are
 // resolved against the merged catalog and anything unknown/removed is
 // silently dropped rather than crashing the home screen — falls back to
 // the same four destinations as the old hardcoded list when unconfigured.
 const catalog=buildTileCatalog(apps?.apps||[]);
 const tiles=resolveHomeTiles(settings?.homeTiles,catalog);
 const launcher=useAppLauncher({go,project:null});
 function openTile(t){ if(t.core)go(t.id); else launcher.open(t); }
 function tileSub(t){ if(t.id==='agents')return blockedAgents?`${blockedAgents} need${blockedAgents===1?'s':''} you`:runningAgents?`${runningAgents} running`:'AI assistants'; return t.description||'Open'; }
 return <div className="dashboard page-pad">
  <section className="mobile-hero"><div className="hero-content"><span className="kicker">{greeting()} · TOUCHWORKSTATION</span><h1>{me.hostname}</h1><div className="hero-status"><span className="live-dot"><i/></span> Connected{status?<> · <b>{status.cpu}%</b> CPU · <b>{status.memory}%</b> MEM</>:''}</div></div><div className="wave"><i/><i/><i/></div></section>
  <CrashRecoveryBanner/>
  <AddToHomeScreenBanner/>
  {vpn?.connected&&!vpn?.viaTailscale&&(
   <div className="tailscale-nudge">
    <ShieldCheck/>
    <div><strong>You're on local Wi-Fi, not Tailscale</strong><small>Tailscale is set up on this computer, but this session isn't using it. Make sure the Tailscale app is installed and signed in on this phone too, then open <b>{vpn.hostname||vpn.ip}</b> instead.</small></div>
   </div>
  )}
  {vpn?.connected&&vpn?.viaTailscale&&!vpn?.secure&&(
   <div className="tailscale-nudge">
    <ShieldCheck/>
    <div><strong>One more step for full clipboard support</strong><small>You're on Tailscale correctly — open <b>{vpn.httpsUrl}</b> instead of this address to get a secure (HTTPS) connection, which native copy/paste needs.</small></div>
   </div>
  )}
  <section className="mobile-launcher">{tiles.map(t=><Launcher key={t.id} icon={ICONS[t.iconKey]||Bot} label={t.name} sub={tileSub(t)} onClick={()=>openTile(t)}/>)}</section>
  {launcher.msg&&<div className="notice">{launcher.msg}</div>}
  {launcher.chooser&&<ModeChooserSheet chooser={launcher.chooser} onClose={()=>launcher.setChooser(null)} onPick={(mode)=>{const a=launcher.chooser;launcher.setChooser(null);launcher.openMode(a,mode)}}/>}
  {status&&<section className="mobile-stats"><MobileStat label="CPU" value={status.cpu} detail={status.specs?`${status.specs.cpuCores} cores`:null}/><MobileStat label="Memory" value={status.memory} detail={status.specs?`${status.specs.memUsedGB} / ${status.specs.memTotalGB} GB`:null}/><MobileStat label="Disk" value={status.disk} detail={status.specs?`${status.specs.diskUsedGB} / ${status.specs.diskTotalGB} GB`:null}/></section>}
  <div className="desktop-dashboard-grid">
   <DashboardCard title="Projects" icon={Folder} action={<button onClick={()=>go('projects')}>View all</button>}>{ps.slice(0,4).map(pr=><ProjectMini key={pr.path} p={pr} onClick={()=>openProject(pr)}/>)}{!ps.length&&<Empty>No projects discovered yet.</Empty>}</DashboardCard>
   <DashboardCard title="Agents" icon={Bot} action={<button onClick={()=>go('agents')}>Manage</button>}>{agentList.slice(0,4).map(a=><AgentMini key={a.id} a={a} onClick={()=>go('agent-detail',{agentId:a.id})}/>)}{!agentList.length&&<ConnectMini icon={Bot} title="No agents configured" sub="Set up Claude, Hermes or another runtime."/>}</DashboardCard>
   <DashboardCard title="GitHub" icon={GitBranch} action={<button onClick={()=>go('projects')}>View all</button>}>{github?.connected?(github.repos||[]).slice(0,4).map(r=><RepoMini key={r.nameWithOwner} r={r}/>):<ConnectMini icon={GitBranch} title="GitHub isn't connected" sub="Run gh auth login once on this workstation."/>}</DashboardCard>
   <DashboardCard title="Remote Access" icon={Globe2}><RemoteMini/></DashboardCard>
   <DashboardCard title="Appearance" icon={Palette}><ThemeMini/></DashboardCard>
   <DashboardCard title="System Status" icon={Activity}>{status?<SystemMini s={status}/>:<Empty>Loading system status…</Empty>}</DashboardCard>
  </div>
  <section className="continue-mobile"><SectionHead title="Continue" action={<button onClick={()=>go('projects')}>See all</button>}/>{ps.slice(0,3).map(pr=><button className="continue-card" key={pr.path} onClick={()=>openProject(pr)}><span className="project-avatar">{pr.name.slice(0,2).toLowerCase()}</span><div><strong>{pr.name}</strong><small>{pr.stack||'Project'} · {pr.branch||'No branch'}</small></div>{pr.running?<Pill tone="success">Running</Pill>:<ChevronRight/>}</button>)}{!ps.length&&<Empty>Clone a repo in Projects to get started.</Empty>}</section>
 </div>
}
function DashboardCard({title,icon:Icon,action,children}){return <section className="dash-card"><div className="card-head"><div><Icon/><h3>{title}</h3></div>{action}</div><div className="card-body">{children}</div></section>}
function ProjectMini({p,onClick}){return <button className="mini-row" onClick={onClick}><Folder/><div><strong>{p.name}</strong><small>{shortPath(p.path)}</small></div><Pill tone={p.running?'success':''}>{p.running?`:${p.port}`:p.branch||'local'}</Pill></button>}
function AgentMini({a,onClick}){const state=a.running?agentStateMeta(a.state):null;return <button className="mini-row" onClick={onClick}><Bot/><div><strong>{a.name}</strong><small>{a.runtimeLabel}{a.model?` · ${a.model}`:''}</small></div><Pill tone={state?state.tone:''}>{state?state.label:a.runtimeInstalled?'Ready':'Setup'}</Pill></button>}
function RepoMini({r}){return <div className="mini-row"><GitBranch/><div><strong>{r.name||r.nameWithOwner}</strong><small>{r.nameWithOwner}</small></div>{typeof r.stars==='number'&&<span className="stars"><Star/> {r.stars}</span>}</div>}
function ConnectMini({icon:Icon,title,sub}){return <div className="connect-mini"><Icon/><strong>{title}</strong><small>{sub}</small></div>}
function RemoteMini(){
 const[vpn,setVpn]=useState(null);
 useEffect(()=>{api('/vpn/status').then(setVpn).catch(()=>{})},[]);
 const state=!vpn?.connected?'off':vpn.viaTailscale?'active':'unused';
 const title=state==='active'?'Private remote access active':state==='unused'?'Tailscale ready \u2014 not in use':'Home network access';
 const sub=state==='active'?vpn.ip:state==='unused'?`You're on local Wi-Fi \u2014 open ${vpn.hostname||vpn.ip} instead`:'Set up secure access when you are ready.';
 return <div className="remote-mini"><span className="label">This device</span><strong>{title}</strong><small>{sub}</small><div className={'health '+(state==='active'?'green':'')}><Dot tone={state==='active'?'ok':'warn'}/>{state==='active'?'Remote active':state==='unused'?'Not using it right now':'Local only'}</div></div>
}
function ThemeMini(){return <div><div className="theme-swatches"><div className="aub selected"><i/>Aubergine</div><div className="char"><i/>Charcoal</div><div className="solar"><i/>Solar</div></div><div className="accent-dots"><i className="orange"/><i className="purple"/><i className="blue"/><i className="green"/><i className="red"/></div></div>}
function SystemMini({s}){const sp=s.specs;return <div className="system-mini"><Metric label="CPU" value={sp?`${s.cpu}% \u00b7 ${sp.cpuCores} cores`:`${s.cpu}%`} n={s.cpu}/><Metric label="Memory" value={sp?`${sp.memUsedGB} / ${sp.memTotalGB} GB`:`${s.memory}%`} n={s.memory}/><Metric label="Disk" value={sp?`${sp.diskUsedGB} / ${sp.diskTotalGB} GB`:`${s.disk}%`} n={s.disk}/><Metric label="Uptime" value={fmtUptime(s.uptime)} n={35}/><div className="all-good"><CheckCircle2/> All systems operational</div></div>}
function Metric({label,value,n}){return <div className="metric"><span>{label}</span><strong>{value}</strong><div className="spark"><i style={{width:Math.min(100,n)+'%'}}/></div></div>}
function MobileStat({label,value,detail}){const v=typeof value==='number'?value:0;return <div className="mobile-stat"><div className="ms-top"><span>{label}</span><strong>{v}%</strong></div><div className="ms-bar"><i style={{width:Math.min(100,v)+'%'}}/></div>{detail&&<small className="ms-detail">{detail}</small>}</div>}
function AccessUrl({label,url}){const[copied,setCopied]=useState(false);return <div className="access-url-row"><div><small>{label}</small><strong>{url}</strong></div><button onClick={()=>{navigator.clipboard?.writeText(url);setCopied(true);setTimeout(()=>setCopied(false),1500)}}>{copied?<Check/>:<Copy/>}</button></div>}
function themeLabel(t){return({aubergine:'Aubergine',charcoal:'Charcoal',solar:'Solar'})[t||'aubergine']||'Aubergine'}
function variantLabel(v){return v?(v==='omarchy'?'Omarchy':'Standard'):(BUILD_OMARCHY?'Omarchy (default)':'Standard (default)')}
// Herdr-inspired at-a-glance agent status — see classifyAgentState in
// server/agents.js for what each state actually means and how it's derived.
export function agentStateMeta(state){return{blocked:{label:'Needs you',tone:'warn'},working:{label:'Working',tone:''},done:{label:'Done',tone:'success'},idle:{label:'Idle',tone:'muted'}}[state]||null}
function greeting(){const h=new Date().getHours();return h<5?'GOOD NIGHT':h<12?'GOOD MORNING':h<18?'GOOD AFTERNOON':'GOOD EVENING'}
function Launcher({icon:Icon,label,sub,onClick}){return <button className="launcher" onClick={onClick}><span className="launcher-icon"><Icon/></span><strong>{label}</strong><small>{sub}</small></button>}

// ------------------------------- PROJECTS ----------------------------------
function mergeProjects(localList, repos){
 const byNwo=new Map((repos||[]).map(r=>[r.nameWithOwner,r]));
 const used=new Set();
 const items=[];
 for(const p of localList||[]){
  const repo=p.nameWithOwner?byNwo.get(p.nameWithOwner):null;
  if(repo)used.add(repo.nameWithOwner);
  items.push({key:p.path,name:p.name,local:p,repo:repo||null});
 }
 for(const r of repos||[]){
  if(used.has(r.nameWithOwner))continue;
  items.push({key:r.nameWithOwner,name:r.nameWithOwner.split('/')[1]||r.nameWithOwner,local:null,repo:r});
 }
 // Running first, then cloned-locally, then GitHub-only — alphabetical within each group.
 return items.sort((a,b)=>{
  const rank=x=>x.local?.running?0:x.local?1:2;
  const d=rank(a)-rank(b);
  return d!==0?d:a.name.localeCompare(b.name);
 });
}

function Projects({go}){
 const[local,setLocal]=useState([]),[github,setGithub]=useState(null),[repos,setRepos]=useState([]),[query,setQuery]=useState(''),[clone,setClone]=useState(''),[msg,setMsg]=useState('');
 const load=()=>{
  api('/projects').then(x=>setLocal(x.projects||[]));
  api('/github/status').then(gh=>{setGithub(gh);if(gh?.connected)api('/github/repos').then(r=>setRepos(r.repos||[])).catch(()=>setRepos(gh.repos||[]));else setRepos([])}).catch(()=>setGithub({connected:false,repos:[]}));
 };
 useEffect(()=>{load()},[]);
 async function cloneRepo(url){if(!url)return;setMsg('Cloning…');try{const r=await api('/github/clone',{method:'POST',body:JSON.stringify({url})});setMsg(r.message);setClone('');load()}catch(e){setMsg(e.message)}}
 const items=mergeProjects(local,repos.length?repos:github?.repos);
 const filtered=items.filter(it=>it.name.toLowerCase().includes(query.toLowerCase()));
 return <div className="page-pad">
  <PageTitle kicker="DEVELOP" title="Projects" body={github?.connected?`Local projects and repos from ${github.user||'your GitHub account'}, in one place.`:'Your local repositories. Connect GitHub in Settings to see your repos here too.'}/>
  <div className="project-toolbar"><label className="searchbox"><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search projects…"/></label><Button onClick={()=>document.getElementById('clonebox')?.focus()}><GitBranch/> Clone repo</Button></div>
  <div className="clonebar"><input id="clonebox" value={clone} onChange={e=>setClone(e.target.value)} placeholder="https://github.com/you/project.git"/><Button className="primary" onClick={()=>cloneRepo(clone)}>Clone</Button></div>
  {msg&&<div className="notice">{msg}</div>}
  <div className="project-grid">
   {filtered.map(it=><button className="project-card" key={it.key} onClick={()=>go('project-detail',{item:it})}>
    <div className="project-card-top"><span className="project-avatar">{it.name.slice(0,2).toLowerCase()}</span>
     {it.local?.running?<Pill tone="success"><Dot/> :{it.local.port}</Pill>:it.local?<Pill>{it.local.stack||'Project'}</Pill>:<Pill tone="muted">Not cloned</Pill>}
    </div>
    <h3>{it.name}</h3>
    <p>{it.repo?.description||(it.local?shortPath(it.local.path):it.repo?.nameWithOwner)}</p>
    <div className="project-meta">
     {it.local&&<span><GitBranch/> {it.local.branch||'No branch'}</span>}
     {it.repo&&<span><Star/> {it.repo.stargazerCount||0}</span>}
     {it.local&&!it.repo&&<span>{it.local.changes||0} changes</span>}
    </div>
   </button>)}
   {!filtered.length&&<Empty>No matching projects.</Empty>}
  </div>
 </div>
}

// ---------------------------- PROJECT DETAIL --------------------------------
// A lightweight info screen between the tile grid and the full workspace —
// what a tile is, whether it's cloned, its GitHub info, and whether an agent
// is already assigned — before committing to opening the heavier workspace
// (Run/Stop, live preview, git panel).
function ProjectDetail({item,go,back,openProject}){
 const[agents]=useLoad(()=>api('/agents').catch(()=>({agents:[]})),[]);
 const[clone,setClone]=useState(''),[msg,setMsg]=useState(''),[busy,setBusy]=useState(false);
 if(!item)return <div className="page-pad"><Empty>No project selected.</Empty><Button onClick={back}><ArrowLeft/> Projects</Button></div>;
 const agent=item.local?(agents?.agents||[]).find(a=>a.workspace===item.local.path):null;
 async function doClone(){
  const url=item.repo?.url||clone;
  if(!url)return;
  setBusy(true);setMsg('Cloning…');
  try{const r=await api('/github/clone',{method:'POST',body:JSON.stringify({url})});setMsg(r.message)}catch(e){setMsg(e.message)}finally{setBusy(false)}
 }
 return <div className="page-pad project-detail">
  <Button onClick={back}><ArrowLeft/> Projects</Button>
  <div className="project-detail-head">
   <span className="project-avatar large">{item.name.slice(0,2).toLowerCase()}</span>
   <div><h1>{item.name}</h1>
    {item.local?.running?<Pill tone="success"><Dot/> Running :{item.local.port}</Pill>:item.local?<Pill>{item.local.stack||'Project'}</Pill>:<Pill tone="muted">Not cloned</Pill>}
   </div>
  </div>
  {item.repo?.description&&<p className="project-detail-desc">{item.repo.description}</p>}
  <div className="project-detail-meta">
   {item.local&&<div><span>Local path</span><strong>{shortPath(item.local.path)}</strong></div>}
   {item.local&&<div><span>Branch</span><strong>{item.local.branch||'No branch'}</strong></div>}
   {item.local&&<div><span>Changes</span><strong>{item.local.changes||0}</strong></div>}
   {item.repo&&<div><span>GitHub</span><strong>{item.repo.nameWithOwner}</strong></div>}
   {item.repo&&<div><span>Stars</span><strong>{item.repo.stargazerCount||0}</strong></div>}
   {item.repo&&<div><span>Visibility</span><strong>{item.repo.isPrivate?'Private':'Public'}</strong></div>}
  </div>
  {msg&&<div className="notice">{msg}</div>}
  <div className="project-detail-actions">
   {item.local&&<Button className="primary" onClick={()=>openProject(item.local)}><LayoutGrid/> Open workspace</Button>}
   {!item.local&&<Button className="primary" onClick={doClone} disabled={busy}>{busy?'Cloning…':<><Download/> Clone to this machine</>}</Button>}
   {item.repo?.url&&<a className="btn" href={item.repo.url} target="_blank" rel="noreferrer"><ExternalLink/> Open on GitHub</a>}
   {item.local&&(agent
    ?<Button onClick={()=>go('agent-detail',{agentId:agent.id})}><Bot/> Manage agent</Button>
    :<Button onClick={()=>go('agents',{workspace:item.local.path})}><Bot/> Set up an agent for this project</Button>)}
  </div>
 </div>
}
export function PageTitle({kicker,title,body,actions}){return <div className="page-title"><div><span className="kicker">{kicker}</span><h1>{title}</h1><p>{body}</p></div>{actions&&<div className="page-actions">{actions}</div>}</div>}

// -------------------------- DEVELOPER WORKSPACE ----------------------------
function DeveloperWorkspace({project,go,back}){
 const[p,setP]=useState(project),[busy,setBusy]=useState(''),[log,setLog]=useState('');
 const[agents]=usePoll(()=>api('/agents').catch(()=>({agents:[]})),8000,[]);
 const agent=(agents?.agents||[]).find(a=>a.workspace===p.path);
 async function refresh(){try{const list=(await api('/projects')).projects||[];setP(cur=>list.find(x=>x.path===cur.path)||cur)}catch{}}
 async function act(kind,extra={}){setBusy(kind);try{const r=await api('/projects/'+kind,{method:'POST',body:JSON.stringify({path:p.path,...extra})});setLog(r.message||'Done');await refresh()}catch(e){setLog(e.message)}finally{setBusy('')}}
 // While the server is running but not yet confirmed ready (dev server still
 // compiling), keep polling so the background readiness probe on the server
 // is picked up without the user needing to hit Run again.
 useEffect(()=>{if(!p.running||p.ready)return;const t=setInterval(refresh,2500);return()=>clearInterval(t)},[p.running,p.ready,p.path]);
 // Mobile preview goes through TouchWorkstation's own proxy at /preview/<port>/,
 // so it loads from the same origin the user is already on — reachable over
 // LAN or Tailscale without exposing the raw dev port. Gated on `ready`, not
 // just `running`: a process can be alive with a port assigned well before
 // the dev server is actually accepting connections, which was showing a
 // preview that could never connect.
 const preview=p.running&&p.ready&&p.port?`/preview/${p.port}/`:null;
 const starting=p.running&&!p.ready;
 // Opening the agent here routes to the real Agents screen instead of a
 // fake chat — the harness is where agents actually run now.
 return <div className="workspace"><div className="workspace-top"><Button onClick={back}><ArrowLeft/> Projects</Button><div><strong>{p.name}</strong><span><GitBranch/> {p.branch||'No branch'}</span></div><div className="workspace-status"><Dot tone={p.ready?'ok':p.running?'warn':'warn'}/>{p.ready?`Dev server :${p.port}`:starting?'Starting…':'Server stopped'}</div></div>
 {/* Mobile-only controls: the desktop sidebar (Run/Stop + Dev log) is hidden
     on phones, which left no way to stop a stuck server or see why it never
     came up. This strip is always reachable regardless of screen size. */}
 <div className="mobile-run-bar"><Button className="primary" onClick={()=>act(p.running?'stop':'run')} disabled={!!busy}>{p.running?<><Square/> Stop</>:<><Play/> Run</>}</Button><Button onClick={()=>act('install')} disabled={!!busy}><Download/> Install</Button></div>
 <details className="mobile-log" open={starting}><summary>Dev log{starting&&<Loader className="spin" style={{width:13,height:13,marginLeft:6}}/>}</summary><pre>{log||'Run a project action to see output here.'}</pre></details>
 {/* Mobile-only compact link — desktop keeps the fuller panel in the grid below. */}
 <div className="agent-linkline" onClick={()=>agent?go('agent-detail',{agentId:agent.id}):go('agents',{workspace:p.path})}><Bot/><span><strong>{agent?'Manage agent':'AI Developer Agent'}</strong><small>{agent?`${agent.name} \u00b7 ${agent.running?'Running':agent.runtimeInstalled?'Ready':'Needs setup'}`:'Configure or launch one for this project'}</small></span><ChevronRight/></div>
 <div className="workspace-grid"><aside className="workspace-projects"><span className="kicker">PROJECT</span><h2>{p.name}</h2><p>{shortPath(p.path)}</p><div className="workspace-actions"><Button className="primary" onClick={()=>act(p.running?'stop':'run')} disabled={!!busy}>{p.running?<><Square/> Stop</>:<><Play/> Run</>}</Button><Button onClick={()=>act('install')} disabled={!!busy}><Download/> Install</Button></div><div className="source-summary"><span>Source control</span><strong>{p.changes||0} changes</strong><small>{p.branch||'No branch'}</small></div><div className="git-buttons"><Button onClick={()=>act('pull')} disabled={!!busy}>Pull</Button><Button onClick={()=>act('push')} disabled={!!busy}>Push</Button></div><div className="log-box"><span>Dev log</span><pre>{log||'Run a project action to see output here.'}</pre></div></aside>
 <section className="agent-panel desktop-only"><div className="panel-title"><div><Bot/><span><strong>AI Developer Agent</strong><small>{agent?<><Dot tone={agent.running?'ok':'warn'}/> {agent.name} \u00b7 {agent.running?'Running':agent.runtimeInstalled?'Ready':'Needs setup'}</>:<><Dot tone="warn"/> Open the harness to run</>}</small></span></div><Button onClick={()=>go('agents')}><Plus/> Agents</Button></div><div className="tool-cards" style={{padding:'18px 22px'}}><div><CheckCircle2/><span><strong>Project context</strong><small>{p.stack||'Project'} · {p.branch||'local'}</small></span></div><div><Activity/><span><strong>Dev server</strong><small>{p.ready?`Running on ${p.port}`:starting?'Starting…':'Stopped'}</small></span></div></div><div style={{padding:'0 22px'}}>{agent?<Button className="primary" onClick={()=>go('agent-detail',{agentId:agent.id})}><Bot/> Manage agent</Button>:<Button className="primary" onClick={()=>go('agents',{workspace:p.path})}><Bot/> Set up an agent for this project</Button>}</div></section>
 <aside className="preview-side"><div className="preview-card"><div className="preview-head"><div><strong>Live Mobile Preview</strong><small>{p.ready?<><Dot/> Live</>:starting?'Starting…':'Stopped'}</small></div><Pill><Smartphone/> iPhone</Pill></div><div className="phone-preview"><div className="phone-notch"/>{preview?<iframe title="Mobile preview" src={preview}/>:starting?<div className="preview-empty"><Loader className="spin"/><strong>Starting the dev server\u2026</strong><small>First run can take a bit while dependencies install. This updates automatically \u2014 no need to reload.</small></div>:<div className="preview-empty"><Smartphone/><strong>Start the dev server</strong><small>Then your app will render here on a mobile-sized viewport.</small><Button className="primary" onClick={()=>act('run')} disabled={!!busy}><Play/> Run project</Button></div>}</div></div><div className="git-panel"><div className="git-title"><strong>Git</strong><span>{p.branch||'No branch'}</span></div><div className="git-summary"><span>changes <b>{p.changes||0}</b></span><Button><Eye/> View Diff</Button></div><div className="git-actions"><Button onClick={()=>{const m=prompt('Commit message');if(m)act('commit',{message:m})}}><GitCommit/> Commit</Button><Button onClick={()=>act('push')}><Upload/> Push</Button>{preview&&<Button onClick={()=>go('preview-full',{path:p.path,preview,name:p.name,port:p.port})}><Maximize2/> Fullscreen</Button>}</div></div></aside></div></div>
}

// Fullscreen preview with a persistent top bar (island) so there is always a
// way back on mobile — the old behavior opened the raw dev server in a bare
// new browser tab with no app chrome at all, so there was nothing to tap to
// return. This stays inside the app shell instead.
function PreviewFullscreen({nav,go}){
 const[busy,setBusy]=useState(''),[running,setRunning]=useState(true),[key,setKey]=useState(0);
 if(!nav?.path)return <div className="page-pad"><Empty>No preview to show.</Empty><Button onClick={()=>go('projects')}><ArrowLeft/> Projects</Button></div>;
 async function act(kind){setBusy(kind);try{await api('/projects/'+kind,{method:'POST',body:JSON.stringify({path:nav.path})});if(kind==='stop'){setRunning(false)}else{setRunning(true);setKey(k=>k+1)}}catch{}finally{setBusy('')}}
 return <div className="preview-full">
  <div className="preview-full-bar">
   <button className="pf-back" onClick={()=>go('projects')}><ArrowLeft/> <span>Projects</span></button>
   <div className="pf-title"><strong>{nav.name}</strong><small>{running?`Live \u00b7 :${nav.port}`:'Stopped'}</small></div>
   <div className="pf-actions">
    <button onClick={()=>setKey(k=>k+1)} title="Reload"><RefreshCcw/></button>
    <button onClick={()=>act(running?'stop':'run')} disabled={!!busy} title={running?'Stop':'Restart'}>{running?<Square/>:<Play/>}</button>
    <a href={nav.preview} target="_blank" rel="noreferrer" title="Open in browser tab"><ExternalLink/></a>
   </div>
  </div>
  <div className="preview-full-frame">
   {running?<iframe key={key} title={nav.name} src={nav.preview}/>:<div className="preview-empty"><Square/><strong>Server stopped</strong><small>Restart it from the bar above.</small></div>}
  </div>
 </div>;
}

// --------------------------- AGENT HARNESS ---------------------------------
// The real dashboard: configure agents (runtime, model, workspace, granular
// permissions), see which runtimes are installed, launch them into live
// terminal sessions, and monitor which are running.
function Agents({go,openAgent,navState}){
 const[agents,setAgents]=useState(null),[runtimes,setRuntimes]=useState([]),[msg,setMsg]=useState('');
 // Arriving here from a project's "Set up an agent for this project" jumps
 // straight into a new-agent editor pre-scoped to that project, instead of
 // landing on the general Agents list and making the user navigate again —
 // and critically, actually carries the workspace path through so the new
 // agent is scoped to that project by default rather than silently landing
 // on Home because the field started empty.
 const[editing,setEditing]=useState(()=>navState?.workspace?'new':null);
 const load=async()=>{try{const[a,r]=await Promise.all([api('/agents'),api('/agents/runtimes')]);setAgents(a.agents||[]);setRuntimes(r.runtimes||[])}catch(e){setMsg(e.message);setAgents([])}};
 useEffect(()=>{load();const t=setInterval(()=>{api('/agents/monitor/live').then(live=>{setAgents(cur=>cur?cur.map(a=>({...a,running:live.running.includes(a.id),state:live.states?.[a.id]??null})):cur)}).catch(()=>{})},5000);return()=>clearInterval(t)},[]);
 async function launch(a){setMsg('');try{const r=await api(`/agents/${a.id}/launch`,{method:'POST',body:'{}'});go('terminal',{pendingCommand:r.command,cwd:r.cwd,sessionId:r.sessionId})}catch(e){setMsg(e.message)}}
 async function remove(a){if(!confirm(`Delete agent "${a.name}"? This also removes its board and chat.`))return;try{await api(`/agents/${a.id}`,{method:'DELETE'});load()}catch(e){setMsg(e.message)}}
 // Install a runtime (e.g. Hermes) — runs the official installer in a visible terminal.
 async function install(r){setMsg('');try{const res=await api(`/agents/runtimes/${r.id}/install`,{method:'POST',body:'{}'});go('terminal',{pendingCommand:res.command,cwd:res.cwd,sessionId:res.sessionId})}catch(e){setMsg(e.message)}}
 // Log in to a runtime — runs its native OAuth/setup flow in a terminal; the URL/code it prints is completed by the user.
 async function login(r){setMsg('');try{const res=await api(`/agents/runtimes/${r.id}/login`,{method:'POST',body:'{}'});go('terminal',{pendingCommand:res.command,cwd:res.cwd,sessionId:res.sessionId})}catch(e){setMsg(e.message)}}
 if(editing!==null)return <AgentEditor agent={editing==='new'?null:editing} defaultWorkspace={editing==='new'?navState?.workspace:null} runtimes={runtimes} onCancel={()=>setEditing(null)} onSaved={()=>{setEditing(null);load()}} onLogin={login} onInstall={install}/>;
 const installedRuntimes=runtimes.filter(r=>r.installed).length;
 return <div className="page-pad"><PageTitle kicker="AI WORKSPACE" title="Agents" body="Configure and launch your agent runtimes — Claude, Hermes, Codex and more — each scoped to a project with its own permissions." actions={<Button className="primary" onClick={()=>setEditing('new')}><Plus/> New agent</Button>}/>
  {msg&&<div className="notice">{msg}</div>}
  {agents===null?<Empty>Loading agents…</Empty>:agents.length===0?
   <div className="agent-empty"><Bot/><h2>No agents yet</h2><p>Create your first agent. {installedRuntimes?`${installedRuntimes} runtime${installedRuntimes>1?'s are':' is'} installed and ready.`:'Pick a runtime when you create one \u2014 Hermes installs with one tap.'}</p><Button className="primary" onClick={()=>setEditing('new')}><Plus/> Create an agent</Button></div>
   :<div className="agent-grid">{agents.map(a=><AgentCard key={a.id} a={a} onOpen={()=>openAgent(a.id)} onLaunch={()=>launch(a)} onEdit={()=>setEditing(a)} onDelete={()=>remove(a)}/>)}</div>}
 </div>
}
function AgentCard({a,onOpen,onLaunch,onEdit,onDelete}){
 const perms=Object.entries(a.permissions||{}).filter(([,v])=>v).length;
 const state=a.running?agentStateMeta(a.state):null;
 return <div className={'agent-harness-card'+(a.running?' running':'')}>
  <button className="ahc-top ahc-open" onClick={onOpen}><span className="ahc-icon"><Bot/></span><div className="ahc-id"><strong>{a.name}</strong><small>{a.runtimeLabel}{a.model?` · ${a.model}`:''}</small></div><Pill tone={state?state.tone:a.runtimeUnderConstruction?'warn':''}>{a.runtimeUnderConstruction?'Under construction':state?<><Dot tone={state.tone==='warn'?'warn':'ok'}/> {state.label}</>:a.runtimeInstalled?'Ready':'Setup'}</Pill></button>
  <div className="ahc-meta">{a.workspace?<span><Folder/> {shortPath(a.workspace)}</span>:<span><Folder/> Home</span>}<span><LockKeyhole/> {perms} permission{perms===1?'':'s'}</span><span><Clock3/> {fmtWhen(a.lastRunAt)}</span></div>
  <div className="ahc-actions"><Button className="primary" onClick={onOpen}><LayoutGrid/> Open</Button><Button onClick={onLaunch} disabled={a.runtimeUnderConstruction}><Play/> {a.runtimeUnderConstruction?'Unavailable':a.running?'Attach':a.runtimeInstalled?'Launch':'Install & Launch'}</Button><button className="ahc-del" onClick={onEdit} title="Configure"><SlidersHorizontal/></button><button className="ahc-del" onClick={onDelete} title="Delete"><Trash2/></button></div>
 </div>
}
function AgentEditor({agent,defaultWorkspace,runtimes,onCancel,onSaved,onLogin,onInstall}){
 const isNew=!agent;
 const[name,setName]=useState(agent?.name||(defaultWorkspace?defaultWorkspace.split('/').filter(Boolean).pop():'')||'');
 const[runtime,setRuntime]=useState(agent?.runtime||runtimes.find(r=>!r.underConstruction)?.id||runtimes[0]?.id||'');
 const[model,setModel]=useState(agent?.model||'');
 const[workspace,setWorkspace]=useState(agent?.workspace||defaultWorkspace||'');
 const[instructions,setInstructions]=useState(agent?.instructions||'');
 const[perms,setPerms]=useState(agent?.permissions||{readFiles:true,modifyFiles:false,runCommands:false,startDevServer:false,gitCommit:false,gitPush:false,docker:false,outsideWorkspace:false});
 const[busy,setBusy]=useState(false),[err,setErr]=useState('');
 const rt=runtimes.find(r=>r.id===runtime);
 const permMeta=[['readFiles','Read project files'],['modifyFiles','Modify project files'],['runCommands','Run terminal commands'],['startDevServer','Start dev server'],['gitCommit','Git commit'],['gitPush','Git push'],['docker','Docker'],['outsideWorkspace','Files outside workspace']];
 async function save(){setBusy(true);setErr('');try{const body={name,runtime,model:model||null,workspace:workspace||null,instructions,permissions:perms};if(isNew)await api('/agents',{method:'POST',body:JSON.stringify(body)});else await api(`/agents/${agent.id}`,{method:'PUT',body:JSON.stringify(body)});onSaved()}catch(e){setErr(e.message)}finally{setBusy(false)}}
 return <div className="page-pad"><PageTitle kicker={isNew?'NEW AGENT':'CONFIGURE'} title={isNew?'Create an agent':name||'Configure agent'} body="Choose a runtime, scope it to a project, and grant only the permissions it needs. Destructive actions are off by default."/>
  {err&&<div className="inline-error">{err}</div>}
  <div className="agent-form">
   <label className="af-field"><span>Name</span><input value={name} onChange={e=>setName(e.target.value)} placeholder="Developer Agent"/></label>
   <label className="af-field"><span>Runtime</span><div className="af-runtimes">{runtimes.map(r=><button key={r.id} className={'af-runtime'+(runtime===r.id?' active':'')+(r.installed?'':' missing')+(r.underConstruction?' construction':'')} onClick={()=>{if(!r.underConstruction)setRuntime(r.id)}} disabled={r.underConstruction}><Bot/><strong>{r.label}</strong><small>{r.underConstruction?'Under construction':r.installed?'Installed':'Not found'}</small>{!r.underConstruction&&r.installed&&r.canLogin&&<span className="af-runtime-login" onClick={e=>{e.stopPropagation();onLogin(r)}}><LogIn/> Log in</span>}{!r.underConstruction&&!r.installed&&r.canInstall&&<span className="af-runtime-install" onClick={e=>{e.stopPropagation();onInstall(r)}}><Download/> Install</span>}</button>)}</div>{runtime&&(()=>{const r=runtimes.find(x=>x.id===runtime);if(!r||r.underConstruction)return null;if(!r.installed&&r.canInstall)return <p className="af-hint">{r.label} isn't installed yet. Tap <b>Install</b> above to set it up in the terminal{r.canLogin?', then log in':''} — or just save this agent and hit <b>Install &amp; Launch</b>, which does both.</p>;if(r.installed&&r.canLogin)return <p className="af-hint">{r.label} is installed. If you haven't authenticated yet, tap <b>Log in</b> above.</p>;return null})()}</label>
   {rt?.supportsModels&&<label className="af-field"><span>Model {rt.models?.length?'':'(optional)'}</span>{rt.models?.length?<select value={model} onChange={e=>setModel(e.target.value)}><option value="">Default</option>{rt.models.map(m=><option key={m} value={m}>{m}</option>)}</select>:<input value={model} onChange={e=>setModel(e.target.value)} placeholder="Model name (optional)"/>}</label>}
   <label className="af-field"><span>Workspace</span><input value={workspace} onChange={e=>setWorkspace(e.target.value)} placeholder="~/TouchWorkstation/Projects/my-app (blank = home)"/></label>
   <label className="af-field"><span>Instructions <em>(optional)</em></span><textarea value={instructions} onChange={e=>setInstructions(e.target.value)} rows={3} placeholder="System prompt or standing instructions for this agent…"/></label>
   <div className="af-field"><span>Permissions</span><div className="af-perms">{permMeta.map(([k,label])=><button key={k} className={'af-perm'+(perms[k]?' on':'')} onClick={()=>setPerms(v=>({...v,[k]:!v[k]}))}><span className="af-check">{perms[k]&&<Check/>}</span>{label}</button>)}</div></div>
  </div>
  <div className="agent-form-actions"><Button onClick={onCancel}>Cancel</Button><Button className="primary" onClick={save} disabled={busy||!name}>{busy?'Saving…':isNew?'Create agent':'Save changes'}</Button></div>
 </div>
}

// -------------------------------- FILES ------------------------------------
// Wraps the terminal with a session switcher. By design there's ONE default
// session ('main') that every ordinary "open a terminal" action reuses —
// tapping Terminal in the nav, running a project action, etc. all land on
// the same persistent shell, so you don't end up with a pile of forgotten
// sessions you didn't mean to create. Extra sessions only exist when
// something explicitly asked for isolation (an agent launch, an install/login
// flow that shouldn't dump its output into your everyday shell) — those show
// up here too, and you can switch between them or close ones you're done
// with, but 'main' is always there and always the default landing spot.
function TerminalScreen({go,omarchy,initialSessionId,cwd,pendingCommand}){
 // Omarchy/Arch build only: full-screen, fixed-to-viewport terminal instead
 // of the standard in-flow layout. Being `position:fixed` with a height
 // driven by visualViewport (see the --tw-vvh listener below) is what keeps
 // it pinned to the top of the screen and correctly clipped to the space
 // above the keyboard, rather than the whole page scrolling upward to chase
 // the focused input the way an in-flow element does on iOS.
 const bare=omarchy;
 const[active,setActive]=useState(initialSessionId||'main');
 const[sessions,setSessions]=useState(null);
 const[showSwitcher,setShowSwitcher]=useState(false);
 async function refresh(){try{const r=await api('/terminal/sessions');setSessions(r.sessions||[])}catch{setSessions([])}}
 useEffect(()=>{refresh();const t=setInterval(refresh,5000);return()=>clearInterval(t)},[]);
 // This screen manages its own internal scroll (the terminal viewport).
 // Without this, a computation being even a few px off on .terminal-screen's
 // height — or iOS's rubber-band scroll-chaining behavior — lets a touch-drag
 // meant for the terminal scroll the outer page instead. Locking body scroll
 // for the lifetime of this screen removes that failure mode entirely rather
 // than depending on the height math being exactly right.
 useEffect(()=>{
  const prevOverflow=document.body.style.overflow;
  const prevOverscroll=document.body.style.overscrollBehavior;
  document.body.style.overflow='hidden';
  document.body.style.overscrollBehavior='none';
  return()=>{document.body.style.overflow=prevOverflow;document.body.style.overscrollBehavior=prevOverscroll};
 },[]);
 // Make sure the session we're about to show is reflected in the list right
 // away, even before the next poll — otherwise a brand-new session (e.g. an
 // agent launch) wouldn't appear in the switcher until the 5s poll catches up.
 useEffect(()=>{setSessions(s=>{if(!s)return s;if(s.some(x=>x.id===active))return s;return [...s,{id:active,createdAt:Date.now(),attached:true}]})},[active]);
 const others=(sessions||[]).filter(s=>s.id!==active);
 async function closeSession(id){try{await api(`/terminal/sessions/${id}/close`,{method:'POST',body:'{}'})}catch{}refresh();if(id===active)setActive('main')}
 function newTerminal(){
  const id='t'+Date.now().toString(36);
  setActive(id);setShowSwitcher(false);
 }
 // In the bare Omarchy shell the topbar/sidebar/mobile dock are all hidden
 // (see Shell's `bare` flag), so without this the switch bar's home button is
 // the ONLY way back to the rest of the app — otherwise the terminal is a
 // dead end.
 const homeBtn=bare&&<button className="term-tab home" onClick={()=>go('home')} title="Home"><House/></button>;
 return <div className={'terminal-screen'+(bare?' terminal-bare':'')}>
  {(others.length>0)&&<div className="term-switch-bar">
   {homeBtn}
   <button className="term-tab active">{active==='main'?'Main':active}</button>
   {others.map(s=><button key={s.id} className="term-tab" onClick={()=>setActive(s.id)}>{s.id==='main'?'Main':s.id}</button>)}
   <button className="term-tab add" onClick={newTerminal} title="New terminal"><Plus/></button>
   {active!=='main'&&<button className="term-tab close" onClick={()=>closeSession(active)} title="Close this terminal"><X/></button>}
  </div>}
  {others.length===0&&<div className="term-switch-bar single">
   {homeBtn}
   <span className="term-tab active">{active==='main'?'Main':active}</span>
   <button className="term-tab add" onClick={newTerminal} title="Open another terminal"><Plus/> New terminal</button>
  </div>}
  {omarchy
   ? <MinimalTerminalPTY key={active} sessionId={active} cwd={active===(initialSessionId||'main')?cwd:undefined} pendingCommand={active===(initialSessionId||'main')?pendingCommand:undefined}/>
   : <TerminalPTY key={active} sessionId={active} cwd={active===(initialSessionId||'main')?cwd:undefined} pendingCommand={active===(initialSessionId||'main')?pendingCommand:undefined}/>}
 </div>;
}

function Files(){const[data,setData]=useState(null),[err,setErr]=useState('');async function load(p=''){try{setData(await api('/files'+(p?`?path=${encodeURIComponent(p)}`:'')));setErr('')}catch(e){setErr(e.message)}}useEffect(()=>{load()},[]);return <div className="page-pad"><PageTitle kicker="FILES" title="Your files" body="Browse the home folder without squeezing a desktop file manager onto your phone."/><div className="file-toolbar">{data?.parent&&<Button onClick={()=>load(data.parent)}><ArrowLeft/> Up</Button>}<code>{shortPath(data?.path)}</code></div>{err&&<div className="inline-error">{err}</div>}<div className="file-list">{data?.entries?.map(f=><button key={f.path} className="file-row" onClick={()=>f.directory&&load(f.path)}><span className={'file-icon '+(f.directory?'folder':'')}>{f.directory?<Folder/>:<FileText/>}</span><div><strong>{f.name}</strong><small>{f.directory?'Folder':'File'}</small></div>{f.directory&&<ChevronRight/>}</button>)}</div></div>}

// ------------------------------ SETTINGS -----------------------------------
function SettingsView({settings,setSettings,go}){const[vpn,setVpn]=useState(null),[github,setGithub]=useState(null),[msg,setMsg]=useState(''),[showRA,setShowRA]=useState(false),[showWP,setShowWP]=useState(false),[wpVersion,setWpVersion]=useState(0);const[me]=useLoad(()=>api('/me'),[]);const[status]=usePoll(()=>api('/status'),5000,[]);useEffect(()=>{api('/vpn/status').then(setVpn);api('/github/status').then(setGithub)},[]);
 const localUrl=me?.hostname?`http://${me.hostname}.local:8088`:null;
 const ipUrl=status?.ip?`http://${status.ip}:8088`:null;
 return <div className="settings page-pad">{showRA&&<RemoteAccess onClose={()=>{setShowRA(false);api('/vpn/status').then(setVpn)}}/>}{showWP&&<WallpaperPicker onClose={()=>setShowWP(false)} onSaved={()=>setWpVersion(v=>v+1)}/>}<PageTitle kicker="SETTINGS" title="Keep it simple." body="Tell TouchWorkstation what you want to do. Advanced Linux details stay out of the way."/>
 <div className="access-card">
  <div className="access-card-head"><Globe2/><div><strong>How to get back in</strong><small>Closing a terminal or this browser tab never stops TouchWorkstation \u2014 it keeps running on the machine. Come back anytime at:</small></div></div>
  {(localUrl||ipUrl)?<div className="access-urls">
   {localUrl&&<AccessUrl label="On this network" url={localUrl}/>}
   {ipUrl&&<AccessUrl label="By IP address" url={ipUrl}/>}
  </div>:<div className="access-urls"><small>Loading address\u2026</small></div>}
  <p className="access-hint">Forgot the address or password? On the machine itself run <code>touchworkstation-status</code> or <code>sudo touchworkstation-credentials</code>.</p>
 </div>
 <Setting icon={Globe2} title="Access away from home" status={vpn?.connected?'Ready':'Home only'} text={vpn?.connected?'Your private remote connection is active.':'Do you want to access this computer when you\u2019re away from home? We\u2019ll walk you through a secure VPN.'}><Button className="primary" onClick={()=>setShowRA(true)}>{vpn?.connected?'Manage':'Yes, set it up'}</Button></Setting>
 <Setting icon={GitBranch} title="GitHub" status={github?.connected?'Connected':'Not connected'} text={github?.connected?`Connected as ${github.user||'your GitHub account'}.`:'Do you want to clone, pull and push your projects from your phone?'}><Button onClick={async()=>{if(github?.connected){go('projects');return}try{const sessionId=await resolveTerminalTarget('github-login');go('terminal',{pendingCommand:'gh auth login',sessionId})}catch{go('terminal',{pendingCommand:'gh auth login'})}}}>{github?.connected?'Manage':'Connect GitHub'}</Button></Setting>
 <Setting icon={Bot} title="AI Agents" status="Configurable" text="Agents are configured in the Agents screen — choose a runtime, scope it to a project, and set permissions."><Button onClick={()=>setMsg('Open the Agents screen to create and launch agents.')}>Go to Agents</Button></Setting>
 <Setting icon={Palette} title="Appearance" status={themeLabel(settings?.theme)} text="Choose how TouchWorkstation feels. Your choice is saved and applied instantly."><div className="theme-picker">{[['aubergine','Aubergine','aub'],['charcoal','Charcoal','char'],['solar','Solar','sol']].map(([id,label,cls])=><button key={id} className={'theme-opt '+cls+((settings?.theme||'aubergine')===id?' active':'')} onClick={async()=>{setSettings(s=>({...s,theme:id}));try{await api('/settings',{method:'POST',body:JSON.stringify({theme:id})})}catch{}}}><i/>{label}</button>)}</div></Setting>
 <Setting icon={LayoutGrid} title="Interface" status={variantLabel(settings?.uiVariant)} text="Omarchy replaces the home screen and terminal with a full-black, keyboard-driven layout. This overrides whatever the installed build set by default."><div className="theme-picker">{[['standard','Standard','std'],['omarchy','Omarchy','omar']].map(([id,label,cls])=><button key={id} className={'theme-opt '+cls+((settings?.uiVariant?settings.uiVariant:(BUILD_OMARCHY?'omarchy':'standard'))===id?' active':'')} onClick={async()=>{setSettings(s=>({...s,uiVariant:id}));try{await api('/settings',{method:'POST',body:JSON.stringify({uiVariant:id})})}catch{}}}><i/>{label}</button>)}</div></Setting>
 <Setting icon={ImageIcon} title="Wallpaper" status="Omarchy home screen" text="Upload and crop a photo for the Omarchy home screen's background.">
  <div className="wp-setting-row">
   <img className="wp-thumb" src={`/wallpaper.jpg?v=${wpVersion}`} alt="" onError={(e)=>{e.currentTarget.style.visibility='hidden'}} onLoad={(e)=>{e.currentTarget.style.visibility='visible'}}/>
   <Button onClick={()=>setShowWP(true)}>Change</Button>
  </div>
 </Setting>
 <Setting icon={Grid3X3} title="Home screen" status={`${(settings?.homeTiles&&settings.homeTiles.length)||4} tiles`} text="Choose which shortcuts show on the home screen, and in what order."><HomeTileSettings settings={settings} setSettings={setSettings}/></Setting>
 <BuildInfo me={me}/>
 <UpdateCheck/>
 {msg&&<div className="settings-message"><Info/>{msg}</div>}</div>}
// Real update check (previous version was a hardcoded placeholder). Hits
// GitHub, compares against the running build's SHA. If this install has
// makepkg (Arch), "Build update" runs the safe, no-privilege half
// automatically (git pull + makepkg, no -i) and polls until it's done, then
// shows the ONE remaining command — a sudo pacman -U — for the user to run
// by hand. That single command also triggers the service restart on its
// own (touchworkstation.install's post_upgrade already does that). No
// sudoers rule, no password ever seen by the app. Anywhere else, this just
// shows the full manual command like before.
function UpdateCheck(){
 const[busy,setBusy]=useState(false),[result,setResult]=useState(null);
 const[building,setBuilding]=useState(false);
 async function check(){
  setBusy(true); setResult(null);
  try{setResult(await api('/update/check'))}
  catch(e){setResult({status:'error',message:e.message})}
  finally{setBusy(false)}
 }
 async function build(){
  setBuilding(true);
  try{await api('/update/apply',{method:'POST',body:'{}'})}
  catch(e){setBuilding(false);setResult(r=>({...r,buildError:e.message}));return}
  let tries=0;
  const poll=async()=>{
   tries++;
   try{
    const s=await api('/update/apply/status');
    if(s.status==='ready'){setBuilding(false);setResult(r=>({...r,build:s}));return}
    if(s.status==='error'){setBuilding(false);setResult(r=>({...r,buildError:s.message}));return}
   }catch{ /* transient — keep polling */ }
   if(tries<90)setTimeout(poll,4000);
   else{setBuilding(false);setResult(r=>({...r,buildError:'Still building after several minutes — check the machine directly.'}))}
  };
  setTimeout(poll,3000);
 }
 const statusLabel=result?({'up-to-date':'Up to date','update-available':'Update available','error':'Check failed'}[result.status]||''):' ';
 return <Setting icon={RefreshCcw} title="Updates" status={statusLabel} text="Compares this install with the latest commit on GitHub.">
  <Button onClick={check} disabled={busy||building}>{busy?'Checking…':'Check for updates'}</Button>
  {result&&<div className="update-result">
   <p>{result.message}</p>
   {result.status==='update-available'&&!result.build&&result.canAutoBuild&&
    <Button className="primary" onClick={build} disabled={building}>{building?'Building… this can take a few minutes':'Build update'}</Button>}
   {result.buildError&&<div className="inline-error">{result.buildError}</div>}
   {result.build?.status==='ready'&&<div className="update-cmd">
    <span>Build ready — run this on the machine to install it (this also restarts the service):</span>
    <code>{result.build.command}</code>
   </div>}
   {result.status==='update-available'&&!result.build&&(!result.canAutoBuild)&&result.installCommand&&<div className="update-cmd">
    <span>Run on this machine to apply:</span>
    <code>{result.installCommand}</code>
   </div>}
  </div>}
 </Setting>;
}
// A visible build indicator, at the bottom of Settings. Shows the git
// commit the server was built from, the commit the loaded frontend bundle
// was built from, when the server process started, and whether the two
// SHAs match. If the frontend SHA differs from the server's, the browser
// is running a stale cached bundle and needs a hard refresh — otherwise
// "did my new code actually get deployed?" is unanswerable except by
// behavior, which is exactly the debugging trap this exists to prevent.
function BuildInfo({me}){
 const serverBuild=me?.build||'—';
 const uiBuild=typeof __BUILD_SHA__==='string'?__BUILD_SHA__:'—';
 const uiTheme=typeof __BUILD_THEME__==='string'?__BUILD_THEME__:'—';
 const mismatch=serverBuild!=='—'&&uiBuild!=='—'&&uiBuild!=='unknown'&&serverBuild!==uiBuild;
 return <section className="setting-row build-info"><div className="setting-icon"><Info/></div><div className="setting-copy"><div className="setting-title"><h3>Build</h3><span className={mismatch?'build-mismatch':''}>{mismatch?'mismatched':uiBuild}</span></div>
  <div className="build-rows">
   <div><span>server</span><code>{serverBuild}</code></div>
   <div><span>this page</span><code>{uiBuild}</code></div>
   <div><span>variant baked in</span><code>{uiTheme}</code></div>
   {me?.startedAt&&<div><span>server started</span><code>{fmtWhen(me.startedAt)}</code></div>}
  </div>
  {mismatch&&<p className="build-warn">This browser is running an older bundle than the server. Hard refresh (Ctrl+Shift+R), or fully close and reopen the tab / PWA.</p>}
 </div></section>;
}
function Setting({icon:Icon,title,status,text,children}){return <section className="setting-row"><div className="setting-icon"><Icon/></div><div className="setting-copy"><div className="setting-title"><h3>{title}</h3><span>{status}</span></div><p>{text}</p><div className="setting-actions">{children}</div></div></section>}

// Visible error overlay: if anything throws during render or on load, show
// the actual error on screen instead of a blank page. A production app must
// never white-screen silently.
class ErrorBoundary extends React.Component{
 constructor(p){super(p);this.state={err:null}}
 static getDerivedStateFromError(err){return{err}}
 componentDidCatch(err,info){this.setState({err,info})}
 render(){
  if(this.state.err){
   return <div style={{padding:'24px',fontFamily:'monospace',color:'#fff',background:'#1a0d12',minHeight:'100vh',fontSize:'13px',lineHeight:1.6}}>
    <h2 style={{color:'#ff7647'}}>TouchWorkstation hit an error</h2>
    <p style={{color:'#e6a48d'}}>Please share this with support:</p>
    <pre style={{whiteSpace:'pre-wrap',wordBreak:'break-word',background:'#0b090d',padding:'14px',borderRadius:'10px',border:'1px solid rgba(255,255,255,.1)'}}>{String(this.state.err?.stack||this.state.err)}</pre>
    <button onClick={()=>{if('serviceWorker'in navigator){navigator.serviceWorker.getRegistrations().then(rs=>rs.forEach(r=>r.unregister()))}if(window.caches){caches.keys().then(ks=>ks.forEach(k=>caches.delete(k)))}setTimeout(()=>location.reload(),400)}} style={{marginTop:'16px',padding:'12px 18px',background:'#e95420',color:'#fff',border:0,borderRadius:'10px',fontSize:'14px'}}>Clear cache & reload</button>
   </div>;
  }
  return this.props.children;
 }
}

// Catch errors that happen outside React too (module load, async), and show
// them on the page rather than leaving it blank.
window.addEventListener('error',e=>{
 const root=document.getElementById('root');
 if(root&&!root.hasChildNodes()){
  root.innerHTML=`<div style="padding:24px;font-family:monospace;color:#fff;background:#1a0d12;min-height:100vh;font-size:13px"><h2 style="color:#ff7647">TouchWorkstation failed to start</h2><pre style="white-space:pre-wrap;background:#0b090d;padding:14px;border-radius:10px">${(e.error?.stack||e.message||e.toString()).replace(/</g,'&lt;')}</pre><button onclick="if('serviceWorker'in navigator){navigator.serviceWorker.getRegistrations().then(function(rs){rs.forEach(function(r){r.unregister()})})}if(window.caches){caches.keys().then(function(ks){ks.forEach(function(k){caches.delete(k)})})}setTimeout(function(){location.reload()},400)" style="margin-top:16px;padding:12px 18px;background:#e95420;color:#fff;border:0;border-radius:10px">Clear cache &amp; reload</button></div>`;
 }
});

createRoot(document.getElementById('root')).render(<ErrorBoundary><App/></ErrorBoundary>);
