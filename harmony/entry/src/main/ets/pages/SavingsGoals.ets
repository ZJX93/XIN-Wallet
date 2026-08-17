/**
 * 储蓄目标（对齐安卓 SavingsGoalsScreen.kt）：列表 + 进度条 + 存入/取回/流水。
 */
import router from '@ohos.router';
import { SavingsGoalRequest } from '../common/models';
import * as Api from '../common/api/Api';
import { ApiError } from '../common/http/Http';
import { COLORS, fmtMoney } from '../common/theme';
import { TopBar, SectionTitle, EmptyState, LoadingBox, LinearProgress, CategoryIcon, FloatingButton } from '../common/components/Components';

const ICONS: string[] = ['🎯', '🏠', '🚗', '✈️', '💍', '📱', '🎓', '🐱'];

interface Goal { id: number; name: string; icon?: string; accountId?: number; current?: number; target?: number; }

@Component
export struct SavingsGoalsPage {
  @StorageProp('themeMode') themeMode: string = 'system';
  @State list: Goal[] = [];
  @State accounts: ESObject[] = [];
  @State loading: boolean = false;
  @State showEdit: boolean = false;
  @State showAlloc: boolean = false;
  @State editingId: number = 0;
  @State fName: string = '';
  @State fIcon: string = '🎯';
  @State fTarget: string = '';
  @State fAccount: number = 0;
  @State allocId: number = 0;
  @State allocAmt: string = '';
  @State allocMode: string = '存入';

  aboutToAppear(): void { this.load(); }

  async load(): Promise<void> {
    this.loading = false;
    try {
      const _r = await Promise.all([Api.getSavingsGoals(), Api.getAccounts()]);
      const g = _r[0];
      const a = _r[1];
      if (g.success) this.list = g.data as Goal[] || [];
      if (a.success) this.accounts = (a.data as ESObject)?.accounts || [];
    } catch (e) { console.error('Savings:', (e as ApiError).message); }
  }

  openAdd(): void { this.editingId = 0; this.fName = ''; this.fIcon = '🎯'; this.fTarget = ''; this.fAccount = this.accounts[0]?.id || 0; this.showEdit = true; }
  openEdit(g: Goal): void { this.editingId = g.id; this.fName = g.name; this.fIcon = g.icon || '🎯'; this.fTarget = String(g.target || ''); this.fAccount = g.accountId || 0; this.showEdit = true; }

  async save(): Promise<void> {
    const t = Number(this.fTarget);
    if (!this.fName || !t) return;
    const req: SavingsGoalRequest = { name: this.fName, icon: this.fIcon, target: t, accountId: this.fAccount };
    try {
      if (this.editingId) await Api.updateSavingsGoal(this.editingId, req);
      else await Api.createSavingsGoal(req);
      this.showEdit = false; this.load();
    } catch (e) { /* ignore */ }
  }
  async remove(g: Goal): Promise<void> {
    try { await Api.deleteSavingsGoal(g.id); this.load(); } catch (e) { /* ignore */ }
  }
  openAlloc(g: Goal, mode: string): void {
    this.allocId = g.id; this.allocMode = mode; this.allocAmt = ''; this.showAlloc = true;
  }
  async doAlloc(): Promise<void> {
    const amt = Number(this.allocAmt);
    if (!amt) return;
    try {
      if (this.allocMode === '存入') await Api.allocateSavings(this.allocId, { amount: amt });
      else await Api.withdrawSavings(this.allocId, { amount: amt });
      this.showAlloc = false; this.load();
    } catch (e) { /* ignore */ }
  }

  @Builder EditSheet() {
    Column({ space: 12 }) {
      Text(this.editingId ? '编辑目标' : '新增目标').fontSize(16).fontWeight(FontWeight.Bold)
      TextInput({ placeholder: '目标名称', text: this.fName }).onChange((v: string) => this.fName = v)
      Row({ space: 6 }) {
        ForEach(ICONS, (ic: string) => {
          Text(ic).fontSize(20).padding(6)
            .backgroundColor(this.fIcon === ic ? COLORS.brandBgLight : '#00000000').borderRadius(8)
            .onClick(() => this.fIcon = ic)
        })
      }
      TextInput({ placeholder: '目标金额', text: this.fTarget }).type(InputType.Number).onChange((v: string) => this.fTarget = v)
      Row({ space: 8 }) {
        Text('账户').fontSize(14).fontColor(COLORS.textSecondary)
        Scroll() {
          Row({ space: 8 }) {
            ForEach(this.accounts, (a: ESObject) => {
              Text(a.name).fontSize(13).padding({ left: 12, right: 12, top: 6, bottom: 6 })
                .backgroundColor(this.fAccount === a.id ? COLORS.brand : COLORS.brandBgLight)
                .fontColor(this.fAccount === a.id ? '#FFFFFF' : COLORS.textPrimary)
                .borderRadius(14).onClick(() => this.fAccount = a.id)
            })
          }
        }.scrollable(ScrollDirection.Horizontal).layoutWeight(1)
      }
      Button('保存').width('100%').onClick(() => this.save())
      Button('取消').width('100%').backgroundColor(COLORS.divider).onClick(() => this.showEdit = false)
    }
  }

  @Builder AllocSheet() {
    Column({ space: 12 }) {
      Text(this.allocMode + '目标').fontSize(16).fontWeight(FontWeight.Bold)
      TextInput({ placeholder: '金额', text: this.allocAmt }).type(InputType.Number).onChange((v: string) => this.allocAmt = v)
      Button('确定').width('100%').onClick(() => this.doAlloc())
      Button('取消').width('100%').backgroundColor(COLORS.divider).onClick(() => this.showAlloc = false)
    }
  }

  build() {
    Column() {
      TopBar({ title: '储蓄目标' })
      if (this.loading) { LoadingBox() }
      else {
        Scroll() {
          Column({ space: 8 }) {
            if (this.list.length === 0) { EmptyState({ text: '还没有储蓄目标' }) }
            else {
              ForEach(this.list, (g: Goal) => {
                Column({ space: 6 }) {
                  Row({ space: 12 }) {
                    CategoryIcon({ icon: g.icon || '🎯', iconSize: 40 })
                    Column() {
                      Text(g.name).fontSize(15).fontColor(COLORS.textPrimary)
                    }.layoutWeight(1).alignItems(HorizontalAlign.Start)
                    Text(`${fmtMoney(g.current || 0)} / ${fmtMoney(g.target || 0)}`)
                      .fontSize(13).fontColor(COLORS.textSecondary)
                  }
                  LinearProgress({
                    value: (g.target ?? 0) > 0 ? (g.current || 0) / (g.target ?? 0) : 0,
                    color: (g.current || 0) >= (g.target || 0) ? COLORS.brand : COLORS.expense,
                    showPercent: true
                  })
                  Row({ space: 12 }) {
                    Text('存入').fontSize(13).fontColor(COLORS.brand).onClick(() => this.openAlloc(g, '存入'))
                    Text('取回').fontSize(13).fontColor(COLORS.brand).onClick(() => this.openAlloc(g, '取回'))
                    Text('编辑').fontSize(13).fontColor(COLORS.textSecondary).onClick(() => this.openEdit(g))
                    Text('删除').fontSize(13).fontColor(COLORS.danger).onClick(() => this.remove(g))
                  }.justifyContent(FlexAlign.End)
                }.width('100%').padding(14).backgroundColor(COLORS.card).borderRadius(12)
              }, (g: Goal) => g.id.toString())
            }
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
      if (this.showAlloc) {
        Column() {
          Column().layoutWeight(1).backgroundColor('#00000066').onClick(() => this.showAlloc = false)
          Column() { this.AllocSheet() }.width('100%').backgroundColor(COLORS.card)
            .borderRadius({ topLeft: 16, topRight: 16 }).padding(20).constraintSize({ maxHeight: '60%' })
        }.width('100%').height('100%').position({ x: 0, y: 0 }).zIndex(20)
      }
    }.width('100%').height('100%').backgroundColor(COLORS.pageBg)
  }
}

@Entry
@Component
struct SavingsGoals {
  build() { Column() { SavingsGoalsPage() }.width('100%').height('100%') }
}
