# 开源准备清单

更新日期：2026-04-08

## 本轮已完成

- 将根 `README.md` 改写为公开仓库首页版本。
- 新增 `CONTRIBUTING.md`，明确本地开发与提交流程。
- 新增 `SECURITY.md`，补上安全反馈与凭据约定。
- 新增 `CODE_OF_CONDUCT.md`，补充公开协作行为约定。
- 新增 `ROADMAP.md` 与 `SUPPORT.md`，补充公开协作入口。
- 新增 `docs/project-structure.md`，方便后续维护者理解前后端结构。
- 新增 `docs/repository-content-review.md`，用于筛选哪些文档适合公开。
- 新增 `docs/first-publish-guide.md`，整理首次推送到 GitHub 的操作建议。
- 补强 `.gitignore`，避免本地环境文件、运行产物和引擎配置误入仓库。
- 新增 `.editorconfig` 与 `.gitattributes`，统一跨平台编辑与换行规范。
- 将前端环境文件改为 example 形式，便于开源仓库分发。
- 清理 `火山引擎参考.md` 中的真实 Key，改为占位符。
- 新增 GitHub Issue / PR 模板、Dependabot 配置和基础 CI 工作流。

## 公开仓库前仍需人工确认

- 选择并补充 `LICENSE`。
- 确认 GitHub 仓库描述、主题标签、默认分支、保护规则和可见性。
- 决定哪些中文交付 / 交接 / 验收文档继续公开，哪些迁移到 `docs/`，哪些不进入开源仓库。
  可参考 `docs/repository-content-review.md`
- 确认是否需要补充项目截图、演示 GIF 或示例工作流截图。
- 在 `SECURITY.md` 中补充正式的安全联系渠道，或启用 GitHub Private Vulnerability Reporting。

## 强烈建议

- 立即轮换曾经出现在仓库文档中的火山引擎 Key。即使现在已替换为占位符，也应按“已泄露”处理。
- 如果真实 Key 曾进入 Git 历史，请在公开仓库前清理历史，再执行首次公开推送。
- 检查所有示例工作流、截图、素材、输出图片和视频，确认不包含客户数据、隐私信息或第三方版权内容。
- 首次公开时从 `v0.x` 版本开始，避免对外形成“稳定版已承诺”的误解。

## 后续可继续补充

- `LICENSE`
- `.github/DISCUSSION_TEMPLATE/`
- 发布说明与版本日志
