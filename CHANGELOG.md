# 更新日志

本文件记录本项目所有值得注意的功能变更。

- 格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。
- 每个版本标题后附对应的 commit 短哈希，便于回溯代码（仓库尚未打 git tag）。
- 分类：`新增`（新功能）、`变更`（对现有功能的改动）、`修复`（Bug 修复）、`移除`（删除的功能）、`测试`（测试相关）。
- **维护约定：每次功能变更都要在顶部 `[未发布]` 区块追加一条详细记录，发版时把该区块重命名为具体版本号与日期。**

本项目为纯练习/娱乐向的德州扑克牌桌原型（虚拟筹码，不涉及任何真实货币）。技术栈：Vite + React 19 + TypeScript + Sass + Vitest。目录名 `taro` 为随手命名，与 Taro 框架无关。

## [未发布]

### 修复

- 英雄牌（`.pc--hero`）右下角翻转角标定位错乱：`.pc--hero .pc__corner`（特异性 0,2,0）的 `top/left` 压过了 `.pc__corner--flip`（0,1,0）的 `top:auto; left:auto`，使该角标同时拿到四个方向的偏移而被拉伸成整牌大小的盒子，旋转 180° 的点数花色因此落在牌面中下方、与中央大花色重叠。已在 `.pc--hero .pc__corner--flip` 显式重置 `top: auto` 与 `left: auto`。公共牌与对手小牌走基础规则（同特异性、后者胜出）故不受影响，只有玩家自己的两张坏。（`src/components/playing-card.scss`）

## [0.2.0] - 2026-10-08 · `03f2aea`

多人数桌型、机器人决策增强与牌局记录。

### 新增

- **桌型设置面板**：开局前可选择 2 人（单挑）/ 6 人（标准）/ 9 人（满员）桌，并选择机器人难度三档 `轻松 / 常规 / 犀利`；确认后换桌重开。座位布局由 `seatLayout()` 按人数在椭圆边线上均分计算，座位 0 固定在底部中央（人类玩家）；9 人桌启用紧凑座位样式（`isCrowded()`）。每种桌型有预设的对手名单与性格组合（`tight / loose / aggro`）。
- **牌局记录面板**（`src/components/HandHistory.tsx` + `hand-history.scss`）：逐手记录投入、赔付、净盈亏、英雄底牌与牌型、赢家与摊牌与否，可展开/收起查看。
- **会话统计**（`src/game/session.ts`）：`summarize()` 汇总手数、净盈亏、胜/负场次、单手最佳与最差，`tone()` 给出涨跌配色语义，用于记录面板头部。
- **引擎进攻权状态**：`Game` 新增 `aggressor`（本街加注者）、`preflopAggressor`（翻牌前进攻方）、`raiseCount`（本街加注次数），供机器人做持续下注、3-bet 等位置相关决策使用。
- **对手入池率统计**：`SeatRead`（发牌数 / 入池数 / 加注数 / 弃牌数）逐手累积，机器人据此对对手做松紧读牌。

### 变更

- **机器人决策大幅增强**（`src/game/ai.ts`，70 → 321 行）：
  - 按座位角色（`button / blind / early / middle / late`）决定开池范围，后位更宽、前位更紧。
  - 用胜率实现率（equity realization）而非原始胜率与底池赔率比较，决定跟注是否有利。
  - 加入 3-bet、翻牌后持续下注（c-bet）、按牌面湿度调整下注尺度、以及强牌慢打（slow play）。
- 单挑桌（2 人）的盲注归属与行动顺序修正为标准 Heads-Up 规则：按钮位为小盲且翻牌前先行动，翻牌后后行动。
- 座位渲染改为按人数动态布局，不再使用固定的 6 座位坐标。

### 修复

- **每张新牌桌第一手牌完全相同**：默认随机种子由固定值改为随机生成，且发牌顺序由 `seed` 与当前手数做哈希混合（`src/game/rng.ts`），避免同一牌桌内每手牌序可预测、以及不同牌桌开局重复。

### 测试

- 测试用例 31 → **57 条**（全部通过）：
  - `tests/table.test.ts`（新增）：2 / 6 / 9 人桌各跑完整对局，校验筹码不泄漏、街状态不残留。
  - `tests/ai.test.ts`（新增）：机器人行为频率断言（开池率、3-bet 率、c-bet 率随位置与难度变化）。
  - `tests/holdem.test.ts`：补充发牌随机性、牌局记录与会话净盈亏一致性校验。

## [0.1.0] - 2026-10-08 · `ab4ab12`

德州扑克牌桌页面原型首版。

### 新增

- **规则引擎与 UI 分离的纯函数实现**（`src/game/poker.ts`，529 行）：
  - 五张手牌评估与牌型比较（`src/game/evaluate.ts`）。
  - 盲注轮转、街推进（preflop → flop → turn → river → showdown）。
  - 最小加注合法性校验（`raiseMin` / `raiseMax`），全下不足额加注的处理。
  - 边池（side pot）计算与分配，全下后跑牌（run it down）至摊牌。
  - 行动选项派生：跟注额、可过牌与否、加注上下限。
- **AI 决策**（`src/game/ai.ts` 首版）：`tight / loose / aggro` 三种性格，用蒙特卡洛模拟胜率（`src/game/equity.ts`）对比底池赔率后选择弃牌 / 跟注 / 加注。
- **可复现随机数**（`src/game/rng.ts`）：基于种子的洗牌，便于测试复现。
- **390px 单页牌桌 UI**（`src/HoldemTable.tsx` + 各组件 SCSS）：牌桌、玩家座位（`PlayerSeat`）、扑克牌（`PlayingCard`）、筹码堆（`ChipStack`）全部用 CSS 手绘，不引入任何外部图片素材；含加注滑杆模式与行动日志。
- **工程配置**：Vite 8 + React 19 + TypeScript 5.9 + Sass，`.editorconfig`、`tsconfig.json`、`vite.config.ts`。

### 测试

- Vitest **26 例**（首版）：含 60 手随机对局的筹码守恒与动作合法性不变量校验。
