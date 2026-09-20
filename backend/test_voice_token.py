"""Keep browser tokens routed to the configured tutor, without server credentials."""
import os
import unittest
from unittest.mock import patch

from livekit import api

from main import get_token


class VoiceTokenTests(unittest.TestCase):
    def test_dispatch_name_and_student_grants(self):
        env = {
            "LIVEKIT_URL": "wss://example.invalid",
            "LIVEKIT_API_KEY": "test-key",
            "LIVEKIT_API_SECRET": "test-secret-only-not-a-real-key-000000",
        }
        for configured, expected in ((None, "mimir-tutor"), ("developer-preview", "developer-preview"), (" ", "mimir-tutor")):
            with self.subTest(configured=configured), patch.dict(os.environ, env, clear=True):
                if configured is not None:
                    os.environ["LIVEKIT_AGENT_NAME"] = configured
                first, second = get_token(), get_token()
                self.assertNotEqual(first["room"], second["room"])
                claims = api.TokenVerifier(env["LIVEKIT_API_KEY"], env["LIVEKIT_API_SECRET"]).verify(first["token"])
                self.assertEqual([a.agent_name for a in claims.room_config.agents], [expected])
                self.assertTrue(claims.video.room_join)
                self.assertFalse(claims.video.room_admin)
                self.assertEqual(claims.video.room, first["room"])
                self.assertEqual(set(first), {"token", "url", "room", "identity"})
                self.assertNotIn(env["LIVEKIT_API_SECRET"], str(first))


if __name__ == "__main__":
    unittest.main()
