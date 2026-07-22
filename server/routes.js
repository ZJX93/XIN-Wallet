/* ============================================
   鑫钱包 · Express API Routes (模块化入口)
   所有子路由模块位于 routes/ 目录下。
   本文件仅负责注册鉴权中间件与挂载子模块，不含业务逻辑。
   ============================================ */

const express = require('express');
const { authMiddleware } = require('./auth');
const quoteCache = require('./services/quote-cache');

const router = express.Router();

// ==========================================
// 公开路由：认证（无需鉴权）
// ==========================================
const authRoutes = require('./routes/auth');
router.use('/auth', authRoutes);

// ==========================================
// 受保护路由统一鉴权
// ==========================================
router.use((req, res, next) => {
    if (req.path.startsWith('/auth/')) return next();
    return authMiddleware(req, res, next);
});

// ==========================================
// 业务路由模块（按域拆分的路由）
// ==========================================
router.use('/accounts', require('./routes/accounts'));
router.use('/ai', require('./routes/ai'));
router.use('/transfers', require('./routes/transfers'));
router.use('/', require('./routes/transactions'));   // /transactions, /transactions/months, /transactions/summary, /ledger
router.use('/budgets', require('./routes/budgets'));
router.use('/reports', require('./routes/reports'));
router.use('/investment-types', require('./routes/investments'));   // 路由内部已包含前缀
router.use('/investments', require('./routes/investments'));
router.use('/stats', require('./routes/stats'));
router.use('/categories', require('./routes/categories'));
router.use('/tags', require('./routes/tags'));
router.use('/savings-goals', require('./routes/savings'));
router.use('/debts', require('./routes/debts'));
router.use('/', require('./routes/csv'));   // /export/csv, /import/csv, /export/full, /import/full

// ==========================================
// 导出
// ==========================================
module.exports = router;
