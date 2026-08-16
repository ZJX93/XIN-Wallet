/**
 * 账户（对齐安卓 AccountsScreen.kt）：总资产 + 按类型分组列表 + 长按/点击 + 新增账户。
 */
import router from '@ohos.router';
import * as Api from '../common/api/Api';
import { ApiError } from '../common/http/Http';
import { COLORS, fmtMoney } from '../common/theme';
import { Account, AccountsResponse } from '../common/models';
import { BalanceCard, SectionTitle, EmptyState, LoadingBox, CategoryIcon, TopBar } from '../common/components/Components';

const TYPES: string[] = ['现金', '储蓄卡', '信用卡', '电子支付', '金融账户', '数字货币', '其他'];
const ICONS: string[] = ['💵', '🏦', '💳', '📱', '📊', '🪙', '💰'];

@Component
export struct AccountsPage {
  @State accounts: Account[] = [];
  @State total: number = 0;
  @State loading: boolean = false;
  @State showAdd: boolean = false;
  @State fName: string = '';
  @State fType: string = '现金';
  @State fBalance: string = '';
  @State fLimit: string = '';
  @State fIcon: string = '💵';

  aboutToAppear(): void { this.load(); }

  async load(): Promise<void> {
    this.loading = false;
    try {
      const r = await Api.getAccounts();
      if (r.success && r.data) {
        const d = r.data as AccountsResponse;
        this.accounts = d.accounts || [];
        this.total = d.totalAssets ?? this.accounts.reduce((s, a) => s + (a.balance || 0), 0);
      }
    } catch (e) { console.error('Accounts:', (e as ApiError).message); }
  }

  grouped(): { type: string; list: Account[] }[] {
    const map = new Map<string, Account[]>();
    this.accounts.forEach(a => {
      const t = a.type || '其他';
      if (!map.has(t)) map.set(t, []);
      map.get(t)!.push(a);
    });
    const res: { type: string; list: Account[] }[] = [];
    TYPES.forEach(t => { if (map.has(t)) res.push({ type: t, list: map.get(t)! }); });
    map.forEach((list, t) => { if (!TYPES.includes(t)) res.push({ type: t, list }); });
    return res;
  }

  async save(): Promise<void> {
    if (!this.fName) return;
    try {
      await Api.createAccount({
        name: this.fName,
        type: this.fType,
        icon: this.fIcon,
        opening_balance: Number(this.fBalance) || 0,
        credit_limit: Number(this.fLimit) || 0
      });
      this.showAdd = false;
      this.fName = ''; this.fBalance = ''; this.fLimit = '';
      this.load();
    } catch (e) { /* ignore */ }
  }

  @Builder AddSheet() {
    Column({ space: 12 }) {
      Text('新增账户').fontSize(16).fontWeight(FontWeight.Bold)
      TextInput({ placeholder: '账户名称', text: this.fName }).onChange((v: string) => this.fName = v)
      Row({ space: 8 }) {
        Text('类型').fontSize(14).fontColor(COLORS.textSecondary)
        Scroll() {
          Row({ space: 8 }) {
            ForEach(TYPES, (t: string) => {
              Text(t).fontSize(13).padding({ left: 12, right: 12, top: 6, bottom: 6 })
                .backgroundColor(this.fType === t ? COLORS.brand : COLORS.brandBgLight)
                .fontColor(this.fType === t ? '#FFFFFF' : COLORS.textPrimary)
                .borderRadius(14).onClick(() => this.fType = t)
            })
          }
        }.scrollable(ScrollDirection.Horizontal).layoutWeight(1)
      }
      Row({ space: 8 }) {
        Text('图标').fontSize(14).fontColor(COLORS.textSecondary)
        ForEach(ICONS, (ic: string) => {
          Text(ic).fontSize(20).padding(6)
            .backgroundColor(this.fIcon === ic ? COLORS.brandBgLight : '#00000000')
            .borderRadius(8).onClick(() => this.fIcon = ic)
        })
      }
      TextInput({ placeholder: '开户余额', text: this.fBalance }).onChange((v: string) => this.fBalance = v)
      TextInput({ placeholder: '信用额度(信用卡)', text: this.fLimit }).onChange((v: string) => this.fLimit = v)
      Button('保存').width('100%').onClick(() => this.save())
      Button('取消').width('100%').backgroundColor(COLORS.divider).onClick(() => this.showAdd = false)
    }
  }

  build() {
    Column() {
      TopBar({ title: '账户' })
      if (this.loading) { LoadingBox() }
      else {
        Scroll() {
          Column({ space: 12 }) {
            BalanceCard({ title: '总资产', amount: this.total, subtitle: '所有活跃账户余额合计' })
            if (this.accounts.length === 0) {
              EmptyState({ text: '还没有账户，点右下角「+」添加第一个' })
            } else {
              ForEach(this.grouped(), (g: any) => {
                Column({ space: 6 }) {
                  SectionTitle({ text: g.type })
                  ForEach(g.list, (a: Account) => {
                    Row({ space: 12 }) {
                      CategoryIcon({ icon: a.icon || '💵', size: 40 })
                      Column() {
                        Text(a.name).fontSize(15).fontColor(COLORS.textPrimary)
                        Text(g.type).fontSize(12).fontColor(COLORS.textSecondary)
                      }.layoutWeight(1).alignItems(HorizontalAlign.Start)
                      Column() {
                        Text(fmtMoney(a.balance)).fontSize(15).fontWeight(FontWeight.Medium).fontColor(COLORS.textPrimary)
                        if (a.type === '信用卡' && a.credit_limit) {
                          Text(`额度 ${fmtMoney(a.credit_limit)}`).fontSize(11).fontColor(COLORS.textSecondary)
                        }
                      }.alignItems(HorizontalAlign.End)
                    }.width('100%').padding({ top: 12, bottom: 12 }).backgroundColor(COLORS.card).borderRadius(12)
                      .onClick(() => router.pushUrl({ url: 'pages/AccountDetail', params: { id: a.id } }))
                  }, (a: Account) => a.id.toString())
                }
              }, (g: any) => g.type)
            }
            Blank().height(20)
          }.padding(12)
        }.layoutWeight(1)
      }
      // FAB
      Column() {
        Text('+').fontSize(28).fontColor('#FFFFFF').fontWeight(FontWeight.Bold)
      }.width(52).height(52).backgroundColor(COLORS.brand).borderRadius(26)
        .position({ x: '88%', y: '88%' }).shadow({ radius: 6, color: '#995F2C55' })
        .onClick(() => this.showAdd = true)
    }.width('100%').height('100%').backgroundColor(COLORS.pageBg)

    if (this.showAdd) {
      Column() {
        Column().layoutWeight(1).backgroundColor('#00000066').onClick(() => this.showAdd = false)
        Column() { this.AddSheet() }.width('100%').backgroundColor(COLORS.card)
          .borderRadius({ topLeft: 16, topRight: 16 }).padding(20).constraintSize({ maxHeight: '80%' })
      }.width('100%').height('100%').position({ x: 0, y: 0 }).zIndex(20)
    }
  }
}

@Entry
@Component
struct Accounts {
  @State page: AccountsPage = new AccountsPage();
  build() {
    Column() { this.page }.width('100%').height('100%')
  }
}
