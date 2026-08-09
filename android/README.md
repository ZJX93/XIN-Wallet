# 鑫钱包 · Android 客户端 (XIN-Wallet App)

基于现有 Web 全栈项目 **XIN-Wallet** 的官方安卓客户端，直连 NAS 上运行的 XIN-Wallet 后端 REST API，与 Web 端共享同一份数据。

## 技术栈

- **Kotlin** + **Jetpack Compose** (Material 3)
- **MVVM** 架构：`ViewModel` + `Repository` + `StateFlow`
- **Retrofit** + **OkHttp** + **Gson**（含 `AuthInterceptor` 自动注入 JWT 并在 401 时静默刷新重试）
- **DataStore** 持久化 token / 服务器地址 / 主题偏好
- 图表使用 **Compose Canvas 自绘**（趋势折线、环形进度），零额外依赖
- 手动轻量依赖容器 `AppContainer`（不引入 Hilt），支持运行时切换 NAS 基地址
- 最低支持 **Android 7.0 (API 24)**，目标 / 编译 SDK **34**

## 环境要求

- Android Studio Hedgehog (2023.1.1) 或更高
- JDK 17
- Android SDK Platform 34 + Build-Tools 34.0.0
- Gradle 8.9（项目已内置 wrapper）
- 一台运行 XIN-Wallet 后端的 NAS / 服务器（首次启动需在 App 内填写真实地址）

## 配置与运行

1. 用 Android Studio 打开 `android/` 目录。
2. 连接设备或启动模拟器（API ≥ 24）。
3. 直接运行 `app` module。
4. 首次进入登录页后，在顶部「服务器地址」填写你 NAS 上 XIN-Wallet 后端的访问地址，例如：
   `https://your-nas.com:18888` 或 `http://192.168.1.50:18888`
   （端口与 Web 端一致；App 会自动补全 `/api/` 路径后缀）
5. 使用 Web 端同名账号登录，或点击「体验 Demo」快速进入。

> 服务器地址、主题模式均存入本地 DataStore，重启后保留；修改服务器地址会即时重建 Retrofit，无需重启 App。

## 功能闭环（MVP）

| 模块 | 说明 |
| --- | --- |
| 登录 | 用户名/密码登录、Demo 登录、自动 JWT 续期 |
| 首页 | 总资产（账户余额 + 理财市值）、本月收支、6 月趋势折线图、预算执行进度、最近交易 |
| 账户 | 按类型分组（现金/银行卡/信用卡/电子支付/理财/数字资产）、总资产汇总、点击查看账户流水 |
| 记账 | 支出 / 收入 / 转账三种模式，金额、账户、分类、日期、备注；转账走独立双账户接口 |
| 理财 | 持仓列表（按类型分组）、组合总市值/总成本/总收益、点击查看持仓明细 |
| 我的 | 主题切换（跟随系统/浅色/深色）、服务器地址配置、退出登录 |

## 目录结构

```
app/src/main/java/com/xinwallet/app/
├── MainActivity.kt              # 入口 Activity，承载 AppRoot
├── XWalletApplication.kt        # Application，初始化 AppContainer
├── di/AppContainer.kt          # 手动依赖容器（网络/仓库/数据层）
├── data/
│   ├── model/Models.kt         # 全部 Gson 数据模型
│   ├── remote/                 # ApiService / AuthInterceptor / ApiResult
│   ├── local/SessionManager.kt # DataStore 持久化
│   └── repository/             # 各业务 Repository
├── ui/
│   ├── AppRoot.kt              # 登录态 + 主题总控
│   ├── theme/                  # 配色（暖棕/深暖炭灰）、字体、Theme
│   ├── components/             # TopBar / 卡片 / 列表项 / 图表 / 状态
│   ├── navigation/AppNav.kt    # 路由 + 底部导航 + FAB
│   ├── viewmodel/              # 各屏 ViewModel
│   └── screens/                # 8 个页面
└── util/MoneyUtils.kt          # 金额 / 日期格式化
```

## API 契约对照

客户端严格对接 XIN-Wallet 后端（端口 18888，`/api` 前缀）：

| 能力 | 端点 |
| --- | --- |
| 登录 | `POST /auth/login` |
| 刷新令牌 | `POST /auth/refresh` |
| Demo 登录 | `POST /auth/demo` |
| 账户列表 | `GET /accounts` |
| 交易列表（嵌套结构） | `GET /transactions?account_id=&month=&type=` |
| 新建交易 | `POST /transactions` |
| 转账 | `POST /transfers`（含 `from_account_id` / `to_account_id`） |
| 分类 | `GET /categories` |
| 理财类型 | `GET /investment-types` |
| 理财持仓 | `GET /investments` |
| 仪表盘 | `GET /stats/dashboard` |

**注意**：交易列表返回为嵌套 JSON（`category{name,icon}`、`account`、`counterparty{dir,name,icon}` 等），非扁平字段，模型已按此映射；转账为独立双账户接口，不与普通交易混用。

## 主题

沿用 Web 端的「协调、不刺眼」思路：

- **亮色**：暖白米底 (`#FBF7F1`) + 暖棕强调 (`#8B6B4A`)
- **暗色**：深暖炭灰分层 (`#1B1815` / `#242019` / `#2E2A22`)，**不采用硬黑**
- 语义色：收入红 (`#C0392B`) / 支出绿 (`#2E9E5B`)，与 Web 端一致

支持 system / light / dark 三档，可在「我的」中切换。
