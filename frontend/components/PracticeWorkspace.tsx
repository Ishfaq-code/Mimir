"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { useScreenshotQuestion } from "@/lib/useScreenshotQuestion";
import InfiniteCanvas from "./InfiniteCanvas";
import VoiceTutor from "./VoiceTutor";
import Icon, { MimirMark } from "./Icon";
import VisualizationResult, { type VisualizationData } from "./VisualizationResult";

const wideQuery = "(min-width: 1000px)";
function subscribeViewport(callback: () => void) {
  const media = window.matchMedia(wideQuery);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
const getWideViewport = () => window.matchMedia(wideQuery).matches;
const getServerViewport = () => true;
type VisualizationStatus = "loading" | "success" | "error";
export default function PracticeWorkspace() {
  const [dark, setDark] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [visualizationOpen, setVisualizationOpen] = useState(false);
  const [visualizationProblem, setVisualizationProblem] = useState("");
  const [visualizationStatus, setVisualizationStatus] = useState<VisualizationStatus>("loading");
  const [visualization, setVisualization] = useState<VisualizationData | null>(null);
  const [visualizationError, setVisualizationError] = useState("");
  const [visualizationRevision, setVisualizationRevision] = useState(0);
  const visualizationDialogRef = useRef<HTMLElement>(null);
  const visualizationAbortRef = useRef<AbortController | null>(null);
  const visualizationRequestIdRef = useRef(0);
  const question = useScreenshotQuestion();
  const { importScreenshot, setPasteError } = question;
  const wide = useSyncExternalStore(subscribeViewport, getWideViewport, getServerViewport);
  const tutorToggleRef = useRef<HTMLButtonElement>(null);
  const reviewHeadingRef = useRef<HTMLHeadingElement>(null);
  const closePanel = () => { setPanelOpen(false); tutorToggleRef.current?.focus(); };

  const requestVisualization = useCallback(async (problem: string) => {
    visualizationAbortRef.current?.abort();
    const requestId = ++visualizationRequestIdRef.current;
    setVisualizationRevision(value => value + 1);
    const controller = new AbortController();
    visualizationAbortRef.current = controller;
    setVisualizationStatus("loading");
    setVisualization(null);
    setVisualizationError("");
    setVisualizationProblem(problem);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? process.env.NEXT_PUBLIC_TOKEN_URL ?? `${window.location.protocol}//${window.location.hostname}:8000`;
      const response = await fetch(`${apiUrl}/visualize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problem, topic: "kinematics" }),
        cache: "no-store",
        signal: controller.signal,
      });
      const body = await response.json() as VisualizationData | { detail?: unknown };
      if (!response.ok) throw new Error("detail" in body && typeof body.detail === "string" ? body.detail : "The visualization could not be generated.");
      if (controller.signal.aborted || requestId !== visualizationRequestIdRef.current) return;
      setVisualization(body as VisualizationData);
      setVisualizationStatus("success");
    } catch (error) {
      if (controller.signal.aborted || requestId !== visualizationRequestIdRef.current) return;
      setVisualizationStatus("error");
      setVisualizationError(error instanceof Error ? error.message : "The visualization could not be generated.");
    }
  }, []);

  const openVisualization = useCallback((problem: string) => {
    visualizationAbortRef.current?.abort();
    setVisualizationProblem(problem);
    setVisualizationStatus("loading");
    setVisualization(null);
    setVisualizationError("");
    setVisualizationOpen(true);
    if (problem) void requestVisualization(problem);
    else {
      setVisualizationStatus("error");
      setVisualizationError("Paste your problem onto the canvas, select its textbox, then click Visualize.");
    }
  }, [requestVisualization]);

  const closeVisualization = useCallback(() => {
    visualizationAbortRef.current?.abort();
    visualizationRequestIdRef.current += 1;
    visualizationAbortRef.current = null;
    setVisualizationOpen(false);
    setVisualizationProblem("");
    setVisualization(null);
    setVisualizationError("");
  }, []);

  useEffect(() => {
    if (!visualizationOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = visualizationDialogRef.current;
    dialog?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeVisualization();
      if (event.key === "Tab" && dialog) {
        const controls = Array.from(dialog.querySelectorAll<HTMLElement>("button:not(:disabled), select, input, [tabindex='0']"));
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first?.focus();
        }
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => { window.removeEventListener("keydown", closeOnEscape); previousFocus?.focus(); };
  }, [closeVisualization, visualizationOpen]);

  useEffect(() => () => {
    visualizationRequestIdRef.current += 1;
    visualizationAbortRef.current?.abort();
  }, []);

  const acceptImage = useCallback(async (file: Blob) => {
    if (await importScreenshot(file)) setPanelOpen(true);
  }, [importScreenshot]);

  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      if (visualizationOpen) return;
      if (event.target instanceof Element && event.target.closest("input, textarea, [contenteditable=true]")) return;
      const image = Array.from(event.clipboardData?.items ?? []).find(item => item.type.startsWith("image/"))?.getAsFile();
      if (!image) return;
      event.preventDefault();
      void acceptImage(image);
    };
    window.addEventListener("paste", paste);
    return () => window.removeEventListener("paste", paste);
  }, [acceptImage, visualizationOpen]);

  useEffect(() => {
    if (question.phase === "review" && panelOpen) reviewHeadingRef.current?.focus();
  }, [question.phase, panelOpen]);

  async function pasteScreenshot() {
    setPasting(true);
    setPasteError("");
    try {
      if (!navigator.clipboard?.read) throw new Error("Use your browser’s Paste command, or press ⌘V / Ctrl+V.");
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find(value => value.startsWith("image/"));
        if (type) { await acceptImage(await item.getType(type)); return; }
      }
      setPasteError("Copy a screenshot, then paste it here.");
    } catch (failure) {
      setPasteError(failure instanceof Error && failure.message.startsWith("Use your")
        ? failure.message : "Paste access is blocked. Use your browser’s Paste command, or press ⌘V / Ctrl+V.");
    } finally { setPasting(false); }
  }

  function confirmQuestion() {
    if (question.confirm() && !wide) closePanel();
  }

  return (
    <div className={`practice-app tutor-${panelOpen ? "open" : "closed"}`} data-theme={dark ? "dark" : "light"}>
      <header className="app-header" inert={visualizationOpen}>
        <div className="wordmark" aria-label="Mimir"><span className="brand-symbol"><MimirMark /></span>mimir<span className="brand-period">.</span></div>
        <div className="header-actions">
          <button className="paste-button" aria-label="Paste screenshot" onClick={() => void pasteScreenshot()} disabled={pasting}><Icon name="clipboard" size={17}/><span>Paste screenshot</span></button>
          <button className="icon-button theme-toggle" onClick={() => setDark(value => !value)} aria-label={dark ? "Use light theme" : "Use dark theme"}><Icon name={dark ? "sun" : "moon"} size={19}/></button>
        </div>
      </header>
      <div className="workspace-layout" inert={visualizationOpen}>
        <button
          ref={tutorToggleRef}
          className="tutor-island"
          onClick={() => setPanelOpen(value => !value)}
          aria-controls="tutor-panel"
          aria-expanded={panelOpen}
        >
          <Icon name="tutor" size={18}/><span>Tutor</span>{question.phase === "review" && <span className="review-dot"/>}
        </button>
        <main className="workspace-main" aria-label="Math workspace" inert={panelOpen && !wide}>
           <InfiniteCanvas dark={dark} screenshot={question.screenshot} confirmedQuestion={question.phase === "confirmed" ? question.text : null} onVisualizeRequest={openVisualization} />
          {question.pasteError && <div className="paste-notice" role="alert"><span>{question.pasteError}</span><button className="icon-button" aria-label="Dismiss paste message" onClick={() => setPasteError("")}><Icon name="close" size={16}/></button></div>}
        </main>
        <aside className="tutor-panel" id="tutor-panel" aria-label="Question and tutor" onKeyDown={event => { if (event.key === "Escape") closePanel(); }}>
          <div className="tutor-heading"><h1>Tutor</h1><button className="icon-button" onClick={closePanel} aria-label="Close tutor"><Icon name="close" size={18}/></button></div>
          <div className="question-body">
            {question.phase === "empty" && <div className="question-empty"><h2>Your tutor is ready.</h2><p>Start talking now, or paste a question when you want to give your tutor more context.</p><button className="secondary-button" onClick={() => void pasteScreenshot()} disabled={pasting}><Icon name="clipboard" size={18}/>Paste screenshot</button></div>}
            {question.phase === "reading" && <div className="question-reading" role="status"><h2>Reading screenshot…</h2><div className="ocr-skeleton" aria-hidden="true"><i/><i/><i/></div><progress max={1} value={question.progress || undefined} aria-label="Reading screenshot"/><button className="text-button" onClick={question.edit}>Edit manually</button></div>}
            {question.phase === "review" && <form onSubmit={event => { event.preventDefault(); confirmQuestion(); }}>
              <h2 ref={reviewHeadingRef} tabIndex={-1}>Is this right?</h2>
              <label htmlFor="question-text">Edit anything that needs correcting.</label>
              {question.screenshot && <Image className="question-preview" src={question.screenshot.url} width={question.screenshot.image.naturalWidth} height={question.screenshot.image.naturalHeight} alt="Pasted question" unoptimized/>}
              {question.error && <p className="question-error" role="alert">{question.error}</p>}
              <textarea id="question-text" aria-label="Question text" value={question.text} onChange={event => question.setText(event.target.value)} maxLength={12000} rows={7} spellCheck={false}/>
              <div className="question-actions"><button type="submit" className="primary-button" disabled={!question.text.trim()}><Icon name="check" size={17}/>Confirm question</button><button type="button" className="text-button" onClick={question.retry}>Read again</button></div>
            </form>}
            {question.phase === "confirmed" && <><div className="question-confirmed"><span><Icon name="check" size={15}/>Confirmed</span><button className="text-button" onClick={question.edit}>Edit</button></div><p className="question-text">{question.text}</p></>}
          </div>
          <footer className="tutor-footer"><VoiceTutor key={`${question.screenshot?.id ?? "none"}-${question.phase}`}/></footer>
        </aside>
      </div>
      {visualizationOpen && <div className="visualize-backdrop" role="presentation" onMouseDown={closeVisualization}>
        <section ref={visualizationDialogRef} tabIndex={-1} className="visualize-modal" role="dialog" aria-modal="true" aria-labelledby="visualize-title" onMouseDown={event => event.stopPropagation()}>
          <div className="visualize-heading"><h2 id="visualize-title">Kinematics</h2><button className="icon-button" type="button" onClick={closeVisualization} aria-label="Close visualization"><Icon name="close" size={18}/></button></div>
          <div className="visualize-body">
            <p className="visualize-scope">One object, constant acceleration. Practice speeding up, braking, constant speed, or free fall.</p>
            {visualizationProblem && <div className="visualize-problem"><span className="eyebrow">YOUR QUESTION</span><p>{visualizationProblem}</p></div>}
            {visualizationStatus === "loading" && <div className="visualize-loading" role="status"><span className="review-dot"/>Building the visualization…</div>}
            {visualizationStatus === "error" && <div className="visualize-error" role="alert"><p>{visualizationError}</p>{visualizationProblem && <button className="primary-button" type="button" onClick={() => void requestVisualization(visualizationProblem)}>Try again</button>}</div>}
            {visualizationStatus === "success" && visualization && <VisualizationResult key={visualizationRevision} data={visualization}/>}
          </div>
        </section>
      </div>}
    </div>
  );
}
