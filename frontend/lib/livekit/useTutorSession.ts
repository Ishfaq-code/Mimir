"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ConnectionState, ParticipantEvent, Room, RoomEvent, Track, type RemoteParticipant } from "livekit-client";
import { registerCanvasRpcs } from "./rpc";
import { tutorCanvas } from "../tutor/tutorCanvas";
import { clearHighlight, setTutorStatus } from "../tutor/boardView";
import { setPaused as publishPaused } from "../tutor/support";

export type VoiceStatus = "disconnected" | "connecting" | "listening" | "thinking" | "speaking" | "error";
export interface VoiceLine { id: string; speaker: "You" | "Mimir"; text: string }

function muteAudio(elements: HTMLMediaElement[], muted: boolean) {
  for (const element of elements) element.muted = muted;
}

export function useTutorSession() {
  const roomRef = useRef<Room | null>(null);
  const attemptRef = useRef(0);
  const audioRef = useRef<HTMLMediaElement[]>([]);
  const pausedRef = useRef(false);
  const joinTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [status, setStatus] = useState<VoiceStatus>("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [everConnected, setEverConnected] = useState(false);
  const [lines, setLines] = useState<VoiceLine[]>([]);
  const [paused, setPaused] = useState(false);
  const [mic, setMic] = useState(false);
  const [busy, setBusy] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const connected = status !== "disconnected" && status !== "error";
  const ready = connected && status !== "connecting";

  const disconnect = useCallback(async () => {
    attemptRef.current++;
    clearTimeout(joinTimer.current);
    const room = roomRef.current;
    roomRef.current = null;
    for (const el of audioRef.current) { el.pause(); el.remove(); }
    audioRef.current = [];
    pausedRef.current = false;
    publishPaused(false);
    setPaused(false); setMic(false); setBusy(false); setAudioBlocked(false);
    setStatus("disconnected");
    clearHighlight();
    setTutorStatus("ready");
    if (room) await room.disconnect();
  }, []);
  useEffect(() => () => { void disconnect(); }, [disconnect]);

  function upsert(line: VoiceLine) {
    setLines(previous => {
      const index = previous.findIndex(item => item.id === line.id);
      if (index >= 0) return previous.map(item => item.id === line.id ? line : item);
      return [...previous, line].slice(-40);
    });
  }

  async function connect(withMic = true) {
    if (roomRef.current) return;
    const attempt = ++attemptRef.current;
    setStatus("connecting"); setError(null); setLines([]);
    try {
      const tokenUrl = process.env.NEXT_PUBLIC_TOKEN_URL ?? `${window.location.protocol}//${window.location.hostname}:8000`;
      const res = await fetch(`${tokenUrl}/token`);
      if (!res.ok) throw new Error("Voice unavailable");
      const { token, url } = await res.json() as { token: string; url: string };
      if (attempt !== attemptRef.current) return;
      const room = new Room();
      roomRef.current = room;
      const active = () => roomRef.current === room && attemptRef.current === attempt;
      const watchAgent = (p: RemoteParticipant) => {
        if (!p.isAgent) return;
        const apply = () => {
          if (!active()) return;
          const next = p.attributes["lk.agent.state"];
          if (next === "listening" || next === "thinking" || next === "speaking") { clearTimeout(joinTimer.current); setStatus(next); }
        };
        p.on(ParticipantEvent.AttributesChanged, apply); apply();
      };
      room.registerTextStreamHandler("lk.transcription", async (reader, participant) => {
        const speaker = participant.identity === room.localParticipant.identity ? "You" : "Mimir";
        if (speaker === "Mimir" && !room.remoteParticipants.get(participant.identity)?.isAgent) return;
        const id = reader.info.attributes?.["lk.segment_id"] ?? reader.info.id;
        let text = "";
        try {
          for await (const chunk of reader) {
            if (!active()) return;
            text = (text + chunk).slice(0, 6000);
            if (text.trim()) upsert({ id, speaker, text });
          }
        } catch { /* A turn can end early when the student interrupts. */ }
      });
      room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
        if (!active() || !participant.isAgent || track.kind !== Track.Kind.Audio) return;
        const el = track.attach();
        el.muted = pausedRef.current;
        audioRef.current.push(el); document.body.appendChild(el);
      });
      room.on(RoomEvent.TrackUnsubscribed, track => {
        for (const el of track.detach()) { audioRef.current = audioRef.current.filter(item => item !== el); el.remove(); }
      });
      room.on(RoomEvent.AudioPlaybackStatusChanged, () => { if (active()) setAudioBlocked(!room.canPlaybackAudio); });
      room.on(RoomEvent.ConnectionStateChanged, state => {
        if (!active()) return;
        if (state === ConnectionState.Connected) setEverConnected(true);
        if (state === ConnectionState.Disconnected) { void disconnect(); }
      });
      room.on(RoomEvent.ParticipantConnected, watchAgent);
      await room.connect(url, token);
      if (!active()) { await room.disconnect(); return; }
      joinTimer.current = setTimeout(() => {
        if (!active()) return;
        void disconnect().then(() => { setError("Tutor didn’t join. Check that the agent is running, then try again."); setStatus("error"); });
      }, 30000);
      registerCanvasRpcs(room, tutorCanvas);
      for (const p of room.remoteParticipants.values()) watchAgent(p);
      await room.startAudio().catch(() => { if (active()) setAudioBlocked(true); });
      if (withMic) {
        try {
          await room.localParticipant.setMicrophoneEnabled(true, { echoCancellation: true, noiseSuppression: true, autoGainControl: true });
          if (active()) setMic(true);
        } catch {
          if (active()) setError("Microphone unavailable. You can type below or enable it in your browser.");
        }
      }
    } catch {
      if (attempt !== attemptRef.current) return;
      await disconnect(); setError("Couldn’t connect. Try again."); setStatus("error");
    }
  }

  async function send(text: string, displayText?: string) {
    const room = roomRef.current;
    if (!room || !ready || pausedRef.current || !text.trim()) return false;
    setError(null);
    try {
      await room.localParticipant.sendText(text.trim().slice(0, 2000), { topic: "lk.chat" });
      if (roomRef.current === room) upsert({ id: crypto.randomUUID(), speaker: "You", text: displayText ?? text.trim() });
      return true;
    } catch { setError("Message didn’t send. Try again."); return false; }
  }
  async function toggleMic() {
    const room = roomRef.current;
    if (!room || busy || paused) return;
    setBusy(true);
    try { await room.localParticipant.setMicrophoneEnabled(!mic); setMic(!mic); setError(null); }
    catch { setError("Microphone unavailable. You can type below."); }
    finally { setBusy(false); }
  }
  async function togglePause() {
    const room = roomRef.current;
    if (!room || busy) return;
    const agent = [...room.remoteParticipants.values()].find(p => p.isAgent);
    if (!agent) { setError("Tutor is still joining. Try again in a moment."); return; }
    const next = !pausedRef.current;
    setBusy(true);
    if (next) {
      pausedRef.current = true; publishPaused(true); setPaused(true);
      muteAudio(audioRef.current, true);
      clearHighlight();
      setTutorStatus("ready");
    }
    try {
      await room.localParticipant.setMicrophoneEnabled(next ? false : mic);
      const reply = await room.localParticipant.performRpc({ destinationIdentity: agent.identity, method: "set_tutor_paused", payload: JSON.stringify({ paused: next }), responseTimeout: 5000 });
      if (JSON.parse(reply).paused !== next) throw new Error("Pause not confirmed");
      if (roomRef.current !== room) return;
      pausedRef.current = next; publishPaused(next); setPaused(next);
      muteAudio(audioRef.current, next);
      setError(null);
    } catch (failure) {
      console.warn("Tutor pause failed:", failure instanceof Error ? failure.message : "Unknown error");
      await disconnect(); setError("Conversation ended because pause couldn’t be confirmed. Your work is still here.");
    } finally { setBusy(false); }
  }
  async function enableAudio() {
    try { await roomRef.current?.startAudio(); setAudioBlocked(false); }
    catch { setError("Tap again to enable tutor audio."); }
  }
  return { status, error, everConnected, lines, paused, mic, busy, connected, ready, audioBlocked, connect, disconnect, send, toggleMic, togglePause, enableAudio };
}
