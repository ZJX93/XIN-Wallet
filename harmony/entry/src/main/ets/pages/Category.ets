/**
 * 分类管理（对齐安卓 CategoryScreen.kt）：按类型分组 + 系统预设锁 + 新增/编辑。
 */
import router from '@ohos.router';
import * as Api from '../common/api/Api';
import { ApiError } from '../common/http/Http';
import { COLORS } from '../common/theme';
import { Category } from '../common/models';
import { SectionTitle, EmptyState, LoadingBox, CategoryIcon, TopBar } from '../common/components/Components';

const TYPES: { key: string; label: string }[] = [
  { key: 'expense', label: '支出' },
  { key: 'income', label: '收入' },
  { key: 'transfer', label: '转账' }
];
const ICONS: string[] = ['🍚', '🚗', '🛒', '🎮', '💡', '🏠', '👕', '💊', '✈️', '📱', '🎓', '🎁', '🍜', '☕', '🐱', '🏥'];
const PALETTE: string[] = ['#995F2C', '#C11435', '#009558', '#4DD0C4', '#E54D42', '#7E57C2', '#F9A825', '#26A69A', '#5C6BC0', '#EC407A'];

@Component
export struct CategoryPage {
  @State cats: Category[] = [];
  @State loading: boolean = false;
  @State showEdit: boolean = false;
  @State editing: Category | null = null;
  @State fName: string = '';
  @State fType: string = 'expense';
  @State fIcon: string = '🍚';
  @State fColor: string = '#995F2C';

  aboutToAppear(): void { this.load(); }

  async load(): Promise<void> {
    this.loading = false;
    try {
      const r = await Api.getCategories();
      if (r.success) this.cats = r.data || [];
    } catch (e) { console.error('Category:', (e as ApiError).message); }
  }

  grouped(key: string): Category[] {
    return this.cats.filter(c => (c.type || 'expense') === key);
  }

  openAdd(): void {
    this.editing = null;
    this.fName = ''; this.fType = 'expense'; this.fIcon = '🍚'; this.fColor = '#995F2C';
    this.showEdit = true;
  }
  openEdit(c: Category): void {
    this.editing = c;
    this.fName = c.name; this.fType = c.type; this.fIcon = c.icon || '🍚'; this.fColor = c.color || '#995F2C';
    this.showEdit = true;
  }

  async save(): Promise<void> {
    if (!this.fName) return;
    const req = { name: this.fName, type: this.fType, icon: this.fIcon, color: this.fColor };
    try {
      if (this.editing) await Api.updateCategory(this.editing.id, req);
      else await Api.createCategory(req);
      this.showEdit = false;
      this.load();
    } catch (e) { /* ignore */ }
  }

  async remove(c: Category): Promise<void> {
    try { await Api.deleteCategory(c.id); this.load(); } catch (e) { /* ignore */ }
  }

  @Builder EditSheet() {
    Column({ space: 12 }) {
      Text(this.editing ? '编辑分类' : '新增分类').fontSize(16).fontWeight(FontWeight.Bold)
      TextInput({ placeholder: '分类名称', text: this.fName }).onChange((v: string) => this.fName = v)
      Row({ space: 8 }) {
        Text('类型').fontSize(14).fontColor(COLORS.textSecondary)
        ForEach(TYPES, (t: any) => {
          Text(t.label).fontSize(13).padding({ left: 12, right: 12, top: 6, bottom: 6 })
            .backgroundColor(this.fType === t.key ? COLORS.brand : COLORS.brandBgLight)
            .fontColor(this.fType === t.key ? '#FFFFFF' : COLORS.textPrimary)
            .borderRadius(14).onClick(() => this.fType = t.key)
        })
      }
      Row({ space: 6 }) {
        ForEach(ICONS, (ic: string) => {
          Text(ic).fontSize(20).padding(6)
            .backgroundColor(this.fIcon === ic ? COLORS.brandBgLight : '#00000000')
            .borderRadius(8).onClick(() => this.fIcon = ic)
        })
      }
      Row({ space: 6 }) {
        ForEach(PALETTE, (c: string) => {
          Column().width(28).height(28).backgroundColor(c).borderRadius(14)
            .border({ width: this.fColor === c ? 2 : 0, color: COLORS.textPrimary })
            .onClick(() => this.fColor = c)
        })
      }
      Button('保存').width('100%').onClick(() => this.save())
      Button('取消').width('100%').backgroundColor(COLORS.divider).onClick(() => this.showEdit = false)
    }
  }

  build() {
    Column() {
      TopBar({ title: '分类管理' })
      if (this.loading) { LoadingBox() }
      else {
        Scroll() {
          Column({ space: 12 }) {
            ForEach(TYPES, (t: any) => {
              Column({ space: 6 }) {
                SectionTitle({ text: t.label })
                if (this.grouped(t.key).length === 0) {
                  EmptyState({ text: '暂无分类' })
                } else {
                  ForEach(this.grouped(t.key), (c: Category) => {
                    Row({ space: 12 }) {
                      CategoryIcon({ icon: c.icon || '📌', bg: c.color || COLORS.brandBgLight, size: 40 })
                      Text(c.name).fontSize(15).layoutWeight(1).fontColor(COLORS.textPrimary)
                      if (c.is_system) {
                        Text('🔒').fontSize(16)
                      } else {
                        Row({ space: 14 }) {
                          Text('✎').fontSize(16).fontColor(COLORS.textSecondary).onClick(() => this.openEdit(c))
                          Text('🗑').fontSize(16).fontColor(COLORS.danger).onClick(() => this.remove(c))
                        }
                      }
                    }.width('100%').padding({ top: 10, bottom: 10 }).backgroundColor(COLORS.card).borderRadius(12)
                  }, (c: Category) => c.id.toString())
                }
              }
            }, (t: any) => t.key)
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
struct Category {
  @State page: CategoryPage = new CategoryPage();
  build() { Column() { this.page }.width('100%').height('100%') }
}
