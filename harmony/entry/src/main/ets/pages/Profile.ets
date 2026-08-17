/**
 * 我的（对齐安卓 ProfileScreen.kt）：头像 + 昵称 + 已记账天数 + 编辑资料 + 12 宫格 + 退出登录。
 */
import router from '@ohos.router';
import * as Api from '../common/api/Api';
import { Session } from '../common/store/Session';
import { COLORS } from '../common/theme';
import { User } from '../common/models';
import { TopBar, IconCircle } from '../common/components/Components';

interface Iface1 {
  iconRes: string;  // app.media.xxx SVG 资源名
  label: string;
  url: string;
}

const GRID: Iface1[] = [
  { iconRes: 'ic_camera', label: '截图记账', url: 'pages/AiScan' },
  { iconRes: 'ic_tag', label: '分类管理', url: 'pages/Category' },
  { iconRes: 'ic_tags', label: '标签管理', url: 'pages/Tags' },
  { iconRes: 'ic_wallet', label: '资产账户', url: 'pages/Accounts' },
  { iconRes: 'ic_trending', label: '投资理财', url: 'pages/Investments' },
  { iconRes: 'ic_target', label: '储蓄目标', url: 'pages/SavingsGoals' },
  { iconRes: 'ic_budget', label: '预算管理', url: 'pages/Budgets' },
  { iconRes: 'ic_handshake', label: '债务管理', url: 'pages/Debts' },
  { iconRes: 'ic_save', label: '数据管理', url: 'pages/DataManagement' },
  { iconRes: 'ic_lock', label: '应用锁', url: 'pages/AppLock' },
  { iconRes: 'ic_settings', label: '设置', url: 'pages/Settings' },
  { iconRes: 'ic_add', label: '记一笔', url: 'pages/AddTransaction' }
];
const AVATARS: string[] = ['🦊', '🐱', '🐶', '🐼', '🦁', '🐯', '🐸', '🐵', '🐧', '🦉', '🐢', '🐙'];

@Component
export struct ProfilePage {
  @StorageProp('themeMode') themeMode: string = 'system';
  @State nickname: string = '我';
  @State avatar: string = '🦊';
  @State days: number = 0;
  @State newName: string = '';
  @State newAvatar: string = '🦊';

  aboutToAppear(): void { this.load(); }

  async load(): Promise<void> {
    try {
      const r = await Api.profile();
      if (r.success && r.data?.user) {
        const u: User = r.data.user;
        this.nickname = u.nickname || u.username || '我';
        this.avatar = u.avatar || '🦊';
      }
    } catch (e) { /* ignore */ }
  }

  async saveProfile(): Promise<void> {
    try {
      await Api.updateProfile({ nickname: this.newName, avatar: this.newAvatar });
      this.nickname = this.newName;
      this.avatar = this.newAvatar;
    } catch (e) { /* ignore */ }
  }

  openEdit(): void {
    this.newName = this.nickname;
    this.newAvatar = this.avatar;
    AlertDialog.show({
      title: '编辑资料',
      message: '',
      primaryButton: { value: '保存', action: () => { this.saveProfile(); } },
      secondaryButton: { value: '取消', action: () => {} }
    });
  }

  build() {
    Column() {
      // 头部
      Row({ space: 14 }) {
        Text(this.avatar).fontSize(40)
          .width(64).height(64).textAlign(TextAlign.Center)
          .backgroundColor(COLORS.brandBgLight).borderRadius(32)
        Column({ space: 4 }) {
          Row({ space: 6 }) {
            Text(this.nickname).fontSize(20).fontWeight(FontWeight.Bold).fontColor(COLORS.textPrimary)
            Text('✎').fontSize(14).fontColor(COLORS.textSecondary)
              .onClick(() => this.openEdit())
          }
          Text(`已经记账 ${this.days} 天`).fontSize(13).fontColor(COLORS.textSecondary)
        }.layoutWeight(1).alignItems(HorizontalAlign.Start)
      }.width('100%').padding(16)

      // 12 宫格（矢量图标，fillColor 着色）。Grid 占满剩余空间并自身支持滚动
      Grid() {
        ForEach(GRID, (g: Iface1) => {
          GridItem() {
            Column({ space: 8 }) {
              Column() {
                Image($r(`app.media.${g.iconRes}`)).width(26).height(26).fillColor(COLORS.brand)
              }.width(52).height(52).backgroundColor(COLORS.brandBgLight).borderRadius(26)
                .justifyContent(FlexAlign.Center)
              Text(g.label).fontSize(12).fontColor(COLORS.textPrimary)
            }.width('100%').padding({ top: 16, bottom: 16 })
              .backgroundColor(COLORS.card).borderRadius(14)
              .onClick(() => router.pushUrl({ url: g.url }))
          }
        }, (g: Iface1) => g.label)
      }.columnsTemplate('1fr 1fr 1fr 1fr').rowsGap(10).columnsGap(10)
        .padding(12).layoutWeight(1)

      Button('退出登录')
        .width('80%').alignSelf(ItemAlign.Center)
        .backgroundColor(COLORS.danger)
        .onClick(async () => {
          await Session.clear();
          router.replaceUrl({ url: 'pages/Login' });
        })
      Blank().height(20)
    }.width('100%').height('100%').backgroundColor(COLORS.pageBg)
  }
}

@Entry
@Component
struct Profile {
  build() {
    Column() {
      TopBar({ title: '我的', showBack: false })
      ProfilePage()
    }.width('100%').height('100%')
  }
}
