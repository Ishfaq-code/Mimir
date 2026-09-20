"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { CanvasElement } from "@/lib/canvas/types";
import { PRACTICE_PROBLEMS } from "@/lib/problems";
import InfiniteCanvas from "./InfiniteCanvas";
import VoiceTutor from "./VoiceTutor";
import { setPracticeProblem } from "@/lib/tutor/store";
import ChatPanel from "./ChatPanel";
import Icon, { MimirMark } from "./Icon";

const wideQuery = "(min-width: 1000px)";
function subscribeViewport(callback: () => void) {
  const media = window.matchMedia(wideQuery);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
const getWideViewport = () => window.matchMedia(wideQuery).matches;
const getServerViewport = () => true;

export default function PracticeWorkspace() {
  const [problemIndex, setProblemIndex] = useState(0);
  const [dark, setDark] = useState(false);
  const [panel, setPanel] = useState<"auto" | "open" | "closed">("auto");
  const [work, setWork] = useState<Record<string, CanvasElement[]>>({});
  const problem = PRACTICE_PROBLEMS[problemIndex];
  const wide = useSyncExternalStore(subscribeViewport, getWideViewport, getServerViewport);
  const panelOpen = panel === "open" || (panel === "auto" && wide);
  const tutorToggleRef = useRef<HTMLButtonElement>(null);
  const closePanel = () => { setPanel("closed"); tutorToggleRef.current?.focus(); };
  useEffect(() => { setPracticeProblem(problem.equation.replace("÷", "/")); }, [problem]);
  const updateWork = useCallback((elements: CanvasElement[]) => {
    setWork(previous => ({ ...previous, [problem.id]: elements }));
  }, [problem.id]);
  const togglePanel = () => setPanel(current => {
    const open = current === "open" || (current === "auto" && window.matchMedia("(min-width: 1000px)").matches);
    return open ? "closed" : "open";
  });

  return (
    <div className={`practice-app tutor-${panel}`} data-theme={dark ? "dark" : "light"}>
      <header className="app-header">
        <div className="wordmark" aria-label="Mimir"><span className="brand-symbol"><MimirMark /></span>mimir<span className="brand-period">.</span></div>
        <div className="header-divider" />
        <div className="session-label"><Icon name="book" size={17} /><span>Algebra practice</span></div>
        <span className="session-mode">YOUR SPACE TO THINK</span>
        <div className="header-actions">
          <button className="icon-button theme-toggle" onClick={() => setDark(value => !value)} aria-label={dark ? "Use light theme" : "Use dark theme"} title={dark ? "Use light theme" : "Use dark theme"}><Icon name={dark ? "sun" : "moon"} size={19} /></button>
          <button ref={tutorToggleRef} className="tutor-toggle" onClick={togglePanel} aria-controls="tutor-panel" aria-expanded={panelOpen}><Icon name="tutor" size={18} /><span>Tutor</span></button>
        </div>
      </header>

      <div className="workspace-layout">
        <main className="workspace-main" aria-label="Math practice workspace" inert={panelOpen && !wide}>
          <section className="problem-heading" aria-labelledby="problem-equation">
            <div className="problem-topline">
              <span className="eyebrow">LET’S WORK ON THIS</span>
              <div className="problem-navigation">
                <span>{String(problemIndex + 1).padStart(2, "0")} <span className="muted">/ {String(PRACTICE_PROBLEMS.length).padStart(2, "0")}</span></span>
                <button className="icon-button" disabled={problemIndex === 0} onClick={() => setProblemIndex(index => index - 1)} aria-label="Previous problem"><Icon name="chevron" size={16} className="rotate-half" /></button>
                <button className="icon-button" disabled={problemIndex === PRACTICE_PROBLEMS.length - 1} onClick={() => setProblemIndex(index => index + 1)} aria-label="Next problem"><Icon name="chevron" size={16} /></button>
              </div>
            </div>
            <div className="problem-equation-row"><h1 id="problem-equation">{problem.equation}</h1><span className="topic-tag">{problem.topic}</span></div>
            <p>{problem.prompt}</p>
          </section>
          <InfiniteCanvas key={problem.id} dark={dark} initialElements={work[problem.id] ?? []} onSceneChange={updateWork} />
        </main>
        <aside className="tutor-panel" id="tutor-panel" aria-label="Mimir tutor" onKeyDown={event => { if (event.key === "Escape") closePanel(); }}>
          {PRACTICE_PROBLEMS.map(item => <div className="tutor-session" key={item.id} hidden={item.id !== problem.id}><ChatPanel problem={item} onClose={closePanel} /></div>)}
          <footer className="tutor-footer"><VoiceTutor key={problem.id}/><p>Start a voice session, or explore the prepared hints above.</p></footer>
        </aside>
      </div>
    </div>
  );
}
