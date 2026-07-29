# 鑫钱包 · 金额重构 P3 设计文档

**作者：** 吴八哥 💎  
**日期：** 2026-07-29  
**状态：** Design Phase（不实施，作为下一阶段的输入）  
**预估工作量：** 2-3 天（一人独立完成）

---

## 一、背景与问题陈述

### 1.1 当前现状

数据库层：所有金额字段已正确定义为 `DECIMAL(15,2)` —— 这是对的，PG 内部用 binary floating 做精确存储。

代码层：DB 返回时是 **string**（pg driver 默认行为），中间运算是 JS `Number` (`parseFloat`)，回写时是 `parseFloat()`/`toNumber()`。

### 1.2 风险点扫描

已经 `grep` 过 `server/` 找出所有金额相关运算位置（节选）：

| 位置 | 当前实现 | 潜在风险 |
|------|---------|---------|
| `routes/_helpers.js:143` `computeAccountBalance` | `opening + effects` 两个 `parseFloat` 相加 | 累加误差（实际精度损失微小，因为个账户余额上限 ~1e13） |
| `routes/_helpers.js:124` `sumLedgerEffects` | `COALESCE(SUM(CASE...))`，sum 算 | DB 端计算，无 JS 精度问题 ✓ |
| `routes/accounts.js:17` totalAssets | `accounts.reduce((s, a) => s + parseFloat(a.balance), 0)` | 几十个账户累加，长期累计漂移 |
| `routes/ai.js` advice/insight 计算 | 总负债、月供、收支比都 `parseFloat` | 展示层瞬时误差，**用户能看到** |
| `routes/savings.js`、`debts.js`、`investments.js` | 类似模式 | 同上 |
| `js/managers/dashboard.js` `report.js` | 前端展示用 `Number(n).toFixed(2)` 或 `fmt(n)` | 仅展示，无计算 |

### 1.3 风险严重性评估

- **DB 写回截断**：JS `0.1 + 0.2 = 0.30000000000000004` 写到 `DECIMAL(15,2)` 会被 PG 自动 round 到 0.30 —— **回写无精度问题**
- **查询返回 string**：JS 算 `Number('1234.56') = 1234.56`，后续加法可能丢精度（**严格说**，在 1e15 以下 JS Number 精度足够；金融场景通常金额 < 1e9）
- **真正风险**：报表展示 (`toFixed(2)`) 在某些边界（如 0.615）可能给出 0.61 而非 0.62，但用户肉眼几乎看不出来

**结论：** 当前**实际运营风险低**，但**代码质量风险高**——一旦未来加入高频计算（导入大账本、计算利息、汇率换算），浮点漂移会暴露。

---

## 二、目标

1. 服务端所有金额计算用 **整数分** 表示（cents-based），避免浮点漂移
2. **DB schema 不变** —— DECIMAL(15,2) 保留，IO 边界做转换
3. 前端 API 数据类型 **不变** —— 后端在 response 阶段做 `cents → decimal` 格式化
4. 保持代码风格的渐进式演进，不强制重构所有模块（按风险优先级）

---

## 三、方案选型

### 方案 A：整数分（推荐） ⭐

**核心理念：** 内部用 `Number` 表示 cents（如 `123456` 表示 `¥1234.56`），IO 边界做转换。

**优点：**
- 零新依赖，引入成本低
- 整数运算本身精确，无浮点问题
- 对 DECIMAL(15,2) 自然兼容（除以 100 即还原）
- 调试时 `1234.56 === 1234.56` 失效（cents 是 123456）但代码可控

**缺点：**
- 表达层（API/前端）需要 str 显示小数
- `123456` 读起来不直观，需要文档化
- 算金额 × 利率等会有 cents² 单位，需要再次折算

### 方案 B：decimal.js

**核心理念：** 用 `new Decimal(1234.56)` 替代原生 `Number`，所有运算走 decimal 路径。

**优点：**
- 直观的字符串/数字双重形态
- 任意精度
- 库成熟，金融场景广泛使用

**缺点：**
- 新增依赖（包大小 ~46KB）
- API 调用链所有 `parseFloat` 替换为大对象，diff 大
- 性能略低于原生 Number（百万次运算级会有感）
- 与 `JSON.stringify(obj)` 一起工作时会有 prototype 泄漏问题（需 toJSON 适配）

### 方案 C：维持现状，仅强化 DB

**核心理念：** 把所有中间计算下推到 SQL（COALESCE/SUM 在 DB 端完成），前端只展示格式化数值。

**优点：**
- 零代码改动
- DB DECIMAL 精度天然足够

**缺点：**
- 复杂聚合（如按类别 + 月份 × 账户）需要复杂 SQL
- 报表生成时间随数据量增长
- **不解决 JS 端浮点漂移**

### 决策

**采用方案 A 的混合版：**
- 服务端核心金额计算（账户余额、债务剩余、收支汇总）**全部转整数分**
- 报表/AI 计算保留部分浮点（数据量小、精度阈值够用）
- 用一个辅助模块 `server/utils/money.js` 集中转换逻辑

---

## 四、实施方案

### 4.1 新建 `server/utils/money.js`

```js
// 内部所有金额都以"分"（cents）为单位 Number 类型存储与运算
// IO 边界：API 入参接受 decimal → parseDecimalToCents；DB 出参 cents → formatCents
const { toNumber } = require('../validate');

function parseDecimalToCents(decimal) {
  const n = toNumber(decimal);
  if (n === null) return null;
  // 四舍五入到分：* 100 取整
  return Math.round(n * 100);
}

function centsToDecimal(cents) {
  if (cents === null || cents === undefined) return null;
  return Math.round(cents) / 100; // 输出展示精度范围内
}

function fmtCents(cents) {
  // JSON 序列化时：1234567 → 12345.67
  if (cents === null || cents === undefined) return null;
  // 用字符串避免 toString 自动科学计数法
  const n = Number(cents);
  return (n / 100).toFixed(2);
}

function sumCents(...args) {
  return args.reduce((s, x) => s + (Number(x) || 0), 0);
}

module.exports = { parseDecimalToCents, centsToDecimal, fmtCents, sumCents };
```

### 4.2 改动范围（按风险/收益排序）

#### 优先级 1（必做 — 累计漂移风险高）

| 文件 | 改动 |
|------|------|
| `routes/_helpers.js` `sumLedgerEffects` | 返回 cents（直接由 DB SUM * 100）|
| `routes/_helpers.js` `computeAccountBalance` | `opening(cents) + effects(cents)` |
| `routes/accounts.js` `totalAssets` | `reduce(s, a => s + centsOf(a.balance), 0)` |
| 表 UPDATE 时 | `balance = ?`(cents) 持久化 |

#### 优先级 2（推荐 — 用户能看到） 

| 文件 | 改动 |
|------|------|
| `routes/ai.js` advice/insight | 收/支/总负债/负债资产比：在 DB 返回 cents 后再除 100 |
| `routes/debts.js` 利率 × 剩余本金 | 转 cents 后运算 |
| `routes/investments.js` current_value/qty*price | 同上 |
| `routes/reports.js` 报表汇总 | 同上 |

#### 优先级 3（可选 — 展示层）

| 文件 | 改动 |
|------|------|
| `js/managers/*.js` 前端 `fmt(amount)` | 已存在，但可加强：所有运算后做一次 `Number((x).toFixed(2))` 显式 round |
| API JSON 输出格式 | 服务端做 `centsToDecimal` 后再发，**确保前端不感知 cents** |

#### 不动

- schema.sql（DECIMAL(15,2) 仍正确）
- DB 端 SUM/AVG/COALESCE（精度天然 OK）
- 前端 fmt() 函数本身（已经做格式化）

### 4.3 迁移步骤（建议分 3 个 PR）

**PR #1：基础工具 + 单元测试**
- 新增 `server/utils/money.js`
- 新增 `test/money.test.js`，覆盖 6 个边界 case
- 不改任何业务代码

**PR #2：核心模块迁移（优先级 1）**
- 改 `routes/_helpers.js` 的两个核心函数
- 改 `routes/accounts.js`
- 加 integration test 验证：注册→创建账户→创建交易→账户余额 = 期初 + 净额（用整数算）

**PR #3：报表与 AI（优先级 2）**
- 改 `routes/ai.js`、`debts.js`、`investments.js`、`reports.js`
- 全 E2E 验证

---

## 五、测试策略

### 5.1 边界 case

```
parseDecimalToCents(0.1) + parseDecimalToCents(0.2) = 30 (分) → 0.30 (元)
0.1 + 0.2 = 0.30000000000000004 (但 cents round = 30)
99 * 100 cents 不会丢精度
1234567.89 → 123456789 cents → 还原 12345.67 元
```

### 5.2 累计稳定性 test

```js
// 跑 1000 次 0.1 累加
const cents = parseDecimalToCents(0.1);
let s = 0;
for (let i = 0; i < 1000; i++) s += cents;
expect(centsToDecimal(s)).toBe(1000.00); // 精确
```

`parseFloat` 版本会得到 `999.9999999999986`，长期累计误差明显。

### 5.3 端到端回归

复用 `scripts/sandbox-e2e.js`，验证：
- 创建账户 balance=1000 → 余额读取正确显示 1000.00
- 多笔交易后续累加，账户余额精确等于 DB 计算值
- AI advice 调用后，所有金额字段都是 2 位小数

---

## 六、风险与回滚

### 风险

1. **`req.body.amount` 入参现在是 decimal，不再直接 valid 为 cents** —— 需要在路由层做 `parseDecimalToCents(req.body.amount)`
2. **数据库返回 string** —— pg 默认 DECIMAL 返回 string（不是 Number），需要在前置 helper 里做 `parseFloat(row.amount) * 100`
3. **truncate 行为** —— 数据库字段 `DECIMAL(15,2)` 自动 round half-up；前端展示层用 `Number(cents)/100` 也 round，可能与 SQL 内部 round 略有差异（极小）

### 回滚策略

每个 PR 单独可回滚：
- PR #1 只是新增工具，业务零感知
- PR #2/#3 一旦发现问题，回滚对应的路由文件 + 单测失败即可定位

---

## 七、增量时间表

| 工作日 | 任务 | 产出 |
|-------|------|------|
| Day 1 上午 | 建 money.js + 单测（PR #1） | 测试覆盖率 100% |
| Day 1 下午 | migrate _helpers.js + accounts.js（PR #2） | sandbox-e2e 全过 |
| Day 2 上午 | migrate ai.js / debts / investments / reports（PR #3） | sandbox-e2e + AI demo |
| Day 2 下午 | 全量回归 + 一周线上观察期 | 稳定 |

如时间紧可合并 PR：单 PR 拆 3 次提交也可接受。

---

## 八、不做的事

- ❌ 不改 schema（DECIMAL 仍正确）
- ❌ 不引入 decimal.js（成本/收益不划算）
- ❌ 不动前端计算逻辑（前端只展示，不做金额运算）
- ❌ 不重写 routes/*.js 全部（只改涉及金额运算的）

---

## 九、入门 check-list

下一阶段启动前：
- [ ] 评估团队对 cents 表示法的接受度（需要 README 增加 "金额内部表示" 章节）
- [ ] 检查所有 SQL SUM/AVG 输出的精度是否足够（一般 OK，但 edge case 需查）
- [ ] 准备 `test/money.test.js` 骨架
- [ ] 标记 PR #2 的高风险文件：`routes/_helpers.js`（被多个路由依赖）

---

*Design doc complete — 等待用户决定是否进入实施阶段。*
