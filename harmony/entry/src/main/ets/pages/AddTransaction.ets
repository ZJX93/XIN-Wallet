/**
 * 记一笔（对齐安卓 AddTransactionScreen.kt）：支出/收入分段 + 分类网格 + 账户/日期/地点 + 金额键盘。
 * 定位改用鸿蒙 @ohos.geoLocationManager（根治无 GMS 机型 NETWORK_PROVIDER 失效导致的定位失败）。
 */
import router from '@ohos.router';
import { common } from '@ohos.app.ability.common';
import abilityAccessCtrl from '@ohos.ability.accessCtrl';
import geoLocationManager from '@ohos.geoLocationManager';
import * as Api from '../common/api/Api';
import { ApiError } from '../common/http/Http';
import { COLORS, fmtMoney } from '../common/theme';
import { Category } from '../common/models';
import { TopBar, CategoryIcon, LoadingBox } from '../common/components/Components';

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fmtDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

@Entry
@Component
struct AddTransaction {
  @State editId: number = 0;
  @State type: string = 'expense';
  @State categories: Category[] = [];
  @State accounts: any[] = [];
  @State catId: number = 0;
  @State accId: number = 0;
  @State accName: string = '';
  @State date: string = today();
  @State amount: string = '';
  @State note: string = '';
  @State location: string = '';
  @State loading: boolean = false;
  @State loadingData: boolean = false;
  private ctx: common.UIAbilityContext = getContext(this) as common.UIAbilityContext;

  aboutToAppear(): void {
    const p: any = (router.getParams() as any) || {};
    if (p.editId) this.editId = p.editId;
    this.load();
  }

  async load(): Promise<void> {
    this.loadingData = true;
    try {
      const [c, a] = await Promise.all([Api.getCategories(), Api.getAccounts()]);
      if (c.success) this.categories = c.data || [];
      if (a.success) {
        this.accounts = (a.data as any)?.accounts || [];
        this.accId = this.accounts[0]?.id || 0;
        this.accName = this.accounts[0]?.name || '';
      }
      if (this.editId) {
        const r = await Api.getTransactions({ limit: 1 });
        // 简化：通过账单页传入的 editId 直接编辑（后端按 id 更新）
      }
      // 选默认分类
      const def = this.categories.find(x => x.type === this.type);
      if (def) this.catId = def.id;
    } catch (e) { console.error('AddTx load:', (e as ApiError).message); }
    finally { this.loadingData = false; }
  }

  visibleCats(): Category[] {
    return this.categories.filter(c => (c.type || 'expense') === this.type);
  }

  onTypeChange(t: string): void {
    this.type = t;
    const def = this.categories.find(x => x.type === t);
    if (def) this.catId = def.id;
  }

  async requestLoc(): Promise<void> {
    try {
      const at = abilityAccessCtrl.createAtManager();
      const res = await at.requestPermissionsFromUser(this.ctx, ['ohos.permission.LOCATION', 'ohos.permission.APPROXIMATELY_LOCATION']);
      if (!res.authResults.every((r: number) => r === 0)) return;
      const loc = await geoLocationManager.getCurrentLocation({ scenario: 0x301 });
      this.location = `${loc.latitude.toFixed(4)},${loc.longitude.toFixed(4)}`;
    } catch (e) { console.error('loc:', (e as ApiError)?.message); }
  }

  onKey(k: string): void {
    if (k === '删除') { this.amount = this.amount.slice(0, -1); return; }
    if (k === '清空') { this.amount = ''; return; }
    if (k === '.') { if (!this.amount.includes('.')) this.amount += this.amount ? '.' : '0.'; return; }
    if (/[0-9]/.test(k)) { if (this.amount === '0') this.amount = k; else this.amount += k; }
  }

  async submit(again: boolean): Promise<void> {
    const amt = Number(this.amount);
    if (!amt || !this.catId || !this.accId) { return; }
    this.loading = true;
    try {
      const req = {
        account_id: this.accId,
        category_id: this.catId,
        type: this.type,
        amount: amt,
        note: this.note,
        date: this.date,
        location: this.location || undefined
      };
      if (this.editId) await Api.updateTransaction(this.editId, req);
      else await Api.createTransaction(req);
      if (again) {
        this.amount = ''; this.note = ''; this.location = '';
      } else {
        router.back();
      }
    } catch (e) { console.error('submit:', (e as ApiError).message); }
    finally { this.loading = false; }
  }

  @Builder Key(key: string) {
    Column() {
      Text(key).fontSize(22).fontColor(COLORS.textPrimary)
    }.width('100%').height('100%').justifyContent(FlexAlign.Center)
      .backgroundColor(COLORS.card).borderRadius(8)
      .onClick(() => this.onKey(key))
  }

  build() {
    Column() {
      TopBar({ title: this.editId ? '编辑交易' : '记一笔', onBack: () => router.back() })
      if (this.loadingData) { LoadingBox() }
      else {
        Scroll() {
          Column({ space: 12 }) {
            // 类型分段
            Row() {
              Text('支出').fontSize(16).fontColor(this.type === 'expense' ? COLORS.brand : COLORS.textSecondary)
                .fontWeight(this.type === 'expense' ? FontWeight.Bold : FontWeight.Normal)
                .layoutWeight(1).textAlign(TextAlign.Center).padding({ top: 10, bottom: 10 })
                .backgroundColor(this.type === 'expense' ? COLORS.brandBgLight : '#00000000')
                .borderRadius(10).onClick(() => this.onTypeChange('expense'))
              Text('收入').fontSize(16).fontColor(this.type === 'income' ? COLORS.brand : COLORS.textSecondary)
                .fontWeight(this.type === 'income' ? FontWeight.Bold : FontWeight.Normal)
                .layoutWeight(1).textAlign(TextAlign.Center).padding({ top: 10, bottom: 10 })
                .backgroundColor(this.type === 'income' ? COLORS.brandBgLight : '#00000000')
                .borderRadius(10).onClick(() => this.onTypeChange('income'))
            }.width('100%').backgroundColor(COLORS.divider).borderRadius(10)

            // 分类网格
            Grid() {
              ForEach(this.visibleCats(), (c: Category) => {
                GridItem() {
                  Column({ space: 4 }) {
                    CategoryIcon({ icon: c.icon || '📌', bg: this.catId === c.id ? COLORS.brand : (c.color || COLORS.brandBgLight), size: 40 })
                    Text(c.name).fontSize(12).fontColor(this.catId === c.id ? COLORS.brand : COLORS.textPrimary)
                  }.width('100%').padding({ top: 8, bottom: 8 })
                    .onClick(() => this.catId = c.id)
                }
              }, (c: Category) => c.id.toString())
            }.columnsTemplate('1fr 1fr 1fr 1fr 1fr').rowsGap(6).columnsGap(6)

            // 上下文 chips
            Row({ space: 10 }) {
              Row({ space: 6 }) {
                Text('💰').fontSize(16)
                Text(this.accName || '选择账户').fontSize(14).fontColor(COLORS.textPrimary)
              }.padding({ left: 12, right: 12, top: 8, bottom: 8 }).backgroundColor(COLORS.brandBgLight).borderRadius(16)
                .onClick(() => {/* 简化：用首个账户，可扩展为选择器 */ if (this.accounts.length) { this.accId = this.accounts[0].id; this.accName = this.accounts[0].name; } })
              Row({ space: 6 }) {
                Text('📅').fontSize(16)
                Text(this.date).fontSize(14).fontColor(COLORS.textPrimary)
              }.padding({ left: 12, right: 12, top: 8, bottom: 8 }).backgroundColor(COLORS.brandBgLight).borderRadius(16)
                .onClick(() => {
                  DatePickerDialog.show({
                    start: new Date('2020-01-01'), end: new Date(), selected: new Date(this.date),
                    onAccept: (v: DatePickerResult) => { this.date = fmtDate(v.year, v.month, v.day); }
                  });
                })
              Row({ space: 6 }) {
                Text('📍').fontSize(16)
                Text(this.location ? '已定位' : '地点').fontSize(14).fontColor(COLORS.textPrimary)
              }.padding({ left: 12, right: 12, top: 8, bottom: 8 }).backgroundColor(COLORS.brandBgLight).borderRadius(16)
                .onClick(() => this.requestLoc())
            }.width('100%')

            // 金额 + 备注
            Row({ space: 8 }) {
              Text('¥').fontSize(26).fontColor(COLORS.textPrimary)
              Text(this.amount || '0.00').fontSize(32).fontWeight(FontWeight.Bold).layoutWeight(1).fontColor(COLORS.textPrimary)
            }.width('100%').padding(12).backgroundColor(COLORS.card).borderRadius(12)
            TextInput({ placeholder: '备注（可选）', text: this.note }).onChange((v: string) => this.note = v)

            // 键盘
            Grid() {
              ForEach(['1', '2', '3', '4', '5', '6', '7', '8', '9', '清空', '0', '删除'], (k: string) => {
                GridItem() { this.Key(k) }
              }, (k: string) => k)
            }.columnsTemplate('1fr 1fr 1fr').rowsGap(8).columnsGap(8).width('100%').height(220)

            Row({ space: 10 }) {
              Button('确定').layoutWeight(1).backgroundColor(COLORS.brand)
                .onClick(() => this.submit(false))
              Button('再记一笔').layoutWeight(1).backgroundColor(COLORS.brandBgLight).fontColor(COLORS.brand)
                .onClick(() => this.submit(true))
            }.width('100%')
            Blank().height(20)
          }.padding(12)
        }.layoutWeight(1)
      }
    }.width('100%').height('100%').backgroundColor(COLORS.pageBg)
  }
}

// DatePickerResult 兼容（不同 API 版本字段可能为 year/month/day 或 date）
interface DatePickerResult { year: number; month: number; day: number; }
function fmtDate(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
