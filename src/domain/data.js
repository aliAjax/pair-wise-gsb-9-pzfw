// 领域数据层：文献、读者、馆藏副本与初始流通状态。
// 时间一律存绝对时间戳；种子数据相对固定的虚拟起点生成，且仅在首次访问时落盘，
// 之后所有判定都以持久化状态为准，重载页面不漂移。
import { LOAN_PERIOD_DAYS, DAY } from './rules.js';

export const STATE_KEY = 'research-circulation-v1';
export const CLOCK_KEY = 'research-circulation-clock-v1';

// 虚拟时钟的固定起点（2026-09-20 09:00 UTC+8）
export const SEED_NOW = Date.UTC(2026, 8, 20, 1, 0, 0);

const d = (n) => n * DAY;

export function seedState(now = SEED_NOW) {
  const lit = [
    { id: 1, title: 'The Extended Mind', authors: 'Clark, A. & Chalmers, D.', year: 1998, venue: 'Analysis',
      tags: ['具身认知', '经典'], abstract: '本文提出心智延展论：当外部环境稳定地承担认知功能时，心智边界可以超越头脑与身体。',
      cite: 'Clark, A. & Chalmers, D. (1998). The Extended Mind. Analysis.', notes: '' },
    { id: 2, title: 'Situated Learning', authors: 'Lave, J. & Wenger, E.', year: 1991, venue: 'Cambridge University Press',
      tags: ['学习科学', '社会'], abstract: '学习发生在真实情境的参与过程中，知识与共同体实践不可分割。',
      cite: 'Lave, J. & Wenger, E. (1991). Situated Learning.', notes: '' },
    { id: 3, title: 'Designing with Data', authors: 'Miller, S.', year: 2022, venue: 'MIT Press',
      tags: ['设计研究', '方法'], abstract: '一套面向设计师的数据研究方法，讨论如何把定性洞察转成可行动的设计决策。',
      cite: 'Miller, S. (2022). Designing with Data.', notes: '' },
    { id: 4, title: 'Communities of Practice', authors: 'Wenger, E.', year: 1998, venue: 'Cambridge University Press',
      tags: ['学习科学', '社会'], abstract: '实践共同体视角下的学习、身份与知识传承，阐明合法边缘参与如何造就成员。',
      cite: 'Wenger, E. (1998). Communities of Practice.', notes: '' },
    { id: 5, title: 'The Sciences of the Artificial', authors: 'Simon, H. A.', year: 1969, venue: 'MIT Press',
      tags: ['复杂系统', '经典'], abstract: '人工科学的奠基之作，讨论设计、层级系统与有限理性如何塑造人工物世界。',
      cite: 'Simon, H. A. (1969). The Sciences of the Artificial.', notes: '' },
  ];

  const readers = [
    { id: 'r1', name: '林知夏' },
    { id: 'r2', name: '周砚' },
    { id: 'r3', name: '陈穗' },
    { id: 'r4', name: '许临' },
  ];

  // 固定的演示局面：覆盖在架 / 借出+排队 / 24 小时待取 / 持满 3 册 / 约满 2 册
  const copies = [
    { id: 'c1', litId: 1, code: 'EXT-001', holderId: 'r1', loanedAt: now - d(5), dueAt: now - d(5) + LOAN_PERIOD_DAYS * d(1), holdReaderId: null, holdUntil: null, queue: ['r2', 'r3'] },
    { id: 'c2', litId: 1, code: 'EXT-002', holderId: null, loanedAt: null, dueAt: null, holdReaderId: null, holdUntil: null, queue: [] },
    { id: 'c3', litId: 2, code: 'SIT-001', holderId: 'r2', loanedAt: now - d(10), dueAt: now - d(10) + LOAN_PERIOD_DAYS * d(1), holdReaderId: null, holdUntil: null, queue: ['r3'] },
    { id: 'c4', litId: 3, code: 'DWD-001', holderId: null, loanedAt: null, dueAt: null, holdReaderId: 'r4', holdUntil: now + d(20 / 24), queue: [] },
    { id: 'c5', litId: 4, code: 'COP-001', holderId: 'r1', loanedAt: now - d(2), dueAt: now - d(2) + LOAN_PERIOD_DAYS * d(1), holdReaderId: null, holdUntil: null, queue: [] },
    { id: 'c6', litId: 5, code: 'SCI-001', holderId: 'r1', loanedAt: now - d(12), dueAt: now - d(12) + LOAN_PERIOD_DAYS * d(1), holdReaderId: null, holdUntil: null, queue: [] },
  ];

  const events = [
    { t: now - d(12), kind: 'loan', text: '林知夏 借出《The Sciences of the Artificial》(SCI-001)' },
    { t: now - d(10), kind: 'loan', text: '周砚 借出《Situated Learning》(SIT-001)' },
    { t: now - d(6), kind: 'reserve', text: '陈穗 预约《Situated Learning》(SIT-001)，进入队列第 1 位' },
    { t: now - d(5), kind: 'loan', text: '林知夏 借出《The Extended Mind》(EXT-001)' },
    { t: now - d(4), kind: 'reserve', text: '周砚、陈穗 依次预约《The Extended Mind》(EXT-001)' },
    { t: now - d(2), kind: 'loan', text: '林知夏 借出《Communities of Practice》(COP-001)，已持满 3 册' },
    { t: now - d(4 / 24), kind: 'hold', text: '《Designing with Data》(DWD-001) 归还，为队列首位 许临 保留 24 小时' },
  ];

  return {
    literature: lit,
    readers,
    copies,
    events,
    seq: { literature: 6, reader: 5, copy: 7 },
  };
}
