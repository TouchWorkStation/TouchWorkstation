// ui/src/data/omarchyShortcuts.js
// Structured shortcut data for the Omarchy Desktop Shortcuts trainer —
// deliberately kept as plain data, not scattered across UI components, so
// the training engine (ui/src/lib/shortcutEngine.js) stays reusable for a
// future Tmux/Neovim/Git/etc course, with Omarchy as the first one.
//
// Field shape: { id, category, keys, action, description, difficulty,
// aliases, source, essential?, sequence?, device?, type?, command? }
//
// `keys` is an ordered array of canonical key tokens (see
// ui/src/lib/keyCapture.js for the same vocabulary used to interpret real
// keyboard/pointer events): SUPER, CTRL, ALT, SHIFT, single characters,
// ARROW (any arrow key — several bindings apply to "an arrow" generically
// rather than 4 separate bindings), and named specials (RETURN, SPACE,
// TAB, ESCAPE, BACKSPACE, GRAVE, MINUS, EQUAL, SLASH, COMMA, PERIOD,
// PRINTSCREEN, MOUSE_LEFT, MOUSE_RIGHT, MOUSE_SCROLL, and the hardware/media
// keys that only exist on a physical keyboard).
//
// `type: 'command'` entries (the Tmux dev-layout commands) aren't keyboard
// shortcuts at all — they're excluded from every quiz/practice pool unless
// "Command Training" is explicitly selected for that category.

export const CATEGORIES = [
  'Help',
  'Navigation',
  'Window Management',
  'Workspaces',
  'System',
  'Applications',
  'Clipboard',
  'Capture',
  'Notifications',
  'Appearance',
  'Toggles',
  'Reminders',
  'System Notices',
  'Tmux',
  'Ghostty',
  'File Manager',
  'Neovim',
  'Quick Emojis',
  'Quick Completions',
];

const SRC = 'Omarchy Official Hotkeys Manual';

let n = 0;
const nextId = (prefix) => `${prefix}-${(++n).toString(36)}`;

function s(partial) {
  return { source: SRC, difficulty: 'intermediate', aliases: [], keys: [], ...partial, id: partial.id || nextId(partial.category.toLowerCase().replace(/\s+/g, '-')) };
}

export const SHORTCUTS = [
  // ---------------------------- Core Help ----------------------------
  s({ category: 'Help', keys: ['SUPER', 'K'], action: 'Show keyboard bindings', description: 'Show primary Omarchy keyboard bindings.', difficulty: 'beginner', aliases: ['help', 'keybindings', 'cheat sheet'] }),
  s({ category: 'Help', keys: ['SUPER', 'ALT', 'K'], action: 'Show Tmux bindings', description: 'Show Tmux bindings.', difficulty: 'intermediate', aliases: ['tmux help'] }),
  s({ category: 'Help', keys: ['SUPER', 'CTRL', 'K'], action: 'Show Herdr bindings', description: 'Show Herdr bindings.', difficulty: 'intermediate', aliases: ['herdr', 'agent help'] }),

  // ------------------------------ Navigation ------------------------------
  s({ category: 'Navigation', keys: ['SUPER', 'SPACE'], action: 'Open Omarchy menu', description: 'Open the main Omarchy launcher/menu.', difficulty: 'beginner', essential: true, aliases: ['launcher', 'menu'] }),
  s({ category: 'Navigation', keys: ['SUPER', 'ALT', 'SPACE'], action: 'Open app launcher', description: 'Open the application launcher.', difficulty: 'beginner', aliases: ['app launcher', 'run'] }),
  s({ category: 'Navigation', keys: ['SUPER', 'ESCAPE'], action: 'Open session controls', description: 'Open system/session controls.', difficulty: 'beginner', aliases: ['power menu', 'session'] }),
  s({ category: 'Navigation', keys: ['SUPER', 'CTRL', 'L'], action: 'Lock the computer', description: 'Lock the computer.', difficulty: 'beginner', aliases: ['lock', 'lock screen'] }),

  // -------------------------- Window Management ---------------------------
  s({ category: 'Window Management', keys: ['SUPER', 'W'], action: 'Close active window', description: 'Close the active window.', difficulty: 'beginner', essential: true, aliases: ['close'] }),
  s({ category: 'Window Management', keys: ['SUPER', 'Q'], action: 'Close active window', description: 'Close the active window.', difficulty: 'beginner', aliases: ['close'] }),
  s({ category: 'Window Management', keys: ['CTRL', 'ALT', 'DELETE'], action: 'Close all open windows', description: 'Close all open windows.', difficulty: 'intermediate', device: 'keyboard', aliases: ['close all'] }),
  s({ category: 'Window Management', keys: ['SUPER', 'T'], action: 'Toggle tiled / floating', description: "Switch the active window between tiled and floating modes.", difficulty: 'intermediate', aliases: ['float', 'tile'] }),
  s({ category: 'Window Management', keys: ['SUPER', 'J'], action: 'Change tiling orientation', description: "Change the active window's tiling orientation.", difficulty: 'intermediate', aliases: ['split direction'] }),
  s({ category: 'Window Management', keys: ['SUPER', 'O'], action: 'Toggle sticky / floating', description: 'Make the window sticky/floating or return it.', difficulty: 'intermediate', aliases: ['sticky'] }),
  s({ category: 'Window Management', keys: ['SUPER', 'L'], action: 'Toggle layout mode', description: 'Switch between dwindle and scrolling layouts.', difficulty: 'intermediate', aliases: ['layout'] }),
  s({ category: 'Window Management', keys: ['SUPER', 'P'], action: 'Toggle pseudo-tiling', description: 'Toggle pseudo-window sizing behavior.', difficulty: 'advanced', aliases: ['pseudo'] }),
  s({ category: 'Window Management', keys: ['SUPER', 'F'], action: 'Fullscreen window', description: 'Fullscreen the active window.', difficulty: 'beginner', essential: true, aliases: ['fullscreen', 'maximize'] }),
  s({ category: 'Window Management', keys: ['SUPER', 'ALT', 'F'], action: 'Fullscreen width', description: 'Expand the active window to full width.', difficulty: 'intermediate', aliases: ['full width'] }),
  s({ category: 'Window Management', keys: ['SUPER', 'CTRL', 'F'], action: 'Fullscreen content', description: 'Fullscreen content within the window.', difficulty: 'intermediate', aliases: ['fullscreen content'] }),
  // Window focus / position
  s({ category: 'Window Management', keys: ['SUPER', 'ARROW'], action: 'Focus neighboring window', description: 'Focus the neighboring window in the arrow direction.', difficulty: 'beginner', essential: true, aliases: ['focus'] }),
  s({ category: 'Window Management', keys: ['SUPER', 'SHIFT', 'ARROW'], action: 'Swap with neighboring window', description: 'Swap the active window with the neighboring window.', difficulty: 'beginner', essential: true, aliases: ['swap'] }),
  s({ category: 'Window Management', keys: ['SUPER', 'MINUS'], action: 'Grow window (left)', description: 'Grow the window toward the left.', difficulty: 'intermediate', aliases: ['resize'] }),
  s({ category: 'Window Management', keys: ['SUPER', 'EQUAL'], action: 'Shrink window (left)', description: 'Shrink the window from the left.', difficulty: 'intermediate', aliases: ['resize'] }),
  s({ category: 'Window Management', keys: ['SUPER', 'SHIFT', 'MINUS'], action: 'Shrink window upward', description: 'Shrink window upward.', difficulty: 'intermediate', aliases: ['resize'] }),
  s({ category: 'Window Management', keys: ['SUPER', 'SHIFT', 'EQUAL'], action: 'Expand window downward', description: 'Expand window downward.', difficulty: 'intermediate', aliases: ['resize'] }),
  s({ category: 'Window Management', keys: ['SUPER', 'ALT', 'MINUS'], action: 'Resize (fine step)', description: 'Perform smaller-step resizing.', difficulty: 'advanced', aliases: ['resize'] }),
  s({ category: 'Window Management', keys: ['SUPER', 'ALT', 'EQUAL'], action: 'Resize (fine step)', description: 'Perform smaller-step resizing.', difficulty: 'advanced', aliases: ['resize'] }),
  s({ category: 'Window Management', keys: ['SUPER', 'CTRL', 'MINUS'], action: 'Resize (large step)', description: 'Perform larger-step resizing.', difficulty: 'advanced', aliases: ['resize'] }),
  s({ category: 'Window Management', keys: ['SUPER', 'CTRL', 'EQUAL'], action: 'Resize (large step)', description: 'Perform larger-step resizing.', difficulty: 'advanced', aliases: ['resize'] }),
  s({ category: 'Window Management', keys: ['SUPER', 'ALT', 'HOME'], action: 'Remember window width', description: 'Remember the current window width.', difficulty: 'advanced', aliases: ['remember width'] }),
  s({ category: 'Window Management', keys: ['SUPER', 'HOME'], action: 'Restore window width', description: 'Restore the previously remembered width.', difficulty: 'advanced', aliases: ['restore width'] }),
  s({ category: 'Window Management', keys: ['SUPER', 'MOUSE_LEFT'], action: 'Drag a window', description: 'Drag a window.', difficulty: 'intermediate', device: 'mouse', aliases: ['drag'] }),
  s({ category: 'Window Management', keys: ['SUPER', 'MOUSE_RIGHT'], action: 'Resize a window', description: 'Resize a window.', difficulty: 'intermediate', device: 'mouse', aliases: ['resize'] }),
  s({ category: 'Window Management', keys: ['SUPER', 'MOUSE_SCROLL'], action: 'Cycle workspaces', description: 'Cycle through workspaces.', difficulty: 'intermediate', device: 'mouse', aliases: ['scroll workspaces'] }),
  // Window groups
  s({ category: 'Window Management', keys: ['SUPER', 'G'], action: 'Toggle window grouping', description: 'Toggle window grouping.', difficulty: 'advanced', aliases: ['group'] }),
  s({ category: 'Window Management', keys: ['SUPER', 'ALT', 'G'], action: 'Remove from group', description: 'Remove the current window from its group.', difficulty: 'advanced', aliases: ['ungroup'] }),
  s({ category: 'Window Management', keys: ['SUPER', 'ALT', 'TAB'], action: 'Next grouped window', description: 'Move forward through grouped windows.', difficulty: 'advanced', aliases: ['group next'] }),
  s({ category: 'Window Management', keys: ['SUPER', 'ALT', 'SHIFT', 'TAB'], action: 'Previous grouped window', description: 'Move backward through grouped windows.', difficulty: 'advanced', aliases: ['group previous'] }),
  s({ category: 'Window Management', keys: ['SUPER', 'ALT', '1'], action: 'Select grouped window 1', description: 'Select grouped window 1.', difficulty: 'advanced' }),
  s({ category: 'Window Management', keys: ['SUPER', 'ALT', '2'], action: 'Select grouped window 2', description: 'Select grouped window 2.', difficulty: 'advanced' }),
  s({ category: 'Window Management', keys: ['SUPER', 'ALT', '3'], action: 'Select grouped window 3', description: 'Select grouped window 3.', difficulty: 'advanced' }),
  s({ category: 'Window Management', keys: ['SUPER', 'ALT', '4'], action: 'Select grouped window 4', description: 'Select grouped window 4.', difficulty: 'advanced' }),
  s({ category: 'Window Management', keys: ['SUPER', 'ALT', '5'], action: 'Select grouped window 5', description: 'Select grouped window 5.', difficulty: 'advanced' }),
  s({ category: 'Window Management', keys: ['SUPER', 'ALT', 'ARROW'], action: 'Move window into neighboring group', description: 'Move a window into a neighboring group.', difficulty: 'advanced' }),
  s({ category: 'Window Management', keys: ['SUPER', 'CTRL', 'LEFT'], action: 'Move left within tiled group', description: 'Move left within a tiled window group.', difficulty: 'advanced' }),
  s({ category: 'Window Management', keys: ['SUPER', 'CTRL', 'RIGHT'], action: 'Move right within tiled group', description: 'Move right within a tiled window group.', difficulty: 'advanced' }),
  // Display / window cycling
  s({ category: 'Window Management', keys: ['SUPER', 'CTRL', 'Z'], action: 'Zoom desktop in', description: 'Zoom the desktop in.', difficulty: 'advanced', aliases: ['zoom'] }),
  s({ category: 'Window Management', keys: ['SUPER', 'CTRL', 'ALT', 'Z'], action: 'Reset desktop zoom', description: 'Reset desktop zoom.', difficulty: 'advanced', aliases: ['zoom reset'] }),
  s({ category: 'Window Management', keys: ['SUPER', 'SLASH'], action: 'Next monitor scaling', description: 'Advance to the next monitor scaling option.', difficulty: 'advanced', aliases: ['scaling'] }),
  s({ category: 'Window Management', keys: ['SUPER', 'ALT', 'SLASH'], action: 'Previous monitor scaling', description: 'Move backward through monitor scaling options.', difficulty: 'advanced', aliases: ['scaling'] }),
  s({ category: 'Window Management', keys: ['ALT', 'TAB'], action: 'Cycle windows forward', description: 'Cycle forward through windows in the active workspace.', difficulty: 'beginner', aliases: ['alt tab', 'switcher'] }),
  s({ category: 'Window Management', keys: ['ALT', 'SHIFT', 'TAB'], action: 'Cycle windows backward', description: 'Cycle backward through windows in the active workspace.', difficulty: 'beginner', aliases: ['alt tab', 'switcher'] }),
  s({ category: 'Window Management', keys: ['CTRL', 'ALT', 'TAB'], action: 'Focus next monitor', description: 'Move focus forward between monitors.', difficulty: 'advanced', aliases: ['monitor focus'] }),
  s({ category: 'Window Management', keys: ['CTRL', 'ALT', 'SHIFT', 'TAB'], action: 'Focus previous monitor', description: 'Move focus backward between monitors.', difficulty: 'advanced', aliases: ['monitor focus'] }),

  // -------------------------------- Workspaces --------------------------------
  s({ category: 'Workspaces', keys: ['SUPER', '1'], action: 'Go to workspace 1', description: 'Go to workspace 1.', difficulty: 'beginner', essential: true }),
  s({ category: 'Workspaces', keys: ['SUPER', '2'], action: 'Go to workspace 2', description: 'Go to workspace 2.', difficulty: 'beginner', essential: true }),
  s({ category: 'Workspaces', keys: ['SUPER', '3'], action: 'Go to workspace 3', description: 'Go to workspace 3.', difficulty: 'beginner' }),
  s({ category: 'Workspaces', keys: ['SUPER', '4'], action: 'Go to workspace 4', description: 'Go to workspace 4.', difficulty: 'beginner' }),
  s({ category: 'Workspaces', keys: ['SUPER', 'TAB'], action: 'Next workspace', description: 'Go to the next workspace.', difficulty: 'beginner', essential: true }),
  s({ category: 'Workspaces', keys: ['SUPER', 'SHIFT', 'TAB'], action: 'Previous workspace', description: 'Go to the previous workspace.', difficulty: 'intermediate' }),
  s({ category: 'Workspaces', keys: ['SUPER', 'CTRL', 'TAB'], action: 'Return to previous workspace', description: 'Return to the previously used workspace.', difficulty: 'intermediate' }),
  s({ category: 'Workspaces', keys: ['SUPER', 'SHIFT', '1'], action: 'Move window to workspace 1', description: 'Move active window to workspace 1 and follow it.', difficulty: 'intermediate' }),
  s({ category: 'Workspaces', keys: ['SUPER', 'SHIFT', '2'], action: 'Move window to workspace 2', description: 'Move active window to workspace 2 and follow it.', difficulty: 'intermediate' }),
  s({ category: 'Workspaces', keys: ['SUPER', 'SHIFT', '3'], action: 'Move window to workspace 3', description: 'Move active window to workspace 3 and follow it.', difficulty: 'intermediate' }),
  s({ category: 'Workspaces', keys: ['SUPER', 'SHIFT', '4'], action: 'Move window to workspace 4', description: 'Move active window to workspace 4 and follow it.', difficulty: 'intermediate' }),
  s({ category: 'Workspaces', keys: ['SUPER', 'SHIFT', 'ALT', '1'], action: 'Send window to workspace 1', description: 'Send window to workspace 1 without switching there.', difficulty: 'intermediate' }),
  s({ category: 'Workspaces', keys: ['SUPER', 'SHIFT', 'ALT', '2'], action: 'Send window to workspace 2', description: 'Send window to workspace 2 without switching there.', difficulty: 'intermediate' }),
  s({ category: 'Workspaces', keys: ['SUPER', 'SHIFT', 'ALT', '3'], action: 'Send window to workspace 3', description: 'Send window to workspace 3 without switching there.', difficulty: 'intermediate' }),
  s({ category: 'Workspaces', keys: ['SUPER', 'SHIFT', 'ALT', '4'], action: 'Send window to workspace 4', description: 'Send window to workspace 4 without switching there.', difficulty: 'intermediate' }),
  s({ category: 'Workspaces', keys: ['SUPER', 'S'], action: 'Toggle scratchpad', description: 'Show or hide scratchpad.', difficulty: 'intermediate', aliases: ['scratchpad'] }),
  s({ category: 'Workspaces', keys: ['SUPER', 'GRAVE'], action: 'Toggle scratchpad', description: 'Show or hide scratchpad.', difficulty: 'intermediate', aliases: ['scratchpad'] }),
  s({ category: 'Workspaces', keys: ['SUPER', 'ALT', 'S'], action: 'Send window to scratchpad', description: 'Send active window to scratchpad.', difficulty: 'intermediate', aliases: ['scratchpad'] }),
  s({ category: 'Workspaces', keys: ['SUPER', 'SHIFT', 'GRAVE'], action: 'Send window to scratchpad', description: 'Send active window to scratchpad.', difficulty: 'intermediate', aliases: ['scratchpad'] }),
  s({ category: 'Workspaces', keys: ['SUPER', 'SHIFT', 'ALT', 'ARROW'], action: 'Send workspace to monitor', description: 'Send workspace toward the monitor in that direction.', difficulty: 'advanced', aliases: ['monitor'] }),

  // -------------------------------- System --------------------------------
  s({ category: 'System', keys: ['SUPER', 'CTRL', 'A'], action: 'Audio controls', description: 'Open audio controls.', difficulty: 'intermediate', aliases: ['audio', 'sound'] }),
  s({ category: 'System', keys: ['SUPER', 'CTRL', 'B'], action: 'Bluetooth controls', description: 'Open Bluetooth controls.', difficulty: 'intermediate', aliases: ['bluetooth'] }),
  s({ category: 'System', keys: ['SUPER', 'CTRL', 'W'], action: 'Wi-Fi / network controls', description: 'Open Wi-Fi/network controls.', difficulty: 'intermediate', aliases: ['wifi', 'network'] }),
  s({ category: 'System', keys: ['SUPER', 'CTRL', 'D'], action: 'Display controls', description: 'Open display controls.', difficulty: 'intermediate', aliases: ['display', 'monitor'] }),
  s({ category: 'System', keys: ['SUPER', 'CTRL', 'P'], action: 'Power controls', description: 'Open power controls.', difficulty: 'intermediate', aliases: ['power'] }),
  s({ category: 'System', keys: ['SUPER', 'CTRL', 'ALT', 'D'], action: 'Calendar controls', description: 'Open calendar controls.', difficulty: 'intermediate', aliases: ['calendar'] }),
  s({ category: 'System', keys: ['SUPER', 'CTRL', '1'], action: 'Toggle bar panel 1', description: 'Toggle the corresponding bar panel.', difficulty: 'intermediate', aliases: ['bar panel'] }),
  s({ category: 'System', keys: ['SUPER', 'CTRL', '2'], action: 'Toggle bar panel 2', description: 'Toggle the corresponding bar panel.', difficulty: 'intermediate', aliases: ['bar panel'] }),
  s({ category: 'System', keys: ['SUPER', 'CTRL', '3'], action: 'Toggle bar panel 3', description: 'Toggle the corresponding bar panel.', difficulty: 'intermediate', aliases: ['bar panel'] }),
  s({ category: 'System', keys: ['SUPER', 'CTRL', 'S'], action: 'Share via LocalSend', description: 'Open sharing through LocalSend.', difficulty: 'intermediate', aliases: ['localsend', 'share'] }),
  s({ category: 'System', keys: ['SUPER', 'CTRL', 'T'], action: 'System monitor (btop)', description: 'Open system activity monitoring/btop.', difficulty: 'intermediate', aliases: ['btop', 'monitor', 'activity'] }),
  s({ category: 'System', keys: ['SUPER', 'CTRL', 'C'], action: 'Capture controls', description: 'Open capture controls.', difficulty: 'intermediate', aliases: ['capture', 'screenshot menu'] }),
  s({ category: 'System', keys: ['SUPER', 'CTRL', 'O'], action: 'Toggle the menu', description: 'Toggle the menu.', difficulty: 'intermediate' }),
  s({ category: 'System', keys: ['SUPER', 'CTRL', 'H'], action: 'Hardware controls', description: 'Open hardware controls.', difficulty: 'intermediate', aliases: ['hardware'] }),
  s({ category: 'System', keys: ['SUPER', 'CTRL', 'Q'], action: 'Calculator', description: 'Open calculator.', difficulty: 'intermediate', aliases: ['calc'] }),
  s({ category: 'System', keys: ['SUPER', 'CTRL', 'E'], action: 'Emoji picker', description: 'Open emoji picker.', difficulty: 'intermediate', aliases: ['emoji'] }),
  s({ category: 'System', keys: ['SUPER', 'CTRL', 'PERIOD'], action: 'Media transcoding', description: 'Open media transcoding.', difficulty: 'advanced', aliases: ['transcode'] }),
  s({ category: 'System', keys: ['SUPER', 'SHIFT', 'CTRL', 'A'], action: 'Choose AI agent', description: 'Choose an AI agent.', difficulty: 'intermediate', aliases: ['agent picker'] }),
  // Brightness / audio / media (hardware keys — not keyboard-capturable in a browser)
  s({ category: 'System', keys: ['SHIFT', 'BRIGHTNESS_UP'], action: 'Brightness to max', description: 'Immediately set screen brightness to maximum.', difficulty: 'intermediate', device: 'hardware' }),
  s({ category: 'System', keys: ['SHIFT', 'BRIGHTNESS_DOWN'], action: 'Brightness to min', description: 'Immediately set screen brightness to minimum.', difficulty: 'intermediate', device: 'hardware' }),
  s({ category: 'System', keys: ['ALT', 'BRIGHTNESS_UP'], action: 'Brightness up 1%', description: 'Increase brightness in fine 1% increments.', difficulty: 'intermediate', device: 'hardware' }),
  s({ category: 'System', keys: ['ALT', 'BRIGHTNESS_DOWN'], action: 'Brightness down 1%', description: 'Decrease brightness in fine 1% increments.', difficulty: 'intermediate', device: 'hardware' }),
  s({ category: 'System', keys: ['ALT', 'VOLUME_UP'], action: 'Volume up 1%', description: 'Increase volume by approximately 1%.', difficulty: 'intermediate', device: 'hardware' }),
  s({ category: 'System', keys: ['ALT', 'VOLUME_DOWN'], action: 'Volume down 1%', description: 'Decrease volume by approximately 1%.', difficulty: 'intermediate', device: 'hardware' }),
  s({ category: 'System', keys: ['KB_BACKLIGHT_UP'], action: 'Keyboard backlight up', description: 'Increase keyboard backlight.', difficulty: 'intermediate', device: 'hardware' }),
  s({ category: 'System', keys: ['KB_BACKLIGHT_DOWN'], action: 'Keyboard backlight down', description: 'Decrease keyboard backlight.', difficulty: 'intermediate', device: 'hardware' }),
  s({ category: 'System', keys: ['KB_BACKLIGHT'], action: 'Cycle keyboard backlight', description: 'Cycle available keyboard backlight levels.', difficulty: 'intermediate', device: 'hardware' }),
  s({ category: 'System', keys: ['ALT', 'PLAY'], action: 'Next track', description: 'Go to next media track.', difficulty: 'intermediate', device: 'hardware' }),
  s({ category: 'System', keys: ['ALT', 'SHIFT', 'PLAY'], action: 'Previous track', description: 'Go to previous media track.', difficulty: 'intermediate', device: 'hardware' }),

  // ------------------------------ Applications ------------------------------
  s({ category: 'Applications', keys: ['SUPER', 'RETURN'], action: 'Launch terminal', description: 'Launch terminal.', difficulty: 'beginner', essential: true, aliases: ['terminal'] }),
  s({ category: 'Applications', keys: ['SUPER', 'ALT', 'RETURN'], action: 'Launch Tmux terminal', description: 'Launch Tmux terminal.', difficulty: 'intermediate', aliases: ['tmux'] }),
  s({ category: 'Applications', keys: ['SUPER', 'CTRL', 'RETURN'], action: 'Launch Herdr', description: 'Launch Herdr agent manager.', difficulty: 'intermediate', aliases: ['herdr', 'agents'] }),
  s({ category: 'Applications', keys: ['SUPER', 'SHIFT', 'RETURN'], action: 'Launch browser', description: 'Launch browser.', difficulty: 'beginner', aliases: ['browser'] }),
  s({ category: 'Applications', keys: ['SUPER', 'SHIFT', 'ALT', 'B'], action: 'Launch private browser', description: 'Launch private/incognito browser.', difficulty: 'intermediate', aliases: ['incognito', 'private'] }),
  s({ category: 'Applications', keys: ['SUPER', 'SHIFT', 'F'], action: 'Launch file manager', description: 'Launch file manager.', difficulty: 'beginner', essential: true, aliases: ['files'] }),
  s({ category: 'Applications', keys: ['SUPER', 'SHIFT', 'ALT', 'F'], action: 'File manager at terminal cwd', description: "Launch file manager at the terminal's current directory.", difficulty: 'intermediate', aliases: ['files'] }),
  s({ category: 'Applications', keys: ['SUPER', 'SHIFT', 'M'], action: 'Launch music (Spotify)', description: 'Launch Spotify/music.', difficulty: 'intermediate', aliases: ['spotify', 'music'] }),
  s({ category: 'Applications', keys: ['SUPER', 'SHIFT', 'ALT', 'M'], action: 'Launch CLI music player', description: 'Launch CLI music player.', difficulty: 'intermediate', aliases: ['music'] }),
  s({ category: 'Applications', keys: ['SUPER', 'SHIFT', 'SLASH'], action: 'Launch 1Password', description: 'Launch 1Password.', difficulty: 'intermediate', aliases: ['1password', 'passwords'] }),
  s({ category: 'Applications', keys: ['SUPER', 'SHIFT', 'N'], action: 'Launch Neovim', description: 'Launch Neovim/editor.', difficulty: 'beginner', essential: true, aliases: ['neovim', 'editor'] }),
  s({ category: 'Applications', keys: ['SUPER', 'SHIFT', 'C'], action: 'Launch calendar', description: 'Launch calendar.', difficulty: 'intermediate', aliases: ['calendar'] }),
  s({ category: 'Applications', keys: ['SUPER', 'SHIFT', 'E'], action: 'Launch email', description: 'Launch email.', difficulty: 'intermediate', aliases: ['email', 'mail'] }),
  s({ category: 'Applications', keys: ['SUPER', 'SHIFT', 'ALT', 'E'], action: 'Compose new email', description: 'Compose a new email.', difficulty: 'intermediate', aliases: ['email', 'compose'] }),
  s({ category: 'Applications', keys: ['SUPER', 'SHIFT', 'A'], action: 'Launch ChatGPT', description: 'Launch ChatGPT.', difficulty: 'intermediate', aliases: ['chatgpt', 'ai'] }),
  s({ category: 'Applications', keys: ['SUPER', 'SHIFT', 'ALT', 'A'], action: 'Launch Grok', description: 'Launch Grok.', difficulty: 'intermediate', aliases: ['grok', 'ai'] }),
  s({ category: 'Applications', keys: ['SUPER', 'SHIFT', 'G'], action: 'Launch Signal', description: 'Launch Signal.', difficulty: 'intermediate', aliases: ['signal', 'messaging'] }),
  s({ category: 'Applications', keys: ['SUPER', 'SHIFT', 'P'], action: 'Launch Google Photos', description: 'Launch Google Photos.', difficulty: 'intermediate', aliases: ['photos'] }),
  s({ category: 'Applications', keys: ['SUPER', 'SHIFT', 'S'], action: 'Launch Google Maps', description: 'Launch Google Maps.', difficulty: 'intermediate', aliases: ['maps'] }),
  s({ category: 'Applications', keys: ['SUPER', 'SHIFT', 'ALT', 'G'], action: 'Launch WhatsApp', description: 'Launch WhatsApp.', difficulty: 'intermediate', aliases: ['whatsapp', 'messaging'] }),
  s({ category: 'Applications', keys: ['SUPER', 'SHIFT', 'CTRL', 'G'], action: 'Launch Google Messages', description: 'Launch Google messaging.', difficulty: 'intermediate', aliases: ['messages'] }),
  s({ category: 'Applications', keys: ['SUPER', 'SHIFT', 'D'], action: 'Launch LazyDocker', description: 'Launch LazyDocker.', difficulty: 'intermediate', aliases: ['docker', 'lazydocker'] }),
  s({ category: 'Applications', keys: ['SUPER', 'SHIFT', 'O'], action: 'Launch Obsidian', description: 'Launch Obsidian.', difficulty: 'intermediate', aliases: ['obsidian', 'notes'] }),
  s({ category: 'Applications', keys: ['SUPER', 'SHIFT', 'W'], action: 'Launch Omawrite', description: 'Launch Omawrite.', difficulty: 'intermediate', aliases: ['omawrite', 'writing'] }),
  s({ category: 'Applications', keys: ['SUPER', 'SHIFT', 'X'], action: 'Open X', description: 'Open X.', difficulty: 'intermediate', aliases: ['twitter', 'x'] }),
  s({ category: 'Applications', keys: ['SUPER', 'SHIFT', 'ALT', 'X'], action: 'Compose new X post', description: 'Compose a new X post.', difficulty: 'intermediate', aliases: ['twitter', 'tweet'] }),
  s({ category: 'Applications', keys: ['SUPER', 'SHIFT', 'Y'], action: 'Open YouTube', description: 'Open YouTube.', difficulty: 'intermediate', aliases: ['youtube'] }),

  // ------------------------------- Clipboard -------------------------------
  s({ category: 'Clipboard', keys: ['SUPER', 'C'], action: 'Copy', description: 'Copy.', difficulty: 'beginner', essential: true, aliases: ['copy'] }),
  s({ category: 'Clipboard', keys: ['SUPER', 'X'], action: 'Cut', description: 'Cut where supported.', difficulty: 'intermediate', aliases: ['cut'] }),
  s({ category: 'Clipboard', keys: ['SUPER', 'V'], action: 'Paste', description: 'Paste.', difficulty: 'beginner', essential: true, aliases: ['paste'] }),
  s({ category: 'Clipboard', keys: ['SUPER', 'CTRL', 'V'], action: 'Clipboard history', description: 'Open clipboard history/manager.', difficulty: 'beginner', essential: true, aliases: ['clipboard history', 'clipboard manager'] }),

  // -------------------------------- Capture --------------------------------
  s({ category: 'Capture', keys: ['SUPER', 'CTRL', 'C'], action: 'Open capture menu', description: 'Open capture menu.', difficulty: 'intermediate', aliases: ['capture'] }),
  s({ category: 'Capture', keys: ['PRINTSCREEN'], action: 'Take screenshot', description: 'Take screenshot.', difficulty: 'beginner', essential: true, device: 'hardware', aliases: ['screenshot'] }),
  s({ category: 'Capture', keys: ['ALT', 'PRINTSCREEN'], action: 'Start / stop screen recording', description: 'Start or stop screen recording.', difficulty: 'intermediate', device: 'hardware', aliases: ['record', 'screen recording'] }),
  s({ category: 'Capture', keys: ['SUPER', 'PRINTSCREEN'], action: 'Color picker', description: 'Open color picker.', difficulty: 'intermediate', device: 'hardware', aliases: ['color picker'] }),
  s({ category: 'Capture', keys: ['SUPER', 'CTRL', 'PRINTSCREEN'], action: 'Extract text (OCR)', description: 'Extract visible text and copy it.', difficulty: 'intermediate', device: 'hardware', aliases: ['ocr', 'extract text'] }),
  s({ category: 'Capture', keys: ['SUPER', 'ALT', 'LEFTBRACKET'], action: 'Shrink webcam overlay', description: 'Reduce webcam overlay size during recording.', difficulty: 'advanced', aliases: ['webcam'] }),
  s({ category: 'Capture', keys: ['SUPER', 'ALT', 'RIGHTBRACKET'], action: 'Grow webcam overlay', description: 'Increase webcam overlay size during recording.', difficulty: 'advanced', aliases: ['webcam'] }),
  s({ category: 'Capture', keys: ['ALT', 'SHIFT', 'L'], action: 'Copy current URL', description: 'Copy the current URL from Chromium/web application.', difficulty: 'intermediate', aliases: ['copy url'] }),
  s({ category: 'Capture', keys: ['ALT', 'SHIFT', 'D'], action: 'Download video from page', description: 'Download video from the current webpage to the Videos directory.', difficulty: 'intermediate', aliases: ['download video'] }),
  s({ category: 'Capture', keys: ['SUPER', 'CTRL', 'X'], action: 'Start / stop dictation', description: 'Start or stop dictation when dictation is installed.', difficulty: 'advanced', aliases: ['dictation'] }),
  s({ category: 'Capture', keys: ['F9'], action: 'Push-to-talk dictation', description: 'Push-to-talk dictation.', difficulty: 'advanced', aliases: ['dictation'] }),

  // ------------------------------ Notifications ------------------------------
  s({ category: 'Notifications', keys: ['SUPER', 'COMMA'], action: 'Dismiss newest notification', description: 'Dismiss newest notification.', difficulty: 'intermediate' }),
  s({ category: 'Notifications', keys: ['SUPER', 'SHIFT', 'COMMA'], action: 'Dismiss all notifications', description: 'Dismiss all notifications.', difficulty: 'intermediate' }),
  s({ category: 'Notifications', keys: ['SUPER', 'CTRL', 'COMMA'], action: 'Toggle notification silencing', description: 'Toggle notification silencing.', difficulty: 'intermediate', aliases: ['do not disturb', 'silence'] }),
  s({ category: 'Notifications', keys: ['SUPER', 'ALT', 'COMMA'], action: 'Activate recent notification', description: 'Activate the most recent notification.', difficulty: 'intermediate' }),
  s({ category: 'Notifications', keys: ['SUPER', 'SHIFT', 'ALT', 'COMMA'], action: 'Open notification history', description: 'Open notification history.', difficulty: 'intermediate' }),

  // -------------------------------- Appearance --------------------------------
  s({ category: 'Appearance', keys: ['SUPER', 'CTRL', 'SHIFT', 'SPACE'], action: 'Choose a theme', description: 'Choose a theme.', difficulty: 'intermediate', aliases: ['theme'] }),
  s({ category: 'Appearance', keys: ['SUPER', 'CTRL', 'SPACE'], action: 'Choose theme background', description: 'Choose the theme background.', difficulty: 'intermediate', aliases: ['wallpaper', 'background'] }),
  s({ category: 'Appearance', keys: ['SUPER', 'BACKSPACE'], action: 'Toggle window transparency', description: 'Toggle transparency for the active window.', difficulty: 'intermediate', aliases: ['transparency'] }),
  s({ category: 'Appearance', keys: ['SUPER', 'CTRL', 'BACKSPACE'], action: 'Toggle square aspect', description: 'Toggle square/single-window aspect behavior.', difficulty: 'advanced' }),

  // --------------------------------- Toggles ---------------------------------
  s({ category: 'Toggles', keys: ['SUPER', 'CTRL', 'I'], action: 'Toggle idle locking', description: 'Enable or disable idle locking.', difficulty: 'intermediate', aliases: ['idle lock'] }),
  s({ category: 'Toggles', keys: ['SUPER', 'CTRL', 'N'], action: 'Toggle night light', description: 'Toggle night-light color temperature.', difficulty: 'intermediate', aliases: ['night light', 'night shift'] }),
  s({ category: 'Toggles', keys: ['SUPER', 'CTRL', 'DELETE'], action: 'Toggle laptop display', description: 'Enable or disable the laptop display.', difficulty: 'intermediate' }),
  s({ category: 'Toggles', keys: ['SUPER', 'CTRL', 'ALT', 'DELETE'], action: 'Toggle display mirroring', description: 'Toggle laptop display mirroring.', difficulty: 'advanced' }),
  s({ category: 'Toggles', keys: ['SUPER', 'SHIFT', 'SPACE'], action: 'Toggle top bar', description: 'Show or hide the top bar.', difficulty: 'intermediate', aliases: ['bar', 'top bar'] }),
  s({ category: 'Toggles', keys: ['SHIFT', 'MUTE'], action: 'Next audio output', description: 'Move to the next audio output.', difficulty: 'intermediate', device: 'hardware' }),
  s({ category: 'Toggles', keys: ['SHIFT', 'PLAY'], action: 'Next media source', description: 'Move to the next media source.', difficulty: 'intermediate', device: 'hardware' }),
  s({ category: 'Toggles', keys: ['SUPER', 'SHIFT', 'BACKSPACE'], action: 'Toggle window gaps', description: 'Enable or disable window gaps.', difficulty: 'intermediate', aliases: ['gaps'] }),

  // -------------------------------- Reminders --------------------------------
  s({ category: 'Reminders', keys: ['SUPER', 'CTRL', 'R'], action: 'Create a reminder', description: 'Create a reminder.', difficulty: 'intermediate', aliases: ['reminder'] }),
  s({ category: 'Reminders', keys: ['SUPER', 'CTRL', 'ALT', 'R'], action: 'View reminders', description: 'View reminders.', difficulty: 'intermediate', aliases: ['reminder'] }),
  s({ category: 'Reminders', keys: ['SUPER', 'CTRL', 'SHIFT', 'R'], action: 'Clear reminders', description: 'Clear reminders.', difficulty: 'intermediate', aliases: ['reminder'] }),

  // ------------------------------ System Notices ------------------------------
  s({ category: 'System Notices', keys: ['SUPER', 'CTRL', 'ALT', 'T'], action: 'Show current time', description: 'Show current time as a notification.', difficulty: 'intermediate', aliases: ['time', 'clock'] }),
  s({ category: 'System Notices', keys: ['SUPER', 'CTRL', 'ALT', 'B'], action: 'Show battery info', description: 'Show battery information as a notification.', difficulty: 'intermediate', aliases: ['battery'] }),
  s({ category: 'System Notices', keys: ['SUPER', 'CTRL', 'ALT', 'W'], action: 'Toggle weather notification', description: 'Toggle weather notification.', difficulty: 'intermediate', aliases: ['weather'] }),

  // ---------------------------------- Tmux ----------------------------------
  s({ category: 'Tmux', keys: ['PREFIX', 'V'], action: 'Split pane beside', description: 'Split pane beside the current pane.', difficulty: 'advanced', aliases: ['split vertical'] }),
  s({ category: 'Tmux', keys: ['PREFIX', 'H'], action: 'Split pane below', description: 'Split pane below the current pane.', difficulty: 'advanced', aliases: ['split horizontal'] }),
  s({ category: 'Tmux', keys: ['PREFIX', 'X'], action: 'Close active pane', description: 'Close the active pane.', difficulty: 'advanced' }),
  s({ category: 'Tmux', keys: ['PREFIX', 'Z'], action: 'Toggle pane zoom', description: 'Toggle pane zoom/fullscreen.', difficulty: 'advanced' }),
  s({ category: 'Tmux', keys: ['ALT', 'RETURN'], action: 'Split below (no prefix)', description: 'Split below without needing the prefix.', difficulty: 'advanced' }),
  s({ category: 'Tmux', keys: ['ALT', 'SHIFT', 'RETURN'], action: 'Split beside (no prefix)', description: 'Split beside without needing the prefix.', difficulty: 'advanced' }),
  s({ category: 'Tmux', keys: ['ALT', 'ESCAPE'], action: 'Close pane (no prefix)', description: 'Close pane without prefix.', difficulty: 'advanced' }),
  s({ category: 'Tmux', keys: ['CTRL', 'ALT', 'ARROW'], action: 'Navigate between panes', description: 'Navigate between panes.', difficulty: 'advanced' }),
  s({ category: 'Tmux', keys: ['CTRL', 'ALT', 'SHIFT', 'ARROW'], action: 'Resize panes', description: 'Resize panes.', difficulty: 'advanced' }),
  s({ category: 'Tmux', keys: ['PREFIX', 'C'], action: 'New Tmux window', description: 'Create a new Tmux window.', difficulty: 'advanced' }),
  s({ category: 'Tmux', keys: ['PREFIX', 'K'], action: 'Close Tmux window', description: 'Close Tmux window.', difficulty: 'advanced' }),
  s({ category: 'Tmux', keys: ['PREFIX', 'R'], action: 'Rename window', description: 'Rename window.', difficulty: 'advanced' }),
  s({ category: 'Tmux', keys: ['ALT', '1'], action: 'Jump to Tmux window 1', description: 'Jump to a numbered Tmux window.', difficulty: 'advanced', aliases: ['window 1'] }),
  s({ category: 'Tmux', keys: ['ALT', 'LEFT'], action: 'Previous Tmux window', description: 'Move to previous window.', difficulty: 'advanced' }),
  s({ category: 'Tmux', keys: ['ALT', 'RIGHT'], action: 'Next Tmux window', description: 'Move to next window.', difficulty: 'advanced' }),
  s({ category: 'Tmux', keys: ['ALT', 'SHIFT', 'LEFT'], action: 'Move window left', description: 'Move window left.', difficulty: 'advanced' }),
  s({ category: 'Tmux', keys: ['ALT', 'SHIFT', 'RIGHT'], action: 'Move window right', description: 'Move window right.', difficulty: 'advanced' }),
  s({ category: 'Tmux', keys: ['PREFIX', 'SHIFT', 'C'], action: 'New Tmux session', description: 'Create new session.', difficulty: 'advanced' }),
  s({ category: 'Tmux', keys: ['PREFIX', 'SHIFT', 'K'], action: 'Close Tmux session', description: 'Close session.', difficulty: 'advanced' }),
  s({ category: 'Tmux', keys: ['PREFIX', 'SHIFT', 'R'], action: 'Rename Tmux session', description: 'Rename session.', difficulty: 'advanced' }),
  s({ category: 'Tmux', keys: ['PREFIX', 'SHIFT', 'N'], action: 'Next Tmux session', description: 'Go to next session.', difficulty: 'advanced' }),
  s({ category: 'Tmux', keys: ['PREFIX', 'SHIFT', 'P'], action: 'Previous Tmux session', description: 'Go to previous session.', difficulty: 'advanced' }),
  s({ category: 'Tmux', keys: ['ALT', 'UP'], action: 'Move between sessions', description: 'Move between sessions.', difficulty: 'advanced' }),
  s({ category: 'Tmux', keys: ['ALT', 'DOWN'], action: 'Move between sessions', description: 'Move between sessions.', difficulty: 'advanced' }),
  s({ category: 'Tmux', keys: ['PREFIX', 'S'], action: 'List Tmux sessions', description: 'List Tmux sessions.', difficulty: 'advanced' }),
  s({ category: 'Tmux', keys: ['PREFIX', 'D'], action: 'Detach from session', description: 'Detach from session.', difficulty: 'advanced', aliases: ['detach'] }),
  s({ category: 'Tmux', keys: ['PREFIX', 'LEFTBRACKET'], action: 'Enter copy mode', description: 'Enter copy mode.', difficulty: 'advanced', aliases: ['copy mode'] }),
  s({ category: 'Tmux', keys: ['V'], action: 'Begin selection (copy mode)', description: 'Begin text selection while in copy mode.', difficulty: 'advanced', aliases: ['copy mode', 'select'] }),
  s({ category: 'Tmux', keys: ['Y'], action: 'Copy selection (copy mode)', description: 'Copy the selected text while in copy mode.', difficulty: 'advanced', aliases: ['copy mode'] }),
  s({ category: 'Tmux', keys: ['PREFIX', 'Q'], action: 'Reload configuration', description: 'Reload Tmux configuration.', difficulty: 'advanced', aliases: ['reload'] }),
  s({ category: 'Tmux', keys: ['PREFIX', 'SLASH'], action: 'Display Tmux bindings', description: 'Display Tmux keyboard bindings.', difficulty: 'advanced', aliases: ['help'] }),
  s({ category: 'Tmux', keys: ['PREFIX', 'COLON'], action: 'Open Tmux command prompt', description: 'Open Tmux command prompt.', difficulty: 'advanced', aliases: ['command prompt'] }),
  s({ category: 'Tmux', type: 'command', command: 'tdl [<second_ai>]', action: 'Create dev layout', description: 'Create a development layout containing editor, AI tooling, and terminal.', difficulty: 'advanced', aliases: ['developer layout'] }),
  s({ category: 'Tmux', type: 'command', command: 'tdlm [<second_ai>]', action: 'Create dev layouts (subdirs)', description: 'Create development layouts for subdirectories.', difficulty: 'advanced', aliases: ['developer layout'] }),
  s({ category: 'Tmux', type: 'command', command: 'tsl', action: 'Create swarm layout', description: 'Create a multi-pane swarm-style layout.', difficulty: 'advanced', aliases: ['swarm layout'] }),

  // -------------------------------- Ghostty --------------------------------
  s({ category: 'Ghostty', keys: ['CTRL', 'SHIFT', 'E'], action: 'Split below', description: 'Create split below.', difficulty: 'intermediate' }),
  s({ category: 'Ghostty', keys: ['CTRL', 'SHIFT', 'O'], action: 'Split beside', description: 'Create split beside.', difficulty: 'intermediate' }),
  s({ category: 'Ghostty', keys: ['CTRL', 'ALT', 'ARROW'], action: 'Navigate splits', description: 'Navigate between splits.', difficulty: 'intermediate' }),
  s({ category: 'Ghostty', keys: ['SUPER', 'CTRL', 'SHIFT', 'ARROW'], action: 'Resize split (small)', description: 'Resize a split by a smaller increment.', difficulty: 'advanced' }),
  s({ category: 'Ghostty', keys: ['SUPER', 'CTRL', 'SHIFT', 'ALT', 'ARROW'], action: 'Resize split (large)', description: 'Resize a split by a large increment.', difficulty: 'advanced' }),
  s({ category: 'Ghostty', keys: ['CTRL', 'SHIFT', 'T'], action: 'New tab', description: 'Create a new tab.', difficulty: 'intermediate' }),
  s({ category: 'Ghostty', keys: ['CTRL', 'SHIFT', 'ARROW'], action: 'Navigate tabs', description: 'Navigate between terminal tabs.', difficulty: 'intermediate' }),
  s({ category: 'Ghostty', keys: ['ALT', '1'], action: 'Jump to tab 1', description: 'Jump to a numbered tab.', difficulty: 'intermediate', aliases: ['tab 1'] }),
  s({ category: 'Ghostty', keys: ['SHIFT', 'PAGEUP'], action: 'Scroll history back', description: 'Scroll backward through terminal history.', difficulty: 'beginner', device: 'hardware' }),
  s({ category: 'Ghostty', keys: ['SHIFT', 'PAGEDOWN'], action: 'Scroll history forward', description: 'Scroll forward through terminal history.', difficulty: 'beginner', device: 'hardware' }),
  s({ category: 'Ghostty', keys: ['CTRL', 'MOUSE_LEFT'], action: 'Open clicked link', description: 'Open clicked link in browser.', difficulty: 'intermediate', device: 'mouse' }),

  // ------------------------------ File Manager ------------------------------
  s({ category: 'File Manager', keys: ['CTRL', 'L'], action: 'Go to path', description: 'Navigate directly to a filesystem path.', difficulty: 'beginner', aliases: ['go to path'] }),
  s({ category: 'File Manager', keys: ['SPACE'], action: 'Preview file', description: 'Preview selected file.', difficulty: 'beginner', aliases: ['preview'] }),
  s({ category: 'File Manager', keys: ['BACKSPACE'], action: 'Go up a folder', description: 'Move up/back one folder.', difficulty: 'beginner', aliases: ['back', 'up'] }),

  // --------------------------------- Neovim ---------------------------------
  s({ category: 'Neovim', keys: ['SPACE'], action: 'Command palette', description: 'Open available command options.', difficulty: 'intermediate', aliases: ['leader', 'which-key'] }),
  s({ category: 'Neovim', keys: ['SPACE', 'SPACE'], action: 'Find file', description: 'Find/open a file using fuzzy search.', difficulty: 'intermediate', sequence: true, aliases: ['fuzzy find', 'find file'] }),
  s({ category: 'Neovim', keys: ['SPACE', 'E'], action: 'Toggle file sidebar', description: 'Toggle file sidebar.', difficulty: 'intermediate', sequence: true, aliases: ['file tree', 'sidebar'] }),
  s({ category: 'Neovim', keys: ['SPACE', 'G', 'G'], action: 'Open Git controls', description: 'Open Git controls.', difficulty: 'intermediate', sequence: true, aliases: ['git'] }),
  s({ category: 'Neovim', keys: ['SPACE', 'S', 'G'], action: 'Search file contents', description: 'Search inside file contents.', difficulty: 'intermediate', sequence: true, aliases: ['grep', 'search'] }),
  s({ category: 'Neovim', keys: ['CTRL', 'W', 'W'], action: 'Switch sidebar / editor', description: 'Switch between sidebar and editor.', difficulty: 'intermediate', sequence: true }),
  s({ category: 'Neovim', keys: ['CTRL', 'LEFT'], action: 'Resize sidebar', description: 'Resize sidebar.', difficulty: 'intermediate' }),
  s({ category: 'Neovim', keys: ['CTRL', 'RIGHT'], action: 'Resize sidebar', description: 'Resize sidebar.', difficulty: 'intermediate' }),
  s({ category: 'Neovim', keys: ['SHIFT', 'H'], action: 'Previous file tab', description: 'Move to the file tab on the left.', difficulty: 'intermediate' }),
  s({ category: 'Neovim', keys: ['SHIFT', 'L'], action: 'Next file tab', description: 'Move to the file tab on the right.', difficulty: 'intermediate' }),
  s({ category: 'Neovim', keys: ['SPACE', 'B', 'D'], action: 'Close buffer', description: 'Close current file tab/buffer.', difficulty: 'intermediate', sequence: true, aliases: ['close buffer'] }),
  s({ category: 'Neovim', keys: ['A'], action: 'New file (sidebar)', description: 'Create a new file in the parent directory.', difficulty: 'intermediate', aliases: ['sidebar', 'new file'] }),
  s({ category: 'Neovim', keys: ['SHIFT', 'A'], action: 'New directory (sidebar)', description: 'Create a new subdirectory.', difficulty: 'intermediate', aliases: ['sidebar', 'new folder'] }),
  s({ category: 'Neovim', keys: ['D'], action: 'Delete (sidebar)', description: 'Delete selected file or directory.', difficulty: 'intermediate', aliases: ['sidebar', 'delete'] }),
  s({ category: 'Neovim', keys: ['M'], action: 'Move (sidebar)', description: 'Move selected file or directory.', difficulty: 'intermediate', aliases: ['sidebar', 'move'] }),
  s({ category: 'Neovim', keys: ['R'], action: 'Rename (sidebar)', description: 'Rename selected item.', difficulty: 'intermediate', aliases: ['sidebar', 'rename'] }),
  s({ category: 'Neovim', keys: ['SLASH'], action: 'Sidebar help', description: 'Show sidebar command help.', difficulty: 'intermediate', aliases: ['sidebar', 'help'] }),

  // ------------------------------ Quick Emojis ------------------------------
  s({ category: 'Quick Emojis', keys: ['CAPSLOCK', 'M', 'S'], action: '😄 Smile', description: 'Insert a smile emoji.', difficulty: 'advanced', sequence: true }),
  s({ category: 'Quick Emojis', keys: ['CAPSLOCK', 'M', 'C'], action: '😂 Laugh/cry', description: 'Insert a laugh/cry emoji.', difficulty: 'advanced', sequence: true }),
  s({ category: 'Quick Emojis', keys: ['CAPSLOCK', 'M', 'L'], action: '😍 Love', description: 'Insert a love emoji.', difficulty: 'advanced', sequence: true }),
  s({ category: 'Quick Emojis', keys: ['CAPSLOCK', 'M', 'V'], action: '✌️ Victory', description: 'Insert a victory emoji.', difficulty: 'advanced', sequence: true }),
  s({ category: 'Quick Emojis', keys: ['CAPSLOCK', 'M', 'H'], action: '❤️ Heart', description: 'Insert a heart emoji.', difficulty: 'advanced', sequence: true }),
  s({ category: 'Quick Emojis', keys: ['CAPSLOCK', 'M', 'Y'], action: '👍 Yes', description: 'Insert a thumbs-up emoji.', difficulty: 'advanced', sequence: true }),
  s({ category: 'Quick Emojis', keys: ['CAPSLOCK', 'M', 'N'], action: '👎 No', description: 'Insert a thumbs-down emoji.', difficulty: 'advanced', sequence: true }),
  s({ category: 'Quick Emojis', keys: ['CAPSLOCK', 'M', 'F'], action: '🖕 Middle finger', description: 'Insert a middle-finger emoji.', difficulty: 'advanced', sequence: true }),
  s({ category: 'Quick Emojis', keys: ['CAPSLOCK', 'M', 'W'], action: '🤞 Wish', description: 'Insert a fingers-crossed emoji.', difficulty: 'advanced', sequence: true }),
  s({ category: 'Quick Emojis', keys: ['CAPSLOCK', 'M', 'R'], action: '🤘 Rock', description: 'Insert a rock-on emoji.', difficulty: 'advanced', sequence: true }),
  s({ category: 'Quick Emojis', keys: ['CAPSLOCK', 'M', 'K'], action: '😘 Kiss', description: 'Insert a kiss emoji.', difficulty: 'advanced', sequence: true }),
  s({ category: 'Quick Emojis', keys: ['CAPSLOCK', 'M', 'E'], action: '🙄 Eye roll', description: 'Insert an eye-roll emoji.', difficulty: 'advanced', sequence: true }),
  s({ category: 'Quick Emojis', keys: ['CAPSLOCK', 'M', 'I'], action: '😉 Wink', description: 'Insert a wink emoji.', difficulty: 'advanced', sequence: true }),
  s({ category: 'Quick Emojis', keys: ['CAPSLOCK', 'M', 'P'], action: '🙏 Pray', description: 'Insert a pray emoji.', difficulty: 'advanced', sequence: true }),
  s({ category: 'Quick Emojis', keys: ['CAPSLOCK', 'M', 'D'], action: '🤤 Drool', description: 'Insert a drool emoji.', difficulty: 'advanced', sequence: true }),
  s({ category: 'Quick Emojis', keys: ['CAPSLOCK', 'M', 'M'], action: '💰 Money', description: 'Insert a money emoji.', difficulty: 'advanced', sequence: true }),
  s({ category: 'Quick Emojis', keys: ['CAPSLOCK', 'M', 'X'], action: '🎉 Celebration', description: 'Insert a celebration emoji.', difficulty: 'advanced', sequence: true }),
  s({ category: 'Quick Emojis', keys: ['CAPSLOCK', 'M', '1'], action: '💯 100%', description: 'Insert a 100 emoji.', difficulty: 'advanced', sequence: true }),
  s({ category: 'Quick Emojis', keys: ['CAPSLOCK', 'M', 'T'], action: '🥂 Toast', description: 'Insert a toast emoji.', difficulty: 'advanced', sequence: true }),
  s({ category: 'Quick Emojis', keys: ['CAPSLOCK', 'M', 'O'], action: '👌 OK', description: 'Insert an OK emoji.', difficulty: 'advanced', sequence: true }),
  s({ category: 'Quick Emojis', keys: ['CAPSLOCK', 'M', 'G'], action: '👋 Greeting', description: 'Insert a wave emoji.', difficulty: 'advanced', sequence: true }),
  s({ category: 'Quick Emojis', keys: ['CAPSLOCK', 'M', 'A'], action: '💪 Strength', description: 'Insert a flexed-bicep emoji.', difficulty: 'advanced', sequence: true }),
  s({ category: 'Quick Emojis', keys: ['CAPSLOCK', 'M', 'B'], action: '🤯 Mind blown', description: 'Insert a mind-blown emoji.', difficulty: 'advanced', sequence: true }),

  // ---------------------------- Quick Completions ----------------------------
  s({ category: 'Quick Completions', keys: ['CAPSLOCK', 'SPACE', 'SPACE'], action: 'Insert em dash', description: 'Insert an em dash.', difficulty: 'advanced', sequence: true }),
  s({ category: 'Quick Completions', keys: ['CAPSLOCK', 'SPACE', 'N'], action: "Insert your name", description: "Insert the user's configured name.", difficulty: 'advanced', sequence: true }),
  s({ category: 'Quick Completions', keys: ['CAPSLOCK', 'SPACE', 'E'], action: 'Insert your email', description: "Insert the user's configured email.", difficulty: 'advanced', sequence: true }),
];

// Reference notes shown in context (not quizzable), attached to the
// category they're most relevant to.
export const CATEGORY_NOTES = {
  Applications: 'Custom Omarchy bindings can be modified in ~/.config/hypr/bindings.lua',
  'Quick Completions': 'Define additional XCompose shortcuts through ~/.XCompose',
};

// Shortcuts to seed the "Start With The Essentials" onboarding flow.
export const ESSENTIAL_IDS = SHORTCUTS.filter((sc) => sc.essential).map((sc) => sc.id);

export function byId(id) {
  return SHORTCUTS.find((sc) => sc.id === id);
}
