import { describe, expect, it } from 'vitest'

import type { AppNode, ImageGenNodeData, ShotNodeData, VideoGenNodeData } from '../types'
import { buildGenerationSignature, buildShotGenerationSignature, buildVideoGenerationSignature } from './generationSignature'
import { getWorkflowCreditSummary } from './workflowMetrics'

describe('getWorkflowCreditSummary', () => {
  it('includes image, video, and shot generation nodes and honors cache hits', () => {
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

    const shotData: ShotNodeData = {
      label: 'Shot',
      title: 'Hero close up',
      description: 'Hero turns in rain',
      prompt: '',
      continuityFrames: Array.from({ length: 9 }, () => ''),
      shotSize: 'close-up',
      cameraAngle: 'eye-level',
      motion: '',
      emotion: 'tense',
      aspectRatio: '16:9',
      resolution: '2K',
      outputType: 'image',
      imageAdapter: 'mock',
      videoAdapter: 'mock',
      durationSeconds: 4,
      motionStrength: 0.6,
      identityLock: false,
      identityStrength: 0.7,
      referenceImages: ['/uploads/ref.png'],
      contextSignature: 'scene-1',
      status: 'idle',
      progress: 0,
      creditCost: 30,
      outputImage: undefined,
      outputVideo: undefined,
      lastRunSignature: undefined,
      resultCache: {},
      needsRefresh: false,
      errorMessage: undefined,
    }
    const shotSignature = buildShotGenerationSignature(shotData)

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
      {
        id: 'shot-cached',
        type: 'shot',
        position: { x: 960, y: 0 },
        data: {
          ...shotData,
          resultCache: {
            [shotSignature]: '/outputs/shot.png',
          },
        },
      } as AppNode,
    ]

    const summary = getWorkflowCreditSummary(nodes)

    expect(summary.executableNodeCount).toBe(4)
    expect(summary.cachedNodeCount).toBe(3)
    expect(summary.estimatedCredits).toBe(90)
  })
})
