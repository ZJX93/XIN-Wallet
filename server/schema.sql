-- ============================================
-- 鑫钱包 · MariaDB 数据库 Schema
-- 注意：本文件由 server/db.js 在 initDatabase() 中调用，数据库创建与 USE 由 db.js 负责。
-- 如需手动执行，请先 CREATE DATABASE <DB_NAME> 并 USE <DB_NAME>。
-- ============================================

-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  nickname VARCHAR(100),
  -- 登录失败计数 + 账号锁定（持久化，重启不丢）
  fail_count INT NOT NULL DEFAULT 0,
  locked_until DATETIME NULL,
  last_fail_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 账户表 (现金/银行卡/微信/支付宝/信用卡等)
CREATE TABLE IF NOT EXISTS accounts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL DEFAULT 1,
  name VARCHAR(50) NOT NULL COMMENT '账户名称',
  type ENUM('cash','bank_card','credit_card','electronic_payment','financial_account','digital','other') NOT NULL COMMENT '账户类型',
  icon VARCHAR(10) DEFAULT '💰' COMMENT '图标',
  balance DECIMAL(15,2) NOT NULL DEFAULT 0 COMMENT '当前余额',
  -- 期初余额（复式记账：当前余额 = 期初余额 + 账本流水净额）。
  -- 对应 Firefly III 的“期初余额交易”，使账本成为唯一真相且可随时重算/对账。
  opening_balance DECIMAL(15,2) NOT NULL DEFAULT 0 COMMENT '期初余额',
  credit_limit DECIMAL(15,2) DEFAULT 0 COMMENT '信用额度(信用卡)',
  is_default BOOLEAN DEFAULT FALSE COMMENT '是否默认账户',
  sort_order INT DEFAULT 0,
  status ENUM('active','closed') DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user (user_id)
) ENGINE=InnoDB;

-- 交易类别表
CREATE TABLE IF NOT EXISTS categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  parent_id INT DEFAULT NULL COMMENT '父分类ID，NULL为一级分类',
  user_id INT DEFAULT NULL COMMENT '所属用户ID（NULL=系统预设全局分类）',
  name VARCHAR(50) NOT NULL COMMENT '类别名称',
  type ENUM('expense','income','transfer') NOT NULL,
  icon VARCHAR(10) CHARACTER SET utf8mb4 DEFAULT '📌' COMMENT '图标',
  color VARCHAR(10) DEFAULT '#6366f1' COMMENT '颜色',
  sort_order INT DEFAULT 0,
  is_system BOOLEAN DEFAULT TRUE COMMENT '是否系统预设',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_parent (parent_id),
  INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 幂等迁移：兼容已有未带 user_id 的表（initDatabase 调用 ALTER 会被静默忽略）
-- 注意：MariaDB 不支持完整的 IF NOT EXISTS for ADD COLUMN，db.js 会捕获 "Duplicate column" 异常忽略
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'categories' AND COLUMN_NAME = 'user_id');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE categories ADD COLUMN user_id INT DEFAULT NULL COMMENT ''所属用户（NULL=系统预设）'' AFTER parent_id',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 交易记录表
CREATE TABLE IF NOT EXISTS transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL DEFAULT 1,
  account_id INT NOT NULL COMMENT '关联账户',
  category_id INT NOT NULL COMMENT '关联类别',
  budget_id INT DEFAULT NULL COMMENT '关联预算（可选）',
  type ENUM('expense','income','transfer_in','transfer_out') NOT NULL COMMENT '交易类型',
  amount DECIMAL(15,2) NOT NULL COMMENT '金额',
  note VARCHAR(200) DEFAULT '' COMMENT '备注',
  date DATETIME NOT NULL COMMENT '交易时间（精确到秒）',
  transfer_id INT DEFAULT NULL COMMENT '关联转账ID',
  -- 复式记账（参考 Firefly III）：每笔资金流动记录“来源账户”与“目标账户”，
  -- 构成借贷配对。单笔支出：source=扣款账户，destination=NULL；
  -- 单笔收入：source=NULL，destination=入账账户；
  -- 转账：transfer_out 行(source=from,dest=NULL) 与 transfer_in 行(source=NULL,dest=to) 通过 transfer_id 配对。
  -- 账户余额由账本推导（见 routes.js computeAccountBalance），本列为空的历史数据按 type 回退。
  source_account_id INT DEFAULT NULL COMMENT '复式记账-资金源账户',
  destination_account_id INT DEFAULT NULL COMMENT '复式记账-资金目标账户',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user_date (user_id, date),
  INDEX idx_account (account_id),
  INDEX idx_category (category_id),
  INDEX idx_type (type),
  INDEX idx_budget (budget_id),
  INDEX idx_tx_source (source_account_id),
  INDEX idx_tx_dest (destination_account_id)
) ENGINE=InnoDB;

-- 内部转账记录表
CREATE TABLE IF NOT EXISTS transfers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL DEFAULT 1,
  from_account_id INT NOT NULL COMMENT '转出账户',
  to_account_id INT NOT NULL COMMENT '转入账户',
  amount DECIMAL(15,2) NOT NULL COMMENT '转账金额',
  note VARCHAR(200) DEFAULT '' COMMENT '转账备注',
  date DATETIME NOT NULL COMMENT '转账时间（精确到秒）',
  status ENUM('completed','pending','cancelled') DEFAULT 'completed',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user (user_id),
  INDEX idx_from (from_account_id),
  INDEX idx_to (to_account_id)
) ENGINE=InnoDB;

-- 预算表
CREATE TABLE IF NOT EXISTS budgets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL DEFAULT 1,
  name VARCHAR(100) NOT NULL COMMENT '预算名称（自由命名）',
  period_type ENUM('month','quarter','half','year') NOT NULL DEFAULT 'month' COMMENT '周期类型：月度/季度/半年/年度',
  start_date DATE NOT NULL COMMENT '预算开始日期',
  end_date DATE NOT NULL COMMENT '预算结束日期',
  amount DECIMAL(15,2) NOT NULL COMMENT '预算金额',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_name_period (user_id, name, start_date, end_date)
) ENGINE=InnoDB;

-- 理财产品类型表
CREATE TABLE IF NOT EXISTS investment_types (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL COMMENT '产品类型名称',
  icon VARCHAR(10) DEFAULT '📈' COMMENT '图标',
  risk_level ENUM('low','medium','high','very_high') DEFAULT 'medium' COMMENT '风险等级',
  category ENUM('fund','stock','deposit','other') NOT NULL DEFAULT 'fund' COMMENT '行情品类',
  description VARCHAR(200) DEFAULT '' COMMENT '描述',
  sort_order INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 理财持仓表
CREATE TABLE IF NOT EXISTS investments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL DEFAULT 1,
  account_id INT DEFAULT NULL COMMENT '关联账户',
  investment_type_id INT NOT NULL COMMENT '理财产品类型',
  name VARCHAR(100) NOT NULL COMMENT '产品名称',
  code VARCHAR(50) DEFAULT '' COMMENT '产品代码(基金代码/股票代码)',
  buy_price DECIMAL(15,4) NOT NULL DEFAULT 0 COMMENT '买入单价',
  current_price DECIMAL(15,4) NOT NULL DEFAULT 0 COMMENT '当前单价',
  quantity DECIMAL(15,4) NOT NULL DEFAULT 0 COMMENT '持有数量/份额',
  total_cost DECIMAL(15,2) NOT NULL DEFAULT 0 COMMENT '总投入成本（含手续费）',
  current_value DECIMAL(15,2) NOT NULL DEFAULT 0 COMMENT '当前市值',
  fee DECIMAL(15,2) NOT NULL DEFAULT 0 COMMENT '手续费',
  buy_date DATE NOT NULL COMMENT '买入日期',
  expected_rate DECIMAL(8,4) DEFAULT 0 COMMENT '预期年化收益率',
  actual_rate DECIMAL(8,4) DEFAULT 0 COMMENT '实际年化收益率',
  status ENUM('holding','sold','expired') DEFAULT 'holding' COMMENT '状态',
  note VARCHAR(200) DEFAULT '' COMMENT '备注',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user (user_id),
  INDEX idx_type (investment_type_id),
  INDEX idx_status (status)
) ENGINE=InnoDB;

-- 理财交易记录(买入/卖出/分红)
CREATE TABLE IF NOT EXISTS investment_transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL DEFAULT 1,
  investment_id INT NOT NULL COMMENT '关联持仓',
  type ENUM('buy','sell','dividend','interest','fee') NOT NULL COMMENT '操作类型',
  amount DECIMAL(15,2) NOT NULL COMMENT '金额',
  price DECIMAL(15,4) DEFAULT 0 COMMENT '单价',
  quantity DECIMAL(15,4) DEFAULT 0 COMMENT '数量',
  date DATE NOT NULL COMMENT '日期',
  note VARCHAR(200) DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_investment (investment_id)
) ENGINE=InnoDB;

-- 理财净值快照（每周日自动记录，用于市值趋势图）
CREATE TABLE IF NOT EXISTS investment_snapshots (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL DEFAULT 1,
  investment_id INT NOT NULL COMMENT '关联持仓',
  total_value DECIMAL(15,2) NOT NULL DEFAULT 0 COMMENT '当日总市值',
  total_cost DECIMAL(15,2) NOT NULL DEFAULT 0 COMMENT '当日累计成本',
  nav_date DATE NOT NULL COMMENT '净值日期（周日）',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_inv_date (investment_id, nav_date),
  INDEX idx_user_date (user_id, nav_date)
) ENGINE=InnoDB;

-- ============================================
-- 插入默认数据（演示用户由服务端按环境变量种子，见 index.js）
-- ============================================

-- 默认账户
INSERT IGNORE INTO accounts (id, user_id, name, type, icon, balance, is_default, sort_order) VALUES
(1, 1, '现金', 'cash', '💵', 500.00, FALSE, 1),
(2, 1, '工商银行', 'bank_card', '🏦', 25000.00, TRUE, 2),
(3, 1, '招商银行', 'bank_card', '🏦', 18000.00, FALSE, 3),
(4, 1, '微信支付', 'electronic_payment', '💚', 3200.00, FALSE, 4),
(5, 1, '支付宝', 'electronic_payment', '🔵', 5000.00, FALSE, 5),
(6, 1, '信用卡', 'credit_card', '💳', 0.00, FALSE, 6);

-- 支出类别
-- 一级支出类别
INSERT IGNORE INTO categories (id, name, type, icon, sort_order, is_system) VALUES
(1,  '餐饮',     'expense', '🍜', 1,  TRUE),
(2,  '交通',     'expense', '🚗', 2,  TRUE),
(3,  '购物',     'expense', '🛒', 3,  TRUE),
(4,  '住房',     'expense', '🏠', 4,  TRUE),
(5,  '娱乐',     'expense', '🎮', 5,  TRUE),
(6,  '医疗',     'expense', '💊', 6,  TRUE),
(7,  '教育',     'expense', '📚', 7,  TRUE),
(8,  '通讯',     'expense', '📱', 8,  TRUE),
(9,  '人情',     'expense', '🎁', 9,  TRUE),
(10, '美容',     'expense', '💄', 10, TRUE),
(11, '旅行',     'expense', '✈️', 11, TRUE),
(12, '宠物',     'expense', '🐱', 12, TRUE),
(13, '保险',     'expense', '🛡️', 13, TRUE),
(23, '爱车',     'expense', '🚗', 15, TRUE),
(14, '其他支出', 'expense', '📌', 99, TRUE);

-- 支出二级分类
INSERT IGNORE INTO categories (id, parent_id, name, type, icon, sort_order, is_system) VALUES
-- 餐饮(1)
(30, 1, '早餐',     'expense', '🥐', 1, TRUE),
(31, 1, '午餐',     'expense', '🍱', 2, TRUE),
(32, 1, '晚餐',     'expense', '🍽️', 3, TRUE),
(33, 1, '零食',     'expense', '🍿', 4, TRUE),
(34, 1, '聚餐',     'expense', '🥘', 5, TRUE),
(35, 1, '外卖',     'expense', '🛵', 6, TRUE),
(100, 1, '饮料',    'expense', '🧃', 7, TRUE),
(101, 1, '生鲜',    'expense', '🥬', 8, TRUE),
-- 交通(2)
(36, 2, '公交地铁', 'expense', '🚇', 1, TRUE),
(37, 2, '打车',     'expense', '🚕', 2, TRUE),
(40, 2, '火车飞机', 'expense', '🚄', 3, TRUE),
-- 购物(3)
(41, 3, '日用百货', 'expense', '🧴', 1, TRUE),
(42, 3, '服装鞋包', 'expense', '👗', 2, TRUE),
(43, 3, '数码产品', 'expense', '📱', 3, TRUE),
(44, 3, '家居家具', 'expense', '🛋️', 4, TRUE),
-- 住房(4)
(45, 4, '房租',     'expense', '🏠', 1, TRUE),
(46, 4, '水电燃气', 'expense', '💡', 2, TRUE),
(47, 4, '物业费',   'expense', '🏢', 3, TRUE),
(48, 4, '维修',     'expense', '🔧', 4, TRUE),
(49, 4, '家居用品', 'expense', '🧹', 5, TRUE),
-- 娱乐(5)
(50, 5, '电影演出', 'expense', '🎬', 1, TRUE),
(51, 5, '游戏',     'expense', '🎮', 2, TRUE),
(52, 5, '运动健身', 'expense', '🏃', 3, TRUE),
(53, 5, '旅游度假', 'expense', '🏖️', 4, TRUE),
(54, 5, 'KTV酒吧',  'expense', '🎤', 5, TRUE),
-- 医疗(6)
(55, 6, '门诊',     'expense', '🏥', 1, TRUE),
(56, 6, '药品',     'expense', '💊', 2, TRUE),
(57, 6, '体检',     'expense', '🩺', 3, TRUE),
(58, 6, '住院',     'expense', '🛌', 4, TRUE),
-- 教育(7)
(59, 7, '培训课程', 'expense', '📖', 1, TRUE),
(60, 7, '书籍',     'expense', '📚', 2, TRUE),
(61, 7, '考试报名', 'expense', '📝', 3, TRUE),
-- 通讯(8)
(62, 8, '话费',     'expense', '📞', 1, TRUE),
(63, 8, '宽带',     'expense', '🌐', 2, TRUE),
(64, 8, '快递',     'expense', '📦', 3, TRUE),
-- 人情(9)
(65, 9, '孝敬父母', 'expense', '👴', 1, TRUE),
(66, 9, '送礼红包', 'expense', '🧧', 2, TRUE),
(67, 9, '请客',     'expense', '🍻', 3, TRUE),
-- 宠物(12)
(68, 12, '主粮零食', 'expense', '🦴', 1, TRUE),
(69, 12, '医疗保健', 'expense', '💉', 2, TRUE),
(70, 12, '玩具用品', 'expense', '🧸', 3, TRUE),
-- 美容(10)
(71, 10, '护肤',     'expense', '🧴', 1, TRUE),
(72, 10, '美发',     'expense', '💇', 2, TRUE),
-- 保险(13)
(73, 13, '社保',     'expense', '🏛️', 1, TRUE),
(74, 13, '商业保险', 'expense', '🛡️', 2, TRUE),
-- 爱车(23)
(90, 23, '加油',     'expense', '⛽', 1, TRUE),
(91, 23, '充电',     'expense', '🔋', 2, TRUE),
(92, 23, '停车费',   'expense', '🅿️', 3, TRUE),
(93, 23, '过路费',   'expense', '🛣️', 4, TRUE),
(94, 23, '维保费',   'expense', '🔧', 5, TRUE),
(95, 23, '车险',     'expense', '🛡️', 6, TRUE);

-- 一级收入类别
INSERT IGNORE INTO categories (id, name, type, icon, sort_order, is_system) VALUES
(15, '工资',     'income', '💰', 1,  TRUE),
(16, '奖金',     'income', '🎯', 2,  TRUE),
(17, '投资收益', 'income', '📈', 3,  TRUE),
(18, '兼职',     'income', '💼', 4,  TRUE),
(19, '租金收入', 'income', '🔑', 5,  TRUE),
(20, '退款',     'income', '🔄', 6,  TRUE),
(21, '其他收入', 'income', '📌', 99, TRUE),
(22, '转账',   'transfer', '↔️', 1,  TRUE);

-- 收入二级分类
INSERT IGNORE INTO categories (id, parent_id, name, type, icon, sort_order, is_system) VALUES
-- 工资(15)
(80, 15, '基本工资', 'income', '💼', 1, TRUE),
(81, 15, '奖金',     'income', '🎯', 2, TRUE),
(82, 15, '补贴报销', 'income', '📋', 3, TRUE),
-- 投资收益(17)
(83, 17, '理财收益', 'income', '📈', 1, TRUE),
(84, 17, '房租收入', 'income', '🔑', 2, TRUE),
(85, 17, '分红',     'income', '💎', 3, TRUE),
-- 兼职(18)
(86, 18, '副业',     'income', '💻', 1, TRUE),
(87, 18, '咨询',     'income', '🗣️', 2, TRUE);

-- 理财产品类型
INSERT IGNORE INTO investment_types (id, name, icon, risk_level, description, sort_order, category) VALUES
(1, '银行存款', '🏦', 'low', '银行定期/活期存款', 1, 'deposit'),
(2, '货币基金', '💰', 'low', '余额宝等货币市场基金', 2, 'fund'),
(3, '债券基金', '📊', 'low', '纯债/混合债基金', 3, 'fund'),
(4, '指数基金', '📈', 'medium', '沪深300/中证500等宽基指数', 4, 'fund'),
(5, '混合基金', '🔄', 'medium', '股债混合型基金', 5, 'fund'),
(6, '股票基金', '🚀', 'high', '主动管理型股票基金', 6, 'fund'),
(7, '个股', '💹', 'very_high', '直接持有的个股', 7, 'stock'),
(8, '理财产品', '💎', 'medium', '银行/券商理财产品', 8, 'other'),
(9, '国债', '🏛️', 'low', '国债/地方债', 9, 'deposit'),
(10, '黄金', '🥇', 'medium', '实物黄金/纸黄金/黄金ETF', 10, 'other'),
(11, '其他理财', '📌', 'medium', '其他投资品种', 99, 'other');

-- ============================================
-- 交易标签表（参考 Firefly III 的 tags）
-- ============================================
CREATE TABLE IF NOT EXISTS tags (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(50) NOT NULL COMMENT '标签名称',
  color VARCHAR(20) DEFAULT '#3b82f6' COMMENT '标签颜色',
  icon VARCHAR(10) DEFAULT '🏷️' COMMENT '图标',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_id)
) ENGINE=InnoDB;

-- 交易-标签关联表
CREATE TABLE IF NOT EXISTS transaction_tags (
  transaction_id INT NOT NULL,
  tag_id INT NOT NULL,
  PRIMARY KEY (transaction_id, tag_id),
  INDEX idx_tag (tag_id)
) ENGINE=InnoDB;

-- 储蓄目标表（参考 Firefly III 的 piggy banks，整合进理财模块）
CREATE TABLE IF NOT EXISTS savings_goals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(100) NOT NULL COMMENT '目标名称',
  target_amount DECIMAL(15,2) NOT NULL DEFAULT 0 COMMENT '目标金额',
  current_amount DECIMAL(15,2) NOT NULL DEFAULT 0 COMMENT '已攒金额',
  account_id INT DEFAULT NULL COMMENT '资金关联账户',
  icon VARCHAR(10) DEFAULT '🎯' COMMENT '图标',
  note VARCHAR(200) DEFAULT '' COMMENT '备注',
  status ENUM('active','completed','archived') DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user (user_id)
) ENGINE=InnoDB;

-- AI 服务商配置表：支持添加多个服务商（OpenAI兼容 / Anthropic），并指定一个当前启用。
-- key 只保存在后端数据库，不返回给前端，前端通过后端代理调用大模型。
CREATE TABLE IF NOT EXISTS ai_providers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(100) NOT NULL COMMENT '自定义服务商名称，如 DeepSeek官方、本地Ollama',
  api_type ENUM('openai','anthropic') NOT NULL DEFAULT 'openai' COMMENT '接口类型：openai=OpenAI兼容 / anthropic=Anthropic Messages',
  base_url VARCHAR(255) NOT NULL COMMENT '接口基础地址，如 https://api.deepseek.com/v1',
  api_key TEXT DEFAULT NULL COMMENT 'API Key（AES-256-GCM 加密存储，hex 格式）',
  model VARCHAR(100) NOT NULL COMMENT '模型名，如 deepseek-chat',
  is_active BOOLEAN DEFAULT FALSE COMMENT '是否当前启用（同一用户下只有一个 true）',
  sort_order INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user (user_id),
  INDEX idx_user_active (user_id, is_active)
) ENGINE=InnoDB;

-- 默认标签种子（显式 id 1-5，确保 initDatabase 每次启动幂等，不会重复累积）
INSERT IGNORE INTO tags (id, user_id, name, color, icon) VALUES
(1, 1, '餐饮', '#f59e0b', '🍜'),
(2, 1, '必需', '#ef4444', '⭐'),
(3, 1, '可省', '#10b981', '💡'),
(4, 1, '大额', '#8b5cf6', '💎'),
(5, 1, '订阅', '#3b82f6', '🔁');

-- OCR 配置表：腾讯云 OCR 密钥（仅服务端存储，不返回给前端）
CREATE TABLE IF NOT EXISTS ai_ocr_config (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  provider VARCHAR(50) NOT NULL DEFAULT 'tencent' COMMENT 'OCR 服务商',
  secret_id TEXT NOT NULL COMMENT '腾讯云 SecretId（AES-256-GCM 加密存储，hex 格式）',
  secret_key TEXT NOT NULL COMMENT '腾讯云 SecretKey（AES-256-GCM 加密存储，hex 格式）',
  region VARCHAR(50) DEFAULT 'ap-guangzhou' COMMENT '腾讯云地域',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user (user_id)
) ENGINE=InnoDB;

-- 债务管理：债务台账（信用卡/贷款/个人借贷/其他应付）
CREATE TABLE IF NOT EXISTS debts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(100) NOT NULL COMMENT '债务名称',
  type ENUM('credit_card','loan','personal','other') NOT NULL DEFAULT 'loan' COMMENT '类型',
  creditor VARCHAR(100) DEFAULT '' COMMENT '债权人/机构/个人',
  principal DECIMAL(15,2) NOT NULL DEFAULT 0 COMMENT '本金/初始总额',
  remaining DECIMAL(15,2) NOT NULL DEFAULT 0 COMMENT '剩余本金',
  interest_rate DECIMAL(6,3) DEFAULT 0 COMMENT '年利率%',
  term_months INT DEFAULT 0 COMMENT '期限月数',
  method ENUM('equal_installment','equal_principal','interest_only','minimum','lump_sum','manual') DEFAULT 'equal_installment' COMMENT '还款方式',
  monthly_payment DECIMAL(15,2) DEFAULT 0 COMMENT '月供/每期还款',
  start_date DATE DEFAULT NULL COMMENT '起始日',
  due_date DATE DEFAULT NULL COMMENT '到期日/下次还款日',
  billing_day TINYINT DEFAULT NULL COMMENT '信用卡账单日(1-28)',
  payment_day TINYINT DEFAULT NULL COMMENT '信用卡还款日(1-28)',
  min_payment DECIMAL(15,2) DEFAULT 0 COMMENT '信用卡最低还款额',
  status ENUM('active','paid_off','overdue') DEFAULT 'active' COMMENT '状态',
  note VARCHAR(200) DEFAULT '' COMMENT '备注',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user (user_id)
) ENGINE=InnoDB;

-- 债务管理：还款流水
CREATE TABLE IF NOT EXISTS debt_repayments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  debt_id INT NOT NULL,
  account_id INT DEFAULT NULL COMMENT '关联还款账户',
  amount DECIMAL(15,2) NOT NULL COMMENT '还款金额',
  principal_part DECIMAL(15,2) DEFAULT 0 COMMENT '本金部分',
  interest_part DECIMAL(15,2) DEFAULT 0 COMMENT '利息部分',
  paid_at DATE NOT NULL COMMENT '还款日期',
  note VARCHAR(200) DEFAULT '' COMMENT '备注',
  transaction_id INT DEFAULT NULL COMMENT '关联账本交易ID（还款出账）',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_id),
  INDEX idx_debt (debt_id)
) ENGINE=InnoDB;

-- 储蓄流水（追踪每月存取，用于计算真实储蓄率）
CREATE TABLE IF NOT EXISTS savings_transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  goal_id INT DEFAULT NULL,
  account_id INT DEFAULT NULL,
  type ENUM('deposit','withdraw') NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  date DATE NOT NULL,
  note VARCHAR(200) DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_id),
  INDEX idx_goal (goal_id),
  INDEX idx_date (date)
) ENGINE=InnoDB;
