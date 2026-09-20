"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useTutorSession, type VoiceStatus } from "@/lib/livekit/useTutorSession";
import { useLearningPreferences } from "@/lib/tutor/support";
import VoiceFeed from "./VoiceFeed";

const STATUS_LABEL: Record<VoiceStatus, string> = {
  disconnected: "", connecting: "Connecting…", listening: "Listening",
  thinking: "Looking at your work…", speaking: "Speaking", error: "Connection failed",
};

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
  const session = useTutorSession();
  const { status, error, everConnected, connected, connect, disconnect } = session;
  const preferences = useLearningPreferences();
  const systemReduced = useReducedMotion();
  const reduced = systemReduced || preferences.calm || session.paused;
  const auraActive = connected && !session.paused && !preferences.calm;

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
      <VoiceFeed session={session} />
      <div className={`mimir-orb-zone orb-${status}`} data-paused={session.paused}>
        <motion.button
          type="button"
          className="mimir-orb"
          onClick={() => (connected ? void disconnect() : void connect())}
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
        {!connected && <button className="orb-type-entry" onClick={() => void connect(false)}>Use keyboard</button>}
        <div className="orb-readout" role="status" aria-live="polite">
          {STATUS_LABEL[status] && <span className="orb-status">{session.paused ? "Paused" : STATUS_LABEL[status]}</span>}
          {!connected && error && <span className="orb-error" role="alert">{error}</span>}
        </div>
      </div>
    </>
  );
}
