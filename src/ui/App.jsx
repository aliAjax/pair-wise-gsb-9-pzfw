import React, { useMemo, useState } from 'react';
import { useCirculation } from '../state/store.js';
import { Sidebar } from './Sidebar.jsx';
import { CopyCard } from './CopyCard.jsx';
import { fmtEventTime } from './utils.js';

function ConflictBanner({ conflict, onClose }) {
  if (!conflict) return null;
  const rows = Object.entries(conflict.detail || {}).filter(([, v]) => v !== undefined && v !== null && v !== '');
  return (
    <div className="conflict" role="alert">
      <div className="conflict-head">
        <b>⛒ 操作被拒绝 · 命中规则 {conflict.rule}</b>
        <button onClick={onClose}>×</button>
      </div>
      <p className="conflict-msg">{conflict.message}</p>
      {rows.length > 0 && (
        <dl className="conflict-grid">
          {rows.map(([k, v]) => (
            <React.Fragment key={k}>
              <dt>{FIELD_LABELS[k] || k}</dt>
              <dd>{Array.isArray(v) ? v.join('、') : String(v)}</dd>
            </React.Fragment>
          ))}
        </dl>
      )}
      <p className="conflict-rule">规则 {conflict.rule}：{conflict.ruleText}</p>
    </div>
  );
}

const FIELD_LABELS = {
  book: '图书', reader: '读者', time: '发生时间', holder: '当前持有人', dueAt: '到期日',
  holdReader: '保留对象', holdUntil: '保留截止', loans: '当前持有', maxLoans: '持有上限',
  reserves: '当前预约', maxReserves: '预约上限', position: '队列位置', queue: '排队读者',
};

function AddLiteratureModal({ onClose, onSave }) {
  const [form, setForm] = useState({ title: '', authors: '', year: '2024', venue: '', abstract: '', tags: '' });
  const submit = () => {
    if (!form.title.trim()) return;
    onSave({
      ...form,
      tags: form.tags.split(/[,，]/).map((x) => x.trim()).filter(Boolean),
    });
    onClose();
  };
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose}>×</button>
        <span className="crumb">NEW ACQUISITION</span>
        <h2>文献入藏</h2>
        <label>标题<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="论文或书籍标题" /></label>
        <label>作者<input value={form.authors} onChange={(e) => setForm({ ...form, authors: e.target.value })} /></label>
        <div className="two">
          <label>年份<input type="number" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} /></label>
          <label>出版物<input value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} /></label>
        </div>
        <label>关键词<input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="用逗号分隔" /></label>
        <label>摘要<textarea rows="3" value={form.abstract} onChange={(e) => setForm({ ...form, abstract: e.target.value })} /></label>
        <button className="primary full" onClick={submit}>入藏（自动登记 1 个可借副本）</button>
      </div>
    </div>
  );
}

export default function App() {
  const { state, now, actions, toast, setToast, conflict, setConflict, advance, resetClock, countsOf } = useCirculation();
  const [activeReaderId, setActiveReaderId] = useState('r1');
  const [selectedLitId, setSelectedLitId] = useState(1);
  const [selectedCopyId, setSelectedCopyId] = useState('c1');
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState('全部');
  const [showAdd, setShowAdd] = useState(false);
  const [showReader, setShowReader] = useState(false);
  const [readerName, setReaderName] = useState('');

  const tags = ['全部', ...new Set(state.literature.flatMap((x) => x.tags))];
  const filtered = useMemo(() => state.literature.filter((x) =>
    (tag === '全部' || x.tags.includes(tag)) &&
    `${x.title}${x.authors}${x.abstract}`.toLowerCase().includes(query.toLowerCase())
  ), [state.literature, tag, query]);

  const cur = state.literature.find((x) => x.id === selectedLitId) || filtered[0] || state.literature[0];
  const copies = cur ? state.copies.filter((c) => c.litId === cur.id) : [];
  const selCopy = copies.find((c) => c.id === selectedCopyId) || copies[0];
  const activeReader = state.readers.find((r) => r.id === activeReaderId);

  const pickLit = (id) => {
    setSelectedLitId(id);
    const first = state.copies.find((c) => c.litId === id);
    if (first) setSelectedCopyId(first.id);
  };

  const exportRefs = () => {
    const blob = new Blob([state.literature.map((x) => x.cite).join('\n')], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'references.txt';
    a.click();
    setToast({ kind: 'ok', text: '引用列表已导出' });
  };

  return (
    <div className="app">
      <Sidebar
        readers={state.readers} activeReaderId={activeReaderId} onSelect={setActiveReaderId}
        countsOf={countsOf} now={now} advance={advance} resetClock={resetClock} events={state.events}
      />

      <main>
        <header>
          <div>
            <span className="crumb">COLLECTION / CIRCULATION DESK</span>
            <h1>馆藏流通台</h1>
          </div>
          <div className="actions">
            <button className="outline" onClick={() => setShowReader(true)}>＋ 登记读者</button>
            <button className="outline" onClick={exportRefs}>↓ 导出引用</button>
            <button className="primary" onClick={() => setShowAdd(true)}>＋ 文献入藏</button>
          </div>
        </header>

        <div className="toolbar">
          <div className="search">⌕<input placeholder="搜索标题、作者或摘要…" value={query} onChange={(e) => setQuery(e.target.value)} />
            {query && <button onClick={() => setQuery('')}>×</button>}</div>
          <div className="tag-filter">
            {tags.map((t) => <button key={t} className={tag === t ? 'on' : ''} onClick={() => setTag(t)}>{t}</button>)}
          </div>
          <div className="reader-chip">当前身份：<b>{activeReader?.name}</b></div>
        </div>

        <ConflictBanner conflict={conflict} onClose={() => setConflict(null)} />

        <div className="body">
          <section className="paper-list">
            {filtered.map((p) => {
              const cs = state.copies.filter((c) => c.litId === p.id);
              const loans = cs.filter((c) => c.holderId).length;
              const holds = cs.filter((c) => c.holdReaderId && c.holdUntil > now).length;
              const queueTotal = cs.reduce((n, c) => n + c.queue.length, 0);
              return (
                <button key={p.id} className={`paper ${cur?.id === p.id ? 'selected' : ''}`} onClick={() => pickLit(p.id)}>
                  <div className="paper-year">{p.year}</div>
                  <div className="paper-copy">
                    <h3>{p.title}</h3>
                    <p>{p.authors}</p>
                    <div>
                      <span className="avail">在架 {cs.length - loans - holds}/{cs.length}</span>
                      <span>借出 {loans}</span>
                      {holds > 0 && <span>保留 {holds}</span>}
                      {queueTotal > 0 && <span className="queue-count">排队 {queueTotal}</span>}
                    </div>
                  </div>
                </button>
              );
            })}
            {!filtered.length && <div className="no-result">没有找到匹配的文献</div>}
          </section>

          <section className="detail">
            {cur && (
              <>
                <h2>{cur.title}</h2>
                <p className="authors">{cur.authors} · {cur.venue} · {cur.year}</p>
                <div className="tags-line">{cur.tags.map((t) => <span key={t}>#{t}</span>)}</div>

                <div className="detail-section">
                  <h4>摘要 <span>ABSTRACT</span></h4>
                  <p>{cur.abstract}</p>
                </div>

                <div className="detail-section">
                  <h4>馆藏副本与流通 <span>{copies.length} COPIES</span></h4>
                  <div className="copy-tabs">
                    {copies.map((c) => (
                      <button key={c.id} className={selCopy?.id === c.id ? 'on' : ''} onClick={() => setSelectedCopyId(c.id)}>{c.code}</button>
                    ))}
                  </div>
                  {selCopy && (
                    <CopyCard copy={selCopy} lit={cur} readers={state.readers} readerId={activeReaderId} now={now} actions={actions} />
                  )}
                </div>

                <div className="detail-section">
                  <h4>引用文本 <span>CITATION</span></h4>
                  <div className="cite-box">
                    {cur.cite}
                    <button onClick={() => { navigator.clipboard?.writeText(cur.cite); setToast({ kind: 'ok', text: '引用文本已复制' }); }}>复制</button>
                  </div>
                </div>

                <div className="detail-section">
                  <h4>我的笔记 <span>PRIVATE · {activeReader?.name}</span></h4>
                  <textarea className="notes" placeholder="记录你的阅读想法…" value={cur.notes || ''}
                    onChange={(e) => actions.saveNotes(cur.id, e.target.value)} />
                </div>

                <div className="detail-section">
                  <h4>本书流通记录 <span>TRANSIT</span></h4>
                  <div className="mini-log">
                    {state.events.filter((e) => e.text.includes(cur.title)).slice(0, 6).map((e, i) => (
                      <div key={i} className="mini-row"><time>{fmtEventTime(e.t)}</time><span>{e.text}</span></div>
                    ))}
                    {state.events.filter((e) => e.text.includes(cur.title)).length === 0 && <small>暂无记录</small>}
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      </main>

      {showAdd && <AddLiteratureModal onClose={() => setShowAdd(false)} onSave={actions.addLiterature} />}
      {showReader && (
        <div className="modal-bg" onClick={() => setShowReader(false)}>
          <div className="modal narrow" onClick={(e) => e.stopPropagation()}>
            <button className="close" onClick={() => setShowReader(false)}>×</button>
            <span className="crumb">NEW READER</span>
            <h2>登记读者</h2>
            <label>姓名<input value={readerName} onChange={(e) => setReaderName(e.target.value)} placeholder="读者姓名" autoFocus /></label>
            <button className="primary full" onClick={() => {
              if (!readerName.trim()) return;
              actions.addReader(readerName.trim());
              setReaderName('');
              setShowReader(false);
            }}>保存读者</button>
          </div>
        </div>
      )}

      {toast && (
        <div className={`toast toast-${toast.kind}`} onClick={() => setToast(null)}>
          {toast.kind === 'warn' ? '⏰ ' : '✓ '}{toast.text}
        </div>
      )}
    </div>
  );
}
