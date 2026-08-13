#!/usr/bin/env bash
# 生成 XinWallet 私有发布密钥库，并打印证书指纹，供 ApkVerifier.EXPECTED_CERT_SHA256 使用。
# 用法：bash android/generate_release_key.sh
#
# 生成的 release-key.jks 是「私有发布密钥」，等同于你的应用身份，
# 请妥善保管、切勿提交进仓库；发布用的 APK 必须用它签名（见 build.gradle.kts 的 releaseSign）。
set -euo pipefail

cd "$(dirname "$0")"

KEYSTORE="release-key.jks"
ALIAS="xinwallet"
# 自动生成强密码（24 位字母数字），避免弱口令
STOREPASS="$(openssl rand -base64 18 | tr -dc 'A-Za-z0-9' | head -c 24)"
KEYPASS="$STOREPASS"

if [ -f "$KEYSTORE" ]; then
  echo "⚠️  $KEYSTORE 已存在，先删除再运行本脚本以重新生成。"
  exit 1
fi

keytool -genkeypair -v \
  -keystore "$KEYSTORE" -storetype PKCS12 \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias "$ALIAS" \
  -dname "CN=XinWallet, OU=Mobile, O=XinWallet, L=Local, ST=Local, C=CN" \
  -storepass "$STOREPASS" -keypass "$KEYPASS"

echo
echo "----- 密钥库已生成: $KEYSTORE（请妥善保管，切勿提交进仓库）-----"
echo
echo "【证书 SHA-256 (hex, 无冒号) —— 填入 ApkVerifier.EXPECTED_CERT_SHA256】"
keytool -exportcert -alias "$ALIAS" -keystore "$KEYSTORE" -storepass "$STOREPASS" \
  | openssl sha256 -binary | openssl hexdump -v -e '/1 "%02x"'
echo
echo "【同一指纹的 Base64 形式（可选）】"
keytool -exportcert -alias "$ALIAS" -keystore "$KEYSTORE" -storepass "$STOREPASS" \
  | openssl sha256 -binary | openssl base64
echo
echo "【CI 注入示例（写入仓库 Secrets）】"
echo "  KEYSTORE_PATH=$KEYSTORE"
echo "  KEY_ALIAS=$ALIAS"
echo "  KEYSTORE_PASSWORD=$STOREPASS"
echo "  KEY_PASSWORD=$KEYPASS"
