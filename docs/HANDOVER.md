# 鑫钱包（XinWallet）· 项目交接资料

> 最后更新：2026-08-15 · 当前版本 **v0.0.7** · 仓库 https://github.com/ZJX93/XinWallet
> 本文档是项目权威交接资料，整合了历史交接文档（网盘 v0.0.1 / v0.0.3）与最新开发记录，供新协作者直接接手。

---

## 一、项目概述

个人财务助手，**三端一体、前后端分离 + 移动端**：

| 端 | 技术栈 | 目录 |
|----|--------|------|
| 后端 | Node.js 22 + Express + PostgreSQL（双方言兼容 MySQL） | `server/` |
| Android | Kotlin + Jetpack Compose（暖棕品牌色，无 XML） | `android/` |
| Web | 原生 HTML/CSS/JS | `public/` |
| 部署 | Docker 镜像（GHCR）+ NAS，`docker-compose` 编排 | `Dockerfile` / `docker-compose.yml` |
| CI/CD | GitHub Actions（测试门禁 → 自动打 tag → 构建 APK / 镜像） | `.github/workflows/` |

核心能力：**多账本（账套）隔离、复式记账、投资理财、债务、储蓄目标、AI 语音记账、统计报表、预算、应用锁**。

关键事实：业务数据（记账/预算/理财/分类）全部在 **NAS 上的 PostgreSQL**；Web 与安卓都是**纯客户端**，**卸载重装不丢数据**，自动从 NAS 拉回。

---

## 二、代码仓库与版本状态

| 项 | 值 |
|---|---|
| 仓库地址 | https://github.com/ZJX93/XinWallet.git |
| 默认分支 | `main` |
| 当前 HEAD | `d379372` |
| 最新 tag | `v0.0.7`（指向 `d379372`） |

### 版本历史（tag → commit）

| Tag | Commit | 主要内容 |
|-----|--------|----------|
| v0.0.1 | `1c86cb0` | versionCode 数值对应；auto-tag 从 v0.0.1 起 |
| v0.0.2 | `5f07126` | 理财卡片全量堆叠显示 + 安卓底部 5 tab |
| v0.0.3 | `1783b21` | 记账 tab 突出 1/6 圆形按钮 |
| v0.0.4 | `6ce1c9d` | 多账本大版本（`2fb44f9`）+ 测试/路由校验修复 |
| v0.0.5 | `14321e8` | schema.sql 补 accounts.book_id 幂等迁移 |
| v0.0.6 | `234eb2f` | 理财市值趋势只显总市值 + AI 分类修复 + 储蓄卡更名 + 账本管理 |
| v0.0.7 | `d379372` | 语音识别超时回退 partial + 记账秒选择滚动钟盘 |

### 版本号规则（不可违背）

- 锁死 `0.0.x`，只递增末位 Z（由 `auto-tag.yml` 自动 bump，**勿手动打 tag**）。
- 提交信息用 Angular 规范：`feat/fix/refactor/perf/build/style` 才触发 Z+1；`docs/chore/ci` 跳过。
- 只有 PR Test Gate 全绿才会打 tag；Gate 红 → 不打 tag → 下游 APK/镜像全部不派发。

---

## 三、技术架构

```
XinWallet/
├── android/                 # Kotlin + Jetpack Compose
│   └── app/src/main/java/com/xinwallet/app/
│       ├── ui/screens/      # Home/Transactions/Reports/Profile/AddTransaction/Chat/Search/Debts/AppLock ...
│       ├── ui/components/   # BookHeader / CalendarCell / Charts 等共享组件
│       ├── ui/viewmodel/    # Home/Chat/AddTransaction/Reports/Profile ViewModel
│       ├── data/            # remote(ApiService) / local(SessionManager) / repository
│       └── app/build.gradle.kts
├── server/                  # Node 服务端（独立 package.json + lock）
│   ├── routes/              # transactions/stats/reports/accounts/books/ai/auth/csv ...
│   ├── services/            # ai.js（对话 + 转写服务商）
│   └── db.js / schema.sql / schema.mysql.sql
├── public/                  # Web 前端（原生 JS + 自定义 CSS）
│   ├── js/                  # app.js / auth.js / data.js / managers/...
│   └── index.html
├── test/                    # Node 测试套件（node --test）
├── scripts/                 # check-lock.mjs 等零依赖脚本
├── .github/workflows/       # pr-test / auto-tag / release-image / android-build / security-scan
└── docs/HANDOVER.md         # 本文档
```

关键约定：

- 服务端 `server/` 与仓库根各有**独立** `package.json` + `package-lock.json`，互相不同步，需分别 `npm install` 维护。
- Docker 构建用 `server/` 下的 lock，不是根目录。
- 数据库方言：`schema.sql`（PG）+ `schema.mysql.sql`（MySQL），**两个都要同步维护**（历史教训：PG 版曾漏 accounts.book_id，见 v0.0.5）。
- 占位符：`db.js` 的 `prepare()` 自动归一化 `?` 与 `$N`，业务 SQL 可混用，勿手动改。

---

## 四、CI/CD 发布链

```
push main
  → PR Test Gate（npm test + verify-routes，必须全绿）
  → Security Scan
  → Auto Tag（Gate 成功后才打 vX.Y.Z，只递增 PATCH）
  → 派发 release-image（Docker 镜像 → GHCR）+ android-build（APK → Release）
```

| 文件 | 触发 | 作用 |
|------|------|------|
| `pr-test.yml` | push main / PR | 跑测试套件 + 路由挂载校验（Gate，成功才派发下游） |
| `auto-tag.yml` | PR Test Gate 成功 | 按 Angular 规范算版本号、打 tag、派发下游 |
| `android-build.yml` | auto-tag 派发 / PR / 手动 | 构建 APK + 建 Release，含**签名指纹钉死校验** |
| `release-image.yml` | push `v*.*.*` tag / 手动 | 构建多架构 Docker 镜像推 ghcr.io |
| `security-scan.yml` | push main / PR | 依赖安全扫描 |

- **PR 触发** Android Build 编译校验（不发布）；npm 依赖 PR 本应被 paths 过滤（建议加，见 §九）。
- 排查技巧：无 `gh` CLI 时可用 REST API 手动触发 workflow，`GET /actions/jobs/{id}/logs` 会 302 需跟随重定向。

---

## 五、APK 签名（不可变更的硬约束）

- 签名密钥：`android/app/debug.keystore`（**自 `0b1cc86` 起固定，严禁更换/重建**）。
- 证书 SHA-256 指纹：`5f717babca23523dd831228aa5f155cf6315bd6f5b5c7c049ec47d9786504f1d`
- 三处一致性校验（任一不一致即构建失败或运行时拒绝安装）：
  1. CI `android-build.yml` 的「签名指纹钉死」步骤
  2. App 内 `ApkVerifier.kt` 的 `EXPECTED_CERT_SHA256`
  3. keystore 实际指纹
- **换 keystore = 已装用户无法覆盖升级**，务必同步更新上面三处。

---

## 六、多账本（book_id）架构

- 中间件：`server/routes/books.js` 的 `resolveBookContext`（`routes.js` 中置于 `authMiddleware` **之后**）。
- 解析优先级：`X-Book-Id` 请求头 → 默认账本 → 自动创建默认账本。
- 所有用户级财务查询/写入按 `req.bookId` 隔离；`book_id IS NULL` 表示「用户级共享」或遗留数据。
- 启动自愈：`db.js` 的 `healBooks()` 为每用户建默认账本并回填 `NULL` 行。
- 分类三层可见性：系统预设（`user_id IS NULL`）+ 用户级共享（`book_id IS NULL`）+ 当前账本专属。

---

## 七、AI 与语音能力

### 7.1 双服务商架构（后端）

- **对话 + 函数调用**：走当前激活的对话服务商（`is_active=true`，仅一个）。默认推荐 **MiniMax**（`api_type=anthropic`，`base_url=https://api.minimaxi.com/anthropic/v1`，模型 MiniMax-M3），走 Anthropic Messages 兼容 + tools。
- **语音转写**：`getTranscriptionProvider()` 自动找 OpenAI 兼容服务商（**不受 is_active 限制**），跳过 MiniMax/Anthropic。推荐 **Groq**（`api_type=openai`，`base_url=https://api.groq.com/openai/v1`，模型 `whisper-large-v3`）。
- 转写模型自动选择：Groq→`whisper-large-v3`，OpenAI→`whisper-1`，服务商 model 含 whisper 则直接用。
- 注意：MiniMax **无独立 ASR 接口**（`/v1/audio/transcriptions` 404，官方仅 Assistants API 提供），必须另配 OpenAI 兼容服务商。
- Web 端在「AI 服务商配置」页有 8 个预设（MiniMax/DeepSeek/Groq/Kimi/智谱/OpenAI/Anthropic/Ollama），按地区+接口类型双重内置自动联动。

### 7.2 Android 语音识别（端上 SpeechRecognizer 双模式）

- 主路径：Android `SpeechRecognizer` 端上识别（免费、无需外部服务商、`onPartialResults` 实时上屏）。
- **回退**：华为等设备 `startListening()` 抛 `SecurityException`（`FakeRecognitionService` 禁止绑定）时，自动回退到 MediaRecorder 录音 + 后端 `/transcribe` 转写。
- **超时处理**（v0.0.7 修复）：端上 `stopListening()` 后部分设备不回调 `onResults`，但 partial 已实时上屏；超时 8s 后若输入框已有 partial 结果则**视为成功不报错**，仅完全无结果才报「语音识别超时」。

---

## 八、关键决策记录（不可违背）

1. **配色**：全 App 统一暖棕 `#995F2C`（色阶 `accent-50 #FCEFE5` ~ `accent-900 #2E1200`），不再用薄荷青；收入红 `#C11435`、支出绿 `#009558`。新 UI 沿用 `Brown*` 色板。
2. **统计页布局**：以用户截图为准，不自行发挥；类型 tab 锁月（无季/年）。
3. **精选图片/账单相册**：已砍掉（交易模型无 attachment），勿复活。
4. **版本号**：锁死 `0.0.x`，靠 auto-tag 自动 bump。
5. **keystore**：`debug.keystore` 严禁更换/重建。
6. **推送需批准**：本地改代码/提交照常，`push`、删 tag/Release、清 workflow 等远端写操作需负责人确认。
7. **安卓变更需 PR 编译验证**：避免坏代码合入 main（曾导致安卓编译失败）。
8. **本地预览页不进仓库**：临时 HTML 预览为未跟踪状态，提交时忽略。
9. **两段 lock 文件**：根与服务端各自维护，`npm ci` 失败优先查对应目录 lock 是否齐全。

---

## 九、已知坑与注意事项

1. **旧库升级**：旧库靠 schema 末尾「多账本迁移」块幂等 `ADD COLUMN IF NOT EXISTS book_id` 补列；若新增表/列，两个 schema 文件都要同步。
2. **OCR SDK 惰性加载**：`tencentcloud-sdk-nodejs-ocr` 顶层 require 会连带加载 node-fetch（本机 node-fetch 损坏会导致服务起不来），已改为 `getOcrClient()` 首次调用时才 require。
3. **命令行 gradle 编译**：会被 Android Studio daemon 持有 wrapper 锁（`拒绝访问`），需在 AS 内构建，或先停掉 AS。
4. **本地 git 跟踪引用**：`refs/remotes/origin/main` 曾卡旧值（packed-refs 927bf14），`git status` 显示 ahead 异常——仅本地显示问题，勿用 `git pull` 覆盖本地，用 AS 的 Fetch 刷新。
5. **GitHub 推送认证**：本机 GCM 无法在无 GUI 终端弹窗；SSH key 未绑 GitHub。推送需在 AS Terminal / Git Bash 手动执行，或用 PAT 一次性 URL。
6. **Dependabot**：首次启用曾一次性开 15 个依赖 PR（每个触发 3 套 CI ≈ 45 次运行）。建议关闭或调低 `open-pull-requests-limit`，并给 android-build 加 paths 过滤（npm 依赖更新无需跑安卓构建）。
7. **本机环境限制**：开发机无 Android SDK / PostgreSQL，安卓与 PG 验证靠 CI + 真机 adb。
8. **语音转写**：需 OpenAI 兼容服务商；MiniMax 单服务商时 `/transcribe` 会返回 400 提示。

---

## 十、环境与部署

- 后端环境变量：`DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME / DB_DIALECT / JWT_SECRET / ENCRYPTION_KEY / ALLOW_DEMO / APP_PORT`
- 本地启动：仓库外 `logs/start-dev.sh`（docker 起 postgres:16 → npm start，端口 18888）。
- 启动命令：`cd server && node -e "require('dotenv').config({path:'../.env'}); require('./index.js')"`（dotenv 默认只读 cwd/.env，须指定上级 .env 路径）。
- 生产：`Dockerfile` 构建镜像，`docker-compose.yml` 编排。
- 数据库：PostgreSQL（默认）或 MySQL/MariaDB（`DB_DIALECT=mysql`）。
- Android 服务器地址：默认 `https://xqb.kuaik.top:18888/api/`；AVD 模拟器填 `http://10.0.2.2:18888`，真机同 Wi-Fi 填电脑局域网 IP（如 `http://192.168.9.75:18888`）。

---

## 十一、交接清单（待办）

- [ ] 撤销本次使用的 GitHub PAT 令牌（Settings → Developer settings → Personal access tokens）
- [ ] 生产数据库执行 `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS book_id INT DEFAULT NULL;`（或重新部署镜像）
- [ ] 关闭/调低 Dependabot（当前仍有 15 个 dependabot 分支未处理）
- [ ] 真机验证 v0.0.7 APK 覆盖安装 + 自动更新
- [ ] Android Studio 构建验证最新两处改动（语音超时回退 partial、记账秒选择滚动钟盘）
- [ ] 本地 tag 引用停留在 v0.0.3，需 `git fetch --tags` 同步（远程已到 v0.0.7）

---

## 附：历史交接文档索引

- 网盘《XinWallet 项目交接与开发记录（v0.0.1）》：早期状态（暖棕对齐、统计页重做、CI 三处失败修复），关键决策已并入本文 §八。
- 网盘《XinWallet 优化记录与项目进度（v0.0.3）》：理财卡片堆叠、安卓 5 tab、APK 签名根因，内容已并入本文 §五/§八。
