# 非 Docker 独立启动说明

更新日期：2026-04-10 11:28:51 +08:00

## 目标

这条链路用于把 SketchShot 推进到“普通用户不懂 Docker 也能启动”的形态。

当前已落地的是第一阶段骨架：

- 后端可直接托管 `frontend/dist`
- 可用 PowerShell 脚本完成本地启动、校验、停止
- 可打包出一个非 Docker 的独立分发目录

## 当前入口

开发仓库内可直接使用：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Start-Standalone.ps1 -NoBrowser
powershell -ExecutionPolicy Bypass -File .\scripts\Verify-Standalone.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\Stop-Standalone.ps1
```

也可双击：

- `scripts\Start-Standalone.cmd`
- `scripts\Start-Standalone.bat`
- `scripts\Verify-Standalone.cmd`
- `scripts\Verify-Standalone.bat`
- `scripts\Stop-Standalone.cmd`
- `scripts\Stop-Standalone.bat`

如果本机 `8000` 端口被占用，可临时改用其他端口：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Start-Standalone.ps1 -NoBrowser -Port 8017
```

## 独立包打包

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Package-StandaloneBundle.ps1
```

已知更稳的方式是先单独构建前端，再只做收包：

```powershell
Set-Location .\frontend
npm run build
Set-Location ..
powershell -ExecutionPolicy Bypass -File .\scripts\Package-StandaloneBundle.ps1 -SkipFrontendBuild
```

双击入口：

- `scripts\Build-StandaloneBundle.cmd`

打包输出目录：

- `standalone-bundle\时间戳\`

## 运行时约定

- 默认会在缺少 `backend/.env.standalone` 时，自动从 `backend/.env.standalone.example` 生成安全模板
- 独立模式默认使用 `mock` 作为生成提供方，避免首次启动就因未配置真实引擎而失败
- 独立模式通过环境变量强制读取 `backend/.env.standalone`，不会吃开发态 `backend/.env`
- 独立模式的工作流、模板、上传素材、输出结果和引擎配置默认写入 `backend/data-standalone/`
- 运行日志与 PID 文件写入根目录 `.runtime\`
- 开发态 `backend/data/` 与独立模式运行数据彼此隔离

## 安全边界

这些文件属于本地运行态数据，不应跟随公开仓库或分发包传播给别人：

- `backend/data/engine_config.json`
- `backend/data/uploads/`
- `backend/data/outputs/`
- `backend/data/workflows/`
- `backend/data/templates/`
- `backend/data-standalone/`
- `backend/.env.standalone`
- `backend/.env`

## 当前限制

- 当前“独立启动”仍依赖 Python 运行时
- 如果希望最终用户真正做到“解压即用”，还需要在分发包中附带便携 Python，或再做一层 exe 封装
- 某些机器在脚本内直接执行 `npm run build` 时，可能出现 Vite / Tailwind 原生依赖加载异常；这种情况下建议先手工构建前端，再用 `-SkipFrontendBuild` 打包

## 下一阶段建议

1. 给独立包增加“便携 Python 运行时”复制能力，减少最终用户前置安装要求。
2. 把 `backend/data` 切到更明确的用户数据目录，避免安装到只读目录时写入失败。
3. 在启动脚本中加入首启引导提示，直接引导用户去配置火山 / 万相。
4. 评估是否需要进一步封装为桌面应用壳。
