# 鑫钱包 · 项目交接记录

> 最后更新：2026-08-15 · 当前版本 v0.0.4

## 一、项目概述

个人财务助手，三端一体：

| 端 | 技术栈 | 目录 |
|----|--------|------|
| 后端 | Node.js 22 + Express + PostgreSQL（双方言兼容 MySQL） | `server/` |
| Android | Kotlin + Jetpack Compose（暖棕品牌色） | `android/` |
| Web | 原生 JS + 自定义 CSS | `public/` |

核心能力：多账本（账套）隔离、复式记账、投资理财、债务、储蓄目标、AI 语音记账、统计报表。

## 二、当前版本状态

- **最新 tag**：`v0.0.4`（2026-08-15），Release 含 `XinWallet.android.v0.0.4.apk`
- **Docker 镜像**：`ghcr.io/xin-wallet`（与 APK 版本对齐）
- **提交链**（本日收尾）：
  - `2fb44f9` feat: 多账本 + UI 卡片化 + 统计交互 + 语音识别 + 应用锁等大版本更新
  - `d7442ab` test: 修复多账本改造后测试未同步适配导致的 4 个失败用例
  - `6ce1c9d` fix: verify-routes 支持解构赋值形式的 require
  - `14321e8` fix: schema.sql 补上 accounts 表的 book_id 幂等迁移

## 三、CI/CD 发布链（重要）

```
push main
  → PR Test Gate（npm test + verify-routes，必须全绿）
  → Auto Tag（成功后才打 vX.Y.Z tag，只递增 PATCH，X.Y 锁死 0.0）
  → 派发 release-image（Docker 镜像）+ android-build（APK + Release）
```

- 触发文件：`.github/workflows/{pr-test,auto-tag,release-image,android-build,security-scan}.yml`
- **push main 触发** PR Test Gate + Security Scan；**PR 触发** Android Build 编译校验（不发布）
- 版本号规则：`feat/fix/refactor/perf/build/style` 提交才触发 Z+1；`docs/chore/ci` 跳过

## 四、APK 签名（不可变更的硬约束）

- 签名密钥：`android/app/debug.keystore`（**自提交 0b1cc86 起固定，严禁更换/重建**）
- 证书 SHA-256 指纹：`5f717babca23523dd831228aa5f155cf6315bd6f5b5c7c049ec47d9786504f1d`
- 三处一致性校验（任一不一致即构建失败或运行时拒绝安装）：
  1. CI `android-build.yml` 的「签名指纹钉死」步骤
  2. App 内 `ApkVerifier.kt` 的 `EXPECTED_CERT_SHA256`
  3. keystore 实际指纹
- **换 keystore = 已装用户无法覆盖升级**，务必同步更新上面三处

## 五、多账本（book_id）架构

- 中间件：`server/routes/books.js` 的 `resolveBookContext`（`routes.js` 中置于 `authMiddleware` 之后）
- 解析优先级：`X-Book-Id` 请求头 → 默认账本 → 自动创建默认账本
- 所有用户级财务查询/写入按 `req.bookId` 隔离；`book_id IS NULL` 表示「用户级共享」或遗留数据
- 启动自愈：`db.js` 的 `healBooks()` 为每用户建默认账本并回填 `NULL` 行

## 六、已知坑与注意事项

1. **旧库升级**：schema 双方言（`schema.sql` PG / `schema.mysql.sql` MySQL）。旧库靠末尾「多账本迁移」块的幂等 `ADD COLUMN IF NOT EXISTS book_id` 补齐列；若新增表/列，两个 schema 文件都要同步（历史教训：PG 版曾漏 accounts，见 14321e8）。
2. **占位符混用**：`db.js` 的 `prepare()` 自动归一化 `?` 与 `$N`，业务 SQL 可混用，勿手动改。
3. **OCR SDK 惰性加载**：`tencentcloud-sdk-nodejs-ocr` 顶层 require 会连带加载 node-fetch（本机 node-fetch 损坏会导致服务起不来），已改为 `getOcrClient()` 首次调用时才 require。
4. **命令行 gradle 编译**：会被 Android Studio daemon 持有 wrapper 锁（`拒绝访问`），需用户在 AS 内构建，或先停掉 AS。
5. **本地 git 跟踪引用**：`refs/remotes/origin/main` 曾卡在旧值（packed-refs 927bf14），`git status` 显示 ahead 异常——仅本地显示问题，勿用 `git pull` 覆盖本地，用 AS 的 Fetch 刷新。
6. **GitHub 推送认证**：本机 GCM 无法在无 GUI 终端弹窗；SSH key 未绑定到 GitHub 账户。推送需在 AS Terminal / Git Bash 手动执行，或用 PAT 一次性 URL。
7. **Dependabot**：`.github/dependabot.yml` 首次启用会批量开依赖更新 PR（曾一次 15 个，每个触发 3 套 CI）。建议关闭或调低 `open-pull-requests-limit`。

## 七、环境与部署

- 后端环境变量：`DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME / DB_DIALECT / JWT_SECRET / ENCRYPTION_KEY / ALLOW_DEMO / APP_PORT`
- 本地启动：仓库外 `logs/start-dev.sh`（docker 起 postgres:16 → npm start，端口 18888）
- 生产：`Dockerfile` 构建镜像，`docker-compose.yml` 编排
- 数据库：PostgreSQL（默认）或 MySQL/MariaDB（`DB_DIALECT=mysql`）

## 八、交接清单

- [ ] 撤销本次使用的 GitHub PAT 令牌（Settings → Developer settings → Personal access tokens）
- [ ] 生产数据库执行 `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS book_id INT DEFAULT NULL;`（或重新部署镜像）
- [ ] 关闭/调低 Dependabot（如需）
- [ ] 真机验证 v0.0.4 APK 覆盖安装 + 自动更新
