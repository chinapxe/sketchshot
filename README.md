# SketchShot

**以无限画布为载体的故事板 AI 创作工具。**

在画布上组织场次、角色、风格与镜头，由 AI 直接生成分镜图像和视频片段。

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)
![ReactFlow](https://img.shields.io/badge/ReactFlow-12-FF0072)
![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)

<!-- 建议放一张画布截图 -->
<!-- ![SketchShot 画布预览](./docs/screenshot.png) -->

---

## 核心功能

- **故事板节点** — 场次、角色、风格、镜头节点协同工作，构成"设定 → 镜头 → 生成"的完整创作链路
- **AI 图像 & 视频生成** — 接入火山引擎，支持文生图、图生图、图生视频
- **角色一致性** — 角色三视图绑定，跨镜头保持形象稳定
- **连续镜头** — 首帧 / 尾帧约束、九宫格动作节拍，支持连续片段创作
- **版本对比** — 同一镜头多次生成结果可并排比较
- **项目持久化** — 本地草稿自动保存，刷新不丢失；支持导入 / 导出文件包
- **模板上手引导** — 内置多套故事板模板，分类展示并附操作引导
- **Docker 部署** — 前后端均已容器化，支持在线与离线两种交付模式

---

## 快速部署

**前置条件：** Docker + Docker Compose 已安装

```bash
# 1. 克隆仓库
git clone https://github.com/your-username/sketchshot.git
cd sketchshot

# 2. 配置环境变量
cp .env.docker.example .env
# 编辑 .env，填入火山引擎 API Key

# 3. 启动
docker compose up -d
```

访问 `http://localhost:5173` 即可使用。

> **离线部署**（无法访问外网的目标机器）：参见 [交付部署说明](./交付部署说明.md)

---

## 本地开发

**前置条件：** Node.js 20+、Python 3.11+

```bash
# 后端
cd backend
pip install -r requirements.txt
cp .env.example .env   # 填入 API Key
uvicorn app.main:app --reload

# 前端（新开终端）
cd frontend
npm install
npm run dev
```

前端默认访问 `http://localhost:5173`，后端默认 `http://localhost:8000`。

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

```
sketchshot/
├── frontend/               # React 前端
│   └── src/
│       ├── components/Nodes/   # 故事板节点组件
│       ├── stores/             # Zustand 状态管理
│       ├── templates/          # 内置工作流模板
│       └── utils/              # 持久化、导入导出等工具
├── backend/                # FastAPI 后端
│   └── app/
│       ├── adapters/           # AI 平台适配器
│       ├── services/           # 任务调度、提示词、工作流
│       └── api/                # HTTP + WebSocket 接口
├── scripts/                # Docker 构建与离线交付脚本
├── docker-compose.yml
└── docker-compose.offline.yml
```

---

## 相关文档

- [开发计划](./开发计划.md)
- [交付部署说明](./交付部署说明.md)
- [当前阶段工作总结](./当前阶段工作总结.md)
