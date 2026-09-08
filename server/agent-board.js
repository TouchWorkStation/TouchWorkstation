// server/agent-board.js
// Per-agent kanban board + chat, persisted to disk alongside agents.json.
//
// This is TouchWorkstation-native: tasks and chat live here, owned by
// TouchWorkstation, not by the agent runtime. An agent is "assigned" tasks
// and you converse with it in a thread. Sending a chat message can hand the
// message to the agent's live terminal session (so the agent actually acts
// on it), but the board/chat state itself is ours and survives restarts.

import fs from 'fs';
import path from 'path';

let BOARD_FILE = null;
let CHAT_FILE = null;

export function initBoard({ stateDir }) {
  BOARD_FILE = path.join(stateDir, 'agent-tasks.json');
  CHAT_FILE = path.join(stateDir, 'agent-chat.json');
}

// ---- storage helpers ----
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// tasks are stored as a flat list, each tagged with agentId + column.
export const COLUMNS = ['todo', 'in_progress', 'done'];

function allTasks() { return readJson(BOARD_FILE, []); }
function saveTasks(list) { writeJson(BOARD_FILE, list); }

export function tasksForAgent(agentId) {
  return allTasks().filter((t) => t.agentId === agentId).sort((a, b) => a.order - b.order);
}

export function createTask({ agentId, title, description, column }) {
  if (!agentId || !title) throw new Error('agentId and title are required');
  const col = COLUMNS.includes(column) ? column : 'todo';
  const list = allTasks();
  const siblings = list.filter((t) => t.agentId === agentId && t.column === col);
  const task = {
    id: `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    agentId,
    title: String(title).slice(0, 200),
    description: String(description || '').slice(0, 2000),
    column: col,
    order: siblings.length,
    createdAt: new Date().toISOString(),
  };
  list.push(task);
  saveTasks(list);
  return task;
}

export function updateTask(id, patch) {
  const list = allTasks();
  const idx = list.findIndex((t) => t.id === id);
  if (idx === -1) throw new Error('Task not found');
  const cur = list[idx];
  const next = { ...cur };
  if (typeof patch.title === 'string') next.title = patch.title.slice(0, 200);
  if (typeof patch.description === 'string') next.description = patch.description.slice(0, 2000);
  if (patch.column && COLUMNS.includes(patch.column)) next.column = patch.column;
  if (typeof patch.order === 'number') next.order = patch.order;
  list[idx] = next;
  saveTasks(list);
  return next;
}

export function deleteTask(id) {
  const list = allTasks();
  const next = list.filter((t) => t.id !== id);
  if (next.length === list.length) throw new Error('Task not found');
  saveTasks(next);
  return { deleted: true };
}

// Move a task to a column and re-order within it.
export function moveTask(id, column, order) {
  if (!COLUMNS.includes(column)) throw new Error('Invalid column');
  return updateTask(id, { column, order: typeof order === 'number' ? order : 0 });
}

// ---- chat ----
function allChat() { return readJson(CHAT_FILE, {}); }
function saveChat(obj) { writeJson(CHAT_FILE, obj); }

export function chatForAgent(agentId) {
  return allChat()[agentId] || [];
}

export function addChatMessage(agentId, { role, text }) {
  if (!agentId || !text) throw new Error('agentId and text are required');
  const obj = allChat();
  const thread = obj[agentId] || [];
  const msg = {
    id: `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    role: role === 'agent' ? 'agent' : 'you',
    text: String(text).slice(0, 8000),
    at: new Date().toISOString(),
  };
  thread.push(msg);
  // keep the last 500 messages per agent so the file can't grow unbounded
  obj[agentId] = thread.slice(-500);
  saveChat(obj);
  return msg;
}

// When an agent is deleted, clean up its board + chat too.
export function purgeAgent(agentId) {
  saveTasks(allTasks().filter((t) => t.agentId !== agentId));
  const obj = allChat();
  delete obj[agentId];
  saveChat(obj);
}
