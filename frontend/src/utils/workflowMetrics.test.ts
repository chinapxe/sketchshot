import { describe, expect, it } from 'vitest'

import type { AppNode, ImageGenNodeData, VideoGenNodeData } from '../types'
import { buildGenerationSignature, buildVideoGenerationSignature } from './generationSignature'
import { getWorkflowCreditSummary } from './workflowMetrics'

describe('getWorkflowCreditSummary', () => {
  it('includes image and video generation nodes and honors cache hits', () => {
    const imageData: ImageGenNodeData = {
      label: 'Image Generate',
      prompt: 'hero portrait',
      aspectRatio: '3:4',
      resolution: '2K',
      adapter: 'mock',
      upstreamReferenceImages: ['/uploads/ref.png'],
      manualReferenceImages: [],
      referenceImages: ['/uploads/ref.png'],
      isUploadingReferences: false,
      referenceUploadError: undefined,
      identityLock: false,
      identityStrength: 0.7,
      status: 'idle',
      progress: 0,
      creditCost: 30,
      resultCache: {},
      needsRefresh: false,
      outputImage: undefined,
      lastRunSignature: undefined,
      errorMessage: undefined,
    }
    const imageSignature = buildGenerationSignature(imageData)

    const videoData: VideoGenNodeData = {
      label: 'Video Motion',
      prompt: 'camera push in',
      aspectRatio: '16:9',
      durationSeconds: 4,
      motionStrength: 0.6,
      adapter: 'mock',
      sourceImages: ['/outputs/frame.png'],
      status: 'idle',
      progress: 0,
      creditCost: 90,
      outputVideo: undefined,
      lastRunSignature: undefined,
      resultCache: {},
      needsRefresh: false,
      errorMessage: undefined,
    }
    const videoSignature = buildVideoGenerationSignature(videoData)

    const nodes: AppNode[] = [
      {
        id: 'image-gen',
        type: 'imageGen',
        position: { x: 0, y: 0 },
        data: {
          ...imageData,
          resultCache: {
            [imageSignature]: '/outputs/image.png',
          },
        },
      } as AppNode,
      {
        id: 'video-gen',
        type: 'videoGen',
        position: { x: 320, y: 0 },
        data: {
          ...videoData,
          resultCache: {
            [videoSignature]: '/outputs/video.gif',
          },
        },
      } as AppNode,
      {
        id: 'video-gen-uncached',
        type: 'videoGen',
        position: { x: 640, y: 0 },
        data: videoData,
      } as AppNode,
    ]

    const summary = getWorkflowCreditSummary(nodes)

    expect(summary.executableNodeCount).toBe(3)
    expect(summary.cachedNodeCount).toBe(2)
    expect(summary.estimatedCredits).toBe(90)
  })
})
