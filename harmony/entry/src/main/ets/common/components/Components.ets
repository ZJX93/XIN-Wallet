/**
 * 通用 UI 组件库（对齐安卓端 Material 组件）。
 * 所有组件以 @Component struct 形式导出，供各页面 import 后以 <Xxx .../> 使用。
 */
import router from '@ohos.router';
import { COLORS, fmtMoney } from '../theme';
import { TransactionItem, Account, Book } from '../models';
import { DonutPiece, SLICE_PALETTE } from './Charts';

/** 顶部栏：标题 + 可选返回键（对齐安卓 TopBar） */
@Component
export struct TopBar {
  title: string = '';
  showBack: boolean = true;
  onBack?: () => void;
  build() {
    Row() {
      if (this.showBack) {
        Text('‹')
          .fontSize(28).fontColor(COLORS.textPrimary).width(32).textAlign(TextAlign.Center)
          .onClick(() => this.onBack && this.onBack())
      }
      Text(this.title)
        .fontSize(18).fontWeight(FontWeight.Bold).fontColor(COLORS.textPrimary)
        .layoutWeight(1).margin({ left: this.showBack ? 4 : 0 })
    }
    .width('100%')
    .height(52)
    .padding({ left: 12, right: 16 })
    .backgroundColor(COLORS.card)
  }
}

/** 区块标题（对齐安卓 SectionTitle）：品牌色竖条 + 文字 */
@Component
export struct SectionTitle {
  text: string = '';
  build() {
    Row({ space: 8 }) {
      Column().width(3).height(16).backgroundColor(COLORS.brand).borderRadius(2)
      Text(this.text)
        .fontSize(15).fontWeight(FontWeight.Medium).fontColor(COLORS.textPrimary)
    }.margin({ left: 4, top: 6, bottom: 4 }).alignItems(VerticalAlign.Center)
  }
}

/** 金额卡（对齐安卓 BalanceCard）：primaryContainer 浅棕容器 + onPrimaryContainer 深棕文字 + 圆角20 + 可选点击 */
@Component
export struct BalanceCard {
  title: string = '';
  @Prop amount: number = 0;
  subtitle?: string = '';
  onTap?: () => void;
  build() {
    Column({ space: 6 }) {
      Text(this.title).fontSize(14).fontColor(COLORS.brand)
      Text(fmtMoney(this.amount)).fontSize(30).fontWeight(FontWeight.Bold).fontColor(COLORS.brand)
      if (this.subtitle) {
        Text(this.subtitle).fontSize(12).fontColor(COLORS.brand).opacity(0.7)
      }
    }
    .width('100%')
    .alignItems(HorizontalAlign.Start)
    .padding(20)
    .backgroundColor(COLORS.brandBg)
    .borderRadius(20)
    .onClick(() => this.onTap && this.onTap())
  }
}

/** 空状态（对齐 EmptyState） */
@Component
export struct EmptyState {
  icon: string = '🔍';
  text: string = '暂无数据';
  build() {
    Column({ space: 8 }) {
      Text(this.icon).fontSize(40)
      Text(this.text).fontSize(14).fontColor(COLORS.textSecondary)
    }
    .width('100%')
    .alignItems(HorizontalAlign.Center)
    .padding({ top: 60, bottom: 60 })
  }
}

/** 加载态 */
@Component
export struct LoadingBox {
  build() {
    Column() {
      LoadingProgress().width(32).height(32).color(COLORS.brand)
      Text('加载中...').fontSize(13).fontColor(COLORS.textSecondary).margin({ top: 8 })
    }
    .width('100%').alignItems(HorizontalAlign.Center).padding({ top: 60, bottom: 60 })
  }
}

/** 错误态（对齐安卓 ErrorState：重试 + 鉴权重登）。
 * 当 message 命中 401/登录/过期/失效 等关键字时，自动提示「重新登录」，
 * 点击跳登录页；若传入 onLogin 则优先回调它（如清 token 后跳转）。 */
@Component
export struct ErrorState {
  message: string = '加载失败';
  onRetry?: () => void;
  onLogin?: () => void;
  private needLogin(): boolean {
    return /401|未登录|登录|过期|失效|token|鉴权|授权/.test(this.message);
  }
  build() {
    Column({ space: 10 }) {
      Text('⚠️').fontSize(36)
      Text(this.message).fontSize(14).fontColor(COLORS.textSecondary)
      if (this.onRetry) {
        Button('重试').height(36).onClick(() => this.onRetry!())
      }
      if (this.needLogin()) {
        Button('重新登录').height(36).backgroundColor(COLORS.brand)
          .onClick(() => {
            if (this.onLogin) { this.onLogin(); }
            else { router.replaceUrl({ url: 'pages/Login' }); }
          })
      }
    }
    .width('100%').alignItems(HorizontalAlign.Center).padding({ top: 60, bottom: 60 })
  }
}

/** 线性进度条（对齐 LinearProgress），value 0~1。
 * 用「轨道 Column + 填充 Row(百分比宽度)」标准写法，避免 Stack 内百分比子节点 + layoutWeight 冲突导致的测量崩溃。 */
@Component
export struct LinearProgress {
  value: number = 0;
  color: string = COLORS.brand;
  barHeight: number = 6;
  showPercent: boolean = false;

  private ratio(): number {
    const v = Number(this.value);
    if (!v || isNaN(v)) return 0;
    return Math.max(0, Math.min(1, v));
  }

  build() {
    Row({ space: 6 }) {
      Column() {
        Row().width(`${this.ratio() * 100}%`).height('100%')
          .backgroundColor(this.color).borderRadius(this.barHeight / 2)
      }.width('100%').height(this.barHeight).backgroundColor(COLORS.divider)
        .borderRadius(this.barHeight / 2).layoutWeight(1).alignItems(HorizontalAlign.Start)
      if (this.showPercent) {
        Text(`${Math.round(this.ratio() * 100)}%`)
          .fontSize(11).fontColor(COLORS.textSecondary)
      }
    }.width('100%').alignItems(VerticalAlign.Center)
  }
}

/**
 * 分类条形排行（对齐安卓 CategoryBars）：emoji 图标 + 名称 + 金额·pct% 标签 + 进度条，
 * 按 SLICE_PALETTE 取色。用于统计页分类排行卡片，替代原内联简化版。
 */
@Component
export struct CategoryBars {
  items: DonutPiece[] = [];
  onItemClick?: (index: number) => void;
  private total(): number {
    return this.items.reduce((s, it) => s + (it.value || 0), 0) || 0.0001;
  }
  build() {
    Column() {
      if (this.items.length === 0) {
        EmptyState({ text: '暂无数据' })
      } else {
        ForEach(this.items, (it: DonutPiece, i: number) => {
          Row({ space: 10 }) {
            Text(it.icon || '📌').fontSize(18).width(30).textAlign(TextAlign.Center)
            Column() {
              Row() {
                Text(it.name).fontSize(14).fontColor(COLORS.textPrimary).fontWeight(FontWeight.Medium).layoutWeight(1)
                Text(`${fmtMoney(it.value)} · ${Math.round((it.value || 0) / this.total() * 100)}%`)
                  .fontSize(12).fontColor(COLORS.textSecondary)
              }.width('100%')
              LinearProgress({
                value: (it.value || 0) / this.total(),
                color: it.color || SLICE_PALETTE[i % SLICE_PALETTE.length],
                barHeight: 8
              }).margin({ top: 5 }).width('100%')
            }.layoutWeight(1).alignItems(HorizontalAlign.Start)
          }.width('100%').padding({ top: 7, bottom: 7 })
            .onClick(() => { if (this.onItemClick) this.onItemClick(i); })
        }, (it: DonutPiece) => it.name)
      }
    }.width('100%')
  }
}

/** 分类图标圆（对齐 CategoryIcon）：emoji + 可选底色 */
@Component
export struct CategoryIcon {
  icon: string = '📌';
  bg: string = COLORS.brandBgLight;
  iconSize: number = 40;
  build() {
    Text(this.icon)
      .fontSize(this.iconSize * 0.5)
      .width(this.iconSize).height(this.iconSize)
      .textAlign(TextAlign.Center)
      .backgroundColor(this.bg)
      .borderRadius(this.iconSize / 2)
  }
}

/** 交易行（对齐 TransactionRow / TransactionRowClickable） */
@Component
export struct TransactionRow {
  item?: TransactionItem;
  onItemClick?: () => void;
  build() {
    Row({ space: 12 }) {
      CategoryIcon({ icon: this.item?.category?.icon ?? '📌', iconSize: 40 })
      Column() {
        Text(this.item?.category?.name ?? '未分类').fontSize(15).fontColor(COLORS.textPrimary)
        if (this.item?.note) {
          Text(this.item.note)
            .fontSize(12).fontColor(COLORS.textSecondary)
            .maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis })
        }
      }.layoutWeight(1).alignItems(HorizontalAlign.Start)

      Column() {
        Text((this.item?.type === 'income' ? '+' : '-') + fmtMoney(this.item?.amount ?? 0).replace('¥', ''))
          .fontSize(15).fontWeight(FontWeight.Medium)
          .fontColor(this.item?.type === 'income' ? COLORS.income : COLORS.expense)
        if (this.item?.account?.name) {
          Text(this.item.account.name).fontSize(11).fontColor(COLORS.textSecondary)
        }
      }.alignItems(HorizontalAlign.End)
    }
    .width('100%')
    .padding({ top: 12, bottom: 12 })
    .backgroundColor(COLORS.card)
    .onClick(() => this.onItemClick && this.onItemClick())
  }
}

/** 标准行项（设置/列表通用，左图标 + 标题 + 右值/箭头） */
@Component
export struct RowItem {
  icon: string = '';
  iconBg: string = COLORS.brandBgLight;
  title: string = '';
  value: string = '';
  showArrow: boolean = true;
  onItemClick?: () => void;
  build() {
    Row({ space: 12 }) {
      if (this.icon) {
        CategoryIcon({ icon: this.icon, bg: this.iconBg, iconSize: 32 })
      }
      Text(this.title).fontSize(15).fontColor(COLORS.textPrimary).layoutWeight(1)
      if (this.value) {
        Text(this.value).fontSize(13).fontColor(COLORS.textSecondary)
      }
      if (this.showArrow) {
        Text('›').fontSize(20).fontColor(COLORS.placeholder)
      }
    }
    .width('100%')
    .padding({ top: 14, bottom: 14, left: 16, right: 16 })
    .backgroundColor(COLORS.card)
    .onClick(() => this.onItemClick && this.onItemClick())
  }
}

/**
 * 暖棕渐变头卡（对齐安卓 HeroGradientCard）。
 * 顶部一行主指标 + 大数字金额，下方左右对照副指标。用于首页月支出等醒目卡片。
 */
@Component
export struct HeroGradientCard {
  @Prop topLeft: string = '';
  @Prop amount: string = '';
  @Prop topRight: string = '';
  @Prop bottomLeft: string = '';
  @Prop bottomRight: string = '';
  onTap?: () => void;
  build() {
    Column({ space: 10 }) {
      Row() {
        Text(this.topLeft).fontSize(14).fontColor('#FFFFFF').opacity(0.92).layoutWeight(1)
        if (this.topRight) {
          Text(this.topRight).fontSize(13).fontColor('#FFFFFF').opacity(0.85)
        }
      }.width('100%')
      Text(this.amount).fontSize(34).fontWeight(FontWeight.Bold).fontColor('#FFFFFF')
      if (this.bottomLeft || this.bottomRight) {
        Row() {
          if (this.bottomLeft) {
            Column({ space: 2 }) {
              Text(this.bottomLeft).fontSize(11).fontColor('#FFFFFF').opacity(0.8)
            }.layoutWeight(1)
          }
          if (this.bottomRight) {
            Column({ space: 2 }) {
              Text(this.bottomRight).fontSize(11).fontColor('#FFFFFF').opacity(0.8)
            }.layoutWeight(1).alignItems(HorizontalAlign.End)
          }
        }.width('100%')
      }
    }
    .width('100%')
    .padding(20)
    .backgroundColor(COLORS.brand)
    .borderRadius(20)
    .linearGradient({
      angle: 135,
      colors: [[COLORS.brand, 0.0], [COLORS.brandLight, 1.0]]
    })
    .onClick(() => this.onTap && this.onTap())
  }
}

/** 账户类型中文标签（对齐安卓 accountTypeLabel） */
export function accountTypeLabel(type: string): string {
  switch (type) {
    case 'cash': return '现金';
    case 'bank_card': return '储蓄卡';
    case 'credit_card': return '信用卡';
    case 'electronic_payment': return '电子支付';
    case 'financial_account': return '理财账户';
    case 'digital': return '数字资产';
    default: return '其他';
  }
}

/** 下拉选项 */
export interface DropdownOption {
  name: string;
  id: number;
}

/**
 * 2x2 KPI 小卡（对齐安卓 StatKpiCard）：左侧圆形小图标 + 标题，下方大数字(品牌色)。
 * 通常四个一组排成 2x2 网格，用于统计页「金额/日均/笔数/预算」等展示。
 */
@Component
export struct StatKpiCard {
  title: string = '';
  @Prop amount: number = 0;
  icon: string = '💰';
  onTap?: () => void;
  build() {
    Column({ space: 8 }) {
      Row({ space: 8 }) {
        CategoryIcon({ icon: this.icon, bg: COLORS.brandBgLight, iconSize: 28 })
        Text(this.title).fontSize(13).fontColor(COLORS.textSecondary)
      }
      Text(fmtMoney(this.amount)).fontSize(20).fontWeight(FontWeight.Bold).fontColor(COLORS.brand)
    }
    .width('100%')
    .padding(14)
    .backgroundColor(COLORS.card)
    .borderRadius(16)
    .onClick(() => this.onTap && this.onTap())
  }
}

/** 账户行（对齐安卓 AccountListItem）：图标圆 + 名称/类型 + 余额(信用卡显示额度) */
@Component
export struct AccountListItem {
  account?: Account;
  onTap?: () => void;
  build() {
    Row({ space: 12 }) {
      CategoryIcon({ icon: this.account?.icon || '💵', iconSize: 44 })
      Column() {
        Text(this.account?.name ?? '').fontSize(15).fontColor(COLORS.textPrimary)
        Text(accountTypeLabel(this.account?.type ?? '')).fontSize(12).fontColor(COLORS.textSecondary)
      }.layoutWeight(1).alignItems(HorizontalAlign.Start)
      Column() {
        Text(fmtMoney(this.account?.balance ?? 0)).fontSize(15).fontWeight(FontWeight.Medium).fontColor(COLORS.textPrimary)
        if (this.account?.type === 'credit_card' && (this.account?.credit_limit ?? 0) > 0) {
          Text(`额度 ${fmtMoney(this.account?.credit_limit ?? 0)}`).fontSize(11).fontColor(COLORS.textSecondary)
        }
      }.alignItems(HorizontalAlign.End)
    }
    .width('100%')
    .padding({ top: 12, bottom: 12 })
    .backgroundColor(COLORS.card)
    .borderRadius(12)
    .onClick(() => this.onTap && this.onTap())
  }
}

/**
 * 下拉刷新容器（对齐安卓 PullRefreshBox）：用原生 Refresh 包裹可滚动内容，
 * 顶部居中显示刷新指示器。refreshing 由父组件通过 @Link 控制（加载完置 false）。
 */
@Component
export struct PullRefreshBox {
  @Link refreshing: boolean;
  onRefresh?: () => void;
  @BuilderParam content: () => void;
  build() {
    Refresh({ refreshing: this.refreshing, offset: 120, friction: 100 }) {
      this.content()
    }.onRefreshing(() => {
      this.refreshing = true;
      if (this.onRefresh) this.onRefresh();
    })
  }
}

/** 只读下拉选择框（对齐安卓 DropdownField）：选项 {name, id}，选中回调传 id */
@Component
export struct DropdownField {
  label: string = '';
  value: string = '';
  options: DropdownOption[] = [];
  emptyHint: string = '暂无选项';
  onSelected?: (id: number) => void;
  @State open: boolean = false;
  build() {
    Column({ space: 6 }) {
      Text(this.label).fontSize(13).fontColor(COLORS.textSecondary)
      Text(this.value || this.emptyHint)
        .fontSize(15).fontColor(this.value ? COLORS.textPrimary : COLORS.placeholder)
        .width('100%').padding(12).backgroundColor(COLORS.card)
        .borderRadius(10).border({ width: 1, color: COLORS.divider })
        .onClick(() => this.open = !this.open)
        .bindPopup(this.open, {
          builder: this.MenuBuilder,
          onStateChange: (e: ESObject) => { if (!e.isVisible) this.open = false; }
        })
    }.width('100%').alignItems(HorizontalAlign.Start)
  }
  @Builder MenuBuilder() {
    Column() {
      if (this.options.length === 0) {
        Text(this.emptyHint).fontSize(14).fontColor(COLORS.placeholder).padding(16)
      } else {
        ForEach(this.options, (o: DropdownOption) => {
          Text(o.name).fontSize(15).fontColor(COLORS.textPrimary).width('100%')
            .padding({ top: 14, bottom: 14, left: 16, right: 16 })
            .onClick(() => { this.open = false; if (this.onSelected) this.onSelected(o.id); })
        }, (o: DropdownOption) => o.id.toString())
      }
    }.width('100%').backgroundColor(COLORS.card).borderRadius(10)
  }
}

/** yyyy-MM-dd -> Date（解析失败返回今天） */
function parseYmd(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date();
}
/** 数字 -> yyyy-MM-dd */
function fmtYmd(y: number, mo: number, d: number): string {
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** 只读日期输入框（对齐安卓 DatePickerField）：点击弹出系统日期选择器，值 yyyy-MM-dd */
@Component
export struct DatePickerField {
  label: string = '';
  date: string = '';
  onDateChange?: (date: string) => void;
  build() {
    Column({ space: 6 }) {
      Text(this.label).fontSize(13).fontColor(COLORS.textSecondary)
      Text(this.date || '选择日期')
        .fontSize(15).fontColor(this.date ? COLORS.textPrimary : COLORS.placeholder)
        .width('100%').padding(12).backgroundColor(COLORS.card)
        .borderRadius(10).border({ width: 1, color: COLORS.divider })
        .onClick(() => this.pick())
    }.width('100%').alignItems(HorizontalAlign.Start)
  }
  pick(): void {
    const d = parseYmd(this.date);
    DatePickerDialog.show({
      start: new Date('2000-01-01'),
      end: new Date(),
      selected: d,
      onAccept: (v: ESObject) => {
        const s = fmtYmd(v.year as number, v.month as number, v.day as number);
        if (this.onDateChange) this.onDateChange(s);
      }
    });
  }
}

/** yyyy-MM-dd HH:mm:ss 解析为 [年,月1-12,日,时,分,秒] */
function parseDateTimeParts(value: string): number[] {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T]?(\d{2})?:?(\d{2})?:?(\d{2})?/.exec(value || '');
  if (m) {
    return [
      Number(m[1]),
      Number(m[2]),
      Number(m[3]),
      m[4] ? Number(m[4]) : 0,
      m[5] ? Number(m[5]) : 0,
      m[6] ? Number(m[6]) : 0
    ];
  }
  const n = new Date();
  return [n.getFullYear(), n.getMonth() + 1, n.getDate(), n.getHours(), n.getMinutes(), n.getSeconds()];
}
/** 拼 yyyy-MM-dd HH:mm:ss */
function fmtDateTime(y: number, mo: number, d: number, h: number, mi: number, s: number): string {
  const p = (x: number) => String(x).padStart(2, '0');
  return `${y}-${p(mo)}-${p(d)} ${p(h)}:${p(mi)}:${p(s)}`;
}

/**
 * 只读「日期 + 时间(到秒)」输入框（对齐安卓 DateTimePickerField）：值格式 yyyy-MM-dd HH:mm:ss。
 * 交互：点输入框先弹日期选择器，确定后再弹时间选择器（含秒），满足按秒记账。
 */
@Component
export struct DateTimePickerField {
  label: string = '';
  value: string = '';
  onValueChange?: (value: string) => void;
  @State private y: number = 0;
  @State private mo: number = 0;
  @State private d: number = 0;
  @State private h: number = 0;
  @State private mi: number = 0;
  private dialogController: CustomDialogController = new CustomDialogController({
    builder: SecPickerDialog({
      onConfirm: (sec: number): void => {
        const final = fmtDateTime(this.y, this.mo, this.d, this.h, this.mi, sec);
        if (this.onValueChange) this.onValueChange(final);
      }
    }),
    alignment: DialogAlignment.Center
  });
  build() {
    Column({ space: 6 }) {
      Text(this.label).fontSize(13).fontColor(COLORS.textSecondary)
      Text(this.value || '选择日期时间')
        .fontSize(15).fontColor(this.value ? COLORS.textPrimary : COLORS.placeholder)
        .width('100%').padding(12).backgroundColor(COLORS.card)
        .borderRadius(10).border({ width: 1, color: COLORS.divider })
        .onClick(() => this.pickDate())
    }.width('100%').alignItems(HorizontalAlign.Start)
  }
  pickDate(): void {
    const p = parseDateTimeParts(this.value);
    DatePickerDialog.show({
      start: new Date('2000-01-01'),
      end: new Date('2035-12-31'),
      selected: new Date(p[0], p[1] - 1, p[2]),
      onAccept: (v: ESObject) => {
        this.y = v.year as number;
        this.mo = v.month as number;
        this.d = v.day as number;
        TimePickerDialog.show({
          selected: new Date(2020, 0, 1, p[3], p[4], p[5]),
          useMilitaryTime: true,
          onAccept: (tv: ESObject) => {
            this.h = tv.hour as number;
            this.mi = tv.minute as number;
            this.dialogController.open();
          }
        });
      }
    });
  }
}

/** 秒选择弹层（对齐安卓 DateTimePickerField 的「秒」输入框）：0-59 */
@CustomDialog
struct SecPickerDialog {
  controller?: CustomDialogController;
  @State secText: string = '0';
  onConfirm?: (sec: number) => void;
  build() {
    Column({ space: 12 }) {
      Text('选择秒 (0-59)').fontSize(16).fontWeight(FontWeight.Bold).fontColor(COLORS.textPrimary)
      TextInput({ text: this.secText, placeholder: '0-59' })
        .type(InputType.Number).maxLength(2).width('60%')
        .onChange((t: string) => { this.secText = t; })
      Row({ space: 12 }) {
        Button('取消').onClick(() => this.controller?.close())
        Button('确定').onClick(() => {
          const sec = Math.min(59, Math.max(0, Number(this.secText) || 0));
          if (this.onConfirm) this.onConfirm(sec);
          this.controller?.close();
        })
      }
    }.backgroundColor(COLORS.card).borderRadius(16).padding(20)
  }
}

/** 顶部账本标题（对齐安卓 BookHeader）：居中账本名 + 切换箭头 + 右侧搜索 */
@Component
export struct BookHeader {
  bookName: string = '默认账本';
  onSwapBook?: () => void;
  onSearch?: () => void;
  build() {
    Row() {
      Row({ space: 6 }) {
        Text(this.bookName).fontSize(18).fontWeight(FontWeight.Bold).fontColor(COLORS.textPrimary)
        Text('⇄').fontSize(16).fontColor(COLORS.brand)
      }.onClick(() => this.onSwapBook && this.onSwapBook())
      Blank()
      if (this.onSearch) {
        Text('🔍').fontSize(22).onClick(() => this.onSearch!())
      }
    }.width('100%').padding({ left: 16, right: 16, top: 12, bottom: 8 })
  }
}

/**
 * 账本切换底部弹窗（对齐安卓 BookSwitcherSheet）：列出全部账本(当前项打勾) + 新建账本。
 * 由调用方用 show 状态控制显隐，点击遮罩/取消关闭；选择/新建通过回调上抛。
 */
@Component
export struct BookSwitcherSheet {
  show: boolean = false;
  books: Book[] = [];
  currentId: number = 0;
  onDismiss?: () => void;
  onSelect?: (id: number) => void;
  onCreate?: (name: string) => void;
  @State newName: string = '';
  build() {
    if (this.show) {
      Stack() {
        Column().layoutWeight(1).backgroundColor('#00000066').onClick(() => this.onDismiss && this.onDismiss())
        Column() {
          Column({ space: 8 }) {
            Text('切换账本').fontSize(16).fontWeight(FontWeight.Bold)
            List() {
              ForEach(this.books, (b: Book) => {
                ListItem() {
                  Row({ space: 10 }) {
                    Text(b.icon || '📒').fontSize(20)
                    Text(b.name).fontSize(15).layoutWeight(1).fontColor(COLORS.textPrimary)
                    if (b.id === this.currentId) { Text('✓').fontColor(COLORS.brand) }
                  }.padding({ top: 12, bottom: 12 })
                }.onClick(() => { if (this.onSelect) this.onSelect(b.id); })
              }, (b: Book) => b.id.toString())
            }.layoutWeight(1).height('45%')
            Text('新建账本').fontSize(13).fontColor(COLORS.textSecondary)
            TextInput({ placeholder: '如：旅行账本', text: this.newName }).onChange((v: string) => this.newName = v)
            Row({ space: 12 }) {
              Button('取消').layoutWeight(1).backgroundColor(COLORS.divider).onClick(() => this.onDismiss && this.onDismiss())
              Button('创建').layoutWeight(1).backgroundColor(COLORS.brand)
                .enabled(this.newName.trim().length > 0)
                .onClick(() => {
                  if (this.onCreate) this.onCreate(this.newName.trim());
                  this.newName = '';
                })
            }
          }.width('100%').padding(20)
        }.width('100%').backgroundColor(COLORS.card)
          .borderRadius({ topLeft: 16, topRight: 16 })
          .constraintSize({ maxHeight: '70%' })
      }.width('100%').height('100%').position({ x: 0, y: 0 }).zIndex(20)
    } else {
      Column() {}
    }
  }
}

/**
 * 统一图标圆底容器（阶段2 视觉统一规范）：给 emoji/字符图标套统一圆底(默认浅棕 brandBgLight)与尺寸，
 * 替代各页裸 emoji，作为全局图标语言。bg 可传品牌色/浅棕/分组底，iconSize 控制字号。
 */
@Component
export struct IconCircle {
  icon: string = '';
  boxSize: number = 44;
  bg: string = COLORS.brandBgLight;
  iconSize: number = 22;
  onTap?: () => void;
  build() {
    Column() {
      Text(this.icon)
        .fontSize(this.iconSize)
        .textAlign(TextAlign.Center)
    }
    .width(this.boxSize)
    .height(this.boxSize)
    .backgroundColor(this.bg)
    .borderRadius(this.boxSize / 2)
    .justifyContent(FlexAlign.Center)
    .onClick(() => { if (this.onTap) this.onTap(); })
  }
}

/**
 * 悬浮操作按钮（对齐安卓 ExtendedFloatingActionButton）。
 * 默认圆形 + 号（icon 模式）；传 text 则显示「图标+文字」扩展样式（药丸形）。
 * 固定悬浮在右下角 (88%,88%)，带品牌色阴影。用于列表页新增入口。
 */
@Component
export struct FloatingButton {
  icon: string = '+';
  text?: string;
  onTap?: () => void;
  posX: string | number = '88%';
  posY: string | number = '88%';
  build() {
    if (this.text) {
      Row({ space: 6 }) {
        Text(this.icon).fontSize(20).fontColor('#FFFFFF').fontWeight(FontWeight.Bold)
        Text(this.text).fontSize(14).fontColor('#FFFFFF').fontWeight(FontWeight.Medium)
      }.height(44).padding({ left: 16, right: 16 })
        .backgroundColor(COLORS.brand).borderRadius(22)
        .shadow({ radius: 8, color: '#995F2C55' })
        .position({ x: this.posX, y: this.posY })
        .onClick(() => { if (this.onTap) this.onTap(); })
    } else {
      Column() {
        Text(this.icon).fontSize(28).fontColor('#FFFFFF').fontWeight(FontWeight.Bold)
      }.width(52).height(52).backgroundColor(COLORS.brand).borderRadius(26)
        .shadow({ radius: 6, color: '#995F2C55' })
        .position({ x: this.posX, y: this.posY })
        .onClick(() => { if (this.onTap) this.onTap(); })
    }
  }
}
