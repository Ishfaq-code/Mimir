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

type VoiceStatus =
  | "disconnected"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "error";

const STATUS_LABEL: Record<VoiceStatus, string> = {
  disconnected: "Tutor offline",
  connecting: "Connecting…",
  listening: "Listening",
  thinking: "Thinking…",
  speaking: "Speaking",
  error: "Connection failed",
};

const STATUS_DOT: Record<VoiceStatus, string> = {
  disconnected: "bg-zinc-400",
  connecting: "bg-amber-400 animate-pulse",
  listening: "bg-emerald-500",
  thinking: "bg-amber-400 animate-pulse",
  speaking: "bg-blue-500 animate-pulse",
  error: "bg-red-500",
};

/** Voice bar: connects the browser to the LiveKit room, publishes the mic,
 * plays the tutor's audio, and registers the canvas RPC methods. */
export default function VoiceTutor() {
  const roomRef = useRef<Room | null>(null);
  const audioElsRef = useRef<HTMLMediaElement[]>([]);
  const [status, setStatus] = useState<VoiceStatus>("disconnected");
  const [error, setError] = useState<string | null>(null);

  const connected = status !== "disconnected" && status !== "error";

  const disconnect = useCallback(async () => {
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
    setStatus("connecting");
    setError(null);
    try {
      const tokenUrl = process.env.NEXT_PUBLIC_TOKEN_URL ?? "http://localhost:8000";
      const res = await fetch(`${tokenUrl}/token`);
      if (!res.ok) throw new Error(`token request failed (HTTP ${res.status})`);
      const { token, url } = (await res.json()) as { token: string; url: string };

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

      // the tutor draws via these RPC methods — register before it can call
      registerCanvasRpcs(room.localParticipant, tutorCanvas);

      // mirror the agent's published state (listening / thinking / speaking)
      for (const p of room.remoteParticipants.values()) watchAgent(p);
      room.on(RoomEvent.ParticipantConnected, watchAgent);

      await room.localParticipant.setMicrophoneEnabled(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await disconnect();
      setError(
        msg.toLowerCase().includes("permission") || msg.toLowerCase().includes("notallowed")
          ? "Microphone access denied"
          : msg,
      );
      setStatus("error");
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-lg ring-1 ring-black/[.06] dark:bg-zinc-800 dark:ring-white/10">
      <span className={`h-2 w-2 rounded-full ${STATUS_DOT[status]}`} />
      <span
        className="text-xs font-medium text-zinc-600 dark:text-zinc-300"
        title={error ?? undefined}
      >
        {status === "error" && error ? error : STATUS_LABEL[status]}
      </span>
      <button
        type="button"
        onClick={() => (connected ? void disconnect() : void connect())}
        className="rounded-lg bg-violet-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-violet-500"
      >
        {connected ? "Disconnect" : "Talk to tutor"}
      </button>
    </div>
  );
}
