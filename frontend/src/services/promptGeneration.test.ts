import { describe, expect, it } from 'vitest'

import type { ImageGenNodeData, VideoGenNodeData } from '../types'
import { buildImagePromptRequest, buildVideoPromptRequest } from './promptGeneration'

describe('promptGeneration helpers', () => {
  it('builds image prompt requests with reference-aware metadata', () => {
    const chinesePrompt = '\u7535\u5f71\u611f\u5973\u4e3b\u89d2\u8096\u50cf\uff0c\u67d4\u548c\u4e3b\u5149\uff0c\u76ae\u80a4\u7ec6\u8282\u6e05\u6670'

    const data: ImageGenNodeData = {
      label: 'Hero Portrait',
      prompt: chinesePrompt,
      aspectRatio: '3:4',
      resolution: '2K',
      adapter: 'volcengine',
      upstreamReferenceImages: ['/uploads/ref-a.png'],
      manualReferenceImages: ['/uploads/ref-b.png'],
      referenceImages: ['/uploads/ref-a.png', '/uploads/ref-b.png'],
      isUploadingReferences: false,
      referenceUploadError: undefined,
      identityLock: true,
      identityStrength: 0.8,
      status: 'idle',
      progress: 0,
      creditCost: 30,
      resultCache: {},
      needsRefresh: false,
      outputImage: undefined,
      lastRunSignature: undefined,
      errorMessage: undefined,
    }

    expect(buildImagePromptRequest(data)).toEqual({
      task_type: 'image',
      user_input: chinesePrompt,
      style: 'reference-guided cinematic image',
      aspect_ratio: '3:4',
      extra_requirements: [
        'Target resolution: 2K',
        'Reference images available: 2',
        'Preserve character identity with strength 0.8',
      ],
      language: 'zh',
    })
  })

  it('builds fallback video prompt requests for image-to-video generation', () => {
    const data: VideoGenNodeData = {
      label: 'Motion Clip',
      prompt: '',
      aspectRatio: '16:9',
      durationSeconds: 4,
      motionStrength: 0.65,
      adapter: 'volcengine',
      sourceImages: ['/outputs/frame-a.png', '/outputs/frame-b.png'],
      status: 'idle',
      progress: 0,
      creditCost: 90,
      outputVideo: undefined,
      lastRunSignature: undefined,
      resultCache: {},
      needsRefresh: false,
      errorMessage: undefined,
    }

    expect(buildVideoPromptRequest(data)).toEqual({
      task_type: 'video',
      user_input:
        'Create an image-to-video motion prompt based on the connected key frames, emphasizing camera movement and subject motion.',
      style: 'cinematic motion prompt',
      aspect_ratio: '16:9',
      extra_requirements: [
        'Target duration: 4s',
        'Motion strength: 65%',
        'Source images available: 2',
      ],
      language: 'en',
    })
  })
})
