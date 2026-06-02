"""
Test Volcengine official virtual human portrait library connectivity.

Uses asset:// URIs to reference portraits from the official library
in Seedance 2.0 video generation. This verifies the trust chain:
  asset://<asset ID> → Seedance 2.0 → video output

The asset:// URI is passed through without local resolution
(the adapter already supports this — this script tests it end-to-end).

Prerequisites:
  1. backend/.env has ARK_API_KEY configured
  2. A valid asset ID from Volcengine Console (体验中心 → 虚拟人像库)

Usage:
  cd backend
  python test_virtual_human_lib.py asset://asset-<your-asset-id>
  python test_virtual_human_lib.py                        # uses default test asset
"""
import asyncio
import json
import os
import sys
import time
from pathlib import Path
from urllib import error, request

# Load .env
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
VIDEO_MODEL = os.getenv("VOLCENGINE_VIDEO_V2_MODEL", "doubao-seedance-2-0-260128")

if not API_KEY:
    print("ERROR: ARK_API_KEY not found in backend/.env")
    sys.exit(1)


def http_json(method: str, path: str, body: dict | None = None) -> dict:
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
    asset_uri = sys.argv[1] if len(sys.argv) > 1 else None

    if not asset_uri:
        print("=" * 60)
        print("No asset:// URI provided.")
        print()
        print("To test the official virtual human portrait library:")
        print("  1. Go to Volcengine Console → 体验中心 → 虚拟人像库")
        print("  2. Select a portrait and copy its Asset ID")
        print("  3. Run: python test_virtual_human_lib.py asset://<asset ID>")
        print()
        print("Or paste an asset URI now and press Enter:")
        print("=" * 60)
        return

    if not asset_uri.startswith("asset://"):
        print(f"WARNING: URI does not start with 'asset://': {asset_uri}")
        print("Proceeding anyway (it will be passed through as-is)...")
        print()

    print(f"BASE_URL: {BASE_URL}")
    print(f"VIDEO_MODEL: {VIDEO_MODEL}")
    print(f"API_KEY: {API_KEY[:8]}***{API_KEY[-4:]}")
    print(f"ASSET_URI: {asset_uri}")
    print()

    # ────────────────────────────────────
    # Step 1: Test with asset URI as sole reference_image
    # ────────────────────────────────────
    vid_prompt = "固定机位，中景镜头，人物自然站立，微笑看向镜头，轻柔的动作，自然光"
    print("=" * 60)
    print("Step 1: Seedance 2.0 i2v with asset:// URI as reference_image")
    print(f"  prompt: {vid_prompt}")
    print(f"  asset_uri: {asset_uri}")
    print()

    vid_payload = {
        "model": VIDEO_MODEL,
        "content": [
            {"type": "text", "text": vid_prompt},
            {
                "type": "image_url",
                "image_url": {"url": asset_uri},
                "role": "reference_image",
            },
        ],
        "generate_audio": False,
        "ratio": "adaptive",
        "resolution": "720p",
        "duration": 5,
        "watermark": False,
    }

    print("  Request payload (content):")
    print(f"    model: {vid_payload['model']}")
    for item in vid_payload["content"]:
        if item["type"] == "text":
            print(f"    [{item['type']}] {item['text'][:60]}...")
        elif item["type"] == "image_url":
            print(f"    [{item['type']}] {item['image_url']['url']} (role={item['role']})")
    print()

    try:
        vid_resp = http_json("POST", "/contents/generations/tasks", vid_payload)
    except RuntimeError as exc:
        print(f"  ❌ Task creation failed: {exc}")
        print()
        print("Possible causes:")
        print("  1. Invalid asset ID — verify the ID in Volcengine Console")
        print("  2. Asset expired or not accessible")
        print("  3. API key lacks permission for Seedance 2.0")
        print("  4. asset:// URI format is not accepted by the API")
        return

    task_id = vid_resp.get("id", "")
    if not task_id:
        print("  ❌ No task_id in response")
        print(f"  Response: {json.dumps(vid_resp, ensure_ascii=False)[:800]}")
        return

    print(f"  ✅ Task created: {task_id}")
    print()

    # ────────────────────────────────────
    # Step 2: Poll for result
    # ────────────────────────────────────
    print("=" * 60)
    print("Step 2: Polling for video task completion")
    print()

    max_wait = 600
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
            print("SUCCESS: Official virtual human portrait library is reachable.")
            print(f"  asset:// URI → Seedance 2.0 → video generation works.")
            return

        if status in {"failed", "canceled"}:
            err_info = status_resp.get("error", {})
            err_code = err_info.get("code", "") if isinstance(err_info, dict) else ""
            err_msg = err_info.get("message", "") if isinstance(err_info, dict) else str(err_info)
            print(f"  [{elapsed}s] ❌ {status}")
            print(f"  error code: {err_code}")
            print(f"  error message: {err_msg}")
            print()
            print("=" * 60)
            print("FAILED: Task did not succeed.")
            if "face" in err_msg.lower() or "人脸" in err_msg:
                print("  → Face detection triggered (unexpected for official library).")
            elif "asset" in err_msg.lower():
                print("  → Asset URI issue — verify the asset ID is correct.")
            elif "auth" in err_msg.lower() or "permission" in err_msg.lower():
                print("  → Auth/permission issue — check API key and account.")
            return

        print(f"  [{elapsed}s] status={status} ... waiting {poll_interval}s")
        time.sleep(poll_interval)

    print(f"  [{int(time.time() - started)}s] ⏰ Timed out (>10 min)")
    print("=" * 60)
    print("INCONCLUSIVE: Task did not complete within 10 minutes.")


if __name__ == "__main__":
    asyncio.run(main())
