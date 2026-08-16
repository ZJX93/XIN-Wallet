import UIAbility from '@ohos.app.ability.UIAbility';
import type AbilityConstant from '@ohos.app.ability.AbilityConstant';
import type Want from '@ohos.app.ability.Want';
import hilog from '@ohos.hilog';
import type window from '@ohos.window';
import dataPreferences from '@ohos.data.preferences';
import { Session } from '../common/store/Session';
import { setBaseUrl } from '../common/http/Http';

export default class EntryAbility extends UIAbility {
  onCreate(want: Want, launchParam: AbilityConstant.LaunchParam): void {
    hilog.info(0x0000, 'EntryAbility', '%{public}s', 'Ability onCreate');
    Session.init(this.context);
    // 启动时把已保存的 baseUrl 装载进 Http 层
    Session.getBaseUrl().then((url) => {
      if (url) {
        setBaseUrl(url);
      }
    });
    // 装载主题模式到 AppStorage（设置页可读写），默认 system
    dataPreferences.getPreferences(this.context, 'xinwallet_session').then((prefs) => {
      const mode = (prefs.get('themeMode', 'system') as string) || 'system';
      AppStorage.Set('themeMode', mode);
    }).catch(() => { /* ignore */ });
  }

  onWindowStageCreate(windowStage: window.WindowStage): void {
    // 入口固定为 Login，由 Login 页根据登录态决定是否跳 Main
    windowStage.loadContent('pages/Login', (err) => {
      if (err.code) {
        hilog.error(0x0000, 'EntryAbility', 'loadContent failed: %{public}s', JSON.stringify(err));
      }
    });
  }
}
