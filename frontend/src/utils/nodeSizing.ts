import type { AppNodeType } from '../types'

export type NodeSize = {
  width: number
  height: number
}

export const MAX_CUSTOM_NODE_WIDTH = 960

export const DEFAULT_NODE_SIZES: Record<AppNodeType, NodeSize> = {
  imageUpload: { width: 240, height: 180 },
  imageGen: { width: 300, height: 460 },
  imageDisplay: { width: 280, height: 240 },
  videoGen: { width: 300, height: 420 },
  videoDisplay: { width: 280, height: 260 },
  scene: { width: 320, height: 340 },
  character: { width: 320, height: 620 },
  style: { width: 320, height: 360 },
  shot: { width: 320, height: 1040 },
}

export function clampNodeWidth(width: number, minWidth: number, maxWidth = MAX_CUSTOM_NODE_WIDTH): number {
  return Math.round(Math.min(maxWidth, Math.max(minWidth, width)))
}

export function getCustomNodeWidth(data: Record<string, unknown> | undefined): number | undefined {
  if (!data) return undefined

  const rawWidth = data.nodeWidth
  const numericWidth = typeof rawWidth === 'number'
    ? rawWidth
    : typeof rawWidth === 'string'
      ? Number(rawWidth)
      : Number.NaN

  if (!Number.isFinite(numericWidth) || numericWidth <= 0) {
    return undefined
  }

  return Math.round(numericWidth)
}

export function resolveNodeWidth(
  data: Record<string, unknown> | undefined,
  defaultWidth: number,
  maxWidth = MAX_CUSTOM_NODE_WIDTH
): number {
  return clampNodeWidth(getCustomNodeWidth(data) ?? defaultWidth, defaultWidth, maxWidth)
}

export function getNodeWidthStyle(
  data: Record<string, unknown> | undefined,
  defaultWidth: number,
  maxWidth = MAX_CUSTOM_NODE_WIDTH
): { width: number } {
  return {
    width: resolveNodeWidth(data, defaultWidth, maxWidth),
  }
}
