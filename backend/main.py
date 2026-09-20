import hashlib
import hmac
import json
import math
import os
import uuid
from typing import Any, Literal

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from livekit import api
from pydantic import BaseModel, Field, model_validator

load_dotenv()

MYSCRIPT_URL = "https://cloud.myscript.com/api/v4.0/iink/recognize"
OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions"

app = FastAPI(title="Mimir API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class VisualizationRequest(BaseModel):
    problem: str = Field(min_length=1, max_length=12000)
    topic: Literal["physics"]


class PhysicsQuantity(BaseModel):
    value: float
    unit: str = Field(min_length=1, max_length=20)


class PhysicsExtraction(BaseModel):
    motion_type: Literal["constant_acceleration_1d", "free_fall_1d"]
    initial_velocity: PhysicsQuantity | None = None
    final_velocity: PhysicsQuantity | None = None
    displacement: PhysicsQuantity | None = None
    duration: PhysicsQuantity | None = None
    acceleration: PhysicsQuantity | None = None

    @model_validator(mode="before")
    @classmethod
    def normalize_model_output(cls, value: Any) -> Any:
        if not isinstance(value, dict):
            return value
        data = dict(value)
        aliases = {
            "initial_speed": "initial_velocity",
            "final_speed": "final_velocity",
            "height": "displacement",
            "gravity": "acceleration",
        }
        for source, target in aliases.items():
            if target not in data and source in data:
                data[target] = data[source]
        motion_type = str(data.get("motion_type", "")).lower().replace("-", "_").replace(" ", "_")
        if motion_type in {"free_fall", "freefall", "free_fall_1d"}:
            data["motion_type"] = "free_fall_1d"
        elif motion_type in {
            "constant_acceleration",
            "constant_acceleration_1d",
            "uniform_acceleration",
            "uniformly_accelerated",
            "uniformly_accelerated_motion",
        }:
            data["motion_type"] = "constant_acceleration_1d"
        default_units = {
            "initial_velocity": "m/s",
            "final_velocity": "m/s",
            "displacement": "m",
            "duration": "s",
            "acceleration": "m/s²",
        }
        for field, unit in default_units.items():
            quantity = data.get(field)
            if isinstance(quantity, (int, float)):
                data[field] = {"value": quantity, "unit": unit}
            elif isinstance(quantity, dict) and "value" in quantity and "unit" not in quantity:
                data[field] = {**quantity, "unit": unit}
        return data

    @model_validator(mode="after")
    def validate_knowns(self) -> "PhysicsExtraction":
        if self.initial_velocity is None:
            raise ValueError("The initial velocity is required")
        if (
            self.final_velocity is None
            and self.acceleration is None
            and not (self.duration is not None and self.displacement is not None)
        ):
            raise ValueError("The final velocity or acceleration is required")
        if self.displacement is None and self.duration is None:
            raise ValueError("The displacement or duration is required")
        return self


class VisualizationPoint(BaseModel):
    x: float
    y: float


class VisualizationObject(BaseModel):
    id: str = Field(min_length=1, max_length=24)
    type: Literal["circle", "rect", "line", "arrow", "path", "text"]
    x: float = 0
    y: float = 0
    x2: float | None = None
    y2: float | None = None
    radius: float | None = None
    width: float | None = None
    height: float | None = None
    points: list[VisualizationPoint] | None = None
    text: str | None = Field(default=None, max_length=16)
    color: str = "#2f9e44"
    label: str | None = Field(default=None, max_length=18)


class VisualizationFrame(BaseModel):
    value: float
    variables: list["VisualizationVariable"] = Field(min_length=1, max_length=30)
    objects: list[VisualizationObject] = Field(max_length=100)


class VisualizationVariable(BaseModel):
    name: str = Field(min_length=1, max_length=24)
    value: float
    unit: str = Field(max_length=20)


class VisualizationTimeline(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    unit: str = Field(min_length=1, max_length=20)
    minimum: float
    maximum: float
    step: float = Field(gt=0)


class VisualizationResponse(BaseModel):
    timeline: VisualizationTimeline
    frames: list[VisualizationFrame] = Field(min_length=1, max_length=120)

    @model_validator(mode="after")
    def validate_variable_snapshots(self) -> "VisualizationResponse":
        expected = {variable.name for variable in self.frames[0].variables}
        if self.timeline.name not in expected:
            raise ValueError("Every frame must include the timeline variable")
        for frame in self.frames:
            names = {variable.name for variable in frame.variables}
            if names != expected:
                raise ValueError("Every frame must include the same variables")
        return self


@app.get("/")
def read_root() -> dict[str, str]:
    return {"message": "Mimir API is running"}


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/visualize", response_model=VisualizationResponse)
async def create_visualization(request: VisualizationRequest) -> VisualizationResponse:
    if not is_openrouter_visualization_configured():
        raise HTTPException(status_code=503, detail="OpenRouter visualization is not configured on the backend")
    try:
        extraction = await extract_physics(request)
        return build_visualization(extraction)
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="The visualization provider is unavailable")
    except (ValueError, TypeError):
        raise HTTPException(status_code=422, detail="This problem could not be converted into a supported physics model")


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
            stroke_id = message.get("strokeId")
            stroke_ids = message.get("strokeIds")
            strokes = message.get("strokes")

            if not isinstance(strokes, list) or not strokes:
                await websocket.send_json({
                    "type": "result",
                    "requestId": request_id,
                    "strokeId": stroke_id,
                    "strokeIds": stroke_ids,
                    "latex": "",
                })
                continue

            try:
                result = await recognize_with_myscript(strokes, stroke_id, stroke_ids)
                await websocket.send_json({
                    "type": "result",
                    "requestId": request_id,
                    "strokeId": stroke_id,
                    "strokeIds": stroke_ids,
                    **result,
                })
            except Exception as exc:
                await websocket.send_json({
                    "type": "error",
                    "requestId": request_id,
                    "strokeId": stroke_id,
                    "strokeIds": stroke_ids,
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


def is_openrouter_visualization_configured() -> bool:
    return bool(
        os.getenv("OPENROUTER_API_KEY")
        and os.getenv("OPENROUTER_VISUALIZATION_ENABLED", "true").lower() == "true"
    )


async def extract_physics(request: VisualizationRequest) -> PhysicsExtraction:
    model = os.getenv("OPENROUTER_VISUALIZATION_MODEL", "inclusionai/ling-3.0-flash-vl:free")
    prompt = f"""
Extract the known values from this Physics word problem so a deterministic backend can solve it.
Topic: Physics
Problem provided by the user:
<problem>
{request.problem}
</problem>

Return only valid JSON with this exact shape:
{{
  "motion_type": "constant_acceleration_1d",
  "initial_velocity": null,
  "final_velocity": null,
  "displacement": null,
  "duration": null,
  "acceleration": null
}}

Rules:
- Extract values explicitly stated or directly implied by the problem. Use zero for "dropped" or "from rest", unless an explicit initial velocity is also provided; the explicit value wins.
- Map a stated height to displacement. Map "acceleration of gravity" or a planet's gravity to acceleration.
- Use `free_fall_1d` for dropped/falling objects and `constant_acceleration_1d` for other one-dimensional uniform acceleration.
- `motion_type` must be exactly `constant_acceleration_1d` or `free_fall_1d`.
- Preserve the units from the problem. Do not calculate acceleration, duration, positions, or frames.
- Use null for quantities that are not given. Do not invent mass, force, or energy.
- This first pipeline supports one-dimensional constant-acceleration motion only.
""".strip()
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
        "temperature": 0.2,
    }
    async with httpx.AsyncClient(timeout=45) as client:
        response = await client.post(
            OPENROUTER_CHAT_URL,
            headers={
                "Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        response.raise_for_status()
        body = response.json()

    try:
        text = find_openrouter_text(body)
        if not text:
            raise ValueError("OpenRouter did not return extraction text")
        result = json.loads(strip_json_fence(text))
    except (TypeError, ValueError, json.JSONDecodeError) as exc:
        raise ValueError("OpenRouter did not return extraction JSON") from exc
    return PhysicsExtraction.model_validate(result)


def unit_value(quantity: PhysicsQuantity, kind: Literal["velocity", "distance", "time", "acceleration"]) -> float:
    unit = quantity.unit.strip().lower().replace(" ", "").replace("²", "^2").replace("**", "^")
    conversions = {
        "velocity": {"m/s": 1, "mps": 1, "km/h": 1000 / 3600, "kmh": 1000 / 3600, "mph": 1609.344 / 3600},
        "distance": {"m": 1, "meter": 1, "meters": 1, "km": 1000, "cm": 0.01, "ft": 0.3048},
        "time": {"s": 1, "sec": 1, "second": 1, "seconds": 1, "min": 60, "h": 3600},
        "acceleration": {"m/s^2": 1, "m/s2": 1, "mps2": 1, "km/h^2": 1000 / (3600 * 3600)},
    }
    factor = conversions[kind].get(unit)
    if factor is None:
        raise ValueError(f"Unsupported {kind} unit: {quantity.unit}")
    result = quantity.value * factor
    if not math.isfinite(result):
        raise ValueError(f"Invalid {kind} value")
    return result


def build_visualization(extraction: PhysicsExtraction) -> VisualizationResponse:
    initial_velocity = unit_value(extraction.initial_velocity, "velocity")
    final_velocity = unit_value(extraction.final_velocity, "velocity") if extraction.final_velocity else None
    displacement = unit_value(extraction.displacement, "distance") if extraction.displacement else None
    duration = unit_value(extraction.duration, "time") if extraction.duration else None
    acceleration = unit_value(extraction.acceleration, "acceleration") if extraction.acceleration else None

    if acceleration is None:
        if duration is not None and displacement is not None:
            acceleration = 2 * (displacement - initial_velocity * duration) / duration**2
        elif final_velocity is not None and displacement is not None and displacement != 0:
            acceleration = (final_velocity**2 - initial_velocity**2) / (2 * displacement)
        else:
            raise ValueError("Not enough values to solve acceleration")
    if final_velocity is None and duration is not None:
        final_velocity = initial_velocity + acceleration * duration
    if final_velocity is None and displacement is not None:
        final_velocity = math.sqrt(max(0, initial_velocity**2 + 2 * acceleration * displacement))
    if duration is None:
        if final_velocity is None or acceleration == 0:
            raise ValueError("Not enough values to solve duration")
        duration = (final_velocity - initial_velocity) / acceleration
    if duration <= 0:
        raise ValueError("The solved duration must be positive")
    if displacement is None:
        displacement = initial_velocity * duration + 0.5 * acceleration * duration**2

    frame_count = 9
    step = duration / (frame_count - 1)
    max_velocity = max(abs(initial_velocity), abs(final_velocity or initial_velocity), 1)
    frames: list[VisualizationFrame] = []
    for index in range(frame_count):
        time = step * index
        position = initial_velocity * time + 0.5 * acceleration * time**2
        velocity = initial_velocity + acceleration * time
        truck_x = 100 + (position / displacement if displacement else 0) * 560
        arrow_start = truck_x + 38
        arrow_length = min(35 + abs(velocity) / max_velocity * 100, max(35, 780 - arrow_start))
        frames.append(VisualizationFrame(
            value=round(time, 3),
            variables=[
                VisualizationVariable(name="t", value=round(time, 3), unit="s"),
                VisualizationVariable(name="x", value=round(position, 3), unit="m"),
                VisualizationVariable(name="v", value=round(velocity, 3), unit="m/s"),
                VisualizationVariable(name="a", value=round(acceleration, 3), unit="m/s²"),
            ],
            objects=[
                VisualizationObject(id="ground", type="line", x=70, y=320, x2=730, y2=320, color="#8a938d"),
                VisualizationObject(id="truck", type="rect", x=truck_x, y=270, width=76, height=42, color="#2f9e44", label="truck"),
                VisualizationObject(id="velocity", type="arrow", x=arrow_start, y=250, x2=arrow_start + arrow_length, y2=250, color="#1971c2", label="v"),
                VisualizationObject(id="acceleration", type="arrow", x=arrow_start, y=220, x2=min(arrow_start + 50, 780), y2=220, color="#e8590c", label="a"),
            ],
        ))
    return VisualizationResponse(
        timeline=VisualizationTimeline(name="t", unit="s", minimum=0, maximum=round(duration, 3), step=round(step, 3)),
        frames=frames,
    )


def strip_json_fence(value: str) -> str:
    text = value.strip()
    if text.startswith("```") and text.endswith("```"):
        lines = text.splitlines()
        text = "\n".join(lines[1:-1]).strip()
    return text


def find_openrouter_text(value: Any) -> str | None:
    if isinstance(value, dict):
        choices = value.get("choices")
        if isinstance(choices, list) and choices:
            message = choices[0].get("message")
            if isinstance(message, dict) and isinstance(message.get("content"), str):
                return message["content"]
    elif isinstance(value, list):
        for child in value:
            result = find_openrouter_text(child)
            if result is not None:
                return result
    return None


async def recognize_with_myscript(
    strokes: list[list[dict[str, Any]]],
    stroke_id: str | None = None,
    stroke_ids: list[str] | None = None,
) -> dict[str, Any]:
    stroke_items = []
    for index, stroke in enumerate(strokes):
        stroke_items.append({
            "id": (stroke_ids[index] if stroke_ids and index < len(stroke_ids) else None) or stroke_id or str(index),
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
