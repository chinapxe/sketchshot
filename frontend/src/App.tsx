/**
 * WXHB - AI 可视化工作流无限画布平台
 * 主应用组件
 */
import { ReactFlowProvider } from '@xyflow/react'
import AssetPreviewModal from './components/AssetPreviewModal'
import Canvas from './components/Canvas'
import Sidebar from './components/Sidebar'
import './App.css'

function App() {
  return (
    <div className="app-layout">
      <ReactFlowProvider>
        <Sidebar />
        <Canvas />
        <AssetPreviewModal />
      </ReactFlowProvider>
    </div>
  )
}

export default App
