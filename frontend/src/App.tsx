import { useEffect, useRef } from 'react'
import { message } from 'antd'
import { ReactFlowProvider } from '@xyflow/react'

import AssetPreviewModal from './components/AssetPreviewModal'
import Canvas from './components/Canvas'
import Sidebar from './components/Sidebar'
import { useFlowStore } from './stores/useFlowStore'
import { loadLocalDraft, saveLocalDraft } from './utils/projectExchange'
import './App.css'

function LocalDraftController() {
  const nodes = useFlowStore((state) => state.nodes)
  const edges = useFlowStore((state) => state.edges)
  const currentWorkflowId = useFlowStore((state) => state.currentWorkflowId)
  const currentWorkflowName = useFlowStore((state) => state.currentWorkflowName)
  const loadWorkflow = useFlowStore((state) => state.loadWorkflow)
  const hasRestoredRef = useRef(false)

  useEffect(() => {
    if (hasRestoredRef.current) return
    hasRestoredRef.current = true

    if (nodes.length > 0 || edges.length > 0) {
      return
    }

    let isMounted = true

    void (async () => {
      const draft = await loadLocalDraft()
      if (!draft || !isMounted) {
        return
      }

      loadWorkflow({
        id: draft.workflowId,
        name: draft.name,
        nodes: draft.nodes,
        edges: draft.edges,
      })
      message.success('已自动恢复上次未关闭的画布内容')
    })().catch((error) => {
      console.error('[App] failed to restore local draft', error)
    })

    return () => {
      isMounted = false
    }
  }, [edges.length, loadWorkflow, nodes.length])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void saveLocalDraft({
        workflowId: currentWorkflowId,
        name: currentWorkflowName,
        nodes,
        edges,
      }).catch((error) => {
        console.error('[App] failed to save local draft', error)
      })
    }, 400)

    return () => {
      window.clearTimeout(timer)
    }
  }, [currentWorkflowId, currentWorkflowName, edges, nodes])

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
