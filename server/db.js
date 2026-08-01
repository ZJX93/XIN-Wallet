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
 * 检测是否为 INSERT 语句且未包含 RETURNING，自动补全 RETURNING id。
 * 返回的 rows 数组上挂载 insertId 属性（兼容 MariaDB 风格代码）。
 */
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
        if (!/already exists|duplicate key/i.test(err.message)) {
          console.warn('⚠️ Schema 执行警告:', err.message);
        }
      }
    }

    // 3) 幂等迁移：users 表补充列
    const userCols = [
      ['fail_count', 'ALTER TABLE users ADD COLUMN IF NOT EXISTS fail_count INT NOT NULL DEFAULT 0'],
      ['locked_until', 'ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP NULL'],
      ['last_fail_at', 'ALTER TABLE users ADD COLUMN IF NOT EXISTS last_fail_at TIMESTAMP NULL'],
    ];
    for (const [col, ddl] of userCols) {
      try { await pool.query(ddl); } catch (err) {
        if (!/already exists|duplicate/i.test(err.message)) console.warn(`⚠️ users.${col} 迁移警告:`, err.message);
      }
    }

    // 4) 幂等迁移：categories.user_id
    try {
      await pool.query(`ALTER TABLE categories ADD COLUMN IF NOT EXISTS user_id INT DEFAULT NULL`);
    } catch (err) {
      if (!/already exists|duplicate/i.test(err.message)) console.warn('⚠️ categories.user_id 迁移警告:', err.message);
    }

    // 5) 幂等迁移：investments.nav_date
    try {
      await pool.query(`ALTER TABLE investments ADD COLUMN IF NOT EXISTS nav_date DATE DEFAULT NULL`);
    } catch (err) {
      if (!/already exists|duplicate/i.test(err.message)) console.warn('⚠️ investments.nav_date 迁移警告:', err.message);
    }

    // 6) 幂等迁移：transactions 复合索引
    try {
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_account_date ON transactions (account_id, date)`);
    } catch (err) {
      if (!/already exists|duplicate/i.test(err.message)) console.warn('⚠️ transactions.idx_account_date 迁移警告:', err.message);
    }

    // 7) 幂等迁移：debts.direction（区分应付/应收）
    //     payable = 我欠别人（默认，旧数据全归此类）
    //     receivable = 别人欠我（借出、人情借款等）
    try {
      await pool.query(`ALTER TABLE debts ADD COLUMN IF NOT EXISTS direction VARCHAR(10) NOT NULL DEFAULT 'payable' CHECK (direction IN ('payable','receivable'))`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_debts_user_direction ON debts (user_id, direction)`);
    } catch (err) {
      if (!/already exists|duplicate/i.test(err.message)) console.warn('⚠️ debts.direction 迁移警告:', err.message);
    }

    // 8) 幂等迁移：debts.account_id（可选关联账户）
    //     应付场景（信用卡/贷款）关联发卡/放款账户，应收可留空
    try {
      await pool.query(`ALTER TABLE debts ADD COLUMN IF NOT EXISTS account_id INT DEFAULT NULL`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_debts_user_account ON debts (user_id, account_id)`);
    } catch (err) {
      if (!/already exists|duplicate/i.test(err.message)) console.warn('⚠️ debts.account_id 迁移警告:', err.message);
    }

    // 9) 幂等迁移：debts.create_transaction_id（创建应收借出时同步生成的台账交易，用于回滚）
    try {
      await pool.query(`ALTER TABLE debts ADD COLUMN IF NOT EXISTS create_transaction_id INT DEFAULT NULL`);
    } catch (err) {
      if (!/already exists|duplicate/i.test(err.message)) console.warn('⚠️ debts.create_transaction_id 迁移警告:', err.message);
    }

    // 10) 幂等迁移：savings_goals.source_account_id（存入时默认来源账户，强关联）
    try {
      await pool.query(`ALTER TABLE savings_goals ADD COLUMN IF NOT EXISTS source_account_id INT DEFAULT NULL`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_savings_user_source ON savings_goals (user_id, source_account_id)`);
    } catch (err) {
      if (!/already exists|duplicate/i.test(err.message)) console.warn('⚠️ savings_goals.source_account_id 迁移警告:', err.message);
    }

    // 11) 幂等迁移：investment_types.is_system（系统预置类型保护）
    //     investment_types 是全局共享表（无 user_id），schema 预置 11 条基础类型。
    //     此前 PUT/DELETE 无任何归属校验 → 任意登录用户可改删全局类型，影响所有人
    //     （与审核报告 C4「系统分类可被篡改」同构，报告未覆盖此表）。
    //     标记预置数据为 is_system，路由层据此拒绝普通用户改删。
    try {
      await pool.query(`ALTER TABLE investment_types ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE`);
      // 回填 schema 预置的基础类型（id 1-16）；用户自建类型保持可编辑
      await pool.query(`UPDATE investment_types SET is_system = TRUE WHERE id <= 16 AND is_system = FALSE`);
    } catch (err) {
      if (!/already exists|duplicate/i.test(err.message)) console.warn('⚠️ investment_types.is_system 迁移警告:', err.message);
    }

    // 12) 幂等迁移：扩展 investment_types.category CHECK 约束，支持新增品类
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
      if (!/already exists|duplicate/i.test(err.message)) console.warn('⚠️ category CHECK 约束更新警告:', err.message);
    }

    // 13) 幂等迁移：新增投资品类（港股/美股/加密货币/外汇/债券）+ 黄金迁移到 commodity
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
      if (!/already exists|duplicate/i.test(err.message)) console.warn('⚠️ investment_types 品类扩展警告:', err.message);
    }

    console.log('✅ 数据库表结构已初始化');
    return true;
  } catch (err) {
    console.error('❌ 数据库初始化失败:', err.message);
    return false;
  }
}

module.exports = { pool, query, queryOne, transaction, initDatabase, convertPlaceholders };
