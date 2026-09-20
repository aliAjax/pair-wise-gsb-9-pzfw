// 冲突提示：结构化展示图书、读者、关键时间与命中的规则；成功操作走普通提示
import React, { useEffect } from 'react';

export default function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(onClose, toast.kind === 'error' ? 9000 : 3600);
    return () => clearTimeout(t);
  }, [toast, onClose]);

  if (!toast) return null;
  if (toast.kind === 'error') {
    const e = toast.error;
    return (
      <div className="toast toast-error">
        <div className="toast-head">
          <span className="toast-badge">冲突</span>
          <strong>{e.title}</strong>
          <button onClick={onClose}>×</button>
        </div>
        <ul>
          {e.rows.map((r, i) => <li key={i}>{r}</li>)}
        </ul>
        <div className="toast-rule"><b>命中规则：</b>{e.rule}</div>
      </div>
    );
  }
  return (
    <div className="toast toast-ok">
      <span>{toast.text}</span>
      <button onClick={onClose}>×</button>
    </div>
  );
}
