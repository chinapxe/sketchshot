import type {
  AppEdge,
  AppNode,
  ContinuityNodeData,
  ImageGenNodeData,
  ShotNodeData,
  ThreeViewGenNodeData,
  VideoGenNodeData,
} from '../types'
import {
  buildContinuityGenerationSignature,
  buildGenerationSignature,
  buildShotGenerationSignature,
  buildThreeViewGenerationSignature,
  buildVideoGenerationSignature,
} from './generationSignature'
import { getThreeViewOutputMode, hasCompleteThreeViewImages, normalizeLooseThreeViewImages } from './threeView'

export interface WorkflowCreditSummary {
  executableNodeCount: number
  cachedNodeCount: number
  estimatedCredits: number
}

function isNodeDisabled(node: AppNode): boolean {
  return (node.data as Record<string, unknown>).disabled === true
}

function shouldCountContinuityNode(node: AppNode, nodes: AppNode[], edges: AppEdge[]): boolean {
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

function getNodeCostAndCache(node: AppNode): { creditCost: number; hasCache: boolean } | null {
  if (node.type === 'imageGen') {
    const data = node.data as ImageGenNodeData
    const signature = buildGenerationSignature(data)

    return {
      creditCost: data.creditCost,
      hasCache: Boolean(data.resultCache?.[signature]),
    }
  }

  if (node.type === 'threeViewGen') {
    const data = node.data as ThreeViewGenNodeData
    const signature = buildThreeViewGenerationSignature(data)
    const outputMode = getThreeViewOutputMode(data)
    const hasCache = outputMode === 'split'
      ? hasCompleteThreeViewImages(normalizeLooseThreeViewImages(data.splitResultCache?.[signature]))
      : Boolean(data.resultCache?.[signature])

    return {
      creditCost: outputMode === 'split' ? 90 : data.creditCost,
      hasCache,
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

  if (node.type === 'continuity') {
    const data = node.data as ContinuityNodeData
    const signature = buildContinuityGenerationSignature(data)

    return {
      creditCost: data.creditCost ?? 30,
      hasCache: Boolean(data.resultCache?.[signature]),
    }
  }

  if (node.type === 'shot') {
    const data = node.data as ShotNodeData
    const signature = buildShotGenerationSignature(data)

    return {
      creditCost: data.creditCost,
      hasCache: Boolean(data.resultCache?.[signature]),
    }
  }

  return null
}

export function getWorkflowCreditSummary(nodes: AppNode[], edges: AppEdge[] = []): WorkflowCreditSummary {
  return nodes.reduce<WorkflowCreditSummary>(
    (summary, node) => {
      if (isNodeDisabled(node)) {
        return summary
      }

      if (node.type === 'continuity' && !shouldCountContinuityNode(node, nodes, edges)) {
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
