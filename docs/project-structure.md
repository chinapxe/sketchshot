# 项目结构说明

更新日期：2026-04-08

## 总览

SketchShot 由 `frontend/`、`backend/`、`scripts/` 三个主要区域组成：

- `frontend/` 负责无限画布、节点交互、模板、执行面板和项目导入导出。
- `backend/` 负责 API、任务编排、模板服务、引擎适配器和运行期数据管理。
- `scripts/` 负责 Docker 启停、离线包打包、部署与校验脚本。
- `.github/` 负责 Issue / PR 模板、CI 工作流和依赖更新配置。

## 前端结构

### 入口与全局状态

- `frontend/src/main.tsx`、`frontend/src/App.tsx`：应用入口。
- `frontend/src/stores/useFlowStore.ts`：画布图数据、节点边操作、选择状态和主要业务状态入口。
- `frontend/src/stores/useAssetPreviewStore.ts`：资产预览弹窗相关状态。

### 组件层

- `frontend/src/components/Canvas/`：React Flow 画布承载层。
- `frontend/src/components/Nodes/`：核心节点实现。
  - 已包含 `SceneNode`、`CharacterNode`、`StyleNode`、`ShotNode`
  - 已包含 `ContinuityNode`、`ImageGenNode`、`VideoGenNode`
  - 已包含 `ThreeViewGenNode`、`ImageUploadNode`
  - 已包含 `ImageDisplayNode`、`VideoDisplayNode`
- `frontend/src/components/Toolbar/`：顶部工具栏与引擎入口。
- `frontend/src/components/Sidebar/`：节点与模板入口。
- `frontend/src/components/ExecutionCenter/`：批量执行与任务面板。
- `frontend/src/components/VersionCompare/`：生成版本对比。
- `frontend/src/components/AssetCenter/`：素材与结果资产面板。
- `frontend/src/components/ContextMenu/`、`frontend/src/components/QuickConnectMenu/`、`frontend/src/components/EdgeContextMenu/`：节点、连线和快速连接交互。

### 服务与工具

- `frontend/src/services/api.ts`：HTTP 请求封装。
- `frontend/src/services/websocket.ts`：任务状态推送。
- `frontend/src/services/threeViewGeneration.ts`、`videoGeneration.ts`、`continuityGeneration.ts`、`nodeGeneration.ts`：生成类服务封装。
- `frontend/src/services/workflowRunner.ts`、`workflowExport.ts`：执行和导出相关服务。
- `frontend/src/utils/projectExchange.ts`：项目导入导出结构。
- `frontend/src/utils/flowConnections.ts`：节点连线规则。
- `frontend/src/utils/threeView.ts`：三视图相关前端工具逻辑。
- `frontend/src/utils/storyboard.ts`、`shotSequences.ts`、`templateUtils.ts`：故事板与模板辅助逻辑。
- `frontend/src/templates/workflowTemplates.ts`：官方模板定义。

## 后端结构

### 入口与配置

- `backend/run.py`：本地启动入口。
- `backend/app/main.py`：FastAPI 应用入口。
- `backend/app/config.py`：运行配置读取。

### API 层

- `backend/app/api/generate.py`：图像 / 视频生成接口。
- `backend/app/api/prompts.py`：提示词生成接口。
- `backend/app/api/templates.py`：模板相关接口。
- `backend/app/api/workflows.py`：工作流相关接口。
- `backend/app/api/assets.py`：素材与输出文件访问。
- `backend/app/api/ws.py`：WebSocket 推送。
- `backend/app/api/engine_settings.py`：引擎配置读取与保存。

### 服务层

- `backend/app/services/task_service.py`：任务执行与状态编排。
- `backend/app/services/workflow_service.py`：工作流层编排。
- `backend/app/services/template_service.py`：模板服务。
- `backend/app/services/prompt_service.py`：提示词能力封装。
- `backend/app/services/engine_config_service.py`：引擎配置持久化。
- `backend/app/services/three_view_split_service.py`：三视图拆分相关逻辑。
- `backend/app/services/volcengine_client.py`：Volcengine API 客户端封装。

### 适配器层

- `backend/app/adapters/base.py`：适配器基类与约定。
- `backend/app/adapters/registry.py`：适配器注册与发现。
- `backend/app/adapters/mock_adapter.py`：本地演示 / 占位适配器。
- `backend/app/adapters/volcengine_adapter.py`：Volcengine 适配器。
- `backend/app/adapters/comfyui_adapter.py`：ComfyUI 适配器。

### 测试与运行数据

- `backend/tests/`：后端测试，覆盖模板、任务、三视图拆分、引擎配置等关键服务。
- `backend/data/uploads/`：用户上传素材。
- `backend/data/outputs/`：生成结果输出。
- `backend/data/workflows/`：工作流保存目录。
- `backend/data/engine_config.json`：前端保存的运行时引擎配置，已加入忽略列表。

## 常见改动的落点

### 新增一个节点

通常需要同步检查以下位置：

- `frontend/src/components/Nodes/`：节点 UI 与输入输出定义
- `frontend/src/stores/useFlowStore.ts`：节点默认数据、图操作、序列化状态
- `frontend/src/utils/flowConnections.ts`：连接规则与兼容关系
- `frontend/src/templates/workflowTemplates.ts`：如果要出现在官方模板中
- `frontend/src/services/` 与 `backend/app/api/generate.py`：如果节点会触发后端执行

### 新增一个模板

通常需要同步检查以下位置：

- `frontend/src/templates/workflowTemplates.ts`
- `frontend/src/utils/templateUtils.ts`
- `backend/app/services/template_service.py`
- `backend/app/api/templates.py`

### 新增一个引擎适配器

通常需要同步检查以下位置：

- `backend/app/adapters/`
- `backend/app/adapters/registry.py`
- `backend/app/services/engine_config_service.py`
- `backend/app/api/engine_settings.py`
- 前端工具栏中与引擎配置相关的入口

### 修改项目导入导出格式

优先检查以下位置：

- `frontend/src/utils/projectExchange.ts`
- `frontend/src/utils/templateUtils.ts`
- `frontend/src/stores/useFlowStore.ts`
- 相关测试文件
