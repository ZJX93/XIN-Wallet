/**
 * 账户详情（对齐安卓 AccountDetailScreen.kt）：当前余额 + 交易记录。
 */
import router from '@ohos.router';
import promptAction from '@ohos.promptAction';
import * as Api from '../common/api/Api';
import { ApiError } from '../common/http/Http';
import { COLORS, fmtMoney } from '../common/theme';
import { Account, TransactionItem, AddAccountInterestRequest } from '../common/models';
import { BalanceCard, LoadingBox, EmptyState, TransactionRow, TopBar, CategoryIcon } from '../common/components/Components';

@Component
export struct AccountDetailPage {
  @StorageProp('themeMode') themeMode: string = 'system';
  @Prop itemId: number = 0;
  @State account: Account | null = null;
  @State txs: TransactionItem[] = [];
  @State loading: boolean = false;
  @State showInterest: boolean = false;
  @State iAmount: string = '';
  @State iDate: string = '';
  @State iNote: string = '';

  aboutToAppear(): void { this.load(); }

  async load(): Promise<void> {
    this.loading = true;
    try {
      const _r = await Promise.all([
        Api.getAccounts(),
        Api.getTransactions({ account_id: this.itemId, limit: 200 })
      ]);
      const a = _r[0];
      const t = _r[1];
      if (a.success && a.data) {
        this.account = (a.data.accounts || []).find((x: Account) => x.id === this.itemId) || null;
      }
      if (t.success) this.txs = t.data || [];
    } catch (e) { console.error('AccountDetail:', (e as ApiError).message); }
    finally { this.loading = false; }
  }

  today(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  async recordInterest(): Promise<void> {
    if (!this.account) return;
    const amount = Number(this.iAmount);
    if (!(amount > 0)) {
      promptAction.showToast({ message: '请输入正数利息金额' });
      return;
    }
    try {
      const req: AddAccountInterestRequest = {
        amount: amount,
        date: this.iDate.trim() === '' ? undefined : this.iDate.trim(),
        note: this.iNote.trim() === '' ? undefined : this.iNote.trim()
      };
      const r = await Api.addAccountInterest(this.account.id, req);
      if (r.success && r.data) {
        this.account.balance = r.data.balance;
        if (r.data.last_interest_date) this.account.last_interest_date = r.data.last_interest_date;
        this.showInterest = false;
        this.iAmount = ''; this.iDate = ''; this.iNote = '';
        promptAction.showToast({ message: '利息已记录' });
      } else {
        promptAction.showToast({ message: '计息失败' });
      }
    } catch (e) {
      console.error('recordInterest:', (e as ApiError).message);
      promptAction.showToast({ message: '计息失败' });
    }
  }

  @Builder InterestSheet() {
    Column({ space: 12 }) {
      Text('记利息').fontSize(16).fontWeight(FontWeight.Bold)
      TextInput({ placeholder: '利息金额(正数)', text: this.iAmount }).type(InputType.Number)
        .onChange((v: string) => this.iAmount = v)
      TextInput({ placeholder: '日期 YYYY-MM-DD(选填，默认今天)', text: this.iDate })
        .onChange((v: string) => this.iDate = v)
      TextInput({ placeholder: '备注(选填)', text: this.iNote })
        .onChange((v: string) => this.iNote = v)
      Button('记录').width('100%').onClick(() => this.recordInterest())
      Button('取消').width('100%').backgroundColor(COLORS.divider).onClick(() => this.showInterest = false)
    }
  }

  build() {
    Column() {
      TopBar({ title: this.account?.name ?? '账户', onBack: () => router.back() })
      if (this.loading) { LoadingBox() }
      else {
        Scroll() {
          Column({ space: 12 }) {
            BalanceCard({
              title: '当前余额',
              amount: this.account?.balance ?? 0,
              subtitle: `${this.account?.type ?? ''}${this.account?.credit_limit ? ' · 额度 ' + fmtMoney(this.account.credit_limit) : ''}${this.account?.last_interest_date ? ' · 上次计息 ' + this.account.last_interest_date : ''}`
            })
            if (this.account) {
              Button('记利息').width('100%').onClick(() => {
                this.iAmount = ''; this.iDate = ''; this.iNote = '';
                this.showInterest = true;
              })
            }
            if (this.txs.length === 0) {
              EmptyState({ text: '该账户暂无交易' })
            } else {
              ForEach(this.txs, (it: TransactionItem) => {
                TransactionRow({ item: it })
              }, (it: TransactionItem) => it.id.toString())
            }
            Blank().height(20)
          }.padding(12)
        }.layoutWeight(1)
      }
      if (this.showInterest) {
        Column() {
          Column().layoutWeight(1).backgroundColor('#00000066').onClick(() => this.showInterest = false)
          Column() { this.InterestSheet() }.width('100%').backgroundColor(COLORS.card)
            .borderRadius({ topLeft: 16, topRight: 16 }).padding(20).constraintSize({ maxHeight: '80%' })
        }.width('100%').height('100%').position({ x: 0, y: 0 }).zIndex(20)
      }
    }.width('100%').height('100%').backgroundColor(COLORS.pageBg)
  }
}

@Entry
@Component
struct AccountDetail {
  @State itemId: number = 0;
  aboutToAppear(): void {
    const p: ESObject = (router.getParams() as ESObject) || {};
    if (p.id) this.itemId = p.id;
  }
  build() {
    Column() { AccountDetailPage({ itemId: this.itemId }) }.width('100%').height('100%')
  }
}
