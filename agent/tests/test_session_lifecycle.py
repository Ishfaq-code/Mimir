import unittest
from unittest.mock import AsyncMock, MagicMock, patch

import main


class SessionLifecycle(unittest.IsolatedAsyncioTestCase):
    async def test_closed_model_session_shuts_down_the_room_job(self):
        ctx = MagicMock()
        ctx.connect = AsyncMock()
        ctx.wait_for_participant = AsyncMock(return_value=MagicMock(identity='student'))
        ctx.room.remote_participants = {}
        session = MagicMock()
        session.start = AsyncMock()
        handlers = {}

        def on(name):
            def register(callback):
                handlers[name] = callback
                return callback
            return register

        session.on.side_effect = on
        with patch.object(main.config, 'TUTOR_PROVIDER', 'gemini'), \
             patch.object(main, 'create_realtime_model'), \
             patch.object(main, 'AgentSession', return_value=session), \
             patch('gemini_tutor.GeminiTutor'), \
             patch.object(main, 'greet', new_callable=AsyncMock):
            await main.entrypoint(ctx)
        ctx.shutdown.assert_not_called()
        handlers['close'](MagicMock(reason='error'))
        ctx.shutdown.assert_called_once_with(reason='tutor session closed')
