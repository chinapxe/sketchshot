import { create } from 'zustand'

export type PreviewAssetType = 'image' | 'video'

export interface PreviewAsset {
  type: PreviewAssetType
  src: string
  title?: string
}

interface AssetPreviewState {
  isOpen: boolean
  asset: PreviewAsset | null
  openPreview: (asset: PreviewAsset) => void
  closePreview: () => void
}

export const useAssetPreviewStore = create<AssetPreviewState>((set) => ({
  isOpen: false,
  asset: null,

  openPreview: (asset) => {
    set({ isOpen: true, asset })
  },

  closePreview: () => {
    set({ isOpen: false, asset: null })
  },
}))
