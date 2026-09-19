import os
import uuid

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from livekit import api

load_dotenv()

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
