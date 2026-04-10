# SketchShot 绿色包交付说明

更新日期：2026-04-10 13:23:32 +08:00

## 目标

这条链路用于把 SketchShot 打成一个适合非程序员使用的 Windows 绿色包。

绿色包的交付目标是：

- 用户机器上不用预装 Python
- 用户机器上不用预装 npm / Node.js
- 用户机器上不用安装 Docker
- 解压后双击即可启动本地服务并打开网页

需要注意的是，这个包是“离线交付、联网运行”：

- 软件本体可离线分发
- 真正调用火山 / DashScope / 万相生成内容时，仍然必须联网

## 构建机要求

构建绿色包的机器仍然需要准备好开发环境：

- Windows
- Python 3
- npm / Node.js
- 当前项目前后端依赖已经安装完成

## 推荐构建入口

直接双击：

- `scripts\Build-GreenBundle.cmd`

或命令行执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Package-GreenBundle.ps1
```

如果前端已经提前构建完成，可改为：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Package-GreenBundle.ps1 -SkipFrontendBuild
```

如果需要显式指定构建机上的 Python：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Package-GreenBundle.ps1 -PythonExe "C:\Python\Python311\python.exe"
```

## 打包结果

默认输出目录：

- `green-bundle\时间戳\`

默认还会同时输出一个 zip：

- `green-bundle\时间戳.zip`

绿色包中会自动整合：

- 已构建的 `frontend/dist`
- 后端代码与默认独立模式配置
- 本机可运行的 Python 运行时
- 当前 Python 环境里 SketchShot 所需依赖
- 面向最终用户的极简入口脚本
- `_internal/` 内部脚本与调试信息目录

## 最终用户入口

交付给最终用户时，建议只告诉对方这几个文件：

- `Run-SketchShot.cmd`
- `Stop-SketchShot.cmd`
- `README.txt`

其中最主要的入口是：

- 双击 `Run-SketchShot.cmd`

其余真正的 PowerShell 启动逻辑、日志和清单文件都收进：

- `_internal/`

普通用户一般不需要打开这个目录。

## 运行时说明

- 绿色包启动时强制优先使用包内的 `runtime\python\python.exe`
- 首次运行会自动生成 `backend\.env.standalone`
- 默认运行数据写入 `backend\data-standalone\`
- 日志与 PID 文件写入 `_internal\.runtime\`
- 打包脚本会在压缩前自动清理验证产生的 `.runtime`、临时配置和独立模式运行数据，避免把测试痕迹带进交付包

## 当前边界

- 绿色包不包含真实的火山 / DashScope / OSS 凭据
- 最终用户首次使用时，仍然要在界面中填写自己的引擎配置
- 如果用户使用万相视频，还需要配置 OSS，因为万相图生视频要求首尾帧是公网可访问地址
- 如果目标机器网络被代理、防火墙或安全软件拦截，仍然可能出现 TLS / 连接失败

## 建议的交付方式

建议对外发放 zip 包，而不是直接发开发仓库。

推荐流程：

1. 在构建机执行绿色包打包脚本。
2. 用一台干净机器验证 `Run-SketchShot.cmd` 能否直接启动。
3. 确认交付根目录只暴露 `Run-SketchShot.cmd`、`Stop-SketchShot.cmd` 和 `README.txt`。
4. 把 `green-bundle\时间戳.zip` 发给最终用户。

## 下一步建议

1. 把运行数据目录进一步迁移到 `%LOCALAPPDATA%\SketchShot`，减少写权限问题。
2. 在首启时增加配置引导，直接提示用户选择火山或万相。
3. 评估是否需要再封装为桌面应用壳，而不是仅提供本地网页服务。
