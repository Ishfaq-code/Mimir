"""End-to-end diagnostic for the voice tutor slice.

Connects to a fresh LiveKit room as a fake student (same path the browser
takes: token -> room -> RPC handlers -> silent mic track), then drives the
tutor with text input (topic "lk.chat") and asserts each stage:

    S1  agent joins the room
    S2  agent greets (transcript on "lk.transcription")
    S3  "What equation did I write?" -> get_canvas_state RPC + spoken answer
    S4  "write the quadratic formula" -> write_latex RPC succeeds

Usage:
    .venv/bin/python diagnose.py            # full check
    .venv/bin/python diagnose.py --listen   # observe only (repro: greeting
                                            # sometimes never arrives)
    .venv/bin/python diagnose.py --timeout 45

Every event is timestamped into a timeline, printed at the end. Exit code is
0 only if all stages pass. Needs LIVEKIT_URL / LIVEKIT_API_KEY /
LIVEKIT_API_SECRET in agent/.env and a running agent worker.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import time
import uuid

from dotenv import load_dotenv
from livekit import api, rtc

load_dotenv()

SEED_CANVAS_STATE = {
    "revision": 1,
    "equations": [
        {
            "id": "equation_1",
            "latex": "x^2 + 4x = 12",
            "boundingBox": {"x": 120, "y": 180, "width": 310, "height": 70},
            "confidence": 1,
        }
    ],
    "tutorAnnotations": [],
}

PROMPT_READ = "What equation did I write?"
PROMPT_WRITE = "Please write the quadratic formula on the canvas."

logger = logging.getLogger("diagnose")


class Timeline:
    def __init__(self) -> None:
        self.t0 = time.monotonic()
        self.events: list[tuple[float, str]] = []

    def log(self, msg: str) -> None:
        elapsed = time.monotonic() - self.t0
        self.events.append((elapsed, msg))
        print(f"  [{elapsed:7.2f}s] {msg}")

    def dump(self) -> str:
        return "\n".join(f"  [{t:7.2f}s] {m}" for t, m in self.events)


class Stage:
    def __init__(self, name: str) -> None:
        self.name = name
        self.status = "PENDING"
        self.detail = ""
        self.elapsed = 0.0


class DiagResult:
    def __init__(self) -> None:
        self.stages: list[Stage] = []

    def report(self) -> bool:
        print("\n════ results ════")
        ok = True
        for s in self.stages:
            if s.status == "SKIP":
                continue
            mark = {"PASS": "✅", "FAIL": "❌"}.get(s.status, "❔")
            print(f"{mark} {s.name} — {s.status} ({s.elapsed:.1f}s) {s.detail}")
            ok = ok and s.status == "PASS"
        return ok


async def wait_for(event: asyncio.Event, timeout: float, what: str) -> float:
    """Wait for `event`, returning elapsed seconds. Raises TimeoutError."""
    start = time.monotonic()
    await asyncio.wait_for(event.wait(), timeout)
    return time.monotonic() - start


async def run_diagnosis(listen_only: bool, duration: float) -> DiagResult:
    result = DiagResult()
    tl = Timeline()

    url = os.environ["LIVEKIT_URL"]
    api_key = os.environ["LIVEKIT_API_KEY"]
    api_secret = os.environ["LIVEKIT_API_SECRET"]

    room_name = f"mimir-tutor-diag-{uuid.uuid4().hex[:6]}"
    identity = f"diag-student-{uuid.uuid4().hex[:6]}"
    token = (
        api.AccessToken(api_key, api_secret)
        .with_identity(identity)
        .with_name("Diagnostic Student")
        .with_grants(api.VideoGrants(room_join=True, room=room_name))
        .to_jwt()
    )

    # ── stage events ────────────────────────────────────────────────
    agent_joined = asyncio.Event()
    agent_states: list[tuple[float, str]] = []
    greeting_received = asyncio.Event()
    read_rpc_called = asyncio.Event()
    write_rpc_called = asyncio.Event()
    transcripts: list[str] = []

    room = rtc.Room()
    tl.log(f"connecting as {identity} to room {room_name}")

    # ── RPC handlers (same contract as the browser) ─────────────────
    def get_canvas_state_handler(data):
        tl.log(f"RPC <- get_canvas_state (from {data.caller_identity})")
        if PROMPT_READ_SENT[0]:
            read_rpc_called.set()
        return json.dumps(SEED_CANVAS_STATE)

    def write_latex_handler(data):
        tl.log(f"RPC <- write_latex payload={data.payload}")
        write_rpc_called.set()
        try:
            args = json.loads(data.payload)
            assert isinstance(args.get("latex"), str) and args["latex"].strip()
            assert isinstance(args.get("x"), (int, float))
            assert isinstance(args.get("y"), (int, float))
        except Exception as e:  # noqa: BLE001 - report contract violation
            return json.dumps({"success": False, "error": f"bad_args: {e}"})
        return json.dumps({"success": True, "elementId": "diag_latex_1"})

    PROMPT_READ_SENT = [False]  # mutable cell; RPC may arrive any time

    # ── transcripts ─────────────────────────────────────────────────
    def on_transcript(reader: rtc.TextStreamReader, participant_identity: str):
        async def consume():
            text = await reader.read_all()
            text = text.strip()
            if not text:
                return
            transcripts.append(text)
            tl.log(f'transcript ({participant_identity}): "{text[:120]}"')
            greeting_received.set()

        asyncio.create_task(consume())

    room.register_text_stream_handler("lk.transcription", on_transcript)

    # ── room events ─────────────────────────────────────────────────
    @room.on("participant_connected")
    def _on_participant_connected(p: rtc.RemoteParticipant):
        tl.log(f"participant connected: {p.identity} kind={p.kind} attrs={dict(p.attributes)}")
        if p.identity != identity:
            agent_joined.set()

    @room.on("participant_attributes_changed")
    def _on_attrs_changed(changed: dict, p: rtc.Participant):
        state = changed.get("lk.agent.state")
        if state:
            agent_states.append((time.monotonic() - tl.t0, state))
            tl.log(f"agent state -> {state}")

    @room.on("track_subscribed")
    def _on_track_subscribed(track, publication, participant):
        tl.log(f"track subscribed: {track.kind} from {participant.identity}")

    @room.on("participant_disconnected")
    def _on_participant_disconnected(p: rtc.RemoteParticipant):
        tl.log(f"participant disconnected: {p.identity}")

    await room.connect(url, token)
    tl.log("room connected")

    # RPC registration requires the local participant (post-connect)
    room.local_participant.register_rpc_method("get_canvas_state", get_canvas_state_handler)
    room.local_participant.register_rpc_method("write_latex", write_latex_handler)

    # silent mic track so the agent's RoomIO attaches like the browser
    source = rtc.AudioSource(sample_rate=48000, num_channels=1)
    track = rtc.LocalAudioTrack.create_audio_track("mic", source)
    await room.local_participant.publish_track(
        track, rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_MICROPHONE)
    )
    tl.log("published silent mic track")

    silence_task = asyncio.create_task(_feed_silence(source))

    try:
        # ── S1: agent joins ─────────────────────────────────────────
        s1 = Stage("S1 agent joins room")
        result.stages.append(s1)
        try:
            s1.elapsed = await wait_for(agent_joined, 20, "agent join")
            s1.status = "PASS"
        except TimeoutError:
            s1.status = "FAIL"
            s1.detail = "no agent joined within 20s — worker down or dispatch broken"
            return result

        # ── S2: greeting ────────────────────────────────────────────
        s2 = Stage("S2 greeting spoken")
        result.stages.append(s2)
        try:
            s2.elapsed = await wait_for(greeting_received, 25, "greeting")
            s2.status = "PASS"
        except TimeoutError:
            s2.status = "FAIL"
            states = ", ".join(f"{s}@{t:.1f}s" for t, s in agent_states) or "none seen"
            s2.detail = f"agent joined but no transcript within 25s; states: {states}"
            # continue: the flaky case — still probe text-driven turns

        if listen_only:
            tl.log(f"listen mode: observing for {duration}s")
            await asyncio.sleep(duration)
            return result

        # ── S3: canvas read ─────────────────────────────────────────
        s3 = Stage("S3 get_canvas_state + answer")
        result.stages.append(s3)
        PROMPT_READ_SENT[0] = True
        tl.log(f'sending lk.chat: "{PROMPT_READ}"')
        await room.local_participant.send_text(PROMPT_READ, topic="lk.chat")
        try:
            s3.elapsed = await wait_for(read_rpc_called, 15, "get_canvas_state RPC")
            base = len(transcripts)
            try:
                await asyncio.wait_for(_transcript_appears(transcripts, base, ("12", "x^2", "x²")), 30)
                s3.status = "PASS"
            except TimeoutError:
                s3.status = "FAIL"
                s3.detail = "RPC fired but no spoken answer within 30s"
        except TimeoutError:
            s3.status = "FAIL"
            s3.detail = "no get_canvas_state RPC within 15s of asking"

        # ── S4: canvas write ────────────────────────────────────────
        s4 = Stage("S4 write_latex RPC")
        result.stages.append(s4)
        tl.log(f'sending lk.chat: "{PROMPT_WRITE}"')
        await room.local_participant.send_text(PROMPT_WRITE, topic="lk.chat")
        try:
            s4.elapsed = await wait_for(write_rpc_called, 25, "write_latex RPC")
            s4.status = "PASS"
        except TimeoutError:
            s4.status = "FAIL"
            s4.detail = "no write_latex RPC within 25s of asking"

        return result
    finally:
        silence_task.cancel()
        tl.log("disconnecting")
        await room.disconnect()
        print("\n════ timeline ════")
        print(tl.dump())


async def _feed_silence(source: rtc.AudioSource) -> None:
    frame = rtc.AudioFrame.create(48000, 1, 480)  # zero-filled 10ms frame
    while True:
        await source.capture_frame(frame)
        await asyncio.sleep(0.01)


async def _transcript_appears(transcripts: list[str], since: int, needles: tuple[str, ...]):
    while True:
        for t in transcripts[since:]:
            if any(n in t for n in needles):
                return
        await asyncio.sleep(0.1)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--listen", action="store_true", help="observe only; do not send text input")
    parser.add_argument("--timeout", type=float, default=30.0, help="seconds to observe in --listen mode")
    parser.add_argument("--verbose", action="store_true", help="debug logging from livekit")
    args = parser.parse_args()

    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.WARNING)

    missing = [k for k in ("LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET") if not os.getenv(k)]
    if missing:
        raise SystemExit(f"missing env vars: {', '.join(missing)} (see agent/.env.example)")

    result = asyncio.run(run_diagnosis(args.listen, args.timeout))
    raise SystemExit(0 if result.report() else 1)


if __name__ == "__main__":
    main()
