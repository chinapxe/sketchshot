# TTS (文本转语音) API 调用指南

## 概述

TTS 服务使用火山引擎（Volcengine）的语音合成 API，内部集成在 SketchShot 后端中，供数字人（DigitalHuman）流程使用。

## 直接调用方式

### POST /api/generate/tts/test

测试 TTS 服务是否可用。

```
curl -X POST http://localhost:8000/api/generate/tts/test
```

返回示例：
```json
{"success": true, "path": "data/outputs/tts-xxxx.mp3"}
```

## 完整请求参数

TTS submit 请求体示例：

```json
{
  "user": {"uid": "chongai-studio"},
  "unique_id": "<uuid>",
  "namespace": "BidirectionalTTS",
  "req_params": {
    "text": "需要合成的文本",
    "speaker": "zh_female_xiaohe_uranus_bigtts",
    "audio_params": {
      "format": "mp3",
      "sample_rate": 24000,
      "speech_rate": 0,
      "loudness_rate": 0,
      "enable_timestamp": true
    }
  }
}
```

### Header 要求

| Header | 说明 |
|---|---|
| `Content-Type` | `application/json`（必须显式设置） |
| `X-Api-App-Id` | 火山引擎应用 ID |
| `X-Api-Access-Key` | 火山引擎访问密钥 |
| `X-Api-Resource-Id` | 资源 ID |
| `X-Api-Request-Id` | UUID，submit 和 query **都必须带** |

### 参数说明

| 参数 | 类型 | 说明 |
|---|---|---|
| `text` | string | 要合成的文本，支持中文 |
| `speaker` | string | 音色 ID（见下方支持列表） |
| `format` | string | 音频格式：`mp3` |
| `sample_rate` | int | 采样率：`24000` |
| `speech_rate` | int | 语速偏移值，范围 -50~100，0 为正常语速。公式：`round((speed - 1.0) * 100)` |
| `loudness_rate` | int | 音量偏移值，同 speech_rate 格式 |
| `enable_timestamp` | bool | 是否返回时间戳信息 |

### 轮询（Query）

提交后需要通过查询接口轮询任务状态：

```
POST https://openspeech.bytedance.com/api/v3/tts/query
```

请求体：
```json
{"task_id": "<provider_task_id>"}
```

Header 与 submit 相同（也需要 `X-Api-Request-Id`）。

响应中的 `data.task_status`：
- `1` = 处理中
- `2` = 成功，`data.audio_url` 为下载地址
- `3` = 失败

## 支持的音色（seed-tts-2.0）

当前资源 ID `seed-tts-2.0` 仅支持以下 6 个音色。使用列表中不存在的音色会返回 `55000000 resource ID is mismatched`。

| voice_id | 名称 | 性别 |
|---|---|---|
| `zh_female_xiaohe_uranus_bigtts` | 小何 2.0 | 女声 |
| `zh_female_vv_uranus_bigtts` | Vivi 2.0 | 女声 |
| `zh_male_m191_uranus_bigtts` | 云舟 2.0 | 男声 |
| `zh_male_taocheng_uranus_bigtts` | 小天 2.0 | 男声 |
| `zh_female_peiqi_uranus_bigtts` | 佩奇猪 2.0 | 角色音 |
| `zh_male_ruyayichen_uranus_bigtts` | 儒雅逸辰 2.0 | 男声 |

**注意：** 即使 voice_id 格式相同（`*_uranus_bigtts`），不同的资源 ID（如 `BigTTS2000000671298368194`）支持不同的音色列表，需要在火山引擎控制台确认。

## 语言支持

当前音色（中文发音人）仅支持**中文文本**合成。阿拉伯语等非中文文本虽然 submit 能通过，但实际合成时会报 `55000000 服务端错误`。如需多语言支持，需要使用对应语言的发音人资源。

## 常见错误码

| code | message | 原因 |
|---|---|---|
| 20000000 | ok | 成功 |
| 55000000 | resource ID is mismatched with speaker related resource | 音色 ID 不匹配当前 resource ID，更换音色 |
| 55000000 | 服务端错误 | 服务器处理失败，常见于语言不支持或超时 |
| 55000000 | missing X-Api-Request-Id | query 请求缺少该 header |

## 超时说明

- 默认 TTS 轮询总超时：**600 秒**（可在 `backend/.env` 中通过 `VOLCENGINE_TTS_TIMEOUT` 调整）
- 单次 HTTP 请求超时与轮询总超时使用同一值
- 长文本合成可能需要较长时间，建议根据实际文本长度调整

## Python 调用示例

```python
import json
import uuid
from urllib import request, error

def submit_tts(text, speaker="zh_female_xiaohe_uranus_bigtts"):
    app_id = "your_app_id"
    access_key = "your_access_key"
    resource_id = "seed-tts-2.0"
    task_id = str(uuid.uuid4())
    
    body = json.dumps({
        "user": {"uid": "chongai-studio"},
        "unique_id": task_id,
        "namespace": "BidirectionalTTS",
        "req_params": {
            "text": text,
            "speaker": speaker,
            "audio_params": {
                "format": "mp3",
                "sample_rate": 24000,
                "speech_rate": 0,
                "loudness_rate": 0,
                "enable_timestamp": True,
            },
        },
    }, ensure_ascii=False).encode("utf-8")
    
    req = request.Request(
        "https://openspeech.bytedance.com/api/v3/tts/submit",
        data=body, method="POST",
        headers={
            "Content-Type": "application/json",
            "X-Api-App-Id": app_id,
            "X-Api-Access-Key": access_key,
            "X-Api-Resource-Id": resource_id,
            "X-Api-Request-Id": task_id,
        },
    )
    
    with request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))
```

## 排查步骤

如果 TTS 调用失败：

1. 确认 `.env` 中 TTS 配置正确（`VOLCENGINE_TTS_ENABLED=True`，APP_ID/ACCESS_KEY/RESOURCE_ID 有效）
2. 检查音色 ID 是否在支持列表中（见上方表格）
3. 检查后端日志中的 `[TtsService]` 输出
4. 直接调用 `/api/generate/tts/test` 测试 TTS 基础连通性
5. 确认后端已重启（`.pyc` 缓存可能过期）
