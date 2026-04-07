import { describe, expect, it } from 'vitest'

import type { AppEdge, AppNode, ShotNodeData } from '../types'
import { sanitizeWorkflowForTemplate } from './templateUtils'

describe('sanitizeWorkflowForTemplate', () => {
  it('removes runtime outputs and asset references while preserving structure fields', () => {
    const nodes: AppNode[] = [
      {
        id: 'upload-1',
        type: 'imageUpload',
        position: { x: 80, y: 120 },
        data: {
          label: '角色参考图',
          imageUrl: '/uploads/hero.png',
          fileName: 'hero.png',
          isUploading: false,
          uploadError: undefined,
        },
      } as AppNode,
      {
        id: 'shot-1',
        type: 'shot',
        position: { x: 420, y: 120 },
        data: {
          label: '镜头 01',
          title: '回头特写',
          description: '主角停下后回头',
          prompt: '电影感、夜景、风吹发丝',
          continuityFrames: Array.from({ length: 9 }, (_, index) => `动作 ${index + 1}`),
          videoFirstFrame: '/uploads/first.png',
          videoLastFrame: '/uploads/last.png',
          shotSize: 'medium',
          cameraAngle: 'eye-level',
          cameraMovement: '',
          composition: '',
          lightingStyle: '',
          moodTags: ['tense'],
          qualityTags: ['cinematic'],
          motion: '缓慢回头',
          emotion: '警觉',
          aspectRatio: '16:9',
          resolution: '2K',
          outputType: 'video',
          imageAdapter: 'volcengine',
          videoAdapter: 'volcengine',
          durationSeconds: 5,
          motionStrength: 0.7,
          identityLock: true,
          identityStrength: 1,
          referenceImages: ['/uploads/hero.png'],
          contextSignature: 'abc',
          status: 'success',
          progress: 100,
          creditCost: 90,
          outputVideo: '/outputs/demo.mp4',
          resultCache: { foo: 'bar' },
          lastRunSignature: 'sig',
          needsRefresh: true,
          errorMessage: 'old error',
        },
      } as AppNode,
      {
        id: 'display-1',
        type: 'videoDisplay',
        position: { x: 760, y: 120 },
        data: {
          label: '视频预览',
          videos: ['/outputs/demo.mp4'],
          status: 'success',
        },
      } as AppNode,
    ]

    const edges: AppEdge[] = [
      {
        id: 'edge-1',
        source: 'upload-1',
        target: 'shot-1',
      } as AppEdge,
      {
        id: 'edge-2',
        source: 'shot-1',
        target: 'display-1',
      } as AppEdge,
    ]

    const sanitized = sanitizeWorkflowForTemplate(nodes, edges)
    const sanitizedUpload = sanitized.nodes[0]
    const sanitizedShot = sanitized.nodes[1]
    const sanitizedDisplay = sanitized.nodes[2]
    const sanitizedShotData = sanitizedShot.data as ShotNodeData

    expect(sanitizedUpload.data.imageUrl).toBeUndefined()
    expect(sanitizedUpload.data.fileName).toBeUndefined()

    expect(sanitizedShotData.title).toBe('回头特写')
    expect(sanitizedShotData.prompt).toBe('电影感、夜景、风吹发丝')
    expect(sanitizedShotData.videoFirstFrame).toBeUndefined()
    expect(sanitizedShotData.videoLastFrame).toBeUndefined()
    expect(sanitizedShotData.referenceImages).toEqual([])
    expect(sanitizedShotData.outputVideo).toBeUndefined()
    expect(sanitizedShotData.status).toBe('idle')
    expect(sanitizedShotData.progress).toBe(0)
    expect(sanitizedShotData.needsRefresh).toBe(false)
    expect(sanitizedShotData.continuityFrames[0]).toBe('动作 1')

    expect(sanitizedDisplay.data.videos).toEqual([])
    expect(sanitized.edges).toHaveLength(2)
    expect(sanitized.edges[0].source).toBe('upload-1')
  })
})
