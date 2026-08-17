/**
 * 搜索（对齐安卓 SearchScreen.kt）：防抖搜索 + 高级筛选(金额/日期/类型) + 结果列表。
 */
import router from '@ohos.router';
import * as Api from '../common/api/Api';
import { ApiError } from '../common/http/Http';
import { COLORS } from '../common/theme';
import { TopBar, EmptyState, LoadingBox, TransactionRow } from '../common/components/Components';
import { TransactionItem } from '../common/models';

interface Iface1 {
  key: string;
  label: string;
}

interface SearchParams {
  limit: number;
  search?: string;
  minAmount?: number;
  maxAmount?: number;
  startDate?: string;
  endDate?: string;
  types?: string;
}

const TYPE_OPTS: Iface1[] = [
  { key: 'income', label: '收入' },
  { key: 'expense', label: '支出' },
  { key: 'transfer', label: '转账' }
];

@Entry
@Component
struct SearchEntry {
  @StorageProp('themeMode') themeMode: string = 'system';
  @State kw: string = '';
  @State results: TransactionItem[] = [];
  @State loading: boolean = false;
  @State showFilter: boolean = false;
  @State minAmt: string = '';
  @State maxAmt: string = '';
  @State startD: string = '';
  @State endD: string = '';
  @State types: string[] = [];
  private debounce: number = 0;

  aboutToAppear(): void { this.doSearch(); }

  onKw(v: string): void {
    this.kw = v;
    clearTimeout(this.debounce);
    this.debounce = setTimeout(() => this.doSearch(), 350);
  }

  toggleType(k: string): void {
    if (this.types.includes(k)) this.types = this.types.filter(x => x !== k);
    else this.types = [...this.types, k];
  }

  async doSearch(): Promise<void> {
    this.loading = true;
    try {
      const params: SearchParams = { limit: 100 };
      if (this.kw) params.search = this.kw;
      if (this.minAmt) params.minAmount = Number(this.minAmt);
      if (this.maxAmt) params.maxAmount = Number(this.maxAmt);
      if (this.startD) params.startDate = this.startD;
      if (this.endD) params.endDate = this.endD;
      if (this.types.length) params.types = this.types.join(',');
      const r = await Api.getTransactions(params as ESObject as Record<string, Object>);
      if (r.success) this.results = r.data || [];
    } catch (e) { console.error('Search:', (e as ApiError).message); }
    finally { this.loading = false; }
  }

  build() {
    Column() {
      TopBar({ title: '搜索' })
      Row({ space: 8 }) {
        Row({ space: 6 }) {
          Text('🔍').fontSize(16)
          TextInput({ placeholder: '输入关键词搜索账单', text: this.kw })
            .layoutWeight(1).backgroundColor('#00000000').onChange((v: string) => this.onKw(v))
        }.layoutWeight(1).padding({ left: 12, right: 8 }).backgroundColor(COLORS.brandBgLight).borderRadius(20)
        Text('筛选').fontSize(14).fontColor(this.types.length || this.minAmt || this.maxAmt || this.startD || this.endD ? COLORS.teal : COLORS.textSecondary)
          .padding({ right: 12 }).onClick(() => this.showFilter = true)
      }.width('100%').padding({ top: 8, bottom: 8 })

      if (this.loading) { LoadingBox() }
      else if (this.results.length === 0) {
        EmptyState({ icon: '🔍', text: this.kw || '请输入关键词进行搜索~' })
      } else {
        Scroll() {
          Column({ space: 8 }) {
            ForEach(this.results, (it: TransactionItem) => {
              TransactionRow({ item: it, onItemClick: () => router.pushUrl({ url: 'pages/AddTransaction', params: { editId: it.id } }) })
            }, (it: TransactionItem) => it.id.toString())
            Blank().height(20)
          }.padding(12)
        }.layoutWeight(1)
      }
      if (this.showFilter) {
        Column() {
          Column().layoutWeight(1).backgroundColor('#00000066').onClick(() => this.showFilter = false)
          Column({ space: 12 }) {
            Text('高级筛选').fontSize(16).fontWeight(FontWeight.Bold)
            TextInput({ placeholder: '最低金额', text: this.minAmt }).type(InputType.Number).onChange((v: string) => this.minAmt = v)
            TextInput({ placeholder: '最高金额', text: this.maxAmt }).type(InputType.Number).onChange((v: string) => this.maxAmt = v)
            TextInput({ placeholder: '起始日期 YYYY-MM-DD', text: this.startD }).onChange((v: string) => this.startD = v)
            TextInput({ placeholder: '结束日期 YYYY-MM-DD', text: this.endD }).onChange((v: string) => this.endD = v)
            Row({ space: 8 }) {
              ForEach(TYPE_OPTS, (t: ESObject) => {
                Text(t.label).fontSize(13).padding({ left: 12, right: 12, top: 6, bottom: 6 })
                  .backgroundColor(this.types.includes(t.key) ? COLORS.brand : COLORS.brandBgLight)
                  .fontColor(this.types.includes(t.key) ? '#FFFFFF' : COLORS.textPrimary)
                  .borderRadius(14).onClick(() => this.toggleType(t.key))
              })
            }
            Button('应用筛选').width('100%').onClick(() => { this.showFilter = false; this.doSearch(); })
            Button('取消').width('100%').backgroundColor(COLORS.divider).onClick(() => this.showFilter = false)
          }.width('100%').backgroundColor(COLORS.card).borderRadius({ topLeft: 16, topRight: 16 }).padding(20).constraintSize({ maxHeight: '85%' })
        }.width('100%').height('100%').position({ x: 0, y: 0 }).zIndex(20)
      }
    }.width('100%').height('100%').backgroundColor(COLORS.pageBg)
  }
}
