import type { AppNode, ImageGenNodeData, VideoGenNodeData } from '../types'
import { buildGenerationSignature, buildVideoGenerationSignature } from './generationSignature'

export interface WorkflowCreditSummary {
  executableNodeCount: number
  cachedNodeCount: number
  estimatedCredits: number
}

function isNodeDisabled(node: AppNode): boolean {
  return (node.data as Record<string, unknown>).disabled === true
}

function getNodeCostAndCache(node: AppNode): { creditCost: number; hasCache: boolean } | null {
  if (node.type === 'imageGen') {
    const data = node.data as ImageGenNodeData
    const signature = buildGenerationSignature(data)

    return {
      creditCost: data.creditCost,
      hasCache: Boolean(data.resultCache?.[signature]),
    }
  }

  if (node.type === 'videoGen') {
    const data = node.data as VideoGenNodeData
    const signature = buildVideoGenerationSignature(data)

    return {
      creditCost: data.creditCost,
      hasCache: Boolean(data.resultCache?.[signature]),
    }
  }

  return null
}

export function getWorkflowCreditSummary(nodes: AppNode[]): WorkflowCreditSummary {
  return nodes.reduce<WorkflowCreditSummary>(
    (summary, node) => {
      if (isNodeDisabled(node)) {
        return summary
      }

      const metrics = getNodeCostAndCache(node)
      if (!metrics) {
        return summary
      }

      return {
        executableNodeCount: summary.executableNodeCount + 1,
        cachedNodeCount: summary.cachedNodeCount + (metrics.hasCache ? 1 : 0),
        estimatedCredits: summary.estimatedCredits + (metrics.hasCache ? 0 : metrics.creditCost),
      }
    },
    {
      executableNodeCount: 0,
      cachedNodeCount: 0,
      estimatedCredits: 0,
    }
  )
}
