// ui/src/ShortcutKeycap.jsx
// Shared visual pieces for the shortcut trainer: a single physical-looking
// keycap, a full combo made of them, and the on-screen keyboard used for
// touch training when there's no physical keyboard to press.

const LABELS = {
  SUPER: 'Super', CTRL: 'Ctrl', ALT: 'Alt', SHIFT: 'Shift', PREFIX: 'Prefix',
  SPACE: 'Space', RETURN: 'Return', TAB: 'Tab', ESCAPE: 'Esc', BACKSPACE: 'Backspace',
  CAPSLOCK: 'CapsLock', GRAVE: '`', MINUS: '-', EQUAL: '=', SLASH: '/', COMMA: ',',
  PERIOD: '.', COLON: ';', LEFTBRACKET: '[', RIGHTBRACKET: ']',
  HOME: 'Home', END: 'End', PAGEUP: 'PgUp', PAGEDOWN: 'PgDn', DELETE: 'Del',
  ARROW: '↔', UP: '↑', DOWN: '↓', LEFT: '←', RIGHT: '→',
  PRINTSCREEN: 'PrtScn', MOUSE_LEFT: 'Left Click', MOUSE_RIGHT: 'Right Click', MOUSE_SCROLL: 'Scroll',
  BRIGHTNESS_UP: 'Brightness ↑', BRIGHTNESS_DOWN: 'Brightness ↓',
  VOLUME_UP: 'Volume ↑', VOLUME_DOWN: 'Volume ↓',
  KB_BACKLIGHT_UP: 'KB Light ↑', KB_BACKLIGHT_DOWN: 'KB Light ↓', KB_BACKLIGHT: 'KB Light',
  PLAY: 'Play/Pause', MUTE: 'Mute',
};

export function keyLabel(token) {
  return LABELS[token] || token;
}

export function Keycap({ token, size = 'md' }) {
  return <kbd className={`sk-key sk-key-${size}`}>{keyLabel(token)}</kbd>;
}

export function KeyCombo({ keys, sequence = false, size = 'md' }) {
  const sep = sequence ? '→' : '+';
  return (
    <div className={`sk-combo sk-combo-${size}`}>
      {keys.map((k, i) => (
        <span className="sk-combo-item" key={k + i}>
          {i > 0 && <span className="sk-sep">{sep}</span>}
          <Keycap token={k} size={size} />
        </span>
      ))}
    </div>
  );
}

const MOD_ROW = ['SUPER', 'CTRL', 'ALT', 'SHIFT'];
const DIGIT_ROW = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
const LETTER_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
];
const SPECIAL_ROW = ['SPACE', 'RETURN', 'TAB', 'ESCAPE', 'BACKSPACE'];
const PUNCT_ROW = ['MINUS', 'EQUAL', 'SLASH', 'COMMA', 'PERIOD', 'GRAVE', 'LEFTBRACKET', 'RIGHTBRACKET', 'COLON'];
const ARROW_ROW = ['LEFT', 'UP', 'DOWN', 'RIGHT'];

// Modifiers stay held across taps until Submit — mirrors how a physical
// modifier key works, and is what makes the "Tap SUPER, Tap SHIFT, Tap F"
// flow from the spec actually feel like pressing a combo instead of
// picking from a menu.
export function VirtualKeyboard({ heldMods, onToggleMod, onKey, onSubmit, onClear, canSubmit }) {
  return (
    <div className="sk-vkb">
      <div className="sk-vkb-row sk-vkb-mods">
        {MOD_ROW.map((m) => (
          <button key={m} className={'sk-vkey sk-vkey-mod' + (heldMods.has(m) ? ' held' : '')} onClick={() => onToggleMod(m)}>
            {keyLabel(m)}
          </button>
        ))}
      </div>
      <div className="sk-vkb-row">{DIGIT_ROW.map((k) => <button key={k} className="sk-vkey" onClick={() => onKey(k)}>{k}</button>)}</div>
      {LETTER_ROWS.map((row, i) => (
        <div className="sk-vkb-row" key={i}>{row.map((k) => <button key={k} className="sk-vkey" onClick={() => onKey(k)}>{k}</button>)}</div>
      ))}
      <div className="sk-vkb-row sk-vkb-wrap">{PUNCT_ROW.map((k) => <button key={k} className="sk-vkey sk-vkey-wide" onClick={() => onKey(k)}>{keyLabel(k)}</button>)}</div>
      <div className="sk-vkb-row">
        {ARROW_ROW.map((k) => <button key={k} className="sk-vkey" onClick={() => onKey(k)}>{keyLabel(k)}</button>)}
        {SPECIAL_ROW.map((k) => <button key={k} className="sk-vkey sk-vkey-wide" onClick={() => onKey(k)}>{keyLabel(k)}</button>)}
      </div>
      <div className="sk-vkb-actions">
        <button className="sk-vkb-clear" onClick={onClear}>Clear</button>
        <button className="sk-vkb-submit" disabled={!canSubmit} onClick={onSubmit}>Submit</button>
      </div>
    </div>
  );
}
