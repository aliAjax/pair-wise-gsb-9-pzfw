// 流通台时钟条：展示流通判定所用的当前时间。
// “推进时间”只移动模拟偏移量；保留超时释放等判定仍由流通层按该时间计算，
// 因此可以直接演示 24 小时保留逾期顺延，而不需要修改任何存储数据。
import React from 'react';
import { fmtDate } from '../circulation/engine.js';
import { HOUR } from '../domain/seed.js';

export default function ClockBar({ clockNow, offset, onAdvance, onReset }) {
  return (
    <div className="clockbar">
      <div className="clock-now">
        <span className="clock-dot" />
        流通时间 <strong>{fmtDate(clockNow)}</strong>
        {offset !== 0 && <em className="clock-offset">模拟时钟 · {fmtOffset(offset)}</em>}
      </div>
      <div className="clock-jump">
        <small>推进时间以验证保留/到期规则：</small>
        <button onClick={() => onAdvance(HOUR)}>+1 小时</button>
        <button onClick={() => onAdvance(6 * HOUR)}>+6 小时</button>
        <button onClick={() => onAdvance(24 * HOUR)}>+24 小时</button>
        <button onClick={() => onAdvance(7 * 24 * HOUR)}>+7 天</button>
        {offset !== 0 && <button className="reset" onClick={onReset}>回到真实时间</button>}
      </div>
    </div>
  );
}

function fmtOffset(ms) {
  const sign = ms > 0 ? '+' : '−';
  const abs = Math.abs(ms);
  const h = Math.round(abs / HOUR);
  if (h % 24 === 0) return `${sign}${h / 24} 天`;
  return `${sign}${h} 小时`;
}
