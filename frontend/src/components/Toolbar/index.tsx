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
  Select,
  Segmented,
  Spin,
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
  SettingOutlined,
  InfoCircleOutlined,
  QuestionCircleOutlined,
  DownOutlined,
  UpOutlined,
} from '@ant-design/icons'
import AssetCenter from '../AssetCenter'
import AboutPage from '../AboutPage'
import ExecutionCenter from '../ExecutionCenter'
import HelpPage from '../HelpPage'
import VersionCompare from '../VersionCompare'
import { useFlowStore } from '../../stores/useFlowStore'
import {
  createUserTemplate,
  createWorkflow,
  deleteUserTemplate,
  deleteWorkflow,
  getEngineSettings,
  getUserTemplate,
  getWorkflow,
  listUserTemplates,
  listWorkflows,
  updateEngineSettings,
  updateWorkflow,
  type EngineSettingsResponse,
  type GenerateProvider,
  type PromptProvider,
  type UserTemplateListItem,
  type WorkflowListItem,
} from '../../services/api'
import { primeEngineSettingsCache } from '../../services/engineSettings'
import { executeWorkflow } from '../../services/workflowRunner'
import { exportWorkflowAssetsAsZip } from '../../services/workflowExport'
import {
  exportProjectExchangeFile,
  readProjectExchangeFile,
} from '../../utils/projectExchange'
import { WorkflowCycleError } from '../../utils/workflowExecution'
import { getWorkflowCreditSummary } from '../../utils/workflowMetrics'
import { sanitizeWorkflowForTemplate } from '../../utils/templateUtils'
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

type TemplateBrowserCategory = WorkflowTemplateDefinition['category'] | 'user'

type EngineSettingsDraft = {
  prompt_provider: PromptProvider
  generate_provider: GenerateProvider
  volcengine: {
    ark_base_url: string
    ark_api_key: string
    prompt_model: string
    image_model: string
    image_edit_model: string
    video_model: string
  }
  dashscope: {
    base_url: string
    api_key: string
    qwen_text_model: string
    qwen_multimodal_model: string
    wanx_image_model: string
    wanx_video_model: string
    wanx_video_resolution: '720P' | '1080P'
    wanx_watermark: boolean
    oss_region: string
    oss_endpoint: string
    oss_access_key_id: string
    oss_access_key_secret: string
    oss_bucket: string
    oss_key_prefix: string
  }
}

const emptyEngineSettingsDraft: EngineSettingsDraft = {
  prompt_provider: 'volcengine',
  generate_provider: 'volcengine',
  volcengine: {
    ark_base_url: '',
    ark_api_key: '',
    prompt_model: '',
    image_model: '',
    image_edit_model: '',
    video_model: '',
  },
  dashscope: {
    base_url: '',
    api_key: '',
    qwen_text_model: '',
    qwen_multimodal_model: '',
    wanx_image_model: '',
    wanx_video_model: '',
    wanx_video_resolution: '720P',
    wanx_watermark: false,
    oss_region: '',
    oss_endpoint: '',
    oss_access_key_id: '',
    oss_access_key_secret: '',
    oss_bucket: '',
    oss_key_prefix: 'sketchshot-temp',
  },
}

const promptProviderOptions = [
  { value: 'volcengine', label: '火山 Ark' },
  { value: 'qwen', label: '千问（DashScope）' },
]

const generateProviderOptions = [
  { value: 'volcengine', label: '火山生成' },
  { value: 'wanx', label: '万相（DashScope）' },
]

const wanxVideoResolutionOptions = [
  { value: '720P', label: '720P' },
  { value: '1080P', label: '1080P' },
]

const watermarkOptions = [
  { value: false, label: '不加水印' },
  { value: true, label: '保留官方水印' },
]

function getPromptProviderLabel(provider: PromptProvider): string {
  return provider === 'qwen' ? '千问（阿里 DashScope）' : '火山 Ark'
}

function getGenerateProviderLabel(provider: GenerateProvider): string {
  if (provider === 'wanx') {
    return '万相（阿里 DashScope）'
  }

  return '火山 Ark'
}

function getPromptProviderHelp(provider: PromptProvider): string {
  if (provider === 'qwen') {
    return '总提示词生成、润色和九宫格连续动作拆分，将读取下方阿里服务卡中的 Qwen 模型。'
  }

  return '总提示词生成、润色和九宫格连续动作拆分，将读取下方火山服务卡中的提示词模型。'
}

function getGenerateProviderHelp(provider: GenerateProvider): string {
  if (provider === 'wanx') {
    return '图片生成和图生视频将走万相能力，请在下方阿里服务卡中填写万相模型与 DashScope 鉴权。'
  }

  return '图片生成和图生视频将走火山能力，请在下方火山服务卡中填写图片与视频模型。'
}

function getOssConfigSummary(region: string, bucket: string, configured: boolean): string {
  if (!configured) {
    return '未启用'
  }

  const summary = [region.trim(), bucket.trim()].filter(Boolean).join(' / ')
  return summary || '已配置'
}

const userTemplateCategoryMeta = {
  title: '我的模板',
  description: '把自己搭好的工作流沉淀下来，后面新项目可以直接套用。',
}

const templateSetupTypes = new Set<AppNodeType>(['imageUpload', 'scene', 'character', 'style', 'continuity'])
const templateGenerateTypes = new Set<AppNodeType>(['imageGen', 'threeViewGen', 'videoGen', 'shot'])
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

function TemplateSummaryMeta({ template }: { template: WorkflowTemplateDefinition }) {
  const hasUseCases = (template.useCases?.length ?? 0) > 0
  const hasPresetHighlights = (template.presetHighlights?.length ?? 0) > 0

  if (!hasUseCases && !hasPresetHighlights) {
    return null
  }

  return (
    <div className="toolbar-template-summary-group">
      {hasUseCases && (
        <div className="toolbar-template-summary-row">
          <div className="toolbar-template-summary-label">适合</div>
          <div className="toolbar-template-tags">
            {template.useCases?.map((useCase) => (
              <span key={useCase} className="toolbar-template-badge use-case">
                {useCase}
              </span>
            ))}
          </div>
        </div>
      )}

      {hasPresetHighlights && (
        <div className="toolbar-template-summary-row">
          <div className="toolbar-template-summary-label">预设</div>
          <div className="toolbar-template-points">
            {template.presetHighlights?.map((highlight) => (
              <span key={highlight} className="toolbar-template-point highlight">
                {highlight}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
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
  const [isSaveTemplateModalOpen, setIsSaveTemplateModalOpen] = useState(false)
  const [activeTemplateCategory, setActiveTemplateCategory] = useState<TemplateBrowserCategory>('recommended')
  const [appliedTemplateGuide, setAppliedTemplateGuide] = useState<WorkflowTemplateDefinition | null>(null)
  const [isAssetCenterOpen, setIsAssetCenterOpen] = useState(false)
  const [isExecutionCenterOpen, setIsExecutionCenterOpen] = useState(false)
  const [isVersionCompareOpen, setIsVersionCompareOpen] = useState(false)
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false)
  const [isAboutModalOpen, setIsAboutModalOpen] = useState(false)
  const [isEngineConfigModalOpen, setIsEngineConfigModalOpen] = useState(false)
  const [isEngineConfigLoading, setIsEngineConfigLoading] = useState(false)
  const [isEngineConfigSaving, setIsEngineConfigSaving] = useState(false)
  const [isEngineRoutingExpanded, setIsEngineRoutingExpanded] = useState(false)
  const [engineConfigDraft, setEngineConfigDraft] = useState<EngineSettingsDraft>(emptyEngineSettingsDraft)
  const [isVolcengineConfigured, setIsVolcengineConfigured] = useState(false)
  const [isDashScopeConfigured, setIsDashScopeConfigured] = useState(false)
  const [isDashScopeOssExpanded, setIsDashScopeOssExpanded] = useState(false)
  const [isDashScopeOssAdvancedExpanded, setIsDashScopeOssAdvancedExpanded] = useState(false)
  const [compareNodeId, setCompareNodeId] = useState<string | null>(null)
  const [workflowNameDraft, setWorkflowNameDraft] = useState(currentWorkflowName)
  const [templateNameDraft, setTemplateNameDraft] = useState('')
  const [workflowList, setWorkflowList] = useState<WorkflowListItem[]>([])
  const [userTemplateList, setUserTemplateList] = useState<UserTemplateListItem[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [isLoadingList, setIsLoadingList] = useState(false)
  const [isUserTemplateSaving, setIsUserTemplateSaving] = useState(false)
  const [isUserTemplateListLoading, setIsUserTemplateListLoading] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isProjectExporting, setIsProjectExporting] = useState(false)
  const [isProjectImporting, setIsProjectImporting] = useState(false)
  const [activeWorkflowId, setActiveWorkflowId] = useState<string | null>(null)
  const [activeUserTemplateId, setActiveUserTemplateId] = useState<string | null>(null)
  const [isDockCollapsed, setIsDockCollapsed] = useState(false)

  const hasCanvasContent = nodes.length > 0 || edges.length > 0
  const creditSummary = useMemo(() => getWorkflowCreditSummary(nodes, edges), [edges, nodes])
  const executeDescription = useMemo(() => {
    if (creditSummary.executableNodeCount === 0) {
      return '当前工作流中没有可执行的生成节点'
    }

    if (creditSummary.cachedNodeCount > 0) {
      return `将执行 ${creditSummary.executableNodeCount} 个生成节点，其中 ${creditSummary.cachedNodeCount} 个节点可复用缓存。`
    }

    return `将执行 ${creditSummary.executableNodeCount} 个生成节点。`
  }, [creditSummary.cachedNodeCount, creditSummary.executableNodeCount])

  const workflowLabel = useMemo(() => {
    if (currentWorkflowId) return `当前工作流：${currentWorkflowName}`
    return `未保存工作流：${currentWorkflowName}`
  }, [currentWorkflowId, currentWorkflowName])
  const buildDefaultTemplateName = useCallback(() => {
    const name = currentWorkflowName.trim()
    if (!name || name === '未命名工作流') {
      return '我的自定义模板'
    }

    return `${name} 模板`
  }, [currentWorkflowName])
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
  const templateCategoryOptions = useMemo(
    () => [
      {
        label: `${userTemplateCategoryMeta.title} (${userTemplateList.length})`,
        value: 'user' as TemplateBrowserCategory,
      },
      ...groupedTemplates.map((group) => ({
        label: `${group.meta.title} (${group.templates.length})`,
        value: group.category as TemplateBrowserCategory,
      })),
    ],
    [groupedTemplates, userTemplateList.length]
  )
  const isUserTemplateCategoryActive = activeTemplateCategory === 'user'
  const activeTemplateGroup = useMemo(
    () =>
      groupedTemplates.find((group) => group.category === activeTemplateCategory) ?? groupedTemplates[0] ?? null,
    [activeTemplateCategory, groupedTemplates]
  )
  const activeTemplateHeaderMeta = isUserTemplateCategoryActive
    ? userTemplateCategoryMeta
    : activeTemplateGroup?.meta ?? groupedTemplates[0]?.meta ?? userTemplateCategoryMeta
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

  const applyEngineSettings = useCallback((config: EngineSettingsResponse) => {
    setEngineConfigDraft({
      prompt_provider: config.prompt_provider,
      generate_provider: config.generate_provider,
      volcengine: {
        ark_base_url: config.volcengine.ark_base_url,
        ark_api_key: config.volcengine.ark_api_key,
        prompt_model: config.volcengine.prompt_model,
        image_model: config.volcengine.image_model,
        image_edit_model: config.volcengine.image_edit_model,
        video_model: config.volcengine.video_model,
      },
      dashscope: {
        base_url: config.dashscope.base_url,
        api_key: config.dashscope.api_key,
        qwen_text_model: config.dashscope.qwen_text_model,
        qwen_multimodal_model: config.dashscope.qwen_multimodal_model,
        wanx_image_model: config.dashscope.wanx_image_model,
        wanx_video_model: config.dashscope.wanx_video_model,
        wanx_video_resolution: config.dashscope.wanx_video_resolution,
        wanx_watermark: config.dashscope.wanx_watermark,
        oss_region: config.dashscope.oss_region,
        oss_endpoint: config.dashscope.oss_endpoint,
        oss_access_key_id: config.dashscope.oss_access_key_id,
        oss_access_key_secret: config.dashscope.oss_access_key_secret,
        oss_bucket: config.dashscope.oss_bucket,
        oss_key_prefix: config.dashscope.oss_key_prefix,
      },
    })
    setIsVolcengineConfigured(config.volcengine.configured)
    setIsDashScopeConfigured(config.dashscope.configured)
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

  const openEngineConfigModal = useCallback(async () => {
    setIsEngineConfigModalOpen(true)
    setIsEngineConfigLoading(true)
    setIsEngineRoutingExpanded(false)
    setIsDashScopeOssExpanded(false)
    setIsDashScopeOssAdvancedExpanded(false)

    try {
      const config = await getEngineSettings()
      applyEngineSettings(config)
      primeEngineSettingsCache(config)
    } catch (error) {
      console.error('[工具栏] 获取引擎配置失败:', error)
      message.error(error instanceof Error ? error.message : '获取引擎配置失败')
    } finally {
      setIsEngineConfigLoading(false)
    }
  }, [applyEngineSettings])

  const updateEngineProviderField = useCallback(
    (field: 'prompt_provider' | 'generate_provider', value: PromptProvider | GenerateProvider) => {
      setEngineConfigDraft((current) => ({ ...current, [field]: value }))
    },
    []
  )

  const updateVolcengineConfigField = useCallback(
    (field: keyof EngineSettingsDraft['volcengine'], value: string) => {
      setEngineConfigDraft((current) => ({
        ...current,
        volcengine: {
          ...current.volcengine,
          [field]: value,
        },
      }))
    },
    []
  )

  const updateDashScopeConfigField = useCallback(
    (field: keyof EngineSettingsDraft['dashscope'], value: string | boolean) => {
      setEngineConfigDraft((current) => ({
        ...current,
        dashscope: {
          ...current.dashscope,
          [field]: value,
        },
      }))
    },
    []
  )

  const handleSaveEngineConfig = useCallback(async () => {
    setIsEngineConfigSaving(true)

    try {
      const saved = await updateEngineSettings(engineConfigDraft)
      applyEngineSettings(saved)
      primeEngineSettingsCache(saved)
      setIsEngineConfigModalOpen(false)
      message.success(
        '引擎配置已保存，新的提示词与生成 provider 已立即生效'
      )
    } catch (error) {
      console.error('[工具栏] 保存引擎配置失败:', error)
      message.error(error instanceof Error ? error.message : '保存引擎配置失败')
    } finally {
      setIsEngineConfigSaving(false)
    }
  }, [applyEngineSettings, engineConfigDraft])

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

  const refreshUserTemplateList = useCallback(async () => {
    setIsUserTemplateListLoading(true)
    try {
      const templates = await listUserTemplates()
      setUserTemplateList(templates)
      return templates
    } catch (error) {
      console.error('[工具栏] 获取用户模板列表失败:', error)
      message.error('获取用户模板失败，请检查后端服务')
      return []
    } finally {
      setIsUserTemplateListLoading(false)
    }
  }, [])

  const openLoadModal = useCallback(async () => {
    setIsLoadModalOpen(true)
    await refreshWorkflowList()
  }, [refreshWorkflowList])

  const openSaveTemplateModal = useCallback(() => {
    if (!hasCanvasContent) {
      message.warning('画布为空，先搭好工作流后再保存为模板')
      return
    }

    setTemplateNameDraft(buildDefaultTemplateName())
    setIsSaveTemplateModalOpen(true)
  }, [buildDefaultTemplateName, hasCanvasContent])

  const handleOpenTemplateModal = useCallback(async () => {
    setIsTemplateModalOpen(true)
    const templates = await refreshUserTemplateList()
    setActiveTemplateCategory(templates.length > 0 ? 'user' : groupedTemplates[0]?.category ?? 'recommended')
  }, [groupedTemplates, refreshUserTemplateList])

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

  const handleSaveUserTemplate = useCallback(async () => {
    if (!hasCanvasContent) {
      message.warning('画布为空，先搭好工作流后再保存为模板')
      return
    }

    const name = templateNameDraft.trim() || buildDefaultTemplateName()
    const sanitized = sanitizeWorkflowForTemplate(nodes, edges)
    setIsUserTemplateSaving(true)

    try {
      const template = await createUserTemplate({
        name,
        nodes: sanitized.nodes,
        edges: sanitized.edges,
      })
      setIsSaveTemplateModalOpen(false)
      setTemplateNameDraft(template.name)
      await refreshUserTemplateList()
      setActiveTemplateCategory('user')
      message.success(`已保存为模板：${template.name}`)
    } catch (error) {
      console.error('[工具栏] 保存用户模板失败:', error)
      message.error('保存用户模板失败，请检查后端服务')
    } finally {
      setIsUserTemplateSaving(false)
    }
  }, [buildDefaultTemplateName, edges, hasCanvasContent, nodes, refreshUserTemplateList, templateNameDraft])

  const handleApplyUserTemplate = useCallback(async (templateId: string) => {
    setActiveUserTemplateId(templateId)
    try {
      const template = await getUserTemplate(templateId)
      loadWorkflow({
        id: null,
        name: template.name,
        nodes: template.nodes as AppNode[],
        edges: template.edges as AppEdge[],
      })
      setIsTemplateModalOpen(false)
      setAppliedTemplateGuide(null)
      message.success(`已应用我的模板：${template.name}`)
      scheduleFitView()
    } catch (error) {
      console.error('[工具栏] 应用用户模板失败:', error)
      message.error('应用用户模板失败，请检查后端服务')
    } finally {
      setActiveUserTemplateId(null)
    }
  }, [loadWorkflow, scheduleFitView])

  const handleDeleteUserTemplate = useCallback(async (templateId: string) => {
    setActiveUserTemplateId(templateId)
    try {
      await deleteUserTemplate(templateId)
      const templates = await refreshUserTemplateList()
      if (templates.length === 0 && activeTemplateCategory === 'user') {
        setActiveTemplateCategory(groupedTemplates[0]?.category ?? 'recommended')
      }
      message.success('用户模板已删除')
    } catch (error) {
      console.error('[工具栏] 删除用户模板失败:', error)
      message.error('删除用户模板失败，请检查后端服务')
    } finally {
      setActiveUserTemplateId(null)
    }
  }, [activeTemplateCategory, groupedTemplates, refreshUserTemplateList])

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
        key: 'save-template',
        label: '保存为我的模板',
        icon: <BorderOutlined />,
        disabled: isWorkflowExecuting || !hasCanvasContent,
        onClick: openSaveTemplateModal,
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
      openSaveTemplateModal,
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
      {
        key: 'help',
        label: '基础使用帮助',
        icon: <QuestionCircleOutlined />,
        onClick: () => setIsHelpModalOpen(true),
      },
      {
        key: 'about',
        label: '关于镜语',
        icon: <InfoCircleOutlined />,
        onClick: () => setIsAboutModalOpen(true),
      },
    ],
    [handleOpenVersionCompare]
  )

  const promptProviderLabel = getPromptProviderLabel(engineConfigDraft.prompt_provider)
  const generateProviderLabel = getGenerateProviderLabel(engineConfigDraft.generate_provider)
  const promptProviderHelp = getPromptProviderHelp(engineConfigDraft.prompt_provider)
  const generateProviderHelp = getGenerateProviderHelp(engineConfigDraft.generate_provider)
  const visibleGenerateProvider = engineConfigDraft.generate_provider === 'wanx' ? 'wanx' : 'volcengine'
  const isVolcenginePromptActive = engineConfigDraft.prompt_provider === 'volcengine'
  const isVolcengineGenerateActive = engineConfigDraft.generate_provider === 'volcengine'
  const isDashScopePromptActive = engineConfigDraft.prompt_provider === 'qwen'
  const isDashScopeGenerateActive = engineConfigDraft.generate_provider === 'wanx'
  const isVolcengineActive = isVolcenginePromptActive || isVolcengineGenerateActive
  const isDashScopeActive = isDashScopePromptActive || isDashScopeGenerateActive
  const isDashScopeOssReady = Boolean(
    engineConfigDraft.dashscope.oss_bucket.trim() &&
      engineConfigDraft.dashscope.oss_access_key_id.trim() &&
      engineConfigDraft.dashscope.oss_access_key_secret.trim() &&
      (engineConfigDraft.dashscope.oss_region.trim() || engineConfigDraft.dashscope.oss_endpoint.trim())
  )
  const dashScopeOssSummary = getOssConfigSummary(
    engineConfigDraft.dashscope.oss_region,
    engineConfigDraft.dashscope.oss_bucket,
    isDashScopeOssReady
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
            <span className="toolbar-credit-chip">可执行节点 {creditSummary.executableNodeCount}</span>
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
              onClick={handleOpenTemplateModal}
            >
              {!isDockCollapsed && '模板'}
            </Button>
          </Tooltip>

          <Tooltip title="配置火山与阿里引擎的地址、API Key 和模型">
            <Button
              className={`toolbar-dock-action${isDockCollapsed ? ' icon-only' : ''}`}
              icon={<SettingOutlined />}
              disabled={isWorkflowExecuting}
              onClick={() => void openEngineConfigModal()}
            >
              {!isDockCollapsed && '引擎'}
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
            <Tooltip title="资产中心、执行中心、版本对比、基础帮助">
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
        title="基础使用帮助"
        open={isHelpModalOpen}
        onCancel={() => setIsHelpModalOpen(false)}
        width={1040}
        destroyOnHidden
        footer={[
          <Button key="close" type="primary" onClick={() => setIsHelpModalOpen(false)}>
            关闭
          </Button>,
        ]}
      >
        <HelpPage />
      </Modal>

      <Modal
        title="关于镜语"
        open={isAboutModalOpen}
        onCancel={() => setIsAboutModalOpen(false)}
        width={920}
        destroyOnHidden
        footer={[
          <Button key="close" type="primary" onClick={() => setIsAboutModalOpen(false)}>
            关闭
          </Button>,
        ]}
      >
        <AboutPage />
      </Modal>

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
        title="引擎配置"
        open={isEngineConfigModalOpen}
        onCancel={() => {
          if (!isEngineConfigSaving) {
            setIsEngineConfigModalOpen(false)
          }
        }}
        width={960}
        destroyOnHidden
        footer={[
          <Button
            key="cancel"
            disabled={isEngineConfigSaving}
            onClick={() => setIsEngineConfigModalOpen(false)}
          >
            取消
          </Button>,
          <Button
            key="submit"
            type="primary"
            loading={isEngineConfigSaving}
            onClick={() => void handleSaveEngineConfig()}
          >
            保存并立即生效
          </Button>,
        ]}
      >
        {isEngineConfigLoading ? (
          <div className="toolbar-engine-loading">
            <Spin />
          </div>
        ) : (
          <div className="toolbar-modal-body toolbar-engine-form">
            <div className="toolbar-engine-overview">
              <div className="toolbar-engine-overview-title">先决定任务走向，再分别配置两套服务</div>
              <div className="toolbar-engine-overview-description">
                提示词 Provider 决定谁来负责总提示词、润色和九宫格连续动作拆分；生成 Provider
                决定图片和图生视频最终由哪家服务产出。配置仅保存在当前后端本机文件中，保存后新任务立即生效，无需手动修改
                `.env`。
              </div>
              <div className="toolbar-engine-routing-summary">
                <div className="toolbar-engine-pill-row">
                  <span className="toolbar-engine-pill is-active">提示词：{promptProviderLabel}</span>
                  <span className="toolbar-engine-pill is-active">生成：{generateProviderLabel}</span>
                </div>
                <Button
                  type="text"
                  size="small"
                  icon={isEngineRoutingExpanded ? <UpOutlined /> : <DownOutlined />}
                  className="toolbar-engine-routing-toggle"
                  onClick={() => setIsEngineRoutingExpanded((value) => !value)}
                >
                  {isEngineRoutingExpanded ? '收起高级路由设置' : '展开高级路由设置'}
                </Button>
              </div>
            </div>

            {isEngineRoutingExpanded && (
              <div className="toolbar-engine-route-grid">
                <div className="toolbar-engine-route-card">
                  <div className="toolbar-engine-route-title">提示词路由</div>
                  <div className="toolbar-engine-route-description">
                    用于总提示词生成、提示词润色、九宫格连续动作拆分。
                  </div>
                  <label className="toolbar-modal-label" htmlFor="engine-prompt-provider">
                    提示词 Provider
                  </label>
                  <Select
                    id="engine-prompt-provider"
                    value={engineConfigDraft.prompt_provider}
                    options={promptProviderOptions}
                    onChange={(value) => updateEngineProviderField('prompt_provider', value as PromptProvider)}
                    className="field-select nodrag nopan"
                  />
                  <div className="toolbar-engine-route-current">当前将使用：{promptProviderLabel}</div>
                  <div className="toolbar-engine-route-help">{promptProviderHelp}</div>
                </div>

                <div className="toolbar-engine-route-card">
                  <div className="toolbar-engine-route-title">生成路由</div>
                  <div className="toolbar-engine-route-description">
                    决定图片生成、图生视频最终调用哪一套接口。
                  </div>
                  <label className="toolbar-modal-label" htmlFor="engine-generate-provider">
                    生成 Provider
                  </label>
                  <Select
                    id="engine-generate-provider"
                    value={visibleGenerateProvider}
                    options={generateProviderOptions}
                    onChange={(value) => updateEngineProviderField('generate_provider', value as GenerateProvider)}
                    className="field-select nodrag nopan"
                  />
                  <div className="toolbar-engine-route-current">当前将使用：{generateProviderLabel}</div>
                  <div className="toolbar-engine-route-help">{generateProviderHelp}</div>
                </div>
              </div>
            )}

            <div className="toolbar-engine-provider-grid">
              <section
                className={`toolbar-engine-provider-card${isVolcengineConfigured ? ' is-ready' : ''}${isVolcengineActive ? ' is-active' : ''}`}
              >
                <div className="toolbar-engine-provider-header">
                  <div className="toolbar-engine-provider-copy">
                    <div className="toolbar-engine-provider-eyebrow">服务 A</div>
                    <div className="toolbar-engine-provider-title">火山引擎 / Ark</div>
                    <div className="toolbar-engine-provider-description">
                      当提示词 Provider 选“火山 Ark”或生成 Provider 选“火山生成”时，这张卡的字段必须填写。
                    </div>
                  </div>
                  <div className={`toolbar-engine-provider-status${isVolcengineConfigured ? ' is-ready' : ''}`}>
                    {isVolcengineConfigured ? '已配置' : '未配置'}
                  </div>
                </div>

                <div className="toolbar-engine-pill-row">
                  {isVolcenginePromptActive ? <span className="toolbar-engine-pill is-active">当前负责提示词</span> : null}
                  {isVolcengineGenerateActive ? <span className="toolbar-engine-pill is-active">当前负责生成</span> : null}
                  <span className="toolbar-engine-pill">提示词模型</span>
                  <span className="toolbar-engine-pill">文生图</span>
                  <span className="toolbar-engine-pill">图像编辑</span>
                  <span className="toolbar-engine-pill">图生视频</span>
                </div>

                <div className="toolbar-engine-provider-section">
                  <div className="toolbar-engine-provider-section-title">连接信息</div>
                  <div className="toolbar-engine-provider-section-description">
                    填写 Ark 接口地址与 API Key。
                  </div>
                  <div className="toolbar-modal-body">
                    <label className="toolbar-modal-label" htmlFor="engine-ark-base-url">
                      Ark Base URL
                    </label>
                    <Input
                      id="engine-ark-base-url"
                      value={engineConfigDraft.volcengine.ark_base_url}
                      placeholder="https://ark.cn-beijing.volces.com/api/v3"
                      onChange={(event) => updateVolcengineConfigField('ark_base_url', event.target.value)}
                    />
                  </div>
                  <div className="toolbar-modal-body">
                    <label className="toolbar-modal-label" htmlFor="engine-ark-api-key">
                      Ark API Key
                    </label>
                    <Input.Password
                      id="engine-ark-api-key"
                      value={engineConfigDraft.volcengine.ark_api_key}
                      placeholder="请输入你自己的 Ark API Key"
                      onChange={(event) => updateVolcengineConfigField('ark_api_key', event.target.value)}
                    />
                  </div>
                </div>

                <div className="toolbar-engine-provider-section">
                  <div className="toolbar-engine-provider-section-title">模型配置</div>
                  <div className="toolbar-engine-provider-section-description">
                    提示词、图片和视频都会读取这里的模型 ID。
                  </div>
                  <div className="toolbar-engine-grid">
                    <div className="toolbar-modal-body">
                      <label className="toolbar-modal-label" htmlFor="engine-prompt-model">
                        提示词模型
                      </label>
                      <Input
                        id="engine-prompt-model"
                        value={engineConfigDraft.volcengine.prompt_model}
                        placeholder="doubao-seed-1-6-251015"
                        onChange={(event) => updateVolcengineConfigField('prompt_model', event.target.value)}
                      />
                    </div>

                    <div className="toolbar-modal-body">
                      <label className="toolbar-modal-label" htmlFor="engine-video-model">
                        视频模型
                      </label>
                      <Input
                        id="engine-video-model"
                        value={engineConfigDraft.volcengine.video_model}
                        placeholder="doubao-seedance-1-5-pro-251215"
                        onChange={(event) => updateVolcengineConfigField('video_model', event.target.value)}
                      />
                    </div>

                    <div className="toolbar-modal-body">
                      <label className="toolbar-modal-label" htmlFor="engine-image-model">
                        文生图模型
                      </label>
                      <Input
                        id="engine-image-model"
                        value={engineConfigDraft.volcengine.image_model}
                        placeholder="doubao-seedream-5-0-260128"
                        onChange={(event) => updateVolcengineConfigField('image_model', event.target.value)}
                      />
                    </div>

                    <div className="toolbar-modal-body">
                      <label className="toolbar-modal-label" htmlFor="engine-image-edit-model">
                        图像编辑模型
                      </label>
                      <Input
                        id="engine-image-edit-model"
                        value={engineConfigDraft.volcengine.image_edit_model}
                        placeholder="doubao-seedream-5-0-260128"
                        onChange={(event) => updateVolcengineConfigField('image_edit_model', event.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </section>

              <section
                className={`toolbar-engine-provider-card${isDashScopeConfigured ? ' is-ready' : ''}${isDashScopeActive ? ' is-active' : ''}`}
              >
                <div className="toolbar-engine-provider-header">
                  <div className="toolbar-engine-provider-copy">
                    <div className="toolbar-engine-provider-eyebrow">服务 B</div>
                    <div className="toolbar-engine-provider-title">阿里云 / DashScope</div>
                    <div className="toolbar-engine-provider-description">
                      千问和万相共用这一套 DashScope 鉴权。提示词 Provider 选“千问”或生成 Provider 选“万相”时，这张卡必须填写。
                    </div>
                  </div>
                  <div className={`toolbar-engine-provider-status${isDashScopeConfigured ? ' is-ready' : ''}`}>
                    {isDashScopeConfigured ? '已配置' : '未配置'}
                  </div>
                </div>

                <div className="toolbar-engine-pill-row">
                  {isDashScopePromptActive ? <span className="toolbar-engine-pill is-active">当前负责提示词</span> : null}
                  {isDashScopeGenerateActive ? <span className="toolbar-engine-pill is-active">当前负责生成</span> : null}
                  <span className="toolbar-engine-pill">Qwen 文本</span>
                  <span className="toolbar-engine-pill">Qwen 多模态</span>
                  <span className="toolbar-engine-pill">万相图片</span>
                  <span className="toolbar-engine-pill">万相视频</span>
                </div>

                <div className="toolbar-engine-provider-section">
                  <div className="toolbar-engine-provider-section-title">连接信息</div>
                  <div className="toolbar-engine-provider-section-description">
                    填写 DashScope 地址与 API Key，千问和万相会共同使用。
                  </div>
                  <div className="toolbar-modal-body">
                    <label className="toolbar-modal-label" htmlFor="engine-dashscope-base-url">
                      DashScope Base URL
                    </label>
                    <Input
                      id="engine-dashscope-base-url"
                      value={engineConfigDraft.dashscope.base_url}
                      placeholder="https://dashscope.aliyuncs.com"
                      onChange={(event) => updateDashScopeConfigField('base_url', event.target.value)}
                    />
                  </div>
                  <div className="toolbar-modal-body">
                    <label className="toolbar-modal-label" htmlFor="engine-dashscope-api-key">
                      DashScope API Key
                    </label>
                    <Input.Password
                      id="engine-dashscope-api-key"
                      value={engineConfigDraft.dashscope.api_key}
                      placeholder="请输入 DashScope / 百炼 API Key"
                      onChange={(event) => updateDashScopeConfigField('api_key', event.target.value)}
                    />
                  </div>
                </div>

                <div className="toolbar-engine-provider-section">
                  <div className="toolbar-engine-provider-section-title">Qwen 提示词模型</div>
                  <div className="toolbar-engine-provider-section-description">
                    用于提示词生成、润色，以及带参考图时的多模态提示词处理。
                  </div>
                  <div className="toolbar-engine-grid">
                    <div className="toolbar-modal-body">
                      <label className="toolbar-modal-label" htmlFor="engine-qwen-text-model">
                        Qwen 文本模型
                      </label>
                      <Input
                        id="engine-qwen-text-model"
                        value={engineConfigDraft.dashscope.qwen_text_model}
                        placeholder="qwen-plus"
                        onChange={(event) => updateDashScopeConfigField('qwen_text_model', event.target.value)}
                      />
                    </div>

                    <div className="toolbar-modal-body">
                      <label className="toolbar-modal-label" htmlFor="engine-qwen-multimodal-model">
                        Qwen 多模态模型
                      </label>
                      <Input
                        id="engine-qwen-multimodal-model"
                        value={engineConfigDraft.dashscope.qwen_multimodal_model}
                        placeholder="qwen-vl-plus"
                        onChange={(event) => updateDashScopeConfigField('qwen_multimodal_model', event.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="toolbar-engine-provider-section">
                  <div className="toolbar-engine-provider-section-title">万相生成模型</div>
                  <div className="toolbar-engine-provider-section-description">
                    用于万相图片生成和图生视频。
                  </div>
                  <div className="toolbar-engine-grid">
                    <div className="toolbar-modal-body">
                      <label className="toolbar-modal-label" htmlFor="engine-wanx-image-model">
                        万相图像模型
                      </label>
                      <Input
                        id="engine-wanx-image-model"
                        value={engineConfigDraft.dashscope.wanx_image_model}
                        placeholder="wan2.7-image-pro"
                        onChange={(event) => updateDashScopeConfigField('wanx_image_model', event.target.value)}
                      />
                    </div>

                    <div className="toolbar-modal-body">
                      <label className="toolbar-modal-label" htmlFor="engine-wanx-video-model">
                        万相视频模型
                      </label>
                      <Input
                        id="engine-wanx-video-model"
                        value={engineConfigDraft.dashscope.wanx_video_model}
                        placeholder="wan2.7-i2v"
                        onChange={(event) => updateDashScopeConfigField('wanx_video_model', event.target.value)}
                      />
                    </div>

                    <div className="toolbar-modal-body">
                      <label className="toolbar-modal-label" htmlFor="engine-wanx-video-resolution">
                        万相视频分辨率
                      </label>
                      <Select
                        id="engine-wanx-video-resolution"
                        value={engineConfigDraft.dashscope.wanx_video_resolution}
                        options={wanxVideoResolutionOptions}
                        onChange={(value) => updateDashScopeConfigField('wanx_video_resolution', value)}
                        className="field-select nodrag nopan"
                      />
                    </div>

                    <div className="toolbar-modal-body">
                      <label className="toolbar-modal-label" htmlFor="engine-wanx-watermark">
                        万相水印
                      </label>
                      <Select
                        id="engine-wanx-watermark"
                        value={engineConfigDraft.dashscope.wanx_watermark}
                        options={watermarkOptions}
                        onChange={(value) => updateDashScopeConfigField('wanx_watermark', value)}
                        className="field-select nodrag nopan"
                      />
                    </div>
                  </div>
                </div>

                <div className="toolbar-engine-provider-section">
                  <div className="toolbar-engine-provider-section-title">万相视频临时托管（可选）</div>
                  <div className="toolbar-engine-provider-section-description">
                    只有当万相图生视频要读取本地首尾帧、且这些图片没有公网 URL 时，才需要这组 OSS 配置。
                    如果你已经配置了 `PUBLIC_BASE_URL`，这里可以不填。
                  </div>

                    <div className="toolbar-engine-inline-summary">
                      <div className="toolbar-engine-inline-copy">当前状态：{dashScopeOssSummary}</div>
                      <div className="toolbar-engine-inline-actions">
                        <span className={`toolbar-engine-mini-status${isDashScopeOssReady ? ' is-ready' : ''}`}>
                          {isDashScopeOssReady ? '已配置' : '未启用'}
                        </span>
                        <Button
                          type="text"
                          size="small"
                          icon={isDashScopeOssExpanded ? <UpOutlined /> : <DownOutlined />}
                        className="toolbar-engine-expand-button"
                        onClick={() => setIsDashScopeOssExpanded((value) => !value)}
                      >
                        {isDashScopeOssExpanded ? '收起设置' : '展开设置'}
                      </Button>
                    </div>
                  </div>

                  {isDashScopeOssExpanded ? (
                    <>
                      <div className="toolbar-engine-help-note">
                        推荐最简填写 4 项：Region、Bucket、Access Key ID、Access Key Secret。
                        Endpoint 会按 Region 自动推导。
                      </div>

                      <div className="toolbar-engine-grid">
                        <div className="toolbar-modal-body">
                          <label className="toolbar-modal-label" htmlFor="engine-oss-region">
                            OSS Region
                          </label>
                          <Input
                            id="engine-oss-region"
                            value={engineConfigDraft.dashscope.oss_region}
                            placeholder="cn-shanghai"
                            onChange={(event) => updateDashScopeConfigField('oss_region', event.target.value)}
                          />
                        </div>

                        <div className="toolbar-modal-body">
                          <label className="toolbar-modal-label" htmlFor="engine-oss-bucket">
                            OSS Bucket
                          </label>
                          <Input
                            id="engine-oss-bucket"
                            value={engineConfigDraft.dashscope.oss_bucket}
                            placeholder="your-temp-bucket"
                            onChange={(event) => updateDashScopeConfigField('oss_bucket', event.target.value)}
                          />
                        </div>

                        <div className="toolbar-modal-body">
                          <label className="toolbar-modal-label" htmlFor="engine-oss-access-key-id">
                            Access Key ID
                          </label>
                          <Input
                            id="engine-oss-access-key-id"
                            value={engineConfigDraft.dashscope.oss_access_key_id}
                            placeholder="请输入阿里云 Access Key ID"
                            onChange={(event) => updateDashScopeConfigField('oss_access_key_id', event.target.value)}
                          />
                        </div>

                        <div className="toolbar-modal-body">
                          <label className="toolbar-modal-label" htmlFor="engine-oss-access-key-secret">
                            Access Key Secret
                          </label>
                          <Input.Password
                            id="engine-oss-access-key-secret"
                            value={engineConfigDraft.dashscope.oss_access_key_secret}
                            placeholder="请输入阿里云 Access Key Secret"
                            onChange={(event) =>
                              updateDashScopeConfigField('oss_access_key_secret', event.target.value)
                            }
                          />
                        </div>
                      </div>

                      <Button
                        type="text"
                        size="small"
                        icon={isDashScopeOssAdvancedExpanded ? <UpOutlined /> : <DownOutlined />}
                        className="toolbar-engine-expand-button"
                        onClick={() => setIsDashScopeOssAdvancedExpanded((value) => !value)}
                      >
                        {isDashScopeOssAdvancedExpanded ? '收起高级项' : '展开高级项'}
                      </Button>

                      {isDashScopeOssAdvancedExpanded ? (
                        <div className="toolbar-engine-grid">
                          <div className="toolbar-modal-body">
                            <label className="toolbar-modal-label" htmlFor="engine-oss-endpoint">
                              自定义 Endpoint（高级）
                            </label>
                            <Input
                              id="engine-oss-endpoint"
                              value={engineConfigDraft.dashscope.oss_endpoint}
                              placeholder="留空时按 Region 自动推导"
                              onChange={(event) => updateDashScopeConfigField('oss_endpoint', event.target.value)}
                            />
                          </div>

                          <div className="toolbar-modal-body">
                            <label className="toolbar-modal-label" htmlFor="engine-oss-key-prefix">
                              临时目录前缀（高级）
                            </label>
                            <Input
                              id="engine-oss-key-prefix"
                              value={engineConfigDraft.dashscope.oss_key_prefix}
                              placeholder="sketchshot-temp"
                              onChange={(event) => updateDashScopeConfigField('oss_key_prefix', event.target.value)}
                            />
                          </div>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </section>
            </div>
          </div>
        )}
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
          <Button
            key="save-template"
            disabled={isWorkflowExecuting || !hasCanvasContent}
            onClick={openSaveTemplateModal}
          >
            保存当前为我的模板
          </Button>,
          <Button key="close" type="primary" disabled={isWorkflowExecuting} onClick={() => setIsTemplateModalOpen(false)}>
            关闭
          </Button>,
        ]}
      >
        <div className="toolbar-template-browser">
          <div className="toolbar-template-group-header">
            <div className="toolbar-template-group-title">{activeTemplateHeaderMeta.title}</div>
            <div className="toolbar-template-group-description">
              {activeTemplateHeaderMeta.description}
            </div>
          </div>

          <div className="toolbar-template-category-switcher">
            <Segmented
              value={activeTemplateCategory}
              onChange={(value) => setActiveTemplateCategory(value as TemplateBrowserCategory)}
              options={templateCategoryOptions}
              className="toolbar-template-category-tabs"
            />
          </div>

          <div className="toolbar-template-group-list">
            {isUserTemplateCategoryActive ? (
              isUserTemplateListLoading ? (
                <div className="toolbar-template-loading">
                  <Spin />
                </div>
              ) : userTemplateList.length > 0 ? (
                userTemplateList.map((template) => (
                  <div key={template.id} className="toolbar-workflow-item toolbar-template-item">
                    <div className="toolbar-workflow-meta">
                      <div className="toolbar-template-title-row">
                        <div className="toolbar-workflow-name">{template.name}</div>
                        <div className="toolbar-template-tags">
                          <span className="toolbar-template-badge">我的模板</span>
                        </div>
                      </div>
                      <div className="toolbar-template-description">
                        从当前画布沉淀下来的可复用工作流骨架，可以在新项目里直接套用。
                      </div>
                      <div className="toolbar-workflow-detail">
                        <span>{template.node_count} 个节点</span>
                        <span>更新时间：{formatTime(template.updated_at)}</span>
                      </div>
                      <div className="toolbar-template-hint">
                        会保留结构和你填写的设定，不会把旧结果、上传图和运行状态一起带进新项目。
                      </div>
                    </div>
                    <div className="toolbar-workflow-actions">
                      <Button
                        size="small"
                        type="primary"
                        disabled={isWorkflowExecuting}
                        loading={activeUserTemplateId === template.id}
                        onClick={() => void handleApplyUserTemplate(template.id)}
                      >
                        应用模板
                      </Button>
                      <Popconfirm
                        title="删除模板"
                        description={`确认删除「${template.name}」吗？`}
                        okText="确认"
                        cancelText="取消"
                        onConfirm={() => void handleDeleteUserTemplate(template.id)}
                      >
                        <Button
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                          disabled={isWorkflowExecuting}
                          loading={activeUserTemplateId === template.id}
                        >
                          删除
                        </Button>
                      </Popconfirm>
                    </div>
                  </div>
                ))
              ) : (
                <Empty description="还没有保存过自己的模板" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              )
            ) : activeTemplateGroup ? (
              activeTemplateGroup.templates.map((template) => (
                <div key={template.id} className="toolbar-workflow-item toolbar-template-item">
                  <div className="toolbar-workflow-meta">
                    <div className="toolbar-template-title-row">
                      <div className="toolbar-workflow-name">{template.name}</div>
                      <div className="toolbar-template-tags">
                        {template.recommended && <span className="toolbar-template-badge recommended">推荐</span>}
                        <span className="toolbar-template-badge">{activeTemplateGroup.meta.title}</span>
                      </div>
                    </div>
                    <div className="toolbar-template-description">{template.description}</div>
                    <div className="toolbar-workflow-detail">
                      <span>{template.nodes.length} 个节点</span>
                      <span>{template.edges.length} 条连线</span>
                    </div>
                    <TemplateSummaryMeta template={template} />
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
              ))
            ) : (
              <Empty description="当前没有可用模板" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </div>
        </div>
      </Modal>

      <Modal
        title="保存为我的模板"
        open={isSaveTemplateModalOpen}
        onCancel={() => {
          if (!isUserTemplateSaving) {
            setIsSaveTemplateModalOpen(false)
          }
        }}
        destroyOnHidden
        footer={[
          <Button key="cancel" disabled={isUserTemplateSaving} onClick={() => setIsSaveTemplateModalOpen(false)}>
            取消
          </Button>,
          <Button
            key="submit"
            type="primary"
            loading={isUserTemplateSaving}
            onClick={() => void handleSaveUserTemplate()}
          >
            保存模板
          </Button>,
        ]}
      >
        <div className="toolbar-modal-body">
          <div className="toolbar-template-hint">
            会自动清理生成结果、上传图、运行状态等临时数据，只保留结构、提示词和你当前填写的节点设定。
          </div>
          <label className="toolbar-modal-label" htmlFor="template-name-input">
            模板名称
          </label>
          <Input
            id="template-name-input"
            value={templateNameDraft}
            maxLength={100}
            onChange={(event) => setTemplateNameDraft(event.target.value)}
            placeholder="请输入模板名称"
          />
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

            <TemplateSummaryMeta template={appliedTemplateGuide} />

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
