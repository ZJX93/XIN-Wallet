-- ============================================
-- 鑫钱包 · PostgreSQL 数据库 Schema
-- 注意：本文件由 server/db.js 在 initDatabase() 中调用，数据库创建由 db.js 负责。
-- 所有 ENUM 已替换为 VARCHAR + CHECK；AUTO_INCREMENT 替换为 SERIAL；
-- INSERT IGNORE 替换为 ON CONFLICT DO NOTHING。
-- ============================================

-- updated_at 自动更新触发器函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  nickname VARCHAR(100),
  fail_count INT NOT NULL DEFAULT 0,
  locked_until TIMESTAMP NULL,
  last_fail_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
DROP TRIGGER IF EXISTS trg_users_updated ON users;
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 账户表
CREATE TABLE IF NOT EXISTS accounts (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL DEFAULT 1,
  name VARCHAR(50) NOT NULL,                          -- 账户名称
  type VARCHAR(30) NOT NULL CHECK (type IN ('cash','bank_card','credit_card','electronic_payment','financial_account','digital','other')),
  icon VARCHAR(10) DEFAULT '💰',                      -- 图标
  balance DECIMAL(15,2) NOT NULL DEFAULT 0,           -- 当前余额
  opening_balance DECIMAL(15,2) NOT NULL DEFAULT 0,   -- 期初余额（复式记账）
  credit_limit DECIMAL(15,2) DEFAULT 0,               -- 信用额度(信用卡)
  is_default BOOLEAN DEFAULT FALSE,                   -- 是否默认账户
  sort_order INT DEFAULT 0,
  status VARCHAR(10) DEFAULT 'active' CHECK (status IN ('active','closed')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts (user_id);
DROP TRIGGER IF EXISTS trg_accounts_updated ON accounts;
CREATE TRIGGER trg_accounts_updated BEFORE UPDATE ON accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 交易类别表
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  parent_id INT DEFAULT NULL,                         -- 父分类ID，NULL为一级分类
  user_id INT DEFAULT NULL,                           -- 所属用户ID（NULL=系统预设全局分类）
  name VARCHAR(50) NOT NULL,                          -- 类别名称
  type VARCHAR(10) NOT NULL CHECK (type IN ('expense','income','transfer')),
  icon VARCHAR(10) DEFAULT '📌',                      -- 图标
  color VARCHAR(10) DEFAULT '#6366f1',                -- 颜色
  sort_order INT DEFAULT 0,
  is_system BOOLEAN DEFAULT TRUE,                     -- 是否系统预设
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories (parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_user ON categories (user_id);
-- 防重复：同一父分类下名称唯一（支持 ON CONFLICT DO NOTHING 幂等插入）
ALTER TABLE categories ADD CONSTRAINT IF NOT EXISTS categories_parent_name_unique UNIQUE (parent_id, name);

-- 交易记录表
CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL DEFAULT 1,
  account_id INT NOT NULL,                            -- 关联账户
  category_id INT NOT NULL,                           -- 关联类别
  budget_id INT DEFAULT NULL,                         -- 关联预算（可选）
  type VARCHAR(15) NOT NULL CHECK (type IN ('expense','income','transfer_in','transfer_out')),
  amount DECIMAL(15,2) NOT NULL,                      -- 金额
  note VARCHAR(200) DEFAULT '',                       -- 备注
  date TIMESTAMP NOT NULL,                            -- 交易时间（精确到秒）
  transfer_id INT DEFAULT NULL,                       -- 关联转账ID
  source_account_id INT DEFAULT NULL,                 -- 复式记账-资金源账户
  destination_account_id INT DEFAULT NULL,            -- 复式记账-资金目标账户
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions (user_id, date);
CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions (account_id);
CREATE INDEX IF NOT EXISTS idx_account_date ON transactions (account_id, date);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions (category_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions (type);
CREATE INDEX IF NOT EXISTS idx_transactions_budget ON transactions (budget_id);
CREATE INDEX IF NOT EXISTS idx_tx_source ON transactions (source_account_id);
CREATE INDEX IF NOT EXISTS idx_tx_dest ON transactions (destination_account_id);
DROP TRIGGER IF EXISTS trg_transactions_updated ON transactions;
CREATE TRIGGER trg_transactions_updated BEFORE UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 内部转账记录表
CREATE TABLE IF NOT EXISTS transfers (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL DEFAULT 1,
  from_account_id INT NOT NULL,                       -- 转出账户
  to_account_id INT NOT NULL,                         -- 转入账户
  amount DECIMAL(15,2) NOT NULL,                      -- 转账金额
  note VARCHAR(200) DEFAULT '',                       -- 转账备注
  date TIMESTAMP NOT NULL,                            -- 转账时间
  status VARCHAR(10) DEFAULT 'completed' CHECK (status IN ('completed','pending','cancelled')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_transfers_user ON transfers (user_id);
CREATE INDEX IF NOT EXISTS idx_transfers_from ON transfers (from_account_id);
CREATE INDEX IF NOT EXISTS idx_transfers_to ON transfers (to_account_id);
DROP TRIGGER IF EXISTS trg_transfers_updated ON transfers;
CREATE TRIGGER trg_transfers_updated BEFORE UPDATE ON transfers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 预算表
CREATE TABLE IF NOT EXISTS budgets (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL DEFAULT 1,
  name VARCHAR(100) NOT NULL,                         -- 预算名称
  period_type VARCHAR(10) NOT NULL DEFAULT 'month' CHECK (period_type IN ('month','quarter','half','year')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, name, start_date, end_date)
);
DROP TRIGGER IF EXISTS trg_budgets_updated ON budgets;
CREATE TRIGGER trg_budgets_updated BEFORE UPDATE ON budgets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 理财产品类型表（全局共享，无 user_id）
-- is_system：系统预置类型标记，为 TRUE 时禁止普通用户 UPDATE/DELETE，
--            防止任意用户篡改全局类型影响其他所有用户。
CREATE TABLE IF NOT EXISTS investment_types (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  icon VARCHAR(10) DEFAULT '📈',
  risk_level VARCHAR(10) DEFAULT 'medium' CHECK (risk_level IN ('low','medium','high','very_high')),
  category VARCHAR(10) NOT NULL DEFAULT 'fund' CHECK (category IN ('fund','stock','deposit','other','hk_stock','us_stock','commodity','crypto','forex')),
  description VARCHAR(200) DEFAULT '',
  sort_order INT DEFAULT 0,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 理财持仓表
CREATE TABLE IF NOT EXISTS investments (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL DEFAULT 1,
  account_id INT DEFAULT NULL,                        -- 关联账户
  investment_type_id INT NOT NULL,                    -- 理财产品类型
  name VARCHAR(100) NOT NULL,
  code VARCHAR(50) DEFAULT '',                        -- 产品代码
  buy_price DECIMAL(15,4) NOT NULL DEFAULT 0,
  current_price DECIMAL(15,4) NOT NULL DEFAULT 0,
  quantity DECIMAL(15,4) NOT NULL DEFAULT 0,
  total_cost DECIMAL(15,2) NOT NULL DEFAULT 0,
  current_value DECIMAL(15,2) NOT NULL DEFAULT 0,
  fee DECIMAL(15,2) NOT NULL DEFAULT 0,
  buy_date DATE NOT NULL,
  expected_rate DECIMAL(8,4) DEFAULT 0,
  actual_rate DECIMAL(8,4) DEFAULT 0,
  nav_date DATE DEFAULT NULL,                         -- 净值日期
  status VARCHAR(10) DEFAULT 'holding' CHECK (status IN ('holding','sold','expired')),
  note VARCHAR(200) DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_investments_user ON investments (user_id);
CREATE INDEX IF NOT EXISTS idx_investments_type ON investments (investment_type_id);
CREATE INDEX IF NOT EXISTS idx_investments_status ON investments (status);
DROP TRIGGER IF EXISTS trg_investments_updated ON investments;
CREATE TRIGGER trg_investments_updated BEFORE UPDATE ON investments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 理财交易记录
CREATE TABLE IF NOT EXISTS investment_transactions (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL DEFAULT 1,
  investment_id INT NOT NULL,
  type VARCHAR(10) NOT NULL CHECK (type IN ('buy','sell','dividend','interest','fee')),
  amount DECIMAL(15,2) NOT NULL,
  price DECIMAL(15,4) DEFAULT 0,
  quantity DECIMAL(15,4) DEFAULT 0,
  date DATE NOT NULL,
  note VARCHAR(200) DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_inv_tx_investment ON investment_transactions (investment_id);

-- 理财净值快照
CREATE TABLE IF NOT EXISTS investment_snapshots (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL DEFAULT 1,
  investment_id INT NOT NULL,
  total_value DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_cost DECIMAL(15,2) NOT NULL DEFAULT 0,
  nav_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (investment_id, nav_date)
);
CREATE INDEX IF NOT EXISTS idx_snapshots_user_date ON investment_snapshots (user_id, nav_date);

-- ============================================
-- 插入默认数据
-- ============================================

-- 默认账户
INSERT INTO accounts (id, user_id, name, type, icon, balance, is_default, sort_order) VALUES
(1, 1, '现金', 'cash', '💵', 500.00, FALSE, 1),
(2, 1, '工商银行', 'bank_card', '🏦', 25000.00, TRUE, 2),
(3, 1, '招商银行', 'bank_card', '🏦', 18000.00, FALSE, 3),
(4, 1, '微信支付', 'electronic_payment', '💚', 3200.00, FALSE, 4),
(5, 1, '支付宝', 'electronic_payment', '🔵', 5000.00, FALSE, 5),
(6, 1, '信用卡', 'credit_card', '💳', 0.00, FALSE, 6)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 分类体系 v2：该合并合并、该拓展拓展
-- 15 个一级分类（10 支出 + 4 收入 + 1 转账）+ 54 个二级分类
-- 设计原则：
--   1. 按「消费场景」统一维度，不混入「支付对象/资产」
--   2. 高频场景有子类，低频不展开
--   3. 保留中国特色（社保、红包、孝敬父母、育儿亲子）
--   4. 参考 YNAB/钱迹/少数派/知乎 最佳实践
--   5. 缺失场景主动补齐（烟酒、牙科、知识付费、会员订阅、育儿亲子）
-- ============================================

-- ◆ 支出类别（一级 10 个）
INSERT INTO categories (id, name, type, icon, sort_order, is_system) VALUES
(1,  '餐饮',     'expense', '🍜', 1,  TRUE),
(2,  '交通出行', 'expense', '🚗', 2,  TRUE),
(3,  '购物消费', 'expense', '🛒', 3,  TRUE),
(4,  '居家生活', 'expense', '🏠', 4,  TRUE),
(5,  '休闲娱乐', 'expense', '🎮', 5,  TRUE),
(6,  '医疗健康', 'expense', '💊', 6,  TRUE),
(7,  '学习进修', 'expense', '📚', 7,  TRUE),
(9,  '人情往来', 'expense', '🎁', 8,  TRUE),
(14, '其他支出', 'expense', '📌', 99, TRUE)
ON CONFLICT (id) DO NOTHING;

-- 育儿亲子（id 不固定，让 SERIAL 自动分配）
INSERT INTO categories (name, type, icon, sort_order, is_system) VALUES
('育儿亲子', 'expense', '👶', 9, TRUE)
ON CONFLICT DO NOTHING;

-- ◆ 支出二级分类（44 个）
INSERT INTO categories (parent_id, name, type, icon, sort_order, is_system) VALUES
-- 餐饮（6 子类）
(1, '早午晚餐', 'expense', '🌅', 1, TRUE),
(1, '外卖小吃', 'expense', '🥡', 2, TRUE),
(1, '零食饮料', 'expense', '🧋', 3, TRUE),
(1, '烟酒',     'expense', '🍷', 4, TRUE),
(1, '聚餐请客', 'expense', '🍻', 5, TRUE),
(1, '生鲜食材', 'expense', '🥬', 6, TRUE),
-- 交通出行（6 子类）
(2, '公交地铁', 'expense', '🚌', 1, TRUE),
(2, '打车拼车', 'expense', '🚕', 2, TRUE),
(2, '加油充电', 'expense', '⛽', 3, TRUE),
(2, '停车过路', 'expense', '🅿️', 4, TRUE),
(2, '火车飞机', 'expense', '🚄', 5, TRUE),
(2, '维保车险', 'expense', '🔧', 6, TRUE),
-- 购物消费（4 子类）
(3, '日用百货', 'expense', '🧴', 1, TRUE),
(3, '服饰美容', 'expense', '👗', 2, TRUE),
(3, '数码电器', 'expense', '📱', 3, TRUE),
(3, '家居家具', 'expense', '🛋️', 4, TRUE),
-- 居家生活（7 子类）
(4, '房租月供', 'expense', '🏘️', 1, TRUE),
(4, '水电燃气', 'expense', '💡', 2, TRUE),
(4, '物业维修', 'expense', '🛠️', 3, TRUE),
(4, '话费宽带', 'expense', '📶', 4, TRUE),
(4, '社保保险', 'expense', '🛡️', 5, TRUE),
(4, '日用杂货', 'expense', '🧹', 6, TRUE),
(4, '快递邮寄', 'expense', '📦', 7, TRUE),
-- 休闲娱乐（6 子类）
(5, '电影演出', 'expense', '🎬', 1, TRUE),
(5, '游戏电竞', 'expense', '🎮', 2, TRUE),
(5, '运动健身', 'expense', '🏋️', 3, TRUE),
(5, '旅游度假', 'expense', '✈️', 4, TRUE),
(5, '宠物开销', 'expense', '🐾', 5, TRUE),
(5, '会员订阅', 'expense', '📺', 6, TRUE),
-- 医疗健康（4 子类）
(6, '门诊药品', 'expense', '💊', 1, TRUE),
(6, '体检住院', 'expense', '🏥', 2, TRUE),
(6, '牙科眼科', 'expense', '🦷', 3, TRUE),
(6, '保健养生', 'expense', '🌿', 4, TRUE),
-- 学习进修（3 子类）
(7, '培训考试', 'expense', '📝', 1, TRUE),
(7, '书本文具', 'expense', '📚', 2, TRUE),
(7, '知识付费', 'expense', '🎧', 3, TRUE),
-- 人情往来（4 子类）
(9, '孝敬父母', 'expense', '👴', 1, TRUE),
(9, '送礼红包', 'expense', '🧧', 2, TRUE),
(9, '慈善捐赠', 'expense', '💝', 3, TRUE),
(9, '请客招待', 'expense', '🍻', 4, TRUE)
ON CONFLICT DO NOTHING;

-- 育儿亲子二级分类（parent_id 用子查询动态获取，兼容不同环境 ID）
INSERT INTO categories (parent_id, name, type, icon, sort_order, is_system)
SELECT id, '奶粉尿布', 'expense', '🍼', 1, TRUE FROM categories WHERE name = '育儿亲子' AND parent_id IS NULL
ON CONFLICT DO NOTHING;
INSERT INTO categories (parent_id, name, type, icon, sort_order, is_system)
SELECT id, '玩具童书', 'expense', '🧸', 2, TRUE FROM categories WHERE name = '育儿亲子' AND parent_id IS NULL
ON CONFLICT DO NOTHING;
INSERT INTO categories (parent_id, name, type, icon, sort_order, is_system)
SELECT id, '学费培训', 'expense', '🎓', 3, TRUE FROM categories WHERE name = '育儿亲子' AND parent_id IS NULL
ON CONFLICT DO NOTHING;
INSERT INTO categories (parent_id, name, type, icon, sort_order, is_system)
SELECT id, '医疗保健', 'expense', '🏥', 4, TRUE FROM categories WHERE name = '育儿亲子' AND parent_id IS NULL
ON CONFLICT DO NOTHING;

-- ◆ 收入类别（一级 4 个）
INSERT INTO categories (id, name, type, icon, sort_order, is_system) VALUES
(15, '职业收入', 'income', '💼', 1,  TRUE),
(17, '被动收入', 'income', '📈', 2,  TRUE),
(18, '兼职副业', 'income', '💻', 3,  TRUE),
(21, '其他收入', 'income', '📌', 99, TRUE),
(22, '转账',     'transfer', '↔️', 1,  TRUE)
ON CONFLICT (id) DO NOTHING;

-- ◆ 收入二级分类（10 个）
INSERT INTO categories (parent_id, name, type, icon, sort_order, is_system) VALUES
-- 职业收入（3 子类）
(15, '工资薪水', 'income', '💰', 1, TRUE),
(15, '奖金绩效', 'income', '🏆', 2, TRUE),
(15, '补贴报销', 'income', '📋', 3, TRUE),
-- 被动收入（3 子类）
(17, '理财收益', 'income', '📊', 1, TRUE),
(17, '房租收入', 'income', '🏠', 2, TRUE),
(17, '分红利息', 'income', '💹', 3, TRUE),
-- 兼职副业（4 子类）
(18, '自由职业',   'income', '🎨', 1, TRUE),
(18, '咨询服务',   'income', '🗣️', 2, TRUE),
(18, '自媒体创作', 'income', '🎬', 3, TRUE),
(18, '电商微商',   'income', '🛍️', 4, TRUE)
ON CONFLICT DO NOTHING;

-- 理财产品类型
INSERT INTO investment_types (id, name, icon, risk_level, description, sort_order, category) VALUES
(1, '银行存款', '🏦', 'low', '银行定期/活期存款', 1, 'deposit'),
(2, '货币基金', '💰', 'low', '余额宝等货币市场基金', 2, 'fund'),
(3, '债券基金', '📊', 'low', '纯债/混合债基金', 3, 'fund'),
(4, '指数基金', '📈', 'medium', '沪深300/中证500等宽基指数', 4, 'fund'),
(5, '混合基金', '🔄', 'medium', '股债混合型基金', 5, 'fund'),
(6, '股票基金', '🚀', 'high', '主动管理型股票基金', 6, 'fund'),
(7, '个股', '💹', 'very_high', '直接持有的个股', 7, 'stock'),
(8, '理财产品', '💎', 'medium', '银行/券商理财产品', 8, 'other'),
(9, '国债', '🏛️', 'low', '国债/地方债', 9, 'deposit'),
(10, '黄金/贵金属', '🥇', 'medium', '实物黄金/纸黄金/黄金ETF', 10, 'commodity'),
(11, '其他理财', '📌', 'medium', '其他投资品种', 99, 'other'),
(12, '港股', '🇭🇰', 'very_high', '香港交易所上市股票', 11, 'hk_stock'),
(13, '美股', '🇺🇸', 'very_high', '美国纳斯达克/NYSE上市股票', 12, 'us_stock'),
(14, '加密货币', '₿', 'very_high', '比特币/以太坊等数字资产', 13, 'crypto'),
(15, '外汇', '💱', 'high', '美元/欧元/日元等外汇品种', 14, 'forex'),
(16, '债券', '📜', 'low', '企业债/可转债等固定收益品种', 15, 'deposit')
ON CONFLICT (id) DO NOTHING;

-- 迁移：将黄金(id=10)的 category 从 other 更新为 commodity（支持行情刷新）
UPDATE investment_types SET category = 'commodity', description = '实物黄金/纸黄金/黄金ETF（支持实时行情）' WHERE id = 10 AND category = 'other';

-- ============================================
-- 交易标签表
-- ============================================
CREATE TABLE IF NOT EXISTS tags (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(50) NOT NULL,
  color VARCHAR(20) DEFAULT '#3b82f6',
  icon VARCHAR(10) DEFAULT '🏷️',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_tags_user ON tags (user_id);

-- 交易-标签关联表
CREATE TABLE IF NOT EXISTS transaction_tags (
  transaction_id INT NOT NULL,
  tag_id INT NOT NULL,
  PRIMARY KEY (transaction_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_tt_tag ON transaction_tags (tag_id);

-- 储蓄目标表
CREATE TABLE IF NOT EXISTS savings_goals (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  target_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  current_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  account_id INT DEFAULT NULL,                       -- 储蓄账户：钱存入的目标账户（强关联）
  source_account_id INT DEFAULT NULL,                -- 来源账户：默认从哪个账户转入（强关联，不能等于 account_id）
  icon VARCHAR(10) DEFAULT '🎯',
  note VARCHAR(200) DEFAULT '',
  status VARCHAR(10) DEFAULT 'active' CHECK (status IN ('active','completed','archived')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_savings_user ON savings_goals (user_id);
DROP TRIGGER IF EXISTS trg_savings_updated ON savings_goals;
CREATE TRIGGER trg_savings_updated BEFORE UPDATE ON savings_goals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- AI 服务商配置表
CREATE TABLE IF NOT EXISTS ai_providers (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  api_type VARCHAR(10) NOT NULL DEFAULT 'openai' CHECK (api_type IN ('openai','anthropic')),
  base_url VARCHAR(255) NOT NULL,
  api_key TEXT DEFAULT NULL,                          -- AES-256-GCM 加密存储
  model VARCHAR(100) NOT NULL,
  is_active BOOLEAN DEFAULT FALSE,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ai_user ON ai_providers (user_id);
CREATE INDEX IF NOT EXISTS idx_ai_user_active ON ai_providers (user_id, is_active);
DROP TRIGGER IF EXISTS trg_ai_updated ON ai_providers;
CREATE TRIGGER trg_ai_updated BEFORE UPDATE ON ai_providers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 默认标签种子
INSERT INTO tags (id, user_id, name, color, icon) VALUES
(1, 1, '餐饮', '#f59e0b', '🍜'),
(2, 1, '必需', '#ef4444', '⭐'),
(3, 1, '可省', '#10b981', '💡'),
(4, 1, '大额', '#8b5cf6', '💎'),
(5, 1, '订阅', '#3b82f6', '🔁')
ON CONFLICT (id) DO NOTHING;

-- OCR 配置表
CREATE TABLE IF NOT EXISTS ai_ocr_config (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  provider VARCHAR(50) NOT NULL DEFAULT 'tencent',
  secret_id TEXT NOT NULL,                            -- AES-256-GCM 加密存储
  secret_key TEXT NOT NULL,                           -- AES-256-GCM 加密存储
  region VARCHAR(50) DEFAULT 'ap-guangzhou',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id)
);
DROP TRIGGER IF EXISTS trg_ocr_updated ON ai_ocr_config;
CREATE TRIGGER trg_ocr_updated BEFORE UPDATE ON ai_ocr_config FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 债务台账（应付 + 应收双向）
-- direction: payable = 我欠别人（默认，旧数据保持）；receivable = 别人欠我
-- creditor: 对方名称（银行/机构/个人，语义通用：应付时是债权人，应收时是债务人）
CREATE TABLE IF NOT EXISTS debts (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  account_id INT DEFAULT NULL,
  create_transaction_id INT DEFAULT NULL,                -- 创建债务时同步生成的台账交易（应收借出时扣减关联账户余额）
  name VARCHAR(100) NOT NULL,
  type VARCHAR(15) NOT NULL DEFAULT 'loan' CHECK (type IN ('credit_card','loan','personal','other')),
  direction VARCHAR(10) NOT NULL DEFAULT 'payable' CHECK (direction IN ('payable','receivable')),
  creditor VARCHAR(100) DEFAULT '',
  principal DECIMAL(15,2) NOT NULL DEFAULT 0,
  remaining DECIMAL(15,2) NOT NULL DEFAULT 0,
  interest_rate DECIMAL(6,3) DEFAULT 0,
  term_months INT DEFAULT 0,
  method VARCHAR(20) DEFAULT 'equal_installment' CHECK (method IN ('equal_installment','equal_principal','interest_only','minimum','lump_sum','manual')),
  monthly_payment DECIMAL(15,2) DEFAULT 0,
  start_date DATE DEFAULT NULL,
  due_date DATE DEFAULT NULL,
  billing_day SMALLINT DEFAULT NULL,
  payment_day SMALLINT DEFAULT NULL,
  min_payment DECIMAL(15,2) DEFAULT 0,
  status VARCHAR(10) DEFAULT 'active' CHECK (status IN ('active','paid_off','overdue')),
  note VARCHAR(200) DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_debts_user ON debts (user_id);
CREATE INDEX IF NOT EXISTS idx_debts_user_direction ON debts (user_id, direction);
CREATE INDEX IF NOT EXISTS idx_debts_user_account ON debts (user_id, account_id);
DROP TRIGGER IF EXISTS trg_debts_updated ON debts;
CREATE TRIGGER trg_debts_updated BEFORE UPDATE ON debts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 债务还款流水
CREATE TABLE IF NOT EXISTS debt_repayments (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  debt_id INT NOT NULL,
  account_id INT DEFAULT NULL,
  amount DECIMAL(15,2) NOT NULL,
  principal_part DECIMAL(15,2) DEFAULT 0,
  interest_part DECIMAL(15,2) DEFAULT 0,
  paid_at DATE NOT NULL,
  note VARCHAR(200) DEFAULT '',
  transaction_id INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_repay_user ON debt_repayments (user_id);
CREATE INDEX IF NOT EXISTS idx_repay_debt ON debt_repayments (debt_id);

-- 储蓄流水
CREATE TABLE IF NOT EXISTS savings_transactions (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  goal_id INT DEFAULT NULL,
  account_id INT DEFAULT NULL,
  type VARCHAR(10) NOT NULL CHECK (type IN ('deposit','withdraw')),
  amount DECIMAL(15,2) NOT NULL,
  date DATE NOT NULL,
  note VARCHAR(200) DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sav_tx_user ON savings_transactions (user_id);
CREATE INDEX IF NOT EXISTS idx_sav_tx_goal ON savings_transactions (goal_id);
CREATE INDEX IF NOT EXISTS idx_sav_tx_date ON savings_transactions (date);

-- ============================================
-- 修复 SERIAL 序列（种子数据使用了显式 ID，需要重置序列到最大值之后）
-- ============================================
SELECT setval(pg_get_serial_sequence('accounts', 'id'), COALESCE((SELECT MAX(id) FROM accounts), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('categories', 'id'), COALESCE((SELECT MAX(id) FROM categories), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('investment_types', 'id'), COALESCE((SELECT MAX(id) FROM investment_types), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('tags', 'id'), COALESCE((SELECT MAX(id) FROM tags), 0) + 1, false);
