import asyncio
import unittest
from collections import OrderedDict
from types import SimpleNamespace
from unittest.mock import AsyncMock,MagicMock,patch,PropertyMock
from livekit import rtc
from voice_delivery import VoiceDelivery
from tutor import MathTutor

class Stream:
    async def __aenter__(self):return self
    async def __aexit__(self,*args):pass
    async def __aiter__(self):
        for _ in range(2):
            await asyncio.sleep(0)
            yield SimpleNamespace(frame=rtc.AudioFrame(bytes(960),24000,1,480))

class VoiceTests(unittest.IsolatedAsyncioTestCase):
    async def test_prepared_speech_streams_and_replays_without_another_request(self):
        voice=object.__new__(VoiceDelivery);voice.cache=OrderedDict()
        provider=MagicMock();provider.synthesize=MagicMock(side_effect=lambda text:Stream());provider.aclose=AsyncMock()
        voice.voices={False:provider,True:provider}
        voice.prewarm('What is two plus two?')
        first=[bytes(f.data) async for f in voice.stream('What is two plus two?')]
        replay=[bytes(f.data) async for f in voice.stream('What is two plus two?')]
        self.assertEqual(first,replay);self.assertEqual(len(first),2)
        provider.synthesize.assert_called_once_with('What is two plus two?')
        await voice.close()
    async def test_voice_delivers_checked_text_without_a_second_reasoning_reply(self):
        tutor=object.__new__(MathTutor);tutor._slower=False;tutor._voice=MagicMock()
        session=MagicMock();handle=MagicMock();handle.wait_for_playout=AsyncMock();handle.exception.return_value=None
        session.say.return_value=handle
        with patch.object(MathTutor,'session',new_callable=PropertyMock,return_value=session):
            await tutor._speak('What is two plus two?')
        self.assertEqual(session.say.call_args.args,('What is two plus two?',))
        self.assertTrue(session.say.call_args.kwargs['allow_interruptions'])
        session.generate_reply.assert_not_called()

if __name__=='__main__':unittest.main()
