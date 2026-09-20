import { ParticipantEvent, RoomEvent, type RemoteParticipant, type Room } from "livekit-client";

/** A signaling connection alone does not mean the tutor can receive a turn. */
export function waitForTutor(room: Room, signal: AbortSignal, timeoutMs = 30000): Promise<void> {
  return new Promise((resolve, reject) => {
    const watched = new Map<RemoteParticipant, () => void>();
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", cancelled);
      room.off(RoomEvent.ParticipantConnected, watch);
      room.off(RoomEvent.ParticipantDisconnected, left);
      room.off(RoomEvent.Disconnected, disconnected);
      for (const [participant, handler] of watched) participant.off(ParticipantEvent.AttributesChanged, handler);
      if (error) reject(error); else resolve();
    };
    const cancelled = () => finish(new DOMException("Connection cancelled", "AbortError"));
    const disconnected = () => finish(new Error("Voice connection dropped during startup"));
    const left = (participant: RemoteParticipant) => { if (participant.isAgent) disconnected(); };
    const watch = (participant: RemoteParticipant) => {
      if (!participant.isAgent || watched.has(participant) || settled) return;
      const changed = () => {
        if (["listening", "thinking", "speaking"].includes(participant.attributes["lk.agent.state"])) finish();
      };
      watched.set(participant, changed);
      participant.on(ParticipantEvent.AttributesChanged, changed);
      changed();
    };
    const timer = setTimeout(() => finish(new Error("Tutor startup timed out")), timeoutMs);
    signal.addEventListener("abort", cancelled, { once: true });
    room.on(RoomEvent.ParticipantConnected, watch);
    room.on(RoomEvent.ParticipantDisconnected, left);
    room.on(RoomEvent.Disconnected, disconnected);
    if (signal.aborted) { cancelled(); return; }
    for (const participant of room.remoteParticipants.values()) watch(participant);
  });
}

/** Retry startup once in a fresh room; never replay an established conversation. */
export async function connectWithRetry(
  start: () => Promise<void>,
  cleanup: () => Promise<void>,
  signal: AbortSignal,
  onRetry: () => void,
): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (signal.aborted) throw new DOMException("Connection cancelled", "AbortError");
    try { await start(); return; }
    catch (error) {
      await cleanup();
      if (signal.aborted || attempt === 1) throw error;
      onRetry();
    }
  }
}
