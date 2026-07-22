/* ============================================
   鑫钱包 · 应用引导模块 (Boot)
   负责注册路由切换、各 Manager 的初始化顺序
   ============================================ */

// 统一通过 ES Module 导入所有 Manager（utils.js 已在 index.html 中先加载，注入 window 全局）
import ThemeManager from './theme.js';
import AccountManager from './account.js';
import TransferManager from './transfer.js';
import TransactionManager from './transaction.js';
import BudgetManager from './budget.js';
import InvestmentManager from './investment.js';
import DebtManager from './debt.js';
import TagManager from './tag.js';
import DataManager from './data.js';
import SavingsGoalManager from './savings.js';
import CsvManager from './csv.js';
import AIRecognition from './ai-recognition.js';
import AIProviderManager from './ai-provider.js';
import ReportManager from './report.js';
import QuickAdd from './quick-add.js';
import AnalysisManager from './analysis.js';
import DashboardManager from './dashboard.js';
import ChartManager from './chart.js';

// app.js 中残留的辅助函数（initCache、switchPage 等）通过 import 引入
import { initCache, switchPage, pageUrl, showPage, currentRoute, PAGE_META } from '../app.js';

// 把导入的 Manager 挂到全局，让 app.js 中残留的内联调用仍能访问
window.ThemeManager = ThemeManager;
window.AccountManager = AccountManager;
window.TransferManager = TransferManager;
window.TransactionManager = TransactionManager;
window.BudgetManager = BudgetManager;
window.InvestmentManager = InvestmentManager;
window.DebtManager = DebtManager;
window.TagManager = TagManager;
window.DataManager = DataManager;
window.SavingsGoalManager = SavingsGoalManager;
window.CsvManager = CsvManager;
window.AIRecognition = AIRecognition;
window.AIProviderManager = AIProviderManager;
window.ReportManager = ReportManager;
window.QuickAdd = QuickAdd;
window.AnalysisManager = AnalysisManager;
window.DashboardManager = DashboardManager;
window.ChartManager = ChartManager;

// ==========================================
// 应用启动
// ==========================================
async function boot() {
    console.log('🚀 鑫钱包启动...');
    await initCache();
    ThemeManager.init();
    AccountManager.init();
    TransferManager.init();
    TransactionManager.init();
    BudgetManager.init();
    InvestmentManager.init();
    DebtManager.init();
    TagManager.init();
    DataManager.init();
    SavingsGoalManager.init();
    CsvManager.init();
    AIRecognition.init();
    AIProviderManager.init();
    ReportManager.init();
    QuickAdd.init();
    DashboardManager.init();

    // 从 URL path 恢复页面状态（干净路由：/transactions）
    const page = currentRoute();
    const validPages = Object.keys(PAGE_META);
    if (validPages.includes(page)) {
        history.replaceState({ page }, '', pageUrl(page));
        showPage(page);
    } else {
        history.replaceState({ page: 'dashboard' }, '', pageUrl('dashboard'));
        showPage('dashboard');
    }
    console.log('✅ 鑫钱包系统已就绪');
}

export { boot };
