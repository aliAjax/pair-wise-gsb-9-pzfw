// 左侧导航：视图切换、读者切换（选择当前以哪位读者身份办理借阅/预约）、规则摘要
import React, { useState } from 'react';
import { MAX_LOANS, MAX_RESERVATIONS } from '../domain/seed.js';
import {
  readerHolds, readerReservations,
} from '../circulation/engine.js';

const VIEWS = [
  { key: 'all', icon: '▤', label: '全部馆藏' },
  { key: 'mine', icon: '●', label: '我持有' },
  { key: 'holds', icon: '◷', label: '待我取书' },
  { key: 'queue', icon: '≡', label: '我的排队' },
  { key: 'overdue', icon: '!', label: '已到期' },
];

export default function Sidebar({ state, view, setView, counts, now, onSelectReader, onAddReader, onResetData }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');

  const submit = () => {
    const n = name.trim();
    if (!n) return;
    onAddReader(n);
    setName('');
    setAdding(false);
  };

  return (
    <aside>
      <div className="logo"><span>∴</span> CIRCULATION</div>

      <div className="desk-head">
        <span>馆藏流通台</span>
        <strong>{state.books.length}<small> 种书目 · {state.copies.length} 册</small></strong>
      </div>

      <nav>
        {VIEWS.map((v) => (
          <button key={v.key} className={view === v.key ? 'active' : ''} onClick={() => setView(v.key)}>
            {v.icon} <span>{v.label}</span>
            <b>{counts[v.key] || 0}</b>
          </button>
        ))}
      </nav>

      <div className="side-readers">
        <small>读者（点击切换办理身份）</small>
        {state.readers.map((r) => {
          const holds = readerHolds(state, r.id).length;
          const res = readerReservations(state, r.id).length;
          const overdue = state.copies.some((c) => c.holderId === r.id && c.state === 'loan' && c.dueAt <= now);
          return (
            <button
              key={r.id}
              className={state.currentReaderId === r.id ? 'reader on' : 'reader'}
              onClick={() => onSelectReader(r.id)}
            >
              <span className="rname">{r.name}{overdue && <i title="有到期未还">●</i>}</span>
              <em>{holds}/{MAX_LOANS} 借 · {res}/{MAX_RESERVATIONS} 约</em>
            </button>
          );
        })}
        {adding ? (
          <div className="reader-add">
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder="新读者姓名" />
            <button onClick={submit}>确定</button>
          </div>
        ) : (
          <button className="reader-new" onClick={() => setAdding(true)}>＋ 新增读者</button>
        )}
      </div>

      <div className="side-foot">
        <small className="rule-summary">
          规则速览：单册单一持有人 · 持 {MAX_LOANS} 册 / 约 {MAX_RESERVATIONS} 册上限 ·
          归还后队首保留 24 小时，逾期顺延 · 无人排队方可续借，自原到期日顺延
        </small>
        <button className="reset-data" onClick={onResetData}>↺ 恢复演示数据</button>
        <small>本地数据库 · 重载页面状态不漂移</small>
      </div>
    </aside>
  );
}
