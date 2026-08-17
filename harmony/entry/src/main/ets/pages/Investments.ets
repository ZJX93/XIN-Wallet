/**
 * 理财（对齐安卓 InvestmentsScreen.kt）：总市值 + 按类型分组列表。
 */
import router from '@ohos.router';
import * as Api from '../common/api/Api';
import { ApiError } from '../common/http/Http';
import { COLORS, fmtMoney } from '../common/theme';
import { BalanceCard, SectionTitle, EmptyState, LoadingBox, CategoryIcon, TopBar } from '../common/components/Components';

interface Iface1 {
  type: string;
  list: Inv[];
}

interface Inv {
  id: number; name: string; code?: string; type?: string; accountId?: number;
  buyPrice?: number; currentPrice?: number; quantity?: number;
  cost?: number; currentValue?: number; profit?: number; profitRate?: number; icon?: string;
}

const TYPES: string[] = ['股票', '基金', '数字货币', '债券', '其他'];

@Component
export struct InvestmentsPage {
  @StorageProp('themeMode') themeMode: string = 'system';
  @State list: Inv[] = [];
  @State totalValue: number = 0;
  @State totalCost: number = 0;
  @State totalProfit: number = 0;
  @State loading: boolean = false;

  aboutToAppear(): void { this.load(); }

  async load(): Promise<void> {
    this.loading = false;
    try {
      const r = await Api.getInvestments();
      const arr: ESObject[] = ((r.data as ESObject)?.investments as ESObject[]) || [];
      this.list = arr as Inv[];
      this.totalValue = arr.reduce((s: number, x: Inv) => s + (x.currentValue || 0), 0);
      this.totalCost = arr.reduce((s: number, x: Inv) => s + (x.cost || 0), 0);
      this.totalProfit = this.totalValue - this.totalCost;
    } catch (e) { console.error('Investments:', (e as ApiError).message); }
  }

  grouped(): Iface1[] {
    const map = new Map<string, Inv[]>();
    this.list.forEach(x => {
      const t = x.type || '其他';
      if (!map.has(t)) map.set(t, []);
      map.get(t)!.push(x);
    });
    const res: Iface1[] = [];
    TYPES.forEach(t => { if (map.has(t)) res.push({ type: t, list: map.get(t)! }); });
    map.forEach((l, t) => { if (!TYPES.includes(t)) res.push({ type: t, list: l }); });
    return res;
  }

  build() {
    Column() {
      TopBar({ title: '理财' })
      if (this.loading) { LoadingBox() }
      else {
        Scroll() {
          Column({ space: 12 }) {
            BalanceCard({
              title: '理财总市值',
              amount: this.totalValue,
              subtitle: `总成本 ${fmtMoney(this.totalCost)} · 总收益 ${fmtMoney(this.totalProfit)}`
            })
            if (this.list.length === 0) { EmptyState({ text: '暂无理财持仓' }) }
            else {
              ForEach(this.grouped(), (g: ESObject) => {
                Column({ space: 6 }) {
                  SectionTitle({ text: g.type })
                  ForEach(g.list, (x: Inv) => {
                    Row({ space: 12 }) {
                      CategoryIcon({ icon: x.icon || '📈', iconSize: 40 })
                      Column() {
                        Text(x.name).fontSize(15).fontColor(COLORS.textPrimary)
                        if (x.code) Text(x.code).fontSize(11).fontColor(COLORS.textSecondary)
                      }.layoutWeight(1).alignItems(HorizontalAlign.Start)
                      Column() {
                        Text(fmtMoney(x.currentValue || 0)).fontSize(15).fontWeight(FontWeight.Medium)
                        Text(`${(x.profit || 0) >= 0 ? '+' : ''}${fmtMoney(x.profit || 0)} (${((x.profitRate || 0) * 100).toFixed(2)}%)`)
                          .fontSize(11).fontColor((x.profit || 0) >= 0 ? COLORS.expense : COLORS.income)
                      }.alignItems(HorizontalAlign.End)
                    }.width('100%').padding({ top: 12, bottom: 12 }).backgroundColor(COLORS.card).borderRadius(12)
                      .onClick(() => router.pushUrl({ url: 'pages/InvestmentDetail', params: { id: x.id } }))
                  }, (x: Inv) => x.id.toString())
                }
              }, (g: ESObject) => g.type)
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
struct Investments {
  build() { Column() { InvestmentsPage() }.width('100%').height('100%') }
}
