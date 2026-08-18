/**
 * 理财交易记录（对齐安卓 InvestmentTransactionsScreen.kt）：展示某产品的买入/卖出/分红等流水。
 */
import router from '@ohos.router';
import * as Api from '../common/api/Api';
import { ApiError } from '../common/http/Http';
import { COLORS, fmtMoney } from '../common/theme';
import { LoadingBox, TopBar } from '../common/components/Components';

interface Tx {
  id: number; type: string; type_label?: string; amount?: number; price?: number;
  quantity?: number; fee?: number; date?: string; note?: string;
}

@Entry
@Component
struct InvestmentTransactions {
  @State itemId: number = 0;
  @State name: string = '';
  @State list: Tx[] = [];
  @State loading: boolean = true;

  aboutToAppear(): void {
    const p: ESObject = (router.getParams() as ESObject) || {};
    if (p.id) this.itemId = p.id;
    this.load();
  }

  async load(): Promise<void> {
    this.loading = true;
    try {
      const r = await Api.getInvestments();
      const arr: ESObject[] = ((r.data as ESObject)?.investments as ESObject[]) || [];
      const inv = arr.find((x: ESObject) => x.id === this.itemId);
      if (inv) this.name = inv.name || '理财';

      const tx: ESObject = await Api.getInvestmentTransactions(this.itemId);
      const rows: ESObject[] = (tx.data as ESObject[]) || [];
      this.list = rows as Tx[];
    } catch (e) { console.error('InvTxns:', (e as ApiError).message); }
    finally { this.loading = false; }
  }

  isIncome(t: string): boolean {
    return t === 'sell' || t === 'dividend' || t === 'interest';
  }

  @Builder TxRow(tx: Tx) {
    const income = this.isIncome(tx.type);
    const color = income ? COLORS.income : COLORS.expense;
    Row({ space: 12 }) {
      Column({ space: 4 }) {
        Row({ space: 8 }) {
          Text(tx.type_label || tx.type).fontSize(13).fontColor(color).fontWeight(FontWeight.Medium)
            .backgroundColor(color + '22').borderRadius(4).padding({ left: 8, right: 8, top: 2, bottom: 2 })
          Text((tx.date || '').slice(0, 10)).fontSize(11).fontColor(COLORS.textSecondary)
        }
        Text(`单价 ${fmtMoney(tx.price || 0)} · 数量 ${tx.quantity ?? 0} · 手续费 ${fmtMoney(tx.fee || 0)}`)
          .fontSize(11).fontColor(COLORS.textSecondary)
        // 系统自动备注文案不再展示
        const SYS_NOTES: string[] = ['初始买入', '加仓', '部分卖出', '清仓卖出', '建仓'];
        const noteText: string = (tx.note && !SYS_NOTES.includes(tx.note)) ? ('📝 ' + tx.note) : '';
        if (noteText.length > 0) Text(noteText).fontSize(11).fontColor(COLORS.textSecondary)
      }.layoutWeight(1).alignItems(HorizontalAlign.Start)
      Text(`${income ? '+' : '-'}${fmtMoney(Math.abs(tx.amount || 0))}`)
        .fontSize(15).fontWeight(FontWeight.SemiBold).fontColor(color)
    }.width('100%').padding(12).backgroundColor(COLORS.card).borderRadius(12)
  }

  build() {
    Column() {
      TopBar({ title: `${this.name} · 交易记录`, onBack: () => router.back() })
      if (this.loading) { LoadingBox() }
      else if (this.list.length === 0) {
        Column() { Text('暂无交易记录').fontSize(14).fontColor(COLORS.textSecondary) }
          .width('100%').layoutWeight(1).justifyContent(FlexAlign.Center)
      }
      else {
        Scroll() {
          Column({ space: 10 }) {
            ForEach(this.list, (tx: Tx) => {
              this.TxRow(tx)
            }, (tx: Tx) => tx.id.toString())
            Blank().height(20)
          }.padding(12)
        }.layoutWeight(1)
      }
    }.width('100%').height('100%').backgroundColor(COLORS.pageBg)
  }
}
