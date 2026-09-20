import asyncio
import logging

from livekit import agents
from livekit.agents import AgentSession
from livekit.agents.voice.agent_activity import ActivityClosedError
from livekit.plugins import openai

import config
from tools.types import TutorSessionState
from tutor import MathTutor

logger = logging.getLogger("mimir-tutor")
logging.basicConfig(level=logging.INFO)

GREETING_INSTRUCTIONS = (
    "Greet the student briefly and ask what math problem they'd like "
    "to work on. Keep it to one or two short spoken sentences."
)


async def greet(session: AgentSession) -> None:
    """Greet, retrying if the student's mic interrupts the greeting.

    Without this, a greeting cancelled by turn detection (noise, echo,
    an eager student) leaves the agent silent in 'listening' forever.

    A session closing mid-greeting (student disconnects) raises instead
    of retrying into a dead session, so stop quietly rather than crash
    the job task.
    """
    for attempt in range(3):
        try:
            handle = session.generate_reply(instructions=GREETING_INSTRUCTIONS)
            await handle.wait_for_playout()
        except (RuntimeError, ActivityClosedError) as error:
            logger.info("greeting skipped, session is closing: %s", error)
            return
        if not handle.interrupted:
            return
        logger.info("greeting interrupted (attempt %d), retrying", attempt + 1)
        await asyncio.sleep(0.5)
    logger.warning("greeting interrupted 3 times; giving up — student can still start")


async def entrypoint(ctx: agents.JobContext):
    await ctx.connect()
    logger.info("Agent connected to room %s", ctx.room.name)

    participant = await ctx.wait_for_participant()
    logger.info("Student joined: %s", participant.identity)

    session = AgentSession(
        llm=openai.realtime.RealtimeModel(
            model=config.OPENAI_REALTIME_MODEL,
            voice=config.TUTOR_VOICE,
        ),
        userdata=TutorSessionState(),
    )

    await session.start(room=ctx.room, agent=MathTutor())

    await greet(session)


if __name__ == "__main__":
    agents.cli.run_app(agents.WorkerOptions(entrypoint_fnc=entrypoint))
