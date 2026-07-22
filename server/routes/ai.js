/* ============================================
   鑫钱包 · AI 服务商 & OCR 配置路由
   ============================================ */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { encrypt, decrypt } = require('../crypto');
const { success, fail, handleServerError, maskKey, extractJson } = require('./_helpers');
const { getActiveProvider, callProvider } = require('../services/ai');
const { ocr: tencentOcr } = require('tencentcloud-sdk-nodejs-ocr');
const OcrClient = tencentOcr.v20181119.Client;

// 校验服务商输入
function validateProvider(body) {
    const { name, api_type, base_url, model } = body || {};
    if (!name || !name.trim()) return '名称必填';
    if (!api_type || !['openai', 'anthropic'].includes(api_type)) return '接口类型必须是 openai 或 anthropic';
    if (!base_url || !base_url.trim()) return '接口地址必填';
    if (!model || !model.trim()) return '模型名必填';
    return null;
}

// 获取服务商列表
router.get('/providers', async (req, res) => {
    try {
        const rows = await db.query('SELECT id, user_id, name, api_type, base_url, api_key, model, is_active, sort_order, created_at FROM ai_providers WHERE user_id = ? ORDER BY sort_order, id', [req.userId]);
        res.json(success({
            providers: rows.map(r => ({
                id: r.id, name: r.name, api_type: r.api_type, base_url: r.base_url,
                model: r.model, is_active: !!r.is_active, sort_order: r.sort_order,
                api_key: maskKey(decrypt(r.api_key))
            }))
        }));
    } catch (err) { handleServerError(res, err); }
});

// 创建服务商
router.post('/providers', async (req, res) => {
    try {
        const err = validateProvider(req.body);
        if (err) return res.status(400).json(fail(err));
        const { name, api_type, base_url, api_key, model, is_active, sort_order } = req.body;
        const encryptedKey = api_key ? encrypt(api_key.trim()) : null;
        const result = await db.query(
            'INSERT INTO ai_providers (user_id, name, api_type, base_url, api_key, model, is_active, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [req.userId, name.trim(), api_type, base_url.trim(), encryptedKey, model.trim(), is_active ? 1 : 0, sort_order || 0]
        );
        if (is_active) {
            await db.query('UPDATE ai_providers SET is_active = FALSE WHERE user_id = ? AND id != ?', [req.userId, result.insertId]);
        }
        res.json(success({ id: result.insertId }, '服务商已创建'));
    } catch (err) { handleServerError(res, err); }
});

// 更新服务商
router.put('/providers/:id', async (req, res) => {
    try {
        const err = validateProvider(req.body);
        if (err) return res.status(400).json(fail(err));
        const { name, api_type, base_url, api_key, model, is_active, sort_order } = req.body;
        const existing = await db.queryOne('SELECT id FROM ai_providers WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
        if (!existing) return res.status(404).json(fail('服务商不存在'));

        const updates = {
            name: name.trim(), api_type, base_url: base_url.trim(),
            model: model.trim(), is_active: is_active ? 1 : 0, sort_order: sort_order || 0
        };
        if (typeof api_key === 'string' && api_key.trim()) {
            updates.api_key = encrypt(api_key.trim());
        }
        const keys = Object.keys(updates);
        const values = Object.values(updates);
        values.push(req.params.id, req.userId);
        await db.query(`UPDATE ai_providers SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ? AND user_id = ?`, values);

        if (is_active) {
            await db.query('UPDATE ai_providers SET is_active = FALSE WHERE user_id = ? AND id != ?', [req.userId, req.params.id]);
        }
        res.json(success({ updated: true }, '服务商已更新'));
    } catch (err) { handleServerError(res, err); }
});

// 删除服务商
router.delete('/providers/:id', async (req, res) => {
    try {
        const existing = await db.queryOne('SELECT id FROM ai_providers WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
        if (!existing) return res.status(404).json(fail('服务商不存在'));
        await db.query('DELETE FROM ai_providers WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
        res.json(success({ deleted: true }, '服务商已删除'));
    } catch (err) { handleServerError(res, err); }
});

// 激活服务商
router.post('/providers/:id/activate', async (req, res) => {
    try {
        const existing = await db.queryOne('SELECT id FROM ai_providers WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
        if (!existing) return res.status(404).json(fail('服务商不存在'));
        await db.query('UPDATE ai_providers SET is_active = FALSE WHERE user_id = ?', [req.userId]);
        await db.query('UPDATE ai_providers SET is_active = TRUE WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
        res.json(success({ activated: true }, '已启用该服务商'));
    } catch (err) { handleServerError(res, err); }
});

// 测试连接
router.post('/providers/:id/test', async (req, res) => {
    try {
        const provider = await db.queryOne('SELECT * FROM ai_providers WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
        if (!provider) return res.status(404).json(fail('服务商不存在'));
        if (provider.api_key) provider.api_key = decrypt(provider.api_key);
        if (!provider.api_key) return res.status(400).json(fail('服务商未设置 API Key'));

        const result = await callProvider(provider, [{ role: 'user', content: '回复"OK"' }]);
        res.json(success({ ok: true, reply: (result || '').slice(0, 100) }, '连接测试成功'));
    } catch (err) {
        res.json(success({ ok: false, error: err.message }, '连接测试失败'));
    }
});

// AI 财务建议（基于用户完整财务数据生成多条建议）
router.post('/advice', async (req, res) => {
    try {
        const provider = await getActiveProvider(req.userId);
        if (!provider) return res.status(400).json(fail('未配置 AI 服务商'));

        // 收集用户财务数据：本月交易汇总、预算、储蓄目标、账户、债务
        const currentMonth = new Date().toISOString().slice(0, 7);
        const [summary, budgets, goals, accounts, debts] = await Promise.all([
            db.query(
                `SELECT c.name AS category, t.type, SUM(t.amount) AS total, COUNT(*) AS cnt
                 FROM transactions t LEFT JOIN categories c ON t.category_id = c.id
                 WHERE t.user_id = ? AND DATE_FORMAT(t.date, '%Y-%m') = ?
                 GROUP BY c.name, t.type ORDER BY total DESC`,
                [req.userId, currentMonth]
            ),
            db.query(
                'SELECT name, amount FROM budgets WHERE user_id = ? AND start_date <= CURDATE() AND end_date >= CURDATE()',
                [req.userId]
            ),
            db.query(
                "SELECT name, target_amount, current_amount, icon FROM savings_goals WHERE user_id = ? AND status = 'active'",
                [req.userId]
            ),
            db.query(
                'SELECT name, balance, type FROM accounts WHERE user_id = ? ORDER BY balance DESC',
                [req.userId]
            ),
            db.query(
                `SELECT name, type, remaining, monthly_payment, interest_rate, method, due_date, status
                 FROM debts WHERE user_id = ? AND status != 'paid_off'`,
                [req.userId]
            )
        ]);

        // 也获取上月数据用于环比
        const prevMonth = (() => {
            const d = new Date(); d.setMonth(d.getMonth() - 1);
            return d.toISOString().slice(0, 7);
        })();
        const prevSummary = await db.query(
            `SELECT c.name AS category, t.type, SUM(t.amount) AS total
             FROM transactions t LEFT JOIN categories c ON t.category_id = c.id
             WHERE t.user_id = ? AND DATE_FORMAT(t.date, '%Y-%m') = ?
             GROUP BY c.name, t.type ORDER BY total DESC`,
            [req.userId, prevMonth]
        );

        const curExpense = summary.filter(r => r.type === 'expense').reduce((s, r) => s + parseFloat(r.total), 0);
        const curIncome = summary.filter(r => r.type === 'income').reduce((s, r) => s + parseFloat(r.total), 0);
        const prevExpense = prevSummary.filter(r => r.type === 'expense').reduce((s, r) => s + parseFloat(r.total), 0);
        const momRate = prevExpense > 0 ? ((curExpense - prevExpense) / prevExpense * 100).toFixed(1) : null;

        // 计算总负债和月供
        const totalDebt = debts.reduce((s, d) => s + parseFloat(d.remaining || 0), 0);
        const totalMonthlyPayment = debts.reduce((s, d) => s + parseFloat(d.monthly_payment || 0), 0);
        const totalAssets = accounts.reduce((s, a) => s + parseFloat(a.balance || 0), 0);
        const debtToAssetRatio = totalAssets > 0 ? (totalDebt / totalAssets * 100).toFixed(1) : '0';

        const context = {
            本月: currentMonth,
            本月收入: Math.round(curIncome * 100) / 100,
            本月支出: Math.round(curExpense * 100) / 100,
            收支比: curIncome > 0 ? (curExpense / curIncome * 100).toFixed(0) + '%' : '无收入',
            支出环比: momRate !== null ? `${momRate > 0 ? '+' : ''}${momRate}%` : '无上月数据',
            分类收支: summary.map(r => ({ 类别: r.category, 类型: r.type, 金额: Math.round(parseFloat(r.total) * 100) / 100, 笔数: r.cnt })),
            预算: budgets.map(b => ({ 名称: b.name, 预算额: Math.round(parseFloat(b.amount) * 100) / 100 })),
            储蓄目标: goals.map(g => ({ 名称: g.name, 目标: Math.round(parseFloat(g.target_amount) * 100) / 100, 当前: Math.round(parseFloat(g.current_amount) * 100) / 100, 进度: Math.round(parseFloat(g.current_amount) / Math.max(1, parseFloat(g.target_amount)) * 100) + '%' })),
            账户: accounts.map(a => ({ 名称: a.name, 余额: Math.round(parseFloat(a.balance) * 100) / 100, 类型: a.type })),
            债务: {
                总负债: Math.round(totalDebt * 100) / 100,
                月供应付: Math.round(totalMonthlyPayment * 100) / 100,
                负债资产比: debtToAssetRatio + '%',
                明细: debts.map(d => ({
                    名称: d.name,
                    类型: d.type === 'credit_card' ? '信用卡' : d.type === 'loan' ? '贷款' : d.type === 'personal' ? '个人借贷' : '其他',
                    剩余: Math.round(parseFloat(d.remaining || 0) * 100) / 100,
                    月供: Math.round(parseFloat(d.monthly_payment || 0) * 100) / 100,
                    状态: d.status === 'overdue' ? '逾期' : '正常'
                }))
            },
            上月支出: Math.round(prevExpense * 100) / 100
        };

        const content = await callProvider(provider, [
            {
                role: 'system',
                content: `你是一位资深个人理财顾问。基于用户完整财务数据，给出 3-5 条切实可行的财务建议，按重要性排序。
要求：
1. 优先针对真实风险（超支、储蓄目标滞后、收支比失衡、闲置资金、负债过高、逾期风险）
2. 若用户有负债，必须分析负债资产比、月供占收入比，给出降债建议
3. 每条必须基于具体数据，给出可量化、可操作的方向
4. 区分优先级
返回纯 JSON，每条含：
- title：8字以内建议标题
- content：45字以内具体建议（含数据）
- impact：15字以内预期影响
- priority：优先级，"high"（重要）/ "medium"（中等）/ "low"（可选）三选一
{"advice":[{"title":"","content":"","impact":"","priority":""}]}
不要 markdown、不要解释、不要超出字段。`
            },
            { role: 'user', content: JSON.stringify(context, null, 0) }
        ]);
        const json = extractJson(content);
        const advice = (json && Array.isArray(json.advice)) ? json.advice : [];
        res.json(success({ advice, generatedAt: new Date().toISOString() }));
    } catch (err) { handleServerError(res, err); }
});

// AI 消费洞察
router.post('/insight', async (req, res) => {
    try {
        const provider = await getActiveProvider(req.userId);
        if (!provider) return res.status(400).json(fail('未配置 AI 服务商'));

        const month = (req.body && req.body.month) || new Date().toISOString().slice(0, 7);
        const [summary, prevSummary, budgets, goals, accounts, debts] = await Promise.all([
            db.query(`SELECT c.name, SUM(t.amount) as total, COUNT(*) as cnt FROM transactions t LEFT JOIN categories c ON t.category_id = c.id WHERE t.user_id = ? AND t.type = 'expense' AND DATE_FORMAT(t.date, '%Y-%m') = ? GROUP BY c.name ORDER BY total DESC`, [req.userId, month]),
            db.query(`SELECT SUM(t.amount) as total FROM transactions t WHERE t.user_id = ? AND t.type = 'expense' AND DATE_FORMAT(t.date, '%Y-%m') = DATE_FORMAT(DATE_SUB(?, INTERVAL 1 MONTH), '%Y-%m')`, [req.userId, month + '-01']),
            db.query('SELECT name, amount FROM budgets WHERE user_id = ? AND start_date <= CURDATE() AND end_date >= CURDATE()', [req.userId]),
            db.query("SELECT name, target_amount, current_amount FROM savings_goals WHERE user_id = ? AND status = 'active'", [req.userId]),
            db.query('SELECT name, balance, type FROM accounts WHERE user_id = ? ORDER BY balance DESC', [req.userId]),
            db.query("SELECT name, type, remaining, monthly_payment, status FROM debts WHERE user_id = ? AND status != 'paid_off'", [req.userId])
        ]);

        const curTotal = summary.reduce((s, r) => s + parseFloat(r.total), 0);
        const prevTotal = prevSummary[0] ? parseFloat(prevSummary[0].total || 0) : 0;
        const momRate = prevTotal > 0 ? ((curTotal - prevTotal) / prevTotal * 100).toFixed(1) : null;

        // 计算总负债和月供
        const totalDebt = debts.reduce((s, d) => s + parseFloat(d.remaining || 0), 0);
        const totalMonthlyPayment = debts.reduce((s, d) => s + parseFloat(d.monthly_payment || 0), 0);
        const totalAssets = accounts.reduce((s, a) => s + parseFloat(a.balance || 0), 0);
        const debtToAssetRatio = totalAssets > 0 ? (totalDebt / totalAssets * 100).toFixed(1) : '0';

        const context = {
            本月: month,
            本月支出合计: Math.round(curTotal * 100) / 100,
            上月支出合计: Math.round(prevTotal * 100) / 100,
            支出环比: momRate !== null ? `${momRate > 0 ? '+' : ''}${momRate}%` : '无上月数据',
            分类支出: summary.map(r => ({ 类别: r.name, 金额: Math.round(parseFloat(r.total) * 100) / 100, 笔数: r.cnt })),
            预算执行: budgets.map(b => ({ 名称: b.name, 预算: Math.round(parseFloat(b.amount) * 100) / 100 })),
            储蓄目标: goals.map(g => ({ 名称: g.name, 目标: Math.round(parseFloat(g.target_amount) * 100) / 100, 当前: Math.round(parseFloat(g.current_amount) * 100) / 100 })),
            账户余额: accounts.map(a => ({ 名称: a.name, 余额: Math.round(parseFloat(a.balance) * 100) / 100, 类型: a.type })),
            债务: {
                总负债: Math.round(totalDebt * 100) / 100,
                月供应付: Math.round(totalMonthlyPayment * 100) / 100,
                负债资产比: debtToAssetRatio + '%',
                明细: debts.map(d => ({
                    名称: d.name,
                    类型: d.type === 'credit_card' ? '信用卡' : d.type === 'loan' ? '贷款' : d.type === 'personal' ? '个人借贷' : '其他',
                    剩余: Math.round(parseFloat(d.remaining || 0) * 100) / 100,
                    月供: Math.round(parseFloat(d.monthly_payment || 0) * 100) / 100,
                    状态: d.status === 'overdue' ? '逾期' : '正常'
                }))
            }
        };

        const content = await callProvider(provider, [
            { role: 'system', content: `你是一位资深个人理财分析师。基于用户多维度财务数据，给出 3-5 条有真正洞察价值的分析，避免泛泛而谈。
要求：
1. 精准识别异常（某类超支、环比激增、预算执行率异常）
2. 结合余额与储蓄目标判断资金健康度
3. 必须分析债务负担：负债资产比（>50%为警戒）、月供占收入比（>40%为高压）、逾期笔数
4. 给出储蓄率、还款计划、提前还贷等可执行动作
5. 每条给出可执行的改善动作
返回纯 JSON，每条含：
- title：8字以内标题
- description：45字以内具体分析（含数据）
- action：15字以内行动建议
- level：重要程度，"warning"（需重视）/ "info"（关注）/ "tip"（小建议）三选一
{"insights":[{"title":"","description":"","action":"","level":""}]}
不要 markdown、不要解释、不要超出字段。` },
            { role: 'user', content: JSON.stringify(context, null, 0) }
        ]);
        const json = extractJson(content);
        const insights = (json && Array.isArray(json.insights)) ? json.insights : [];
        res.json(success({ insights, generatedAt: new Date().toISOString() }));
    } catch (err) { handleServerError(res, err); }
});

// OCR 配置
router.get('/ocr-config', async (req, res) => {
    try {
        const cfg = await db.queryOne('SELECT provider, secret_id, region FROM ai_ocr_config WHERE user_id = ?', [req.userId]);
        res.json(success(cfg ? {
            provider: cfg.provider,
            secret_id: maskKey(decrypt(cfg.secret_id)),
            region: cfg.region
        } : { provider: 'tencent', secret_id: '', region: 'ap-guangzhou' }));
    } catch (err) { handleServerError(res, err); }
});

router.post('/ocr-config', async (req, res) => {
    try {
        const { secret_id, secret_key, region } = req.body || {};
        // 如果 secret_id 是脱敏占位符（含 ...），说明前端未重新输入完整 Key，忽略该字段
        const idVal = secret_id && secret_id.trim();
        const keyVal = secret_key && secret_key.trim();
        const isMaskedId = idVal && idVal.includes('...');

        // 查询现有配置，用于字段未提供时保留原值
        const existing = await db.queryOne('SELECT * FROM ai_ocr_config WHERE user_id = ?', [req.userId]);

        if (!idVal && !existing) return res.status(400).json(fail('SecretId 必填'));
        if (!keyVal && !existing) return res.status(400).json(fail('SecretKey 必填'));

        const finalId = isMaskedId ? existing?.secret_id : (idVal ? encrypt(idVal) : existing?.secret_id);
        const finalKey = keyVal ? encrypt(keyVal) : existing?.secret_key;
        const finalRegion = (region || existing?.region || 'ap-guangzhou').trim();

        await db.query(
            `INSERT INTO ai_ocr_config (user_id, provider, secret_id, secret_key, region)
             VALUES (?, 'tencent', ?, ?, ?)
             ON DUPLICATE KEY UPDATE
             secret_id = VALUES(secret_id),
             secret_key = VALUES(secret_key),
             region = VALUES(region)`,
            [req.userId, finalId, finalKey, finalRegion]
        );
        res.json(success({ saved: true }, 'OCR 配置已保存'));
    } catch (err) { handleServerError(res, err); }
});

// 兜底：从 OCR 文字中用正则提取交易项（当 AI 不返回 JSON 时使用）
function fallbackExtractItems(ocrText, defaultDate) {

    // === 智能分类引擎：结合商户名+时间推断二级分类 ===
    function inferCategory(name, note, timeStr) {
        const text = ((name || '') + ' ' + (note || '')).toLowerCase();

        // 从支付时间推断餐别（中餐类时按时间段修正）
        let mealBias = null;
        if (timeStr) {
            const hourMatch = timeStr.match(/(\d{1,2}):(\d{2})/);
            if (hourMatch) {
                const h = parseInt(hourMatch[1]);
                if (h >= 5 && h < 10) mealBias = '早餐';
                else if (h >= 10 && h < 14) mealBias = '午餐';
                else if (h >= 14 && h < 21) mealBias = '晚餐';
                else mealBias = '晚餐'; // 深夜归晚餐
            }
        }

        // 一级分类（兜底）
        const level1 = [
            { kw: ['药','医','体检','医院','诊所','挂号','牙','眼','疫苗','保健','药房','药局','处方','感冒','咳嗽'], cat: '医疗' },
            { kw: ['车','油','打车','滴滴','地铁','公交','停车','高速','etc','加油站','充电','骑行','共享单车'], cat: '交通' },
            { kw: ['酒店','机票','火车票','民宿','旅行','行李','托运','景点','门票'], cat: '旅行' },
            { kw: ['房','租','水电','物业','燃气','暖气','网费'], cat: '住房' },
            { kw: ['电影','游戏','健身','运动','k歌','ktv','演出','展览','游泳'], cat: '娱乐' },
            { kw: ['课','书','学','培训','教育','考试','报名','文具'], cat: '教育' },
            { kw: ['话费','流量','宽带','手机','充值','通信','快递'], cat: '通讯' },
            { kw: ['购','买','京东','淘宝','天猫','拼多多','超市','便利店','商场','百货','日用品','家居','数码'], cat: '购物' },
            { kw: ['礼','红包','人情','结婚','生日','聚会','请客'], cat: '人情' },
            { kw: ['衣','鞋','包','化妆','美容','护肤','美发'], cat: '美容' },
            { kw: ['猫粮','狗粮','猫砂','宠物'], cat: '宠物' },
            { kw: ['保险','保费','理赔','社保'], cat: '保险' },
            { kw: ['加油','中石化','中石油'], cat: '爱车' },
        ];

        // 二级分类（精确匹配）
        const level2 = [
            // 餐饮二级
            { kw: ['早餐','早','包子','豆浆','油条','粥','肠粉','煎饼'], cat: '早餐' },
            { kw: ['盒饭','盖饭','便当','食堂','米线','麻辣烫','冒菜','披萨'], cat: '午餐' },
            { kw: ['饼','面','粉','饭','卷','汤','饺子','馄饨','炒饭','拌面','粥'], cat: '午餐' },
            { kw: ['晚餐','晚','夜宵','宵夜','烧烤','串','火锅','烤鱼','小龙虾','大排档','炸鸡','汉堡','炒菜','炒'], cat: '晚餐' },
            { kw: ['肯德基','麦当劳','汉堡王','必胜客','华莱士','德克士','星巴克','瑞幸','海底捞','呷哺','九田家','西贝','外婆家','绿茶餐厅','探鱼','蛙来哒','太二','喜茶','奈雪','一点点','coco','蜜雪冰城','古茗','霸王茶姬','乐乐茶'], cat: '外卖' },
            { kw: ['水果','糖','巧克力','冰淇淋','薯片','坚果','瓜子','饮料','矿泉水','咖啡','奶茶','茶','可乐','雪碧'], cat: '零食' },
            { kw: ['聚餐','聚会','请客','饭局','订餐','酒席'], cat: '聚餐' },
            { kw: ['外卖','美团','饿了么','配送'], cat: '外卖' },
            { kw: ['菜','肉','蛋','鱼','虾','鸡','鸭','牛','羊','小吃','馆','餐厅','饭店'], cat: '晚餐' },
            { kw: ['奶茶店','饮品','甜品','蛋糕','面包','烘焙'], cat: '零食' },
            // 交通二级
            { kw: ['地铁','公交','一卡通','交通卡'], cat: '公交地铁' },
            { kw: ['打车','滴滴','曹操','T3','首汽','花小猪','出租车','的士'], cat: '打车' },
            { kw: ['火车','高铁','机票','飞机','12306','携程','飞猪','航旅'], cat: '火车飞机' },
            { kw: ['共享单车','哈啰','美团单车','骑行','单车'], cat: '公交地铁' },
            { kw: ['加油站','中石化','中石油','汽油','柴油'], cat: '加油' },
            { kw: ['充电','充电桩','特来电','星星充电'], cat: '充电' },
            { kw: ['停车','停车场','泊车','车位'], cat: '停车费' },
            { kw: ['过路费','高速','ETC','通行费'], cat: '过路费' },
            // 购物二级
            { kw: ['超市','百货','日用品','纸巾','洗衣','垃圾袋','清洁'], cat: '日用百货' },
            { kw: ['服装','衣服','鞋','包','裤','衣','袜','帽','围巾'], cat: '服装鞋包' },
            { kw: ['数码','手机','电脑','耳机','平板','充电宝','鼠标','键盘'], cat: '数码产品' },
            { kw: ['家居','家具','床','桌','椅','柜','沙发','灯','窗帘'], cat: '家居家具' },
            // 住房二级
            { kw: ['房租','租金','房东','中介','租房'], cat: '房租' },
            { kw: ['电费','水费','燃气','煤气','天然气'], cat: '水电燃气' },
            { kw: ['物业','物管','管理费'], cat: '物业费' },
            { kw: ['维修','修理','疏通','漏水'], cat: '维修' },
            // 医疗二级
            { kw: ['门诊','挂号','诊所','医生','看病','检查','化验'], cat: '门诊' },
            { kw: ['药','药品','药房','药店','处方'], cat: '药品' },
            // 教育二级
            { kw: ['培训','课程','网课','补习','辅导班','学而思','新东方'], cat: '培训课程' },
            { kw: ['书','书籍','教材','书店','当当','kindle'], cat: '书籍' },
            { kw: ['考试','报名','雅思','托福','考研','考公'], cat: '考试报名' },
            // 通讯二级
            { kw: ['话费','手机费','sim卡','中国移动','中国联通','中国电信','移动','联通','电信'], cat: '话费' },
            { kw: ['宽带','网费','光纤','wifi'], cat: '宽带' },
            { kw: ['快递','顺丰','圆通','中通','申通','韵达','邮政','EMS'], cat: '快递' },
            // 娱乐二级
            { kw: ['电影','影院','猫眼','淘票票','imax'], cat: '电影演出' },
            { kw: ['游戏','steam','switch','ps','xbox','手游','充值','皮肤'], cat: '游戏' },
            { kw: ['健身','跑步','瑜伽','游泳','球','器械','私教','运动'], cat: '运动健身' },
            { kw: ['旅游','景点','门票','度假'], cat: '旅游度假' },
            { kw: ['ktv','唱歌','酒吧','蹦迪','livehouse'], cat: 'KTV酒吧' },
            // 人情二级
            { kw: ['父母','爸','妈','爹','娘','老人','长辈'], cat: '孝敬父母' },
            { kw: ['红包','送礼','礼物','份子钱','彩礼'], cat: '送礼红包' },
            // 宠物二级
            { kw: ['猫粮','狗粮','罐头','冻干','宠物食品'], cat: '主粮零食' },
            // 美容二级
            { kw: ['护肤','面膜','精华','乳液','防晒','洗面奶','水乳'], cat: '护肤' },
            { kw: ['美发','理发','烫发','染发','洗剪吹','造型'], cat: '美发' },
            // 收入二级
            { kw: ['基本工资','底薪','月薪','工资条'], cat: '基本工资' },
            { kw: ['奖金','年终奖','绩效','提成','分红'], cat: '奖金' },
            { kw: ['补贴','报销','差旅','餐饮补贴','交通补贴','房补'], cat: '补贴报销' },
            { kw: ['理财收益','利息','基金','股票','余额宝'], cat: '理财收益' },
            { kw: ['房租收入','收租'], cat: '房租收入' },
        ];

        // 先尝试匹配二级分类
        for (const rule of level2) {
            for (const kw of rule.kw) {
                if (text.includes(kw)) {
                    // 餐饮类（早/午/晚餐）用支付时间修正
                    if (mealBias && ['早餐','午餐','晚餐','外卖'].includes(rule.cat)) {
                        return mealBias;
                    }
                    return rule.cat;
                }
            }
        }
        // 再匹配一级
        for (const rule of level1) {
            for (const kw of rule.kw) {
                if (text.includes(kw)) return rule.cat;
            }
        }
        return '其他';
    }

    function inferNote(ocrText, name, amount) {
        // 从 OCR 文字提取有意义的交易描述，排除支付渠道/账户信息
        // 提取"商品"行的内容作为备注
        const productMatch = ocrText.match(/商品\s*(.+)/);
        if (productMatch) return productMatch[1].trim();
        // 否则用交易名本身
        return name || '消费';
    }

    // 从 OCR 提取完整支付时间（用于餐别推断和精确时间）
    const ocrDateTime = (() => {
        const m1 = ocrText.match(/支付时间\s*(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日\s*(\d{1,2}):(\d{2}):(\d{2})/);
        if (m1) return `${m1[1]}-${m1[2].padStart(2,'0')}-${m1[3].padStart(2,'0')} ${m1[4].padStart(2,'0')}:${m1[5].padStart(2,'0')}:${m1[6].padStart(2,'0')}`;
        const m2 = ocrText.match(/支付时间\s*(\d{4}-\d{2}-\d{2})\s*(\d{1,2}):(\d{2}):(\d{2})/);
        if (m2) return `${m2[1]} ${m2[2].padStart(2,'0')}:${m2[3].padStart(2,'0')}:${m2[4].padStart(2,'0')}`;
        return null;
    })();
    const ocrTime = (() => {
        const m = ocrText.match(/支付时间.*?(\d{1,2}):(\d{2})/)
               || ocrText.match(/(\d{1,2}):(\d{2}):\d{2}/);
        return m ? `${m[1]}:${m[2]}` : null;
    })();

    const items = [];
    const seen = new Set();
    const lines = ocrText.split('\n').map(l => l.trim()).filter(Boolean);
    const skipKeywords = /合计|总计|小计|总金额|优惠|退款|实付|找零|应付|应收|余额|折扣|满减|立减/i;
    const noiseKeywords = /支付金额|支付|消费|收款|订单|交易|当前状态|付款方式|账单详情/i;

    let contextDate = defaultDate;
    const globalDateMatch = ocrText.match(/(\d{4}[-\/]\d{2}[-\/]\d{2})|(\d{4}年\d{1,2}月\d{1,2}日)/);
    if (globalDateMatch) {
        contextDate = globalDateMatch[1]
            ? globalDateMatch[1].replace(/\//g, '-')
            : globalDateMatch[2].replace(/(\d{4})年(\d{1,2})月(\d{1,2})日/, (a, y, m, d) => `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`);
    }
    if (ocrDateTime) contextDate = ocrDateTime;

    // 解析单行中的完整日期时间，保留时间部分
    function parseDateFromLine(line) {
        if (!line) return contextDate;
        // 优先匹配完整时间：2026年7月17日 17:23:49 或 2026-07-17 17:23:49
        const ftm1 = line.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日\s+(\d{1,2}):(\d{2}):(\d{2})/);
        if (ftm1) return `${ftm1[1]}-${ftm1[2].padStart(2,'0')}-${ftm1[3].padStart(2,'0')} ${ftm1[4].padStart(2,'0')}:${ftm1[5].padStart(2,'0')}:${ftm1[6].padStart(2,'0')}`;
        const ftm2 = line.match(/(\d{4}-\d{2}-\d{2})\s+(\d{1,2}):(\d{2}):(\d{2})/);
        if (ftm2) return `${ftm2[1]} ${ftm2[2].padStart(2,'0')}:${ftm2[3].padStart(2,'0')}:${ftm2[4].padStart(2,'0')}`;
        // 只有日期时尝试从附近补充时间
        const m1 = line.match(/(\d{4}[-\/]\d{2}[-\/]\d{2})/);
        if (m1) return m1[1].replace(/\//g, '-');
        const m2 = line.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
        if (m2) {
            const date = `${m2[1]}-${m2[2].padStart(2, '0')}-${m2[3].padStart(2, '0')}`;
            // 尝试从同一行后面提取时间
            const tm = line.match(/(\d{1,2}):(\d{2}):(\d{2})/);
            if (tm) return `${date} ${tm[1].padStart(2,'0')}:${tm[2].padStart(2,'0')}:${tm[3].padStart(2,'0')}`;
            return date;
        }
        return contextDate;
    }

    function addItem(name, amount, date, note) {
        const key = `${name}|${amount.toFixed(2)}`;
        if (seen.has(key)) return;
        seen.add(key);
        const category = inferCategory(name, note || '', ocrTime);
        items.push({
            name: name.slice(0, 50),
            amount,
            type: category === '收入' ? 'income' : 'expense',
            date,
            note: note || inferNote(ocrText, name),
            category
        });
    }

    function isNoiseLine(line) {
        return !line || line.length > 60 || skipKeywords.test(line) || noiseKeywords.test(line)
            || /^\d{4}[-\/]\d{2}[-\/]\d{2}/.test(line) || /^\d{4}年\d{1,2}月/.test(line)
            || /^\d{2}:\d{2}/.test(line) || /^\d{10,}$/.test(line)
            || /^(?:交易单号|商户单号|收单机构|支付方式|商家小程序|账单服务)/.test(line);
    }

    function findMerchantName(startIdx, maxLookBack = 5) {
        for (let k = 1; k <= maxLookBack && startIdx - k >= 0; k++) {
            const candidate = lines[startIdx - k].trim();
            if (isNoiseLine(candidate)) continue;
            const productMatch = candidate.match(/^商品\s*(.+)/);
            if (productMatch) return productMatch[1].trim();
            return candidate;
        }
        return null;
    }

    // 策略1: 微信支付格式 — "商户名" 行后跟 "支付金额 ¥xx.xx"
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const payMatch = line.match(/支付金额\s*[¥￥]?\s*(\d{1,10}(?:\.\d{1,2})?)/);
        if (!payMatch || i === 0) continue;
        const amount = parseFloat(payMatch[1]);
        if (!amount || amount <= 0 || amount > 999999) continue;

        let merchantName = lines[i - 1];
        // 如果前一行的上一行是日期，则商户名是更前一行
        if (i > 1 && /^\d{4}[-\/]\d{2}[-\/]\d{2}/.test(merchantName)) {
            merchantName = lines[i - 2] || merchantName;
        }
        if (skipKeywords.test(merchantName) || noiseKeywords.test(merchantName)) continue;
        if (merchantName.length < 1 || merchantName.length > 60) continue;

        // 查找附近的日期（保留时间）
        let date = contextDate;
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
            const dtm = lines[j].match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日(?:\s+(\d{1,2}):(\d{2}):(\d{2}))?/);
            if (dtm) {
                date = `${dtm[1]}-${dtm[2].padStart(2,'0')}-${dtm[3].padStart(2,'0')}` +
                       (dtm[4] ? ` ${dtm[4].padStart(2,'0')}:${dtm[5].padStart(2,'0')}:${dtm[6].padStart(2,'0')}` : '');
                break;
            }
            const dm = lines[j].match(/(\d{4}[-\/]\d{2}[-\/]\d{2})(?:\s+(\d{1,2}):(\d{2}):(\d{2}))?/);
            if (dm) {
                date = dm[1].replace(/\//g, '-') +
                       (dm[2] ? ` ${dm[2].padStart(2,'0')}:${dm[3].padStart(2,'0')}:${dm[4].padStart(2,'0')}` : '');
                break;
            }
        }
        addItem(merchantName, amount, date);
    }

    // 策略2: 支付宝格式 — 商户名在上一行，"消费 ¥xx.xx" 在当前行
    for (let i = 1; i < lines.length; i++) {
        const m = lines[i].match(/^(?:消费|收款|支出|收入)\s*[¥￥]?\s*(\d{1,10}(?:\.\d{1,2})?)/);
        if (!m) continue;
        const amount = parseFloat(m[1]);
        if (!amount || amount <= 0 || amount > 999999) continue;

        let name = lines[i - 1];
        if (/^\d{4}[-\/]\d{2}[-\/]\d{2}/.test(name)) name = lines[i - 2] || name;
        if (skipKeywords.test(name) || noiseKeywords.test(name)) continue;
        if (name.length < 1 || name.length > 60) continue;

        let date = contextDate;
        for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
            const dm = lines[j].match(/(\d{4}[-\/]\d{2}[-\/]\d{2})/);
            if (dm) { date = dm[1].replace(/\//g, '-'); break; }
        }
        addItem(name, amount, date);
    }

    // 策略3: 通用格式 — "商户名 ¥xx.xx"（排除含消费/支出/收入关键词的行，留给策略4）
    const genericRe = /^(.{1,50}?)\s+[¥￥]?\s*(\d{1,10}(?:\.\d{1,2})?)\s*(?:元)?\s*$/;
    for (const line of lines) {
        if (skipKeywords.test(line) || noiseKeywords.test(line)) continue;
        if (line.length > 100) continue;
        if (/(?:消费|收款|支出|收入)/.test(line)) continue;
        const m = line.match(genericRe);
        if (!m) continue;
        let name = m[1].trim();
        const amount = parseFloat(m[2]);
        if (!amount || amount <= 0 || amount > 999999) continue;
        name = name.replace(/^\d{4}[-\/]\d{2}[-\/]\d{2}\s*/, '');
        if (name.length < 2 || name.length > 60) continue;
        if (/^\d{2}:\d{2}/.test(name)) continue;
        // 过滤状态栏噪声：纯数字、单字母、无明显语义的短串
        if (/^\d+$/.test(name)) continue;
        if (/^[a-zA-Z]$/.test(name)) continue;
        if (/^\d+[a-zA-Z]$/.test(name) || /^[a-zA-Z]\d+$/.test(name)) continue;
        addItem(name, amount, contextDate);
    }

    // 策略4: 同行格式 — "商户名 消费/支出 ¥xx.xx"
    const inlineTypeRe = /^(.{1,40}?)\s+(?:消费|收款|支出|收入)\s*[¥￥]?\s*(\d{1,10}(?:\.\d{1,2})?)/;
    for (const line of lines) {
        if (skipKeywords.test(line) || noiseKeywords.test(line)) continue;
        if (line.length > 100) continue;
        const m = line.match(inlineTypeRe);
        if (!m) continue;
        let name = m[1].trim();
        const amount = parseFloat(m[2]);
        if (!amount || amount <= 0 || amount > 999999) continue;
        if (name.length < 2 || name.length > 60) continue;
        if (/^\d{4}[-\/]\d{2}[-\/]\d{2}/.test(name)) continue;
        // 过滤状态栏噪声
        if (/^\d+$/.test(name) || /^[a-zA-Z]$/.test(name) || /^\d+[a-zA-Z]$/.test(name) || /^[a-zA-Z]\d+$/.test(name)) continue;
        addItem(name, amount, contextDate);
    }

    // 策略5: 微信账单详情格式 — 金额是独立的负数行如 "-4.00"，向上找商户名/商品名
    const negativeAmountRe = /^-\s*(\d{1,10}(?:\.\d{1,2})?)\s*$/;
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        const m = line.match(negativeAmountRe);
        if (!m) continue;
        const amount = parseFloat(m[1]);
        if (!amount || amount <= 0 || amount > 999999) continue;

        // 优先使用 "商品" 行提取名称
        let name = null;
        for (let k = 1; k <= 8 && i - k >= 0; k++) {
            const prev = lines[i - k].trim();
            const productMatch = prev.match(/^商品\s*(.+)/);
            if (productMatch) { name = productMatch[1].trim(); break; }
        }
        if (!name) name = findMerchantName(i, 8);
        if (!name) continue;

        // 从附近提取日期
        let date = contextDate;
        for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
            const d = parseDateFromLine(lines[j]);
            if (d !== contextDate) { date = d; break; }
        }
        if (date === contextDate) {
            for (let j = i - 1; j >= Math.max(0, i - 6); j--) {
                const d = parseDateFromLine(lines[j]);
                if (d !== contextDate) { date = d; break; }
            }
        }
        addItem(name, amount, date);
    }

    return items;
}

// OCR 识别
router.post('/ocr', async (req, res) => {
    try {
        if (!req.file) return res.status(400).json(fail('请上传图片'));
        const imageBase64 = req.file.buffer.toString('base64');
        if (!imageBase64) return res.status(400).json(fail('图片内容为空'));

        const cfg = await db.queryOne('SELECT * FROM ai_ocr_config WHERE user_id = ?', [req.userId]);
        if (!cfg || !cfg.secret_id || !cfg.secret_key) {
            return res.status(400).json(fail('请先前往「AI配置」页面设置腾讯云 OCR 密钥'));
        }

        const client = new OcrClient({
            credential: { secretId: decrypt(cfg.secret_id), secretKey: decrypt(cfg.secret_key) },
            region: cfg.region || 'ap-guangzhou'
        });
        const ocrResult = await client.GeneralAccurateOCR({ ImageBase64: imageBase64 });
        const textDetections = ocrResult.TextDetections || [];
        const ocrText = textDetections.map(d => d.DetectedText || '').filter(Boolean).join('\n');

        console.log(`[OCR] user=${req.userId} textLen=${ocrText.length} preview=${ocrText.slice(0, 200).replace(/\n/g, ' ')}`);

        if (!ocrText) {
            return res.json(success({ text: '', items: [], reason: 'OCR 未识别到文字，请尝试上传更清晰的账单截图' }));
        }

        const provider = await getActiveProvider(req.userId);
        const today = new Date().toISOString().slice(0, 10);

        // 策略：正则先试（0ms），能解析直接返回；解析不出再调 AI（省 2-3s）
        const fallbackItems = fallbackExtractItems(ocrText, today);
        if (fallbackItems.length > 0) {
            console.log(`[OCR REGEX] user=${req.userId} extracted ${fallbackItems.length} items via regex (fast path)`);
            return res.json(success({ text: ocrText, items: fallbackItems, reason: '' }));
        }

        // 正则未能提取，尝试 AI
        if (!provider) {
            return res.json(success({ text: ocrText, items: [], reason: '未配置 AI 服务商且未能从 OCR 文字中自动提取交易项，请先配置 AI 服务商或手动输入' }));
        }

        const prompt = `提取 OCR 中的交易记录。只返回纯 JSON：
{"items":[{"name":"商户","amount":4.00,"type":"expense","date":"2026-07-17 17:23:49","note":"描述","category":"晚餐"}]}
规则：金额正数；日期完整 YYYY-MM-DD HH:mm:ss；跳过合计/优惠/退款行。
二级分类：早餐|午餐|晚餐|零食|聚餐|外卖|饮料|生鲜|公交地铁|打车|火车飞机|加油|充电|停车费|过路费|日用百货|服装鞋包|数码产品|家居家具|房租|水电燃气|物业费|维修|电影演出|游戏|运动健身|旅游度假|KTV酒吧|门诊|药品|体检|培训课程|书籍|考试报名|话费|宽带|快递|孝敬父母|送礼红包|护肤|美发|主粮零食|社保|商业保险|维保费|车险|其他
餐别按时间：05-10早餐 10-14午餐 14-21晚餐
OCR：
${ocrText}`;

        const content = await callProvider(provider, [
            { role: 'user', content: prompt }
        ]);
        console.log(`[OCR AI] user=${req.userId} rawReply=${(content || '').slice(0, 500)}`);
        const json = extractJson(content);
        const items = (json && Array.isArray(json.items)) ? json.items : [];
        const reason = items.length > 0
            ? ''
            : 'AI 未能从识别结果中解析出交易项，建议检查 AI 服务商是否可用，或手动输入';
        res.json(success({ text: ocrText, items, reason }));
    } catch (err) {
        console.error('[OCR ERROR]', err && err.stack ? err.stack : err);
        handleServerError(res, err, 'OCR 识别');
    }
});

module.exports = router;
