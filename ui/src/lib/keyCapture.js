// ui/src/lib/keyCapture.js
// Normalizes real KeyboardEvents into the same canonical key-token
// vocabulary the shortcut dataset uses (see ui/src/data/omarchyShortcuts.js),
// and provides the live "what's currently held down" hook the trainer uses
// for physical-keyboard practice. Kept separate from any UI so it can be
// reused by a future non-Omarchy course without dragging React screens in.

const CODE_MAP = {
  MetaLeft: 'SUPER', MetaRight: 'SUPER', OSLeft: 'SUPER', OSRight: 'SUPER',
  ControlLeft: 'CTRL', ControlRight: 'CTRL',
  AltLeft: 'ALT', AltRight: 'ALT',
  ShiftLeft: 'SHIFT', ShiftRight: 'SHIFT',
  Space: 'SPACE', Enter: 'RETURN', NumpadEnter: 'RETURN', Tab: 'TAB', Escape: 'ESCAPE',
  Backspace: 'BACKSPACE', CapsLock: 'CAPSLOCK',
  // Specific directions, not a generic ARROW — the dataset has both
  // direction-specific combos (Super+Ctrl+Left) and generic ones
  // (Super+Arrow, meaning "any arrow"); matchesCombo below reconciles them.
  ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT',
  Minus: 'MINUS', Equal: 'EQUAL', Slash: 'SLASH', Comma: 'COMMA', Period: 'PERIOD',
  Backquote: 'GRAVE', Semicolon: 'COLON',
  BracketLeft: 'LEFTBRACKET', BracketRight: 'RIGHTBRACKET',
  Home: 'HOME', End: 'END', PageUp: 'PAGEUP', PageDown: 'PAGEDOWN', Delete: 'DELETE',
  PrintScreen: 'PRINTSCREEN',
  F9: 'F9',
};
const DIRECTIONS = ['UP', 'DOWN', 'LEFT', 'RIGHT'];

export function tokenFromEvent(e) {
  if (CODE_MAP[e.code]) return CODE_MAP[e.code];
  if (/^Digit[0-9]$/.test(e.code)) return e.code.slice(5);
  if (/^Key[A-Z]$/.test(e.code)) return e.code.slice(3);
  if (/^F[0-9]{1,2}$/.test(e.code)) return e.code;
  return null;
}

const MODIFIERS = ['SUPER', 'CTRL', 'ALT', 'SHIFT'];
export function isModifier(token) { return MODIFIERS.includes(token); }

// Shortcuts a browser tab can never safely or reliably intercept: mouse
// combos, hardware-only media/brightness/backlight keys, multi-step
// sequences (CapsLock leader chords), and Ctrl+Alt+Delete (the one
// combination every OS reserves for itself before it ever reaches a page).
export function isLiveDetectable(sc) {
  if (sc.type === 'command' || sc.sequence) return false;
  if (sc.device === 'mouse' || sc.device === 'hardware') return false;
  const k = sc.keys;
  if (k.includes('CTRL') && k.includes('ALT') && k.includes('DELETE')) return false;
  if (k.includes('PREFIX')) return false; // tmux prefix means "inside a terminal", not this page
  return true;
}

// Order-independent match. ARROW in the dataset matches any of the 4
// direction tokens a real arrow press produces; a dataset entry with a
// specific direction (LEFT/RIGHT/UP/DOWN) requires that exact one.
export function matchesCombo(pressedSet, keys) {
  if (pressedSet.size !== keys.length) return false;
  const wantsAnyArrow = keys.includes('ARROW');
  for (const k of keys) {
    if (k === 'ARROW') continue;
    if (!pressedSet.has(k)) return false;
  }
  const pressedDirection = DIRECTIONS.some((d) => pressedSet.has(d));
  if (wantsAnyArrow && !pressedDirection) return false;
  if (!wantsAnyArrow && pressedDirection) return false;
  return true;
}

// Live hook: tracks the currently-held key set for as long as the returned
// `active` ref is true, calling onChange with the live set on every change
// and onComplete once all keys are released (so "did they get it right" is
// judged against the fullest combination they held, not whatever's left
// after the first key lifts).
import { useEffect, useRef, useState } from 'react';

export function useKeyCombo({ enabled = true } = {}) {
  const [pressed, setPressed] = useState(new Set());
  const heldRef = useRef(new Set());
  const maxRef = useRef(new Set());

  useEffect(() => {
    if (!enabled) return;
    function onKeyDown(e) {
      const tok = tokenFromEvent(e);
      if (!tok) return;
      // Only prevent default for combos this trainer can plausibly be
      // testing (a modifier is down) — never swallow plain typing, and
      // never touch Ctrl+Alt+Delete, which the OS owns anyway.
      if ((e.metaKey || e.ctrlKey || e.altKey) && !(e.ctrlKey && e.altKey && tok === 'DELETE')) {
        e.preventDefault();
      }
      heldRef.current.add(tok);
      maxRef.current = new Set(heldRef.current);
      setPressed(new Set(maxRef.current));
    }
    function onKeyUp(e) {
      const tok = tokenFromEvent(e);
      if (!tok) return;
      heldRef.current.delete(tok);
      if (heldRef.current.size === 0) {
        // Everything released — report the fullest combo that was held,
        // then clear for the next attempt.
        const finalCombo = maxRef.current;
        maxRef.current = new Set();
        setPressed(new Set());
        window.dispatchEvent(new CustomEvent('tw-combo-complete', { detail: finalCombo }));
      } else {
        setPressed(new Set(heldRef.current));
      }
    }
    function onBlur() {
      heldRef.current = new Set();
      maxRef.current = new Set();
      setPressed(new Set());
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [enabled]);

  return pressed;
}

// Convenience hook: fires onComplete(comboSet) once per fully-released combo.
export function useKeyComboComplete(onComplete, deps = []) {
  useEffect(() => {
    function handler(e) { onComplete(e.detail); }
    window.addEventListener('tw-combo-complete', handler);
    return () => window.removeEventListener('tw-combo-complete', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
