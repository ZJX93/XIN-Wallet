/**
 * 我的（对齐安卓 ProfileScreen.kt）：头像 + 昵称 + 已记账天数 + 编辑资料 + 12 宫格 + 退出登录。
 */
import router from '@ohos.router';
import * as Api from '../common/api/Api';
import { Session } from '../common/store/Session';
import { COLORS } from '../common/theme';
import { User } from '../common/models';

const GRID: { icon: string; label: string; url: string }[] = [
  { icon: '📷', label: '截图记账', url: 'pages/AiScan' },
  { icon: '🏷️', label: '分类管理', url: 'pages/Category' },
  { icon: '🏷', label: '标签管理', url: 'pages/Tags' },
  { icon: '💰', label: '资产账户', url: 'pages/Accounts' },
  { icon: '📈', label: '投资理财', url: 'pages/Investments' },
  { icon: '🎯', label: '储蓄目标', url: 'pages/SavingsGoals' },
  { icon: '🧾', label: '预算管理', url: 'pages/Budgets' },
  { icon: '🤝', label: '债务管理', url: 'pages/Debts' },
  { icon: '💾', label: '数据管理', url: 'pages/DataManagement' },
  { icon: '🔒', label: '应用锁', url: 'pages/AppLock' },
  { icon: '⚙️', label: '设置', url: 'pages/Settings' },
  { icon: '➕', label: '记一笔', url: 'pages/AddTransaction' }
];
const AVATARS: string[] = ['🦊', '🐱', '🐶', '🐼', '🦁', '🐯', '🐸', '🐵', '🐧', '🦉', '🐢', '🐙'];

@Component
export struct ProfilePage {
  @State nickname: string = '我';
  @State avatar: string = '🦊';
  @State days: number = 0;
  @State showEdit: boolean = false;
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
      this.showEdit = false;
    } catch (e) { /* ignore */ }
  }

  build() {
    Column() {
      Scroll() {
        Column({ space: 16 }) {
          // 头部
          Row({ space: 14 }) {
            Text(this.avatar).fontSize(40)
              .width(64).height(64).textAlign(TextAlign.Center)
              .backgroundColor(COLORS.brandBgLight).borderRadius(32)
            Column({ space: 4 }) {
              Row({ space: 6 }) {
                Text(this.nickname).fontSize(20).fontWeight(FontWeight.Bold).fontColor(COLORS.textPrimary)
                Text('✎').fontSize(14).fontColor(COLORS.textSecondary)
                  .onClick(() => { this.newName = this.nickname; this.newAvatar = this.avatar; this.showEdit = true; })
              }
              Text(`已经记账 ${this.days} 天`).fontSize(13).fontColor(COLORS.textSecondary)
            }.layoutWeight(1).alignItems(HorizontalAlign.Start)
          }.width('100%').padding(16)

          // 12 宫格
          Grid() {
            ForEach(GRID, (g: any) => {
              GridItem() {
                Column({ space: 6 }) {
                  Text(g.icon).fontSize(26)
                  Text(g.label).fontSize(12).fontColor(COLORS.textPrimary)
                }.width('100%').padding({ top: 14, bottom: 14 })
                  .backgroundColor(COLORS.card).borderRadius(12)
                  .onClick(() => router.pushUrl({ url: g.url }))
              }
            }, (g: any) => g.label)
          }.columnsTemplate('1fr 1fr 1fr 1fr').rowsGap(10).columnsGap(10)
            .padding(12)

          Button('退出登录')
            .width('80%').alignSelf(HorizontalAlign.Center)
            .backgroundColor(COLORS.danger)
            .onClick(async () => {
              await Session.clear();
              router.replaceUrl({ url: 'pages/Login' });
            })
          Blank().height(20)
        }.padding(12)
      }.layoutWeight(1)
    }.width('100%').height('100%').backgroundColor(COLORS.pageBg)

    if (this.showEdit) {
      AlertDialog({
        title: '编辑资料',
        message: '',
        confirmButton: { value: '保存', action: () => this.saveProfile() },
        cancelButton: { value: '取消', action: () => this.showEdit = false }
      })
    }
  }
}

@Entry
@Component
struct Profile {
  @State page: ProfilePage = new ProfilePage();
  build() {
    Column() {
      TopBar({ title: '我的', showBack: false })
      this.page
    }.width('100%').height('100%')
  }
}
