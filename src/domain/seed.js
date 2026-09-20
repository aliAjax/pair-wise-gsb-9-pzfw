// 领域数据层：馆藏常量、读者、书目/副本的初始数据与状态结构
// 状态中只记录“事实时间戳”（借出时刻、到期时刻、保留截止时刻），
// 逾期、保留失效等派生状态一律由流通判定层根据当前时间计算，保证重载后不漂移。

export const LOAN_DAYS = 14;        // 每次借阅读书周期
export const RENEW_DAYS = 14;       // 续借自原到期日顺延的天数
export const HOLD_HOURS = 24;       // 队列首位获得的保留时长
export const MAX_LOANS = 3;         // 读者累计持有上限
export const MAX_RESERVATIONS = 2;  // 读者累计预约上限（排队中 + 待取保留）

export const DAY = 24 * 60 * 60 * 1000;
export const HOUR = 60 * 60 * 1000;

export const STORAGE_KEY = 'circulation-desk:v1';
export const SCHEMA_VERSION = 1;

const loan = (id, bookId, code, holderId, loanedAt, dueAt) => ({
  id, bookId, code,
  state: 'loan', // shelf 在架 | loan 借出 | hold 保留待取
  holderId, loanedAt, dueAt,
  readyAt: null, holdUntil: null,
});
const hold = (id, bookId, code, holderId, readyAt, holdUntil) => ({
  id, bookId, code,
  state: 'hold',
  holderId, loanedAt: null, dueAt: null,
  readyAt, holdUntil,
});
const shelf = (id, bookId, code) => ({
  id, bookId, code,
  state: 'shelf',
  holderId: null, loanedAt: null, dueAt: null,
  readyAt: null, holdUntil: null,
});

// 首次打开时构造一套可直接演示全部规则的流通实况（时间均相对生成时刻）
export function buildSeed(now) {
  const readers = [
    { id: 'r1', name: '林知夏' },
    { id: 'r2', name: '周衡' },
    { id: 'r3', name: '陈砚' },
    { id: 'r4', name: '苏禾' },
    { id: 'r5', name: '何临川' },
  ];

  const books = [
    { id: 1, title: 'The Extended Mind', authors: 'Clark, A. & Chalmers, D.', year: 1998, venue: 'Analysis',
      tags: ['具身认知', '经典'], abstract: '本文提出心智延展论：当外部环境稳定地承担认知功能时，心智边界可以超越头脑与身体。',
      cite: 'Clark, A. & Chalmers, D. (1998). The Extended Mind. Analysis.', notes: '' },
    { id: 2, title: 'Situated Learning', authors: 'Lave, J. & Wenger, E.', year: 1991, venue: 'Cambridge University Press',
      tags: ['学习科学', '社会'], abstract: '学习发生在真实情境的参与过程中，知识与共同体实践不可分割。',
      cite: 'Lave, J. & Wenger, E. (1991). Situated Learning.', notes: '' },
    { id: 3, title: 'Designing with Data', authors: 'Miller, S.', year: 2022, venue: 'MIT Press',
      tags: ['设计研究', '方法'], abstract: '一套面向设计师的数据研究方法，讨论如何把定性洞察转化为可行动的设计决策。',
      cite: 'Miller, S. (2022). Designing with Data.', notes: '' },
    { id: 4, title: 'The Sciences of the Artificial', authors: 'Simon, H. A.', year: 1996, venue: 'MIT Press',
      tags: ['设计研究', '经典', '复杂系统'], abstract: '人工物科学讨论设计、层级与近可分解系统，界定了“人工科学”的研究纲领。',
      cite: 'Simon, H. A. (1996). The Sciences of the Artificial (3rd ed.). MIT Press.', notes: '' },
    { id: 5, title: 'Notes on the Synthesis of Form', authors: 'Alexander, C.', year: 1964, venue: 'Harvard University Press',
      tags: ['设计研究', '形式'], abstract: '以图解与脉络的适配解释形式的生成，把设计问题视为一组互相关联的力场。',
      cite: 'Alexander, C. (1964). Notes on the Synthesis of Form. Harvard University Press.', notes: '' },
    { id: 6, title: 'Things That Make Us Smart', authors: 'Norman, D. A.', year: 1993, venue: 'Basic Books',
      tags: ['认知', '技术'], abstract: '反思技术如何辅助而非替代认知，强调表征工具对人类思考的放大作用。',
      cite: 'Norman, D. A. (1993). Things That Make Us Smart. Basic Books.', notes: '' },
  ];

  const copies = [
    loan('c1', 1, 'A', 'r1', now - 10 * DAY, now + 4 * DAY),   // 林知夏持有，且有人排队，不能续借
    hold('c2', 2, 'A', 'r2', now - 18 * HOUR, now + 6 * HOUR), // 周衡的 24h 保留，6 小时后到期
    shelf('c3', 3, 'A'),                                       // 在架可借
    loan('c4', 4, 'A', 'r1', now - 7 * DAY, now + 7 * DAY),    // 林知夏第 2 册
    loan('c5', 5, 'A', 'r1', now - 3 * DAY, now + 11 * DAY),   // 林知夏第 3 册，恰好达持有上限
    loan('c6', 6, 'A', 'r3', now - 5 * DAY, now + 9 * DAY),    // 陈砚持有，无人排队可续借
  ];

  // 预约等待队列（尚未轮到的人）；正在待取的保留体现在副本 state:'hold' 上，不重复存放
  const queues = {
    1: [{ readerId: 'r2', at: now - 1 * DAY }],
    2: [{ readerId: 'r3', at: now - 20 * HOUR }],
  };

  return {
    v: SCHEMA_VERSION,
    currentReaderId: 'r1',
    clockOffset: 0, // 仅用于演示/验证时间规则的模拟时钟偏移，语义与真实时钟一致
    readers, books, copies, queues,
  };
}
