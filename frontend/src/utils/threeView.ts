import type {
  CharacterThreeViewImages,
  ThreeViewGenNodeData,
  ThreeViewOutputMode,
} from '../types'

export const THREE_VIEW_SLOT_KEYS = ['front', 'side', 'back'] as const
export const THREE_VIEW_ALL_HANDLE_ID = 'output-all'

export type ThreeViewSlotKey = (typeof THREE_VIEW_SLOT_KEYS)[number]

export const THREE_VIEW_SLOT_HANDLE_IDS: Record<ThreeViewSlotKey, string> = {
  front: 'output-front',
  side: 'output-side',
  back: 'output-back',
}

export const CHARACTER_THREE_VIEW_TARGET_HANDLE_IDS: Record<ThreeViewSlotKey, string> = {
  front: 'target-front',
  side: 'target-side',
  back: 'target-back',
}

export const THREE_VIEW_SLOT_LABELS: Record<ThreeViewSlotKey, string> = {
  front: '正面',
  side: '侧面',
  back: '背面',
}

export function normalizeLooseThreeViewImages(
  value: Partial<CharacterThreeViewImages> | undefined
): CharacterThreeViewImages {
  const normalized: CharacterThreeViewImages = {}

  THREE_VIEW_SLOT_KEYS.forEach((slot) => {
    const candidate = value?.[slot]
    if (typeof candidate === 'string' && candidate.length > 0) {
      normalized[slot] = candidate
    }
  })

  return normalized
}

export function getThreeViewOutputMode(
  data: Pick<ThreeViewGenNodeData, 'outputMode'>
): ThreeViewOutputMode {
  return data.outputMode === 'split' ? 'split' : 'sheet'
}

export function getThreeViewSlotFromHandleId(handleId: string | null | undefined): ThreeViewSlotKey | null {
  const matchedEntry = Object.entries(THREE_VIEW_SLOT_HANDLE_IDS).find(([, value]) => value === handleId)
  return (matchedEntry?.[0] as ThreeViewSlotKey | undefined) ?? null
}

export function getCharacterThreeViewSlotFromHandleId(handleId: string | null | undefined): ThreeViewSlotKey | null {
  const matchedEntry = Object.entries(CHARACTER_THREE_VIEW_TARGET_HANDLE_IDS).find(([, value]) => value === handleId)
  return (matchedEntry?.[0] as ThreeViewSlotKey | undefined) ?? null
}

export function getThreeViewOutputEntries(
  data: Pick<ThreeViewGenNodeData, 'outputMode' | 'outputImage' | 'outputImages'>
): Array<{ key: ThreeViewSlotKey | 'sheet'; label: string; url: string }> {
  if (getThreeViewOutputMode(data) === 'split') {
    const entries: Array<{ key: ThreeViewSlotKey | 'sheet'; label: string; url: string }> = []

    THREE_VIEW_SLOT_KEYS.forEach((slot) => {
      const url = data.outputImages?.[slot]
      if (!url) {
        return
      }

      entries.push({
        key: slot,
        label: THREE_VIEW_SLOT_LABELS[slot],
        url,
      })
    })

    return entries
  }

  if (typeof data.outputImage === 'string' && data.outputImage.length > 0) {
    return [
      {
        key: 'sheet',
        label: '三视图拼板',
        url: data.outputImage,
      },
    ]
  }

  return []
}

export function getThreeViewOutputImages(
  data: Pick<ThreeViewGenNodeData, 'outputMode' | 'outputImage' | 'outputImages'>
): string[] {
  return getThreeViewOutputEntries(data).map((entry) => entry.url)
}

export function getThreeViewOutputImagesForHandle(
  data: Pick<ThreeViewGenNodeData, 'outputMode' | 'outputImage' | 'outputImages'>,
  handleId: string | null | undefined
): string[] {
  const slot = getThreeViewSlotFromHandleId(handleId)
  if (slot) {
    return typeof data.outputImages?.[slot] === 'string' ? [data.outputImages[slot]!] : []
  }

  return getThreeViewOutputImages(data)
}

export function getPrimaryThreeViewOutputImage(
  data: Pick<ThreeViewGenNodeData, 'outputMode' | 'outputImage' | 'outputImages'>
): string | undefined {
  return getThreeViewOutputEntries(data)[0]?.url
}

export function hasCompleteThreeViewImages(value: Partial<CharacterThreeViewImages> | undefined): boolean {
  return THREE_VIEW_SLOT_KEYS.every((slot) => typeof value?.[slot] === 'string' && value[slot]!.length > 0)
}

export function countThreeViewImages(value: Partial<CharacterThreeViewImages> | undefined): number {
  return THREE_VIEW_SLOT_KEYS.filter((slot) => typeof value?.[slot] === 'string' && value[slot]!.length > 0).length
}
