import React from 'react';
import { fmtDateTime, fmtDate, remainLabel } from './utils.js';
import { copyStatus } from '../domain/engine.js';
import { STATUS } from '../domain/rules.js';

function badge(status) {
  const cls = status === STATUS.ON_LOAN ? '借出' : status === STATUS.ON_HOLD ? '保留中' : '在架';
  return <small className={`cop-status st-${cls}`}>{status}</small>;
}

// 单册流通卡：持有人 / 保留人 / 队列 / 到期信息，以及面向当前读者与流通台的操作
export function CopyCard({ copy, lit, readers, readerId, now, actions }) {
  const status = copyStatus(copy, now);
  const nameOf = (id) => readers.find((r) => r.id === id)?.name ?? '?';
  const isMine = copy.holderId === readerId;
  const myHold = copy.holdReaderId === readerId;
  const myQueuePos = copy.queue.indexOf(readerId) + 1;
  const overdue = copy.dueAt && copy.dueAt <= now;

  return (
    <div className={`copy-card ${isMine ? 'mine' : ''}`}>
      <div className="copy-head">
        <b className="copy-code">{copy.code}</b>
        {badge(status)}
      </div>

      {status === STATUS.ON_LOAN && (
        <div className="copy-flow">
          <p>持有人：<b>{nameOf(copy.holderId)}</b>{isMine && <span className="tag-me">（本人）</span>}</p>
          <p className={overdue ? 'overdue' : ''}>
            到期日：{fmtDate(copy.dueAt)}
            <em>（{remainLabel(copy.dueAt, now)}，借出 {fmtDateTime(copy.loanedAt)}）</em>
            {overdue && <strong className="overdue-flag">逾期</strong>}
          </p>
        </div>
      )}
      {status === STATUS.ON_HOLD && (
        <div className="copy-flow">
          <p>保留给：<b>{nameOf(copy.holdReaderId)}</b>{myHold && <span className="tag-me">（本人）</span>}</p>
          <p className="hold-warn">保留截止：{fmtDateTime(copy.holdUntil)} <em>（{remainLabel(copy.holdUntil, now)}，逾期自动释放并顺延）</em></p>
        </div>
      )}
      {status === STATUS.AVAILABLE && <p className="copy-flow free">在架可借</p>}

      <div className="queue-row">
        <small>排队队列（{copy.queue.length}）：</small>
        {copy.queue.length
          ? copy.queue.map((id, i) => (
            <span key={id} className={`queue-pill ${id === readerId ? 'me' : ''}`}>
              {i + 1}. {nameOf(id)}{id === readerId ? '（本人）' : ''}
            </span>
          ))
          : <small className="queue-empty">无人排队——持有人可续借</small>}
      </div>

      <div className="copy-actions">
        {status === STATUS.AVAILABLE && (
          <button className="btn primary" onClick={() => actions.borrow(copy.id, readerId)}>借出给当前读者</button>
        )}
        {status === STATUS.ON_LOAN && (
          <>
            {isMine
              ? <button className="btn primary" disabled={!!(copy.queue.length || copy.holdReaderId)} title={copy.queue.length || copy.holdReaderId ? '有人排队，规则 R5 禁止续借' : ''}
                onClick={() => actions.renew(copy.id, readerId)}>续借（自原到期日 +14 天）</button>
              : <button className="btn primary" disabled={myQueuePos > 0} title={myQueuePos ? '已在队列中（R6）' : ''}
                onClick={() => actions.reserve(copy.id, readerId)}>排队预约</button>}
            <button className="btn outline" onClick={() => actions.returnCopy(copy.id)}>流通台归还</button>
            {myQueuePos > 0 && <button className="btn ghost" onClick={() => actions.cancelReserve(copy.id, readerId)}>取消排队（第 {myQueuePos} 位）</button>}
          </>
        )}
        {status === STATUS.ON_HOLD && (
          <>
            {myHold
              ? <>
                <button className="btn primary" onClick={() => actions.pickup(copy.id, readerId)}>在保留期内取书</button>
                <button className="btn ghost" onClick={() => actions.cancelReserve(copy.id, readerId)}>放弃保留</button>
              </>
              : <>
                <button className="btn primary" disabled={myQueuePos > 0} title={myQueuePos ? '已在队列中（R6）' : ''}
                  onClick={() => actions.reserve(copy.id, readerId)}>排队预约</button>
                <span className="action-hint">保留给 {nameOf(copy.holdReaderId)}，不可借出给他人</span>
              </>}
          </>
        )}
      </div>
    </div>
  );
}
