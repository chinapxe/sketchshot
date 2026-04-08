# SketchShot

SketchShot 是一个面向影视分镜、角色设定与 AI 视觉生成的节点式创作工具。它把场次、角色、风格、镜头、连续镜头、三视图、图像生成、视频生成与结果预览放到同一张无限画布里，让创作、迭代和复用都围绕一个可视化工作流展开。

> 仓库正在整理为公开开源项目，当前文档以中文为主。

## 功能亮点

- 节点式故事板工作流：场次、角色、风格、镜头与生成节点可自由编排。
- 角色一致性：角色节点支持多视图输入，适合跨镜头复用角色设定。
- 三视图生成节点：可基于单张参考图生成三视图，支持输出拼图或三张独立图，并直接接入角色节点。
- 连续镜头创作：支持首帧 / 尾帧约束、动作节拍与视频生成链路。
- 版本对比与资产沉淀：同一镜头可多次生成并对比结果，素材可沉淀到项目内继续复用。
- 模板与项目持久化：支持官方模板、本地保存、项目导入导出。
- 双运行模式：支持本地开发、Docker Compose 和离线交付脚本。

## 技术栈

- 前端：React 19、React Flow、Zustand、Ant Design、Vite
- 后端：FastAPI、Pydantic、WebSocket
- 适配器：Mock、Volcengine、ComfyUI
- 工程化：Docker Compose、PowerShell 脚本、Vitest、Python unittest

## 仓库结构

```text
SketchShot/
├── frontend/                  React 前端
│   └── src/
│       ├── components/        画布、节点、面板、上下文菜单
│       ├── services/          API、WebSocket 与工作流执行封装
│       ├── stores/            Zustand 状态管理
│       ├── templates/         官方工作流模板
│       └── utils/             导入导出、布局、连接规则、执行辅助
├── backend/                   FastAPI 后端
│   ├── app/
│   │   ├── adapters/          AI 适配器与注册表
│   │   ├── api/               HTTP / WebSocket 接口
│   │   ├── models/            请求与响应模型
│   │   └── services/          工作流、任务、模板、引擎配置服务
│   ├── tests/                 后端测试
│   └── data/                  运行期数据目录（已忽略生成产物）
├── scripts/                   Docker、离线包、启动与校验脚本
├── docs/                      公开维护文档
├── docker-compose.yml
└── docker-compose.offline.yml
```

更细的维护入口见 [docs/project-structure.md](./docs/project-structure.md)。

## 路线图

- 公开版路线图见 [ROADMAP.md](./ROADMAP.md)
- 首次发布 GitHub 的操作建议见 [docs/first-publish-guide.md](./docs/first-publish-guide.md)

## 快速开始

### 本地开发

1. 准备后端配置：

   ```powershell
   Copy-Item backend\.env.example backend\.env
   ```

   如果暂时没有火山引擎配置，可将 `backend/.env` 中的 `DEFAULT_ADAPTER` 改为 `mock`。

2. 启动后端：

   ```powershell
   Set-Location .\backend
   pip install -r requirements.txt
   python run.py
   ```

3. 启动前端：

   ```powershell
   Set-Location ..\frontend
   npm install
   npm run dev
   ```

4. 默认访问地址：

- 前端：`http://localhost:3000/`
- 后端健康检查：`http://localhost:8000/api/health`

前端开发环境默认通过 Vite 代理 `/api`、`/ws`、`/uploads`、`/outputs`，通常不需要额外设置 API 地址。如需自定义，可参考 `frontend/.env.example` 与 `frontend/.env.production.example` 创建本地配置文件。

### Docker Compose

```powershell
Copy-Item .env.docker.example .env.docker
.\scripts\docker-build.ps1 -Action up
```

默认访问地址：

- 前端：`http://localhost:8080/`
- 后端健康检查：`http://localhost:8000/api/health`

如果端口被占用，请调整 `.env.docker` 中的映射值，或修改本地运行配置。

## 配置说明

- `backend/.env.example`：本地开发默认配置模板。
- `.env.docker.example`：Docker Compose 在线运行示例配置。
- `.env.offline.example`：离线部署参考配置。
- `backend/data/engine_config.json`：前端工具栏保存的引擎配置，属于本地运行数据，已加入忽略列表。

说明：
- Docker 相关环境变量目前仍保留 `WXHB_` 前缀，用于兼容现有离线交付和脚本链路，不影响公开使用。

火山引擎相关参数支持两种配置方式：

- 在 `.env` / `.env.docker` 中预置默认值，适合首启或无人值守部署。
- 在前端“工具栏 -> 引擎”里保存运行配置，适合日常调试与多模型切换。

## 开发与验证

后端测试：

```powershell
python -m unittest discover -s backend/tests -p "test_*.py"
```

前端测试与构建：

```powershell
Set-Location .\frontend
npm test
npm run build
```

## 维护文档

- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)
- [SECURITY.md](./SECURITY.md)
- [SUPPORT.md](./SUPPORT.md)
- [ROADMAP.md](./ROADMAP.md)
- [docs/project-structure.md](./docs/project-structure.md)
- [docs/open-source-checklist.md](./docs/open-source-checklist.md)
- [docs/first-publish-guide.md](./docs/first-publish-guide.md)

## GitHub 协作

- 仓库已补充 Issue 模板、PR 模板和基础 CI，便于公开协作。
- CI 当前会自动执行后端单元测试，以及前端测试和生产构建。
