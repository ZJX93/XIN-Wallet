/**
 * 通用 UI 组件库（对齐安卓端 Material 组件）。
 * 所有组件以 @Component struct 形式导出，供各页面 import 后以 <Xxx .../> 使用。
 */
import { COLORS, fmtMoney } from '../theme';
import { TransactionItem } from '../models';

/** 顶部栏：标题 + 可选返回键（对齐安卓 TopBar） */
export struct TopBar {
  title: string = '';
  showBack: boolean = true;
  onBack?: () => void;
  build() {
    Row() {
      if (this.showBack) {
        Text('‹')
          .fontSize(28).fontColor(COLORS.textPrimary).width(32).textAlign(TextAlign.Center)
          .onClick(() => this.onBack && this.onBack())
      }
      Text(this.title)
        .fontSize(18).fontWeight(FontWeight.Bold).fontColor(COLORS.textPrimary)
        .layoutWeight(1).margin({ left: this.showBack ? 4 : 0 })
    }
    .width('100%')
    .height(52)
    .padding({ left: 12, right: 16 })
    .backgroundColor(COLORS.card)
  }
}

/** 区块标题（对齐 SectionTitle） */
export struct SectionTitle {
  text: string = '';
  build() {
    Text(this.text)
      .fontSize(15).fontWeight(FontWeight.Medium).fontColor(COLORS.textPrimary)
      .margin({ left: 4, top: 6, bottom: 4 })
  }
}

/** 金额卡（对齐 BalanceCard）：大标题 + 金额 + 副标题 */
export struct BalanceCard {
  title: string = '';
  amount: number = 0;
  subtitle: string = '';
  build() {
    Column({ space: 6 }) {
      Text(this.title).fontSize(14).fontColor(COLORS.textSecondary)
      Text(fmtMoney(this.amount)).fontSize(30).fontWeight(FontWeight.Bold).fontColor(COLORS.textPrimary)
      if (this.subtitle) {
        Text(this.subtitle).fontSize(12).fontColor(COLORS.textSecondary)
      }
    }
    .width('100%')
    .alignItems(HorizontalAlign.Start)
    .padding(16)
    .backgroundColor(COLORS.card)
    .borderRadius(14)
  }
}

/** 空状态（对齐 EmptyState） */
export struct EmptyState {
  icon: string = '🔍';
  text: string = '暂无数据';
  build() {
    Column({ space: 8 }) {
      Text(this.icon).fontSize(40)
      Text(this.text).fontSize(14).fontColor(COLORS.textSecondary)
    }
    .width('100%')
    .alignItems(HorizontalAlign.Center)
    .padding({ top: 60, bottom: 60 })
  }
}

/** 加载态 */
export struct LoadingBox {
  build() {
    Column() {
      LoadingProgress().width(32).height(32).color(COLORS.brand)
      Text('加载中...').fontSize(13).fontColor(COLORS.textSecondary).margin({ top: 8 })
    }
    .width('100%').alignItems(HorizontalAlign.Center).padding({ top: 60, bottom: 60 })
  }
}

/** 错误态（对齐 ErrorState + 重试） */
export struct ErrorState {
  message: string = '加载失败';
  onRetry?: () => void;
  build() {
    Column({ space: 10 }) {
      Text('⚠️').fontSize(36)
      Text(this.message).fontSize(14).fontColor(COLORS.textSecondary)
      if (this.onRetry) {
        Button('重试').height(36).onClick(() => this.onRetry!())
      }
    }
    .width('100%').alignItems(HorizontalAlign.Center).padding({ top: 60, bottom: 60 })
  }
}

/** 线性进度条（对齐 LinearProgress），value 0~1 */
export struct LinearProgress {
  value: number = 0;
  color: string = COLORS.brand;
  height: number = 6;
  build() {
    Stack() {
      Row().width(`${Math.max(0, Math.min(1, this.value)) * 100}%`).height('100%')
        .backgroundColor(this.color).borderRadius(this.height / 2)
    }.width('100%').height(this.height).backgroundColor(COLORS.divider).borderRadius(this.height / 2)
  }
}

/** 分类图标圆（对齐 CategoryIcon）：emoji + 可选底色 */
export struct CategoryIcon {
  icon: string = '📌';
  bg: string = COLORS.brandBgLight;
  size: number = 40;
  build() {
    Text(this.icon)
      .fontSize(this.size * 0.5)
      .width(this.size).height(this.size)
      .textAlign(TextAlign.Center)
      .backgroundColor(this.bg)
      .borderRadius(this.size / 2)
  }
}

/** 交易行（对齐 TransactionRow / TransactionRowClickable） */
export struct TransactionRow {
  item: TransactionItem = undefined;
  onClick?: () => void;
  build() {
    Row({ space: 12 }) {
      CategoryIcon({ icon: this.item?.category?.icon ?? '📌', size: 40 })
      Column() {
        Text(this.item?.category?.name ?? '未分类').fontSize(15).fontColor(COLORS.textPrimary)
        if (this.item?.note) {
          Text(this.item.note)
            .fontSize(12).fontColor(COLORS.textSecondary)
            .maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis })
        }
      }.layoutWeight(1).alignItems(HorizontalAlign.Start)

      Column() {
        Text((this.item?.type === 'income' ? '+' : '-') + fmtMoney(this.item?.amount ?? 0).replace('¥', ''))
          .fontSize(15).fontWeight(FontWeight.Medium)
          .fontColor(this.item?.type === 'income' ? COLORS.income : COLORS.expense)
        if (this.item?.account?.name) {
          Text(this.item.account.name).fontSize(11).fontColor(COLORS.textSecondary)
        }
      }.alignItems(HorizontalAlign.End)
    }
    .width('100%')
    .padding({ top: 12, bottom: 12 })
    .backgroundColor(COLORS.card)
    .onClick(() => this.onClick && this.onClick())
  }
}

/** 标准行项（设置/列表通用，左图标 + 标题 + 右值/箭头） */
export struct RowItem {
  icon: string = '';
  iconBg: string = COLORS.brandBgLight;
  title: string = '';
  value: string = '';
  showArrow: boolean = true;
  onClick?: () => void;
  build() {
    Row({ space: 12 }) {
      if (this.icon) {
        CategoryIcon({ icon: this.icon, bg: this.iconBg, size: 32 })
      }
      Text(this.title).fontSize(15).fontColor(COLORS.textPrimary).layoutWeight(1)
      if (this.value) {
        Text(this.value).fontSize(13).fontColor(COLORS.textSecondary)
      }
      if (this.showArrow) {
        Text('›').fontSize(20).fontColor(COLORS.placeholder)
      }
    }
    .width('100%')
    .padding({ top: 14, bottom: 14, left: 16, right: 16 })
    .backgroundColor(COLORS.card)
    .onClick(() => this.onClick && this.onClick())
  }
}
