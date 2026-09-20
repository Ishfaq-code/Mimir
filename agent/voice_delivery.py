"""Stream the checked words verbatim; keep a small in-memory cache for prepared hints."""
import asyncio
from collections import OrderedDict
from dataclasses import dataclass, field
from livekit import rtc
from livekit.plugins import openai
import config

@dataclass
class Speech:
    frames: list = field(default_factory=list)
    changed: asyncio.Condition = field(default_factory=asyncio.Condition)
    complete: bool = False
    error: BaseException | None = None
    task: asyncio.Task | None = None

class VoiceDelivery:
    def __init__(self):
        self.voices={slow:openai.TTS(
            model=config.TUTOR_TTS_MODEL,voice=config.TUTOR_VOICE,response_format='pcm',
            instructions='Speak warmly and conversationally, like a patient tutor beside a student. Read math naturally. '+('Use a slower pace with short pauses.' if slow else 'Use a natural, brisk pace without long pauses.'),
        ) for slow in (False,True)}
        self.cache: OrderedDict[tuple,Speech]=OrderedDict()

    def prewarm(self,text,slower=False):
        key=(text,slower)
        if key in self.cache:
            entry=self.cache[key]
            if entry.error is None:
                self.cache.move_to_end(key);return entry
            self.cache.pop(key)
        entry=Speech();self.cache[key]=entry
        entry.task=asyncio.create_task(self._produce(text,slower,entry))
        while len(self.cache)>4:
            _,old=self.cache.popitem(last=False)
            if old.task:old.task.cancel()
        return entry

    async def _produce(self,text,slower,entry):
        try:
            async with self.voices[slower].synthesize(text) as stream:
                async for event in stream:
                    f=event.frame
                    async with entry.changed:
                        entry.frames.append((bytes(f.data),f.sample_rate,f.num_channels,f.samples_per_channel))
                        entry.changed.notify_all()
        except (Exception,asyncio.CancelledError) as exc:
            entry.error=exc
        finally:
            async with entry.changed:
                entry.complete=True;entry.changed.notify_all()

    async def stream(self,text,slower=False):
        entry=self.prewarm(text,slower);index=0
        while True:
            async with entry.changed:
                await entry.changed.wait_for(lambda:index<len(entry.frames) or entry.complete)
                if index<len(entry.frames):
                    frame=entry.frames[index];index+=1
                elif entry.error:raise entry.error
                else:return
            yield rtc.AudioFrame(*frame)

    async def close(self):
        tasks=[entry.task for entry in self.cache.values() if entry.task]
        for task in tasks:task.cancel()
        await asyncio.gather(*tasks,return_exceptions=True)
        self.cache.clear()
        await asyncio.gather(*(voice.aclose() for voice in self.voices.values()))

    def cancel_pending(self):
        for entry in self.cache.values():
            if entry.task and not entry.task.done():entry.task.cancel()
