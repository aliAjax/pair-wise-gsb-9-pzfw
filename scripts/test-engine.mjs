// 流通引擎规则推演：node scripts/test-engine.mjs
// 纯 Node 运行，不引入任何依赖。每个用例断言命中的规则、关键时间与状态流转。
import assert from 'node:assert/strict';
import { seedState, SEED_NOW } from '../src/domain/data.js';
import {
  settle, borrow, reserve, returnCopy, renew, pickup, cancelReserve,
  addLiterature, addReader, readerCounts, copyStatus,
} from '../src/domain/engine.js';
import { LOAN_PERIOD_DAYS, HOLD_PERIOD_DAYS, MAX_LOANS, MAX_RESERVES, STATUS, DAY } from '../src/domain/rules.js';

let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log(`  ✓ ${name}`); };
const fresh = () => seedState();
const find = (s, id) => s.copies.find((c) => c.id === id);
const T0 = SEED_NOW;

console.log('R1 在借互斥：');
test('在架册可借出，借出后他人再借被拒（R1），并给出持有人/到期日', () => {
  let s = fresh();
  const r = borrow(s, 'c2', 'r2', T0 + DAY); // c2 在架
  assert.ok(r.ok);
  s = r.state;
  const block = borrow(s, 'c2', 'r3', T0 + DAY);
  assert.equal(block.ok, false);
  assert.equal(block.rule, 'R1');
  assert.equal(block.detail.holder, '周砚');
  assert.ok(block.detail.dueAt.includes('/'));
});

test('保留中的册不能借给他人（R1：不能同时保留给他人），本人也应走取书（R7）', () => {
  const s = fresh(); // c4 保留给 r4
  assert.equal(borrow(s, 'c4', 'r2', T0).rule, 'R1');
  assert.equal(borrow(s, 'c4', 'r4', T0).rule, 'R7');
});

console.log('R2 持有上限 3 册：');
test('r1 已持 c1/c5/c6 共 3 册，再借在架 c2 被拒（R2）', () => {
  const s = fresh();
  assert.equal(readerCounts(s, 'r1').loans, 3);
  const r = borrow(s, 'c2', 'r1', T0);
  assert.equal(r.ok, false);
  assert.equal(r.rule, 'R2');
  assert.equal(r.detail.loans, 3);
});

console.log('R3 预约上限 2 项：');
test('r3 已排队 c1+c3 共 2 项，再约 c4 被拒（R3）', () => {
  const s = fresh();
  assert.equal(readerCounts(s, 'r3').reserves, 2);
  const r = reserve(s, 'c4', 'r3', T0);
  assert.equal(r.ok, false);
  assert.equal(r.rule, 'R3');
});

test('重复预约同册被拒（R6）；在架册不接受预约（R8）', () => {
  const s = fresh();
  assert.equal(reserve(s, 'c1', 'r2', T0).rule, 'R6'); // r2 已在 c1 队列
  assert.equal(reserve(s, 'c2', 'r2', T0).rule, 'R8'); // c2 在架
});

console.log('R4 归还→首位 24h 保留→逾期释放顺延：');
test('归还 c3 后 r3 获得保留，holdUntil = 归还时刻 + 24h，册为保留中', () => {
  let s = fresh();
  const t = T0 + 3 * DAY;
  const r = returnCopy(s, 'c3', t);
  assert.ok(r.ok);
  s = r.state;
  const c = find(s, 'c3');
  assert.equal(c.holderId, null);
  assert.equal(c.holdReaderId, 'r3');
  assert.equal(c.holdUntil, t + HOLD_PERIOD_DAYS * DAY);
  assert.equal(copyStatus(c, t + 1), STATUS.ON_HOLD);
});

test('r3 逾期未取，settle 自动释放；队列无人则回到在架（R4）', () => {
  let s = fresh();
  const t = T0 + 3 * DAY;
  s = returnCopy(s, 'c3', t).state;
  const after = settle(s, t + HOLD_PERIOD_DAYS * DAY + 1000);
  const c = find(after.state, 'c3');
  assert.equal(c.holdReaderId, null);
  assert.equal(c.holdUntil, null);
  assert.equal(copyStatus(c, t + 2 * DAY), STATUS.AVAILABLE);
  assert.ok(after.notices.some((n) => n.readerId === 'r3' && n.rule === 'R4'));
});

test('级联顺延：保留给 r3 逾期后，队列下一位 r2 获得新的 24h 保留', () => {
  let s = fresh();
  // 构造：c2 借给新读者 r5，队列 r4、r2（r4 另有 c4 保留，名额恰好 2 项）
  s = addReader(s, '测试读者', T0).state;
  s = borrow(s, 'c2', 'r5', T0).state;
  s = reserve(s, 'c2', 'r4', T0 + 1000).state;
  s = reserve(s, 'c2', 'r2', T0 + 2000).state;
  // r1 归还 -> r4 保留
  const ret = T0 + 2 * DAY;
  s = returnCopy(s, 'c2', ret).state;
  assert.equal(find(s, 'c2').holdReaderId, 'r4');
  // r4 不取，超时
  const expire = ret + HOLD_PERIOD_DAYS * DAY + 1000;
  s = settle(s, expire).state;
  const c = find(s, 'c2');
  assert.equal(c.holdReaderId, 'r2');
  assert.equal(c.holdUntil, expire + HOLD_PERIOD_DAYS * DAY);
  assert.equal(c.queue.length, 0);
  // r2 也不取，再超时 -> 在架
  s = settle(s, expire + HOLD_PERIOD_DAYS * DAY + 1000).state;
  const c2 = find(s, 'c2');
  assert.equal(c2.holdReaderId, null);
  assert.equal(copyStatus(c2, expire + 2 * DAY), STATUS.AVAILABLE);
});

console.log('R5 续借：');
test('c5（r1 持有、无人排队）可续借，新到期日 = 原到期日 + 14 天，而非今天+14', () => {
  const s = fresh();
  const c = find(s, 'c5');
  const oldDue = c.dueAt;
  const r = renew(s, 'c5', 'r1', T0 + 10 * DAY); // 已过 10 天后续借
  assert.ok(r.ok, r.message);
  assert.equal(find(r.state, 'c5').dueAt, oldDue + LOAN_PERIOD_DAYS * DAY);
});

test('逾期后续借仍自原到期日顺延（R5）', () => {
  const s = fresh(); // c6 到期 = T0 + 2 天
  const oldDue = find(s, 'c6').dueAt;
  const now = oldDue + 5 * DAY; // 已逾期 5 天
  const r = renew(s, 'c6', 'r1', now);
  assert.ok(r.ok);
  assert.equal(find(r.state, 'c6').dueAt, oldDue + LOAN_PERIOD_DAYS * DAY);
});

test('有人排队时续借被拒（R5）：c1 有 r2/r3 排队', () => {
  const s = fresh();
  const r = renew(s, 'c1', 'r1', T0);
  assert.equal(r.ok, false);
  assert.equal(r.rule, 'R5');
  assert.deepEqual(r.detail.queue, ['周砚', '陈穗']);
});

test('非持有人不能代续借（R1+R5 判定为持有人不符）', () => {
  const s = fresh();
  assert.equal(renew(s, 'c5', 'r2', T0).rule, 'R1');
});

console.log('R7 保留取书：');
test('r4 在保留期内取 c4 成功，起算新 14 天借期', () => {
  const s = fresh();
  const t = T0 + 5 * 3600 * 1000;
  const r = pickup(s, 'c4', 'r4', t);
  assert.ok(r.ok, r.message);
  const c = find(r.state, 'c4');
  assert.equal(c.holderId, 'r4');
  assert.equal(c.dueAt, t + LOAN_PERIOD_DAYS * DAY);
  assert.equal(c.holdReaderId, null);
});

test('保留超时后取书被拒（R7）；非保留人取书被拒；持满 3 册取书被拒（R2）', () => {
  let s = fresh();
  const until = find(s, 'c4').holdUntil;
  assert.equal(pickup(s, 'c4', 'r4', until + 1000).rule, 'R7');
  assert.equal(pickup(s, 'c4', 'r2', T0).rule, 'R7');
  // 构造一本保留给 r1 的书，但 r1 已持 3 册
  s = borrow(s, 'c2', 'r2', T0).state;
  s = reserve(s, 'c2', 'r1', T0 + 1000).state;
  s = returnCopy(s, 'c2', T0 + 2000).state;
  assert.equal(find(s, 'c2').holdReaderId, 'r1');
  assert.equal(pickup(s, 'c2', 'r1', T0 + 3000).rule, 'R2');
});

console.log('取消与名额释放：');
test('r3 取消 c1 排队后，预约数回落；放弃保留后书回在架', () => {
  let s = fresh();
  s = cancelReserve(s, 'c1', 'r3', T0).state;
  assert.deepEqual(find(s, 'c1').queue, ['r2']);
  assert.equal(readerCounts(s, 'r3').reserves, 1);
  s = cancelReserve(s, 'c4', 'r4', T0).state;
  assert.equal(copyStatus(find(s, 'c4'), T0), STATUS.AVAILABLE);
});

console.log('资料维护：');
test('新增文献自动入藏 1 个在架副本；新读者登记', () => {
  let s = fresh();
  const r = addLiterature(s, { title: 'New Book', authors: 'Doe, J.', year: '2026', venue: 'X Press', tags: ['x'] }, T0);
  s = r.state;
  const lit = s.literature.at(-1);
  const cp = s.copies.find((c) => c.litId === lit.id);
  assert.ok(cp);
  assert.equal(copyStatus(cp, T0), STATUS.AVAILABLE);
  s = addReader(s, '新读者', T0).state;
  assert.equal(s.readers.at(-1).name, '新读者');
});

console.log('持久化口径（settle 幂等，不依赖真实时钟）：');
test('同一时间多次 settle 结果一致，不产生重复日志漂移', () => {
  const s = fresh();
  const a = settle(s, T0 + 100 * DAY).state;
  const b = settle(a, T0 + 100 * DAY).state;
  assert.deepEqual(a.copies, b.copies);
  assert.equal(a.events.length, b.events.length);
});

console.log(`\n全部 ${passed} 项规则推演通过。`);
