// 流通判定层：纯函数状态机。输入状态与当前时间，输出新状态 + 结果，
// 不读 localStorage、不依赖 React，便于单独推演与测试。
import {
  RULES, LOAN_PERIOD_DAYS, HOLD_PERIOD_DAYS, MAX_LOANS, MAX_RESERVES, DAY, STATUS,
} from './rules.js';

// ---------- 派生查询 ----------
export function readerCounts(state, readerId) {
  let loans = 0;
  let reserves = 0;
  for (const c of state.copies) {
    if (c.holderId === readerId) loans += 1;
    if (c.holdReaderId === readerId || c.queue.includes(readerId)) reserves += 1;
  }
  return { loans, reserves };
}

export function copyStatus(copy, now) {
  if (copy.holderId) return STATUS.ON_LOAN;
  if (copy.holdReaderId && copy.holdUntil > now) return STATUS.ON_HOLD;
  return STATUS.AVAILABLE;
}

// 保留是否已到点（到期未取）。注意：不直接改写状态，只负责判定，
// 真正的释放顺延由 settle 统一完成，保证重载/操作两条路径结果一致。
function expiredHolds(copies, now) {
  return copies.filter((c) => c.holdReaderId && c.holdUntil <= now);
}

// ---------- 时间推进：逾期保留自动释放并顺延 ----------
// 每次取状态前都先过一遍：已过期的 24 小时保留释放，队列首位顺延获得新保留。
// 可能级联（某册连续释放多人），故循环到稳定。
export function settle(state, now) {
  const copies = state.copies.map((c) => ({ ...c, queue: [...c.queue] }));
  const events = [...state.events];
  const notices = [];
  const litTitle = (litId) => state.literature.find((x) => x.id === litId)?.title ?? '未知文献';
  const readerName = (id) => state.readers.find((r) => r.id === id)?.name ?? '未知读者';

  let changed = true;
  while (changed) {
    changed = false;
    for (const c of copies) {
      if (c.holdReaderId && c.holdUntil <= now && !c.holderId) {
        const missed = c.holdReaderId;
        c.holdReaderId = null;
        c.holdUntil = null;
        changed = true;
        events.unshift({
          t: now, kind: 'release',
          text: `${readerName(missed)} 逾期未取《${litTitle(c.litId)}》(${c.code})，保留自动释放（规则 R4）`,
        });
        notices.push({ copyId: c.id, readerId: missed, rule: 'R4' });
        if (c.queue.length) {
          const next = c.queue.shift();
          c.holdReaderId = next;
          c.holdUntil = now + HOLD_PERIOD_DAYS * DAY;
          events.unshift({
            t: now, kind: 'hold',
            text: `《${litTitle(c.litId)}》(${c.code}) 顺延保留给队列首位 ${readerName(next)}，保留至 ${fmtTime(c.holdUntil)}`,
          });
        }
      }
    }
  }

  const next = { ...state, copies, events };
  return { state: next, notices, expiredCopies: expiredHolds(copies, now) };
}

// ---------- 结果工具 ----------
function ok(state, events, extra = {}) {
  return { ok: true, state, events: events ?? [], ...extra };
}
function fail(rule, message, detail) {
  return { ok: false, rule, ruleText: RULES[rule].text, message, detail };
}

const findCopy = (state, copyId) => state.copies.find((c) => c.id === copyId);
const findLit = (state, litId) => state.literature.find((l) => l.id === litId);
const readerName = (state, id) => state.readers.find((r) => r.id === id)?.name ?? '未知读者';
const litName = (state, id) => findLit(state, id)?.title ?? '未知文献';
const fmtTime = (t) => new Date(t).toLocaleString('zh-CN', { hour12: false });

function withCopies(state, copies) {
  return { ...state, copies };
}
function log(state, ev) {
  return { ...state, events: [{ t: ev.at, kind: ev.kind, text: ev.text }, ...state.events] };
}

// ---------- 操作：借出 ----------
export function borrow(state, copyId, readerId, now) {
  const copy = findCopy(state, copyId);
  if (!copy) return fail('R8', '找不到该馆藏副本', { copyId });
  const reader = state.readers.find((r) => r.id === readerId);
  if (!reader) return fail('R2', '读者不存在', { readerId });

  if (copy.holderId) {
    return fail('R1', `《${litName(state, copy.litId)}》${copy.code} 当前由 ${readerName(state, copy.holderId)} 持有，在借期间不能再绑定他人`, {
      book: `${litName(state, copy.litId)} (${copy.code})`,
      reader: reader.name,
      time: fmtTime(now),
      holder: readerName(state, copy.holderId),
      dueAt: fmtTime(copy.dueAt),
    });
  }
  if (copy.holdReaderId) {
    if (copy.holdReaderId === readerId) {
      return fail('R7', `该册正保留给 ${reader.name} 本人，请使用「取书」而不是直接借出`, {
        book: `${litName(state, copy.litId)} (${copy.code})`, reader: reader.name, time: fmtTime(now), holdUntil: fmtTime(copy.holdUntil),
      });
    }
    return fail('R1', `该册已保留给 ${readerName(state, copy.holdReaderId)}，不能在保留期间借给他人（可排队预约）`, {
      book: `${litName(state, copy.litId)} (${copy.code})`, reader: reader.name, time: fmtTime(now),
      holdReader: readerName(state, copy.holdReaderId), holdUntil: fmtTime(copy.holdUntil),
    });
  }
  const { loans, reserves } = readerCounts(state, readerId);
  if (loans >= MAX_LOANS) {
    return fail('R2', `${reader.name} 已持有 ${loans} 册，达到累计持有上限 ${MAX_LOANS} 册，需先归还`, {
      reader: reader.name, time: fmtTime(now), loans, maxLoans: MAX_LOANS,
    });
  }

  const dueAt = now + LOAN_PERIOD_DAYS * DAY;
  const copies = state.copies.map((c) => c.id === copyId ? {
    ...c, holderId: readerId, loanedAt: now, dueAt, holdReaderId: null, holdUntil: null,
  } : c);
  let next = withCopies(state, copies);
  next = log(next, {
    at: now, kind: 'loan',
    text: `${reader.name} 借出《${litName(state, copy.litId)}》(${copy.code})，到期 ${fmtTime(dueAt)}${reserves ? `；其原排队/保留名额已释放，当前预约 ${reserves} 项` : ''}`,
  });
  return ok(next, [{ kind: 'loan', text: `借出成功，到期日 ${fmtTime(dueAt)}` }]);
}

// ---------- 操作：排队预约 ----------
export function reserve(state, copyId, readerId, now) {
  const copy = findCopy(state, copyId);
  if (!copy) return fail('R6', '找不到该馆藏副本', { copyId });
  const reader = state.readers.find((r) => r.id === readerId);
  if (!reader) return fail('R3', '读者不存在', { readerId });

  if (copy.holderId === readerId) {
    return fail('R6', `${reader.name} 本人正持有该册，无需预约`, {
      book: `${litName(state, copy.litId)} (${copy.code})`, reader: reader.name, time: fmtTime(now),
    });
  }
  if (!copy.holderId && !copy.holdReaderId) {
    return fail('R8', `该册当前在架，可直接借出，无需排队`, {
      book: `${litName(state, copy.litId)} (${copy.code})`, reader: reader.name, time: fmtTime(now),
    });
  }
  if (copy.holdReaderId === readerId || copy.queue.includes(readerId)) {
    return fail('R6', `${reader.name} 已在《${litName(state, copy.litId)}》${copy.code} 的保留/队列中，不能重复预约`, {
      book: `${litName(state, copy.litId)} (${copy.code})`, reader: reader.name, time: fmtTime(now),
      position: copy.holdReaderId === readerId ? 0 : copy.queue.indexOf(readerId) + 1,
    });
  }
  const { loans, reserves } = readerCounts(state, readerId);
  if (reserves >= MAX_RESERVES) {
    return fail('R3', `${reader.name} 已有 ${reserves} 项预约（排队中或待取保留），达到上限 ${MAX_RESERVES} 项`, {
      reader: reader.name, time: fmtTime(now), reserves, maxReserves: MAX_RESERVES, loans,
    });
  }

  const queue = [...copy.queue, readerId];
  const copies = state.copies.map((c) => c.id === copyId ? { ...c, queue } : c);
  let next = withCopies(state, copies);
  const target = copy.holdReaderId ? `保留者 ${readerName(state, copy.holdReaderId)} 之后` : `持有人 ${readerName(state, copy.holderId)} 之后`;
  next = log(next, {
    at: now, kind: 'reserve',
    text: `${reader.name} 预约《${litName(state, copy.litId)}》(${copy.code})，排在${target}，队列第 ${queue.length} 位`,
  });
  return ok(next, [{ kind: 'reserve', text: `已进入队列第 ${queue.length} 位；归还后将获得 24 小时保留` }]);
}

// ---------- 操作：归还（触发队列首位 24h 保留） ----------
export function returnCopy(state, copyId, now) {
  const copy = findCopy(state, copyId);
  if (!copy) return fail('R1', '找不到该馆藏副本', { copyId });
  if (!copy.holderId) {
    return fail('R1', '该册当前不在借出状态，无法归还', {
      book: `${litName(state, copy.litId)} (${copy.code})`, time: fmtTime(now),
    });
  }
  const holder = readerName(state, copy.holderId);
  const copies = state.copies.map((c) => c.id === copyId ? {
    ...c, holderId: null, loanedAt: null, dueAt: null,
  } : c);
  let next = withCopies(state, copies);
  const updated = findCopy(next, copyId);
  let msg = `${holder} 归还《${litName(state, copy.litId)}》(${copy.code})`;
  if (updated.queue.length) {
    const first = updated.queue[0];
    const holdUntil = now + HOLD_PERIOD_DAYS * DAY;
    next = withCopies(next, next.copies.map((c) => c.id === copyId ? {
      ...c, queue: c.queue.slice(1), holdReaderId: first, holdUntil,
    } : c));
    msg += `，队列首位 ${readerName(state, first)} 获得 24 小时保留，保留至 ${fmtTime(holdUntil)}（规则 R4）`;
  } else {
    msg += '，无人排队，回到在架';
  }
  next = log(next, { at: now, kind: 'return', text: msg });
  return ok(next, [{ kind: 'return', text: msg }]);
}

// ---------- 操作：续借（无人排队，自原到期日顺延） ----------
export function renew(state, copyId, readerId, now) {
  const copy = findCopy(state, copyId);
  if (!copy) return fail('R5', '找不到该馆藏副本', { copyId });
  const reader = state.readers.find((r) => r.id === readerId);
  if (!reader) return fail('R2', '读者不存在', { readerId });

  if (!copy.holderId) {
    return fail('R5', '该册不在借出状态，无需续借', {
      book: `${litName(state, copy.litId)} (${copy.code})`, time: fmtTime(now),
    });
  }
  if (copy.holderId !== readerId) {
    return fail('R1', `该册由 ${readerName(state, copy.holderId)} 持有，${reader.name} 不能代为续借`, {
      book: `${litName(state, copy.litId)} (${copy.code})`, reader: reader.name, time: fmtTime(now),
      holder: readerName(state, copy.holderId),
    });
  }
  if (copy.holdReaderId || copy.queue.length) {
    const holdPart = copy.holdReaderId ? `待取保留（${readerName(state, copy.holdReaderId)}）、` : '';
    return fail('R5', `《${litName(state, copy.litId)}》${copy.code} 已有${holdPart}${copy.queue.length} 人排队，不能续借`, {
      book: `${litName(state, copy.litId)} (${copy.code})`, reader: reader.name, time: fmtTime(now),
      queue: copy.queue.map((id) => readerName(state, id)),
      holdReader: copy.holdReaderId ? readerName(state, copy.holdReaderId) : null,
    });
  }
  // 自【原到期日】顺延，而非从今天起算——逾期后续借也一样
  const oldDue = copy.dueAt;
  const newDue = oldDue + LOAN_PERIOD_DAYS * DAY;
  const copies = state.copies.map((c) => c.id === copyId ? { ...c, dueAt: newDue } : c);
  let next = withCopies(state, copies);
  next = log(next, {
    at: now, kind: 'renew',
    text: `${reader.name} 续借《${litName(state, copy.litId)}》(${copy.code})，到期日自原到期 ${fmtTime(oldDue)} 顺延至 ${fmtTime(newDue)}（规则 R5）`,
  });
  return ok(next, [{ kind: 'renew', text: `续借成功，新到期日 ${fmtTime(newDue)}（自原到期日顺延）` }]);
}

// ---------- 操作：保留取书 ----------
export function pickup(state, copyId, readerId, now) {
  const copy = findCopy(state, copyId);
  if (!copy) return fail('R7', '找不到该馆藏副本', { copyId });
  const reader = state.readers.find((r) => r.id === readerId);
  if (!reader) return fail('R2', '读者不存在', { readerId });

  if (copy.holderId) {
    return fail('R1', '该册尚在借出，不能取书', {
      book: `${litName(state, copy.litId)} (${copy.code})`, reader: reader.name, time: fmtTime(now),
      holder: readerName(state, copy.holderId),
    });
  }
  if (!copy.holdReaderId) {
    return fail('R7', '该册当前没有为任何人保留', {
      book: `${litName(state, copy.litId)} (${copy.code})`, reader: reader.name, time: fmtTime(now),
    });
  }
  if (copy.holdReaderId !== readerId) {
    return fail('R7', `该册保留给 ${readerName(state, copy.holdReaderId)}，${reader.name} 不能取；可排队预约`, {
      book: `${litName(state, copy.litId)} (${copy.code})`, reader: reader.name, time: fmtTime(now),
      holdReader: readerName(state, copy.holdReaderId), holdUntil: fmtTime(copy.holdUntil),
    });
  }
  if (copy.holdUntil <= now) {
    return fail('R7', `24 小时保留已截止（${fmtTime(copy.holdUntil)}），资格已释放并顺延`, {
      book: `${litName(state, copy.litId)} (${copy.code})`, reader: reader.name, time: fmtTime(now),
      holdUntil: fmtTime(copy.holdUntil),
    });
  }
  const { loans } = readerCounts(state, readerId);
  if (loans >= MAX_LOANS) {
    return fail('R2', `${reader.name} 已持有 ${loans} 册，达到上限 ${MAX_LOANS} 册；请先归还其他图书或等待保留超时释放`, {
      reader: reader.name, time: fmtTime(now), loans, maxLoans: MAX_LOANS, holdUntil: fmtTime(copy.holdUntil),
    });
  }
  const dueAt = now + LOAN_PERIOD_DAYS * DAY;
  const copies = state.copies.map((c) => c.id === copyId ? {
    ...c, holderId: readerId, loanedAt: now, dueAt, holdReaderId: null, holdUntil: null,
  } : c);
  let next = withCopies(state, copies);
  next = log(next, {
    at: now, kind: 'loan',
    text: `${reader.name} 在保留期限内取走《${litName(state, copy.litId)}》(${copy.code})，到期 ${fmtTime(dueAt)}`,
  });
  return ok(next, [{ kind: 'loan', text: `取书成功，到期日 ${fmtTime(dueAt)}` }]);
}

// ---------- 操作：取消排队 / 放弃保留 ----------
export function cancelReserve(state, copyId, readerId, now) {
  const copy = findCopy(state, copyId);
  if (!copy) return fail('R6', '找不到该馆藏副本', { copyId });
  const inQueue = copy.queue.includes(readerId);
  const isHold = copy.holdReaderId === readerId;
  if (!inQueue && !isHold) {
    return fail('R6', '你不在该册的队列或保留名单中', {
      book: `${litName(state, copy.litId)} (${copy.code})`, reader: readerName(state, readerId), time: fmtTime(now),
    });
  }
  const copies = state.copies.map((c) => {
    if (c.id !== copyId) return c;
    return { ...c, queue: c.queue.filter((id) => id !== readerId), holdReaderId: isHold ? null : c.holdReaderId, holdUntil: isHold ? null : c.holdUntil };
  });
  let next = withCopies(state, copies);
  next = log(next, {
    at: now, kind: 'cancel',
    text: `${readerName(state, readerId)} ${isHold ? '放弃' : '取消排队'}《${litName(state, copy.litId)}》(${copy.code})`,
  });
  return ok(next, [{ kind: 'cancel', text: isHold ? '已放弃保留，图书回到在架' : '已退出队列' }]);
}

// ---------- 资料维护 ----------
export function addLiterature(state, data, now) {
  const id = state.seq.literature + 1;
  const code = `${(data.title || 'NEW').replace(/[^A-Za-z一-鿿]/g, '').slice(0, 3).toUpperCase().padEnd(3, 'X')}-001`;
  const item = {
    id, title: data.title || '未命名文献', authors: data.authors || '佚名', year: Number(data.year) || null,
    venue: data.venue || '', tags: data.tags || [], abstract: data.abstract || '',
    cite: `${data.authors || '佚名'} (${data.year || 'n.d.'}). ${data.title || '未命名文献'}. ${data.venue || ''}`, notes: '',
  };
  const copy = { id: `c${state.seq.copy}`, litId: id, code, holderId: null, loanedAt: null, dueAt: null, holdReaderId: null, holdUntil: null, queue: [] };
  const next = {
    ...state,
    literature: [...state.literature, item],
    copies: [...state.copies, copy],
    seq: { ...state.seq, literature: id, copy: state.seq.copy + 1 },
  };
  return ok(log(next, { at: now, kind: 'system', text: `新增文献《${item.title}》，入藏 1 册（${code}）` }),
    [{ kind: 'system', text: `文献已入藏：${code}` }]);
}

export function addReader(state, name, now) {
  const id = `r${state.seq.reader}`;
  const next = {
    ...state,
    readers: [...state.readers, { id, name }],
    seq: { ...state.seq, reader: state.seq.reader + 1 },
  };
  return ok(log(next, { at: now, kind: 'system', text: `新读者登记：${name}（${id}）` }),
    [{ kind: 'system', text: `读者 ${name} 已登记` }]);
}

export function setNotes(state, litId, notes) {
  return { ...state, literature: state.literature.map((l) => l.id === litId ? { ...l, notes } : l) };
}

export const OPERATIONS = {
  borrow, reserve, returnCopy, renew, pickup, cancelReserve,
};
