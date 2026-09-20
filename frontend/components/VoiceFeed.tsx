"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { useTutorSession } from "@/lib/livekit/useTutorSession";
import { useLearningPreferences } from "@/lib/tutor/support";
import { getTutorStatus, subscribeTutorStatus } from "@/lib/tutor/boardView";
import Icon from "./Icon";

type Session = ReturnType<typeof useTutorSession>;
export default function VoiceFeed({ session }: { session: Session }) {
  const checking = useSyncExternalStore(subscribeTutorStatus, getTutorStatus, () => "ready") === "checking";
  const preferences = useLearningPreferences();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const [history, setHistory] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const latest = session.lines.filter(line => line.speaker === "Mimir").slice(-1);
  useEffect(() => { if (typing) input.current?.focus(); }, [typing]);
  useEffect(() => {
    if (history) end.current?.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, [history, session.lines]);
  if (!session.connected) return null;
  const disabled = !session.ready || session.paused || sending;
  async function send(text: string, displayText?: string) {
    setSending(true);
    try { if (await session.send(text, displayText)) setDraft(""); }
    finally { setSending(false); }
  }
  return <section className="voice-companion" aria-label="Conversation with Mimir" data-paused={session.paused}>
    <div className="voice-feed-heading">
      <span className="voice-live-dot"/>
      <span>{session.paused ? "Take your time" : checking ? "Checking your work…" : "Mimir is with you"}</span>
      <button className="icon-button" onClick={() => setHistory(value => !value)} aria-label={history ? "Hide conversation history" : "Show conversation history"} aria-expanded={history}><Icon name="tutor" size={16}/></button>
    </div>
    {(preferences.captions || history) && <div className={`voice-lines ${history ? "voice-history" : ""}`} role="log" aria-label="Live conversation captions" aria-live="polite" aria-relevant="additions text">
      {(history ? session.lines : latest).map(line => <div className={`voice-line voice-line-${line.speaker.toLowerCase()}`} key={line.id}>
        <span className="voice-speaker">{line.speaker}</span><p>{line.text}</p>
      </div>)}
      {!session.lines.length && <p className="voice-waiting">{session.status === "connecting" ? "Connecting…" : "Ask about anything on your canvas."}</p>}
      <div ref={end}/>
    </div>}
    <div className="voice-actions">
      <button disabled={disabled} onClick={() => void send("I'm stuck. Look at my current work, color the part I should focus on and give me just the next hint.", "Next hint")}><Icon name="bulb" size={15}/>Next hint</button>
      <button disabled={disabled} onClick={() => void send("Please read the question on my board aloud, without solving it.", "Read question")}><Icon name="volume" size={15}/>Read question</button>
      <button disabled={disabled} onClick={() => void send("Can you explain that another way, with one small example?", "Explain another way")} aria-label="Explain another way"><Icon name="redo" size={15}/></button>
    </div>
    {typing && <form className="voice-composer" onSubmit={event => { event.preventDefault(); void send(draft); }}>
      <input ref={input} aria-label="Message Mimir" placeholder={session.paused ? "Paused" : "Or type a question…"} value={draft} onChange={event => setDraft(event.target.value)} maxLength={2000} disabled={disabled}/>
      <button type="submit" className="icon-button" aria-label="Send message" disabled={disabled || !draft.trim()}><Icon name="arrowUp" size={18}/></button>
    </form>}
    <div className="voice-session-controls">
      <button onClick={() => setTyping(value => !value)} aria-expanded={typing} aria-label="Type a question"><Icon name="text" size={15}/>Type</button>
      <button onClick={() => void session.togglePause()} disabled={!session.ready || session.busy}><Icon name={session.paused ? "play" : "pause"} size={15}/>{session.paused ? "Resume" : "Pause"}</button>
      <button onClick={() => void session.toggleMic()} disabled={!session.ready || session.busy || session.paused} aria-pressed={session.mic} aria-label={session.mic ? "Mute microphone" : "Enable microphone"}><Icon name={session.mic ? "mic" : "micOff"} size={15}/>{session.mic ? "Mic on" : "Mic off"}</button>
      {session.audioBlocked && <button onClick={() => void session.enableAudio()}>Enable sound</button>}
    </div>
    {session.error && <p className="voice-feed-error" role="alert">{session.error}</p>}
  </section>;
}
