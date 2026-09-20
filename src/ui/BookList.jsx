// 馆藏书目列表：检索结果 + 每本书的流通概况
import React from 'react';
import { copiesOf, waitingOf } from '../circulation/engine.js';

export default function BookList({ state, items, selectedId, onSelect, now }) {
  if (!items.length) return <div className="no-result">没有找到匹配的书目</div>;
  return (
    <section className="paper-list">
      {items.map((b) => {
        const copies = copiesOf(state, b.id);
        const waiting = waitingOf(state, b.id).length;
        const shelf = copies.filter((c) => c.state === 'shelf').length;
        const loans = copies.filter((c) => c.state === 'loan').length;
        const holds = copies.filter((c) => c.state === 'hold').length;
        const overdue = copies.some((c) => c.state === 'loan' && c.dueAt <= now);
        const held = copies.some((c) => c.holderId === state.currentReaderId && c.state !== 'shelf');
        return (
          <button key={b.id} className={selectedId === b.id ? 'paper selected' : 'paper'} onClick={() => onSelect(b.id)}>
            <div className="paper-year">{b.year}</div>
            <div className="paper-copy">
              <h3>{b.title}</h3>
              <p>{b.authors}</p>
              <div>{b.tags.map((t) => <span key={t}>#{t}</span>)}</div>
              <div className="paper-circ">
                {shelf > 0 && <i className="dot dot-shelf">在架 ×{shelf}</i>}
                {loans > 0 && <i className="dot dot-loan">借出 ×{loans}</i>}
                {holds > 0 && <i className="dot dot-hold">待取 ×{holds}</i>}
                {waiting > 0 && <i className="dot dot-queue">排队 ×{waiting}</i>}
                {overdue && <i className="dot dot-late">逾期</i>}
                {held && <i className="dot dot-mine">我持有</i>}
              </div>
            </div>
            <small className={shelf > 0 ? 'badge badge-shelf' : 'badge badge-loan'}>
              {shelf > 0 ? '可借' : '不可借'}
            </small>
          </button>
        );
      })}
    </section>
  );
}
