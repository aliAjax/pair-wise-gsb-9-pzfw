// 界面与领域之间的装配层：负责持久化（localStorage）、虚拟时钟与操作派发。
// 领域引擎本身是纯函数；这里保证“重载页面后状态不漂移”：
// 状态与时钟偏移分别落盘，每次读状态先用当前（可能被推进过的）时间做 settle。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { STATE_KEY, CLOCK_KEY, SEED_NOW, seedState } from '../domain/data.js';
import { settle, OPERATIONS, addLiterature, addReader, setNotes, readerCounts } from '../domain/engine.js';
import { DAY } from '../domain/rules.js';

function loadState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* 损坏则回退种子 */ }
  const seeded = seedState();
  localStorage.setItem(STATE_KEY, JSON.stringify(seeded));
  return seeded;
}

function loadOffset() {
  const v = Number(localStorage.getItem(CLOCK_KEY));
  return Number.isFinite(v) ? v : SEED_NOW - Date.now();
}

export function useCirculation() {
  const [state, setState] = useState(loadState);
  const [offset, setOffset] = useState(loadOffset);
  const [now, setNow] = useState(() => Date.now() + loadOffset());
  const [toast, setToast] = useState(null);
  const [conflict, setConflict] = useState(null);
  const boot = useRef(true);

  // 真实时间每秒推进虚拟时钟（默认与现实 1:1），让保留倒计时持续走动
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + offset), 1000);
    return () => clearInterval(id);
  }, [offset]);

  useEffect(() => { localStorage.setItem(STATE_KEY, JSON.stringify(state)); }, [state]);
  useEffect(() => { localStorage.setItem(CLOCK_KEY, String(offset)); }, [offset]);

  // settle：时间一变化就结算逾期保留；首次加载只静默结算、不弹提示。
  // 每次只计算一次并落盘，避免同一 tick 内重复追加顺延日志。
  const settledInfo = useMemo(() => settle(state, now), [state, now]);
  const settled = settledInfo.state;
  useEffect(() => {
    if (settledInfo.notices.length) {
      setState(settledInfo.state);
      if (!boot.current) {
        setToast({ kind: 'warn', text: `${settledInfo.notices.length} 项 24 小时保留逾期未取，已自动释放并顺延` });
      }
    }
    boot.current = false;
  }, [settledInfo]);

  const dispatch = useCallback((op, ...args) => {
    const result = op(settled, ...args, now);
    if (result.ok) {
      setState(result.state);
      setConflict(null);
      if (result.events?.length) {
        setToast({ kind: 'ok', text: result.events.map((e) => e.text).join('；') });
      }
    } else {
      setConflict(result);
      setToast(null);
    }
    return result;
  }, [settled, now]);

  const actions = useMemo(() => ({
    borrow: (copyId, readerId) => dispatch(OPERATIONS.borrow, copyId, readerId),
    reserve: (copyId, readerId) => dispatch(OPERATIONS.reserve, copyId, readerId),
    returnCopy: (copyId) => dispatch(OPERATIONS.returnCopy, copyId),
    renew: (copyId, readerId) => dispatch(OPERATIONS.renew, copyId, readerId),
    pickup: (copyId, readerId) => dispatch(OPERATIONS.pickup, copyId, readerId),
    cancelReserve: (copyId, readerId) => dispatch(OPERATIONS.cancelReserve, copyId, readerId),
    addLiterature: (data) => {
      const r = addLiterature(settled, data, now);
      if (r.ok) { setState(r.state); setToast({ kind: 'ok', text: r.events[0].text }); }
      return r;
    },
    addReader: (name) => {
      const r = addReader(settled, name, now);
      if (r.ok) { setState(r.state); setToast({ kind: 'ok', text: r.events[0].text }); }
      return r;
    },
    saveNotes: (litId, notes) => setState(setNotes(settled, litId, notes)),
  }), [dispatch, settled, now]);

  // 演示用时间控制：推进小时数 / 天数，或回到现实时间
  const advance = useCallback((ms) => {
    setOffset((o) => {
      const nextOffset = o + ms;
      setNow(Date.now() + nextOffset);
      return nextOffset;
    });
  }, []);
  const resetClock = useCallback(() => {
    setOffset(0);
    setNow(Date.now());
  }, []);

  const countsOf = useCallback((readerId) => readerCounts(settled, readerId), [settled]);

  return { state: settled, now, actions, toast, setToast, conflict, setConflict, advance, resetClock, countsOf, DAY };
}
