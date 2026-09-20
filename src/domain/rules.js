// 领域规则常量：所有流通期限与配额集中在此，界面与判定共用同一份口径
export const DAY = 24 * 60 * 60 * 1000;
export const LOAN_PERIOD_DAYS = 14; // 借出期限
export const HOLD_PERIOD_DAYS = 1;  // 归还后队列首位的保留期限（24 小时）
export const MAX_LOANS = 3;         // 读者累计持有上限
export const MAX_RESERVES = 2;      // 读者累计预约上限（排队中 + 待取保留）

// 命中的规则：冲突提示与界面说明都引用这些编号，避免两套措辞
export const RULES = {
  R1: { id: 'R1', text: '每册在借期间只能绑定一名持有人，且不能同时保留给他人（借出与保留互斥）' },
  R2: { id: 'R2', text: '每位读者累计持有不得超过 3 册' },
  R3: { id: 'R3', text: '每位读者累计预约（排队中与待取保留）不得超过 2 册' },
  R4: { id: 'R4', text: '归还后队列首位获得 24 小时保留；逾期未取自动释放并顺延给下一位' },
  R5: { id: 'R5', text: '续借仅在无人排队时允许，截止日自原到期日顺延 14 天' },
  R6: { id: 'R6', text: '已在队列中或已有保留资格的读者不得重复预约同一册' },
  R7: { id: 'R7', text: '只有保留给本人且在保留期限内才能取书' },
  R8: { id: 'R8', text: '图书在架（无持有人、无保留）才可直接借出；否则只能排队预约' },
};

export const STATUS = {
  AVAILABLE: '在架',
  ON_LOAN: '借出',
  ON_HOLD: '保留中',
};
