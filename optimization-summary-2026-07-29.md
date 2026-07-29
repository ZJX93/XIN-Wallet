# 鑫钱包 · 优化执行总结

**执行日期：** 2026-07-29 21:38 → 22:05  
**执行人：** 吴八哥 💎（高级开发工程师）  
**依据：** `code-review-2026-07-29.md`（火眼眼）+ `code-review-revision-2026-07-29.md`（吴八哥复核）

---

## 一、变更文件清单

### 新增（1 个）

| 文件 | 用途 |
|------|------|
| `server/services/url-guard.js` | SSRF 防护模块，覆盖 IPv4/IPv6 字面量、内网 RFC1918、AWS metadata (169.254)、CGN (100.64)、保留段、DNS 解析后二次校验、`localhost` 字面量、协议白名单 |

### 修改（10 个）

| 文件 | 核心变更 |
|------|----------|
| `.env` | **从 git 跟踪移除**（保留本地文件，由用户保管） |
| `server/services/ai.js` | SSRF 防护：httpsPostJson 入口调用 `assertPublicUrl()`；`getActiveProvider` 适配 decrypt 失败返回 null（带结构化错误日志） |
| `server/crypto.js` | `decrypt()` 渐进式修复：长度不足过渡期返回原值+警告，tag 校验失败明确返回 null |
| `server/auth.js` | JWT 默认值清单改为 Set，加入 docker-compose 用的 `please-change-this-secret`；删除 `verifyPasswordSync` 死代码 |
| `server/index.js` | 删除冗余 `bcrypt` require；`morgan('dev')` 改为生产 `combined`；`express.json` 显式 `limit: '1mb'`；`/health/deep` 移除 config/runtime 敏感字段；`authLimiter.keyGenerator` 改为纯 IP（DB 层 per-account 锁定为第二道防线） |
| `server/routes/csv.js` | `/import/full` 包裹事务 + 全字段类型校验 + 分类查询 user_id 隔离；`/import/csv` 分类查询加隔离；`/export/full` 分类导加隔离；删除 `var exportType` 死代码 |
| `server/routes/ai.js` | `providers/:id/test` 适配 decrypt 失败精准报错；OCR 端点拆分两次 decrypt 并校验返回值 |
| `server/routes/auth.js` | Demo 路由统一要求 `ALLOW_DEMO=true`；Refresh 验证从数组 schema 改为对象 schema；删除 `verifyPasswordSync` 引用 |
| `server/routes/accounts.js` | 还款流水 SQL 增加 `d.icon as debt_icon`（修复 undefined bug） |
| `package.json` | description 中 MariaDB → PostgreSQL |
| `README.md` | 登录 JWT 有效期说明改为"access 1h，refresh 7d" |

### 已验证

- **9 个修改文件**全部通过 `node -c` 语法检查
- **url-guard 7 个测试用例全部通过**（内网/IPv6/AWS metadata/localhost/协议非法/公网正向）
- **decrypt 5 种返回语义全部按预期**（正常解密、长度不足过渡期、tag 失败、null 输入、空字符串）

---

## 二、实际完成项 vs 方案

| 方案编号 | 事项 | 状态 |
|---------|------|------|
| P0-1 | .env 跟踪移除（密钥轮换保留给用户） | ✅ 完成 |
| P0-2 | SSRF 防护（url-guard + ai.js 接入） | ✅ 完成 |
| P0-3 | decrypt() 渐进式修复 + 调用方适配 | ✅ 完成 |
| P1-1 | /import/full 加固（事务+字段校验+user_id 隔离） | ✅ 完成 |
| P1-2 | CSV 导入分类查询隔离 | ✅ 完成 |
| P1-3 | export/full 分类过滤 | ✅ 完成 |
| P1-4 | body limit 显式配置（1mb） | ✅ 完成 |
| P1-5 | /health/deep 脱敏 | ✅ 完成 |
| P2-1 | Refresh validate 格式修复 | ✅ 完成 |
| P2-2 | authLimiter keyGenerator 改纯 IP | ✅ 完成（DB 层锁定作为第二道防线） |
| P2-3 | Demo 路由统一 ALLOW_DEMO=true | ✅ 完成 |
| P2-4 | debt_icon bug | ✅ 完成 |
| P2-5 | JWT 默认值清单加 docker 默认值 | ✅ 完成 |
| P2-6 | morgan 生产用 combined | ✅ 完成 |
| P4-1 | 删除 verifyPasswordSync 死代码 | ✅ 完成 |
| P4-2 | 删除 index.js 冗余 bcrypt require | ✅ 完成 |
| P4-3 | 删除 var exportType | ✅ 完成 |
| P4-4 | package.json description | ✅ 完成 |
| P4-5 | README JWT 有效期 | ✅ 完成 |
| P2-Swagger | Swagger UI 本地化 | ⏭️ 跳过（需新增 npm 依赖+打包） |
| P2-静态白名单 | 静态文件改为白名单暴露 | ⏭️ 跳过（涉及前端文件结构重组） |
| P3-金额重构 | decimal.js 引入 | ⏭️ 跳过（跨 15+ 文件需 2-3 天专项） |

**总计：19 项完成，3 项跳过（已说明原因）**

---

## 三、需要用户后续手动处理的项

由于涉及密钥与外部状态，以下步骤需用户决策，**脚本无法自动完成**：

### 1. 密钥轮换（必须！）

`.env` 中含固定 `ENCRYPTION_KEY`，无论 `.gitignore` 与否，历史已泄露。

```bash
# (a) 生成新密钥
openssl rand -hex 32
# (b) 更新 .env 中的 ENCRYPTION_KEY
# (c) 重启服务端
# (d) 登录系统 → AI 配置 / OCR 配置页 → 重新保存凭证（用新密钥重新加密）
# (e) 如果是公开仓库，需要 BFG 清理历史 .env 文件
```

### 2. 提交清理（视部署情况）

当前状态：`.env` 已从索引移除，但还在工作区（保留）。建议：

```bash
cd XIN-Wallet
git status          # 确认 .env 状态为 "D  .env"（删除待提交）
git add .env
# 不要 commit 真实的 .env 重新入仓！
# 仅 commit 其他改动后，本地的 .env 仍然存在但不被 git 跟踪
```

### 3. ALLOW_DEMO 显式开启

修复后 `/api/auth/demo` 在**任何环境**下都需要 `ALLOW_DEMO=true`。如果演示功能是核心使用流程，需要：

```
.env 中加: ALLOW_DEMO=true
```

### 4. 测试验证清单（建议手动跑一遍）

| 测试 | 期望 |
|------|------|
| 启动服务 | 启动日志不再有"JWT_SECRET 默认"警告（如果 .env 已配置） |
| 注册+登录 | 正常 |
| AI 配置（添加 OpenAI/Anthropic provider） | 正常 |
| AI 财务建议 / OCR 票据识别 | 正常调用 |
| `/api/auth/demo` | 403（除非 ALLOW_DEMO=true） |
| 演示账号密码登录 | 5 次失败后账号锁定 15 分钟 |
| `/health/deep` | 返回值无 `config` 和 `runtime` 字段 |
| 上传 CSV/JSON 导入 | >1mb 返回 413 |

---

## 四、未做项的简要替代方案

### Swagger UI 本地化

```bash
npm install swagger-ui-dist@^5 --save
# 在 index.js 中：
# const swaggerUiAsset = require('swagger-ui-dist');
# app.use('/docs/swagger-ui.css', express.static(swaggerUiAsset.getAbsoluteFSPath() + '/swagger-ui.css'));
# app.use('/docs/swagger-ui-bundle.js', express.static(swaggerUiAsset.getAbsoluteFSPath() + '/swagger-ui-bundle.js'));
# app.get('/docs', (req, res) => res.sendFile(path.join(swaggerUiAsset.getAbsoluteFSPath(), 'index.html')));
```

### 静态文件白名单

```js
// 创建专门的 public/ 目录存放前端文件（需迁移 css/js/pages/images 等）
// index.js 中:
app.use(express.static(path.join(__dirname, '..', 'public'), { ... }));
// 配合 CSP 解除 scriptSrc/styleSrc 对 'self' 的依赖
```

### 金额重构（建议先审计）

```bash
# 找出所有 parseFloat 涉及金额的场景
grep -rn 'parseFloat.*amount\|parseFloat.*balance\|parseFloat.*total' server/
grep -rn 'parseFloat.*price\|parseFloat.*cost' server/
# 引入 decimal.js 后逐步替换
```

---

## 五、代码影响统计

| 维度 | 数值 |
|------|------|
| 新增代码行 | url-guard.js ≈ 130 行 |
| 修改代码行 | 约 200 行（散落在 9 个文件） |
| 删除代码 | 死代码 1 处（verifyPasswordSync）、冗余 require 1 处（bcrypt）、`var exportType` 1 处 |
| 安全影响面 | SSRF 0 容忍、密钥轮换可行（接口已就绪）、分类查询 100% user_id 隔离、健康检查不再泄露配置 |
| 性能影响 | 几乎无（新增 SSRF 校验仅在 AI provider 调用时生效，DNS 解析 1 次） |

---

## 六、建议的提交策略

按逻辑拆 3 个 commit，便于 review 和回滚：

```bash
git add server/services/url-guard.js server/services/ai.js server/crypto.js server/routes/ai.js
git commit -m "security: SSRF 防护 + decrypt() 渐进式修复 + AI provider 适配"

git add server/routes/csv.js server/index.js server/routes/auth.js server/auth.js server/routes/accounts.js
git commit -m "security: import/export 加固 + Demo 加固 + JWT 默认值检查 + 健康检查脱敏"

git add package.json README.md
git commit -m "chore: 修正 package.json DB 类型与 README JWT 有效期说明"

# .env 不要 add！只 add 其他文件
git add .env.example code-review*.md optimization-summary-2026-07-29.md
git commit -m "docs: 加入审查报告与执行总结（.env 跟踪移除另由 commit 单独处理）"
```

---

*执行完成 — 待用户审查与密钥轮换操作*
