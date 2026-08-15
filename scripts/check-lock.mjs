#!/usr/bin/env node
// 提交前校验：package-lock.json 与 package.json 的直接依赖是否同步，
// 防止依赖漂移（文档方向④）。纯 Node 实现，无外部依赖、不联网。
import fs from 'fs';

const dirs = ['.', 'server'];
let ok = true;

for (const d of dirs) {
  const pkgPath = `${d}/package.json`;
  const lockPath = `${d}/package-lock.json`;
  if (!fs.existsSync(pkgPath)) continue;
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  if (!fs.existsSync(lockPath)) {
    console.log(`· ${d}: 无 package-lock.json（跳过，建议运行 npm install 生成）`);
    continue;
  }
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  const want = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const rootPkg = (lock.packages && lock.packages['']) || {};
  const have = { ...(rootPkg.dependencies || {}), ...(rootPkg.devDependencies || {}) };

  for (const [name, range] of Object.entries(want)) {
    if (!(name in have)) {
      console.error(`✗ ${d}: ${name} 在 package.json 但不在 package-lock.json`);
      ok = false;
    } else if (have[name] !== range) {
      console.error(`✗ ${d}: ${name} 版本漂移  package.json=${range}  lock=${have[name]}`);
      ok = false;
    }
  }
}

if (!ok) {
  console.error('\nlock 与 package.json 不一致，请运行 `npm install` 后再提交 lock 文件。');
  process.exit(1);
}
console.log('✓ package-lock.json 与 package.json 同步');
