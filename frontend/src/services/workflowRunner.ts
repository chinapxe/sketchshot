import { useFlowStore } from '../stores/useFlowStore'
import type { AppEdge, AppNode } from '../types'
import { getTopologicallySortedNodes } from '../utils/workflowExecution'
import { executeContinuityNode } from './continuityGeneration'
import { executeImageGenNode } from './nodeGeneration'
import { executeShotNode } from './storyboardGeneration'
import { executeThreeViewGenNode } from './threeViewGeneration'
import { executeVideoGenNode } from './videoGeneration'

export interface WorkflowExecutionResult {
  orderedNodeIds: string[]
  executedNodeIds: string[]
  skippedNodeIds: string[]
}

function isContinuityPreviewExecutionTarget(node: AppNode, edges: AppEdge[], nodes: AppNode[]): boolean {
  if (node.type !== 'continuity') {
    return false
  }

  return edges.some((edge) => {
    if (edge.source !== node.id) {
      return false
    }

    const targetNode = nodes.find((item) => item.id === edge.target)
    return targetNode?.type === 'imageDisplay' || targetNode?.type === 'videoGen'
  })
}

function isExecutableNode(node: AppNode, edges: AppEdge[], nodes: AppNode[]): boolean {
  return (
    node.type === 'imageGen'
    || node.type === 'threeViewGen'
    || node.type === 'videoGen'
    || node.type === 'shot'
    || isContinuityPreviewExecutionTarget(node, edges, nodes)
  )
}

export async function executeWorkflow(): Promise<WorkflowExecutionResult> {
  const store = useFlowStore.getState()
  const orderedNodes = getTopologicallySortedNodes(store.nodes, store.edges)
  const executableNodes = orderedNodes.filter((node) => isExecutableNode(node, store.edges, store.nodes))

  if (executableNodes.length === 0) {
    throw new Error('当前工作流中没有可执行的生成节点')
  }

  const executedNodeIds: string[] = []
  const skippedNodeIds = orderedNodes
    .filter((node) => !isExecutableNode(node, store.edges, store.nodes))
    .map((node) => node.id)

  store.setWorkflowExecutionState(true, null)

  try {
    for (const node of executableNodes) {
      const latestNode = useFlowStore.getState().nodes.find((item) => item.id === node.id)
      if (!latestNode || !isExecutableNode(latestNode, useFlowStore.getState().edges, useFlowStore.getState().nodes)) continue

      if ((latestNode.data as Record<string, unknown>).disabled === true) {
        skippedNodeIds.push(node.id)
        continue
      }

      useFlowStore.getState().setWorkflowExecutionState(true, node.id)

      if (latestNode.type === 'imageGen') {
        await executeImageGenNode(node.id, {
          showSuccessMessage: false,
          showErrorMessage: false,
        })
      } else if (latestNode.type === 'threeViewGen') {
        await executeThreeViewGenNode(node.id, {
          showSuccessMessage: false,
          showErrorMessage: false,
        })
      } else if (latestNode.type === 'continuity') {
        await executeContinuityNode(node.id, {
          showSuccessMessage: false,
          showErrorMessage: false,
        })
      } else if (latestNode.type === 'shot') {
        await executeShotNode(node.id, {
          showSuccessMessage: false,
          showErrorMessage: false,
        })
      } else {
        await executeVideoGenNode(node.id, {
          showSuccessMessage: false,
          showErrorMessage: false,
        })
      }

      executedNodeIds.push(node.id)
    }

    return {
      orderedNodeIds: orderedNodes.map((node) => node.id),
      executedNodeIds,
      skippedNodeIds,
    }
  } finally {
    useFlowStore.getState().setWorkflowExecutionState(false, null)
  }
}
