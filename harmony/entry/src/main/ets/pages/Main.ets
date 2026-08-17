/**
 * 主框架（对齐安卓 AppNav.kt 的 MainScaffold）：底部 5 槽导航栏
 * 首页 / 账单 / 【●记账】 / 统计 / 我的，FAB 嵌栏内垂直居中（SpaceEvenly 等距）；
 * 记账浮钮弹 AI记账→Chat / 手动记账→AddTransaction。
 */
import router from '@ohos.router';
import { COLORS } from '../common/theme';
import { HomePage } from './Home';
import { TransactionsPage } from './Transactions';
import { ReportsPage } from './Reports';
import { ProfilePage } from './Profile';

@Entry
@Component
struct Main {
  @StorageProp('themeMode') themeMode: string = 'system';
  @State selectedIndex: number = 0;
  @State showAddMenu: boolean = false;

  @Builder AddQuick(label: string, icon: string, onClick: () => void) {
    Column({ space: 8 }) {
      Column() {
        Text(icon).fontSize(28).fontColor('#FFFFFF')
      }.width(60).height(60).backgroundColor(COLORS.brand).borderRadius(30)
        .shadow({ radius: 8, color: '#995F2C55' })
      Text(label).fontSize(13).fontColor('#FFFFFF')
    }.onClick(onClick)
  }

  /** 底部 5 槽导航栏：首页 / 账单 / 【●记账】 / 统计 / 我的（对齐安卓 SpaceEvenly 均分） */
  @Builder BottomNav() {
    Row() {
      // 首页（对齐安卓 Icons.Outlined.Home）
      Column({ space: 4 }) {
        SymbolGlyph($r('sys.symbol.house')).fontSize(24)
          .fontColor([this.selectedIndex === 0 ? COLORS.brand : COLORS.textSecondary])
        Text('首页').fontSize(11).fontColor(this.selectedIndex === 0 ? COLORS.brand : COLORS.textSecondary)
      }.height(64).justifyContent(FlexAlign.Center)
        .onClick(() => { this.selectedIndex = 0; })
      // 账单（对齐安卓 Icons.Outlined.ReceiptLong，自绘矢量 receipt，fillColor 着色）
      Column({ space: 4 }) {
        Image($r('app.media.ic_receipt')).width(24).height(24)
          .fillColor(this.selectedIndex === 1 ? COLORS.brand : COLORS.textSecondary)
        Text('账单').fontSize(11).fontColor(this.selectedIndex === 1 ? COLORS.brand : COLORS.textSecondary)
      }.height(64).justifyContent(FlexAlign.Center)
        .onClick(() => { this.selectedIndex = 1; })
      // 中间「记账」暖棕圆形按钮，作为 Row 第 3 个成员参与等距分布（嵌栏内、垂直居中）
      // 加号对齐安卓 Icons.Filled.Add 矢量实心加号（系统符号为 sys.symbol.plus）
      Column() {
        SymbolGlyph($r('sys.symbol.plus')).fontSize(30).fontColor(['#FFFFFF'])
      }.width(46).height(46).backgroundColor(COLORS.brand).borderRadius(23)
        .shadow({ radius: 6, color: '#995F2C55' })
        .onClick(() => { this.showAddMenu = !this.showAddMenu; })
      // 统计（对齐安卓 Icons.Outlined.PieChart，自绘矢量 pie，fillColor 着色）
      Column({ space: 4 }) {
        Image($r('app.media.ic_pie')).width(24).height(24)
          .fillColor(this.selectedIndex === 2 ? COLORS.brand : COLORS.textSecondary)
        Text('统计').fontSize(11).fontColor(this.selectedIndex === 2 ? COLORS.brand : COLORS.textSecondary)
      }.height(64).justifyContent(FlexAlign.Center)
        .onClick(() => { this.selectedIndex = 2; })
      // 我的（对齐安卓 Icons.Outlined.Person）
      Column({ space: 4 }) {
        SymbolGlyph($r('sys.symbol.person')).fontSize(24)
          .fontColor([this.selectedIndex === 3 ? COLORS.brand : COLORS.textSecondary])
        Text('我的').fontSize(11).fontColor(this.selectedIndex === 3 ? COLORS.brand : COLORS.textSecondary)
      }.height(64).justifyContent(FlexAlign.Center)
        .onClick(() => { this.selectedIndex = 3; })
    }
    .width('100%').height(64)
    .backgroundColor(COLORS.card)
    .justifyContent(FlexAlign.SpaceEvenly)
    .alignItems(VerticalAlign.Center)
    .shadow({ radius: 4, color: '#00000012' })
  }

  build() {
    Stack() {
      Column() {
        // 内容区：按选中索引切换页面（对齐安卓 routeKey 归并逻辑，点击切换无滑动）
        Stack() {
          if (this.selectedIndex === 0) {
            HomePage()
          } else if (this.selectedIndex === 1) {
            TransactionsPage()
          } else if (this.selectedIndex === 2) {
            ReportsPage()
          } else {
            ProfilePage()
          }
        }.layoutWeight(1).width('100%')

        this.BottomNav()
      }.width('100%').height('100%')

      // 记账浮钮菜单（覆盖层，浮在 tab 栏上方）
      if (this.showAddMenu) {
        Column() {
          Column().layoutWeight(1).backgroundColor('#00000073')
            .onClick(() => this.showAddMenu = false)
          Row({ space: 36 }) {
            this.AddQuick('AI 记账', '✨', () => {
              this.showAddMenu = false;
              router.pushUrl({ url: 'pages/Chat' });
            })
            this.AddQuick('手动记账', '✏️', () => {
              this.showAddMenu = false;
              router.pushUrl({ url: 'pages/AddTransaction' });
            })
          }.width('100%').position({ x: 0, y: '82%' }).justifyContent(FlexAlign.Center)
        }.width('100%').height('100%')
      }
    }.width('100%').height('100%').backgroundColor(COLORS.pageBg)
  }
}
