# 首次发布到 GitHub 指引

更新日期：2026-04-09 18:27:26 +08:00

## 适用场景

这份指引用于 SketchShot 在首次公开到 GitHub 前做最后一轮检查，并完成第一次远端推送。

## 发布前先确认

1. 已轮换曾暴露过的真实密钥。
2. 已确认哪些中文交接 / 验收 / 阶段总结文档不进入公开仓库。
3. 已决定许可证类型，并补充 `LICENSE`。
4. 已检查截图、示例素材、输出结果不包含隐私数据或版权风险内容。
5. 已确认当前工作区里只保留你打算公开提交的文件。
6. 已确认不会把真实 `KEY`、Token、密码、私有证书或运行期配置文件带进 GitHub。

## 发布前必须单独检查的敏感文件

公开仓库里应保留的是“示例配置”，不应保留“真实运行配置”。

默认不要提交这些文件：

- `backend/.env`
- `.env.docker`
- `.env.offline`
- `frontend/.env`
- `backend/data/engine_config.json`
- 本地导出的日志、截图、测试输出、离线包产物

默认可以提交的是这些示例文件：

- `backend/.env.example`
- `frontend/.env.example`
- `frontend/.env.production.example`
- `.env.docker.example`
- `.env.offline.example`

如果你不确定某个文件是否已被忽略，先执行：

```powershell
git check-ignore backend/.env .env.docker frontend/.env backend/data/engine_config.json
```

如果命令没有返回预期路径，先修正 `.gitignore`，再继续发布。

## 建议的首次发布顺序

### 1. 检查当前变更

```powershell
git status
git diff --stat
```

如果工作区里还有不准备公开的本地文件，请先整理清楚再提交。

### 2. 检查远端仓库

当前仓库如果还没有远端，可先添加：

```powershell
git remote add origin https://github.com/chinapxe/sketchshot.git
```

如果远端已经存在，可先确认：

```powershell
git remote -v
```

### 3. 统一默认分支名称

如果你准备使用 GitHub 常见的 `main` 作为默认分支，可执行：

```powershell
git branch -M main
```

如果你打算继续沿用 `master`，当前仓库的 CI 也已兼容。

### 4. 选择性暂存文件

首次公开提交时，建议优先暂存这些对外文件：

- `README.md`
- `ROADMAP.md`
- `CONTRIBUTING.md`
- `CODE_OF_CONDUCT.md`
- `SECURITY.md`
- `SUPPORT.md`
- `.github/`
- `docs/`
- 示例配置文件与忽略规则

示例：

```powershell
git add README.md ROADMAP.md CONTRIBUTING.md CODE_OF_CONDUCT.md SECURITY.md SUPPORT.md
git add .github docs .gitignore .editorconfig .gitattributes
git add frontend/.env.example frontend/.env.production.example
git add .env.docker.example .env.offline.example backend/.env.example
```

### 5. 再检查一次待提交内容

```powershell
git status
git diff --cached --stat
```

确认没有把 `.env`、运行产物、私有文档或不想公开的本地文件一起带上去。

再额外做一轮“疑似密钥”排查：

```powershell
git diff --cached | Select-String -Pattern "API_KEY|ACCESS_KEY|SECRET|TOKEN|PASSWORD|PRIVATE KEY|BEGIN RSA|BEGIN OPENSSH"
```

如果这里出现的是：

- `YOUR_ARK_API_KEY`
- `YOUR_DASHSCOPE_API_KEY`
- `ALIYUN_ACCESS_KEY_ID`
- `ALIYUN_ACCESS_KEY_SECRET`
- 其他示例占位符或文档中的环境变量名

通常是正常的。

如果这里出现的是：

- 真实的 Key 值
- 带长度特征的令牌字符串
- 私钥正文
- `.env` 里的完整配置内容

就不要提交，先把文件移出暂存区或改成占位符。

必要时可单独检查“已暂存文件列表”：

```powershell
git diff --cached --name-only
```

确保最终进入 GitHub 的是“代码、文档、示例配置”，而不是“真实运行凭据”。

### 6. 创建首个公开提交

```powershell
git commit -m "chore: prepare repository for open source release"
```

### 7. 首次推送

如果远端默认分支是 `main`：

```powershell
git push -u origin main
```

如果你保留的是 `master`：

```powershell
git push -u origin master
```

## 推送后建议立刻处理

- 在 GitHub 仓库页补充描述、Topic、网站地址和社交预览图。
- 启用 Issues、Discussions、Projects 或 Wiki 时，保持与仓库实际维护能力一致。
- 启用 GitHub Private Vulnerability Reporting。
- 检查 Actions 中的 CI 是否已正常运行。
- 用一个干净浏览器窗口查看 README、Issue 模板和文档显示效果。

## 一句话建议

首次公开推送时，宁可少公开一点，也不要把内部文档、真实凭据或临时文件一并带上去。先把仓库主入口做干净，后续再逐步补内容。
