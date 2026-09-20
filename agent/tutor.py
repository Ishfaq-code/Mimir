import asyncio
import logging
import re
from time import perf_counter

from livekit.agents import Agent
from prompts import TUTOR_INSTRUCTIONS
from planner import Planner
from tools.canvas import CanvasRpc
from preparation import BoardPreparation
from fast_turn import is_hint_request, fast_answer, numeric_answer, anticipated_confirmation
from voice_delivery import VoiceDelivery

logger = logging.getLogger('mimir-tutor')


def meaningful_transcript(text: str) -> bool:
    cleaned = re.sub(r'\[(?:noise|music|silence|inaudible|blank_audio)\]|\((?:noise|music|silence|inaudible)\)', '', text, flags=re.I).strip()
    return bool(re.search(r'\w', cleaned))


def conversation_control(text: str) -> str | None:
    """Only exact conversational controls bypass the board/math check."""
    words = ' '.join(re.sub(r'[,.!?;:]', ' ', text.lower()).split())
    if re.fullmatch(r'(?:please )?(?:stop|wait|wait stop|stop talking|hold on|one second|give me a second)(?: please)?', words):
        return 'stop'
    if words in ('repeat', 'repeat that', 'say that again', 'can you repeat that', 'could you repeat that', 'please repeat that'):
        return 'repeat'
    if words in ('hi', 'hello', 'hey', 'are you there', 'can you hear me'):
        return 'hello'
    if words in ('thanks', 'thank you', 'thanks mimir'):
        return 'thanks'
    return None


class MathTutor(Agent):
    """Realtime delivers speech; it cannot bypass the visual/math check."""
    def __init__(self, student_identity: str):
        super().__init__(instructions=TUTOR_INSTRUCTIONS)
        self._canvas = CanvasRpc(student_identity)
        self._planner = Planner()
        self._turn: asyncio.Task | None = None
        self._epoch = 0
        self._history: list[dict] = []
        self._active: dict | None = None
        self._slower = False
        self._speech_requested: float | None = None
        self._request_started: float | None = None
        self._barge_in: asyncio.Task | None = None
        self._last_speech: str | None = None
        self._last_plan = None
        self._last_plan_revision = None
        self._speech_ended_at: float | None = None
        self._input_source = 'text'
        self._voice = VoiceDelivery()
        self._preparation = BoardPreparation(
            self._canvas,self._planner,lambda:(self._history,self._active),
            lambda:self.session.userdata.paused,
            lambda:bool(self._turn and not self._turn.done()),
            self._warm_prepared,
        )

    def _warm_prepared(self, ready):
        slower=bool(ready.state.get('preferences',{}).get('slowerVoice'))
        self._voice.prewarm(ready.plan.speech,slower)
        confirmation=anticipated_confirmation(ready.plan,ready.view)
        if confirmation:self._voice.prewarm(confirmation,slower)

    def start_preparing(self):
        self._preparation.start()

    def pause_preparing(self):
        self._preparation.invalidate()
        self._voice.cancel_pending()

    def cancel_turn(self):
        self._epoch += 1
        self._speech_requested = None
        if self._turn and not self._turn.done(): self._turn.cancel()

    def submit(self, text: str, source: str = 'text'):
        if self.session.userdata.paused or not meaningful_transcript(text): return
        if getattr(self, '_barge_in', None): self._barge_in.cancel()
        self.cancel_turn()
        self._input_source=source
        if source=='voice' and self._speech_ended_at is not None:
            logger.info('Input timing: turn=%d speech_end_to_transcript_seconds=%.2f',self._epoch,perf_counter()-self._speech_ended_at)
        self._turn = asyncio.create_task(self._respond(text[:2000], self._epoch))

    def on_user_state(self, state: str):
        if state=='speaking':self._speech_ended_at=None
        elif state=='listening':self._speech_ended_at=perf_counter()
        if self._barge_in:
            self._barge_in.cancel()
            self._barge_in = None
        if state == 'speaking' and not self.session.userdata.paused:
            self._barge_in = asyncio.create_task(self._interrupt_on_speech())

    async def _interrupt_on_speech(self):
        try:
            # Ignore a brief VAD blip; never wait for a final transcript to stop.
            await asyncio.sleep(0.15)
            if self.session.user_state != 'speaking' or self.session.userdata.paused: return
            self.cancel_turn()
            await self.session.interrupt(force=True)
            logger.info('Speech-start interruption: pending turn cancelled')
            await self._canvas.call('set_tutor_status', {'status':'ready'})
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.warning('Speech-start interruption could not finish')

    async def on_exit(self):
        await self._preparation.close()
        if self._barge_in:
            self._barge_in.cancel()
            await asyncio.gather(self._barge_in, return_exceptions=True)
        self.cancel_turn()
        if self._turn:
            await asyncio.gather(self._turn, return_exceptions=True)
        await self._planner.close()
        await self._voice.close()
        await self._canvas.close()

    async def _speak(self, speech: str):
        # Direct speech synthesis cannot answer the original audio question again.
        self._speech_requested = perf_counter()
        self._last_speech = speech
        handle=self.session.say(speech,audio=self._voice.stream(speech,self._slower),allow_interruptions=True)
        await handle.wait_for_playout()
        if handle.exception():raise handle.exception()

    def on_speaking(self):
        """Timings only: never log the student's board, transcript or image."""
        if self._speech_requested is not None and self._request_started is not None:
            now = perf_counter()
            logger.info('First speech timing: turn=%d post_transcript_seconds=%.2f voice_seconds=%.2f vad_end_to_speech_seconds=%s',
                        self._epoch,now-self._request_started,now-self._speech_requested,
                        round(now-self._speech_ended_at,2) if self._input_source=='voice' and self._speech_ended_at is not None else None)
            self._speech_requested = None

    async def _respond(self, text: str, epoch: int):
        self._request_started = perf_counter()
        try:
            control = conversation_control(text)
            if control:
                await self.session.interrupt(force=True)
                if control == 'stop': return
                speech = {
                    'repeat': getattr(self, '_last_speech', None) or 'Tell me which part you want me to repeat.',
                    'hello': "I'm here. What would you like help with?",
                    'thanks': "You're welcome. Take your time.",
                }[control]
                await self._speak(speech)
                return
            async def interrupt():
                # LiveKit returns a Future; TaskGroup requires a coroutine.
                await self.session.interrupt(force=True)
            preparation=getattr(self,'_preparation',None)
            status={};prepared=None;plan=None;route='live'
            if preparation:
                async with asyncio.TaskGroup() as tasks:
                    tasks.create_task(interrupt())
                    status_task=tasks.create_task(self._canvas.call('get_board_status',{}))
                status=status_task.result()
                revision=status.get('revision')
                if status.get('ready') and revision:
                    if is_hint_request(text):
                        if preparation.revision!=revision:preparation.begin(revision)
                        if not preparation.ready:
                            await self._canvas.call('set_tutor_status',{'status':'checking'})
                        prepared=await preparation.take(revision)
                    elif preparation.ready and preparation.revision==revision:
                        prepared=preparation.ready
                self._slower=bool(status.get('preferences',{}).get('slowerVoice'))
            if prepared:
                state,view,image=prepared.state,prepared.view,prepared.image
                if is_hint_request(text):plan=prepared.plan.model_copy(deep=True);route='prepared'
            else:
                # Capture is memoized in the browser until the source revision changes.
                async with asyncio.TaskGroup() as tasks:
                    tasks.create_task(interrupt())
                    tasks.create_task(self._canvas.call('set_tutor_status', {'status':'checking'}))
                    state_task = tasks.create_task(self._canvas.call('get_canvas_state', {}))
                    capture_task = tasks.create_task(self._canvas.capture())
                state=state_task.result();view,image=capture_task.result()
            captured = perf_counter()
            self._slower = bool(status.get('preferences',state.get('preferences', {})).get('slowerVoice'))
            if plan is None and getattr(self,'_last_plan',None) and self._last_plan_revision==view.get('revision'):
                plan=fast_answer(text,self._last_plan,view)
                if plan:route='local-answer'
            if plan is None and numeric_answer(text) is not None:
                previous=getattr(self,'_last_plan',None)
                logger.info('Local answer unavailable: prior_hint=%s focus_present=%s same_revision=%s',
                            bool(previous and previous.status=='hint'),bool(previous and previous.focus_expression),
                            bool(previous and self._last_plan_revision==view.get('revision')))
            if plan is None:
                # Prioritize a specific question over speculative background work.
                if preparation:preparation.invalidate()
                plan = await self._planner.plan(text, state, view, image, self._history, self._active)
            checked = perf_counter()
            if epoch != self._epoch or self.session.userdata.paused: return
            if self.session.user_state == 'speaking': return
            # Atomic board revision check + mark/scaffold placement. No stale advice.
            result = await self._canvas.call('apply_teaching_plan', {
                'snapshotId':view['snapshotId'], 'problemRegionIds':plan.problem_region_ids,
                'regionIds':plan.highlight_region_ids, 'label':plan.highlight_label,
                'scaffold':plan.scaffold.template if plan.scaffold else None,
            })
            if not result.get('success'):
                await self._speak('Your board changed while I was checking. Finish that line, then ask me again so I use your latest work.')
                return
            speech = plan.speech
            if plan.scaffold and not result.get('scaffoldPlaced'):
                speech = 'That step checks out. Leave a little empty space beside your work, then ask me for the next step.'
            self._active = {'problem':plan.problem, 'bounds':result.get('problemBounds')} if plan.problem_region_ids else None
            self._history.extend([{'role':'student','text':text}, {'role':'tutor','text':speech}])
            self._history = self._history[-8:]
            if plan.status!='incorrect':
                self._last_plan=plan;self._last_plan_revision=view.get('revision')
            logger.info('Checked turn: status=%s checks=%d scaffold=%s', plan.status, len(plan.checks), bool(result.get('scaffoldPlaced')))
            logger.info('Turn timing: turn=%d route=%s board_or_preparation_seconds=%.2f check_seconds=%.2f apply_seconds=%.2f',
                        epoch,route,captured-self._request_started,checked-captured,perf_counter()-checked)
            await asyncio.gather(self._canvas.call('set_tutor_status', {'status':'ready'}), self._speak(speech))
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning('Checked turn could not complete: %s', type(exc).__name__)
            if epoch == self._epoch and not self.session.userdata.paused:
                try:
                    await self._speak("I couldn't get a reliable check of that step. Can you bring the problem into view and tell me which part to check?")
                except Exception:
                    logger.warning('Unable to deliver recovery line')
        finally:
            if epoch == self._epoch and not self.session.userdata.paused:
                try: await self._canvas.call('set_tutor_status', {'status':'ready'})
                except Exception: pass
