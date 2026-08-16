/**
 * 主框架（对齐安卓 AppNav.kt 的 MainScaffold）：底部 4 Tab（首页/账单/统计/我的）
 * + 中间暖棕圆形记账浮钮（弹 AI记账→Chat / 手动记账→AddTransaction）。
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
  @State selectedIndex: number = 0;
  @State showAddMenu: boolean = false;

  @Builder tabBuilder(label: string, icon: string, idx: number) {
    Column({ space: 4 }) {
      Text(icon).fontSize(22).fontColor(this.selectedIndex === idx ? COLORS.brand : COLORS.textSecondary)
      Text(label).fontSize(11).fontColor(this.selectedIndex === idx ? COLORS.brand : COLORS.textSecondary)
    }.width('100%').height(64).justifyContent(FlexAlign.Center)
  }

  @Builder AddQuick(label: string, icon: string, onClick: () => void) {
    Column({ space: 8 }) {
      Column() {
        Text(icon).fontSize(28).fontColor('#FFFFFF')
      }.width(60).height(60).backgroundColor(COLORS.brand).borderRadius(30)
        .shadow({ radius: 8, color: '#995F2C55' })
      Text(label).fontSize(13).fontColor('#FFFFFF')
    }.onClick(onClick)
  }

  build() {
    Stack() {
      Column() {
        Tabs({ barPosition: BarPosition.End }) {
          TabContent() { HomePage() }.tabBar(this.tabBuilder('首页', '🏠', 0))
          TabContent() { TransactionsPage() }.tabBar(this.tabBuilder('账单', '🧾', 1))
          TabContent() { ReportsPage() }.tabBar(this.tabBuilder('统计', '📊', 2))
          TabContent() { ProfilePage() }.tabBar(this.tabBuilder('我的', '👤', 3))
        }
        .barHeight(64).barBackgroundColor(COLORS.card)
        .onChange((idx: number) => this.selectedIndex = idx)
        .width('100%').layoutWeight(1)
      }.width('100%').height('100%')

      // 记账浮钮菜单
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

      // 中间 FAB
      Column() {
        Text('+').fontSize(30).fontColor('#FFFFFF').fontWeight(FontWeight.Bold)
      }
      .width(56).height(56).backgroundColor(COLORS.brand).borderRadius(28)
      .shadow({ radius: 8, color: '#995F2C55' })
      .position({ x: '50%', y: '90%' })
      .translate({ x: '-50%' })
      .onClick(() => this.showAddMenu = !this.showAddMenu)
      .zIndex(10)
    }.width('100%').height('100%').backgroundColor(COLORS.pageBg)
  }
}
