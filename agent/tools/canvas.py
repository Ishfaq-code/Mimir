import asyncio
import json
import uuid

from livekit import rtc
from livekit.agents import get_job_context
from livekit.agents.llm import ToolError


class CanvasRpc:
    """Scoped browser RPC plus bounded, request-correlated whiteboard image streams."""

    def __init__(self, student_identity: str):
        self.room = get_job_context().room
        self.student_identity = student_identity
        self.pending: dict[str, asyncio.Future[bytes]] = {}
        self.tasks: set[asyncio.Task] = set()
        self.room.register_byte_stream_handler("mimir.board", self._image_received)

    def _image_received(self, reader: rtc.ByteStreamReader, identity: str):
        request_id = (reader.info.attributes or {}).get("requestId")
        future = self.pending.get(request_id)
        if identity != self.student_identity or future is None or future.done():
            reader.close()
            return

        async def consume():
            try:
                async with asyncio.timeout(10):
                    image = bytearray()
                    async for chunk in reader:
                        image.extend(chunk)
                        if len(image) > 1_500_000:
                            raise ValueError("Board image exceeds limit")
                    if not image.startswith(b"\xff\xd8"):
                        raise ValueError("Expected a JPEG board image")
                    if not future.done():
                        future.set_result(bytes(image))
            except Exception as error:
                if not future.done():
                    future.set_exception(error)
            finally:
                reader.close()

        task = asyncio.create_task(consume())
        self.tasks.add(task)
        task.add_done_callback(self.tasks.discard)

    async def capture(self) -> tuple[dict, bytes]:
        request_id = uuid.uuid4().hex
        future = asyncio.get_running_loop().create_future()
        self.pending[request_id] = future
        try:
            async with asyncio.timeout(15):
                view = await self.call("capture_board", {"requestId": request_id}, timeout=12)
                image = await future
                return view, image
        except Exception as error:
            raise ToolError("Could not see the board. Ask the student to finish their stroke or bring the work into view, then retry.") from error
        finally:
            self.pending.pop(request_id, None)
            if not future.done():
                future.cancel()
            elif not future.cancelled():
                future.exception()  # consume any stream error if the RPC failed first

    async def call(self, method: str, payload: dict, timeout: float = 5) -> dict:
        if self.student_identity not in self.room.remote_participants:
            raise ToolError("The student is not connected right now.")
        try:
            raw = await self.room.local_participant.perform_rpc(
                destination_identity=self.student_identity, method=method,
                payload=json.dumps(payload), response_timeout=timeout,
            )
            return json.loads(raw) if raw else {}
        except Exception as error:
            raise ToolError(f"Canvas action {method} did not complete: {type(error).__name__}") from error

    async def close(self):
        self.room.unregister_byte_stream_handler("mimir.board")
        for future in self.pending.values():
            future.cancel()
        tasks = list(self.tasks)
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
