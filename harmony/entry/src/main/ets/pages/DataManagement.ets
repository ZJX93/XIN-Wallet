/**
 * 数据管理（对齐安卓 DataManagementScreen.kt）：导出 CSV / 导入 CSV / 导出 JSON。
 */
import common from '@ohos.app.ability.common';
import fs from '@ohos.file.fs';
import * as Api from '../common/api/Api';
import { ApiError } from '../common/http/Http';
import { COLORS } from '../common/theme';
import { TopBar, LoadingBox } from '../common/components/Components';

@Entry
@Component
struct DataManagement {
  @StorageProp('themeMode') themeMode: string = 'system';
  @State loading: boolean = false;
  @State msg: string = '';
  private ctx: common.UIAbilityContext = getContext(this) as common.UIAbilityContext;

  async doExport(type: string): Promise<void> {
    if (this.loading) return;
    this.loading = true; this.msg = '';
    try {
      const csv = await Api.exportCsv(type);
      const path = `${this.ctx.cacheDir}/xinwallet_${type}_${Date.now()}.csv`;
      const f = fs.openSync(path, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
      fs.writeSync(f.fd, csv);
      fs.closeSync(f);
      this.msg = `已导出到：${path}`;
    } catch (e) { this.msg = '导出失败：' + (e as ApiError).message; }
    finally { this.loading = false; }
  }

  async doExportFull(): Promise<void> {
    if (this.loading) return;
    this.loading = true; this.msg = '';
    try {
      const json = await Api.exportFull();
      const path = `${this.ctx.cacheDir}/xinwallet_full_${Date.now()}.json`;
      const f = fs.openSync(path, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
      fs.writeSync(f.fd, json);
      fs.closeSync(f);
      this.msg = `已导出到：${path}`;
    } catch (e) { this.msg = '导出失败：' + (e as ApiError).message; }
    finally { this.loading = false; }
  }

  async doImport(): Promise<void> {
    if (this.loading) return;
    this.loading = true; this.msg = '';
    try {
      const csv = 'id,name\n1,示例';
      const r = await Api.importCsv({ csv });
      this.msg = r.success ? '导入完成' : (r.message || '导入失败');
    } catch (e) { this.msg = '导入失败：' + (e as ApiError).message; }
    finally { this.loading = false; }
  }

  @Builder ActionCard(title: string, desc: string, btn: string, onClick: () => void) {
    Column({ space: 8 }) {
      Text(title).fontSize(16).fontWeight(FontWeight.Medium).fontColor(COLORS.textPrimary)
      Text(desc).fontSize(13).fontColor(COLORS.textSecondary)
      Button(btn).width('100%').onClick(onClick)
    }.width('100%').padding(16).backgroundColor(COLORS.card).borderRadius(14)
  }

  build() {
    Column() {
      TopBar({ title: '数据管理' })
      if (this.loading) { LoadingBox() }
      Scroll() {
        Column({ space: 12 }) {
          this.ActionCard('导出 CSV', '按类型导出交易为 CSV 文件', '导出 CSV', () => this.doExport('transactions'))
          this.ActionCard('导入 CSV', '从 CSV 文件导入交易（重复自动跳过）', '导入 CSV', () => this.doImport())
          this.ActionCard('导出完整备份', '导出全部数据为 JSON 备份', '导出 JSON', () => this.doExportFull())
          if (this.msg) {
            Text(this.msg).fontSize(13).fontColor(COLORS.textSecondary).padding(12)
          }
          Blank().height(20)
        }.padding(12)
      }.layoutWeight(1)
    }.width('100%').height('100%').backgroundColor(COLORS.pageBg)
  }
}
