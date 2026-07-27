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
   */
  orderBy(orderClause) {
    this._order = ` ORDER BY ${orderClause}`;
    return this;
  }

  /**
   * 添加分页
   */
  page(limit, offset) {
    if (limit) {
      this._limitParts.push({ clause: 'LIMIT ?', values: [parseInt(limit)] });
      if (offset) {
        this._limitParts.push({ clause: 'OFFSET ?', values: [parseInt(offset)] });
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
