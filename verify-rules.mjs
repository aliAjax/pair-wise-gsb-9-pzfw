// 流通规则验证脚本：node verify-rules.mjs（不参与前端打包）
import { buildSeed, DAY, HOUR, MAX_LOANS, MAX_RESERVATIONS } from './src/domain/seed.js';
import * as E from './src/circulation/engine.js';

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
}

const t0 = Date.parse('2026-09-20T09:00:00');
let s = buildSeed(t0);

console.log('1. 单册单一持有人 / 借阅');
let r = E.borrow(s, 3, 'r1', t0); // c3 在架，但 r1 已持 3 册
check('持有满 3 册再借被拒（命中 maxLoans）', !r.ok && r.error.rule === E.RULES.maxLoans);
r = E.borrow(s, 3, 'r2', t0); // r2 当前 1 份待取保留 c2 → holds=1，可借
check('r2 借 c3 成功', r.ok);
const c3 = r.state.copies.find(c => c.id === 'c3');
check('借出后绑定唯一持有人 r2', c3.state === 'loan' && c3.holderId === 'r2');
check('借期 14 天', c3.dueAt === t0 + 14 * DAY);
s = r.state;
r = E.borrow(s, 3, 'r4', t0);
check('已借出副本不能同时借给他人（singleHolder）', !r.ok && r.error.rule === E.RULES.singleHolder);
check('冲突说明含图书/读者/时间/规则', r.error.title.includes('Designing with Data') && r.error.rows[1].includes('周衡'));

console.log('2. 预约：在架不可约 / 重复不可约 / 上限 2');
r = E.reserve(s, 3, 'r4', t0); // 书3已借出？不，c3 借出后无在架副本 → 可约。换书5测在架不存在
s = E.reserve(s, 3, 'r4', t0).state; // 书3现在全借出，r4 排队成功
r = E.reserve(s, 3, 'r4', t0);
check('同一读者重复预约被拒（noDoubleReserve）', !r.ok && r.error.rule === E.RULES.noDoubleReserve);
r = E.reserve(s, 1, 'r1', t0); // r1 持有该书
check('持有该书再预约被拒', !r.ok && r.error.rule === E.RULES.noDoubleReserve);
const sCheck = s;
r = E.reserve(sCheck, 1, 'r2', t0); // r2 已在书1队列
check('已在队列再约被拒', !r.ok && r.error.rule === E.RULES.noDoubleReserve);
// r2: 待取保留(c2,书2) + 排队(书1) = 2
check('r2 当前预约数恰为上限 2', E.readerReservations(s, 'r2').length === MAX_RESERVATIONS);
r = E.reserve(s, 4, 'r2', t0); // 书4全借出
check('预约满 2 册再约被拒（maxReservations）', !r.ok && r.error.rule === E.RULES.maxReservations);
// 在架书：给书4加一个在架副本（独立分支，不污染主状态）
r = E.reserve(E.addCopy(s, 4), 4, 'r5', t0);
check('有在架副本时预约被拒（reserveWhenBusy）', !r.ok && r.error.rule === E.RULES.reserveWhenBusy);

console.log('3. 续借：无人排队才允许，自原到期日顺延');
const c1 = s.copies.find(c => c.id === 'c1');
const oldDue = c1.dueAt;
r = E.renew(s, 'c1', 'r1', t0); // 书1有 r2 排队
check('有人排队时续借被拒（renewNoQueue）', !r.ok && r.error.rule === E.RULES.renewNoQueue);
check('续借冲突列出图书与队列读者', r.error.rows[0].includes('The Extended Mind') && r.error.rows.some(x => x.includes('周衡')));
r = E.renew(s, 'c6', 'r3', t0); // 书6无人排队
check('无人排队续借成功', r.ok);
const c6 = r.state.copies.find(c => c.id === 'c6');
check('新到期日 = 原到期日 +14 天', c6.dueAt === s.copies.find(c => c.id === 'c6').dueAt + 14 * DAY);
s = r.state;

console.log('4. 归还 → 队首 24h 保留 → 取书');
s = E.cancelReservation(s, 1, 'r2').state; // 撤下 r2，改用零持有的 r5 演示取书
s = E.reserve(s, 1, 'r5', t0).state;
s = E.reserve(s, 1, 'r4', t0).state; // 书1队列 = [r5, r4]
r = E.returnCopy(s, 'c1', t0);
check('归还成功', r.ok);
let c1n = r.state.copies.find(c => c.id === 'c1');
check('归还后副本转为队首 r5 的 24h 保留', c1n.state === 'hold' && c1n.holderId === 'r5' && c1n.holdUntil === t0 + 24 * HOUR);
check('等待队列顺延（r4 成为新队首等待）', r.state.queues[1][0].readerId === 'r4' && r.state.queues[1].length === 1);
s = r.state;
r = E.pickup(s, 'c1', 'r5', t0 + HOUR);
check('24h 内取书成功并转为借出', r.ok && r.state.copies.find(c => c.id === 'c1').state === 'loan');
check('取书借期自取书时刻 14 天', Math.abs(r.state.copies.find(c => c.id === 'c1').dueAt - (t0 + HOUR + 14 * DAY)) < 1000);
s = r.state;
// r2 当前：c2 待取 + c3 借出 = 2；再借一册达到 3 册上限
let prep = E.addCopy(s, 6); // 给书6加一个在架副本
prep = E.borrow(prep, 6, 'r2', t0 + HOUR).state;
check('r2 再借一册后持有满 3 册', E.readerHolds(prep, 'r2').length === MAX_LOANS);
let p2 = E.pickup(prep, 'c2', 'r2', t0 + HOUR); // c2 保留至 t0+6h，仍有效
check('满 3 册时取走保留被拒（pickupAsBorrow，取书等同借阅）', !p2.ok && p2.error.rule === E.RULES.pickupAsBorrow);
const s3 = E.addCopy(prep, 5); // 书5再增在架副本
r = E.borrow(s3, 5, 'r2', t0 + HOUR);
check('满 3 册借在架副本仍被拒（maxLoans）', !r.ok && r.error.rule === E.RULES.maxLoans);

console.log('5. 保留逾期未取自动释放并顺延');
// c2：种子为 r2 保留至 t0+6h，等待 r3
let sw = E.sweep(s, t0 + 7 * HOUR).state;
let c2 = sw.copies.find(c => c.id === 'c2');
check('r2 保留超时 → 顺延给 r3 并重开 24h', c2.state === 'hold' && c2.holderId === 'r3' && c2.holdUntil === t0 + 7 * HOUR + 24 * HOUR);
check('r3 离开等待队列', sw.queues[2].length === 0);
sw = E.sweep(sw, t0 + 32 * HOUR).state;
c2 = sw.copies.find(c => c.id === 'c2');
check('r3 也超时且无人排队 → 回架', c2.state === 'shelf' && c2.holderId === null);

console.log('6. 逾期保留期间取书被拒');
let st = buildSeed(t0); // c2 保留给 r2 截止 t0+6h
r = E.pickup(st, 'c2', 'r2', t0 + 7 * HOUR);
check('超过保留截止取书被拒（hold24h）', !r.ok && r.error.rule === E.RULES.hold24h);

console.log('7. 取消预约后队列前移，不影响已生效保留');
st = buildSeed(t0);
r = E.cancelReservation(st, 2, 'r3'); // 书2等待队列只有 r3
check('取消排队预约成功', r.ok && r.state.queues[2].length === 0);
check('已生效的 r2 保留不受影响', r.state.copies.find(c => c.id === 'c2').holderId === 'r2');

console.log('8. 归还无人排队 → 直接回架');
r = E.returnCopy(st, 'c6', t0); // 书6无人
check('无队列归还后回架', r.ok && r.state.copies.find(c => c.id === 'c6').state === 'shelf');

console.log('8b. 排队中借到同种在架副本 → 自动退出该书队列');
{
  let z = buildSeed(t0);
  // 书4(c4, r1 持有)无在架副本，零持有的 r5 排队；随后新书副本上架，r5 直接借阅
  z = E.reserve(z, 4, 'r5', t0).state;
  z = E.addCopy(z, 4);
  const br = E.borrow(z, 4, 'r5', t0 + HOUR);
  check('借到在架副本成功', br.ok);
  check('r5 已自动离开书4队列（不会日后重复获得保留）',
    !br.state.queues[4].some(q => q.readerId === 'r5'));
  check('提示中包含自动取消预约说明', br.notice.includes('排队预约'));
}

console.log('9. 重载不漂移：派生状态全部由时间现算');
const persisted = JSON.parse(JSON.stringify(buildSeed(t0)));
// 同一份持久化数据，在三个时刻重放，归属随时间推进而变化，存储本身不被改写
const a0 = E.sweep(persisted, t0).state;
const a7 = E.sweep(persisted, t0 + 7 * HOUR).state;
const a30 = E.sweep(persisted, t0 + 30 * HOUR).state;
check('t0 重放：c2 仍保留给 r2', a0.copies.find(c => c.id === 'c2').holderId === 'r2');
check('t0+7h 重放：r2 逾期 → c2 顺延给 r3（保留至释放时刻+24h）',
  a7.copies.find(c => c.id === 'c2').holderId === 'r3');
check('t0+30h 重放：顺延从释放时刻 t0+30h 起重开 24h（至 t0+54h），r3 仍有效',
  a30.copies.find(c => c.id === 'c2').holderId === 'r3' &&
  a30.copies.find(c => c.id === 'c2').holdUntil === t0 + 54 * HOUR);
// 借出到期同样是派生状态：c1 到期日 t0+4d，重放到 t0+10d 即逾期，无需任何写操作
check('到期是纯派生状态：t0+10d 重放时 c1 已逾期，存储时间戳不变',
  a30.copies.find(c => c.id === 'c1').dueAt > t0 &&
  E.sweep(persisted, t0 + 10 * DAY).state.copies.find(c => c.id === 'c1').dueAt < t0 + 10 * DAY);
// 持久化内容未被 sweep 改写：事实时间戳保持原值
check('sweep 不回写持久化事实（c2 的 readyAt/holdUntil 仍是初始种子值）',
  persisted.copies.find(c => c.id === 'c2').holderId === 'r2' &&
  persisted.copies.find(c => c.id === 'c2').holdUntil === t0 + 6 * HOUR);

console.log(`\n结果：${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
