/**
 * 债务管理（对齐安卓 DebtsScreen.kt）：汇总 4 卡 + 应付/应收分组 + 还款/编辑/删除。
 */
import router from '@ohos.router';
import { DebtRequest } from '../common/models';
import * as Api from '../common/api/Api';
import { ApiError } from '../common/http/Http';
import { COLORS, fmtMoney } from '../common/theme';
import { TopBar, SectionTitle, EmptyState, LoadingBox, LinearProgress, CategoryIcon, FloatingButton } from '../common/components/Components';

interface Debt { id: number; name: string; type?: string; principal?: number; remaining?: number; monthly?: number; paid?: number; dueDate?: string; icon?: string; }

@Component
export struct DebtsPage {
  @StorageProp('themeMode') themeMode: string = 'system';
  @State data: ESObject = null;
  @State loading: boolean = false;
  @State showEdit: boolean = false;
  @State showRepay: boolean = false;
  @State editingId: number = 0;
  @State fName: string = '';
  @State fType: string = 'payable';
  @State fPrincipal: string = '';
  @State fMonthly: string = '';
  @State repayId: number = 0;
  @State repayAmt: string = '';

  aboutToAppear(): void { this.load(); }

  async load(): Promise<void> {
    this.loading = false;
    try {
      const r = await Api.getDebts();
      if (r.success) this.data = r.data;
    } catch (e) { console.error('Debts:', (e as ApiError).message); }
  }

  payable(): Debt[] { return (this.data?.payable || this.data?.debts || []) as Debt[]; }
  receivable(): Debt[] { return (this.data?.receivable || []) as Debt[]; }

  openAdd(): void { this.editingId = 0; this.fName = ''; this.fType = 'payable'; this.fPrincipal = ''; this.fMonthly = ''; this.showEdit = true; }
  openEdit(d: Debt): void { this.editingId = d.id; this.fName = d.name; this.fType = d.type || 'payable'; this.fPrincipal = String(d.principal || ''); this.fMonthly = String(d.monthly || ''); this.showEdit = true; }

  async save(): Promise<void> {
    const req: DebtRequest = {
      name: this.fName,
      type: this.fType,
      principal: Number(this.fPrincipal) || 0,
      monthlyPayment: Number(this.fMonthly) || 0
    };
    try {
      if (this.editingId) await Api.updateDebt(this.editingId, req);
      else await Api.createDebt(req);
      this.showEdit = false; this.load();
    } catch (e) { /* ignore */ }
  }
  async remove(d: Debt): Promise<void> {
    try { await Api.deleteDebt(d.id); this.load(); } catch (e) { /* ignore */ }
  }
  openRepay(d: Debt): void { this.repayId = d.id; this.repayAmt = ''; this.showRepay = true; }
  async doRepay(): Promise<void> {
    const amt = Number(this.repayAmt);
    if (!amt) return;
    try { await Api.createRepayment(this.repayId, { amount: amt }); this.showRepay = false; this.load(); } catch (e) { /* ignore */ }
  }

  @Builder DebtRow(d: Debt) {
    Column({ space: 6 }) {
      Row({ space: 12 }) {
        CategoryIcon({ icon: d.icon || '🤝', iconSize: 40 })
        Column() {
          Text(d.name).fontSize(15).fontColor(COLORS.textPrimary)
          if (d.dueDate) Text(`到期 ${d.dueDate}`).fontSize(11).fontColor(COLORS.textSecondary)
        }.layoutWeight(1).alignItems(HorizontalAlign.Start)
        Column() {
          Text(fmtMoney(d.remaining ?? d.principal ?? 0)).fontSize(15).fontWeight(FontWeight.Medium)
            .fontColor(d.type === 'receivable' ? COLORS.expense : COLORS.income)
        }.alignItems(HorizontalAlign.End)
      }
      Row() {
        Text(`本金 ${fmtMoney(d.principal || 0)}`).fontSize(12).fontColor(COLORS.textSecondary).layoutWeight(1)
        if (d.monthly) Text(`月供 ${fmtMoney(d.monthly)}`).fontSize(12).fontColor(COLORS.textSecondary)
      }
      if ((d.principal || 0) > 0 && (d.remaining ?? 0) >= 0) {
        LinearProgress({ value: 1 - (d.remaining ?? 0) / (d.principal || 1), color: COLORS.brand, showPercent: true })
      }
      Row({ space: 12 }) {
        Text('还款').fontSize(13).fontColor(COLORS.brand).onClick(() => this.openRepay(d))
        Text('编辑').fontSize(13).fontColor(COLORS.textSecondary).onClick(() => this.openEdit(d))
        Text('删除').fontSize(13).fontColor(COLORS.danger).onClick(() => this.remove(d))
      }.justifyContent(FlexAlign.End)
    }.width('100%').padding(14).backgroundColor(COLORS.card).borderRadius(12)
  }

  @Builder EditSheet() {
    Column({ space: 12 }) {
      Text(this.editingId ? '编辑债务' : '新增债务').fontSize(16).fontWeight(FontWeight.Bold)
      TextInput({ placeholder: '名称', text: this.fName }).onChange((v: string) => this.fName = v)
      Row({ space: 8 }) {
        Text('类型').fontSize(14).fontColor(COLORS.textSecondary)
        Text('我欠别人').fontSize(13).padding({ left: 12, right: 12, top: 6, bottom: 6 })
          .backgroundColor(this.fType === 'payable' ? COLORS.brand : COLORS.brandBgLight)
          .fontColor(this.fType === 'payable' ? '#FFFFFF' : COLORS.textPrimary).borderRadius(14)
          .onClick(() => this.fType = 'payable')
        Text('别人欠我').fontSize(13).padding({ left: 12, right: 12, top: 6, bottom: 6 })
          .backgroundColor(this.fType === 'receivable' ? COLORS.brand : COLORS.brandBgLight)
          .fontColor(this.fType === 'receivable' ? '#FFFFFF' : COLORS.textPrimary).borderRadius(14)
          .onClick(() => this.fType = 'receivable')
      }
      TextInput({ placeholder: '本金', text: this.fPrincipal }).type(InputType.Number).onChange((v: string) => this.fPrincipal = v)
      TextInput({ placeholder: '月供', text: this.fMonthly }).type(InputType.Number).onChange((v: string) => this.fMonthly = v)
      Button('保存').width('100%').onClick(() => this.save())
      Button('取消').width('100%').backgroundColor(COLORS.divider).onClick(() => this.showEdit = false)
    }
  }

  @Builder RepaySheet() {
    Column({ space: 12 }) {
      Text('记还款').fontSize(16).fontWeight(FontWeight.Bold)
      TextInput({ placeholder: '还款金额', text: this.repayAmt }).type(InputType.Number).onChange((v: string) => this.repayAmt = v)
      Button('确定').width('100%').onClick(() => this.doRepay())
      Button('取消').width('100%').backgroundColor(COLORS.divider).onClick(() => this.showRepay = false)
    }
  }

  build() {
    Column() {
      TopBar({ title: '债务管理' })
      if (this.loading) { LoadingBox() }
      else {
        Scroll() {
          Column({ space: 12 }) {
            // 汇总
            if (this.data) {
              Row({ space: 8 }) {
                this.SumCell('我欠别人', fmtMoney(this.data.totalPayable ?? 0), COLORS.income)
                this.SumCell('别人欠我', fmtMoney(this.data.totalReceivable ?? 0), COLORS.expense)
              }
              Row({ space: 8 }) {
                this.SumCell('本月待还', fmtMoney(this.data.monthDue ?? 0), COLORS.textPrimary)
                this.SumCell('逾期未还', fmtMoney(this.data.overdue ?? 0), COLORS.danger)
              }
            }
            if (this.payable().length > 0) {
              SectionTitle({ text: '我欠别人（应付）' })
              ForEach(this.payable(), (d: Debt) => { this.DebtRow(d) }, (d: Debt) => d.id.toString())
            }
            if (this.receivable().length > 0) {
              SectionTitle({ text: '别人欠我（应收）' })
              ForEach(this.receivable(), (d: Debt) => { this.DebtRow(d) }, (d: Debt) => d.id.toString())
            }
            if (!this.data) { EmptyState({ text: '暂无债务' }) }
            Blank().height(20)
          }.padding(12)
        }.layoutWeight(1)
      }
      FloatingButton({ onTap: () => this.openAdd() })
      if (this.showEdit) {
        Column() {
          Column().layoutWeight(1).backgroundColor('#00000066').onClick(() => this.showEdit = false)
          Column() { this.EditSheet() }.width('100%').backgroundColor(COLORS.card)
            .borderRadius({ topLeft: 16, topRight: 16 }).padding(20).constraintSize({ maxHeight: '80%' })
        }.width('100%').height('100%').position({ x: 0, y: 0 }).zIndex(20)
      }
      if (this.showRepay) {
        Column() {
          Column().layoutWeight(1).backgroundColor('#00000066').onClick(() => this.showRepay = false)
          Column() { this.RepaySheet() }.width('100%').backgroundColor(COLORS.card)
            .borderRadius({ topLeft: 16, topRight: 16 }).padding(20).constraintSize({ maxHeight: '60%' })
        }.width('100%').height('100%').position({ x: 0, y: 0 }).zIndex(20)
      }
    }.width('100%').height('100%').backgroundColor(COLORS.pageBg)
  }

  @Builder SumCell(title: string, value: string, color: string) {
    Column({ space: 4 }) {
      Text(title).fontSize(12).fontColor(COLORS.textSecondary)
      Text(value).fontSize(16).fontWeight(FontWeight.Bold).fontColor(color)
    }.layoutWeight(1).padding(12).backgroundColor(COLORS.card).borderRadius(12)
  }
}

@Entry
@Component
struct Debts {
  build() { Column() { DebtsPage() }.width('100%').height('100%') }
}
