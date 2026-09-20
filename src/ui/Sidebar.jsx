import React from 'react';
import { fmtClock } from './utils.js';
import { MAX_LOANS, MAX_RESERVES } from '../domain/rules.js';

// 左侧：当前读者切换、读者配额（持有 3 / 预约 2）、虚拟时钟与流通日志
export function Sidebar({ readers, activeReaderId, onSelect, countsOf, now, advance, resetClock, events }) {
  return (
    <aside>
      <div className="logo"><span>∴</span> CIRCULATION</div>
      <div className="library-head">
        <span>馆藏流通台</span>
        <strong>{readers.length}<small> 位读者</small></strong>
      </div>

      <div className="reader-block">
        <small className="block-label">读者 / 当前操作身份</small>
        {readers.map((r) => {
          const c = countsOf(r.id);
          return (
            <button key={r.id} className={`reader ${activeReaderId === r.id ? 'active' : ''}`} onClick={() => onSelect(r.id)}>
              <span className="avatar">{r.name.slice(0, 1)}</span>
              <span className="reader-meta">
                <b>{r.name}</b>
                <small>持有 {c.loans}/{MAX_LOANS} · 预约 {c.reserves}/{MAX_RESERVES}</small>
              </span>
              {activeReaderId === r.id && <em className="me">当前</em>}
            </button>
          );
        })}
      </div>

      <div className="clock-block">
        <small className="block-label">流通时钟（可推进时间验证保留到期）</small>
        <div className="clock-now">{fmtClock(now)}</div>
        <div className="clock-btns">
          <button onClick={() => advance(6 * 3600 * 1000)}>+6 小时</button>
          <button onClick={() => advance(23 * 3600 * 1000)}>+23 小时</button>
          <button onClick={() => advance(25 * 3600 * 1000)}>+25 小时</button>
          <button onClick={() => advance(7 * 24 * 3600 * 1000)}>+7 天</button>
        </div>
        <button className="clock-reset" onClick={resetClock}>↺ 回到现实时间</button>
      </div>

      <div className="feed-block">
        <small className="block-label">流通日志</small>
        <div className="feed">
          {events.slice(0, 12).map((e, i) => (
            <div key={i} className={`feed-item kind-${e.kind}`}>
              <time>{fmtClock(e.t)}</time>
              <p>{e.text}</p>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
