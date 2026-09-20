import os

from dotenv import load_dotenv

load_dotenv()

LIVEKIT_AGENT_NAME = os.getenv("LIVEKIT_AGENT_NAME", "mimir-tutor").strip() or "mimir-tutor"
TUTOR_PROVIDER = os.getenv("TUTOR_PROVIDER", "gemini").strip().lower()
GEMINI_LIVE_MODEL = os.getenv("GEMINI_LIVE_MODEL", "gemini-3.8-live")
GEMINI_VOICE = os.getenv("GEMINI_VOICE", "Puck")
OPENAI_REALTIME_MODEL = os.getenv("OPENAI_REALTIME_MODEL", "gpt-realtime")
TUTOR_VOICE = os.getenv("TUTOR_VOICE", "marin")
TUTOR_TTS_MODEL = os.getenv("TUTOR_TTS_MODEL", "gpt-4o-mini-tts")

TUTOR_REASONING_MODEL = os.getenv("TUTOR_REASONING_MODEL", "gpt-5.4-mini")
TUTOR_REASONING_EFFORT = os.getenv("TUTOR_REASONING_EFFORT", "low")
