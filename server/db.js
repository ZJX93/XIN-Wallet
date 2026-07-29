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

    console.log('✅ 数据库表结构已初始化');
    return true;
  } catch (err) {
    console.error('❌ 数据库初始化失败:', err.message);
    return false;
  }
}

module.exports = { pool, query, queryOne, transaction, initDatabase, convertPlaceholders };
