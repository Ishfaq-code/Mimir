import os

from dotenv import load_dotenv

load_dotenv()

OPENAI_REALTIME_MODEL = os.getenv("OPENAI_REALTIME_MODEL", "gpt-realtime")
TUTOR_VOICE = os.getenv("TUTOR_VOICE", "marin")
