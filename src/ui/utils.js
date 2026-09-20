// 界面专用的展示工具：时间/截止日的人类可读格式。判定不依赖这里。
export function fmtDateTime(t) {
  if (t == null) return '—';
  return new Date(t).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

export function fmtDate(t) {
  if (t == null) return '—';
  return new Date(t).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

export function fmtClock(t) {
  return new Date(t).toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
}

// 剩余/逾期描述，如“剩余 18 小时”“已逾期 2 天”
export function remainLabel(deadline, now, suffix = '') {
  const ms = deadline - now;
  const absH = Math.round(Math.abs(ms) / (3600 * 1000));
  const absD = Math.round(Math.abs(ms) / (24 * 3600 * 1000));
  const span = absH >= 24 ? `${absD} 天` : `${absH} 小时`;
  if (ms >= 0) return `剩余 ${span}${suffix}`;
  return `已逾期 ${span}${suffix}`;
}

export function fmtEventTime(t) {
  return new Date(t).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
}
