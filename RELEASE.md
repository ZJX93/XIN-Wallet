# 鑫钱包 · 版本发布与镜像构建

## 📦 自动构建机制

由 `.github/workflows/release-image.yml` 实现。当推送形如 `v*.*.*` 的 tag 时，自动触发：

1. **多架构构建**：`linux/amd64` + `linux/arm64`
2. **推送到 GHCR**：`ghcr.io/zjx93/xin-wallet/xinwallet`
3. **同时打上 latest 标签**（如果是 SemVer tag）

## 🚀 发布新版本

### 第一次发布（从 v0.0.1 开始）

```bash
# 确认所有改动已提交
git status

# 创建 tag 并推送
git tag v0.0.1
git push origin v0.0.1
```

### 后续版本

按 SemVer 规范递增：`v0.0.1` → `v0.0.2` → `v0.1.0` → `v1.0.0`

```bash
# 补丁版本（bug 修复）
git tag v0.0.2 && git push origin v0.0.2

# 小版本（新功能）
git tag v0.1.0 && git push origin v0.1.0

# 主版本（破坏性变更）
git tag v1.0.0 && git push origin v1.0.0
```

## 📥 拉取镜像

```bash
# 最新稳定版
docker pull ghcr.io/zjx93/xin-wallet/xinwallet:latest

# 指定版本
docker pull ghcr.io/zjx93/xin-wallet/xinwallet:v0.0.1
```

## 🔧 配置 GitHub Packages 权限（首次）

1. 进入 https://github.com/ZJX93/XIN-Wallet/settings/actions
2. "Workflow permissions" 选择 **Read and write permissions**
3. 勾选 "Allow GitHub Actions to create and approve pull requests"
4. 保存

否则 workflow 推送镜像到 GHCR 会因权限不足失败。

## 📊 查看构建进度

https://github.com/ZJX93/XIN-Wallet/actions/workflows/release-image.yml

## 🔄 本地测试构建

docker-compose.yml 中引用远程镜像时使用 `ghcr.io/zjx93/xin-wallet/xinwallet:latest`：

```yaml
image: ghcr.io/zjx93/xin-wallet/xinwallet:latest
```

如果使用本地构建，将该行改为：

```yaml
build:
  context: .
  dockerfile: Dockerfile
```
