# XinWallet 鸿蒙 NEXT 端（ArkTS/ArkUI）构建与复刻说明

> 目标：把安卓端 XinWallet 的功能模块与 UI **一比一复刻**到 HarmonyOS NEXT（API 12 Stage 模型），
> 复用现有 Node.js 后端（REST API 不变）。本工程**不依赖 GMS**，语音/定位改用鸿蒙原生能力，
> 从架构上根治华为无 GMS 机型的「语音识别超时 / 定位失败」问题。

## 一、工程结构

```
harmony/
├─ AppScope/app.json5              # 应用名/图标/bundleName（需改成你自己的）
├─ build-profile.json5            # 需 DevEco 自动签名后生成 signingConfigs
├─ oh-package.json5
├─ hvigorfile.ts
└─ entry/src/main/
   ├─ module.json5                # 权限：INTERNET/LOCATION/APPROXIMATELY_LOCATION/MICROPHONE/READ_MEDIA
   ├─ resources/base/
   │  ├─ element/{color,string}.json
   │  ├─ profile/main_pages.json  # 全部 22 个页面路由
   │  └─ media/                    # ⚠️ 需放入 icon.png（entry）与 app_icon.png（AppScope）
   └─ ets/
      ├─ entryability/EntryAbility.ts
      ├─ common/
      │  ├─ config.ts              # BASE_URL 归一化
      │  ├─ theme.ts               # 暖棕主题色（Brown500 #995F2C）+ 收入红/支出绿
      │  ├─ models.ts              # 数据契约（镜像后端 JSON）
      │  ├─ store/Session.ts       # preferences 持久化 token/bookId/baseUrl
      │  ├─ http/Http.ts           # Bearer + X-Book-Id 注入，401 自动 refresh
      │  ├─ api/Api.ts             # 映射安卓 ApiService 全部端点
      │  ├─ audio.ts               # 鸿蒙原生录音 → WAV(base64) → 后端 Whisper 转写
      │  └─ components/{Components,Charts}.ets  # 通用组件 + Canvas 环形/折线图
      └─ pages/                    # 22 个页面
```

## 二、页面清单（安卓 → 鸿蒙 对照，已全部复刻）

| 安卓页面 | 鸿蒙文件 | 说明 |
|---|---|---|
| LoginScreen | Login.ets | 服务器地址 + 账号/demo 登录；已登录自动进 Main |
| AppRoot/MainScaffold | Main.ets | 底部 4 Tab（首页/账单/统计/我的）+ 中间暖棕记账浮钮（AI记账→Chat / 手动记账→AddTransaction） |
| HomeScreen | Home.ets | 账本切换头 + 暖棕渐变月支出卡 + 今日账单 + 账单日历 + 编辑首页卡片 |
| TransactionsScreen | Transactions.ets | 流水/日历双视图 + 按日分组 + 点行编辑/删除 |
| AddTransactionScreen | AddTransaction.ets | 收/支分段 + 分类网格 + 账户/日期/地点 + 金额键盘；**定位用 geoLocationManager** |
| ReportsScreen | Reports.ets | 支出/收入/结余分段 + KPI + 趋势折线 + 环形图 + 分类排行 |
| ProfileScreen | Profile.ets | 头像 + 昵称 + 12 宫格 + 退出登录 |
| AccountsScreen | Accounts.ets | 总资产 + 按类型分组 + 新增/点击进详情 |
| AccountDetailScreen | AccountDetail.ets | 当前余额 + 交易记录 |
| ChatScreen | Chat.ets | AI 对话记账；**语音用鸿蒙 AudioCapturer + 后端 transcribe（Whisper）** |
| CategoryScreen | Category.ets | 按类型分组 + 系统预设锁 + 增改删 |
| TagsScreen | Tags.ets | 彩色圆 + 增改删 + 10 色调色板 |
| BudgetsScreen | Budgets.ets | 预算列表 + 进度条(超支变红) + 增改删 |
| SavingsGoalsScreen | SavingsGoals.ets | 目标列表 + 进度条 + 存入/取回/流水 |
| DebtsScreen | Debts.ets | 汇总 4 卡 + 应付/应收 + 还款/增改删 |
| InvestmentsScreen | Investments.ets | 理财总市值 + 按类型分组 |
| InvestmentDetailScreen | InvestmentDetail.ets | 当前市值 + 收益/收益率 + 持仓信息 |
| PlanningScreen | Planning.ets | TabRow 聚合 预算/储蓄/债务/理财 |
| SearchScreen | Search.ets | 防抖搜索 + 高级筛选(金额/日期/类型) |
| AiScanScreen | AiScan.ets | OCR 配置提示 + 选图识别 + 逐条确认 + 批量入账 |
| DataManagementScreen | DataManagement.ets | 导出 CSV / 导入 CSV / 导出 JSON |
| AppLockScreen | AppLock.ets | 启用开关 + 设置/修改 4 位 PIN（SHA256） |
| SettingsScreen | Settings.ets | 外观主题三态 + 服务器地址 + 关于 |

> 注：`Home.ets` 仅导出 `HomePage` 结构体供 Main 的 Tabs 内嵌，未单独注册路由（无需独立页）。

## 三、在 DevEco 中打开与构建

1. DevEco Studio 打开 `harmony/` 工程（API 12 / HarmonyOS NEXT）。
2. **图标**：在 `entry/src/main/resources/base/media/` 放 `icon.png`，在 `AppScope/resources/base/media/` 放 `app_icon.png`
   （DevEco 默认模板图标即可，缺图会导致编译/签名失败）。
3. **bundleName**：`AppScope/app.json5` 的 `com.xinwallet.app` 换成你在 AGConnect 下注册的包名。
4. **签名**：`build-profile.json5` 的 `signingConfigs` 用 DevEco「自动签名」生成（需登录华为开发者账号）。
5. 连接华为手机（或模拟器）运行 `entry` Module。

## 四、联调后端

- 登录页填写 `https://你的服务器IP:18888`（`normalizeBaseUrl` 会自动补 `/api`）。
- 模拟器请用 `10.0.2.2` 等宿主机地址；真机用局域网 IP。
- 后端即现有 Node.js 服务，无需任何改动。

## 五、GMS 问题根治对照（与原安卓 Bug 关联）

| 原安卓问题 | 鸿蒙端做法 |
|---|---|
| 语音：端上 `SpeechRecognizer` 走 Google 引擎，无 GMS 华为机卡死报「语音识别超时」 | `Chat.ets` + `common/audio.ts`：鸿蒙 `AudioCapturer` 录音 → 后端 `/ai/transcribe`（Whisper）转写，完全不碰 GMS |
| 定位：`NETWORK_PROVIDER` 走 Google 网络定位后端，无 GMS 时缓存陈旧返回 null | `AddTransaction.ets`：用 `@ohos.geoLocationManager.getCurrentLocation` 主动定位 |

## 六、需在真机/模拟器验证的项（本机无 DevEco，未能编译）

- 录音 → 转写链路（`common/audio.ts` 的 WAV 封装与 `Api.transcribe` 入参格式）。
- `geoLocationManager` 定位权限与返回。
- `DatePickerDialog` / `PhotoViewPicker` / `AlertDialog` / `Tabs` 等表现。
- 深色模式：主题模式已持久化到 AppStorage（`themeMode`），但各组件目前用固定暖棕色板，
  完整深色色板切换为后续增强项。
- 部分后端返回字段（report/debt/savings/investment）按安卓模型推断，做了防御性渲染；
  联调时若字段名不一致，以 `Api.ts` 返回的 `data` 实际结构为准微调。
