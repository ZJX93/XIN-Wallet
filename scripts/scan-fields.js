// 静态扫描 render/refresh 函数的字段访问，与 demo server 实际返回对比
const fs = require('fs');
const src = fs.readFileSync('js/app.js', 'utf8');

// 找到所有 refresh / render 函数
const fns = [];
const re = /(async\s+)?(refresh|render\w*)\s*\([^)]*\)\s*\{/g;
let m;
while ((m = re.exec(src)) !== null) {
    let depth = 0;
    let i = m.index + m[0].length - 1;
    for (; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') {
            depth--;
            if (depth === 0) {
                fns.push({ name: m[0].trim().split('{')[0], body: src.slice(m.index, i + 1) });
                break;
            }
        }
    }
}

// 提取每个函数读的所有字段
const ignoreRoots = ['document', 'window', 'this', 'chart', 'currentTarget', 'target', 'console', 'localStorage', 'history', 'location', 'navigator', 'setTimeout', 'setInterval', 'Promise', 'Date', 'Math', 'Number', 'Array', 'Object', 'JSON', 'Math', 'String'];
const fieldAccess = {};
fns.forEach(f => {
    const fields = new Set();
    const re2 = /\b([a-zA-Z_$][\w$]*)\.([a-zA-Z_$][\w$]*)/g;
    let mm;
    while ((mm = re2.exec(f.body)) !== null) {
        if (ignoreRoots.includes(mm[1])) continue;
        // 排除已知的非 API 字段根（DOM 元素、chart 等）
        if (/^(ctx|c1|c2|canvas|el|cfg|opts|parent|child|c$|acc)$/.test(mm[1])) continue;
        fields.add(mm[2]);
    }
    fieldAccess[f.name] = [...fields];
});

// 输出
console.log(`# 找到 ${fns.length} 个 render/refresh 函数\n`);
const interesting = Object.entries(fieldAccess).filter(([k]) => /refresh|render/.test(k));
console.log(`# 其中 ${interesting.length} 个 render/refresh\n`);

const totals = {};
interesting.forEach(([name, fields]) => {
    fields.forEach(f => { totals[f] = (totals[f] || 0) + 1; });
});

console.log(`# 字段使用频次（按 render 函数计数）:\n`);
Object.entries(totals).sort((a, b) => b[1] - a[1]).forEach(([field, count]) => {
    console.log(`  ${field}: ${count}`);
});
