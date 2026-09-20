// 书目详情 + 流通办理面板：副本状态、借/还/续/取/预约、等待队列
import React from 'react';
import {
  copiesOf, waitingOf, readyHoldsOf, getReader,
  fmtDate, fmtCountdown,
} from '../circulation/engine.js';

export default function BookDetail({
  state, book, now, onBorrow, onReserve, onReturn, onRenew,
  onPickup, onCancelReserve, onAddCopy, onCite, onNotes, onToast,
}) {
  if (!book) return <section className="detail"><div className="no-result">请选择左侧书目</div></section>;
  const meId = state.currentReaderId;
  const me = getReader(state, meId);
  const copies = copiesOf(state, book.id);
  const waiting = waitingOf(state, book.id);
  const holds = readyHoldsOf(state, book.id);
  const onShelf = copies.some((c) => c.state === 'shelf');
  const mineCopy = copies.find((c) => c.holderId === meId && c.state !== 'shelf');
  const myWaiting = waiting.findIndex((q) => q.readerId === meId);

  return (
    <section className="detail">
      <div className="detail-top">
        {bookBadge(copies, waiting, now)}
        <button onClick={() => onToast(`已收藏《${book.title}》`)}>☆ 收藏</button>
      </div>

      <h2>{book.title}</h2>
      <p className="authors">{book.authors}</p>

      <div className="cite-actions">
        <button onClick={() => onCite(book)}>▣ 复制引用</button>
        <button onClick={() => onAddCopy(book.id)}>＋ 增加馆藏副本</button>
      </div>

      {/* 流通办理 */}
      <div className="detail-section circ">
        <h4>馆藏流通 <span>CIRCULATION · 当前以「{me.name}」身份办理</span></h4>

        <div className="copy-list">
          {copies.map((c) => {
            const holder = c.holderId ? getReader(state, c.holderId) : null;
            const overdue = c.state === 'loan' && c.dueAt <= now;
            return (
              <div className={`copy-row st-${c.state}${overdue ? ' is-overdue' : ''}`} key={c.id}>
                <div className="copy-main">
                  <span className="copy-code">副本 {c.code}</span>
                  {c.state === 'shelf' && <span className="copy-text">在架，可立即借阅</span>}
                  {c.state === 'loan' && (
                    <span className="copy-text">
                      持有人 <b>{holder.name}</b>
                      <i className={overdue ? 'late' : ''}>到期 {fmtDate(c.dueAt)}{overdue ? '（已逾期）' : ` · ${fmtCountdown(c.dueAt - now)}`}</i>
                    </span>
                  )}
                  {c.state === 'hold' && (
                    <span className="copy-text">
                      保留给 <b>{holder.name}</b>
                      <i className={c.holdUntil <= now ? 'late' : ''}>待取截止 {fmtDate(c.holdUntil)} · {fmtCountdown(c.holdUntil - now)}</i>
                    </span>
                  )}
                </div>
                <div className="copy-ops">
                  {c.state === 'shelf' && (
                    <button className="op primary-op" onClick={() => onBorrow(book.id)}>借给 {me.name}</button>
                  )}
                  {c.state === 'loan' && c.holderId === meId && (
                    <>
                      <button className="op" onClick={() => onRenew(c.id)}>续借</button>
                      <button className="op" onClick={() => onReturn(c.id)}>归还</button>
                    </>
                  )}
                  {c.state === 'loan' && c.holderId !== meId && (
                    <button className="op" onClick={() => onReturn(c.id)}>流通台代还</button>
                  )}
                  {c.state === 'hold' && c.holderId === meId && (
                    <>
                      <button className="op primary-op" onClick={() => onPickup(c.id)}>取走借阅</button>
                      <button className="op" onClick={() => onReturn(c.id)}>放弃保留</button>
                    </>
                  )}
                  {c.state === 'hold' && c.holderId !== meId && (
                    <button className="op" onClick={() => onReturn(c.id)}>代为释放</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="queue-box">
          <div className="queue-head">
            <span>预约队列 {waiting.length + holds.length === 0 ? '· 无人排队' : `· 共 ${waiting.length + holds.length} 人`}</span>
            {!onShelf && !mineCopy && myWaiting < 0 && (
              <button className="op primary-op" onClick={() => onReserve(book.id)}>预约排队</button>
            )}
            {mineCopy && <small className="standing">我的状态：{mineCopy.state === 'hold' ? '待取保留中' : '持有中'}</small>}
            {myWaiting >= 0 && (
              <small className="standing">
                我的状态：排队第 {holds.length + myWaiting + 1} 位
                <button className="link" onClick={() => onCancelReserve(book.id)}>取消预约</button>
              </small>
            )}
          </div>
          <ol className="queue-list">
            {holds.map((c) => (
              <li key={c.id} className="q-hold">
                <span className="qpos">第 1 位 · 待取</span>
                <b>{getReader(state, c.holderId)?.name}</b>
                <i>保留至 {fmtDate(c.holdUntil)}（{fmtCountdown(c.holdUntil - now)}）</i>
              </li>
            ))}
            {waiting.map((q, i) => (
              <li key={q.readerId} className={q.readerId === meId ? 'q-mine' : ''}>
                <span className="qpos">第 {holds.length + i + 1} 位</span>
                <b>{getReader(state, q.readerId)?.name}</b>
                <i>登记于 {fmtDate(q.at)}</i>
              </li>
            ))}
            {holds.length + waiting.length === 0 && <li className="q-empty">无人排队——持有者可续借，归还后直接回架</li>}
          </ol>
        </div>
      </div>

      <div className="detail-section">
        <h4>摘要 <span>ABSTRACT</span></h4>
        <p>{book.abstract}</p>
      </div>
      <div className="detail-section">
        <h4>出版信息 <span>PUBLICATION</span></h4>
        <div className="pub-grid">
          <div><small>出版物</small><strong>{book.venue}</strong></div>
          <div><small>年份</small><strong>{book.year}</strong></div>
        </div>
      </div>
      <div className="detail-section">
        <h4>引用文本 <span>CITATION</span></h4>
        <div className="cite-box">{book.cite}<button onClick={() => onCite(book)}>复制</button></div>
      </div>
      <div className="detail-section">
        <h4>我的笔记 <span>PRIVATE</span></h4>
        <textarea className="notes" placeholder="记录你的阅读想法…" value={book.notes || ''}
          onChange={(e) => onNotes(book.id, e.target.value)} />
      </div>
    </section>
  );
}

function bookBadge(copies, waiting, now) {
  const hasShelf = copies.some((c) => c.state === 'shelf');
  const hasOverdue = copies.some((c) => c.state === 'loan' && c.dueAt <= now);
  const hasHold = copies.some((c) => c.state === 'hold' && c.holdUntil <= now);
  if (hasHold) return <span className="badge badge-late">保留已超时</span>;
  if (hasOverdue) return <span className="badge badge-late">有逾期未还</span>;
  if (hasShelf) return <span className="badge badge-shelf">在架可借</span>;
  if (waiting.length) return <span className="badge badge-queue">全部借出 · {waiting.length} 人排队</span>;
  return <span className="badge badge-loan">全部借出</span>;
}
