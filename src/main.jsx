import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

import { buildSeed } from './domain/seed.js';
import { loadState, saveState, uid } from './domain/store.js';
import * as circ from './circulation/engine.js';

import Sidebar from './ui/Sidebar.jsx';
import ClockBar from './ui/ClockBar.jsx';
import BookList from './ui/BookList.jsx';
import BookDetail from './ui/BookDetail.jsx';
import AddBookModal from './ui/AddBookModal.jsx';
import Toast from './ui/Toast.jsx';

const VIEW_TITLES = {
  all: '全部馆藏',
  mine: '我持有的书目',
  holds: '待我取书',
  queue: '我的排队预约',
  overdue: '到期与逾期',
};

function App() {
  const [state, setState] = useState(loadState);
  const [, setTick] = useState(0);
  const [selectedId, setSelectedId] = useState(1);
  const [view, setView] = useState('all');
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState('全部');
  const [showAdd, setShowAdd] = useState(false);
  const [toast, setToast] = useState(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const now = Date.now() + state.clockOffset;

  // 重载后状态不漂移：逾期/保留失效全部在流通层按当前时间现算。
  // 每 20 秒及每次推进模拟时钟时统一整理一次过期保留。
  useEffect(() => {
    const t = setInterval(() => {
      const r = circ.sweep(stateRef.current, Date.now() + stateRef.current.clockOffset);
      if (r.state !== stateRef.current) setState(r.state);
      if (r.notices.length) setToast({ kind: 'ok', text: r.notices.join(' ') });
      setTick((x) => x + 1);
    }, 20000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => saveState(state), [state]);

  const showOk = (text) => setToast({ kind: 'ok', text });
  const showError = (error) => setToast({ kind: 'error', error });

  // 所有操作先整理过期保留，再进入具体判定，保证基于最新事实
  const apply = (fn, ...args) => {
    const t = Date.now() + stateRef.current.clockOffset;
    const swept = circ.sweep(stateRef.current, t);
    const base = swept.state;
    const res = fn(base, ...args, t);
    if (!res.ok) { showError(res.error); return; }
    setState(res.state);
    if (res.notice) showOk(res.notice);
    if (res.notices && res.notices.length) showOk(res.notices.join(' '));
  };

  const actions = {
    borrow: (bookId) => apply(circ.borrow, bookId, state.currentReaderId),
    reserve: (bookId) => apply(circ.reserve, bookId, state.currentReaderId),
    ret: (copyId) => apply(circ.returnCopy, copyId),
    renew: (copyId) => apply(circ.renew, copyId, state.currentReaderId),
    pickup: (copyId) => apply(circ.pickup, copyId, state.currentReaderId),
    cancel: (bookId) => apply(circ.cancelReservation, bookId, state.currentReaderId),
  };

  const advance = (ms) => {
    const nextOffset = stateRef.current.clockOffset + ms;
    const target = { ...stateRef.current, clockOffset: nextOffset };
    const clockNow = Date.now() + nextOffset;
    const r = circ.sweep(target, clockNow);
    setState(r.state);
    if (r.notices.length) setToast({ kind: 'ok', text: r.notices.join(' ') });
    else setToast({ kind: 'ok', text: `时间已推进到 ${circ.fmtDate(clockNow)}（未触发保留变动）` });
  };
  const resetClock = () => setState((s) => ({ ...s, clockOffset: 0 }));

  const selectReader = (id) => { setState((s) => ({ ...s, currentReaderId: id })); showOk(`已切换为「${stateRef.current.readers.find((r) => r.id === id).name}」身份办理`); };
  const addReader = (name) => {
    const id = uid('r');
    setState((s) => ({ ...s, readers: [...s.readers, { id, name }], currentReaderId: id }));
    showOk(`读者 ${name} 已登记，并切换为当前办理身份`);
  };
  const resetData = () => {
    const fresh = buildSeed(Date.now());
    setState(fresh);
    setSelectedId(1);
    setView('all');
    showOk('已恢复初始演示流通数据');
  };

  const addBook = (book) => {
    setState((s) => circ.addBookCopy(s, book));
    const id = Math.max(0, ...stateRef.current.books.map((b) => b.id)) + 1;
    setSelectedId(id);
    setShowAdd(false);
    showOk(`《${book.title}》已编目，副本 A 已上架`);
  };
  const addCopy = (bookId) => { setState((s) => circ.addCopy(s, bookId)); showOk('新副本已加工入库并上架'); };
  const setNotes = (bookId, notes) => setState((s) => circ.updateBookNote(s, bookId, notes));
  const cite = (book) => {
    navigator.clipboard?.writeText(book.cite);
    showOk('引用文本已复制');
  };
  const exportRefs = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([state.books.map((b) => b.cite).join('\n')], { type: 'text/plain' }));
    a.download = 'references.txt';
    a.click();
    showOk('引用列表已导出');
  };

  /* ---------- 视图过滤 ---------- */
  const visibleBooks = useMemo(() => {
    const rid = state.currentReaderId;
    let base = state.books;
    if (view === 'mine') base = base.filter((b) => state.copies.some((c) => c.bookId === b.id && c.holderId === rid && (c.state === 'loan' || c.state === 'hold')));
    if (view === 'holds') base = base.filter((b) => state.copies.some((c) => c.bookId === b.id && c.holderId === rid && c.state === 'hold'));
    if (view === 'queue') base = base.filter((b) => (state.queues[b.id] || []).some((q) => q.readerId === rid));
    if (view === 'overdue') base = base.filter((b) => state.copies.some((c) => c.bookId === b.id && ((c.state === 'loan' && c.dueAt <= now) || (c.state === 'hold' && c.holdUntil <= now))));
    const q = query.trim().toLowerCase();
    return base.filter((b) => (tag === '全部' || b.tags.includes(tag))
      && (!q || `${b.title}${b.authors}${b.abstract}`.toLowerCase().includes(q)));
  }, [state, view, query, tag, now]);

  const tags = useMemo(() => ['全部', ...new Set(state.books.flatMap((b) => b.tags))], [state.books]);
  const counts = useMemo(() => {
    const rid = state.currentReaderId;
    return {
      all: state.books.length,
      mine: state.copies.filter((c) => c.holderId === rid && (c.state === 'loan' || c.state === 'hold')).length,
      holds: state.copies.filter((c) => c.holderId === rid && c.state === 'hold').length,
      queue: state.books.filter((b) => (state.queues[b.id] || []).some((q) => q.readerId === rid)).length,
      overdue: state.books.filter((b) => state.copies.some((c) => c.bookId === b.id && ((c.state === 'loan' && c.dueAt <= now) || (c.state === 'hold' && c.holdUntil <= now)))).length,
    };
  }, [state, now]);

  const currentBook = state.books.find((b) => b.id === selectedId) || visibleBooks[0] || state.books[0];

  return (
    <div className="app">
      <Sidebar
        state={state} view={view} setView={setView} counts={counts} now={now}
        onSelectReader={selectReader} onAddReader={addReader} onResetData={resetData}
      />
      <main>
        <header>
          <div>
            <span className="crumb">RESEARCH / CIRCULATION DESK</span>
            <h1>{VIEW_TITLES[view]}</h1>
          </div>
          <div className="actions">
            <button className="outline" onClick={exportRefs}>↓ 导出引用</button>
            <button className="primary" onClick={() => setShowAdd(true)}>＋ 添加馆藏</button>
          </div>
        </header>

        <div className="toolbar">
          <div className="search">⌕
            <input placeholder="搜索标题、作者或摘要…" value={query} onChange={(e) => setQuery(e.target.value)} />
            {query && <button onClick={() => setQuery('')}>×</button>}
          </div>
          <div className="tag-filter">
            {tags.map((t) => <button key={t} className={tag === t ? 'on' : ''} onClick={() => setTag(t)}>{t}</button>)}
          </div>
        </div>

        <ClockBar clockNow={now} offset={state.clockOffset} onAdvance={advance} onReset={resetClock} />

        <div className="body">
          <BookList
            state={state} items={visibleBooks} selectedId={currentBook?.id}
            onSelect={setSelectedId} now={now}
          />
          <BookDetail
            state={state} book={currentBook} now={now}
            onBorrow={actions.borrow} onReserve={actions.reserve} onReturn={actions.ret}
            onRenew={actions.renew} onPickup={actions.pickup} onCancelReserve={actions.cancel}
            onAddCopy={addCopy} onCite={cite} onNotes={setNotes} onToast={showOk}
          />
        </div>
      </main>

      {showAdd && <AddBookModal onClose={() => setShowAdd(false)} onAdd={addBook} />}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
