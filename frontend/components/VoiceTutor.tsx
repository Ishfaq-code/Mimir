"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ConnectionState,
  ParticipantEvent,
  Room,
  RoomEvent,
  Track,
} from "livekit-client";
import type { RemoteParticipant } from "livekit-client";
import { registerCanvasRpcs } from "@/lib/livekit/rpc";
import { tutorCanvas } from "@/lib/tutor/tutorCanvas";
import Icon from "./Icon";

type VoiceStatus =
  | "disconnected"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "error";

const STATUS_LABEL: Record<VoiceStatus, string> = {
  disconnected: "Ready when you are",
  connecting: "Connecting…",
  listening: "Listening",
  thinking: "Thinking…",
  speaking: "Speaking",
  error: "Connection failed",
};

/** Voice bar: connects the browser to the LiveKit room, publishes the mic,
 * plays the tutor's audio, and registers the canvas RPC methods. */
export default function VoiceTutor() {
  const roomRef = useRef<Room | null>(null);
  const connectAttemptRef = useRef(0);
  const audioElsRef = useRef<HTMLMediaElement[]>([]);
  const [status, setStatus] = useState<VoiceStatus>("disconnected");
  const [error, setError] = useState<string | null>(null);

  const connected = status !== "disconnected" && status !== "error";

  const disconnect = useCallback(async () => {
    connectAttemptRef.current += 1;
    for (const el of audioElsRef.current) el.remove();
    audioElsRef.current = [];
    const room = roomRef.current;
    roomRef.current = null;
    if (room) await room.disconnect();
    setStatus("disconnected");
  }, []);

  // tear down the room when the component unmounts
  useEffect(() => {
    return () => {
      void disconnect();
    };
  }, [disconnect]);

  function watchAgent(p: RemoteParticipant) {
    if (!p.isAgent) return;
    const apply = () => {
      const s = p.attributes["lk.agent.state"];
      if (s === "listening" || s === "thinking" || s === "speaking") setStatus(s);
    };
    apply();
    p.on(ParticipantEvent.AttributesChanged, apply);
  }

  async function connect() {
    const attempt = ++connectAttemptRef.current;
    setStatus("connecting");
    setError(null);
    try {
      const tokenUrl = process.env.NEXT_PUBLIC_TOKEN_URL ?? `${window.location.protocol}//${window.location.hostname}:8000`;
      const res = await fetch(`${tokenUrl}/token`);
      if (!res.ok) throw new Error("Voice is unavailable right now. Please try again.");
      const { token, url } = (await res.json()) as { token: string; url: string };

      if (attempt !== connectAttemptRef.current) return;
      const room = new Room();
      roomRef.current = room;

      // play the tutor's audio
      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind !== Track.Kind.Audio) return;
        const el = track.attach();
        audioElsRef.current.push(el);
        document.body.appendChild(el);
      });
      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        for (const el of track.detach()) {
          audioElsRef.current = audioElsRef.current.filter((e) => e !== el);
          el.remove();
        }
      });
      room.on(RoomEvent.ConnectionStateChanged, (state) => {
        if (state === ConnectionState.Connected) setStatus("listening");
        if (state === ConnectionState.Disconnected) setStatus("disconnected");
      });

      await room.connect(url, token);
      if (attempt !== connectAttemptRef.current) { await room.disconnect(); return; }

      // the tutor draws via these RPC methods — register before it can call
      registerCanvasRpcs(room.localParticipant, tutorCanvas);

      // mirror the agent's published state (listening / thinking / speaking)
      for (const p of room.remoteParticipants.values()) watchAgent(p);
      room.on(RoomEvent.ParticipantConnected, watchAgent);

      await room.localParticipant.setMicrophoneEnabled(true);
    } catch (e) {
      if (attempt !== connectAttemptRef.current) return;
      const msg = e instanceof Error ? e.message : String(e);
      await disconnect();
      setError(
        msg.toLowerCase().includes("permission") || msg.toLowerCase().includes("notallowed")
          ? "Microphone access denied"
          : "Voice is unavailable right now. Please try again.",
      );
      setStatus("error");
    }
  }

  return (
    <div className={`voice-control voice-${status}`}>
      <div className="voice-status" role="status"><span className="status-dot"/>{STATUS_LABEL[status]}</div>
      <button type="button" className="voice-button" onClick={() => (connected ? void disconnect() : void connect())} disabled={status === "connecting"}>
        <Icon name={connected ? "close" : "mic"} size={20}/><span>{status === "connecting" ? "Connecting…" : connected ? "End conversation" : "Talk to Mimir"}</span><span className="voice-wave" aria-hidden="true"><i/><i/><i/><i/></span>
      </button>
      {error && status === "error" ? <p className="voice-error" role="alert">{error}</p> : null}
    </div>
  );
}
