"use client";

import { useCallback, useEffect, useState } from "react";
import LearningControls from "./LearningControls";
import { loadPreferences, useLearningPreferences } from "@/lib/tutor/support";
import { AnimatePresence } from "motion/react";
import { useScreenshotQuestion } from "@/lib/useScreenshotQuestion";
import InfiniteCanvas from "./InfiniteCanvas";
import MimirOrb from "./MimirOrb";
import QuestionChip from "./QuestionChip";
import Icon, { MimirMark } from "./Icon";

export default function PracticeWorkspace() {
  const preferences = useLearningPreferences();
  useEffect(() => { loadPreferences(); }, []);
  const [dark, setDark] = useState(false);
  const [pasting, setPasting] = useState(false);
  const question = useScreenshotQuestion();
  const { importScreenshot, setPasteError } = question;

  const acceptImage = useCallback(async (file: Blob) => {
    await importScreenshot(file);
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

  return (
    <div className="practice-app" data-theme={dark ? "dark" : "light"} data-calm={preferences.calm} data-large-text={preferences.largeText} data-roomy-text={preferences.roomyText}>
      <header className="app-header">
        <div className="wordmark" aria-label="Mimir"><span className="brand-symbol"><MimirMark /></span>mimir<span className="brand-period">.</span></div>
        <div className="header-actions">
          <button className="paste-button" aria-label="Paste screenshot" onClick={() => void pasteScreenshot()} disabled={pasting}><Icon name="clipboard" size={17}/><span>Paste screenshot</span></button>
          <LearningControls />
          <button className="icon-button theme-toggle" onClick={() => setDark(value => !value)} aria-label={dark ? "Use light theme" : "Use dark theme"}><Icon name={dark ? "sun" : "moon"} size={19}/></button>
        </div>
      </header>
      <div className="workspace-layout">
        <main className="workspace-main" aria-label="Math workspace">
          <InfiniteCanvas dark={dark} screenshot={question.screenshot} />
          {question.pasteError && <div className="paste-notice" role="alert"><span>{question.pasteError}</span><button className="icon-button" aria-label="Dismiss paste message" onClick={() => setPasteError("")}><Icon name="close" size={16}/></button></div>}
          <MimirOrb />
          <AnimatePresence>
            {question.chipOpen && question.screenshot && (
              <QuestionChip
                key={question.screenshot.id}
                status={question.status}
                text={question.text}
                error={question.error}
                progress={question.progress}
                onSetText={question.setText}
                onRetry={question.retry}
                onDismiss={question.dismiss}
              />
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
