/**
 * 设置（对齐安卓 SettingsScreen.kt）：外观主题三态 + 服务器地址 + 关于/检查更新。
 */
import router from '@ohos.router';
import { Session } from '../common/store/Session';
import { normalizeBaseUrl } from '../common/config';
import { COLORS } from '../common/theme';
import { TopBar, RowItem, LoadingBox } from '../common/components/Components';

const THEME_LABEL: Record<string, string> = { light: '浅色', dark: '深色', system: '跟随系统' };

@Entry
@Component
struct Settings {
  @State themeMode: string = 'system';
  @State serverDisplay: string = '';
  @State showServer: boolean = false;
  @State newServer: string = '';
  @State version: string = '1.0.0';

  aboutToAppear(): void {
    this.themeMode = (AppStorage.Get('themeMode') as string) || 'system';
    Session.getBaseUrl().then(u => { this.serverDisplay = (u || '').replace('/api/', ''); });
  }

  cycleTheme(): void {
    const order = ['light', 'dark', 'system'];
    const i = order.indexOf(this.themeMode);
    this.themeMode = order[(i + 1) % 3];
    AppStorage.Set('themeMode', this.themeMode);
  }

  async saveServer(): Promise<void> {
    if (!this.newServer) return;
    await Session.setBaseUrl(normalizeBaseUrl(this.newServer));
    this.serverDisplay = this.newServer.replace(/\/api\/?$/, '');
    this.showServer = false;
  }

  @Builder ServerSheet() {
    Column({ space: 12 }) {
      Text('服务器地址').fontSize(16).fontWeight(FontWeight.Bold)
      TextInput({ placeholder: 'https://host:18888', text: this.newServer }).onChange((v: string) => this.newServer = v)
      Button('保存').width('100%').onClick(() => this.saveServer())
      Button('取消').width('100%').backgroundColor(COLORS.divider).onClick(() => this.showServer = false)
    }
  }

  build() {
    Column() {
      TopBar({ title: '设置' })
      Scroll() {
        Column({ space: 8 }) {
          RowItem({ icon: '🎨', title: '外观主题', value: THEME_LABEL[this.themeMode] || '跟随系统', onClick: () => this.cycleTheme() })
          RowItem({ icon: '🌐', title: '服务器地址', value: this.serverDisplay || '未设置', onClick: () => { this.newServer = this.serverDisplay; this.showServer = true; } })
          RowItem({ icon: 'ℹ️', title: '关于我们', value: 'v' + this.version, onClick: () => {/* 双击检查更新：简化为展示版本 */ } })
          Blank().height(20)
        }.padding(12)
      }.layoutWeight(1)
    }.width('100%').height('100%').backgroundColor(COLORS.pageBg)

    if (this.showServer) {
      Column() {
        Column().layoutWeight(1).backgroundColor('#00000066').onClick(() => this.showServer = false)
        Column() { this.ServerSheet() }.width('100%').backgroundColor(COLORS.card)
          .borderRadius({ topLeft: 16, topRight: 16 }).padding(20).constraintSize({ maxHeight: '60%' })
      }.width('100%').height('100%').position({ x: 0, y: 0 }).zIndex(20)
    }
  }
}
