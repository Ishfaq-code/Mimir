"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
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
  disconnected: "",
  connecting: "Connecting…",
  listening: "Listening",
  thinking: "Thinking…",
  speaking: "Speaking",
  error: "Connection failed",
};

// verbose diagnostics while the voice slice stabilises — open devtools
const log = (...args: unknown[]) => console.debug("[MimirOrb]", ...args);

const AURA_OPACITY: Partial<Record<VoiceStatus, number[]>> = {
  connecting: [0.35, 0.6, 0.35],
  listening: [0.5, 0.85, 0.5],
  thinking: [0.7, 1, 0.7],
  speaking: [0.65, 1, 0.8, 1],
};

const AURA_PERIOD: Partial<Record<VoiceStatus, number>> = {
  connecting: 1.4,
  listening: 3,
  thinking: 0.9,
  speaking: 1.2,
};

/** Mimir orb: press to talk, press again to end. The orb's motion and a
 * screen-edge aura encode the session state instead of opening a panel. */
export default function MimirOrb() {
  const roomRef = useRef<Room | null>(null);
  const connectAttemptRef = useRef(0);
  const audioElsRef = useRef<HTMLMediaElement[]>([]);
  const [status, setStatus] = useState<VoiceStatus>("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [everConnected, setEverConnected] = useState(false);
  const reduced = useReducedMotion();

  const connected =
    status !== "disconnected" && status !== "error";
  const auraActive =
    status === "connecting" || status === "listening" ||
    status === "thinking" || status === "speaking";

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
    log("agent participant found:", p.identity, "state:", p.attributes["lk.agent.state"]);
    const apply = () => {
      const s = p.attributes["lk.agent.state"];
      log("agent state ->", s);
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
      log("fetching token from", tokenUrl);
      const res = await fetch(`${tokenUrl}/token`);
      if (!res.ok) throw new Error("Voice is unavailable right now. Please try again.");
      const { token, url } = (await res.json()) as { token: string; url: string };

      if (attempt !== connectAttemptRef.current) return;
      const room = new Room();
      roomRef.current = room;

      // play the tutor's audio
      room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
        log("track subscribed:", track.kind, "from", participant.identity);
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
        log("connection state ->", state);
        if (state === ConnectionState.Connected) {
          setStatus("listening");
          setEverConnected(true);
        }
        if (state === ConnectionState.Disconnected) setStatus("disconnected");
      });

      await room.connect(url, token);
      if (attempt !== connectAttemptRef.current) { await room.disconnect(); return; }
      log("room connected as", room.localParticipant.identity);

      // the tutor draws via these RPC methods — register before it can call
      registerCanvasRpcs(room.localParticipant, tutorCanvas);

      // mirror the agent's published state (listening / thinking / speaking)
      for (const p of room.remoteParticipants.values()) watchAgent(p);
      room.on(RoomEvent.ParticipantConnected, watchAgent);

      await room.localParticipant.setMicrophoneEnabled(true);
      log("microphone enabled");
    } catch (e) {
      if (attempt !== connectAttemptRef.current) return;
      const msg = e instanceof Error ? e.message : String(e);
      log("connect failed:", msg);
      await disconnect();
      setError(
        msg.toLowerCase().includes("permission") || msg.toLowerCase().includes("notallowed")
          ? "Microphone access denied"
          : "Voice is unavailable right now. Please try again.",
      );
      setStatus("error");
    }
  }

  const orbAnimate = reduced ? {} : (
    status === "listening" ? { scale: [1, 1.05, 1] }
    : status === "thinking" ? { scale: [1, 1.03, 1] }
    : status === "connecting" ? { scale: [1, 1.08, 1] }
    : {}
  );
  const orbTransition = reduced || !Object.keys(orbAnimate).length ? {} : {
    duration: status === "thinking" ? 0.9 : status === "connecting" ? 1.1 : 2.4,
    repeat: Infinity,
    ease: "easeInOut" as const,
  };

  return (
    <>
      <motion.div
        className={`screen-aura aura-${status}`}
        initial={{ opacity: 0 }}
        animate={
          auraActive
            ? reduced || !AURA_OPACITY[status] ? { opacity: 0.7 } : { opacity: AURA_OPACITY[status] }
            : { opacity: 0 }
        }
        transition={
          auraActive && !reduced && AURA_OPACITY[status]
            ? { duration: AURA_PERIOD[status] ?? 2, repeat: Infinity, ease: "easeInOut" as const }
            : { duration: 0.4, ease: "easeOut" as const }
        }
        aria-hidden="true"
      />
      <div className={`mimir-orb-zone orb-${status}`}>
        <motion.button
          type="button"
          className="mimir-orb"
          onClick={() => (connected ? void disconnect() : void connect())}
          disabled={status === "connecting"}
          animate={orbAnimate}
          transition={orbTransition}
          whileHover={reduced ? undefined : { scale: connected ? 1 : 1.06 }}
          whileTap={reduced ? undefined : { scale: 0.94 }}
          aria-label={connected ? "End conversation with Mimir" : "Talk to Mimir"}
          aria-pressed={connected}
        >
          <span className="orb-core" aria-hidden="true">
            <span className="orb-flow">
              <span className="orb-ribbon orb-ribbon-violet" />
              <span className="orb-ribbon orb-ribbon-cyan" />
              <span className="orb-ribbon orb-ribbon-pink" />
            </span>
            <span className="orb-light" />
            <span className="orb-glass" />
          </span>
          {status === "speaking" && !reduced && (
            <>
              {[0, 1, 2].map((ring) => (
                <motion.span
                  key={ring}
                  className="orb-ripple"
                  initial={{ scale: 1, opacity: 0.5 }}
                  animate={{ scale: 2, opacity: 0 }}
                  transition={{ duration: 1.6, repeat: Infinity, delay: ring * 0.5, ease: "easeOut" }}
                  aria-hidden="true"
                />
              ))}
            </>
          )}
        </motion.button>
        <AnimatePresence>
          {!connected && !everConnected && status !== "error" && (
            <motion.span
              key="hint"
              className="orb-hint"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={reduced ? { duration: 0 } : { duration: 0.25, ease: "easeOut" }}
            >
              Talk to Mimir
            </motion.span>
          )}
        </AnimatePresence>
        <div className="orb-readout" role="status" aria-live="polite">
          {STATUS_LABEL[status] && <span className="orb-status">{STATUS_LABEL[status]}</span>}
          {status === "error" && error && <span className="orb-error" role="alert">{error}</span>}
        </div>
      </div>
    </>
  );
}
