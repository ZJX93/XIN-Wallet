/* ============================================
   鑫钱包 · Database Connection Pool
   ============================================ */

const mariadb = require('mariadb');

const pool = mariadb.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'xinwallet',
  connectionLimit: 10,
  charset: 'utf8mb4',
  collation: 'utf8mb4_unicode_ci',
  supportBigNumbers: true,
  bigNumberStrings: true,
  trace: process.env.NODE_ENV !== 'production',
  initSql: ["SET NAMES utf8mb4", "SET time_zone = '+08:00'"]
});

async function getConn() {
  return pool.getConnection();
}

async function query(sql, params = []) {
  let conn;
  try {
    conn = await getConn();
    const result = await conn.query(sql, params);
    return result;
  } finally {
    if (conn) conn.release();
  }
}

async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

async function transaction(fn) {
  let conn;
  try {
    conn = await getConn();
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    if (conn) await conn.rollback();
    throw err;
  } finally {
    if (conn) conn.release();
  }
}

// 初始化数据库（执行 schema.sql）
async function initDatabase() {
  console.log('🔧 正在初始化数据库...');
  try {
    // 先尝试创建数据库
    const rootPool = mariadb.createPool({
      host: process.env.DB_HOST || '127.0.0.1',
      port: parseInt(process.env.DB_PORT || '3306'),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      connectionLimit: 5,
      charset: 'utf8mb4',
      collation: 'utf8mb4_unicode_ci',
      initSql: ["SET NAMES utf8mb4", "SET time_zone = '+08:00'"]
    });

    let rootConn;
    try {
      rootConn = await rootPool.getConnection();
      const dbName = process.env.DB_NAME || 'xinwallet';
      await rootConn.query(`CREATE DATABASE IF NOT EXISTS ${dbName} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      console.log(`✅ 数据库 ${dbName} 已创建`);
    } finally {
      if (rootConn) rootConn.release();
      await rootPool.end();
    }

    // 读取并执行 schema.sql
    const fs = require('fs');
    const path = require('path');
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    // 分割并逐条执行。排除 USE 语句与纯注释行（多行语句第一行可能是注释，
    // 因此仅当整段以 "--" 开头且不含 SQL 关键字时才跳过）。
    const statements = schemaSql
      .split(';')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('USE'))
      .filter(s => !/^\s*--\s/.test(s) || /\b(CREATE|INSERT|ALTER|DROP|SELECT|UPDATE|DELETE|SET)\b/i.test(s));

    for (const stmt of statements) {
      try {
        await query(stmt);
      } catch (err) {
        if (!err.message.includes('already exists') && !err.message.includes('Duplicate')) {
          console.warn('⚠️ Schema 执行警告:', err.message);
        }
      }
    }

    // 迁移：给已存在的 users 表补充 fail_count/locked_until/last_fail_at 列
    const userCols = ['fail_count INT NOT NULL DEFAULT 0',
                       'locked_until DATETIME NULL',
                       'last_fail_at DATETIME NULL'];
    for (const colDef of userCols) {
      const colName = colDef.split(' ')[0];
      try {
        await query(`ALTER TABLE users ADD COLUMN ${colDef}`);
      } catch (err) {
        if (!/already exists|duplicate/i.test(err.message)) {
          console.warn(`⚠️ users.${colName} 迁移警告:`, err.message);
        }
      }
    }

    // 迁移：给已存在的 categories 表补充 user_id 列（兼容首次未含此列的旧库）
    try {
      const colExists = await queryOne(
        "SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'categories' AND COLUMN_NAME = 'user_id'"
      );
      if (colExists && parseInt(colExists.cnt) === 0) {
        await query("ALTER TABLE categories ADD COLUMN user_id INT DEFAULT NULL COMMENT '所属用户ID（NULL=系统预设全局分类）' AFTER parent_id");
        console.log('✅ categories.user_id 列已添加');
      }
    } catch (err) {
      console.warn('⚠️ categories.user_id 迁移警告:', err.message);
    }

    // 迁移：给 investments 表补充 nav_date 列（行情刷新时记录净值日期）
    try {
      const colExists = await queryOne(
        "SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'investments' AND COLUMN_NAME = 'nav_date'"
      );
      if (colExists && parseInt(colExists.cnt) === 0) {
        await query("ALTER TABLE investments ADD COLUMN nav_date DATE DEFAULT NULL COMMENT '净值日期' AFTER actual_rate");
        console.log('✅ investments.nav_date 列已添加');
      }
    } catch (err) {
      console.warn('⚠️ investments.nav_date 迁移警告:', err.message);
    }

    console.log('✅ 数据库表结构已初始化');
    return true;
  } catch (err) {
    console.error('❌ 数据库初始化失败:', err.message);
    return false;
  }
}

module.exports = { pool, query, queryOne, transaction, initDatabase };
