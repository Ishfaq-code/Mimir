"""One silent, cancellable preparation per settled board revision, only in a live session."""
import asyncio
import logging
from dataclasses import dataclass
from time import perf_counter

logger=logging.getLogger('mimir-tutor')
HINT_REQUEST='Help me with the next small step on the current board. Ask one specific question. If my current written step is clearly incorrect, guide me to correct it first.'

@dataclass
class PreparedBoard:
    view: dict
    image: bytes
    state: dict
    plan: object

class BoardPreparation:
    def __init__(self, canvas, planner, context, paused, busy, on_ready=None):
        self.canvas=canvas;self.planner=planner;self.context=context;self.paused=paused;self.busy=busy
        self.ready: PreparedBoard | None=None
        self.pending: asyncio.Task | None=None
        self.revision: str | None=None
        self.watcher: asyncio.Task | None=None
        self.on_ready=on_ready

    def start(self):
        self.watcher=asyncio.create_task(self._watch())

    def invalidate(self):
        self.ready=None;self.revision=None
        if self.pending: self.pending.cancel();self.pending=None

    async def _prepare(self, revision):
        try:
            async with asyncio.TaskGroup() as tasks:
                state_task=tasks.create_task(self.canvas.call('get_canvas_state',{}))
                capture_task=tasks.create_task(self.canvas.capture())
            state,captured=state_task.result(),capture_task.result()
            view,image=captured
            if view['revision']!=revision:return None
            history,active=self.context()
            plan=await self.planner.plan(HINT_REQUEST,state,view,image,list(history),active)
            if self.revision!=revision or self.paused():return None
            result=PreparedBoard(view,image,state,plan)
            if self.on_ready:self.on_ready(result)
            self.ready=result
            logger.info('Board preparation ready: regions=%d',len(view.get('regions',[])))
            return result
        except asyncio.CancelledError:raise
        except Exception as exc:
            logger.info('Board preparation skipped: %s',type(exc).__name__)
            return None

    def begin(self, revision):
        self.invalidate();self.revision=revision
        self.pending=asyncio.create_task(self._prepare(revision))

    async def take(self, revision):
        if self.revision!=revision:return None
        if self.ready:return self.ready
        if self.pending:
            try:return await asyncio.shield(self.pending)
            except asyncio.CancelledError:
                if asyncio.current_task().cancelling():raise
                # The board changed, rather than the student's question being cancelled.
                return None
        return None

    async def _watch(self):
        observed=None;last_started=-10.0
        try:
            while True:
                await asyncio.sleep(.45)
                if self.paused():self.invalidate();observed=None;continue
                try:status=await self.canvas.call('get_board_status',{},timeout=2)
                except Exception:continue
                revision=status.get('revision') if status.get('ready') and status.get('hasContent') else None
                if revision!=observed:
                    observed=revision
                    if self.revision!=revision:self.invalidate()
                if not revision or self.busy():continue
                now=perf_counter()
                # ready already includes the browser's pen-up quiet period.
                # Keep the API budget throttle, without a second idle delay.
                if now-last_started>=4 and self.revision!=revision:
                    last_started=now;self.begin(revision)
        except asyncio.CancelledError:raise

    async def close(self):
        tasks=[t for t in (self.watcher,self.pending) if t]
        for task in tasks:task.cancel()
        await asyncio.gather(*tasks,return_exceptions=True)
        self.watcher=None;self.pending=None;self.ready=None
