import json
import logging

from livekit import agents, rtc
from livekit.agents import AgentSession, room_io
from openai.types.realtime.realtime_audio_input_turn_detection import ServerVad
from livekit.agents.voice.agent_activity import ActivityClosedError
from livekit.plugins import openai

import config
from tools.types import TutorSessionState
from tutor import MathTutor

logger = logging.getLogger("mimir-tutor")
logging.basicConfig(level=logging.INFO)

GREETING_INSTRUCTIONS = (
    "Say a brief, friendly hello and ask what they would like help with. "
    "Do not solve or give a hint yet."
)

async def greet(session: AgentSession) -> None:
    try:
        await session.generate_reply(instructions=GREETING_INSTRUCTIONS, tool_choice="none", allow_interruptions=True).wait_for_playout()
    except (RuntimeError, ActivityClosedError):
        pass
    # An interruption belongs to the student. Never retry over their speech.


async def entrypoint(ctx: agents.JobContext):
    await ctx.connect()
    logger.info("Agent connected to room %s", ctx.room.name)

    participant = await ctx.wait_for_participant()
    logger.info("Student joined: %s", participant.identity)

    session = AgentSession(
        llm=openai.realtime.RealtimeModel(
            model=config.OPENAI_REALTIME_MODEL,
            voice=config.TUTOR_VOICE,
            input_audio_noise_reduction="far_field",
            turn_detection=ServerVad(type="server_vad", threshold=0.75, prefix_padding_ms=300, silence_duration_ms=350, create_response=False, interrupt_response=False),
        ),
        userdata=TutorSessionState(),
        # Keep the microphone live during speech. Application-owned interruption
        # cancels both audio and any pending checked plan on speech-start events.
        turn_handling={"turn_detection": "manual", "interruption": {"enabled": True, "discard_audio_if_uninterruptible": False}},
    )

    tutor = MathTutor(participant.identity)

    @session.on("agent_state_changed")
    def on_agent_state(event):
        if event.new_state == "speaking":
            tutor.on_speaking()

    @session.on("user_input_transcribed")
    def on_transcript(event):
        if event.is_final:
            tutor.submit(event.transcript, source='voice')

    @session.on("user_state_changed")
    def on_user_state(event):
        tutor.on_user_state(event.new_state)

    async def pause_tutor(data: rtc.RpcInvocationData) -> str:
        if data.caller_identity != participant.identity:
            raise rtc.RpcError(1403, "Student only")
        args = json.loads(data.payload)
        if not isinstance(args.get("paused"), bool):
            raise rtc.RpcError(1400, "paused must be boolean")
        paused = args["paused"]
        session.userdata.paused = paused
        session.input.set_audio_enabled(not paused)
        session.output.set_audio_enabled(not paused)
        if paused:
            tutor.pause_preparing()
            tutor.cancel_turn()
            await session.interrupt(force=True)
        return json.dumps({"paused": paused})

    ctx.room.local_participant.register_rpc_method("set_tutor_paused", pause_tutor)

    async def text_input(current: AgentSession, event: room_io.TextInputEvent):
        if not current.userdata.paused:
            tutor.submit(event.text)

    await session.start(
        room=ctx.room, agent=tutor,
        room_options=room_io.RoomOptions(participant_identity=participant.identity, text_input=room_io.TextInputOptions(text_input_cb=text_input)),
    )
    tutor.start_preparing()

    await greet(session)


if __name__ == "__main__":
    agents.cli.run_app(agents.WorkerOptions(entrypoint_fnc=entrypoint))
