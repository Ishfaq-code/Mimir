import os

from dotenv import load_dotenv

load_dotenv()

OPENAI_REALTIME_MODEL = os.getenv("OPENAI_REALTIME_MODEL", "gpt-realtime")
TUTOR_VOICE = os.getenv("TUTOR_VOICE", "marin")
TUTOR_TTS_MODEL = os.getenv("TUTOR_TTS_MODEL", "gpt-4o-mini-tts")

TUTOR_REASONING_MODEL = os.getenv("TUTOR_REASONING_MODEL", "gpt-5.4-mini")
TUTOR_REASONING_EFFORT = os.getenv("TUTOR_REASONING_EFFORT", "low")
