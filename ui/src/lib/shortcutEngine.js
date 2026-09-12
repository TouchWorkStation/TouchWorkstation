// ui/src/lib/shortcutEngine.js
// Local, account-free progress tracking + spaced-repetition selection for
// the shortcut trainer. Pure JS (no React) so it can back a future
// Tmux/Neovim/Git course too — see ui/src/ShortcutTrainer.jsx for the UI
// that calls into this.
//
// Everything lives in localStorage under one key. A phone browser's storage
// is already private per-origin and never leaves the device, which is
// exactly the "no account required" the feature asks for.

const STORAGE_KEY = 'tw-omarchy-shortcuts-progress-v1';

const MASTERED_AT = 80;
const CORRECT_DELTA = 10;
const INCORRECT_DELTA = -5;
const STREAK_BONUS = 5; // extra boost once a streak of 3+ correct answers is reached

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

function blankEntry() {
  return {
    timesViewed: 0,
    timesAttempted: 0,
    timesCorrect: 0,
    timesIncorrect: 0,
    lastPracticed: null,
    masteryScore: 0,
    favorite: false,
    streak: 0,
  };
}

export function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function save(map) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(map)); } catch { /* private mode, quota, etc — training still works this session */ }
}

export function getEntry(map, id) {
  return map[id] || blankEntry();
}

export function recordView(map, id) {
  const next = { ...map, [id]: { ...getEntry(map, id) } };
  next[id].timesViewed += 1;
  save(next);
  return next;
}

export function recordAttempt(map, id, correct) {
  const next = { ...map, [id]: { ...getEntry(map, id) } };
  const e = next[id];
  e.timesAttempted += 1;
  e.lastPracticed = new Date().toISOString();
  if (correct) {
    e.timesCorrect += 1;
    e.streak += 1;
    let delta = CORRECT_DELTA;
    if (e.streak >= 3) delta += STREAK_BONUS;
    e.masteryScore = clamp(e.masteryScore + delta, 0, 100);
  } else {
    e.timesIncorrect += 1;
    e.streak = 0;
    e.masteryScore = clamp(e.masteryScore + INCORRECT_DELTA, 0, 100);
  }
  save(next);
  return next;
}

export function toggleFavorite(map, id) {
  const next = { ...map, [id]: { ...getEntry(map, id) } };
  next[id].favorite = !next[id].favorite;
  save(next);
  return next;
}

export function masteryState(entry) {
  if (!entry || entry.timesAttempted === 0) return 'new';
  if (entry.masteryScore >= MASTERED_AT) return 'mastered';
  if (entry.masteryScore >= 40) return 'familiar';
  return 'learning';
}

export const MASTERY_LABEL = { new: 'New', learning: 'Learning', familiar: 'Familiar', mastered: 'Mastered' };

export function overallMastery(dataset, map) {
  const quizzable = dataset.filter((sc) => sc.type !== 'command');
  if (!quizzable.length) return 0;
  const total = quizzable.reduce((sum, sc) => sum + getEntry(map, sc.id).masteryScore, 0);
  return Math.round(total / (quizzable.length * 100) * 100);
}

export function categoryProgress(dataset, map, category) {
  const items = dataset.filter((sc) => sc.category === category && sc.type !== 'command');
  const learned = items.filter((sc) => masteryState(getEntry(map, sc.id)) === 'mastered').length;
  return { learned, total: items.length };
}

// Spaced-repetition-ish weighting: never-trained shortcuts and low-mastery
// shortcuts are far more likely to be picked than mastered ones, and a
// shortcut that hasn't been touched in a while creeps back up in priority
// even after it was doing fine. No timers, no API — just a weighted
// random draw recomputed against current localStorage state each call.
function weight(entry) {
  if (entry.timesAttempted === 0) return 100;
  const masteryGap = 100 - entry.masteryScore; // 0 (mastered) .. 100 (untouched-ish)
  let staleness = 0;
  if (entry.lastPracticed) {
    const days = (Date.now() - new Date(entry.lastPracticed).getTime()) / 86400000;
    staleness = clamp(days * 4, 0, 40); // caps out after ~10 days
  }
  return clamp(masteryGap + staleness, 5, 140); // even mastered items stay pickable, just rarely
}

function weightedSample(items, map, count, exclude = new Set()) {
  const pool = items.filter((sc) => !exclude.has(sc.id)).map((sc) => ({ sc, w: weight(getEntry(map, sc.id)) }));
  const picked = [];
  while (picked.length < count && pool.length) {
    const total = pool.reduce((sum, p) => sum + p.w, 0);
    let r = Math.random() * total;
    let idx = 0;
    for (; idx < pool.length; idx++) { r -= pool[idx].w; if (r <= 0) break; }
    idx = Math.min(idx, pool.length - 1);
    picked.push(pool[idx].sc);
    pool.splice(idx, 1);
  }
  return picked;
}

// Builds a training queue from `dataset` (already filtered by
// category/difficulty by the caller), prioritizing by the weighting above.
export function buildQueue(dataset, map, count = 20, exclude = new Set()) {
  const quizzable = dataset.filter((sc) => sc.type !== 'command');
  return weightedSample(quizzable, map, Math.min(count, quizzable.length), exclude);
}

// One adaptively-picked shortcut, optionally avoiding a specific id (so
// "practice indefinitely" never immediately repeats the item you just saw).
export function pickOne(dataset, map, excludeId) {
  const exclude = excludeId ? new Set([excludeId]) : new Set();
  return buildQueue(dataset, map, 1, exclude)[0] || null;
}

// Daily 5: deterministic per calendar day (so refreshing the page during
// the same day doesn't reshuffle it), favoring never-trained, frequently
// missed, and not-recently-practiced shortcuts — exactly the "build actual
// muscle memory" ask, just seeded by the date instead of Math.random().
export function dailyFive(dataset, map) {
  const quizzable = dataset.filter((sc) => sc.type !== 'command');
  const dayKey = new Date().toISOString().slice(0, 10);
  let seed = 0;
  for (let i = 0; i < dayKey.length; i++) seed = (seed * 31 + dayKey.charCodeAt(i)) >>> 0;
  const rand = mulberry32(seed);
  const scored = quizzable.map((sc) => {
    const e = getEntry(map, sc.id);
    const missRate = e.timesAttempted ? e.timesIncorrect / e.timesAttempted : 0.5;
    let priority = weight(e) + missRate * 30 + rand() * 10;
    return { sc, priority };
  });
  scored.sort((a, b) => b.priority - a.priority);
  return scored.slice(0, 5).map((x) => x.sc);
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickDistractors(dataset, correct, count = 3) {
  const pool = dataset.filter((sc) => sc.id !== correct.id && sc.type !== 'command' && sc.category === correct.category);
  const fallback = dataset.filter((sc) => sc.id !== correct.id && sc.type !== 'command');
  const source = pool.length >= count ? pool : fallback;
  const shuffled = [...source].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}
