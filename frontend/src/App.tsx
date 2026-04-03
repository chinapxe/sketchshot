import { useCallback, useEffect, useRef, useState } from 'react'
import { message } from 'antd'
import { ReactFlowProvider } from '@xyflow/react'

import AssetPreviewModal from './components/AssetPreviewModal'
import Canvas from './components/Canvas'
import Sidebar from './components/Sidebar'
import { useFlowStore } from './stores/useFlowStore'
import type { ProjectExchangePayload } from './utils/projectExchange'
import { loadLocalDraft, saveLocalDraft } from './utils/projectExchange'
import './App.css'

function LocalDraftController() {
  const nodes = useFlowStore((state) => state.nodes)
  const edges = useFlowStore((state) => state.edges)
  const currentWorkflowId = useFlowStore((state) => state.currentWorkflowId)
  const currentWorkflowName = useFlowStore((state) => state.currentWorkflowName)
  const loadWorkflow = useFlowStore((state) => state.loadWorkflow)

  const hasRestoredRef = useRef(false)
  const saveTimerRef = useRef<number | null>(null)
  const latestPayloadRef = useRef<ProjectExchangePayload>({
    workflowId: null,
    name: 'Untitled Workflow',
    nodes: [],
    edges: [],
  })
  const [isDraftReady, setIsDraftReady] = useState(false)

  useEffect(() => {
    latestPayloadRef.current = {
      workflowId: currentWorkflowId,
      name: currentWorkflowName,
      nodes,
      edges,
    }
  }, [currentWorkflowId, currentWorkflowName, edges, nodes])

  const flushLocalDraft = useCallback(() => {
    if (!isDraftReady) {
      return
    }

    void saveLocalDraft(latestPayloadRef.current).catch((error) => {
      console.error('[App] failed to save local draft', error)
    })
  }, [isDraftReady])

  useEffect(() => {
    if (hasRestoredRef.current) return
    hasRestoredRef.current = true

    let isMounted = true

    void (async () => {
      try {
        if (nodes.length > 0 || edges.length > 0) {
          return
        }

        const draft = await loadLocalDraft()
        if (!draft) {
          return
        }

        loadWorkflow({
          id: draft.workflowId,
          name: draft.name,
          nodes: draft.nodes,
          edges: draft.edges,
        })
        if (isMounted) {
          message.success('已自动恢复上次未关闭的画布内容')
        }
      } catch (error) {
        console.error('[App] failed to restore local draft', error)
      } finally {
        setIsDraftReady(true)
      }
    })()

    return () => {
      isMounted = false
    }
  }, [edges.length, loadWorkflow, nodes.length])

  useEffect(() => {
    if (!isDraftReady) {
      return
    }

    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
    }

    saveTimerRef.current = window.setTimeout(() => {
      flushLocalDraft()
      saveTimerRef.current = null
    }, 250)

    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
    }
  }, [currentWorkflowId, currentWorkflowName, edges, flushLocalDraft, isDraftReady, nodes])

  useEffect(() => {
    if (!isDraftReady) {
      return
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushLocalDraft()
      }
    }

    const handlePageHide = () => {
      flushLocalDraft()
    }

    const handleBeforeUnload = () => {
      flushLocalDraft()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pagehide', handlePageHide)
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pagehide', handlePageHide)
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [flushLocalDraft, isDraftReady])

  return null
}

function App() {
  return (
    <div className="app-layout">
      <ReactFlowProvider>
        <LocalDraftController />
        <Sidebar />
        <Canvas />
        <AssetPreviewModal />
      </ReactFlowProvider>
    </div>
  )
}

export default App
