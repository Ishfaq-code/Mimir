import asyncio
import logging
import re
from time import perf_counter

from livekit.agents import Agent
from prompts import TUTOR_INSTRUCTIONS
from planner import Planner, finalize_plan
from writing import written_step, written_speech
from writing_policy import requests_writing, ai_writing, declines_writing
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
        self._failure_stage = 'capture'
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
            await self.session.interrupt(force=True)
            while epoch == self._epoch and not self.session.userdata.paused:
                status = await self._wait_for_board(epoch)
                if status is None: return
                if await self._check_current_board(text, epoch, status): return
                # The student resumed writing during capture/checking. Keep their
                # request, discard the old plan, then capture after the next pause.
                preparation = getattr(self, '_preparation', None)
                if preparation: preparation.invalidate()
                await asyncio.sleep(.25)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning('Checked turn could not complete: %s', type(exc).__name__)
            if epoch == self._epoch and not self.session.userdata.paused:
                try:
                    speech = ("I couldn't refresh the canvas for a reliable check just now. Could you try checking that step again?"
                              if self._failure_stage == 'capture' else
                              "I couldn't verify that step reliably. Can you read the part you want me to check?")
                    await self._speak(speech)
                except Exception:
                    logger.warning('Unable to deliver recovery line')
        finally:
            if epoch == self._epoch and not self.session.userdata.paused:
                try: await self._canvas.call('set_tutor_status', {'status':'ready'})
                except Exception: pass

    async def _wait_for_board(self, epoch: int) -> dict | None:
        waiting = False
        while epoch == self._epoch and not self.session.userdata.paused:
            status = await self._canvas.call('get_board_status', {})
            if status.get('available') is False:
                raise RuntimeError('Canvas is no longer available')
            if status.get('ready'):
                await self._canvas.call('set_tutor_status', {'status': 'checking'})
                return status
            if 'ready' not in status:
                raise RuntimeError('Canvas readiness is unavailable')
            if not waiting:
                await self._canvas.call('set_tutor_status', {'status': 'waiting'})
                waiting = True
            # No images or model calls until the browser reports settled ink.
            await asyncio.sleep(.3)
        return None

    async def _check_current_board(self, text: str, epoch: int, status: dict) -> bool:
        preparation=getattr(self,'_preparation',None)
        prepared=None;plan=None;route='live'
        if preparation:
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
            try:
                async with asyncio.TaskGroup() as tasks:
                    tasks.create_task(self._canvas.call('set_tutor_status', {'status':'checking'}))
                    state_task = tasks.create_task(self._canvas.call('get_canvas_state', {}))
                    capture_task = tasks.create_task(self._canvas.capture())
                state=state_task.result();view,image=capture_task.result()
            except Exception:
                latest = await self._canvas.call('get_board_status', {})
                if not latest.get('ready') or latest.get('revision') != status.get('revision'):
                    return False
                raise
        captured = perf_counter()
        self._slower = bool(status.get('preferences',state.get('preferences', {})).get('slowerVoice'))
        preferences = status.get('preferences', state.get('preferences', {}))
        if ai_writing(preferences) != ai_writing(state.get('preferences')):
            plan = None  # A prepared hint from the other writing mode is not reusable.
        state = {**state, 'preferences': preferences}
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
            self._failure_stage = 'math'
            plan = await self._planner.plan(text, state, view, image, self._history, self._active)
        # Cached hints and local numeric-answer plans obey the same writing
        # policy as live planning. A correct answer is not a request for AI ink.
        mode = ai_writing(status.get('preferences', state.get('preferences', {})))
        ai_writes = mode and not declines_writing(text)
        allowed = ai_writes or requests_writing(text)
        plan = finalize_plan(plan.model_copy(deep=True), view, allow_writing=allowed, ai_writes=ai_writes)
        writing = written_step(plan, state.get('tutorAnnotations', []),
                               required=allowed and plan.status in ('hint', 'correct'), record_answer=ai_writes)
        checked = perf_counter()
        if epoch != self._epoch or self.session.userdata.paused: return True
        if self.session.user_state == 'speaking': return True
        # Atomic board revision check + mark/scaffold placement. No stale advice.
        try:
            result = await self._canvas.call('apply_teaching_plan', {
                'snapshotId':view['snapshotId'], 'problemRegionIds':plan.problem_region_ids,
                'regionIds':plan.highlight_region_ids, 'label':plan.highlight_label,
                'scaffold':writing.template if writing and writing.blank else None,
                'completedStep':writing.template if writing and not writing.blank else None,
                'replaceAnnotationId':writing.replace_id if writing else None,
                'problem':plan.problem, 'aiWrites':mode,
            })
        except Exception as exc:
            logger.warning('Annotation failed after math check: %s', type(exc).__name__)
            result = {'success': False, 'error': 'annotation_unavailable'}
        if not result.get('success'):
            if result.get('error') in ('stale_snapshot_look_again', 'writing_mode_changed'): return False
            current = await self._canvas.call('get_board_status', {})
            if not current.get('ready') or current.get('revision') != view.get('revision'): return False
            logger.warning('Annotation declined after math check: %s', result.get('error'))
        placed = bool(writing and result.get('stepPlaced', result.get('scaffoldPlaced')))
        speech = written_speech(plan, writing, placed, ai_writes=ai_writes)
        self._active = {'problem':plan.problem, 'bounds':result.get('problemBounds')} if plan.problem_region_ids else None
        self._history.extend([{'role':'student','text':text}, {'role':'tutor','text':speech}])
        self._history = self._history[-8:]
        if plan.status!='incorrect':
            self._last_plan=plan;self._last_plan_revision=view.get('revision')
        logger.info('Checked turn: status=%s checks=%d scaffold=%s', plan.status, len(plan.checks), bool(result.get('scaffoldPlaced')))
        logger.info('Turn timing: turn=%d route=%s board_or_preparation_seconds=%.2f check_seconds=%.2f apply_seconds=%.2f',
                    epoch,route,captured-self._request_started,checked-captured,perf_counter()-checked)
        await asyncio.gather(self._canvas.call('set_tutor_status', {'status':'ready'}), self._speak(speech))
        return True
