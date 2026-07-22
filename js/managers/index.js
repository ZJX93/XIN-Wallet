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

// app.js 是经典 script（非 module），所有函数自动在 window 上，直接用
const boot = window.boot;
const initCache = window.initCache;

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
// 实际 boot() 在 ../app.js 中定义（含所有 init 顺序和路由恢复逻辑）
// 这里把它挂到 DOMContentLoaded 上即可——app.js 已经不再自己绑事件
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => boot());
} else {
    boot();
}
