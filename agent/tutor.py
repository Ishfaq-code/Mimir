import logging

from livekit.agents import Agent, RunContext, function_tool
from livekit.agents.llm import ToolError

from prompts import TUTOR_INSTRUCTIONS
from tools.canvas import CanvasRpc
from tools.types import TutorSessionState

logger = logging.getLogger("mimir-tutor")


class MathTutor(Agent):
    """Voice math tutor. Canvas actions execute in the student's browser."""

    def __init__(self) -> None:
        super().__init__(instructions=TUTOR_INSTRUCTIONS)
        self._canvas = CanvasRpc()

    @function_tool()
    async def get_canvas_state(self, context: RunContext) -> dict:
        """Read the student's whiteboard: recognized equations (LaTeX and
        position) plus any annotations you have already drawn.

        Call this before referring to anything on the student's canvas that
        is not already present in your current context.
        """
        state = await self._canvas.get_canvas_state()
        session_state: TutorSessionState = context.userdata
        session_state.current_equations = state.get("equations", [])
        session_state.last_canvas_revision = state.get(
            "revision", session_state.last_canvas_revision
        )
        logger.info("get_canvas_state -> %s", state)
        return state

    @function_tool()
    async def write_latex(self, context: RunContext, latex: str, x: float, y: float) -> dict:
        """Write clean mathematical notation onto the whiteboard. The LaTeX is
        typeset and placed with its top-left corner at canvas position (x, y).

        Prefer this for any mathematical notation; never describe notation
        only verbally when showing it would help. Do not claim you wrote
        something unless this tool returns success.

        Args:
            latex: LaTeX source of the expression, e.g. "x^2 + 4x - 12 = 0".
            x: canvas x-coordinate of the expression's top-left corner.
            y: canvas y-coordinate of the expression's top-left corner.
        """
        result = await self._canvas.write_latex(latex, x, y)
        logger.info("write_latex(%r, %s, %s) -> %s", latex, x, y, result)
        if not result.get("success"):
            raise ToolError(
                f"The canvas rejected write_latex: {result.get('error', 'unknown error')}"
            )
        return result
