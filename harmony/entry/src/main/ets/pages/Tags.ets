/**
 * 标签管理（对齐安卓 TagsScreen.kt）：彩色圆 + 名称 + 新增/编辑/删除。
 */
import router from '@ohos.router';
import * as Api from '../common/api/Api';
import { ApiError } from '../common/http/Http';
import { COLORS } from '../common/theme';
import { TopBar, EmptyState, LoadingBox, CategoryIcon } from '../common/components/Components';

const PALETTE: string[] = ['#995F2C', '#C11435', '#009558', '#4DD0C4', '#E54D42', '#7E57C2', '#F9A825', '#26A69A', '#5C6BC0', '#EC407A'];
const ICONS: string[] = ['🏷️', '⭐', '🔥', '💡', '🎯', '❤️', '🌟', '⚡', '🌈', '🍀', '📌', '✅'];

interface TagItem { id: number; name: string; icon?: string; color?: string; }

@Component
export struct TagPage {
  @State tags: TagItem[] = [];
  @State loading: boolean = false;
  @State showEdit: boolean = false;
  @State editingId: number = 0;
  @State fName: string = '';
  @State fIcon: string = '🏷️';
  @State fColor: string = '#995F2C';

  aboutToAppear(): void { this.load(); }

  async load(): Promise<void> {
    this.loading = false;
    try {
      const r = await Api.getTags();
      if (r.success) this.tags = r.data as TagItem[] || [];
    } catch (e) { console.error('Tags:', (e as ApiError).message); }
  }

  openAdd(): void { this.editingId = 0; this.fName = ''; this.fIcon = '🏷️'; this.fColor = '#995F2C'; this.showEdit = true; }
  openEdit(t: TagItem): void { this.editingId = t.id; this.fName = t.name; this.fIcon = t.icon || '🏷️'; this.fColor = t.color || '#995F2C'; this.showEdit = true; }

  async save(): Promise<void> {
    if (!this.fName) return;
    const req = { name: this.fName, icon: this.fIcon, color: this.fColor };
    try {
      if (this.editingId) await Api.updateTag(this.editingId, req);
      else await Api.createTag(req);
      this.showEdit = false;
      this.load();
    } catch (e) { /* ignore */ }
  }
  async remove(t: TagItem): Promise<void> {
    try { await Api.deleteTag(t.id); this.load(); } catch (e) { /* ignore */ }
  }

  @Builder EditSheet() {
    Column({ space: 12 }) {
      Text(this.editingId ? '编辑标签' : '新建标签').fontSize(16).fontWeight(FontWeight.Bold)
      TextInput({ placeholder: '标签名称', text: this.fName }).onChange((v: string) => this.fName = v)
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
      TopBar({ title: '标签' })
      if (this.loading) { LoadingBox() }
      else {
        Scroll() {
          Column({ space: 8 }) {
            if (this.tags.length === 0) {
              EmptyState({ text: '还没有标签，点右下角 + 新建一个' })
            } else {
              ForEach(this.tags, (t: TagItem) => {
                Row({ space: 12 }) {
                  CategoryIcon({ icon: t.icon || '🏷️', bg: t.color || COLORS.brandBgLight, size: 40 })
                  Text(t.name).fontSize(15).layoutWeight(1).fontColor(COLORS.textPrimary)
                  Row({ space: 14 }) {
                    Text('✎').fontSize(16).fontColor(COLORS.textSecondary).onClick(() => this.openEdit(t))
                    Text('🗑').fontSize(16).fontColor(COLORS.danger).onClick(() => this.remove(t))
                  }
                }.width('100%').padding({ top: 10, bottom: 10 }).backgroundColor(COLORS.card).borderRadius(12)
              }, (t: TagItem) => t.id.toString())
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
struct Tags {
  @State page: TagPage = new TagPage();
  build() { Column() { this.page }.width('100%').height('100%') }
}
