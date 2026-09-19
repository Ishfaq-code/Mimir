import json

from livekit.agents import get_job_context
from livekit.agents.llm import ToolError


class CanvasRpc:
    """Forwards canvas operations to the student's browser via LiveKit RPC.

    The browser owns the canvas, so every tool call becomes a frontend RPC
    (spec.md section 8). RPC failures raise ToolError so the model is told
    the visual action did not happen and must not claim it did.
    """

    async def get_canvas_state(self) -> dict:
        raw = await self._rpc("get_canvas_state", {})
        return json.loads(raw) if raw else {}

    async def write_latex(self, latex: str, x: float, y: float) -> dict:
        raw = await self._rpc("write_latex", {"latex": latex, "x": x, "y": y})
        return json.loads(raw) if raw else {"success": False, "error": "empty_response"}

    async def _rpc(self, method: str, payload: dict) -> str:
        room = get_job_context().room
        identities = list(room.remote_participants.keys())
        if not identities:
            # No student in the room: nothing can execute the action.
            raise ToolError("The student is not connected right now.")
        try:
            return await room.local_participant.perform_rpc(
                destination_identity=identities[0],
                method=method,
                payload=json.dumps(payload),
                response_timeout=5.0,
            )
        except ToolError:
            raise
        except Exception as e:
            raise ToolError(f"Canvas RPC '{method}' failed: {type(e).__name__}") from e
