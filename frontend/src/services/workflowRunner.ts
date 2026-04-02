import { useFlowStore } from '../stores/useFlowStore'
import type { AppNode } from '../types'
import { getTopologicallySortedNodes } from '../utils/workflowExecution'
import { executeImageGenNode } from './nodeGeneration'
import { executeShotNode } from './storyboardGeneration'
import { executeVideoGenNode } from './videoGeneration'

export interface WorkflowExecutionResult {
  orderedNodeIds: string[]
  executedNodeIds: string[]
  skippedNodeIds: string[]
}

function isExecutableNode(node: AppNode): boolean {
  return node.type === 'imageGen' || node.type === 'videoGen' || node.type === 'shot'
}

export async function executeWorkflow(): Promise<WorkflowExecutionResult> {
  const store = useFlowStore.getState()
  const orderedNodes = getTopologicallySortedNodes(store.nodes, store.edges)
  const executableNodes = orderedNodes.filter(isExecutableNode)

  if (executableNodes.length === 0) {
    throw new Error('The current workflow has no executable generation nodes')
  }

  const executedNodeIds: string[] = []
  const skippedNodeIds = orderedNodes
    .filter((node) => !isExecutableNode(node))
    .map((node) => node.id)

  store.setWorkflowExecutionState(true, null)

  try {
    for (const node of executableNodes) {
      const latestNode = useFlowStore.getState().nodes.find((item) => item.id === node.id)
      if (!latestNode || !isExecutableNode(latestNode)) continue

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
