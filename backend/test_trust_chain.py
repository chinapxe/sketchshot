"""
测试 Seedream → Seedance 2.0 信任链：先用 Seedream 生成含人脸图片，
获得原始 CDN URL，再用 Seedance 2.0 图生视频，验证人脸审核不拦截。

用法：
    cd backend && python test_trust_chain.py
"""
import asyncio
import json
import os
import sys
import time
from pathlib import Path
from urllib import error, request

# 读 .env 取 API Key
ENV_FILE = Path(__file__).parent / ".env"
if ENV_FILE.exists():
    with open(ENV_FILE, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, val = line.partition("=")
                if key.strip() and val.strip() and key.strip() not in os.environ:
                    os.environ.setdefault(key.strip(), val.strip().strip("\"'"))

API_KEY = os.getenv("ARK_API_KEY", "")
BASE_URL = os.getenv("ARK_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3")
IMAGE_MODEL = os.getenv("VOLCENGINE_IMAGE_MODEL", "doubao-seedream-5-0-260128")
VIDEO_MODEL = os.getenv("VOLCENGINE_VIDEO_V2_MODEL", "doubao-seedance-2-0-260128")

if not API_KEY:
    print("ERROR: ARK_API_KEY not found in backend/.env")
    sys.exit(1)

print(f"BASE_URL: {BASE_URL}")
print(f"IMAGE_MODEL: {IMAGE_MODEL}")
print(f"VIDEO_MODEL: {VIDEO_MODEL}")
print(f"API_KEY: {API_KEY[:8]}***{API_KEY[-4:]}")
print()


def http_json(method: str, path: str, body: dict | None = None) -> dict:
    """同步 HTTP JSON 请求，兼容 Windows asyncio 限制。"""
    headers = {
        "Accept": "application/json",
        "Authorization": f"Bearer {API_KEY}",
    }
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")

    req = request.Request(f"{BASE_URL}{path}", data=data, method=method, headers=headers)
    try:
        with request.urlopen(req, timeout=180) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except error.HTTPError as exc:
        err = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"HTTP {exc.code}: {err}") from exc


async def main():
    # ────────────────────────────────────────
    # Step 1: 用 Seedream 生成一张含真人脸的图片
    # ────────────────────────────────────────
    img_prompt = (
        "一位中国年轻女性，正面特写，自然光，清新妆容，浅色背景，"
        "微卷长发披肩，白色衬衫，面带温柔微笑看向镜头，"
        "专业肖像摄影风格，高清细节，皮肤纹理自然"
    )
    print("=" * 60)
    print("Step 1: Seedream 生成真人脸图片")
    print(f"  prompt: {img_prompt}")
    print()

    img_payload = {
        "model": IMAGE_MODEL,
        "prompt": img_prompt,
        "size": "2048x2048",
        "output_format": "png",
        "response_format": "url",
        "watermark": False,
    }

    img_resp = http_json("POST", "/images/generations", img_payload)
    img_data = img_resp.get("data", [])

    # 提取原始 CDN URL
    cdn_url = ""
    if isinstance(img_data, list):
        for item in img_data:
            if isinstance(item, dict):
                cdn_url = item.get("url", "")
                if cdn_url:
                    break
    if not cdn_url:
        cdn_url = img_data[0]["url"] if img_data else ""

    if not cdn_url:
        print("ERROR: 未能从图片响应中提取 URL")
        print(f"  响应: {json.dumps(img_resp, ensure_ascii=False)[:500]}")
        return

    print(f"  -> 图片 CDN URL: {cdn_url}")
    print(f"  -> URL 域名: {cdn_url.split('/')[2] if '//' in cdn_url else 'N/A'}")
    print()

    # ────────────────────────────────────
    # Step 2: 用 CDN URL 调 Seedance 2.0 生成视频
    # ────────────────────────────────────
    vid_prompt = (
        "固定机位，近景镜头，图片1中的女孩面带微笑看向镜头，"
        "轻轻撩了一下头发，背景虚化，自然光缓慢变化"
    )
    print("=" * 60)
    print("Step 2: Seedance 2.0 图生视频（原始 CDN URL）")
    print(f"  prompt: {vid_prompt}")
    print(f"  reference_image: {cdn_url}")
    print()

    vid_payload = {
        "model": VIDEO_MODEL,
        "content": [
            {"type": "text", "text": vid_prompt},
            {
                "type": "image_url",
                "image_url": {"url": cdn_url},
                "role": "reference_image",
            },
        ],
        "generate_audio": False,
        "ratio": "adaptive",
        "duration": 5,
        "watermark": False,
    }

    vid_resp = http_json("POST", "/contents/generations/tasks", vid_payload)
    task_id = vid_resp.get("id", "")
    if not task_id:
        print("ERROR: 未能获取 task_id")
        print(f"  响应: {json.dumps(vid_resp, ensure_ascii=False)[:500]}")
        return

    print(f"  -> task_id: {task_id}")
    print()

    # ────────────────────────────────────
    # Step 3: 轮询结果
    # ────────────────────────────────────
    print("=" * 60)
    print("Step 3: 轮询视频任务状态")
    print()

    max_wait = 600  # 最多等 10 分钟
    poll_interval = 10
    started = time.time()

    while time.time() - started < max_wait:
        status_resp = http_json("GET", f"/contents/generations/tasks/{task_id}")
        status = status_resp.get("status", "unknown")
        elapsed = int(time.time() - started)

        if status == "succeeded":
            print(f"  [{elapsed}s] ✅ succeeded!")
            video_url = ""
            content = status_resp.get("content", {})
            if isinstance(content, dict):
                video_url = content.get("video_url", "")
            print(f"  video_url: {video_url}")
            print()
            print("=" * 60)
            print("验证通过：Seedream 生图 → Seedance 2.0 制视频，信任链有效。")
            print("人脸审核未被拦截。")
            return

        if status in {"failed", "canceled"}:
            err_info = status_resp.get("error", {})
            err_code = err_info.get("code", "") if isinstance(err_info, dict) else ""
            err_msg = err_info.get("message", "") if isinstance(err_info, dict) else str(err_info)
            print(f"  [{elapsed}s] ❌ {status}")

            if "face" in err_msg.lower() or "人脸" in err_msg or "face" in err_code.lower():
                print("  -> 人脸审核拦截！信任链可能不生效。")
            else:
                print(f"  -> code={err_code} msg={err_msg}")
            print()
            print("=" * 60)
            print("验证失败：任务未能成功完成。")
            return

        print(f"  [{elapsed}s] status={status} ... 等待 {poll_interval}s")
        time.sleep(poll_interval)

    print(f"  [{int(time.time() - started)}s] ⏰ 超时 (>10分钟)")
    print()
    print("=" * 60)
    print("验证不明确：任务在 10 分钟内未完成。")


if __name__ == "__main__":
    asyncio.run(main())
