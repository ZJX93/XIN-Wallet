# 鑫钱包 (XIN-Wallet) 全面代码审查报告

**审查日期：** 2026-07-29  
**审查范围：** 全栈（server/ + js/ + 配置 + Docker）  
**项目概况：** 个人财务管理应用，Node/Express + PostgreSQL + 原生 JS 前端，含 AI 财务建议、OCR 票据识别、复式记账、投资/储蓄/债务管理等模块。

---

## 总体评价

这是一个**完成度很高、工程意识明显强于平均水平**的个人项目。参数化查询杜绝了 SQL 注入、helmet + CSP 做了前端安全加固、bcrypt + JWT + 登录锁定做了认证防护、复式记账用账本推导余额取代增量更新（这是很多商业记账软件都做不到的设计）、优雅退出和健康检查一应俱全。代码注释密度高，能看出作者对"为什么这么做"有清晰思考。

但正因为功能覆盖面广（AI、OCR、加密、导入导出），攻击面也比一般个人项目大得多。以下按严重程度分级列出发现。

---

## 🔴 Blockers（必须修复）

### 1. `.env` 已提交进 Git 历史，含固定 ENCRYPTION_KEY

**文件：** `.env`（git 已跟踪）  
**提交：** `6b92ff7` "在 .env 中提供固定 ENCRYPTION_KEY"

`.gitignore` 虽然写了 `.env`，但该文件在忽略规则生效前已被提交，至今仍被 git 跟踪。更严重的是，提交说明表明这是**有意为之**——为了让"单机用户只需 .env 设置即可稳定"。

**后果：** 任何能 clone 此仓库的人都能拿到 `ENCRYPTION_KEY`，进而解密数据库中所有 AES-256-GCM 加密的 AI API Key、腾讯云 OCR SecretId/SecretKey。加密形同虚设。

**修复：**
```bash
# 1. 从 git 跟踪中移除（保留本地文件）
git rm --cached .env
# 2. 提交
git commit -m "security: remove .env from version control"
# 3. 如果仓库是公开的或曾被公开，必须轮换 ENCRYPTION_KEY
#    以及所有用该密钥加密的凭证（AI API Key、OCR Secret）
# 4. 如需彻底清除历史：git filter-branch 或 BFG Repo-Cleaner
```

### 2. SSRF — AI Provider `base_url` 无任何校验

**文件：** `server/services/ai.js` 第 12-33 行  
**路由：** `POST /api/ai/providers`（已认证用户可创建）

`httpsPostJson` 接受任意 URL，包括：
- `http://169.254.169.254/latest/meta-data/`（云实例元数据 → 可读取 IAM 临时凭证）
- `http://127.0.0.1:5432/`（内网 PostgreSQL）
- `http://10.0.0.0/8`、`http://172.16.0.0/12`（内网任意服务）

攻击者创建 provider 时填入内网地址，服务端会带着 `Authorization: Bearer <key>` 发起请求。虽然需要认证，但任何注册用户（包括 demo 账号）都可利用。

**修复：**
```js
// server/services/ai.js — 在 httpsPostJson 入口添加
const { URL } = require('url');
const net = require('net');

function isPrivateHost(hostname) {
  if (hostname === 'localhost') return true;
  if (net.isIPv4(hostname)) {
    const parts = hostname.split('.').map(Number);
    return parts[0] === 10
      || parts[0] === 127
      || parts[0] === 169 && parts[1] === 254
      || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
      || (parts[0] === 192 && parts[1] === 168);
  }
  // 对域名做 DNS 解析后二次校验（防 DNS rebinding）
  return false; // 简化示意，生产应 dns.resolve 后检查
}

function httpsPostJson(url, headers, body) {
  const u = new URL(url);
  if (!['http:', 'https:'].includes(u.protocol)) {
    throw new Error('仅支持 HTTP/HTTPS 协议');
  }
  if (isPrivateHost(u.hostname)) {
    throw new Error('不允许访问内网地址');
  }
  // ... 原有逻辑
}
```

### 3. `decrypt()` 静默回退明文 — 加密层形同虚设

**文件：** `server/crypto.js` 第 102-121 行

解密失败时（密钥不匹配、数据损坏），`decrypt()` 返回**原始密文**而非 `null` 或抛错。调用方（如 `ai.js` 第 39 行 `provider.api_key = decrypt(provider.api_key)`）会把密文当作有效 API Key 去调用外部服务。

`_helpers.js` 的 `tryDecrypt` 用 `decrypted === key` 判断失败——但如果密钥错误，`decrypt` 返回的就是 `key` 本身，这个判断虽然能捕获，但**仅限 OCR 配置页面用到了**，AI provider 的 `getActiveProvider` 完全没做这个检查。

**修复：**
```js
// crypto.js — decrypt 失败应返回 null
function decrypt(ciphertext) {
  if (!ciphertext) return null;
  try {
    const buf = Buffer.from(ciphertext, 'hex');
    if (buf.length < IV_LENGTH + TAG_LENGTH) return null; // 不再回退明文
    // ... 解密逻辑
    return decrypted;
  } catch {
    return null; // 明确失败
  }
}
// 调用方需处理 null（如 AI provider 未设置有效 key 时返回 400）
```

### 4. Refresh Token 端点校验完全失效

**文件：** `server/routes/auth.js` 第 155 行

```js
router.post('/refresh', validate([
  { field: 'refreshToken', type: 'string', min: 10, max: 1024, required: true }
]), ...)
```

`validate()` 中间件期望 `{ body: {...}, query: {...}, params: {...} }` 结构，但这里传入了**数组**。`for (const source of ['body','query','params'])` 遍历数组时 `schema[source]` 为 `undefined`，校验被完全跳过。`min: 10, max: 1024` 约束从未生效。

**修复：**
```js
router.post('/refresh', validate({
  body: {
    refreshToken: { type: 'string', required: true, min: 10, max: 1024 }
  }
}), ...)
```

### 5. 登录限流的 keyGenerator 读取未解析的 body

**文件：** `server/index.js` 第 55-67 行 vs 第 100 行

`authLimiter` 挂载在第 67 行，`express.json()` 在第 100 行。限流器的 `keyGenerator` 读取 `req.body.username`，但此时 body 尚未解析，`req.body` 为 `undefined`。

**后果：** 限流 key 退化为 `${req.ip}_`（username 永远为空），注释中"按用户名+IP 组合防止换 IP 爆破同一账号"的设计意图完全未实现。同一 IP 下所有用户名共享 5 次/15min 的桶。

**修复：** 将 `express.json()` 移到 `authLimiter` 之前，或在 keyGenerator 中不依赖 body（改用 IP-only 限流 + 数据库层的 fail_count 锁定双重防护，后者已有）。

### 6. `/import/full` 缺少校验、事务和隔离

**文件：** `server/routes/csv.js` 第 137-193 行

- **无 schema 校验：** `req.body` 是任意 JSON，直接遍历 `data.accounts`、`data.transactions` 等数组插入数据库。`t.amount`、`t.type`、`t.date` 均无校验。
- **无事务包裹：** 多条 INSERT 分散执行，中途失败导致部分导入、数据不一致。
- **无大小限制：** CSV 导入有 5MB/10000 行限制，JSON 导入没有任何限制。攻击者可发送超大 JSON 造成 DoS。
- **分类查询无 user_id 隔离：** 第 160 行 `SELECT id FROM categories WHERE name = ?` 没有 `AND (user_id IS NULL OR user_id = ?)`，可能匹配到其他用户的私有分类。

### 7. 分类查询缺少 user_id 隔离（CSV 导入）

**文件：** `server/routes/csv.js` 第 79 行

```js
const cat = await db.queryOne('SELECT id FROM categories WHERE name = ?', [row['category'] || '']);
```

没有 `AND (user_id IS NULL OR user_id = ?)` 条件。`utils.js` 的 `ensureCategory` 正确实现了隔离（第 12-13 行），但 CSV 导入绕过了它。

---

## 🟡 Suggestions（应当修复）

### 1. JS 浮点运算处理金额

**涉及文件：** `server/routes/_helpers.js`、`server/routes/accounts.js`、`server/routes/ai.js` 等

DB 层正确使用 `DECIMAL(15,2)`，但代码中大量 `parseFloat()` + JS 原生加减：
```js
// _helpers.js:143
return opening + effects;  // 两个 parseFloat 结果相加
// accounts.js:17
accounts.reduce((s, a) => s + parseFloat(a.balance || 0), 0)
```

`0.1 + 0.2 = 0.30000000000000004`。虽然写回 DB 时 DECIMAL 会截断，但中间计算（如 `computeAccountBalance`、`totalAssets` 汇总）存在精度丢失风险。

**建议：** 统一用**整数分（cents）** 做运算，展示层再除以 100；或引入 `decimal.js`。

### 2. `ensureWeeklySnapshots` 的 N+1 查询 + 无上限循环

**文件：** `server/routes/_helpers.js` 第 151-190 行

对每个 investment 执行 2+ 次查询，且 `while (start <= end)` 按周插入快照。如果 `first_date` 是几年前，循环数百次，每次一个 INSERT。

**建议：** 改为批量 INSERT（`INSERT ... VALUES (...),(...),... ON CONFLICT DO NOTHING`），并加上限（如最多回溯 52 周）。

### 3. `/docs` 的 Swagger UI 从 CDN 加载，被 CSP 拦截

**文件：** `server/index.js` 第 174-197 行

CSP 设置 `defaultSrc: 'self'`、`scriptSrc: 'self'`，但 `/docs` 页面从 `cdn.jsdelivr.net` 加载 Swagger UI 的 CSS 和 JS。生产环境下浏览器会拒绝加载，Swagger UI 页面一片空白。

**建议：** 将 `swagger-ui-dist` 作为 npm 依赖本地化，或在 CSP 中为 `/docs` 路由单独放宽（不推荐）。

### 4. 静态文件暴露用黑名单而非白名单

**文件：** `server/index.js` 第 135-139 行

`BLOCKED_PATHS` 正则拦截已知敏感路径，但 `express.static` 的根目录是**项目根目录**（`path.join(__dirname, '..')`）。任何新增的敏感文件（如 `.env.backup`、`secrets.json`）如果不在黑名单中，就会被直接暴露。

**建议：** 改为白名单——只暴露 `css/`、`js/`、`images/`、`pages/`、`*.html`、`favicon.ico` 等已知前端资源。

### 5. Demo 路由在非生产环境完全无鉴权

**文件：** `server/routes/auth.js` 第 109-152 行

`POST /api/auth/demo` 在非生产环境下无需任何凭证即可获取带完整种子数据的 JWT。如果开发/演示服务器暴露在公网（NAS 端口转发），这就是一个后门。

**建议：** 即使在非生产环境，也要求 `ALLOW_DEMO=true` 显式开启（当前仅在生产环境检查此变量）。

### 6. 登录失败的指数退避在服务端阻塞

**文件：** `server/routes/auth.js` 第 84-85 行

```js
const delay = Math.min(Math.pow(2, failCount) * 100, 3000);
await new Promise(resolve => setTimeout(resolve, delay));
```

每次失败登录占用一个连接最多 3 秒。攻击者可并发发送大量失败请求，耗尽连接池（max: 10）造成 DoS。

**建议：** 移除服务端延迟，依赖数据库层的 `fail_count + locked_until` 机制（已实现且更健壮）。

### 7. `syncCreditCardDebt` 硬编码利率 18.25%

**文件：** `server/routes/utils.js` 第 57、63 行

所有自动同步的信用卡债务利率固定为 18.25%。不同银行/卡种利率差异很大（12%-24%）。

**建议：** 从账户表读取利率，或允许用户在债务详情页修改。

### 8. `export/full` 导出所有分类（含其他用户的私有分类）

**文件：** `server/routes/csv.js` 第 108 行

```js
db.query('SELECT name, type, icon, parent_id FROM categories')
```

没有 `WHERE user_id IS NULL OR user_id = ?` 过滤。多用户部署时会泄露其他用户的自定义分类。

### 9. `POST /accounts` 缺少 type 枚举校验

**文件：** `server/routes/accounts.js` 第 28 行

只检查 `!name || !type`，不验证 type 是否在 `{cash, bank_card, credit_card, electronic_payment, financial_account, digital, other}` 内。可插入任意字符串。

### 10. `unhandledRejection` 只打日志不处理

**文件：** `server/index.js` 第 401-403 行

未处理的 Promise rejection 意味着某处有 bug 被静默吞掉。Node 22+ 默认会因此退出进程，但当前代码覆盖了默认行为。

**建议：** 至少记录完整堆栈，生产环境考虑 shutdown 让容器编排器重启。

### 11. Docker Compose 的 JWT_SECRET 默认值不在 auth.js 的检查列表中

**文件：** `docker-compose.yml` 第 51 行 vs `server/auth.js` 第 11 行

- docker-compose 默认：`please-change-this-secret`
- auth.js 检查：`zhicai-dev-secret-change-me`、`please-change-this-to-a-long-random-secret-string`

如果用户不设置 JWT_SECRET，docker-compose 会注入 `please-change-this-secret`，但 auth.js 不会识别它为"默认值"，不会触发任何警告。生产环境可能用着这个弱密钥而毫不知情。

---

## 💭 Nits（锦上添花）

| # | 位置 | 问题 |
|---|------|------|
| 1 | `package.json:4` | description 写 "MariaDB" 但实际用 PostgreSQL |
| 2 | `csv.js:39` | `var exportType = t` — 使用 `var` 且变量未使用 |
| 3 | `auth.js:40-46` | `verifyPasswordSync` 已无调用方，是死代码 |
| 4 | `index.js:14` | `bcrypt` 被 require 但未直接使用（通过 `hashPassword` 间接调用） |
| 5 | README:171 | 写 "JWT 有效期 7 天"，代码实际是 1 小时（`JWT_EXPIRES = '1h'`） |
| 6 | 项目根目录 | `code-review-report.html` 在 .gitignore 中但仍残留于工作区 |
| 7 | `accounts.js:162` | `debt: { name: r.debt_name, icon: r.debt_icon }` 但 SQL 未 SELECT `d.icon as debt_icon`，`r.debt_icon` 永远为 undefined |

---

## 优化方案（按优先级排序）

### P0 — 立即处理（本周）

| 序号 | 事项 | 工作量 |
|------|------|--------|
| 1 | 从 git 移除 `.env`，轮换 ENCRYPTION_KEY 及所有加密凭证 | 30 min |
| 2 | AI provider `base_url` 添加 SSRF 防护（协议+内网地址校验） | 1 h |
| 3 | `decrypt()` 失败返回 null，调用方处理 null | 1 h |
| 4 | 修复 refresh 端点的 validate schema 格式 | 5 min |
| 5 | 修复 authLimiter 的 keyGenerator（或移除 body 依赖） | 15 min |

### P1 — 短期迭代（两周内）

| 序号 | 事项 | 工作量 |
|------|------|--------|
| 6 | `/import/full` 添加 schema 校验 + 事务 + 大小限制 + user_id 隔离 | 3 h |
| 7 | CSV 导入分类查询添加 user_id 条件 | 15 min |
| 8 | 金额运算改为整数分或 decimal.js | 4 h |
| 9 | Swagger UI 本地化 | 30 min |
| 10 | 静态文件改为白名单暴露 | 1 h |
| 11 | docker-compose JWT_SECRET 默认值加入 auth.js 检查列表 | 5 min |
| 12 | `ensureWeeklySnapshots` 批量化 + 加上限 | 1 h |

### P2 — 中期改善（一个月内）

| 序号 | 事项 | 工作量 |
|------|------|--------|
| 13 | Demo 路由统一要求 ALLOW_DEMO=true | 15 min |
| 14 | 移除服务端登录延迟，依赖 DB 锁定机制 | 15 min |
| 15 | 信用卡利率可配置化 | 1 h |
| 16 | `export/full` 分类查询添加 user_id 过滤 | 15 min |
| 17 | 账户 type 枚举校验 | 15 min |
| 18 | 修复 `debt_icon` 未 SELECT 的 bug | 5 min |
| 19 | README 与代码对齐（JWT 有效期、DB 类型） | 15 min |

---

## 做得好的地方（值得保持）

- **复式记账设计：** 余额由账本推导（`computeAccountBalance`）而非增量更新，从根本上避免了余额漂移。这是很多商业记账软件都做不到的。
- **参数化查询全覆盖：** 所有 SQL 均使用 `?` 占位符 + `convertPlaceholders` 转换，未发现任何字符串拼接。
- **CSP 持续收紧：** 注释记录了从 `unsafe-inline` 到事件委托重构的过程，说明安全是持续迭代的。
- **事务封装的陷阱规避：** `db.js` 中 `transaction()` 的 `client.query` 覆盖后在 `finally` 中还原，并注释解释了"不还原会导致连接池永久挂起"——这是踩过坑后的经验沉淀。
- **加密密钥的多级回退设计：** 环境变量 > 数据卷文件 > 自动生成，兼顾了安全性和易用性。
- **OCR 的正则快速路径：** 先用正则提取（0ms），失败再调 AI（2-3s），省钱省时。
- **输入校验中间件：** `validate.js` 零依赖、支持嵌套校验，设计简洁实用。

---

*审查人：火眼眼 👁️ | 2026-07-29*
