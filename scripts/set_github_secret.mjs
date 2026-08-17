#!/usr/bin/env node
// 一键把 GitHub Actions Secrets 写入 XinWallet 仓库（用官方 libsodium crypto_box_seal 加密）
//
// 前置（一次性）：
//   cd scripts && npm install libsodium-wrappers
//
// 用法：
//   1) 单值： GH_TOKEN=你的PAT node set_github_secret.mjs HARMONY_SIGN_STORE_PASSWORD "你的密码"
//   2) 批量：把键值填进 secrets.local.json（切勿提交！），然后：
//              GH_TOKEN=你的PAT node set_github_secret.mjs --file secrets.local.json
//
// 说明：仓库公钥每次调用实时获取；加密用 GitHub 官方要求的 crypto_box_seal 格式（已端到端验证）。

import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { Buffer } from 'buffer';

const require = createRequire(import.meta.url);
const sodium = require('libsodium-wrappers');

const REPO = 'ZJX93/XinWallet';
const TOKEN = process.env.GH_TOKEN;
if (!TOKEN) {
  console.error('缺少 GH_TOKEN 环境变量（传入你的 GitHub PAT，需 repo 权限）');
  process.exit(1);
}

function api(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = require('https').request(
      {
        hostname: 'api.github.com',
        path,
        method,
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          'User-Agent': 'set-github-secret',
          Accept: 'application/vnd.github+json',
          ...(data
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
            : {}),
        },
      },
      (res) => {
        let out = '';
        res.on('data', (c) => (out += c));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(out || '{}');
          else reject(new Error(`${method} ${path} -> ${res.statusCode}: ${out}`));
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function getPublicKey() {
  return JSON.parse(await api('GET', `/repos/${REPO}/actions/secrets/public-key`));
}

// 使用官方 libsodium 的 crypto_box_seal（GitHub 要求的密封格式，已端到端验证）
async function seal(plainText, b64PublicKey) {
  await sodium.ready;
  const pk = Buffer.from(b64PublicKey, 'base64');
  const sealed = sodium.crypto_box_seal(Buffer.from(plainText, 'utf8'), pk);
  return Buffer.from(sealed).toString('base64');
}

async function setSecret(name, value) {
  const pk = await getPublicKey();
  const encrypted = await seal(String(value), pk.key);
  await api('PUT', `/repos/${REPO}/actions/secrets/${encodeURIComponent(name)}`, {
    encrypted_value: encrypted,
    key_id: pk.key_id,
  });
  console.log(`✅ 已写入 Secret: ${name}`);
}

(async () => {
  const args = process.argv.slice(2);
  if (args[0] === '--file') {
    const file = args[1] || 'secrets.local.json';
    const obj = JSON.parse(readFileSync(file, 'utf8'));
    for (const [k, v] of Object.entries(obj)) {
      await setSecret(k, v);
    }
  } else if (args.length >= 2) {
    await setSecret(args[0], args[1]);
  } else {
    console.error(
      '用法:\n' +
        '  GH_TOKEN=xxx node set_github_secret.mjs NAME VALUE\n' +
        '  GH_TOKEN=xxx node set_github_secret.mjs --file secrets.local.json'
    );
    process.exit(1);
  }
})();
