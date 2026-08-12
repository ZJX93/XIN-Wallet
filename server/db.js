/* ============================================
   鑫钱包 · Database Connection Pool (PostgreSQL)
   ============================================ */

const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'xinwallet',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  // 显式指定客户端编码为 UTF-8，避免在 Windows / Git Bash 中文 locale 环境下
  // pg 驱动读取 LC_* / LANG 环境变量导致中文被错误地按 GBK 编码往返。
  options: '-c client_encoding=UTF8',
});

/**
 * 将 ? 占位符转换为 PostgreSQL 的 $1, $2, $3... 格式。
 * 跳过引号内的 ?（避免误替换字符串字面量中的问号）。
 */
function convertPlaceholders(sql) {
  let idx = 0;
  let inSingle = false;
  let inDouble = false;
  let result = '';
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "'" && !inDouble) { inSingle = !inSingle; result += ch; continue; }
    if (ch === '"' && !inSingle) { inDouble = !inDouble; result += ch; continue; }
    if (ch === '?' && !inSingle && !inDouble) { result += '$' + (++idx); continue; }
    result += ch;
  }
  return result;
}

/**
 * 按分号分割 SQL 脚本，但跳过 $$ ... $$ 美元引号块内的分号。
 * 用于执行含 PL/pgSQL 函数的 schema.sql。
 */
function splitSqlStatements(sql) {
  const statements = [];
  let current = '';
  let inDollarQuote = false;
  for (let i = 0; i < sql.length; i++) {
    // 检测 $$ 边界
    if (sql[i] === '$' && sql[i + 1] === '$') {
      inDollarQuote = !inDollarQuote;
      current += '$$';
      i++; // 跳过第二个 $
      continue;
    }
    if (sql[i] === ';' && !inDollarQuote) {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = '';
      continue;
    }
    current += sql[i];
  }
  const tail = current.trim();
  if (tail) statements.push(tail);
  return statements;
}

/**
 * 检测是否为 INSERT 语句且未包含 RETURNING，自动补全 RETURNING id。
 * 返回的 rows 数组上挂载 insertId 属性（兼容 MySQL 风格代码（insertId））。
 */
function autoReturning(sql) {
  const trimmed = sql.trim();
  if (!/^INSERT\s/i.test(trimmed)) return sql;
  if (/RETURNING/i.test(trimmed)) return sql;
  // ON CONFLICT DO NOTHING 是 fire-and-forget，不需要 RETURNING
  if (/ON\s+CONFLICT[\s\S]*DO\s+NOTHING/i.test(trimmed)) return sql;
  return sql + ' RETURNING id';
}

function attachInsertId(rows) {
  if (rows.length > 0 && rows[0].id !== undefined) {
    rows.insertId = rows[0].id;
  }
  return rows;
}

async function query(sql, params = []) {
  const text = convertPlaceholders(autoReturning(sql));
  const res = await pool.query(text, params);
  return attachInsertId(res.rows);
}

async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

/**
 * 事务封装：传入的 fn 接收一个 client，内部执行 SQL。
 * client.query 同样自动转换 ? → $N + RETURNING id。
 */
async function transaction(fn) {
  const client = await pool.connect();
  const origQuery = client.query.bind(client);
  // 仅在本事务内覆盖 query，提供 ? -> $N 转换；事务结束后必须还原，
  // 否则被污染的 client 回到池中会被 pool.query 以回调式调用，导致请求永久挂起。
  client.query = async (sql, params = []) => {
    const text = convertPlaceholders(autoReturning(sql));
    const res = await origQuery(text, params);
    return attachInsertId(res.rows);
  };
  try {
    await origQuery('BEGIN');
    const result = await fn(client);
    await origQuery('COMMIT');
    return result;
  } catch (err) {
    await origQuery('ROLLBACK');
    throw err;
  } finally {
    client.query = origQuery; // 还原原生 query，避免污染连接池
    client.release();
  }
}

/**
 * 初始化数据库（幂等：自动建库 + 执行 schema.sql + 迁移）
 */
/**
 * 幂等迁移告警：建表 / 加列等迁移常因「已存在 / 重复」而报错，属预期，忽略；
 * 其余错误才输出告警，避免 ~19 处重复的「已存在就静默」判断逻辑。
 */
function warnUnlessAlreadyExists(label, err) {
  if (!err) return;
  if (/already exists|duplicate/i.test(err.message)) return; // 幂等迁移的预期噪声
  console.warn(`⚠️ ${label}`, err.message);
}

async function initDatabase() {
  console.log('🔧 正在初始化数据库...');
  try {
    const dbName = process.env.DB_NAME || 'xinwallet';

    // 1) 连接到默认 postgres 库，确保目标数据库存在
    const adminPool = new Pool({
      host: process.env.DB_HOST || '127.0.0.1',
      port: parseInt(process.env.DB_PORT || '5432'),
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      database: 'postgres',
      max: 2,
    });
    try {
      const check = await adminPool.query(
        'SELECT 1 FROM pg_database WHERE datname = $1', [dbName]
      );
      if (check.rowCount === 0) {
        // 数据库名不能用参数化，但来自环境变量，做基本校验
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(dbName)) {
          throw new Error(`非法数据库名: ${dbName}`);
        }
        await adminPool.query(`CREATE DATABASE "${dbName}" ENCODING 'UTF8'`);
        console.log(`✅ 数据库 ${dbName} 已创建`);
      }
    } finally {
      await adminPool.end();
    }

    // 2) 读取并执行 schema.sql
    const fs = require('fs');
    const path = require('path');
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    // 按分号分割语句，但跳过 $$ ... $$ 美元引号块内的分号（PL/pgSQL 函数体）
    const statements = splitSqlStatements(schemaSql);

    for (const stmt of statements) {
      // 跳过纯注释段
      const meaningful = stmt.split('\n').filter(l => l.trim() && !l.trim().startsWith('--'));
      if (meaningful.length === 0) continue;
      try {
        await pool.query(stmt);
      } catch (err) {
        warnUnlessAlreadyExists('Schema 执行警告:', err);
      }
    }

    // 3) 幂等迁移：users 表补充列
    const userCols = [
      ['fail_count', 'ALTER TABLE users ADD COLUMN IF NOT EXISTS fail_count INT NOT NULL DEFAULT 0'],
      ['locked_until', 'ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP NULL'],
      ['last_fail_at', 'ALTER TABLE users ADD COLUMN IF NOT EXISTS last_fail_at TIMESTAMP NULL'],
      ['avatar', 'ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar VARCHAR(10) DEFAULT \'👤\''],
    ];
    for (const [col, ddl] of userCols) {
      try { await pool.query(ddl); } catch (err) {
        warnUnlessAlreadyExists(`users.${col} 迁移警告:`, err);
      }
    }

    // 4) 幂等迁移：categories.user_id
    try {
      await pool.query(`ALTER TABLE categories ADD COLUMN IF NOT EXISTS user_id INT DEFAULT NULL`);
    } catch (err) {
      warnUnlessAlreadyExists('categories.user_id 迁移警告:', err);
    }

    // 4.1) 幂等迁移：categories.code（结构化编码 E0101=支出餐饮早午晚餐）
    try {
      await pool.query(`ALTER TABLE categories ADD COLUMN IF NOT EXISTS code VARCHAR(5)`);
      // 为旧数据回填 code（按 id 映射，仅对 code 为 NULL 的记录）
      await pool.query(`
        UPDATE categories SET code = CASE id
          -- 支出一级
          WHEN 1  THEN 'E0100' WHEN 2  THEN 'E0200' WHEN 3  THEN 'E0300'
          WHEN 4  THEN 'E0400' WHEN 5  THEN 'E0500' WHEN 6  THEN 'E0600'
          WHEN 7  THEN 'E0700' WHEN 9  THEN 'E0800' WHEN 11 THEN 'E0900'
          WHEN 14 THEN 'E1000'
          -- 支出二级
          WHEN 23 THEN 'E0101' WHEN 24 THEN 'E0102' WHEN 25 THEN 'E0103'
          WHEN 26 THEN 'E0104' WHEN 27 THEN 'E0105' WHEN 28 THEN 'E0106' WHEN 281 THEN 'E0107'
          WHEN 29 THEN 'E0201' WHEN 30 THEN 'E0202' WHEN 31 THEN 'E0203'
          WHEN 32 THEN 'E0204' WHEN 33 THEN 'E0205' WHEN 34 THEN 'E0206'
          WHEN 35 THEN 'E0301' WHEN 36 THEN 'E0302' WHEN 37 THEN 'E0303'
          WHEN 38 THEN 'E0304'
          WHEN 39 THEN 'E0401' WHEN 40 THEN 'E0402' WHEN 41 THEN 'E0403'
          WHEN 42 THEN 'E0404' WHEN 43 THEN 'E0405' WHEN 44 THEN 'E0406'
          WHEN 45 THEN 'E0407'
          WHEN 46 THEN 'E0501' WHEN 47 THEN 'E0502' WHEN 48 THEN 'E0503'
          WHEN 49 THEN 'E0504' WHEN 50 THEN 'E0505' WHEN 51 THEN 'E0506'
          WHEN 52 THEN 'E0601' WHEN 53 THEN 'E0602' WHEN 54 THEN 'E0603'
          WHEN 55 THEN 'E0604'
          WHEN 56 THEN 'E0701' WHEN 57 THEN 'E0702' WHEN 58 THEN 'E0703'
          WHEN 59 THEN 'E0801' WHEN 60 THEN 'E0802' WHEN 61 THEN 'E0803'
          WHEN 62 THEN 'E0804'
          WHEN 67 THEN 'E0901' WHEN 68 THEN 'E0902' WHEN 69 THEN 'E0903'
          WHEN 70 THEN 'E0904'
          -- 收入一级
          WHEN 15 THEN 'I0100' WHEN 17 THEN 'I0200' WHEN 18 THEN 'I0300'
          WHEN 21 THEN 'I0400'
          -- 收入二级
          WHEN 71 THEN 'I0101' WHEN 72 THEN 'I0102' WHEN 73 THEN 'I0103'
          WHEN 74 THEN 'I0201' WHEN 75 THEN 'I0202' WHEN 76 THEN 'I0203'
          WHEN 77 THEN 'I0301' WHEN 78 THEN 'I0302' WHEN 79 THEN 'I0303'
          WHEN 80 THEN 'I0304'
          -- 转账
          WHEN 22 THEN 'T0100'
        END
        WHERE code IS NULL
      `);
      // code 保持可空：用户自建分类无结构化编码（置 NULL），PostgreSQL 唯一索引允许多个 NULL；
      // 系统分类已在 schema.sql 中以唯一 code 填充。此处不再强制 NOT NULL，否则用户自建分类插入必崩。
      await pool.query(`UPDATE categories SET code = NULL WHERE code = ''`);
    } catch (err) {
      warnUnlessAlreadyExists('categories.code 迁移警告:', err);
    }

    // 4.2) 幂等迁移：accounts.code（结构化编码 A0201=银行卡-工商银行）
    try {
      await pool.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS code VARCHAR(5)`);
      await pool.query(`
        UPDATE accounts SET code = CASE id
          WHEN 1 THEN 'A0101' WHEN 2 THEN 'A0201' WHEN 3 THEN 'A0202'
          WHEN 4 THEN 'A0401' WHEN 5 THEN 'A0402' WHEN 6 THEN 'A0301'
        END
        WHERE code IS NULL
      `);
    } catch (err) {
      warnUnlessAlreadyExists('accounts.code 迁移警告:', err);
    }

    // 4.3) 幂等迁移：investment_types.code（结构化编码 V0203=指数基金）
    try {
      await pool.query(`ALTER TABLE investment_types ADD COLUMN IF NOT EXISTS code VARCHAR(5)`);
      await pool.query(`
        UPDATE investment_types SET code = CASE id
          WHEN 1  THEN 'V0101' WHEN 2  THEN 'V0201' WHEN 3  THEN 'V0202'
          WHEN 4  THEN 'V0203' WHEN 5  THEN 'V0204' WHEN 6  THEN 'V0205'
          WHEN 7  THEN 'V0301' WHEN 8  THEN 'V9901' WHEN 9  THEN 'V0102'
          WHEN 10 THEN 'V0601' WHEN 11 THEN 'V9902' WHEN 12 THEN 'V0401'
          WHEN 13 THEN 'V0501' WHEN 14 THEN 'V0701' WHEN 15 THEN 'V0801'
          WHEN 16 THEN 'V0103'
        END
        WHERE code IS NULL
      `);
    } catch (err) {
      warnUnlessAlreadyExists('investment_types.code 迁移警告:', err);
    }

    // 5) 幂等迁移：investments.nav_date
    try {
      await pool.query(`ALTER TABLE investments ADD COLUMN IF NOT EXISTS nav_date DATE DEFAULT NULL`);
    } catch (err) {
      warnUnlessAlreadyExists('investments.nav_date 迁移警告:', err);
    }

    // 5.1) 幂等迁移：investments.risk_level（每持仓独立风险等级，覆盖类型默认）
    try {
      await pool.query(`ALTER TABLE investments ADD COLUMN IF NOT EXISTS risk_level VARCHAR(10) CHECK (risk_level IN ('low','medium','high','very_high'))`);
    } catch (err) {
      warnUnlessAlreadyExists('investments.risk_level 迁移警告:', err);
    }

    // 6) 幂等迁移：transactions 复合索引
    try {
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_account_date ON transactions (account_id, date)`);
    } catch (err) {
      warnUnlessAlreadyExists('transactions.idx_account_date 迁移警告:', err);
    }

    // 7) 幂等迁移：debts.direction（区分应付/应收）
    //     payable = 我欠别人（默认，旧数据全归此类）
    //     receivable = 别人欠我（借出、人情借款等）
    try {
      await pool.query(`ALTER TABLE debts ADD COLUMN IF NOT EXISTS direction VARCHAR(10) NOT NULL DEFAULT 'payable' CHECK (direction IN ('payable','receivable'))`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_debts_user_direction ON debts (user_id, direction)`);
    } catch (err) {
      warnUnlessAlreadyExists('debts.direction 迁移警告:', err);
    }

    // 8) 幂等迁移：debts.account_id（可选关联账户）
    //     应付场景（信用卡/贷款）关联发卡/放款账户，应收可留空
    try {
      await pool.query(`ALTER TABLE debts ADD COLUMN IF NOT EXISTS account_id INT DEFAULT NULL`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_debts_user_account ON debts (user_id, account_id)`);
    } catch (err) {
      warnUnlessAlreadyExists('debts.account_id 迁移警告:', err);
    }

    // 9) 幂等迁移：debts.create_transaction_id（创建应收借出时同步生成的台账交易，用于回滚）
    try {
      await pool.query(`ALTER TABLE debts ADD COLUMN IF NOT EXISTS create_transaction_id INT DEFAULT NULL`);
    } catch (err) {
      warnUnlessAlreadyExists('debts.create_transaction_id 迁移警告:', err);
    }

    // 10) 幂等迁移：savings_goals.source_account_id（存入时默认来源账户，强关联）
    try {
      await pool.query(`ALTER TABLE savings_goals ADD COLUMN IF NOT EXISTS source_account_id INT DEFAULT NULL`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_savings_user_source ON savings_goals (user_id, source_account_id)`);
    } catch (err) {
      warnUnlessAlreadyExists('savings_goals.source_account_id 迁移警告:', err);
    }

    // 11) 幂等迁移：investments.create_transaction_id（创建持仓时同步生成的台账交易，用于删除/编辑回滚）
    try {
      await pool.query(`ALTER TABLE investments ADD COLUMN IF NOT EXISTS create_transaction_id INT DEFAULT NULL`);
    } catch (err) {
      warnUnlessAlreadyExists('investments.create_transaction_id 迁移警告:', err);
    }

    // 12) 幂等迁移：investment_types.is_system（系统预置类型保护）
    //     investment_types 是全局共享表（无 user_id），schema 预置 11 条基础类型。
    //     此前 PUT/DELETE 无任何归属校验 → 任意登录用户可改删全局类型，影响所有人
    //     （与审核报告 C4「系统分类可被篡改」同构，报告未覆盖此表）。
    //     标记预置数据为 is_system，路由层据此拒绝普通用户改删。
    try {
      await pool.query(`ALTER TABLE investment_types ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE`);
      // 回填 schema 预置的基础类型（id 1-16）；用户自建类型保持可编辑
      await pool.query(`UPDATE investment_types SET is_system = TRUE WHERE id <= 16 AND is_system = FALSE`);
    } catch (err) {
      warnUnlessAlreadyExists('investment_types.is_system 迁移警告:', err);
    }

    // 13) 幂等迁移：扩展 investment_types.category CHECK 约束，支持新增品类
    //     旧约束仅允许 fund/stock/deposit/other，需替换为包含 hk_stock/us_stock/commodity/crypto/forex
    try {
      // 删除旧约束（名称可能为 investment_types_category_check 或系统自动生成）
      const { rows: constraints } = await pool.query(`
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'investment_types'::regclass AND contype = 'c'
          AND pg_get_constraintdef(oid) LIKE '%category%'
      `);
      for (const { conname } of constraints) {
        await pool.query(`ALTER TABLE investment_types DROP CONSTRAINT IF EXISTS "${conname}"`);
      }
      // 重建更宽泛的约束
      await pool.query(`ALTER TABLE investment_types ADD CONSTRAINT investment_types_category_check
        CHECK (category IN ('fund','stock','deposit','other','hk_stock','us_stock','commodity','crypto','forex'))`);
    } catch (err) {
      warnUnlessAlreadyExists('category CHECK 约束更新警告:', err);
    }

    // 14) 幂等迁移：新增投资品类（港股/美股/加密货币/外汇/债券）+ 黄金迁移到 commodity
    try {
      await pool.query(`
        INSERT INTO investment_types (id, name, icon, risk_level, description, sort_order, category, is_system)
        VALUES
          (12, '港股', '🇭🇰', 'very_high', '香港交易所上市股票', 11, 'hk_stock', TRUE),
          (13, '美股', '🇺🇸', 'very_high', '美国纳斯达克/NYSE上市股票', 12, 'us_stock', TRUE),
          (14, '加密货币', '₿', 'very_high', '比特币/以太坊等数字资产', 13, 'crypto', TRUE),
          (15, '外汇', '💱', 'high', '美元/欧元/日元等外汇品种', 14, 'forex', TRUE),
          (16, '债券', '📜', 'low', '企业债/可转债等固定收益品种', 15, 'deposit', TRUE)
        ON CONFLICT (id) DO NOTHING
      `);
      // 将原有黄金(id=10)从 other 迁移到 commodity（支持腾讯行情刷新）
      await pool.query(`UPDATE investment_types SET category = 'commodity', description = '实物黄金/纸黄金/黄金ETF（支持实时行情）' WHERE id = 10 AND category = 'other'`);
    } catch (err) {
      warnUnlessAlreadyExists('investment_types 品类扩展警告:', err);
    }

    // 15) 幂等迁移：投资理财分类体系（一级 投资理财 + 二级 投资买入/理财保险）
    //     买入分类按产品类型拆分：保险类→理财保险，其余→投资买入，均挂在「投资理财」下。
    try {
      // 一级 投资理财（支出），sort_order = 10（接在 育儿亲子=9 之后，其他支出=99 之前）
      await pool.query(`
        INSERT INTO categories (code, name, type, icon, color, sort_order, is_system)
        SELECT 'E1100', '投资理财', 'expense', '💹', '#22c55e', 10, TRUE
        WHERE NOT EXISTS (SELECT 1 FROM categories WHERE code = 'E1100')
      `);
      // 历史动态创建的「投资买入」(parent_id 为 NULL) 挂回投资理财下
      await pool.query(`
        UPDATE categories
           SET parent_id = (SELECT id FROM categories WHERE code = 'E1100')
         WHERE name = '投资买入' AND type = 'expense'
           AND (parent_id IS NULL OR parent_id <> (SELECT id FROM categories WHERE code = 'E1100'))
      `);
      // 二级 投资买入（若不存在则建在投资理财下）
      await pool.query(`
        INSERT INTO categories (code, name, type, icon, color, parent_id, is_system)
        SELECT 'E1101', '投资买入', 'expense', '📈', '#22c55e', (SELECT id FROM categories WHERE code = 'E1100'), TRUE
        WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = '投资买入' AND type = 'expense')
      `);
      // 二级 理财保险（保险类买入归此类）
      await pool.query(`
        INSERT INTO categories (code, name, type, icon, color, parent_id, is_system)
        SELECT 'E1102', '理财保险', 'expense', '🛡️', '#22c55e', (SELECT id FROM categories WHERE code = 'E1100'), TRUE
        WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = '理财保险' AND type = 'expense')
      `);
      // investment_types 支持 insurance 品类（保险类理财可正确归入理财保险）
      const { rows: itCons } = await pool.query(`
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'investment_types'::regclass AND contype = 'c'
          AND pg_get_constraintdef(oid) LIKE '%category%'
      `);
      for (const { conname } of itCons) {
        await pool.query(`ALTER TABLE investment_types DROP CONSTRAINT IF EXISTS "${conname}"`);
      }
      await pool.query(`ALTER TABLE investment_types ADD CONSTRAINT investment_types_category_check
        CHECK (category IN ('fund','stock','deposit','other','hk_stock','us_stock','commodity','crypto','forex','insurance'))`);
    } catch (err) {
      warnUnlessAlreadyExists('投资理财分类迁移警告:', err);
    }

    // 16) 幂等迁移：修正「投资理财」一级排序号（100 → 10，落在第 10 位）
    //     仅补刷已部署库（#15 早期版本曾写入 100），全新库已由 #15 直接写入 10。
    try {
      await pool.query(`
        UPDATE categories
           SET sort_order = 10
         WHERE code = 'E1100'
           AND (sort_order IS NULL OR sort_order <> 10)
      `);
    } catch (err) {
      warnUnlessAlreadyExists('投资理财排序修正迁移警告:', err);
    }

    // 17) 幂等迁移：系统分类颜色按 type 统一（支出绿 / 收入红 / 转账蓝）
    //     仅刷新系统预设（is_system=TRUE），不覆盖用户自定义分类颜色。
    try {
      await pool.query(`
        UPDATE categories
           SET color = CASE type
                         WHEN 'expense'  THEN '#22c55e'
                         WHEN 'income'   THEN '#ef4444'
                         WHEN 'transfer' THEN '#3b82f6'
                         ELSE color
                       END
         WHERE is_system = TRUE
           AND color IS DISTINCT FROM CASE type
                                        WHEN 'expense'  THEN '#22c55e'
                                        WHEN 'income'   THEN '#ef4444'
                                        WHEN 'transfer' THEN '#3b82f6'
                                        ELSE color
                                      END
      `);
    } catch (err) {
      warnUnlessAlreadyExists('系统分类颜色统一迁移警告:', err);
    }

    // 18) 幂等迁移：accounts.credit_limit（信用卡/电子支付信用额度）
    //     旧部署可能没有该列；全新库已由 schema.sql 直接创建。
    try {
      await pool.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS credit_limit DECIMAL(15,2) DEFAULT 0`);
    } catch (err) {
      warnUnlessAlreadyExists('accounts.credit_limit 迁移警告:', err);
    }

    // 19) 幂等迁移：扩展 investment_transactions.type CHECK 约束，支持红利再投(reinvest)
    //     v0.3.23 新增「记一笔利息」红利再投分支会写入 type='reinvest'，
    //     但旧约束仅允许 buy/sell/dividend/interest/fee → 触发 CHECK 违例返回 500。
    //     删除旧约束并重建含 reinvest。
    //     ⚠️ 关键陷阱：PostgreSQL 会把 `CHECK (type IN (...))` 自动改写成
    //        `CHECK (type = ANY (ARRAY[...]))`，字面量 `IN (...)` 不会出现在约束定义里。
    //        因此匹配条件必须用 `%type%`（命中改写后的 `type = ANY (ARRAY[...])`），
    //        绝不能用 `%type IN%`（永远匹配不到，导致旧约束删不掉、ADD 报 already exists 被静默吞掉）。
    try {
      const { rows: txCons } = await pool.query(`
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'investment_transactions'::regclass AND contype = 'c'
          AND pg_get_constraintdef(oid) LIKE '%type%'
      `);
      for (const { conname } of txCons) {
        await pool.query(`ALTER TABLE investment_transactions DROP CONSTRAINT IF EXISTS "${conname}"`);
      }
      await pool.query(`ALTER TABLE investment_transactions ADD CONSTRAINT investment_transactions_type_check
        CHECK (type IN ('buy','sell','dividend','interest','fee','reinvest'))`);
    } catch (err) {
      warnUnlessAlreadyExists('investment_transactions.type CHECK 约束更新警告:', err);
    }

    console.log('✅ 数据库表结构已初始化');
    return true;
  } catch (err) {
    console.error('❌ 数据库初始化失败:', err.message);
    return false;
  }
}

module.exports = { pool, query, queryOne, transaction, initDatabase };
