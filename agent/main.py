import logging

from livekit import agents
from livekit.agents import AgentSession
from livekit.plugins import openai

import config
from tools.types import TutorSessionState
from tutor import MathTutor

logger = logging.getLogger("mimir-tutor")
logging.basicConfig(level=logging.INFO)


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

    await session.generate_reply(
        instructions=(
            "Greet the student briefly and ask what math problem they'd like "
            "to work on. Keep it to one or two short spoken sentences."
        )
    )


if __name__ == "__main__":
    agents.cli.run_app(agents.WorkerOptions(entrypoint_fnc=entrypoint))
