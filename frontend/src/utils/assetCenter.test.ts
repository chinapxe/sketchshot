import { describe, expect, it } from 'vitest'

import type { AppNode } from '../types'
import { getAssetCenterEntries } from './assetCenter'

describe('getAssetCenterEntries', () => {
  it('deduplicates assets by url and keeps source relationships', () => {
    const nodes: AppNode[] = [
      {
        id: 'upload-1',
        type: 'imageUpload',
        position: { x: 0, y: 0 },
        data: {
          label: 'Image Upload',
          imageUrl: '/uploads/hero.png',
          fileName: 'hero.png',
          isUploading: false,
          uploadError: undefined,
        },
      } as AppNode,
      {
        id: 'character-1',
        type: 'character',
        position: { x: 240, y: 0 },
        data: {
          label: 'Character',
          name: '沈迟',
          role: '记者',
          appearance: '',
          wardrobe: '',
          props: '',
          notes: '',
          referenceImages: ['/uploads/hero.png'],
        },
      } as AppNode,
      {
        id: 'shot-1',
        type: 'shot',
        position: { x: 480, y: 0 },
        data: {
          label: 'Shot',
          title: '主角回头',
          description: '雨夜回头',
          prompt: '',
          continuityFrames: Array.from({ length: 9 }, () => ''),
          shotSize: 'medium',
          cameraAngle: 'eye-level',
          motion: '',
          emotion: '',
          aspectRatio: '16:9',
          resolution: '2K',
          outputType: 'image',
          imageAdapter: 'volcengine',
          videoAdapter: 'volcengine',
          durationSeconds: 4,
          motionStrength: 0.6,
          identityLock: false,
          identityStrength: 0.7,
          referenceImages: ['/uploads/hero.png'],
          contextSignature: '',
          status: 'success',
          progress: 100,
          creditCost: 30,
          outputImage: '/outputs/shot.png',
          outputVideo: undefined,
          lastRunSignature: undefined,
          resultCache: {},
          needsRefresh: false,
          errorMessage: undefined,
        },
      } as AppNode,
      {
        id: 'video-1',
        type: 'videoGen',
        position: { x: 720, y: 0 },
        data: {
          label: 'Video Motion',
          prompt: 'push in',
          aspectRatio: '16:9',
          durationSeconds: 4,
          motionStrength: 0.6,
          adapter: 'volcengine',
          sourceImages: ['/outputs/shot.png'],
          status: 'success',
          progress: 100,
          creditCost: 90,
          outputVideo: '/outputs/clip.mp4',
          lastRunSignature: undefined,
          resultCache: {},
          needsRefresh: false,
          errorMessage: undefined,
        },
      } as AppNode,
    ]

    const entries = getAssetCenterEntries(nodes)

    expect(entries).toEqual([
      {
        key: '/uploads/hero.png',
        url: '/uploads/hero.png',
        assetType: 'image',
        category: 'upload',
        title: 'hero.png',
        sources: [
          { nodeId: 'upload-1', nodeType: 'imageUpload', nodeLabel: 'Image Upload', relation: '上传源图' },
          { nodeId: 'character-1', nodeType: 'character', nodeLabel: '沈迟', relation: '角色参考' },
          { nodeId: 'shot-1', nodeType: 'shot', nodeLabel: '主角回头', relation: '镜头参考' },
        ],
      },
      {
        key: '/outputs/shot.png',
        url: '/outputs/shot.png',
        assetType: 'image',
        category: 'generated',
        title: '主角回头',
        sources: [
          { nodeId: 'shot-1', nodeType: 'shot', nodeLabel: '主角回头', relation: '镜头图像结果' },
          { nodeId: 'video-1', nodeType: 'videoGen', nodeLabel: 'Video Motion', relation: '视频源图' },
        ],
      },
      {
        key: '/outputs/clip.mp4',
        url: '/outputs/clip.mp4',
        assetType: 'video',
        category: 'generated',
        title: 'Video Motion',
        sources: [
          { nodeId: 'video-1', nodeType: 'videoGen', nodeLabel: 'Video Motion', relation: '视频结果' },
        ],
      },
    ])
  })

  it('includes character three-view slots and preserves generated source linkage', () => {
    const nodes: AppNode[] = [
      {
        id: 'character-1',
        type: 'character',
        position: { x: 0, y: 0 },
        data: {
          label: 'Character',
          name: 'Hero',
          role: 'Lead',
          appearance: '',
          wardrobe: '',
          props: '',
          notes: '',
          referenceImages: ['/uploads/hero.png'],
          threeViewImages: {
            front: '/outputs/hero-front.png',
          },
          generatedThreeViewImages: {
            front: '/outputs/hero-front.png',
          },
        },
      } as AppNode,
    ]

    const entries = getAssetCenterEntries(nodes)
    const frontEntry = entries.find((entry) => entry.url === '/outputs/hero-front.png')

    expect(frontEntry).toBeDefined()
    expect(frontEntry?.category).toBe('generated')
    expect(frontEntry?.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nodeId: 'character-1',
          nodeType: 'character',
        }),
      ])
    )
    expect(frontEntry?.sources).toHaveLength(2)
    expect(new Set(frontEntry?.sources.map((source) => source.relation)).size).toBe(2)
  })
})
