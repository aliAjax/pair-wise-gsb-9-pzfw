// 流通判定层：纯函数。输入当前状态与当前时间，输出新状态或冲突说明。
// 不依赖 React、localStorage；所有“是否逾期/保留是否失效”均在调用时按 now 计算。
import {
  LOAN_DAYS, RENEW_DAYS, HOLD_HOURS, MAX_LOANS, MAX_RESERVATIONS, DAY, HOUR,
} from '../domain/seed.js';

/* ---------------- 规则编号与说明（冲突时引用） ---------------- */
export const RULES = {
  singleHolder: '一册副本在借期间只能绑定一名持有人；保留待取期间同样不能同时保留给他人。',
  maxLoans: `每位读者累计持有最多 ${MAX_LOANS} 册（借出与待取保留都计入）。`,
  maxReservations: `每位读者累计预约最多 ${MAX_RESERVATIONS} 册（排队中与待取保留都计入）。`,
  reserveWhenBusy: '仅当该书目全部副本都不在架时才能预约；已有在架副本请直接借阅。',
  noDoubleReserve: '同一读者不能为自己已持有或已预约的同一书目重复预约。',
  hold24h: `归还后队列首位获得 ${HOLD_HOURS} 小时保留；逾期未取自动释放并顺延给下一位。`,
  renewNoQueue: '仅当无人排队（等待队列为空且没有他人的待取保留）时才允许续借。',
  renewFromDue: `续借截止日自原到期日顺延 ${RENEW_DAYS} 天，而非从今天重新起算。`,
  pickupAsBorrow: '取走保留视为一次借阅，同样校验三册持有上限与保留是否在 24 小时时限内。',
};

/* ---------------- 只读查询 ---------------- */
export const getReader = (s, readerId) => s.readers.find((r) => r.id === readerId);
export const getBook = (s, bookId) => s.books.find((b) => b.id === bookId);
export const copiesOf = (s, bookId) => s.copies.filter((c) => c.bookId === bookId);
export const waitingOf = (s, bookId) => s.queues[bookId] || [];

export function readerHolds(s, readerId) {
  // 持有 = 借出 + 待取保留
  return s.copies.filter((c) => c.holderId === readerId && (c.state === 'loan' || c.state === 'hold'));
}
export function readerLoans(s, readerId) {
  return s.copies.filter((c) => c.holderId === readerId && c.state === 'loan');
}
export function readyHoldsOf(s, bookId) {
  return s.copies.filter((c) => c.bookId === bookId && c.state === 'hold');
}

export function readerReservations(s, readerId) {
  // 预约 = 排队中的条目 + 属于该读者的待取保留
  const waiting = [];
  for (const b of s.books) {
    (s.queues[b.id] || []).forEach((q, i) => {
      if (q.readerId === readerId) waiting.push({ bookId: b.id, kind: 'waiting', position: i + 1, at: q.at });
    });
  }
  const holds = s.copies
    .filter((c) => c.state === 'hold' && c.holderId === readerId)
    .map((c) => ({ bookId: c.bookId, kind: 'hold', until: c.holdUntil, copyId: c.id }));
  return [...holds, ...waiting];
}

export function readerBookStanding(s, readerId, bookId) {
  const mine = s.copies.find((c) => c.bookId === bookId && c.holderId === readerId && c.state !== 'shelf');
  const pos = (s.queues[bookId] || []).findIndex((q) => q.readerId === readerId);
  return {
    copy: mine || null,
    waitingPosition: pos >= 0 ? pos + 1 : null,
  };
}

export function availableCopy(s, bookId) {
  return s.copies.find((c) => c.bookId === bookId && c.state === 'shelf');
}

/* ---------------- 冲突说明 ---------------- */
const conflict = (title, rows, ruleId) => ({ ok: false, error: { title, rows, rule: RULES[ruleId] } });
const readerRow = (s, id) => {
  const r = getReader(s, id);
  return `读者：${r ? r.name : id}（当前持有 ${readerHolds(s, id).length}/${MAX_LOANS} 册，预约 ${readerReservations(s, id).length}/${MAX_RESERVATIONS} 册）`;
};

/* ---------------- 内部工具 ---------------- */
// 从某书目队列移除指定读者（借到同种书时自动取消其排队，避免重复获得保留）
function stripFromQueue(queues, bookId, readerId) {
  const q = queues[bookId] || [];
  const rest = q.filter((x) => x.readerId !== readerId);
  if (rest.length === q.length) return null;
  return { ...queues, [bookId]: rest };
}

/* ---------------- 内部：保留流转 ---------------- */
// 把一册在架副本发给队列首位；无人则留在架上。返回 { copies, queues, notices }
function promoteNext(copies, queues, bookId, copyId, now, s) {
  const queue = queues[bookId] || [];
  const notices = [];
  if (queue.length === 0) {
    copies = copies.map((c) => (c.id === copyId
      ? { ...c, state: 'shelf', holderId: null, loanedAt: null, dueAt: null, readyAt: null, holdUntil: null }
      : c));
    return { copies, queues, notices };
  }
  const [head, ...rest] = queue;
  const until = now + HOLD_HOURS * HOUR;
  copies = copies.map((c) => (c.id === copyId
    ? { ...c, state: 'hold', holderId: head.readerId, loanedAt: null, dueAt: null, readyAt: now, holdUntil: until }
    : c));
  queues = { ...queues, [bookId]: rest };
  const book = getBook(s, bookId);
  const reader = getReader(s, head.readerId);
  notices.push(`《${book.title}》已为 ${reader.name} 保留至保留截止时刻（${HOLD_HOURS} 小时），逾期未取自动顺延。`);
  return { copies, queues, notices };
}

/* ---------------- 定时整理：保留超时释放并顺延 ---------------- */
export function sweep(state, now) {
  let s = state;
  const notices = [];
  for (let guard = 0; guard < 200; guard++) {
    const expired = s.copies.find((c) => c.state === 'hold' && c.holdUntil <= now);
    if (!expired) break;
    const book = getBook(s, expired.bookId);
    const reader = getReader(s, expired.holderId);
    const queue = s.queues[expired.bookId] || [];
    const rest = queue.slice(1);

    let copies;
    if (queue.length === 0) {
      copies = s.copies.map((c) => (c.id === expired.id
        ? { ...c, state: 'shelf', holderId: null, loanedAt: null, dueAt: null, readyAt: null, holdUntil: null }
        : c));
    } else {
      const head = queue[0];
      const until = now + HOLD_HOURS * HOUR;
      copies = s.copies.map((c) => (c.id === expired.id
        ? { ...c, state: 'hold', holderId: head.readerId, loanedAt: null, dueAt: null, readyAt: now, holdUntil: until }
        : c));
      notices.push(`《${book.title}》原保留人 ${reader.name} 逾期未取，保留已释放并顺延给 ${getReader(s, head.readerId)?.name}。`);
    }
    s = { ...s, copies, queues: { ...s.queues, [expired.bookId]: rest } };
  }
  return { state: s, notices };
}

/* ---------------- 借阅 ---------------- */
export function borrow(state, bookId, readerId, now) {
  const s = state;
  const book = getBook(s, bookId);
  const reader = getReader(s, readerId);
  if (!book || !reader) return conflict('无法借阅', ['书目或读者不存在。'], 'singleHolder');

  const holds = readerHolds(s, readerId);
  const copy = availableCopy(s, bookId);
  if (!copy) {
    const busy = copiesOf(s, bookId)[0];
    const who = busy && busy.holderId ? getReader(s, busy.holderId) : null;
    return conflict(
      '《' + book.title + '》当前无法借阅',
      [
        `书目：《${book.title}》，全部 ${copiesOf(s, bookId).length} 个副本均不在架。`,
        who ? `当前持有人：${who.name}（副本 ${busy.code}）。` : '存在待取保留，暂无在架副本。',
        '关键时间：在架副本归还或保留释放后才会再次可借。',
      ],
      'singleHolder',
    );
  }
  if (holds.length >= MAX_LOANS) {
    return conflict(
      '《' + book.title + '》借阅被拒：持有已达上限',
      [
        `书目：《${book.title}》，副本 ${copy.code}（在架）。`,
        readerRow(s, readerId),
        `关键时间：请在归还任意一册后再借（到期/归还后额度即时释放）。`,
      ],
      'maxLoans',
    );
  }

  const dueAt = now + LOAN_DAYS * DAY;
  let copies = s.copies.map((c) => (c.id === copy.id
    ? { ...c, state: 'loan', holderId: readerId, loanedAt: now, dueAt, readyAt: null, holdUntil: null }
    : c));
  let queues = s.queues;
  const noticeBits = [`《${book.title}》（副本 ${copy.code}）已借给 ${reader.name}，到期日 ${fmtDate(dueAt)}（借期 ${LOAN_DAYS} 天）。`];
  const stripped = stripFromQueue(queues, bookId, readerId);
  if (stripped) {
    queues = stripped;
    noticeBits.push('已同时取消你在该书目上的排队预约。');
  }
  return {
    ok: true,
    state: { ...s, copies, queues },
    notice: noticeBits.join(''),
  };
}

/* ---------------- 预约（排队） ---------------- */
export function reserve(state, bookId, readerId, now) {
  const s = state;
  const book = getBook(s, bookId);
  const reader = getReader(s, readerId);
  if (!book || !reader) return conflict('无法预约', ['书目或读者不存在。'], 'reserveWhenBusy');

  const copy = availableCopy(s, bookId);
  if (copy) {
    return conflict(
      '《' + book.title + '》无需预约',
      [
        `书目：《${book.title}》，副本 ${copy.code} 已在架。`,
        readerRow(s, readerId),
        '关键时间：现在即可直接借阅，无需进入预约队列。',
      ],
      'reserveWhenBusy',
    );
  }
  const reservations = readerReservations(s, readerId);
  const { copy: mine, waitingPosition } = readerBookStanding(s, readerId, bookId);
  // 已持有/已预约同一书目：先给出更具体的重复冲突，再检查名额上限
  if (mine || waitingPosition) {
    const c = copiesOf(s, bookId)[0];
    return conflict(
      '《' + book.title + '》预约被拒：不可重复预约',
      [
        `书目：《${book.title}》。`,
        readerRow(s, readerId),
        mine
          ? `关键时间：你已持有副本 ${mine.code}${mine.state === 'hold' ? '（待取保留至 ' + fmtDate(mine.holdUntil) + '）' : '，到期日 ' + fmtDate(mine.dueAt)}。`
          : `关键时间：你已在该书目队列第 ${waitingPosition} 位。`,
      ],
      'noDoubleReserve',
    );
  }
  if (reservations.length >= MAX_RESERVATIONS) {
    return conflict(
      '《' + book.title + '》预约被拒：预约已达上限',
      [
        `书目：《${book.title}》（全部副本借出或保留中）。`,
        readerRow(s, readerId),
        '关键时间：请先取消一个排队中的预约，或取走/放弃一份待取保留。',
      ],
      'maxReservations',
    );
  }

  const queue = waitingOf(s, bookId);
  const queues = { ...s.queues, [bookId]: [...queue, { readerId, at: now }] };
  return {
    ok: true,
    state: { ...s, queues },
    notice: `《${book.title}》已为 ${reader.name} 登记预约，队列第 ${queue.length + 1} 位；归还后前位未取将自动顺延。`,
  };
}

/* ---------------- 归还：有排队即生成 24h 保留，否则回架 ---------------- */
export function returnCopy(state, copyId, now) {
  const s = state;
  const copy = s.copies.find((c) => c.id === copyId);
  if (!copy || copy.state === 'shelf' || !copy.holderId) {
    return conflict('无法归还', ['该副本当前不在借出/保留状态。'], 'singleHolder');
  }
  const book = getBook(s, copy.bookId);
  const reader = getReader(s, copy.holderId);
  const result = promoteNext(s.copies, s.queues, copy.bookId, copy.id, now, s);
  const notices = [`《${book.title}》（副本 ${copy.code}）已由 ${reader.name} 归还。`, ...result.notices];
  return { ok: true, state: { ...s, copies: result.copies, queues: result.queues }, notices };
}

/* ---------------- 续借：无人排队，自原到期日顺延 ---------------- */
export function renew(state, copyId, readerId, now) {
  const s = state;
  const copy = s.copies.find((c) => c.id === copyId);
  const book = copy && getBook(s, copy.bookId);
  const reader = getReader(s, readerId);
  if (!copy || !book || !reader) return conflict('无法续借', ['副本或读者不存在。'], 'renewNoQueue');
  if (copy.state !== 'loan' || copy.holderId !== readerId) {
    return conflict('《' + book.title + '》续借被拒', [
      `书目：《${book.title}》，副本 ${copy.code}。`,
      readerRow(s, readerId),
      '只有当前持有的借出副本可续借。',
    ], 'singleHolder');
  }

  const waiting = waitingOf(s, book.id);
  const othersHold = readyHoldsOf(s, book.id).some((c) => c.holderId !== readerId);
  if (waiting.length > 0 || othersHold) {
    const rows = [
      `书目：《${book.title}》，副本 ${copy.code}，原到期日 ${fmtDate(copy.dueAt)}。`,
      readerRow(s, readerId),
    ];
    if (waiting.length) {
      const names = waiting.map((q, i) => `${i + 1}. ${getReader(s, q.readerId)?.name}`).join('；');
      rows.push(`关键时间：已有 ${waiting.length} 人排队（${names}），归还后将进入 ${HOLD_HOURS} 小时保留。`);
    }
    if (othersHold) rows.push(`关键时间：存在他人的待取保留，不能续借。`);
    return conflict('《' + book.title + '》续借被拒：有人排队', rows, 'renewNoQueue');
  }

  const newDue = copy.dueAt + RENEW_DAYS * DAY;
  const copies = s.copies.map((c) => (c.id === copy.id ? { ...c, dueAt: newDue } : c));
  return {
    ok: true,
    state: { ...s, copies },
    notice: `《${book.title}》已续借，截止日自原到期日 ${fmtDate(copy.dueAt)} 顺延 ${RENEW_DAYS} 天，新到期日 ${fmtDate(newDue)}。`,
  };
}

/* ---------------- 取走保留 ---------------- */
export function pickup(state, copyId, readerId, now) {
  const s = state;
  const copy = s.copies.find((c) => c.id === copyId);
  const book = copy && getBook(s, copy.bookId);
  const reader = getReader(s, readerId);
  if (!copy || !book || !reader) return conflict('无法取书', ['副本或读者不存在。'], 'pickupAsBorrow');
  if (copy.state !== 'hold' || copy.holderId !== readerId) {
    return conflict('《' + book.title + '》无法取书', [
      `书目：《${book.title}》，副本 ${copy.code}。`,
      readerRow(s, readerId),
      '该副本当前不是为你保留的待取状态。',
    ], 'singleHolder');
  }
  if (now > copy.holdUntil) {
    return conflict('《' + book.title + '》保留已过期', [
      `书目：《${book.title}》，副本 ${copy.code}。`,
      readerRow(s, readerId),
      `关键时间：保留截止 ${fmtDate(copy.holdUntil)}；24 小时内未取，保留已自动顺延给下一位。`,
    ], 'hold24h');
  }
  if (readerHolds(s, readerId).length >= MAX_LOANS) {
    return conflict('《' + book.title + '》取书被拒：持有已达上限', [
      `书目：《${book.title}》，副本 ${copy.code}（保留至 ${fmtDate(copy.holdUntil)}）。`,
      readerRow(s, readerId),
      '取走保留按一次借阅计算，请先归还一册。',
    ], 'pickupAsBorrow');
  }
  const dueAt = now + LOAN_DAYS * DAY;
  const copies = s.copies.map((c) => (c.id === copy.id
    ? { ...c, state: 'loan', holderId: readerId, loanedAt: now, dueAt, readyAt: null, holdUntil: null }
    : c));
  return {
    ok: true,
    state: { ...s, copies },
    notice: `${reader.name} 已取走《${book.title}》（副本 ${copy.code}），到期日 ${fmtDate(dueAt)}。`,
  };
}

/* ---------------- 取消预约 ---------------- */
export function cancelReservation(state, bookId, readerId) {
  const s = state;
  const book = getBook(s, bookId);
  const queue = waitingOf(s, bookId);
  const idx = queue.findIndex((q) => q.readerId === readerId);
  if (idx < 0) return conflict('无法取消预约', ['你不在该书目的等待队列中。'], 'noDoubleReserve');
  const next = queue.slice();
  next.splice(idx, 1);
  const reader = getReader(s, readerId);
  return {
    ok: true,
    state: { ...s, queues: { ...s.queues, [bookId]: next } },
    notice: `${reader.name} 已取消《${book.title}》的排队预约，后续读者自动前移。`,
  };
}

/* ---------------- 领域结构操作（新书/新副本/新读者） ---------------- */
export function addBookCopy(state, book) {
  const id = Math.max(0, ...state.books.map((b) => b.id)) + 1;
  const copyId = `c${id}-a`;
  const newBook = { ...book, id };
  return {
    ...state,
    books: [...state.books, newBook],
    copies: [...state.copies, {
      id: copyId, bookId: id, code: 'A', state: 'shelf',
      holderId: null, loanedAt: null, dueAt: null, readyAt: null, holdUntil: null,
    }],
  };
}

export function addCopy(state, bookId) {
  const n = copiesOf(state, bookId).length + 1;
  const code = String.fromCharCode(64 + n); // 1->A, 2->B ...
  const id = `c${bookId}-${code.toLowerCase()}-${Date.now().toString(36)}`;
  return { ...state, copies: [...state.copies, {
    id, bookId, code, state: 'shelf',
    holderId: null, loanedAt: null, dueAt: null, readyAt: null, holdUntil: null,
  }] };
}

export function updateBookNote(state, bookId, notes) {
  return { ...state, books: state.books.map((b) => (b.id === bookId ? { ...b, notes } : b)) };
}

/* ---------------- 时间格式化（供界面复用的纯函数） ---------------- */
export function fmtDate(ts) {
  if (ts == null) return '—';
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fmtCountdown(ms) {
  if (ms <= 0) return '已到期';
  const h = Math.floor(ms / HOUR);
  const m = Math.floor((ms % HOUR) / 60000);
  const d = Math.floor(h / 24);
  if (d >= 1) return `剩 ${d} 天 ${h % 24} 小时`;
  if (h >= 1) return `剩 ${h} 小时 ${m} 分`;
  return `剩 ${m} 分钟`;
}
