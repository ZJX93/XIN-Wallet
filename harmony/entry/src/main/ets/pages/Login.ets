import router from '@ohos.router';
import { Session } from '../common/store/Session';
import { setBaseUrl } from '../common/http/Http';
import { normalizeBaseUrl } from '../common/config';
import * as Api from '../common/api/Api';
import { ApiError } from '../common/http/Http';

@Entry
@Component
struct Login {
  @State server: string = '';
  @State username: string = '';
  @State password: string = '';
  @State loading: boolean = false;
  @State error: string = '';

  async aboutToAppear(): Promise<void> {
    const [savedUrl, loggedIn] = await Promise.all([Session.getBaseUrl(), Session.isLoggedIn()]);
    if (savedUrl) {
      this.server = savedUrl.replace(/\/api\/?$/, '');
      setBaseUrl(savedUrl);
    }
    if (loggedIn) {
      router.replaceUrl({ url: 'pages/Main' });
    }
  }

  async doLogin(demo: boolean): Promise<void> {
    this.error = '';
    if (!demo) {
      if (!this.server.trim()) {
        this.error = '请填写服务器地址';
        return;
      }
      if (!this.username.trim() || !this.password) {
        this.error = '请输入账号和密码';
        return;
      }
    }
    const normalized = normalizeBaseUrl(this.server);
    if (!normalized) {
      this.error = '服务器地址无效';
      return;
    }
    setBaseUrl(normalized);
    await Session.setBaseUrl(normalized);
    this.loading = true;
    try {
      const resp = demo
        ? await Api.demoLogin()
        : await Api.login({ username: this.username, password: this.password });
      if (resp.success && resp.data) {
        await Session.saveTokens(resp.data.token, resp.data.refreshToken);
        router.replaceUrl({ url: 'pages/Main' });
      } else {
        this.error = resp.message ?? '登录失败';
      }
    } catch (e) {
      this.error = (e as ApiError).message ?? '网络错误，请检查服务器地址';
    } finally {
      this.loading = false;
    }
  }

  build() {
    Column({ space: 14 }) {
      Text('XinWallet')
        .fontSize(30)
        .fontWeight(FontWeight.Bold)
        .margin({ top: 70, bottom: 8 })
      Text('登录到你的自托管记账服务')
        .fontSize(14)
        .fontColor($r('app.color.text_secondary'))

      TextInput({ placeholder: '服务器地址，如 https://nas.com:18888', text: this.server })
        .onChange((v) => (this.server = v))
        .width('82%')
      TextInput({ placeholder: '账号', text: this.username })
        .onChange((v) => (this.username = v))
        .width('82%')
      TextInput({ placeholder: '密码', text: this.password })
        .type(InputType.Password)
        .onChange((v) => (this.password = v))
        .width('82%')

      if (this.error) {
        Text(this.error)
          .fontColor(Color.Red)
          .fontSize(13)
          .width('82%')
      }

      Button(this.loading ? '登录中...' : '登录')
        .width('82%')
        .enabled(!this.loading)
        .onClick(() => this.doLogin(false))
      Button('体验 Demo 账号')
        .width('82%')
        .stateEffect(true)
        .onClick(() => this.doLogin(true))
    }
    .width('100%')
    .height('100%')
    .justifyContent(FlexAlign.Center)
  }
}
