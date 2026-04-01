/**
 * 画布浮动工具栏
 * 补齐阶段 2.5 工具栏能力，并提供工作流保存/加载入口
 */
import { memo, useCallback, useMemo, useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import {
  Button,
  Empty,
  Input,
  Modal,
  Popconfirm,
  Tooltip,
  message,
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
  ExportOutlined,
} from '@ant-design/icons'
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
import { WorkflowCycleError } from '../../utils/workflowExecution'
import { getWorkflowCreditSummary } from '../../utils/workflowMetrics'
import { workflowTemplates, type WorkflowTemplateDefinition } from '../../templates/workflowTemplates'
import type { AppEdge, AppNode } from '../../types'
import './style.css'

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

  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false)
  const [isLoadModalOpen, setIsLoadModalOpen] = useState(false)
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false)
  const [workflowNameDraft, setWorkflowNameDraft] = useState(currentWorkflowName)
  const [workflowList, setWorkflowList] = useState<WorkflowListItem[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [isLoadingList, setIsLoadingList] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [activeWorkflowId, setActiveWorkflowId] = useState<string | null>(null)

  const hasCanvasContent = nodes.length > 0 || edges.length > 0
  const creditSummary = useMemo(() => getWorkflowCreditSummary(nodes), [nodes])
  const executeDescription = useMemo(() => {
    if (creditSummary.executableNodeCount === 0) {
      return '当前工作流中没有可执行的图片生成节点'
    }

    if (creditSummary.cachedNodeCount > 0) {
      return `将执行 ${creditSummary.executableNodeCount} 个生成节点，预计消耗 💎${creditSummary.estimatedCredits}，其中 ${creditSummary.cachedNodeCount} 个节点可复用缓存。`
    }

    return `将执行 ${creditSummary.executableNodeCount} 个生成节点，预计消耗 💎${creditSummary.estimatedCredits}。`
  }, [creditSummary.cachedNodeCount, creditSummary.estimatedCredits, creditSummary.executableNodeCount])

  const workflowLabel = useMemo(() => {
    if (currentWorkflowId) return `当前工作流：${currentWorkflowName}`
    return `未保存工作流：${currentWorkflowName}`
  }, [currentWorkflowId, currentWorkflowName])

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

  const handleSelectAll = useCallback(() => {
    selectAll()
    message.success(`已选中 ${nodes.length} 个节点`)
  }, [nodes.length, selectAll])

  const handleAutoLayout = useCallback(() => {
    autoLayout()
    scheduleFitView()
    message.success('已完成自动布局')
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

  return (
    <>
      <div className="canvas-toolbar">
        <div className="toolbar-group">
          <span className="toolbar-workflow-label">{workflowLabel}</span>
          <span className="toolbar-credit-chip">
            预计消耗 💎{creditSummary.estimatedCredits}
          </span>
          {creditSummary.cachedNodeCount > 0 && (
            <span className="toolbar-cache-chip">
              缓存复用 {creditSummary.cachedNodeCount}
            </span>
          )}
          <Popconfirm
            title="新建工作流"
            description="将清空当前画布内容并开始新的工作流"
            onConfirm={handleNewWorkflow}
            okText="确认"
            cancelText="取消"
          >
            <Button
              size="small"
              icon={<FileAddOutlined />}
              className="toolbar-text-btn"
              disabled={isWorkflowExecuting}
            >
              新建
            </Button>
          </Popconfirm>
          <Button
            size="small"
            icon={<SaveOutlined />}
            className="toolbar-text-btn"
            disabled={isWorkflowExecuting}
            onClick={openSaveModal}
          >
            保存
          </Button>
          <Button
            size="small"
            icon={<FolderOpenOutlined />}
            className="toolbar-text-btn"
            disabled={isWorkflowExecuting}
            onClick={() => void openLoadModal()}
          >
            加载
          </Button>
          <Button
            size="small"
            icon={<BorderOutlined />}
            className="toolbar-text-btn"
            disabled={isWorkflowExecuting}
            onClick={() => setIsTemplateModalOpen(true)}
          >
            模板
          </Button>
          <Popconfirm
            title="执行整个工作流"
            description={executeDescription}
            okText="开始执行"
            cancelText="取消"
            onConfirm={() => void handleExecuteWorkflow()}
            disabled={creditSummary.executableNodeCount === 0 || isWorkflowExecuting || isExporting}
          >
            <Button
              size="small"
              type="primary"
              icon={<PlayCircleOutlined />}
              className="toolbar-text-btn"
              disabled={creditSummary.executableNodeCount === 0 || isWorkflowExecuting || isExporting}
              loading={isWorkflowExecuting}
            >
              一键执行
            </Button>
          </Popconfirm>
          <Button
            size="small"
            icon={<ExportOutlined />}
            className="toolbar-text-btn"
            disabled={nodes.length === 0 || isWorkflowExecuting || isExporting}
            loading={isExporting}
            onClick={() => void handleExportWorkflow()}
          >
            导出
          </Button>
        </div>

        <div className="toolbar-divider" />

        <div className="toolbar-group">
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
          <Tooltip title="自动布局">
            <Button
              type="text"
              icon={<AppstoreOutlined />}
              disabled={nodes.length <= 1 || isWorkflowExecuting}
              onClick={handleAutoLayout}
              className="toolbar-btn"
            />
          </Tooltip>
          <Popconfirm
            title="确认清空"
            description="清空画布后所有节点和连线将被删除"
            onConfirm={clearCanvas}
            okText="确认"
            cancelText="取消"
            disabled={!hasCanvasContent}
          >
            <Tooltip title="清空画布">
              <Button
                type="text"
                icon={<ClearOutlined />}
                disabled={!hasCanvasContent || isWorkflowExecuting}
                className="toolbar-btn"
              />
            </Tooltip>
          </Popconfirm>
        </div>

        <div className="toolbar-divider" />

        <div className="toolbar-group">
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

      <Modal
        title={currentWorkflowId ? '保存当前工作流' : '保存新工作流'}
        open={isSaveModalOpen}
        onCancel={() => {
          if (!isWorkflowExecuting) {
            setIsSaveModalOpen(false)
          }
        }}
        destroyOnClose
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
        destroyOnClose
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
        width={760}
        destroyOnClose
        footer={[
          <Button key="close" type="primary" disabled={isWorkflowExecuting} onClick={() => setIsTemplateModalOpen(false)}>
            关闭
          </Button>,
        ]}
      >
        <div className="toolbar-workflow-list">
          {workflowTemplates.map((template) => (
            <div key={template.id} className="toolbar-workflow-item">
              <div className="toolbar-workflow-meta">
                <div className="toolbar-workflow-name">{template.name}</div>
                <div className="toolbar-template-description">{template.description}</div>
                <div className="toolbar-workflow-detail">
                  <span>{template.nodes.length} 个节点</span>
                  <span>{template.edges.length} 条连线</span>
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
      </Modal>
    </>
  )
})

Toolbar.displayName = 'Toolbar'
export default Toolbar
