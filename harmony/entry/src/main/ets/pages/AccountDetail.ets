/**
 * 账户详情（对齐安卓 AccountDetailScreen.kt）：当前余额 + 交易记录。
 */
import router from '@ohos.router';
import * as Api from '../common/api/Api';
import { ApiError } from '../common/http/Http';
import { COLORS, fmtMoney } from '../common/theme';
import { Account, TransactionItem } from '../common/models';
import { BalanceCard, LoadingBox, EmptyState, TransactionRow, TopBar, CategoryIcon } from '../common/components/Components';

@Component
export struct AccountDetailPage {
  id: number = 0;
  @State account: Account | null = null;
  @State txs: TransactionItem[] = [];
  @State loading: boolean = false;

  aboutToAppear(): void { this.load(); }

  async load(): Promise<void> {
    this.loading = true;
    try {
      const [a, t] = await Promise.all([
        Api.getAccounts(),
        Api.getTransactions({ account_id: this.id, limit: 200 })
      ]);
      if (a.success && a.data) {
        this.account = (a.data.accounts || []).find((x: Account) => x.id === this.id) || null;
      }
      if (t.success) this.txs = t.data || [];
    } catch (e) { console.error('AccountDetail:', (e as ApiError).message); }
    finally { this.loading = false; }
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
              subtitle: `${this.account?.type ?? ''}${this.account?.credit_limit ? ' · 额度 ' + fmtMoney(this.account.credit_limit) : ''}`
            })
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
    }.width('100%').height('100%').backgroundColor(COLORS.pageBg)
  }
}

@Entry
@Component
struct AccountDetail {
  @State page: AccountDetailPage = new AccountDetailPage();
  aboutToAppear(): void {
    const p: any = (router.getParams() as any) || {};
    if (p.id) this.page.id = p.id;
  }
  build() {
    Column() { this.page }.width('100%').height('100%')
  }
}
