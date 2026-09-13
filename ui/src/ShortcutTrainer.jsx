// ui/src/ShortcutTrainer.jsx
// Omarchy Desktop Shortcuts — an interactive trainer, not a cheat sheet.
// Built as a reusable "shortcut training engine" (ui/src/lib/shortcutEngine.js
// + ui/src/lib/keyCapture.js) with Omarchy as the first course; the data
// itself lives in ui/src/data/omarchyShortcuts.js, kept separate from every
// component here so a future Tmux/Neovim/Git course can reuse this same UI.
//
// Progress is local-only (localStorage, no account) — see shortcutEngine.js
// for the mastery-score/spaced-repetition math.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Search, Star, BookOpen, Dumbbell, ListChecks, Trophy, Keyboard as KeyboardIcon,
  Grid3X3, Timer, CalendarCheck, Check, X, ChevronDown, ChevronRight as ChevronRightIcon, Lightbulb,
  Monitor,
} from 'lucide-react';
import { SHORTCUTS, CATEGORIES, CATEGORY_NOTES, ESSENTIAL_IDS, byId } from './data/omarchyShortcuts.js';
import * as engine from './lib/shortcutEngine.js';
import { isLiveDetectable, matchesCombo, useKeyCombo, useKeyComboComplete } from './lib/keyCapture.js';
import { Keycap, KeyCombo, VirtualKeyboard, keyLabel } from './ShortcutKeycap.jsx';

const ONBOARD_KEY = 'tw-omarchy-shortcuts-onboarded';
const QUIZZABLE = SHORTCUTS.filter((sc) => sc.type !== 'command');
const isMobileViewport = () => { try { return window.matchMedia('(max-width: 820px)').matches; } catch { return false; } };

function shuffle(arr) { return [...arr].sort(() => Math.random() - 0.5); }

// ------------------------------- ROOT -------------------------------------

export function ShortcutTrainer() {
  const [progress, setProgress] = useState(() => engine.load());
  const [view, setView] = useState('home');
  const [params, setParams] = useState(null);
  const [onboarded, setOnboarded] = useState(() => {
    try { return localStorage.getItem(ONBOARD_KEY) === '1'; } catch { return true; }
  });

  function nav(v, p = null) { setView(v); setParams(p); }
  function dismissOnboarding() {
    setOnboarded(true);
    try { localStorage.setItem(ONBOARD_KEY, '1'); } catch { /* private mode */ }
  }

  const actions = {
    progress,
    attempt: (id, correct) => setProgress((p) => engine.recordAttempt(p, id, correct)),
    favorite: (id) => setProgress((p) => engine.toggleFavorite(p, id)),
    recordView: (id) => setProgress((p) => engine.recordView(p, id)),
  };
  const back = () => nav('home');

  return (
    <div className="sk-root">
      {view === 'home' && <ShortcutHome {...actions} nav={nav} onboarded={onboarded} dismissOnboarding={dismissOnboarding} />}
      {view === 'search' && <ShortcutSearch {...actions} nav={nav} back={back} />}
      {view === 'browse' && <ShortcutBrowse {...actions} nav={nav} back={back} favoritesOnly={!!params?.favoritesOnly} category={params?.category} />}
      {view === 'progress' && <ShortcutProgress {...actions} back={back} />}
      {view === 'explore' && <ShortcutExplore {...actions} nav={nav} back={back} />}
      {view === 'setup-train' && <SessionSetup {...actions} back={back} title={params?.title} onStart={(filter) => nav(params.target, filter)} />}
      {view === 'setup-speed' && <SpeedSetup back={back} onStart={(cfg) => nav('speed', cfg)} />}
      {(view === 'learn' || view === 'practice') && <TrainSession {...actions} mode={view} filter={params} back={back} />}
      {view === 'daily' && <TrainSession {...actions} mode="daily" back={back} />}
      {view === 'reverse' && <ReverseSession {...actions} filter={params} back={back} />}
      {view === 'speed' && <SpeedRound {...actions} config={params} back={back} />}
    </div>
  );
}

// ------------------------------- HOME -------------------------------------

function ShortcutHome({ progress, favorite, nav, onboarded, dismissOnboarding }) {
  const overall = engine.overallMastery(SHORTCUTS, progress);
  const sotd = useMemo(() => {
    const dayKey = new Date().toISOString().slice(0, 10);
    let seed = 0;
    for (let i = 0; i < dayKey.length; i++) seed = (seed * 31 + dayKey.charCodeAt(i)) >>> 0;
    return QUIZZABLE[seed % QUIZZABLE.length];
  }, []);

  const primary = [
    { id: 'search', label: 'Search Shortcuts', icon: Search, onClick: () => nav('search') },
    { id: 'continue', label: 'Continue Training', icon: Dumbbell, onClick: () => nav('practice', { category: 'all', difficulty: 'all' }) },
    { id: 'practice', label: 'Practice Mode', icon: ListChecks, onClick: () => nav('setup-train', { target: 'practice', title: 'Practice Mode' }) },
    { id: 'quiz', label: 'Quiz Mode', icon: BookOpen, onClick: () => nav('setup-train', { target: 'reverse', title: 'Quiz Mode' }) },
    { id: 'all', label: 'All Shortcuts', icon: Grid3X3, onClick: () => nav('browse', {}) },
    { id: 'favorites', label: 'Favorites', icon: Star, onClick: () => nav('browse', { favoritesOnly: true }) },
    { id: 'progress', label: 'Progress', icon: Trophy, onClick: () => nav('progress') },
  ];
  const more = [
    { id: 'speed', label: 'Speed Round', icon: Timer, onClick: () => nav('setup-speed') },
    { id: 'daily', label: 'Daily 5', icon: CalendarCheck, onClick: () => nav('daily') },
    { id: 'explore', label: 'Explore by Key', icon: KeyboardIcon, onClick: () => nav('explore') },
  ];

  return (
    <div className="sk-page">
      <div className="sk-home-head">
        <h1>Omarchy Desktop Shortcuts</h1>
        <p>Master Omarchy without touching the mouse.</p>
      </div>

      {!onboarded && (
        <div className="sk-onboard">
          <p><strong>Learn Omarchy by using it.</strong></p>
          <p>You don't need to memorize everything at once. Start with the shortcuts you'll use every day.</p>
          <div className="sk-onboard-actions">
            <button className="sk-btn sk-btn-primary" onClick={() => { dismissOnboarding(); nav('practice', { ids: ESSENTIAL_IDS }); }}>Start With The Essentials</button>
            <button className="sk-btn-text" onClick={dismissOnboarding}>Skip</button>
          </div>
        </div>
      )}

      <div className="sk-sotd">
        <span className="sk-sotd-kicker">Shortcut of the Day</span>
        <KeyCombo keys={sotd.keys} sequence={sotd.sequence} size="lg" />
        <strong>{sotd.action}</strong>
        <button className="sk-btn sk-btn-ghost" onClick={() => nav('practice', { ids: [sotd.id] })}>Practice it</button>
      </div>

      <div className="sk-grid">
        {primary.map((a) => <HomeTile key={a.id} {...a} />)}
      </div>
      <div className="sk-grid sk-grid-small">
        {more.map((a) => <HomeTile key={a.id} {...a} small />)}
      </div>

      <div className="sk-mastery-strip">
        <span>Omarchy Mastery</span>
        <div className="sk-mastery-bar"><i style={{ width: overall + '%' }} /></div>
        <strong>{overall}%</strong>
      </div>

      <div className="sk-categories">
        {CATEGORIES.map((cat) => {
          const p = engine.categoryProgress(SHORTCUTS, progress, cat);
          if (!p.total) return null;
          return (
            <button className="sk-cat-row" key={cat} onClick={() => nav('browse', { category: cat })}>
              <span className="sk-cat-name">{cat}</span>
              <span className="sk-cat-frac">{p.learned} / {p.total} learned</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function HomeTile({ label, icon: Icon, onClick, small }) {
  return (
    <button className={'sk-tile' + (small ? ' sk-tile-small' : '')} onClick={onClick}>
      <Icon />
      <span>{label}</span>
    </button>
  );
}

// ------------------------------ TOP BAR ------------------------------------

function SkBar({ title, back, right }) {
  return (
    <div className="sk-bar">
      <button className="sk-back" onClick={back}><ArrowLeft /></button>
      <strong>{title}</strong>
      <div className="sk-bar-right">{right}</div>
    </div>
  );
}

// ------------------------------- SEARCH -------------------------------------

function ShortcutSearch({ progress, favorite, nav, back }) {
  const [q, setQ] = useState('');
  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return [];
    const terms = query.split(/\s+/);
    return SHORTCUTS.filter((sc) => {
      const haystacks = [
        sc.keys.map(keyLabel).join(' ').toLowerCase(),
        sc.action.toLowerCase(),
        sc.description.toLowerCase(),
        (sc.aliases || []).join(' ').toLowerCase(),
        sc.category.toLowerCase(),
      ].join(' ');
      return terms.every((t) => haystacks.includes(t));
    }).slice(0, 60);
  }, [q]);

  return (
    <div className="sk-page">
      <SkBar title="Search Shortcuts" back={back} />
      <div className="sk-search-box">
        <Search />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search keys or actions — e.g. terminal, clipboard, super ctrl" />
      </div>
      {q.trim() && !results.length && <div className="sk-empty">No matches for "{q}".</div>}
      <div className="sk-list">
        {results.map((sc) => (
          <ShortcutRow key={sc.id} sc={sc} entry={engine.getEntry(progress, sc.id)} onFavorite={() => favorite(sc.id)} onClick={() => nav('practice', { ids: [sc.id] })} />
        ))}
      </div>
    </div>
  );
}

// --------------------------- ALL SHORTCUTS / FAVORITES -----------------------

function ShortcutRow({ sc, entry, onFavorite, onClick }) {
  const state = engine.masteryState(entry);
  const isCommand = sc.type === 'command';
  return (
    <div className="sk-row">
      {isCommand ? (
        <div className="sk-row-main sk-row-command">
          <code className="sk-cmd">{sc.command}</code>
          <div className="sk-row-text"><strong>{sc.action}</strong><small>{sc.category} · command, not a keyboard shortcut</small></div>
        </div>
      ) : (
        <button className="sk-row-main" onClick={onClick}>
          <KeyCombo keys={sc.keys} sequence={sc.sequence} size="sm" />
          <div className="sk-row-text"><strong>{sc.action}</strong><small>{sc.category}</small></div>
          <span className={'sk-mastery-dot sk-mastery-' + state} title={engine.MASTERY_LABEL[state]} />
        </button>
      )}
      <button className={'sk-fav' + (entry.favorite ? ' on' : '')} onClick={onFavorite}><Star /></button>
    </div>
  );
}

function ShortcutBrowse({ progress, favorite, nav, back, favoritesOnly, category }) {
  const [open, setOpen] = useState(() => new Set(category ? [category] : []));
  const grouped = useMemo(() => {
    const filtered = SHORTCUTS.filter((sc) => {
      if (favoritesOnly && !engine.getEntry(progress, sc.id).favorite) return false;
      if (category && sc.category !== category) return false;
      return true;
    });
    const byCat = new Map();
    for (const sc of filtered) {
      if (!byCat.has(sc.category)) byCat.set(sc.category, []);
      byCat.get(sc.category).push(sc);
    }
    return byCat;
  }, [progress, favoritesOnly, category]);

  function toggle(cat) {
    setOpen((s) => { const n = new Set(s); n.has(cat) ? n.delete(cat) : n.add(cat); return n; });
  }

  const title = favoritesOnly ? 'Favorites' : category ? category : 'All Shortcuts';
  const favIds = useMemo(() => SHORTCUTS.filter((sc) => engine.getEntry(progress, sc.id).favorite).map((sc) => sc.id), [progress]);

  return (
    <div className="sk-page">
      <SkBar
        title={title}
        back={back}
        right={favoritesOnly && favIds.length ? <button className="sk-btn sk-btn-ghost" onClick={() => nav('practice', { ids: favIds })}>Practice</button> : null}
      />
      {favoritesOnly && !favIds.length && <div className="sk-empty">No favorites yet — tap the star on any shortcut to build your own training deck.</div>}
      {!grouped.size && !favoritesOnly && <div className="sk-empty">Nothing here.</div>}
      {[...grouped.entries()].map(([cat, items]) => (
        <div className="sk-collapse" key={cat}>
          <button className="sk-collapse-head" onClick={() => toggle(cat)}>
            {open.has(cat) ? <ChevronDown /> : <ChevronRightIcon />}
            <strong>{cat}</strong>
            <span>{items.length}</span>
          </button>
          {open.has(cat) && (
            <div className="sk-list">
              {CATEGORY_NOTES[cat] && <div className="sk-note">{CATEGORY_NOTES[cat]}</div>}
              {items.map((sc) => (
                <ShortcutRow key={sc.id} sc={sc} entry={engine.getEntry(progress, sc.id)} onFavorite={() => favorite(sc.id)} onClick={() => nav('practice', { ids: [sc.id] })} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// -------------------------------- PROGRESS ----------------------------------

function ShortcutProgress({ progress, back }) {
  const overall = engine.overallMastery(SHORTCUTS, progress);
  const counts = { new: 0, learning: 0, familiar: 0, mastered: 0 };
  for (const sc of QUIZZABLE) counts[engine.masteryState(engine.getEntry(progress, sc.id))]++;

  return (
    <div className="sk-page">
      <SkBar title="Progress" back={back} />
      <div className="sk-progress-hero">
        <span>Omarchy Mastery</span>
        <strong>{overall}%</strong>
        <div className="sk-mastery-bar sk-mastery-bar-lg"><i style={{ width: overall + '%' }} /></div>
      </div>
      <div className="sk-mastery-counts">
        {['new', 'learning', 'familiar', 'mastered'].map((k) => (
          <div className="sk-mastery-count" key={k}>
            <span className={'sk-mastery-dot sk-mastery-' + k} />
            <strong>{counts[k]}</strong>
            <small>{engine.MASTERY_LABEL[k]}</small>
          </div>
        ))}
      </div>
      <div className="sk-categories">
        {CATEGORIES.map((cat) => {
          const p = engine.categoryProgress(SHORTCUTS, progress, cat);
          if (!p.total) return null;
          const pct = Math.round((p.learned / p.total) * 100);
          return (
            <div className="sk-cat-progress" key={cat}>
              <div className="sk-cat-progress-head"><span>{cat}</span><small>{p.learned} / {p.total}</small></div>
              <div className="sk-mastery-bar"><i style={{ width: pct + '%' }} /></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --------------------------------- SETUP ------------------------------------

const DIFFICULTIES = ['all', 'beginner', 'intermediate', 'advanced'];

function SessionSetup({ back, title, onStart }) {
  const [category, setCategory] = useState('all');
  const [difficulty, setDifficulty] = useState('all');
  const cats = ['all', ...CATEGORIES.filter((c) => SHORTCUTS.some((sc) => sc.category === c && sc.type !== 'command'))];

  return (
    <div className="sk-page">
      <SkBar title={title} back={back} />
      <div className="sk-setup-block">
        <h3>Category</h3>
        <div className="sk-chip-row">
          {cats.map((c) => (
            <button key={c} className={'sk-chip' + (category === c ? ' on' : '')} onClick={() => setCategory(c)}>{c === 'all' ? 'Everything' : c}</button>
          ))}
        </div>
      </div>
      <div className="sk-setup-block">
        <h3>Difficulty</h3>
        <div className="sk-chip-row">
          {DIFFICULTIES.map((d) => (
            <button key={d} className={'sk-chip' + (difficulty === d ? ' on' : '')} onClick={() => setDifficulty(d)}>{d === 'all' ? 'All' : d[0].toUpperCase() + d.slice(1)}</button>
          ))}
        </div>
      </div>
      <button className="sk-btn sk-btn-primary sk-btn-block" onClick={() => onStart({ category, difficulty })}>Start</button>
    </div>
  );
}

function SpeedSetup({ back, onStart }) {
  return (
    <div className="sk-page">
      <SkBar title="Speed Round" back={back} />
      <p className="sk-hint-text">Multiple-choice, against the clock. Score, accuracy, average response time, and your longest streak — pick a duration.</p>
      <div className="sk-chip-row sk-chip-row-lg">
        {[30, 60, 120].map((secs) => (
          <button key={secs} className="sk-btn sk-btn-primary" onClick={() => onStart({ seconds: secs })}>{secs < 60 ? `${secs}s` : `${secs / 60}m`}</button>
        ))}
      </div>
    </div>
  );
}

// ------------------------------ TRAIN SESSION --------------------------------

function poolFor(filter) {
  if (!filter) return QUIZZABLE;
  if (filter.ids) return QUIZZABLE.filter((sc) => filter.ids.includes(sc.id));
  return QUIZZABLE.filter((sc) => {
    if (filter.category && filter.category !== 'all' && sc.category !== filter.category) return false;
    if (filter.difficulty && filter.difficulty !== 'all' && sc.difficulty !== filter.difficulty) return false;
    return true;
  });
}

function TrainSession({ progress, attempt, favorite, recordView, mode, filter, back }) {
  const isDaily = mode === 'daily';
  const dailyQueue = useMemo(() => (isDaily ? engine.dailyFive(SHORTCUTS, progress) : null), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [dailyIndex, setDailyIndex] = useState(0);
  const pool = useMemo(() => (isDaily ? dailyQueue : poolFor(filter)), [isDaily, dailyQueue, filter]);

  const [current, setCurrent] = useState(() => (isDaily ? dailyQueue[0] : engine.pickOne(pool, progress)));
  const [phase, setPhase] = useState('task'); // task | correct | incorrect
  const [hintLevel, setHintLevel] = useState(0);
  const [inputMethod, setInputMethod] = useState(() => (isMobileViewport() ? 'touch' : 'physical'));
  const [heldMods, setHeldMods] = useState(new Set());
  const [finalKey, setFinalKey] = useState(null);
  const [sessionStats, setSessionStats] = useState({ correct: 0, total: 0 });
  const viewedRef = useRef(new Set());

  useEffect(() => {
    if (current && !viewedRef.current.has(current.id)) {
      viewedRef.current.add(current.id);
      recordView(current.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  const liveOk = current ? isLiveDetectable(current) : false;
  const pressed = useKeyCombo({ enabled: inputMethod === 'physical' && liveOk && phase === 'task' });

  useKeyComboComplete((combo) => {
    if (!current || phase !== 'task' || inputMethod !== 'physical' || !liveOk) return;
    if (combo.size === 0) return;
    judge(matchesCombo(combo, current.keys));
  }, [current?.id, phase, inputMethod, liveOk]);

  function judge(correct) {
    attempt(current.id, correct);
    setSessionStats((s) => ({ correct: s.correct + (correct ? 1 : 0), total: s.total + 1 }));
    setPhase(correct ? 'correct' : 'incorrect');
  }

  function tryAgain() {
    setPhase('task');
    setHeldMods(new Set());
    setFinalKey(null);
  }

  function next() {
    setPhase('task');
    setHintLevel(0);
    setHeldMods(new Set());
    setFinalKey(null);
    if (isDaily) {
      const ni = dailyIndex + 1;
      if (ni >= dailyQueue.length) { back(); return; }
      setDailyIndex(ni);
      setCurrent(dailyQueue[ni]);
      return;
    }
    if (pool.length === 1) { setCurrent(pool[0]); return; }
    const nextItem = engine.pickOne(pool, progress, current?.id);
    if (!nextItem) { back(); return; }
    setCurrent(nextItem);
  }

  function toggleMod(m) {
    setHeldMods((s) => { const n = new Set(s); n.has(m) ? n.delete(m) : n.add(m); return n; });
  }
  function submitTouch() {
    const combo = new Set(heldMods);
    if (finalKey) combo.add(finalKey);
    judge(matchesCombo(combo, current.keys));
  }
  function clearTouch() { setHeldMods(new Set()); setFinalKey(null); }

  if (!current) return <div className="sk-page"><SkBar title="Training" back={back} /><div className="sk-empty">Nothing to train in this selection.</div></div>;

  const entry = engine.getEntry(progress, current.id);
  const title = isDaily ? `Daily 5 · ${dailyIndex + 1}/5` : mode === 'learn' ? 'Learn' : 'Practice';

  return (
    <div className="sk-page">
      <SkBar
        title={title}
        back={back}
        right={<button className={'sk-fav' + (entry.favorite ? ' on' : '')} onClick={() => favorite(current.id)}><Star /></button>}
      />

      <div className="sk-session-stats">{sessionStats.total > 0 && <span>{sessionStats.correct}/{sessionStats.total} correct this session</span>}</div>

      <div className="sk-task">
        <span className="sk-task-kicker">Task</span>
        <h2>{current.description}</h2>
      </div>

      {phase === 'correct' && (
        <div className="sk-feedback sk-feedback-correct">
          <Check /><div><strong>Correct</strong><small>{current.action}</small></div>
        </div>
      )}
      {phase === 'incorrect' && (
        <div className="sk-feedback sk-feedback-incorrect">
          <X /><div><strong>Try again.</strong></div>
        </div>
      )}

      {phase !== 'correct' && !liveOk && (
        <DesktopTryPanel sc={current} onWorked={() => judge(true)} onNeedPractice={() => judge(false)} />
      )}

      {phase !== 'correct' && liveOk && (
        <>
          <div className="sk-input-tabs">
            <button className={inputMethod === 'physical' ? 'on' : ''} onClick={() => setInputMethod('physical')}>Physical Keyboard</button>
            <button className={inputMethod === 'touch' ? 'on' : ''} onClick={() => setInputMethod('touch')}>Touch Keyboard</button>
          </div>

          {inputMethod === 'physical' && phase === 'task' && (
            <div className="sk-live-capture">
              <p className="sk-hint-text">Press the combination on your keyboard.</p>
              <div className="sk-pressed-row">
                {[...pressed].length ? [...pressed].map((k) => <Keycap key={k} token={k} />) : <span className="sk-pressed-empty">Waiting…</span>}
              </div>
            </div>
          )}
          {inputMethod === 'physical' && phase === 'incorrect' && (
            <button className="sk-btn sk-btn-primary sk-btn-block" onClick={tryAgain}>Try Again</button>
          )}

          {inputMethod === 'touch' && phase !== 'correct' && (
            <VirtualKeyboard
              heldMods={heldMods}
              onToggleMod={toggleMod}
              onKey={(k) => setFinalKey(k)}
              onSubmit={submitTouch}
              onClear={clearTouch}
              canSubmit={heldMods.size > 0 || !!finalKey}
            />
          )}
          {inputMethod === 'touch' && finalKey && (
            <div className="sk-touch-preview"><span>Selected:</span><KeyCombo keys={[...heldMods, finalKey]} size="sm" /></div>
          )}
        </>
      )}

      {phase !== 'correct' && (
        <div className="sk-hint-row">
          {hintLevel === 0 && <button className="sk-btn-text" onClick={() => setHintLevel(1)}><Lightbulb /> Show Hint</button>}
          {hintLevel === 1 && (
            <button className="sk-btn-text" onClick={() => setHintLevel(2)}>
              <KeyCombo keys={[...current.keys.filter((k) => ['SUPER', 'CTRL', 'ALT', 'SHIFT', 'PREFIX'].includes(k)), '?']} size="sm" /> Reveal full shortcut
            </button>
          )}
          {hintLevel === 2 && <KeyCombo keys={current.keys} sequence={current.sequence} size="sm" />}
        </div>
      )}

      {phase === 'correct' && <button className="sk-btn sk-btn-primary sk-btn-block" onClick={next}>Next</button>}
    </div>
  );
}

function DesktopTryPanel({ sc, onWorked, onNeedPractice }) {
  return (
    <div className="sk-desktop-try">
      <Monitor />
      <p>This one can't be safely captured in a browser tab. Try it on your Omarchy machine, then tell us how it went.</p>
      <KeyCombo keys={sc.keys} sequence={sc.sequence} size="lg" />
      <div className="sk-desktop-try-actions">
        <button className="sk-btn sk-btn-primary" onClick={onWorked}>Worked</button>
        <button className="sk-btn" onClick={onNeedPractice}>Need Practice</button>
      </div>
    </div>
  );
}

// ------------------------------ REVERSE / QUIZ -------------------------------

function ReverseSession({ progress, attempt, filter, back }) {
  const pool = useMemo(() => poolFor(filter), [filter]);
  const [question, setQuestion] = useState(() => makeQuestion(pool, progress));
  const [picked, setPicked] = useState(null);
  const [stats, setStats] = useState({ correct: 0, total: 0 });

  function makeQuestion(p, prog, excludeId) {
    const sc = engine.pickOne(p, prog, excludeId);
    if (!sc) return null;
    const choices = shuffle([sc, ...engine.pickDistractors(SHORTCUTS, sc, 3)]);
    return { sc, choices };
  }

  function choose(choice) {
    if (picked) return;
    setPicked(choice);
    const correct = choice.id === question.sc.id;
    attempt(question.sc.id, correct);
    setStats((s) => ({ correct: s.correct + (correct ? 1 : 0), total: s.total + 1 }));
  }

  function next() {
    const q = makeQuestion(pool, progress, question?.sc?.id);
    if (!q) { back(); return; }
    setQuestion(q);
    setPicked(null);
  }

  if (!question) return <div className="sk-page"><SkBar title="Quiz Mode" back={back} /><div className="sk-empty">Nothing to quiz in this selection.</div></div>;

  return (
    <div className="sk-page">
      <SkBar title="Quiz Mode" back={back} right={stats.total > 0 ? <span className="sk-inline-stat">{stats.correct}/{stats.total}</span> : null} />
      <div className="sk-task">
        <span className="sk-task-kicker">What does this do?</span>
        <KeyCombo keys={question.sc.keys} sequence={question.sc.sequence} size="lg" />
      </div>
      <div className="sk-choices">
        {question.choices.map((c) => {
          const isCorrect = c.id === question.sc.id;
          const cls = !picked ? '' : isCorrect ? 'correct' : c.id === picked.id ? 'wrong' : '';
          return (
            <button key={c.id} className={'sk-choice ' + cls} disabled={!!picked} onClick={() => choose(c)}>{c.action}</button>
          );
        })}
      </div>
      {picked && <button className="sk-btn sk-btn-primary sk-btn-block" onClick={next}>Next</button>}
    </div>
  );
}

// -------------------------------- SPEED ROUND --------------------------------

function SpeedRound({ progress, attempt, config, back }) {
  const seconds = config?.seconds || 60;
  const statsRef = useRef({ correct: 0, total: 0, streak: 0, longestStreak: 0, totalMs: 0 });
  const startRef = useRef(Date.now());
  const [phase, setPhase] = useState('running'); // running | done
  const [timeLeft, setTimeLeft] = useState(seconds);
  const [question, setQuestion] = useState(() => makeQuestion(null));
  const [picked, setPicked] = useState(null);
  const [, force] = useState(0);

  function makeQuestion(excludeId) {
    const sc = engine.pickOne(QUIZZABLE, progress, excludeId);
    if (!sc) return null;
    const choices = shuffle([sc, ...engine.pickDistractors(SHORTCUTS, sc, 3)]);
    startRef.current = Date.now();
    return { sc, choices };
  }

  useEffect(() => {
    if (phase !== 'running') return;
    const t = setInterval(() => setTimeLeft((x) => (x <= 1 ? 0 : x - 1)), 1000);
    return () => clearInterval(t);
  }, [phase]);
  useEffect(() => { if (timeLeft === 0 && phase === 'running') setPhase('done'); }, [timeLeft, phase]);

  function choose(choice) {
    if (picked || phase !== 'running') return;
    setPicked(choice);
    const correct = choice.id === question.sc.id;
    const ms = Date.now() - startRef.current;
    attempt(question.sc.id, correct);
    const st = statsRef.current;
    st.total += 1;
    st.totalMs += ms;
    if (correct) { st.correct += 1; st.streak += 1; st.longestStreak = Math.max(st.longestStreak, st.streak); }
    else st.streak = 0;
    force((x) => x + 1);
    setTimeout(() => {
      if (timeLeft <= 1) { setPhase('done'); return; }
      const q = makeQuestion(question.sc.id);
      if (!q) { setPhase('done'); return; }
      setQuestion(q);
      setPicked(null);
    }, 450);
  }

  if (phase === 'done') {
    const st = statsRef.current;
    const accuracy = st.total ? Math.round((st.correct / st.total) * 100) : 0;
    const avgMs = st.total ? Math.round(st.totalMs / st.total) : 0;
    return (
      <div className="sk-page">
        <SkBar title="Speed Round" back={back} />
        <div className="sk-speed-results">
          <h2>Time's up.</h2>
          <div className="sk-speed-stat-grid">
            <div><strong>{st.correct}</strong><small>Score</small></div>
            <div><strong>{accuracy}%</strong><small>Accuracy</small></div>
            <div><strong>{(avgMs / 1000).toFixed(1)}s</strong><small>Avg response</small></div>
            <div><strong>{st.longestStreak}</strong><small>Longest streak</small></div>
          </div>
        </div>
        <button className="sk-btn sk-btn-primary sk-btn-block" onClick={back}>Done</button>
      </div>
    );
  }

  if (!question) return <div className="sk-page"><SkBar title="Speed Round" back={back} /><div className="sk-empty">Not enough shortcuts to run a round.</div></div>;

  return (
    <div className="sk-page">
      <SkBar title="Speed Round" back={back} right={<span className="sk-inline-stat sk-timer">{timeLeft}s</span>} />
      <div className="sk-task">
        <span className="sk-task-kicker">What does this do?</span>
        <KeyCombo keys={question.sc.keys} sequence={question.sc.sequence} size="lg" />
      </div>
      <div className="sk-choices">
        {question.choices.map((c) => {
          const isCorrect = c.id === question.sc.id;
          const cls = !picked ? '' : isCorrect ? 'correct' : c.id === picked.id ? 'wrong' : '';
          return <button key={c.id} className={'sk-choice ' + cls} disabled={!!picked} onClick={() => choose(c)}>{c.action}</button>;
        })}
      </div>
      <div className="sk-speed-live">{statsRef.current.correct} correct · streak {statsRef.current.streak}</div>
    </div>
  );
}

// ------------------------------ EXPLORE BY KEY -------------------------------

const MODS = ['SUPER', 'CTRL', 'ALT', 'SHIFT'];
const MAP_ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
];

function ShortcutExplore({ progress, favorite, back }) {
  const [mods, setMods] = useState(new Set());
  const [keyFocus, setKeyFocus] = useState(null);

  function toggleMod(m) {
    setMods((s) => { const n = new Set(s); n.has(m) ? n.delete(m) : n.add(m); return n; });
    setKeyFocus(null);
  }

  const matches = useMemo(() => {
    return QUIZZABLE.filter((sc) => {
      if (!mods.size && !keyFocus) return false;
      for (const m of mods) if (!sc.keys.includes(m)) return false;
      if (keyFocus && !sc.keys.includes(keyFocus)) return false;
      return true;
    });
  }, [mods, keyFocus]);

  const activeKeys = useMemo(() => {
    if (!mods.size) return new Set();
    const s = new Set();
    for (const sc of QUIZZABLE) {
      if ([...mods].every((m) => sc.keys.includes(m))) {
        for (const k of sc.keys) if (!MODS.includes(k) && k !== 'PREFIX') s.add(k);
      }
    }
    return s;
  }, [mods]);

  return (
    <div className="sk-page">
      <SkBar title="Explore by Key" back={back} />
      <p className="sk-hint-text">Select modifiers to see every binding that uses them — this teaches the patterns behind Omarchy, not just isolated commands.</p>
      <div className="sk-chip-row">
        {MODS.map((m) => <button key={m} className={'sk-chip' + (mods.has(m) ? ' on' : '')} onClick={() => toggleMod(m)}>{keyLabel(m)}</button>)}
      </div>

      <div className="sk-keymap">
        {MAP_ROWS.map((row, i) => (
          <div className="sk-keymap-row" key={i}>
            {row.map((k) => (
              <button
                key={k}
                className={'sk-keymap-key' + (activeKeys.has(k) ? ' active' : '') + (keyFocus === k ? ' focused' : '')}
                disabled={!activeKeys.has(k)}
                onClick={() => setKeyFocus((f) => (f === k ? null : k))}
              >
                {k}
              </button>
            ))}
          </div>
        ))}
      </div>

      {!mods.size && !keyFocus && <div className="sk-empty">Pick at least one modifier to start exploring.</div>}
      <div className="sk-list">
        {matches.map((sc) => (
          <ShortcutRow key={sc.id} sc={sc} entry={engine.getEntry(progress, sc.id)} onFavorite={() => favorite(sc.id)} onClick={() => {}} />
        ))}
      </div>
    </div>
  );
}
