/**
 * 画布浮动工具栏
 * 补齐阶段 2.5 工具栏能力，并提供工作流保存/加载入口
 */
import { memo, useCallback, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useReactFlow } from '@xyflow/react'
import {
  Button,
  Dropdown,
  Empty,
  Input,
  Modal,
  Popconfirm,
  Tooltip,
  message,
  type MenuProps,
} from 'antd'
import {
  UndoOutlined,
  RedoOutlined,
  ClearOutlined,
  SaveOutlined,
  FolderOpenOutlined,
  FileAddOutlined,
  BorderOutlined,
  SelectOutlined,
  AppstoreOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
  FullscreenOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
  ImportOutlined,
  DownloadOutlined,
  ExportOutlined,
  OrderedListOutlined,
  PictureOutlined,
  HistoryOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons'
import AssetCenter from '../AssetCenter'
import ExecutionCenter from '../ExecutionCenter'
import VersionCompare from '../VersionCompare'
import { useFlowStore } from '../../stores/useFlowStore'
import {
  createWorkflow,
  deleteWorkflow,
  getWorkflow,
  listWorkflows,
  updateWorkflow,
  type WorkflowListItem,
} from '../../services/api'
import { executeWorkflow } from '../../services/workflowRunner'
import { exportWorkflowAssetsAsZip } from '../../services/workflowExport'
import {
  exportProjectExchangeFile,
  readProjectExchangeFile,
} from '../../utils/projectExchange'
import { WorkflowCycleError } from '../../utils/workflowExecution'
import { getWorkflowCreditSummary } from '../../utils/workflowMetrics'
import { workflowTemplates, type WorkflowTemplateDefinition } from '../../templates/workflowTemplates'
import type { AppEdge, AppNode, AppNodeType } from '../../types'
import './style.css'

const templateCategoryMeta: Record<
  WorkflowTemplateDefinition['category'],
  { title: string; description: string }
> = {
  recommended: {
    title: '推荐起步',
    description: '第一次使用建议优先从这里开始，能最快理解新节点怎样串起来工作。',
  },
  storyboard: {
    title: '故事板组织',
    description: '适合熟悉多个镜头如何围绕同一角色和同一场次展开。',
  },
  character: {
    title: '角色设定',
    description: '适合先稳定角色设定，再把角色带进后续镜头。',
  },
  video: {
    title: '视频镜头',
    description: '适合学习图生视频、连续动作和首尾帧约束。',
  },
  compare: {
    title: '方案对比',
    description: '适合比较不同风格、不同方向的结果差异。',
  },
  basic: {
    title: '基础链路',
    description: '只想先熟悉上传、生成、预览这些基础能力时，从这里开始。',
  },
}

type TemplateGuideSection = {
  key: 'setup' | 'generate' | 'output'
  title: string
  description: string
  nodes: string[]
}

const templateSetupTypes = new Set<AppNodeType>(['imageUpload', 'scene', 'character', 'style'])
const templateGenerateTypes = new Set<AppNodeType>(['imageGen', 'videoGen', 'shot'])
const templateOutputTypes = new Set<AppNodeType>(['imageDisplay', 'videoDisplay'])

function sortTemplateNodes(nodes: AppNode[]): AppNode[] {
  return [...nodes].sort((left, right) => {
    if (left.position.x !== right.position.x) {
      return left.position.x - right.position.x
    }

    return left.position.y - right.position.y
  })
}

function getTemplateNodeName(node: AppNode): string {
  switch (node.type) {
    case 'shot':
      return node.data.title || node.data.label
    case 'scene':
      return node.data.title || node.data.label
    case 'character':
      return node.data.name || node.data.label
    case 'style':
      return node.data.name || node.data.label
    default:
      return node.data.label || node.type
  }
}

function buildTemplateGuideSections(template: WorkflowTemplateDefinition): TemplateGuideSection[] {
  const orderedNodes = sortTemplateNodes(template.nodes)
  const mapNodeNames = (types: Set<AppNodeType>) =>
    orderedNodes.filter((node) => types.has(node.type)).map((node) => getTemplateNodeName(node))

  const sections: TemplateGuideSection[] = [
    {
      key: 'setup',
      title: '1. 先准备设定',
      description: '先补全左侧的设定和参考输入，让后续节点获得稳定上下文。',
      nodes: mapNodeNames(templateSetupTypes),
    },
    {
      key: 'generate',
      title: '2. 再执行核心节点',
      description: '按画布连线方向从左到右执行生成节点；如果存在分支，可以分别运行比较。',
      nodes: mapNodeNames(templateGenerateTypes),
    },
    {
      key: 'output',
      title: '3. 最后查看结果',
      description: '输出节点主要用于承接和预览图像或视频结果。',
      nodes: mapNodeNames(templateOutputTypes),
    },
  ]

  return sections.filter((section) => section.nodes.length > 0)
}

const Toolbar = memo(() => {
  const { fitView, zoomIn, zoomOut } = useReactFlow<AppNode>()

  const undo = useFlowStore((s) => s.undo)
  const redo = useFlowStore((s) => s.redo)
  const canUndo = useFlowStore((s) => s.canUndo)
  const canRedo = useFlowStore((s) => s.canRedo)
  const nodes = useFlowStore((s) => s.nodes)
  const edges = useFlowStore((s) => s.edges)
  const selectAll = useFlowStore((s) => s.selectAll)
  const autoLayout = useFlowStore((s) => s.autoLayout)
  const clearCanvas = useFlowStore((s) => s.clearCanvas)
  const currentWorkflowId = useFlowStore((s) => s.currentWorkflowId)
  const currentWorkflowName = useFlowStore((s) => s.currentWorkflowName)
  const isWorkflowExecuting = useFlowStore((s) => s.isWorkflowExecuting)
  const setWorkflowMeta = useFlowStore((s) => s.setWorkflowMeta)
  const loadWorkflow = useFlowStore((s) => s.loadWorkflow)
  const importFileInputRef = useRef<HTMLInputElement | null>(null)

  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false)
  const [isLoadModalOpen, setIsLoadModalOpen] = useState(false)
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false)
  const [appliedTemplateGuide, setAppliedTemplateGuide] = useState<WorkflowTemplateDefinition | null>(null)
  const [isAssetCenterOpen, setIsAssetCenterOpen] = useState(false)
  const [isExecutionCenterOpen, setIsExecutionCenterOpen] = useState(false)
  const [isVersionCompareOpen, setIsVersionCompareOpen] = useState(false)
  const [compareNodeId, setCompareNodeId] = useState<string | null>(null)
  const [workflowNameDraft, setWorkflowNameDraft] = useState(currentWorkflowName)
  const [workflowList, setWorkflowList] = useState<WorkflowListItem[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [isLoadingList, setIsLoadingList] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isProjectExporting, setIsProjectExporting] = useState(false)
  const [isProjectImporting, setIsProjectImporting] = useState(false)
  const [activeWorkflowId, setActiveWorkflowId] = useState<string | null>(null)
  const [isDockCollapsed, setIsDockCollapsed] = useState(false)

  const hasCanvasContent = nodes.length > 0 || edges.length > 0
  const creditSummary = useMemo(() => getWorkflowCreditSummary(nodes), [nodes])
  const executeDescription = useMemo(() => {
    if (creditSummary.executableNodeCount === 0) {
      return '当前工作流中没有可执行的生成节点'
    }

    if (creditSummary.cachedNodeCount > 0) {
      return `将执行 ${creditSummary.executableNodeCount} 个生成节点，预计消耗 ${creditSummary.estimatedCredits} 点，其中 ${creditSummary.cachedNodeCount} 个节点可复用缓存。`
    }

    return `将执行 ${creditSummary.executableNodeCount} 个生成节点，预计消耗 ${creditSummary.estimatedCredits} 点。`
  }, [creditSummary.cachedNodeCount, creditSummary.estimatedCredits, creditSummary.executableNodeCount])

  const workflowLabel = useMemo(() => {
    if (currentWorkflowId) return `当前工作流：${currentWorkflowName}`
    return `未保存工作流：${currentWorkflowName}`
  }, [currentWorkflowId, currentWorkflowName])
  const groupedTemplates = useMemo(() => {
    const order: WorkflowTemplateDefinition['category'][] = [
      'recommended',
      'storyboard',
      'character',
      'video',
      'compare',
      'basic',
    ]

    return order
      .map((category) => ({
        category,
        meta: templateCategoryMeta[category],
        templates: workflowTemplates.filter((template) => template.category === category),
      }))
      .filter((group) => group.templates.length > 0)
  }, [])
  const appliedTemplateSections = useMemo(
    () => (appliedTemplateGuide ? buildTemplateGuideSections(appliedTemplateGuide) : []),
    [appliedTemplateGuide]
  )

  const scheduleFitView = useCallback(() => {
    window.requestAnimationFrame(() => {
      void fitView({ padding: 0.2, duration: 300 })
    })
  }, [fitView])

  const formatTime = useCallback((value: string) => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleString('zh-CN', { hour12: false })
  }, [])

  const handleNewWorkflow = useCallback(() => {
    clearCanvas()
    setWorkflowMeta(null, '未命名工作流')
    message.success('已新建空白工作流')
  }, [clearCanvas, setWorkflowMeta])

  const showNewWorkflowConfirm = useCallback(() => {
    Modal.confirm({
      title: '新建工作流',
      content: '将清空当前画布内容，并从一张新的故事板开始。',
      okText: '确认',
      cancelText: '取消',
      onOk: handleNewWorkflow,
    })
  }, [handleNewWorkflow])

  const handleSelectAll = useCallback(() => {
    selectAll()
    message.success(`已选中 ${nodes.length} 个节点`)
  }, [nodes.length, selectAll])

  const handleAutoLayout = useCallback(() => {
    autoLayout()
    scheduleFitView()
    message.success('已完成智能整理，节点与连线已自动散开')
  }, [autoLayout, scheduleFitView])

  const handleZoomIn = useCallback(() => {
    void zoomIn({ duration: 200 })
  }, [zoomIn])

  const handleZoomOut = useCallback(() => {
    void zoomOut({ duration: 200 })
  }, [zoomOut])

  const handleFitView = useCallback(() => {
    scheduleFitView()
  }, [scheduleFitView])

  const handleExecuteWorkflow = useCallback(async () => {
    try {
      const result = await executeWorkflow()
      message.success(`工作流执行完成，已执行 ${result.executedNodeIds.length} 个生成节点`)
    } catch (error) {
      console.error('[工具栏] 工作流执行失败:', error)
      if (error instanceof WorkflowCycleError) {
        message.error(error.message)
        return
      }

      message.error(error instanceof Error ? error.message : '工作流执行失败')
    }
  }, [])

  const handleExportWorkflow = useCallback(async () => {
    setIsExporting(true)

    try {
      const result = await exportWorkflowAssetsAsZip(currentWorkflowName, nodes)
      message.success(`导出完成，已打包 ${result.assetCount} 个资源`)
    } catch (error) {
      console.error('[工具栏] 导出工作流失败:', error)
      message.error(error instanceof Error ? error.message : '导出工作流失败')
    } finally {
      setIsExporting(false)
    }
  }, [currentWorkflowName, nodes])

  const handleExportProjectFile = useCallback(async () => {
    if (!hasCanvasContent) {
      message.warning('画布为空，先添加节点后再导出项目文件')
      return
    }

    setIsProjectExporting(true)

    try {
      const result = await exportProjectExchangeFile({
        workflowId: currentWorkflowId,
        name: currentWorkflowName,
        nodes,
        edges,
      })
      message.success(`项目文件已导出：${result.fileName}`)
    } catch (error) {
      console.error('[工具栏] 导出项目文件失败', error)
      message.error(error instanceof Error ? error.message : '导出项目文件失败')
    } finally {
      setIsProjectExporting(false)
    }
  }, [currentWorkflowId, currentWorkflowName, edges, hasCanvasContent, nodes])

  const handleOpenImportProjectFile = useCallback(() => {
    importFileInputRef.current?.click()
  }, [])

  const handleImportProjectFile = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      event.target.value = ''

      if (!file) {
        return
      }

      setIsProjectImporting(true)

      try {
        const importedWorkflow = await readProjectExchangeFile(file)
        loadWorkflow({
          id: null,
          name: importedWorkflow.name,
          nodes: importedWorkflow.nodes,
          edges: importedWorkflow.edges,
        })
        message.success(`已导入项目文件：${importedWorkflow.name}`)
        scheduleFitView()
      } catch (error) {
        console.error('[工具栏] 导入项目文件失败', error)
        message.error(error instanceof Error ? error.message : '导入项目文件失败')
      } finally {
        setIsProjectImporting(false)
      }
    },
    [loadWorkflow, scheduleFitView]
  )

  const openSaveModal = useCallback(() => {
    setWorkflowNameDraft(currentWorkflowName)
    setIsSaveModalOpen(true)
  }, [currentWorkflowName])

  const refreshWorkflowList = useCallback(async () => {
    setIsLoadingList(true)
    try {
      const workflows = await listWorkflows()
      setWorkflowList(workflows)
    } catch (error) {
      console.error('[工具栏] 获取工作流列表失败:', error)
      message.error('获取工作流列表失败，请检查后端服务')
    } finally {
      setIsLoadingList(false)
    }
  }, [])

  const openLoadModal = useCallback(async () => {
    setIsLoadModalOpen(true)
    await refreshWorkflowList()
  }, [refreshWorkflowList])

  const handleApplyTemplate = useCallback((template: WorkflowTemplateDefinition) => {
    loadWorkflow({
      id: null,
      name: template.name,
      nodes: template.nodes,
      edges: template.edges,
    })
    setIsTemplateModalOpen(false)
    setAppliedTemplateGuide(template)
    message.success(`已应用模板：${template.name}`)
    scheduleFitView()
  }, [loadWorkflow, scheduleFitView])

  const persistWorkflow = useCallback(async (mode: 'create' | 'update') => {
    if (!hasCanvasContent) {
      message.warning('画布为空，先添加节点后再保存')
      return
    }

    const name = workflowNameDraft.trim() || '未命名工作流'
    setIsSaving(true)

    try {
      const payload = {
        name,
        nodes,
        edges,
      }

      const workflow = mode === 'update' && currentWorkflowId
        ? await updateWorkflow(currentWorkflowId, payload)
        : await createWorkflow(payload)

      setWorkflowMeta(workflow.id, workflow.name)
      setWorkflowNameDraft(workflow.name)
      setIsSaveModalOpen(false)
      message.success(mode === 'update' ? '工作流已更新' : '工作流已保存')
    } catch (error) {
      console.error('[工具栏] 保存工作流失败:', error)
      message.error('保存工作流失败，请检查后端服务')
    } finally {
      setIsSaving(false)
    }
  }, [currentWorkflowId, edges, hasCanvasContent, nodes, setWorkflowMeta, workflowNameDraft])

  const handleLoadWorkflow = useCallback(async (workflowId: string) => {
    setActiveWorkflowId(workflowId)
    try {
      const workflow = await getWorkflow(workflowId)
      loadWorkflow({
        id: workflow.id,
        name: workflow.name,
        nodes: workflow.nodes as AppNode[],
        edges: workflow.edges as AppEdge[],
      })
      setIsLoadModalOpen(false)
      message.success(`已加载工作流：${workflow.name}`)
      scheduleFitView()
    } catch (error) {
      console.error('[工具栏] 加载工作流失败:', error)
      message.error('加载工作流失败，请检查后端服务')
    } finally {
      setActiveWorkflowId(null)
    }
  }, [loadWorkflow, scheduleFitView])

  const handleDeleteWorkflow = useCallback(async (workflowId: string) => {
    setActiveWorkflowId(workflowId)
    try {
      await deleteWorkflow(workflowId)
      if (workflowId === currentWorkflowId) {
        setWorkflowMeta(null, currentWorkflowName)
      }
      await refreshWorkflowList()
      message.success('工作流已删除')
    } catch (error) {
      console.error('[工具栏] 删除工作流失败:', error)
      message.error('删除工作流失败，请检查后端服务')
    } finally {
      setActiveWorkflowId(null)
    }
  }, [currentWorkflowId, currentWorkflowName, refreshWorkflowList, setWorkflowMeta])

  const handleOpenVersionCompare = useCallback((nodeId?: string) => {
    setCompareNodeId(nodeId ?? null)
    setIsVersionCompareOpen(true)
  }, [])

  const showClearCanvasConfirm = useCallback(() => {
    Modal.confirm({
      title: '确认清空画布',
      content: '清空后所有节点与连线都会被移除，请确认当前内容已经不再需要。',
      okText: '确认清空',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: clearCanvas,
    })
  }, [clearCanvas])

  const projectMenuItems = useMemo<MenuProps['items']>(
    () => [
      {
        key: 'new',
        label: '新建画布',
        icon: <FileAddOutlined />,
        disabled: isWorkflowExecuting,
        onClick: showNewWorkflowConfirm,
      },
      {
        key: 'save',
        label: '保存工作流',
        icon: <SaveOutlined />,
        disabled: isWorkflowExecuting,
        onClick: openSaveModal,
      },
      {
        key: 'load',
        label: '加载工作流',
        icon: <FolderOpenOutlined />,
        disabled: isWorkflowExecuting,
        onClick: () => void openLoadModal(),
      },
      {
        key: 'import-project',
        label: '导入项目文件',
        icon: <ImportOutlined />,
        disabled: isWorkflowExecuting || isProjectImporting,
        onClick: handleOpenImportProjectFile,
      },
      {
        type: 'divider',
      },
      {
        key: 'export-project',
        label: '导出项目文件',
        icon: <DownloadOutlined />,
        disabled: !hasCanvasContent || isWorkflowExecuting || isProjectExporting,
        onClick: () => void handleExportProjectFile(),
      },
      {
        key: 'export-assets',
        label: '导出资源包',
        icon: <ExportOutlined />,
        disabled: nodes.length === 0 || isWorkflowExecuting || isExporting,
        onClick: () => void handleExportWorkflow(),
      },
    ],
    [
      handleExportProjectFile,
      handleExportWorkflow,
      handleOpenImportProjectFile,
      hasCanvasContent,
      isExporting,
      isProjectExporting,
      isProjectImporting,
      isWorkflowExecuting,
      nodes.length,
      openLoadModal,
      openSaveModal,
      showNewWorkflowConfirm,
    ]
  )

  const panelMenuItems = useMemo<MenuProps['items']>(
    () => [
      {
        key: 'asset-center',
        label: '资产中心',
        icon: <PictureOutlined />,
        onClick: () => setIsAssetCenterOpen(true),
      },
      {
        key: 'execution-center',
        label: '执行中心',
        icon: <OrderedListOutlined />,
        onClick: () => setIsExecutionCenterOpen(true),
      },
      {
        key: 'version-compare',
        label: '版本对比',
        icon: <HistoryOutlined />,
        onClick: () => handleOpenVersionCompare(),
      },
    ],
    [handleOpenVersionCompare]
  )

  return (
    <>
      <div className={`canvas-toolbar canvas-toolbar-dock${isDockCollapsed ? ' is-collapsed' : ''}`}>
        <div className="toolbar-dock-header">
          {!isDockCollapsed && (
            <div className="toolbar-dock-title-wrap">
              <div className="toolbar-dock-title">SketchShot</div>
              <div className="toolbar-workflow-label" title={workflowLabel}>
                {workflowLabel}
              </div>
            </div>
          )}

          <Tooltip title={isDockCollapsed ? '展开工具面板' : '收起工具面板'}>
            <Button
              type="text"
              icon={isDockCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              className="toolbar-btn toolbar-dock-toggle"
              onClick={() => setIsDockCollapsed((value) => !value)}
            />
          </Tooltip>
        </div>

        {!isDockCollapsed && (
          <div className="toolbar-dock-summary">
            <span className="toolbar-credit-chip">预计消耗 {creditSummary.estimatedCredits} 点</span>
            {creditSummary.cachedNodeCount > 0 && (
              <span className="toolbar-cache-chip">缓存复用 {creditSummary.cachedNodeCount}</span>
            )}
          </div>
        )}

        <div className="toolbar-dock-section">
          {!isDockCollapsed && <div className="toolbar-dock-section-title">项目</div>}

          <Dropdown menu={{ items: projectMenuItems }} trigger={['click']} placement="bottomRight">
            <Tooltip title="项目、保存、导入导出">
              <Button
                className={`toolbar-dock-action${isDockCollapsed ? ' icon-only' : ''}`}
                icon={<FolderOpenOutlined />}
              >
                {!isDockCollapsed && '项目'}
              </Button>
            </Tooltip>
          </Dropdown>

          <Tooltip title="打开模板库，快速套用常用故事板结构">
            <Button
              className={`toolbar-dock-action${isDockCollapsed ? ' icon-only' : ''}`}
              icon={<BorderOutlined />}
              disabled={isWorkflowExecuting}
              onClick={() => setIsTemplateModalOpen(true)}
            >
              {!isDockCollapsed && '套用模板'}
            </Button>
          </Tooltip>

          <Popconfirm
            title="执行整个工作流"
            description={executeDescription}
            okText="开始执行"
            cancelText="取消"
            onConfirm={() => void handleExecuteWorkflow()}
            disabled={creditSummary.executableNodeCount === 0 || isWorkflowExecuting || isExporting}
          >
            <Tooltip title={executeDescription}>
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                className={`toolbar-dock-action${isDockCollapsed ? ' icon-only' : ''}`}
                disabled={creditSummary.executableNodeCount === 0 || isWorkflowExecuting || isExporting}
                loading={isWorkflowExecuting}
              >
                {!isDockCollapsed && '执行'}
              </Button>
            </Tooltip>
          </Popconfirm>

          <Dropdown menu={{ items: panelMenuItems }} trigger={['click']} placement="bottomRight">
            <Tooltip title="资产中心、执行中心、版本对比">
              <Button
                className={`toolbar-dock-action${isDockCollapsed ? ' icon-only' : ''}`}
                icon={<AppstoreOutlined />}
              >
                {!isDockCollapsed && '面板'}
              </Button>
            </Tooltip>
          </Dropdown>
        </div>

        <div className="toolbar-dock-section">
          {!isDockCollapsed && <div className="toolbar-dock-section-title">编辑</div>}
          <div className="toolbar-icon-grid">
            <Tooltip title="撤销 (Ctrl+Z)">
              <Button
                type="text"
                icon={<UndoOutlined />}
                disabled={!canUndo || isWorkflowExecuting}
                onClick={undo}
                className="toolbar-btn"
              />
            </Tooltip>
            <Tooltip title="重做 (Ctrl+Shift+Z)">
              <Button
                type="text"
                icon={<RedoOutlined />}
                disabled={!canRedo || isWorkflowExecuting}
                onClick={redo}
                className="toolbar-btn"
              />
            </Tooltip>
            <Tooltip title="全选节点">
              <Button
                type="text"
                icon={<SelectOutlined />}
                disabled={nodes.length === 0 || isWorkflowExecuting}
                onClick={handleSelectAll}
                className="toolbar-btn"
              />
            </Tooltip>
            <Tooltip title="智能整理画布">
              <Button
                type="text"
                icon={<AppstoreOutlined />}
                disabled={nodes.length <= 1 || isWorkflowExecuting}
                onClick={handleAutoLayout}
                className="toolbar-btn"
              />
            </Tooltip>
            <Tooltip title="新建空白工作流">
              <Button
                type="text"
                icon={<FileAddOutlined />}
                disabled={isWorkflowExecuting}
                onClick={showNewWorkflowConfirm}
                className="toolbar-btn"
              />
            </Tooltip>
            <Tooltip title="清空画布">
              <Button
                type="text"
                icon={<ClearOutlined />}
                disabled={!hasCanvasContent || isWorkflowExecuting}
                onClick={showClearCanvasConfirm}
                className="toolbar-btn"
              />
            </Tooltip>
          </div>
        </div>

        <div className="toolbar-dock-section">
          {!isDockCollapsed && <div className="toolbar-dock-section-title">视图</div>}
          <div className="toolbar-icon-grid">
            <Tooltip title="缩小">
              <Button
                type="text"
                icon={<ZoomOutOutlined />}
                disabled={isWorkflowExecuting}
                onClick={handleZoomOut}
                className="toolbar-btn"
              />
            </Tooltip>
            <Tooltip title="放大">
              <Button
                type="text"
                icon={<ZoomInOutlined />}
                disabled={isWorkflowExecuting}
                onClick={handleZoomIn}
                className="toolbar-btn"
              />
            </Tooltip>
            <Tooltip title="适配视图">
              <Button
                type="text"
                icon={<FullscreenOutlined />}
                disabled={isWorkflowExecuting}
                onClick={handleFitView}
                className="toolbar-btn"
              />
            </Tooltip>
          </div>
        </div>
      </div>

      <input
        ref={importFileInputRef}
        type="file"
        accept=".json,.sketchshot.json,.wxhb.json,.zip,.sketchshot.zip,.wxhb.zip,application/zip"
        className="toolbar-hidden-file-input"
        onChange={(event) => void handleImportProjectFile(event)}
      />

      <Modal
        title={currentWorkflowId ? '保存当前工作流' : '保存新工作流'}
        open={isSaveModalOpen}
        onCancel={() => {
          if (!isWorkflowExecuting) {
            setIsSaveModalOpen(false)
          }
        }}
        destroyOnHidden
        footer={[
          <Button key="cancel" disabled={isWorkflowExecuting} onClick={() => setIsSaveModalOpen(false)}>
            取消
          </Button>,
          currentWorkflowId ? (
            <Button
              key="save-as-new"
              disabled={isWorkflowExecuting}
              loading={isSaving}
              onClick={() => void persistWorkflow('create')}
            >
              另存为新工作流
            </Button>
          ) : null,
          <Button
            key="submit"
            type="primary"
            disabled={isWorkflowExecuting}
            loading={isSaving}
            onClick={() => void persistWorkflow(currentWorkflowId ? 'update' : 'create')}
          >
            {currentWorkflowId ? '更新当前工作流' : '创建保存'}
          </Button>,
        ]}
      >
        <div className="toolbar-modal-body">
          <label className="toolbar-modal-label" htmlFor="workflow-name-input">
            工作流名称
          </label>
          <Input
            id="workflow-name-input"
            value={workflowNameDraft}
            maxLength={100}
            onChange={(event) => setWorkflowNameDraft(event.target.value)}
            placeholder="请输入工作流名称"
          />
        </div>
      </Modal>

      <Modal
        title="加载工作流"
        open={isLoadModalOpen}
        onCancel={() => {
          if (!isWorkflowExecuting) {
            setIsLoadModalOpen(false)
          }
        }}
        width={720}
        destroyOnHidden
        footer={[
          <Button
            key="refresh"
            disabled={isWorkflowExecuting}
            onClick={() => void refreshWorkflowList()}
            loading={isLoadingList}
          >
            刷新列表
          </Button>,
          <Button key="close" type="primary" disabled={isWorkflowExecuting} onClick={() => setIsLoadModalOpen(false)}>
            关闭
          </Button>,
        ]}
      >
        <div className="toolbar-workflow-list">
          {workflowList.length === 0 && !isLoadingList ? (
            <Empty description="暂无已保存的工作流" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            workflowList.map((workflow) => (
              <div key={workflow.id} className="toolbar-workflow-item">
                <div className="toolbar-workflow-meta">
                  <div className="toolbar-workflow-name">{workflow.name}</div>
                  <div className="toolbar-workflow-detail">
                    <span>{workflow.node_count} 个节点</span>
                    <span>更新时间：{formatTime(workflow.updated_at)}</span>
                  </div>
                </div>
                <div className="toolbar-workflow-actions">
                  <Button
                    size="small"
                    type="primary"
                    disabled={isWorkflowExecuting}
                    loading={activeWorkflowId === workflow.id}
                    onClick={() => void handleLoadWorkflow(workflow.id)}
                  >
                    加载
                  </Button>
                  <Popconfirm
                    title="删除工作流"
                    description={`确认删除「${workflow.name}」吗？`}
                    okText="确认"
                    cancelText="取消"
                    onConfirm={() => void handleDeleteWorkflow(workflow.id)}
                  >
                    <Button
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      disabled={isWorkflowExecuting}
                      loading={activeWorkflowId === workflow.id}
                    >
                      删除
                    </Button>
                  </Popconfirm>
                </div>
              </div>
            ))
          )}
        </div>
      </Modal>

      <Modal
        title="选择工作流模板"
        open={isTemplateModalOpen}
        onCancel={() => {
          if (!isWorkflowExecuting) {
            setIsTemplateModalOpen(false)
          }
        }}
        width={920}
        destroyOnHidden
        footer={[
          <Button key="close" type="primary" disabled={isWorkflowExecuting} onClick={() => setIsTemplateModalOpen(false)}>
            关闭
          </Button>,
        ]}
      >
        <div className="toolbar-template-groups">
          {groupedTemplates.map((group) => (
            <section key={group.category} className="toolbar-template-group">
              <div className="toolbar-template-group-header">
                <div className="toolbar-template-group-title">{group.meta.title}</div>
                <div className="toolbar-template-group-description">{group.meta.description}</div>
              </div>

              <div className="toolbar-template-group-list">
                {group.templates.map((template) => (
                  <div key={template.id} className="toolbar-workflow-item toolbar-template-item">
                    <div className="toolbar-workflow-meta">
                      <div className="toolbar-template-title-row">
                        <div className="toolbar-workflow-name">{template.name}</div>
                        <div className="toolbar-template-tags">
                          {template.recommended && <span className="toolbar-template-badge recommended">推荐</span>}
                          <span className="toolbar-template-badge">{group.meta.title}</span>
                        </div>
                      </div>
                      <div className="toolbar-template-description">{template.description}</div>
                      <div className="toolbar-workflow-detail">
                        <span>{template.nodes.length} 个节点</span>
                        <span>{template.edges.length} 条连线</span>
                      </div>
                      <div className="toolbar-template-points">
                        {template.learningPoints.map((point) => (
                          <span key={point} className="toolbar-template-point">
                            {point}
                          </span>
                        ))}
                      </div>
                      <div className="toolbar-template-hint">
                        第一步：{template.firstActionHint}
                      </div>
                    </div>
                    <div className="toolbar-workflow-actions">
                      <Button
                        size="small"
                        type="primary"
                        disabled={isWorkflowExecuting}
                        onClick={() => handleApplyTemplate(template)}
                      >
                        应用模板
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </Modal>

      <Modal
        title={appliedTemplateGuide ? `模板已应用：${appliedTemplateGuide.name}` : '模板上手指引'}
        open={Boolean(appliedTemplateGuide)}
        onCancel={() => setAppliedTemplateGuide(null)}
        width={780}
        destroyOnHidden
        footer={[
          <Button key="close" type="primary" onClick={() => setAppliedTemplateGuide(null)}>
            开始使用
          </Button>,
        ]}
      >
        {appliedTemplateGuide && (
          <div className="toolbar-template-guide">
            <div className="toolbar-template-guide-summary">
              <div className="toolbar-template-guide-title">这套模板会带你完成什么</div>
              <div className="toolbar-template-description">{appliedTemplateGuide.description}</div>
              <div className="toolbar-workflow-detail">
                <span>{appliedTemplateGuide.nodes.length} 个节点</span>
                <span>{appliedTemplateGuide.edges.length} 条连线</span>
                <span>{appliedTemplateSections.length} 个上手阶段</span>
              </div>
            </div>

            <div className="toolbar-template-points">
              {appliedTemplateGuide.learningPoints.map((point) => (
                <span key={point} className="toolbar-template-point">
                  {point}
                </span>
              ))}
            </div>

            <div className="toolbar-template-hint">
              第一步：{appliedTemplateGuide.firstActionHint}
            </div>

            <div className="toolbar-template-guide-sections">
              {appliedTemplateSections.map((section) => (
                <section key={section.key} className="toolbar-template-guide-section">
                  <div className="toolbar-template-guide-section-title">{section.title}</div>
                  <div className="toolbar-template-guide-section-description">{section.description}</div>
                  <div className="toolbar-template-guide-node-list">
                    {section.nodes.map((nodeName) => (
                      <span key={`${section.key}-${nodeName}`} className="toolbar-template-guide-node">
                        {nodeName}
                      </span>
                    ))}
                  </div>
                </section>
              ))}
            </div>

            <div className="toolbar-template-guide-note">
              画布已经自动适配到模板全貌，你可以直接从左侧起始节点开始填写，再沿着连线往右推进。
            </div>
          </div>
        )}
      </Modal>

      <ExecutionCenter
        open={isExecutionCenterOpen}
        nodes={nodes}
        edges={edges}
        onClose={() => setIsExecutionCenterOpen(false)}
        onOpenVersionCompare={(nodeId) => handleOpenVersionCompare(nodeId)}
      />
      <AssetCenter
        open={isAssetCenterOpen}
        nodes={nodes}
        onClose={() => setIsAssetCenterOpen(false)}
      />
      <VersionCompare
        open={isVersionCompareOpen}
        nodes={nodes}
        edges={edges}
        initialNodeId={compareNodeId}
        onClose={() => {
          setIsVersionCompareOpen(false)
          setCompareNodeId(null)
        }}
      />
    </>
  )
})

Toolbar.displayName = 'Toolbar'
export default Toolbar
