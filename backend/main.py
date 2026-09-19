import hashlib
import hmac
import json
import os
import uuid
from typing import Any

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from livekit import api

load_dotenv()

MYSCRIPT_URL = "https://cloud.myscript.com/api/v4.0/iink/recognize"

app = FastAPI(title="Mimir API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root() -> dict[str, str]:
    return {"message": "Mimir API is running"}


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/token")
def get_token(room: str = "mimir-tutor") -> dict[str, str]:
    """Mint a short-lived LiveKit access token for a student joining `room`.

    The browser never sees LiveKit API credentials — only this endpoint does.
    """
    url = os.getenv("LIVEKIT_URL")
    api_key = os.getenv("LIVEKIT_API_KEY")
    api_secret = os.getenv("LIVEKIT_API_SECRET")
    if not all([url, api_key, api_secret]):
        raise HTTPException(
            status_code=500,
            detail=(
                "LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET "
                "must be set (see backend/.env.example)"
            ),
        )

    identity = f"student-{uuid.uuid4().hex[:8]}"
    token = (
        api.AccessToken(api_key, api_secret)
        .with_identity(identity)
        .with_name("Student")
        .with_grants(api.VideoGrants(room_join=True, room=room))
        .to_jwt()
    )
    return {"token": token, "url": url, "room": room, "identity": identity}


@app.websocket("/ws/latex")
async def latex_websocket(websocket: WebSocket) -> None:
    """Recognize the current canvas expression through MyScript Cloud."""
    await websocket.accept()

    if not is_myscript_configured():
        await websocket.send_json({
            "type": "error",
            "error": "MyScript is not configured on the backend",
        })
        await websocket.close(code=1011)
        return

    try:
        while True:
            message = await websocket.receive_json()
            request_id = message.get("requestId")
            strokes = message.get("strokes")

            if not isinstance(strokes, list) or not strokes:
                await websocket.send_json({
                    "type": "result",
                    "requestId": request_id,
                    "latex": "",
                })
                continue

            try:
                result = await recognize_with_myscript(strokes)
                await websocket.send_json({
                    "type": "result",
                    "requestId": request_id,
                    **result,
                })
            except Exception as exc:
                await websocket.send_json({
                    "type": "error",
                    "requestId": request_id,
                    "error": str(exc),
                })
    except WebSocketDisconnect:
        return


def is_myscript_configured() -> bool:
    return bool(
        os.getenv("MYSCRIPT_APPLICATION_KEY")
        and os.getenv("MYSCRIPT_HMAC_KEY")
        and os.getenv("MYSCRIPT_ENABLED", "true").lower() == "true"
    )


async def recognize_with_myscript(strokes: list[list[dict[str, Any]]]) -> dict[str, Any]:
    stroke_items = []
    for index, stroke in enumerate(strokes):
        stroke_items.append({
            "id": str(index),
            "pointerType": stroke[0].get("pointerType", "mouse") if stroke else "mouse",
            "x": [point["x"] for point in stroke],
            "y": [point["y"] for point in stroke],
            "t": [point.get("t", point_index) for point_index, point in enumerate(stroke)],
            "p": [point.get("p", 1.0) for point in stroke],
        })

    payload = {
        "configuration": {
            "lang": os.getenv("MYSCRIPT_LOCALE", "en_US"),
            "math": {
                "solver": {"enable": False},
                "mimeTypes": ["application/x-latex"],
            },
            "export": {
                "image-resolution": 300,
                "jiix": {
                    "bounding-box": False,
                    "strokes": False,
                    "ids": False,
                    "full-stroke-ids": False,
                    "text": {"chars": False, "words": True, "lines": False},
                },
            },
        },
        "contentType": "Math",
        "strokes": stroke_items,
        "scaleX": float(os.getenv("MYSCRIPT_SCALE_X", "0.264583")),
        "scaleY": float(os.getenv("MYSCRIPT_SCALE_Y", "0.264583")),
    }
    body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    signing_key = (
        os.environ["MYSCRIPT_APPLICATION_KEY"]
        + os.environ["MYSCRIPT_HMAC_KEY"]
    ).encode("utf-8")
    signature = hmac.new(signing_key, body, hashlib.sha512).hexdigest()
    headers = {
        "applicationKey": os.environ["MYSCRIPT_APPLICATION_KEY"],
        "hmac": signature,
        "myscript-client-name": "Mimir",
        "myscript-client-version": "0.1",
        "Accept": "application/x-latex",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(MYSCRIPT_URL, headers=headers, content=body)
        response.raise_for_status()
        content_type = response.headers.get("content-type", "")
        if content_type.startswith(("text/plain", "application/x-latex")):
            latex = response.text.strip()
        else:
            latex = find_latex(response.json())

    if not latex:
        raise RuntimeError("MyScript returned no LaTeX result")
    return {"latex": latex}


def find_latex(value: Any) -> str | None:
    """Handle the export wrapper used by MyScript response variants."""
    if isinstance(value, dict):
        if str(value.get("type", "")).upper() == "LATEX" and isinstance(value.get("data"), str):
            return value["data"]
        for key in ("latex", "LaTeX", "LATEX"):
            if isinstance(value.get(key), str):
                return value[key]
        for child in value.values():
            result = find_latex(child)
            if result is not None:
                return result
    elif isinstance(value, list):
        for child in value:
            result = find_latex(child)
            if result is not None:
                return result
    return None
