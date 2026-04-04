# SketchShot

**以无限画布为载体的故事板 AI 创作工具。**

在画布上组织场次、角色、风格与镜头，由 AI 直接生成分镜图像和视频片段。

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)
![ReactFlow](https://img.shields.io/badge/ReactFlow-12-FF0072)
![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)

---

## 核心功能

- **故事板节点** - 场次、角色、风格、镜头节点协同工作，构成“设定 -> 镜头 -> 生成”的完整创作链路
- **AI 图像与视频生成** - 接入火山引擎，支持文生图、图生图、图生视频
- **角色一致性** - 角色三视图绑定，跨镜头保持形象稳定
- **连续镜头** - 首帧 / 尾帧约束、九宫格动作节拍，支持连续片段创作
- **版本对比** - 同一镜头多次生成结果可并排比较
- **项目持久化** - 本地草稿自动保存，刷新不丢失；支持导入 / 导出文件包
- **模板上手引导** - 内置多套故事板模板，分类展示并附操作引导
- **Docker 部署** - 前后端均已容器化，支持在线运行与离线交付

---

## 快速开始

### Docker 运行（推荐）

前置条件：

- 已安装并启动 Docker Desktop
- 当前仓库代码完整
- 如需真实调用火山引擎，准备好可用的 API Key

说明：

- 当前本地仓库目录名可能仍为 `WXHB`，但产品正式名已经统一为 `SketchShot`
- 在线 Docker 运行默认前端端口是 `8080`，后端端口是 `8000`

```powershell
Set-Location E:\2026\WXHB

if (-not (Test-Path .env.docker)) {
  Copy-Item .env.docker.example .env.docker
}

# 如需在部署前预置火山配置，可按需填写：
# WXHB_ARK_API_KEY=你的火山引擎密钥
# 其余 Ark / 模型参数也可在启动后通过前端“工具栏 -> 引擎”界面配置
# 保存后会写入 backend/data/engine_config.json

.\scripts\docker-build.ps1 -Action up
```

启动后默认访问：

- 前端：`http://localhost:8080/`
- 后端健康检查：`http://localhost:8000/api/health`

引擎配置说明：

- 日常推荐直接在前端右上角工具栏点击“引擎”进行配置
- 可配置项包括 `ARK_BASE_URL`、`ARK_API_KEY`、提示词模型、文生图模型、图像编辑模型、视频模型
- 配置会保存到 `backend/data/engine_config.json`
- Docker 在线运行和离线部署都会将 `/app/data` 挂载到本地目录，因此该配置在容器重建后仍会保留
- `.env.docker` / `.env` 中的火山变量现在主要用于首次启动默认值、无人值守部署或无法进入前端时的兜底配置

常用补充命令：

```powershell
.\scripts\docker-build.ps1 -Action build
.\scripts\docker-build.ps1 -Action ps
.\scripts\docker-build.ps1 -Action logs
.\scripts\docker-build.ps1 -Action down
```

### 离线交付说明

这里的“离线交付”指：

- 目标机器部署时不需要重新拉取 Docker 镜像、npm 依赖或 Python 依赖
- 可通过源机器打包出的离线包直接完成部署

需要特别注意的边界：

- 如果目标机器仍然使用火山引擎，目标机器必须能够访问 `ARK_BASE_URL`
- 如果目标机器完全隔离外网，火山引擎链路无法工作，此时只能使用 `mock` 或其他可在目标环境访问到的适配器

详细步骤请参见 [交付部署说明](./交付部署说明.md)。

---

## 本地开发

前置条件：

- Node.js 20+
- Python 3.11+

### 1. 准备后端默认配置

后端会从 `backend\.env` 读取默认配置。这里仍建议保留端口、默认适配器、超时等基础项；火山引擎的 Ark 地址、API Key 和模型 ID，日常使用推荐在前端“工具栏 -> 引擎”中配置。

`backend\.env` 里建议至少保留以下变量：

```env
DEBUG=True
DEFAULT_ADAPTER=volcengine
VOLCENGINE_REQUEST_TIMEOUT=180
VOLCENGINE_VIDEO_TIMEOUT=900
```

补充说明：

- 如果希望首次启动就预置火山配置，也可以继续在 `backend\.env` 中填写 `ARK_API_KEY` 与模型参数
- 一旦前端保存过引擎配置，后端会优先使用 `backend/data/engine_config.json` 中的值

### 2. 启动后端

```powershell
Set-Location .\backend
pip install -r requirements.txt
python run.py
```

### 3. 启动前端

```powershell
Set-Location .\frontend
npm install
npm run dev
```

本地开发默认访问：

- 前端：`http://localhost:3000/`
- 后端：`http://localhost:8000/`

说明：

- 本地前端默认通过 Vite 代理转发 `/api`、`/ws`、`/uploads`、`/outputs`
- 一般不需要额外设置 `VITE_API_BASE_URL` 或 `VITE_WS_BASE_URL`

---

## 验证命令

后端：

```powershell
python -m unittest discover -s backend/tests -p "test_*.py"
```

前端：

```powershell
Set-Location .\frontend
npm test
npm run build
```

正式交付前，建议按 [正式验收清单](./正式验收清单.md) 再做一轮完整验收。

---

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 19 · ReactFlow · Zustand · Ant Design · Vite |
| 后端 | FastAPI · Python 3.11 · WebSocket |
| AI 接入 | 火山引擎（文生图 / 图生图 / 图生视频） |
| 部署 | Docker · Docker Compose |

---

## 项目结构

```text
SketchShot/  （当前本地仓库目录名可能仍为 WXHB）
├── frontend/               前端项目
│   └── src/
│       ├── components/     画布、节点、面板等 UI
│       ├── stores/         Zustand 状态管理
│       ├── templates/      内置工作流模板
│       └── utils/          故事板逻辑、持久化、导入导出等工具
├── backend/                后端项目
│   └── app/
│       ├── adapters/       AI 适配器层
│       ├── services/       任务调度、提示词、工作流服务
│       └── api/            HTTP + WebSocket 接口
├── scripts/                Docker 构建与离线交付脚本
├── docker-compose.yml
├── docker-compose.offline.yml
└── offline-bundle/         离线交付产物输出目录
```

---

## 相关文档

- [开发计划](./开发计划.md)
- [工作交接文档](./工作交接文档.md)
- [当前阶段工作总结](./当前阶段工作总结.md)
- [交付部署说明](./交付部署说明.md)
- [正式验收清单](./正式验收清单.md)
