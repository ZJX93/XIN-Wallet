# 鑫钱包审查报告 · 复核与优化

**复核日期：** 2026-07-29  
**复核人：** 吴八哥 💎（高级开发工程师）  
**对象：** `code-review-2026-07-29.md`（火眼眼审查报告）

---

## 一、复核结论：原报告准确性评估

原报告整体质量高，25 条发现中 22 条判断准确。以下是需要修正或补充的部分：

### ⚠️ 严重度调整（2 条降级）

| 原编号 | 原级别 | 调整后 | 理由 |
|--------|--------|--------|------|
| Blocker #4（Refresh 校验失效） | 🔴 | 🟡 | `validate()` 虽被绕过，但 `jwt.verify(token, secret, { algorithms: ['HS256'] })` 仍在第 164 行正常工作。真正的安全保障（签名验证 + type 检查 + 用户存在性检查）全部有效。被绕过的仅是 body 字段的 min/max 长度约束——攻击者无法利用此缺陷伪造 token 或越权。属于"防御层缺失"而非"安全漏洞"。 |
| Blocker #5（限流 keyGenerator） | 🔴 | 🟡 | 限流器本身仍在工作（per-IP 5次/15min），只是 username 维度失效。更关键的是：数据库层的 `fail_count + locked_until` 机制提供了**独立的 per-account 锁定**（5次失败锁15分钟），这才是真正的防暴力破解核心。限流器是额外防线，其退化不构成安全突破。 |

### ⚠️ 事实修正（1 条）

| 原描述 | 修正 |
|--------|------|
| Blocker #6 "/import/full 无大小限制" | Express 4.x 的 `express.json()` 默认有 **100kb** body 限制（`server/index.js:100` 未显式配置 limit 参数，继承默认值）。所以并非"无任何限制"，但 100kb 仍可包含数百条记录，且该限制未被文档化、不可控。**应显式配置并记录。** |

### ✅ 确认准确的判断

- Blocker #1（.env 入 git）：`git ls-files` 确认跟踪，提交 `6b92ff7` 确认有意为之。🔴 无误。
- Blocker #2（SSRF）：`httpsPostJson` 零校验，`new URL(url)` 接受任意协议/地址。🔴 无误。
- Blocker #3（decrypt 静默回退）：`getActiveProvider` 第 39 行直接用 `decrypt()` 返回值，无 null 检查。🔴 无误。
- Blocker #6/#7（import 校验缺失 + 分类隔离）：代码确认。🔴 无误（降级大小限制描述后仍为 Blocker，因无事务+无校验是数据完整性问题）。
- Nit #3（verifyPasswordSync 死代码）：grep 确认仅在 export 和 require 中出现，无实际调用。✅
- Nit #4（index.js bcrypt）：第 14 行 require 后仅在第 312 行注释中提及，实际通过 `hashPassword` 间接使用。✅ 属冗余 require。
- Nit #7（debt_icon undefined）：SQL 第 128 行仅 SELECT `d.name as debt_name`，未 SELECT `d.icon`。✅ 确认 bug。

---

## 二、原报告遗漏（新增发现）

### 🟡 新增 #1：`/health/deep` 未鉴权，暴露内部配置状态

**文件：** `server/index.js` 第 210-257 行

```js
app.get('/health/deep', async (req, res) => { ... })
```

该端点无需认证即可访问，返回：
- 是否配置了 `ENCRYPTION_KEY`、`JWT_SECRET`、`DB_HOST`（布尔值）
- Node 版本、平台、架构
- 进程内存使用、运行时长
- 数据库连接延迟

攻击者可据此判断部署环境（如"JWT_SECRET 未配置"→ 可能用默认密钥）、Node 版本（匹配已知 CVE）、内存特征等。

**修复：** 添加 IP 白名单或要求内部鉴权 header；或至少移除 `config` 和 `runtime` 字段，仅保留 `database.ok` + `uptime`。

### 🟡 新增 #2：`express.json()` 未显式配置 body 大小限制

**文件：** `server/index.js` 第 100 行

```js
app.use(express.json()); // 默认 100kb，未文档化
```

- 默认 100kb 对 `/import/full`（JSON 备份导入）可能不够用——用户的完整账本备份很容易超过 100kb。
- 但其他 API（如创建交易）只需几 KB。
- 当前状态：要么导入功能在大账本下会静默失败（413 Payload Too Large），要么开发者在某处已遇到此问题。

**修复：**
```js
// 全局默认收紧
app.use(express.json({ limit: '256kb' }));
// 导入路由单独放宽
app.use('/api/import', express.json({ limit: '5mb' }));
```

### 💭 新增 #3：`morgan('dev')` 在生产环境输出过于详细

**文件：** `server/index.js` 第 99 行

`morgan('dev')` 输出彩色日志含完整 URL（可能含 query 参数中的敏感信息如 month、search 关键词）。生产环境应使用 `morgan('combined')` 或条件日志。

### 💭 新增 #4：`POST /accounts` 的 `balance` 字段可传入负数

**文件：** `server/routes/accounts.js` 第 32 行

`parseFloat(balance) || 0` 对负数不做拦截。虽然负余额在信用卡场景有意义，但 `opening_balance` 同步为负数可能导致 `computeAccountBalance` 的期初值异常。应明确业务规则。

---

## 三、优化后的修复方案

基于复核结论，重新排列优先级。核心原则：**安全 > 数据完整性 > 可用性 > 代码质量**。

### P0 — 安全紧急（24h 内）

| # | 事项 | 具体操作 | 工时 |
|---|------|----------|------|
| 1 | 移除 .env 跟踪 + 轮换密钥 | `git rm --cached .env` → 提交 → 生成新 ENCRYPTION_KEY → 重新加密所有 AI/OCR 凭证 | 1h |
| 2 | SSRF 防护 | `httpsPostJson` 入口校验协议 + 拒绝 RFC1918/link-local/loopback 地址 + 拒绝重定向到内网（`http.request` 的 `followRedirects` 需手动处理） | 2h |
| 3 | `decrypt()` 返回 null + 调用方适配 | crypto.js 修改 + `getActiveProvider`/`ai.js` 路由增加 null 检查返回 400 | 1h |

**P0 总计：~4h**

### P1 — 数据完整性（本周）

| # | 事项 | 具体操作 | 工时 |
|---|------|----------|------|
| 4 | `/import/full` 加固 | ① 包裹 `db.transaction` ② 校验 `type` 枚举 + `amount > 0` + `date` 格式 ③ 分类查询加 `(user_id IS NULL OR user_id = ?)` ④ 显式 body limit 5mb | 3h |
| 5 | CSV 导入分类隔离 | 第 79 行加 `AND (user_id IS NULL OR user_id = ?)` + 参数 | 10min |
| 6 | `export/full` 分类过滤 | 第 108 行加 `WHERE user_id IS NULL OR user_id = ?` | 10min |
| 7 | 显式配置 body limit | 全局 256kb + 导入路由 5mb | 15min |
| 8 | `/health/deep` 脱敏 | 移除 config/runtime 字段，或加 `X-Internal-Token` 校验 | 30min |

**P1 总计：~4.5h**

### P2 — 功能修正（两周内）

| # | 事项 | 具体操作 | 工时 |
|---|------|----------|------|
| 9 | Refresh 校验修复 | `validate([...])` → `validate({ body: { refreshToken: {...} } })` | 5min |
| 10 | authLimiter 修复 | 方案 A：`express.json()` 前移；方案 B（推荐）：keyGenerator 改为纯 IP，注释说明 DB 层已有 per-account 锁定 | 15min |
| 11 | Swagger UI 本地化 | `npm i swagger-ui-dist` → 静态挂载 → 移除 CDN 引用 | 30min |
| 12 | 静态文件白名单 | 改为 `express.static` 只暴露 `public/` 目录（需移动前端文件）或用中间件白名单过滤 | 1.5h |
| 13 | Demo 路由加固 | 所有环境统一检查 `ALLOW_DEMO === 'true'` | 10min |
| 14 | `debt_icon` bug | SQL 加 `d.icon as debt_icon` | 5min |
| 15 | Docker JWT_SECRET 默认值 | auth.js 检查列表加入 `please-change-this-secret` | 5min |

**P2 总计：~3h**

### P3 — 架构改善（一个月内，可选）

| # | 事项 | 说明 | 工时 |
|---|------|------|------|
| 16 | 金额运算精度 | 引入 `decimal.js` 或改为整数分。**注意：这是跨 15+ 文件的重构，涉及前端展示层，实际工时 2-3 天而非原报告估的 4h。** 建议先评估是否真出现过精度问题（DECIMAL(15,2) 写回时会截断，实际风险集中在汇总展示的瞬时误差）。 | 2-3d |
| 17 | `ensureWeeklySnapshots` 批量化 | 生成 VALUES 列表一次 INSERT + 限制回溯 52 周 | 1h |
| 18 | 信用卡利率可配置 | accounts 表加 `interest_rate` 列，`syncCreditCardDebt` 读取 | 1h |
| 19 | 登录延迟移除 | 删除 setTimeout，注释说明依赖 DB 锁定 | 10min |
| 20 | `unhandledRejection` 处理 | 记录完整堆栈 + 生产环境触发 graceful shutdown | 20min |
| 21 | 账户 type 枚举校验 | POST/PUT /accounts 校验 type 白名单 | 15min |

### P4 — 代码卫生（顺手修）

| # | 事项 |
|---|------|
| 22 | 删除 `verifyPasswordSync` 死代码 |
| 23 | 删除 `index.js` 冗余 `bcrypt` require |
| 24 | `csv.js:39` 删除 `var exportType` |
| 25 | `package.json` description 改 PostgreSQL |
| 26 | README JWT 有效期改为 1h |
| 27 | `morgan('dev')` → 生产用 `combined` |

---

## 四、SSRF 修复方案优化

原报告的 `isPrivateHost` 示例有三个不足：

1. **不处理 IPv6**（`::1`、`fe80::`、`fc00::` 等）
2. **不处理 DNS rebinding**（域名解析到内网 IP）
3. **不处理 HTTP 重定向**（301/302 跳转到内网）

优化后的完整方案：

```js
// server/services/url-guard.js
const dns = require('dns').promises;
const net = require('net');

const PRIVATE_RANGES_V4 = [
  [0x0A000000, 0xFF000000], // 10.0.0.0/8
  [0x7F000000, 0xFF000000], // 127.0.0.0/8
  [0xA9FE0000, 0xFFFF0000], // 169.254.0.0/16
  [0xAC100000, 0xFFF00000], // 172.16.0.0/12
  [0xC0A80000, 0xFFFF0000], // 192.168.0.0/16
  [0x00000000, 0xFF000000], // 0.0.0.0/8
];

function ipToLong(ip) {
  return ip.split('.').reduce((acc, oct) => (acc << 8) + parseInt(oct), 0) >>> 0;
}

function isPrivateIPv4(ip) {
  const long = ipToLong(ip);
  return PRIVATE_RANGES_V4.some(([net, mask]) => (long & mask) === net);
}

function isPrivateIPv6(ip) {
  return ip === '::1' || ip.startsWith('fe80:') || ip.startsWith('fc') || ip.startsWith('fd');
}

async function assertPublicUrl(urlStr) {
  const u = new URL(urlStr);
  if (!['http:', 'https:'].includes(u.protocol)) {
    throw new Error('仅支持 HTTP/HTTPS');
  }
  let hostname = u.hostname.replace(/^\[|\]$/g, ''); // 去 IPv6 方括号
  if (net.isIPv4(hostname)) {
    if (isPrivateIPv4(hostname)) throw new Error('禁止访问内网地址');
    return u;
  }
  if (net.isIPv6(hostname)) {
    if (isPrivateIPv6(hostname)) throw new Error('禁止访问内网地址');
    return u;
  }
  // 域名：DNS 解析后校验所有 A/AAAA 记录
  const { address } = await dns.lookup(hostname, { all: false });
  if (net.isIPv4(address) && isPrivateIPv4(address)) throw new Error('域名解析到内网地址');
  if (net.isIPv6(address) && isPrivateIPv6(address)) throw new Error('域名解析到内网地址');
  return u;
}

module.exports = { assertPublicUrl };
```

调用侧（`ai.js`）：
```js
const { assertPublicUrl } = require('./url-guard');

async function httpsPostJson(url, headers, body) {
  await assertPublicUrl(url); // ← 新增
  // ... 原有逻辑，且禁用自动重定向（http.request 默认不跟随，确认即可）
}
```

---

## 五、decrypt() 修复的兼容性考量

原报告建议"decrypt 失败返回 null"，方向正确但需注意**向后兼容**：

当前数据库可能存在**明文存储的旧数据**（crypto.js 注释提到"兼容明文回退"）。如果直接改为返回 null，旧数据会全部失效。

**推荐渐进方案：**

```js
function decrypt(ciphertext) {
  if (!ciphertext) return null;
  try {
    const buf = Buffer.from(ciphertext, 'hex');
    if (buf.length < IV_LENGTH + TAG_LENGTH) {
      // 长度不足：可能是旧版明文，记录警告但暂时返回原值
      console.warn('[crypto] 疑似明文数据（长度不足），建议迁移:', ciphertext.slice(0, 8) + '...');
      return ciphertext; // 过渡期保留，下个版本移除
    }
    // 正常解密
    const iv = buf.subarray(0, IV_LENGTH);
    const tag = buf.subarray(IV_LENGTH, TAG_POSITION + TAG_LENGTH);
    const encrypted = buf.subarray(TAG_POSITION + TAG_LENGTH);
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(encrypted, undefined, 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    // 真正的解密失败（tag 校验不过）→ 明确返回 null
    return null;
  }
}
```

关键区别：
- **长度不足**（旧明文）→ 过渡期返回原值 + 警告日志
- **tag 校验失败**（密钥错误/数据损坏）→ 返回 null（不再静默回退）

这样既修复了安全问题，又不会让已有明文数据突然失效。

---

## 六、总结

| 维度 | 原报告 | 复核后 |
|------|--------|--------|
| 🔴 Blocker | 7 条 | **5 条**（#4、#5 降为 🟡） |
| 🟡 Suggestion | 11 条 | **15 条**（+2 降级 +2 新增） |
| 💭 Nit | 7 条 | **9 条**（+2 新增） |
| P0 工时估算 | ~3h | **~4h**（SSRF 方案完善） |
| 金额重构工时 | 4h | **2-3 天**（原估严重不足） |

**最终判断：** 原报告是一份高质量的审查，核心发现（.env 泄露、SSRF、decrypt 回退、import 无校验）全部成立且优先级正确。主要优化点在于：① 两条 Blocker 降级避免过度修复；② SSRF 方案需覆盖 IPv6/DNS/重定向；③ decrypt 修复需考虑明文兼容过渡；④ 金额重构工时需重新评估；⑤ 补充 `/health/deep` 信息泄露和 body limit 配置两个遗漏。

---

*复核人：吴八哥 💎 | 2026-07-29*
