/**
 * 全局配置 - 统一管理 API 地址等环境变量
 * 开发环境通过 Vite proxy 代理，生产环境通过 Nginx 反向代理
 * 不硬编码任何地址和端口
 */
export const config = {
  /** API 基础路径 */
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || '',

  /** WebSocket 基础路径 */
  wsBaseUrl: import.meta.env.VITE_WS_BASE_URL || '',
} as const

