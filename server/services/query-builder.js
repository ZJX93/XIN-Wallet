/* ============================================
   鑫钱包 · 轻量 SQL 查询构建器（PostgreSQL 版）
   使用方便书写的 ? 占位符，build() 时自动转为 $1, $2...
   ============================================ */

/**
 * SQL 片段构建器：链式添加条件/排序/分页，最终组装为 { text, values }
 *
 * 兼容 pg 驱动的参数化查询：内部用 ? 书写，build() 时转为 $1, $2...
 *
 * 用法:
 *   const q = new QueryBuilder('SELECT * FROM t WHERE user_id = ?', [userId]);
 *   q.andIf(month, 'date LIKE ?', [month + '%']);
 *   q.andIf(type && type !== 'all', 'type = ?', [type]);
 *   q.orderBy('date DESC');
 *   q.page(limit, offset);
 *   const { text, values } = q.build();
 */
class QueryBuilder {
  constructor(baseSql, baseParams = []) {
    this._base = baseSql;
    this._params = [...baseParams];
    this._wheres = [];
    this._order = '';
    this._limitParts = [];  // 存储 { clause, values }
  }

  /**
   * 添加 AND 条件（仅在 condition 为真时）
   * @param {*} condition - falsy 则跳过
   * @param {string} clause - SQL 片段（含 ? 占位符）
   * @param {Array} values - 占位符对应值
   */
  andIf(condition, clause, values = []) {
    if (condition) {
      this._wheres.push(clause);
      this._params.push(...values);
    }
    return this;
  }

  /**
   * 添加排序
   *
   * 安全修复（审核报告 M2）：ORDER BY 的列名无法参数化，只能靠白名单。
   * 原实现直接拼接调用方字符串，一旦有调用方把 req.query 透传进来即成注入点。
   * 现在强制校验格式：只允许 `列名 [ASC|DESC]`，多列用逗号分隔；
   * 列名限定为字母/数字/下划线，可带一级表别名前缀（如 `t.date`）。
   * 不合法直接抛错——宁可显式失败，也不静默拼出危险 SQL。
   *
   * @param {string} orderClause 例如 'date DESC' / 't.date DESC, t.id DESC'
   * @param {string[]} [allowedColumns] 可选，进一步限定允许排序的列名白名单
   */
  orderBy(orderClause, allowedColumns = null) {
    if (!orderClause) return this;
    if (typeof orderClause !== 'string') {
      throw new Error('orderBy: 排序子句必须是字符串');
    }

    const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
    const parts = orderClause.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length === 0) return this;

    const safeParts = parts.map(part => {
      const seg = part.split(/\s+/);
      if (seg.length > 2) {
        throw new Error(`orderBy: 非法排序片段「${part}」`);
      }
      const [rawCol, rawDir] = seg;

      // 列名，允许 `别名.列名` 形式
      const colSegments = rawCol.split('.');
      if (colSegments.length > 2 || !colSegments.every(s => IDENT.test(s))) {
        throw new Error(`orderBy: 非法列名「${rawCol}」`);
      }
      if (allowedColumns && !allowedColumns.includes(rawCol)) {
        throw new Error(`orderBy: 列「${rawCol}」不在允许排序的白名单内`);
      }

      // 方向仅允许 ASC / DESC
      let dir = '';
      if (rawDir) {
        const upper = rawDir.toUpperCase();
        if (upper !== 'ASC' && upper !== 'DESC') {
          throw new Error(`orderBy: 非法排序方向「${rawDir}」`);
        }
        dir = ' ' + upper;
      }
      return rawCol + dir;
    });

    this._order = ` ORDER BY ${safeParts.join(', ')}`;
    return this;
  }

  /**
   * 添加分页
   *
   * 安全修复（审核报告 M4）：limit 无上限时，攻击者传 limit=99999999
   * 可拉全表造成内存/带宽型 DoS。此处强制收敛到 [1, MAX_LIMIT]。
   */
  page(limit, offset) {
    const MAX_LIMIT = 1000;
    const n = parseInt(limit);
    if (Number.isInteger(n) && n > 0) {
      this._limitParts.push({ clause: 'LIMIT ?', values: [Math.min(n, MAX_LIMIT)] });
      const off = parseInt(offset);
      if (Number.isInteger(off) && off > 0) {
        this._limitParts.push({ clause: 'OFFSET ?', values: [off] });
      }
    }
    return this;
  }

  /**
   * 构建最终 SQL，自动将 ? 转为 $1, $2...
   * @returns {{ text: string, values: Array }}
   */
  build() {
    // 收集所有值
    const allValues = [...this._params];
    const limitClauses = [];
    for (const lp of this._limitParts) {
      limitClauses.push(lp.clause);
      allValues.push(...lp.values);
    }

    const wherePart = this._wheres.length > 0 ? ' AND ' + this._wheres.join(' AND ') : '';
    const limitPart = limitClauses.length > 0 ? ' ' + limitClauses.join(' ') : '';

    // 组装 SQL（仍用 ? 占位符）
    const rawSql = this._base + wherePart + this._order + limitPart;

    // 将 ? 替换为 $1, $2, $3...
    let idx = 0;
    const text = rawSql.replace(/\?/g, () => `$${++idx}`);

    return { text, values: allValues };
  }
}

module.exports = { QueryBuilder };
