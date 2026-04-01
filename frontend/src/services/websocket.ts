/**
 * WebSocket helpers for generation progress.
 */
import { config } from '../config'

export interface ProgressMessage {
  progress: number
  status: 'processing' | 'success' | 'error'
  message: string
  output_image: string | null
  output_video: string | null
}

export type ProgressCallback = (message: ProgressMessage) => void
export type ProgressErrorCallback = (error: Error) => void

export function connectProgress(
  nodeId: string,
  onProgress: ProgressCallback,
  onError?: ProgressErrorCallback
): () => void {
  const wsUrl = config.wsBaseUrl
    ? `${config.wsBaseUrl}/ws/progress/${nodeId}`
    : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/progress/${nodeId}`

  const websocket = new WebSocket(wsUrl)

  websocket.onmessage = (event) => {
    try {
      const message: ProgressMessage = JSON.parse(event.data)
      onProgress(message)
    } catch (error) {
      console.error('[websocket] failed to parse progress message', error)
    }
  }

  websocket.onerror = () => {
    onError?.(new Error('WebSocket connection failed'))
  }

  return () => {
    if (websocket.readyState === WebSocket.OPEN || websocket.readyState === WebSocket.CONNECTING) {
      websocket.close()
    }
  }
}
