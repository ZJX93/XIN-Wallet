/**
 * 鑫钱包 · OpenAPI 3.0 规范
 * 自动生成 swagger.json 供前端 Swagger UI 渲染
 * 同时作为 API 文档的实时来源
 */

const spec = {
    openapi: '3.0.3',
    info: {
        title: '鑫钱包 API',
        version: '0.0.2',
        description: '个人财务助手后端 API · 含账户/交易/预算/理财/储蓄/债务/AI 识别/报表分析',
        contact: { name: 'ZJX93', url: 'https://github.com/ZJX93/XIN-Wallet' },
    },
    servers: [
        { url: '/', description: '当前主机' },
        { url: 'http://localhost:18888', description: '本地开发' },
    ],
    components: {
        securitySchemes: {
            bearerAuth: {
                type: 'http',
                scheme: 'bearer',
                bearerFormat: 'JWT',
                description: '登录后返回的 token，放在 Authorization 头里',
            },
        },
        schemas: {
            Success: {
                type: 'object',
                properties: {
                    success: { type: 'boolean', example: true },
                    data: { type: 'object' },
                    message: { type: 'string' },
                },
            },
            Error: {
                type: 'object',
                properties: {
                    success: { type: 'boolean', example: false },
                    message: { type: 'string', example: '错误说明' },
                    errors: { type: 'array', items: { type: 'string' } },
                },
            },
            Transaction: {
                type: 'object',
                required: ['account_id', 'category_id', 'type', 'amount', 'date'],
                properties: {
                    account_id: { type: 'integer', example: 1 },
                    category_id: { type: 'integer', example: 5 },
                    type: { type: 'string', enum: ['income', 'expense'] },
                    amount: { type: 'number', format: 'float', minimum: 0 },
                    note: { type: 'string', maxLength: 200 },
                    date: { type: 'string', format: 'date', example: '2026-07-22' },
                },
            },
            Account: {
                type: 'object',
                properties: {
                    name: { type: 'string', example: '工商银行' },
                    type: { type: 'string', enum: ['cash', 'bank', 'wechat', 'alipay', 'credit', 'other'] },
                    balance: { type: 'number' },
                    icon: { type: 'string' },
                },
            },
            Investment: {
                type: 'object',
                properties: {
                    name: { type: 'string' },
                    investment_type_id: { type: 'integer' },
                    code: { type: 'string' },
                    buy_price: { type: 'number' },
                    current_price: { type: 'number' },
                    quantity: { type: 'number' },
                    total_cost: { type: 'number' },
                    current_value: { type: 'number' },
                },
            },
        },
    },
    security: [{ bearerAuth: [] }],
    tags: [
        { name: '认证', description: '登录注册' },
        { name: '账户', description: '现金/银行/微信/支付宝账户' },
        { name: '交易', description: '收支记录' },
        { name: '转账', description: '账户间转账' },
        { name: '预算', description: '分类预算与执行' },
        { name: '理财', description: '投资组合（基金/股票/存款）' },
        { name: '储蓄', description: '储蓄目标与进度' },
        { name: '债务', description: '房贷/装修/信用卡债务管理' },
        { name: '统计', description: '仪表盘/报表中心数据' },
        { name: 'AI', description: 'OCR 账单识别 + 智能分类' },
        { name: '数据', description: '导入导出与备份' },
        { name: '系统', description: '健康检查与监控' },
    ],
    paths: {
        '/healthz': {
            get: { tags: ['系统'], summary: '存活检查（K8s liveness）', security: [],
                responses: { 200: { description: 'OK' } } },
        },
        '/readyz': {
            get: { tags: ['系统'], summary: '就绪检查（K8s readiness，会 ping DB）', security: [],
                responses: { 200: { description: 'Ready' }, 503: { description: 'DB not ready' } } },
        },
        '/health/deep': {
            get: { tags: ['系统'], summary: '深度健康检查（DB/内存/磁盘/配置）', security: [],
                responses: { 200: { description: 'All OK' }, 503: { description: '有检查项失败' } } },
        },
        '/api/auth/register': {
            post: {
                tags: ['认证'], summary: '注册新用户', security: [],
                requestBody: { required: true, content: { 'application/json': { schema: {
                    type: 'object', required: ['username', 'password'],
                    properties: {
                        username: { type: 'string', minLength: 3, maxLength: 32 },
                        password: { type: 'string', minLength: 6, maxLength: 128 },
                        nickname: { type: 'string' },
                    },
                }}}},
                responses: { 200: { description: '注册成功，返回 token' }, 400: { description: '参数错误' } },
            },
        },
        '/api/auth/login': {
            post: {
                tags: ['认证'], summary: '登录', security: [],
                requestBody: { required: true, content: { 'application/json': { schema: {
                    type: 'object', required: ['username', 'password'],
                    properties: { username: { type: 'string' }, password: { type: 'string' } },
                }}}},
                responses: { 200: { description: '登录成功' }, 401: { description: '用户名或密码错误' }, 423: { description: '账号已锁定' } },
            },
        },
        '/api/transactions': {
            get: { tags: ['交易'], summary: '查询交易记录',
                parameters: [
                    { name: 'month', in: 'query', schema: { type: 'string', example: '2026-07' } },
                    { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
                    { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
                ],
                responses: { 200: { description: '交易列表' } },
            },
            post: {
                tags: ['交易'], summary: '新建交易', requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Transaction' }}}},
                responses: { 200: { description: '创建成功' } },
            },
        },
        '/api/transactions/{id}': {
            put: { tags: ['交易'], summary: '更新交易',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Transaction' }}}},
                responses: { 200: { description: '更新成功' } },
            },
            delete: { tags: ['交易'], summary: '删除交易',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: '删除成功' } },
            },
        },
        '/api/accounts': {
            get: { tags: ['账户'], summary: '账户列表', responses: { 200: { description: '账户列表' } } },
            post: { tags: ['账户'], summary: '创建账户',
                requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Account' }}}},
                responses: { 200: { description: '创建成功' } },
            },
        },
        '/api/investments/investments': {
            get: { tags: ['理财'], summary: '持仓列表', responses: { 200: { description: '持仓列表' } } },
            post: { tags: ['理财'], summary: '新增持仓',
                requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Investment' }}}},
                responses: { 200: { description: '创建成功' } },
            },
        },
        '/api/stats/dashboard': {
            get: { tags: ['统计'], summary: '仪表盘数据',
                responses: { 200: { description: '周/月/年/总资产/净资产/储蓄率' } } },
        },
        '/api/stats/investments': {
            get: { tags: ['统计'], summary: '投资组合统计（趋势 + 类型对比）', responses: { 200: { description: 'trendSeries + byType + summary' } } },
        },
        '/api/reports': {
            get: { tags: ['统计'], summary: '财务报表',
                parameters: [
                    { name: 'type', in: 'query', schema: { type: 'string', enum: ['monthly', 'quarterly', 'annual'] } },
                    { name: 'period', in: 'query', schema: { type: 'string', example: '2026-07' } },
                ],
                responses: { 200: { description: '完整报表数据' } },
            },
        },
        '/api/ai/ocr': {
            post: { tags: ['AI'], summary: 'OCR 识别账单截图', responses: { 200: { description: '识别文本' } } },
        },
        '/api/ai/parse': {
            post: { tags: ['AI'], summary: '智能解析为交易', responses: { 200: { description: '解析后的交易列表' } } },
        },
        '/api/data/export': {
            get: { tags: ['数据'], summary: '导出完整账本', responses: { 200: { description: 'JSON 文件' } } },
        },
    },
};

module.exports = spec;