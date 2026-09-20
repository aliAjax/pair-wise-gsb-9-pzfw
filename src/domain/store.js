// 领域数据层：本地持久化与数据变更（与流通规则无关的结构性操作放这里）
import { STORAGE_KEY, SCHEMA_VERSION, buildSeed } from './seed.js';

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return buildSeed(Date.now());
    const s = JSON.parse(raw);
    if (!s || s.v !== SCHEMA_VERSION || !Array.isArray(s.books)) return buildSeed(Date.now());
    return s;
  } catch {
    return buildSeed(Date.now());
  }
}

export function saveState(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* 忽略写入失败 */ }
}

let seq = 0;
export const uid = (p) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;
