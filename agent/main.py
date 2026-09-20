import json
import logging

from livekit import agents, rtc
from livekit.agents import AgentSession, room_io
from livekit.agents.voice.agent_activity import ActivityClosedError

import config
from tools.types import TutorSessionState
from voice_models import create_realtime_model

logger = logging.getLogger("mimir-tutor")
logging.basicConfig(level=logging.INFO)

GREETING_INSTRUCTIONS = (
    "Say a brief, friendly hello and ask what they would like help with. "
    "Do not solve or give a hint yet."
)

async def greet(session: AgentSession) -> None:
    try:
        await session.generate_reply(instructions=GREETING_INSTRUCTIONS, tool_choice="auto" if config.TUTOR_PROVIDER == 'gemini' else "none", allow_interruptions=True).wait_for_playout()
    except (RuntimeError, ActivityClosedError):
        pass
    # An interruption belongs to the student. Never retry over their speech.


async def entrypoint(ctx: agents.JobContext):
    @ctx.room.on("disconnected")
    def on_room_disconnected(reason):
        logger.info("Agent room disconnected: reason=%s", rtc.DisconnectReason.Name(reason))

    await ctx.connect()
    logger.info("Agent connected to room %s; participants=%s", ctx.room.name, [
        (p.identity, p.kind, p.state) for p in ctx.room.remote_participants.values()
    ])

    try:
        participant = await ctx.wait_for_participant()
    except RuntimeError:
        if ctx.room.isconnected():
            raise
        logger.info("Room closed before a student was ready")
        ctx.shutdown(reason="room closed during startup")
        return
    logger.info("Student joined: %s", participant.identity)

    native_gemini = config.TUTOR_PROVIDER == 'gemini'
    session = AgentSession(
        llm=create_realtime_model(),
        userdata=TutorSessionState(),
        # Keep the microphone live during speech. Application-owned interruption
        # cancels both audio and any pending checked plan on speech-start events.
        turn_handling={"turn_detection": "realtime_llm" if native_gemini else "manual", "interruption": {"enabled": True, "discard_audio_if_uninterruptible": False}},
    )

    if native_gemini:
        from gemini_tutor import GeminiTutor
        tutor = GeminiTutor(participant.identity)
    else:
        from tutor import MathTutor
        tutor = MathTutor(participant.identity)
    logger.info('Tutor voice provider: %s', config.TUTOR_PROVIDER)

    @session.on("agent_state_changed")
    def on_agent_state(event):
        if event.new_state == "speaking":
            tutor.on_speaking()

    @session.on("user_input_transcribed")
    def on_transcript(event):
        if native_gemini:
            tutor.on_voice_transcript(event.transcript, event.is_final)
        elif event.is_final:
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


def prewarm(proc: agents.JobProcess):
    if config.TUTOR_PROVIDER == 'gemini':
        import importlib
        importlib.import_module('livekit.plugins.google')
        importlib.import_module('gemini_tutor')


if __name__ == "__main__":
    agents.cli.run_app(agents.WorkerOptions(
        entrypoint_fnc=entrypoint,
        prewarm_fnc=prewarm,
        agent_name=config.LIVEKIT_AGENT_NAME,
        # Dev mode otherwise imports the entire agent on each new connection.
        num_idle_processes=1,
    ))
