# 研究文献库 · 馆藏流通台

在原研究文献库基础上扩展出的馆藏流通台。无新增依赖，React + Vite 原栈。

## 目录分层（领域数据 / 流通判定 / 界面分开）

```
src/
  domain/            # 不依赖 React、localStorage —— 可独立推演
    rules.js         # 规则常量：14 天借期、24h 保留、持有 3 册、预约 2 册、规则条文 R1–R8
    data.js          # 文献/读者/副本的领域模型、种子局面、存储键
    engine.js        # 流通判定：纯函数状态机（borrow / reserve / return / renew / pickup / cancel + settle）
  state/
    store.js         # 装配层：localStorage 持久化、虚拟时钟、操作派发
  ui/                # 界面层：App / Sidebar / CopyCard 与展示工具
scripts/
  test-engine.mjs    # node 自带 assert 的规则推演（npm test，17 项）
```

## 规则到代码的映射

| 需求 | 规则 | 实现 |
| --- | --- | --- |
| 在借期一册只绑一人、不能同时保留给他人 | R1 / R8 | `engine.borrow`：holder 或 hold 存在即拒；保留只在归还时产生 |
| 持有 ≤ 3、预约 ≤ 2 | R2 / R3 | `readerCounts` + 借出/预约/取书三处入口统一校验 |
| 归还后首位 24h 保留，逾期释放顺延 | R4 | `returnCopy` 产生保留；`settle(state, now)` 级联释放，任何读状态路径都先结算 |
| 无人排队才能续借，自原到期日顺延 | R5 | `renew`：queue/hold 非空即拒；`newDue = oldDue + 14d`（逾期续借同样） |
| 不重复预约、仅本人保留期内可取 | R6 / R7 | `reserve` / `pickup` |

## 重载不漂移

- 流通状态写入 `localStorage`（`research-circulation-v1`）；时间不写死，另存一个虚拟时钟偏移（`research-circulation-clock-v1`），页面每秒按偏移重算 `now`。
- 「保留截止/到期日」全部是绝对时间戳 + 当前时间派生；每次渲染与每个操作前都跑同一个 `settle`，逾期保留自动释放并顺延，刷新页面结论一致，且 settle 幂等不产生重复日志。
- 侧栏「流通时钟」可推进 +6h / +23h / +25h / +7d 验证 24 小时保留与顺延，可一键回到现实时间。

## 冲突说明格式

操作被拒时展示：命中规则编号与条文、说明文字，以及结构化明细——图书（含索书号）、读者、发生时间、当前持有人/保留对象、到期日或保留截止、排队读者、当前与上限配额。

## 命令

```bash
npm test       # 17 项流通规则推演（纯 node，无依赖）
npm run dev    # 本地预览
npm run build  # 生产构建
```
