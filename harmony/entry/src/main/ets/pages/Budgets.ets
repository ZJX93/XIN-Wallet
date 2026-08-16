/**
 * 预算管理（对齐安卓 BudgetsScreen.kt）：列表 + 进度条(超支变红) + 新增/编辑/删除。
 */
import router from '@ohos.router';
import * as Api from '../common/api/Api';
import { ApiError } from '../common/http/Http';
import { COLORS, fmtMoney } from '../common/theme';
import { TopBar, SectionTitle, EmptyState, LoadingBox, LinearProgress } from '../common/components/Components';

const PERIODS: string[] = ['月', '周', '季', '半年', '年'];

interface Budget { id: number; name: string; amount: number; period?: string; startDate?: string; spent?: number; used?: number; }

@Component
export struct BudgetsPage {
  @State list: Budget[] = [];
  @State loading: boolean = false;
  @State showEdit: boolean = false;
  @State editingId: number = 0;
  @State fName: string = '';
  @State fAmount: string = '';
  @State fPeriod: string = '月';

  aboutToAppear(): void { this.load(); }

  async load(): Promise<void> {
    this.loading = false;
    try {
      const r = await Api.getBudgets();
      if (r.success) this.list = r.data as Budget[] || [];
    } catch (e) { console.error('Budgets:', (e as ApiError).message); }
  }

  used(b: Budget): number { return b.spent ?? b.used ?? 0; }

  openAdd(): void { this.editingId = 0; this.fName = ''; this.fAmount = ''; this.fPeriod = '月'; this.showEdit = true; }
  openEdit(b: Budget): void { this.editingId = b.id; this.fName = b.name; this.fAmount = String(b.amount); this.fPeriod = b.period || '月'; this.showEdit = true; }

  async save(): Promise<void> {
    const amt = Number(this.fAmount);
    if (!this.fName || !amt) return;
    const req = { name: this.fName, amount: amt, period: this.fPeriod };
    try {
      if (this.editingId) await Api.updateBudget(this.editingId, req);
      else await Api.createBudget(req);
      this.showEdit = false; this.load();
    } catch (e) { /* ignore */ }
  }
  async remove(b: Budget): Promise<void> {
    try { await Api.deleteBudget(b.id); this.load(); } catch (e) { /* ignore */ }
  }

  @Builder EditSheet() {
    Column({ space: 12 }) {
      Text(this.editingId ? '编辑预算' : '新增预算').fontSize(16).fontWeight(FontWeight.Bold)
      TextInput({ placeholder: '预算名称', text: this.fName }).onChange((v: string) => this.fName = v)
      TextInput({ placeholder: '金额', text: this.fAmount, type: InputType.Number }).onChange((v: string) => this.fAmount = v)
      Row({ space: 8 }) {
        Text('周期').fontSize(14).fontColor(COLORS.textSecondary)
        ForEach(PERIODS, (p: string) => {
          Text(p).fontSize(13).padding({ left: 12, right: 12, top: 6, bottom: 6 })
            .backgroundColor(this.fPeriod === p ? COLORS.brand : COLORS.brandBgLight)
            .fontColor(this.fPeriod === p ? '#FFFFFF' : COLORS.textPrimary)
            .borderRadius(14).onClick(() => this.fPeriod = p)
        })
      }
      Button('保存').width('100%').onClick(() => this.save())
      Button('取消').width('100%').backgroundColor(COLORS.divider).onClick(() => this.showEdit = false)
    }
  }

  build() {
    Column() {
      TopBar({ title: '预算管理' })
      if (this.loading) { LoadingBox() }
      else {
        Scroll() {
          Column({ space: 8 }) {
            if (this.list.length === 0) { EmptyState({ text: '还没有预算' }) }
            else {
              ForEach(this.list, (b: Budget) => {
                Column({ space: 6 }) {
                  Row() {
                    Text(b.name).fontSize(15).layoutWeight(1).fontColor(COLORS.textPrimary)
                    Text(b.period || '月').fontSize(12).fontColor(COLORS.textSecondary)
                  }
                  Row() {
                    Text(fmtMoney(this.used(b))).fontSize(14).fontColor(COLORS.textPrimary)
                    Text(` / ${fmtMoney(b.amount)}`).fontSize(12).fontColor(COLORS.textSecondary)
                  }
                  LinearProgress({
                    value: b.amount > 0 ? this.used(b) / b.amount : 0,
                    color: this.used(b) > b.amount ? COLORS.danger : COLORS.brand
                  })
                  if (this.used(b) > b.amount) {
                    Text(`已超支 ${fmtMoney(this.used(b) - b.amount)}`).fontSize(12).fontColor(COLORS.danger)
                  }
                }.width('100%').padding(14).backgroundColor(COLORS.card).borderRadius(12)
                  .onClick(() => this.openEdit(b))
                  .onLongPress(() => this.remove(b))
              }, (b: Budget) => b.id.toString())
            }
            Blank().height(20)
          }.padding(12)
        }.layoutWeight(1)
      }
      Column() {
        Text('+').fontSize(28).fontColor('#FFFFFF').fontWeight(FontWeight.Bold)
      }.width(52).height(52).backgroundColor(COLORS.brand).borderRadius(26)
        .position({ x: '88%', y: '88%' }).shadow({ radius: 6, color: '#995F2C55' })
        .onClick(() => this.openAdd())
    }.width('100%').height('100%').backgroundColor(COLORS.pageBg)

    if (this.showEdit) {
      Column() {
        Column().layoutWeight(1).backgroundColor('#00000066').onClick(() => this.showEdit = false)
        Column() { this.EditSheet() }.width('100%').backgroundColor(COLORS.card)
          .borderRadius({ topLeft: 16, topRight: 16 }).padding(20).constraintSize({ maxHeight: '80%' })
      }.width('100%').height('100%').position({ x: 0, y: 0 }).zIndex(20)
    }
  }
}

@Entry
@Component
struct Budgets {
  @State page: BudgetsPage = new BudgetsPage();
  build() { Column() { this.page }.width('100%').height('100%') }
}
