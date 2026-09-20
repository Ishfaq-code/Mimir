"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { useScreenshotQuestion } from "@/lib/useScreenshotQuestion";
import InfiniteCanvas from "./InfiniteCanvas";
import VoiceTutor from "./VoiceTutor";
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
  const [dark, setDark] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [pasting, setPasting] = useState(false);
  const question = useScreenshotQuestion();
  const { importScreenshot, setPasteError } = question;
  const wide = useSyncExternalStore(subscribeViewport, getWideViewport, getServerViewport);
  const tutorToggleRef = useRef<HTMLButtonElement>(null);
  const reviewHeadingRef = useRef<HTMLHeadingElement>(null);
  const closePanel = () => { setPanelOpen(false); tutorToggleRef.current?.focus(); };

  const acceptImage = useCallback(async (file: Blob) => {
    if (await importScreenshot(file)) setPanelOpen(true);
  }, [importScreenshot]);

  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      if (event.target instanceof Element && event.target.closest("input, textarea, [contenteditable=true]")) return;
      const image = Array.from(event.clipboardData?.items ?? []).find(item => item.type.startsWith("image/"))?.getAsFile();
      if (!image) return;
      event.preventDefault();
      void acceptImage(image);
    };
    window.addEventListener("paste", paste);
    return () => window.removeEventListener("paste", paste);
  }, [acceptImage]);

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
      <header className="app-header">
        <div className="wordmark" aria-label="Mimir"><span className="brand-symbol"><MimirMark /></span>mimir<span className="brand-period">.</span></div>
        <div className="header-actions">
          <button className="paste-button" aria-label="Paste screenshot" onClick={() => void pasteScreenshot()} disabled={pasting}><Icon name="clipboard" size={17}/><span>Paste screenshot</span></button>
          <button className="icon-button theme-toggle" onClick={() => setDark(value => !value)} aria-label={dark ? "Use light theme" : "Use dark theme"}><Icon name={dark ? "sun" : "moon"} size={19}/></button>
        </div>
      </header>
      <div className="workspace-layout">
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
          <InfiniteCanvas dark={dark} screenshot={question.screenshot} onPasteScreenshot={() => void pasteScreenshot()} />
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
    </div>
  );
}
