# Contributing to SketchShot

更新日期：2026-04-08

## 开始前

- 先阅读 [README.md](./README.md) 与 [docs/project-structure.md](./docs/project-structure.md)。
- 所有本地配置都应从 example 文件复制后自行修改，不要提交 `.env`、引擎配置或生成产物。
- 如果暂时没有真实模型服务权限，建议把后端默认适配器切换为 `mock`，先完成前端流程和交互开发。

## 本地开发

1. 复制后端配置：

   ```powershell
   Copy-Item backend\.env.example backend\.env
   ```

2. 如需自定义前端 API 地址，可复制前端示例配置：

   ```powershell
   Copy-Item frontend\.env.example frontend\.env
   ```

   大多数本地开发场景不需要这一步，因为 Vite 会代理后端请求。

3. 启动后端：

   ```powershell
   Set-Location .\backend
   pip install -r requirements.txt
   python run.py
   ```

4. 启动前端：

   ```powershell
   Set-Location ..\frontend
   npm install
   npm run dev
   ```

## 贡献建议

- 一次提交尽量只解决一类问题，例如 `feat/*`、`fix/*`、`docs/*`。
- 涉及 API、节点数据结构、模板结构或导入导出格式的改动，请同步更新测试和文档。
- 前端不要硬编码 API 地址与端口，统一从配置或代理层读取。
- 与运行时相关的本地文件应保持在忽略列表内，不要直接纳入仓库。
- 新问题和新需求优先使用 GitHub 提供的 Issue 模板，方便维护者快速分类。
- 发起 PR 时建议按模板补充影响范围和验证方式，减少来回追问。

## 提交前自检

- 后端测试：

  ```powershell
  python -m unittest discover -s backend/tests -p "test_*.py"
  ```

- 前端测试：

  ```powershell
  Set-Location .\frontend
  npm test
  npm run build
  ```

- 文档自检：
- README、贡献说明和相关示例是否仍与实际目录结构一致。
- 是否误提交了 `.env`、`backend/data/engine_config.json`、上传素材、输出图片或视频。
- 如果是 UI / 工作流改动，是否补充了模板、截图、录屏或最少说明。

## 常见联动点

- 新增节点通常需要同时检查：
  - `frontend/src/components/Nodes/`
  - `frontend/src/stores/useFlowStore.ts`
  - `frontend/src/utils/flowConnections.ts`
  - `frontend/src/templates/workflowTemplates.ts`

- 新增后端能力通常需要同时检查：
  - `backend/app/api/`
  - `backend/app/services/`
  - `backend/app/adapters/`
  - `backend/tests/`

- 修改项目导入导出结构时，优先检查：
  - `frontend/src/utils/projectExchange.ts`
  - `frontend/src/utils/templateUtils.ts`
  - `frontend/src/stores/useFlowStore.ts`
  - 对应测试文件
