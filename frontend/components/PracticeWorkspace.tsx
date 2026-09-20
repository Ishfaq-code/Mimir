"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import LearningControls from "./LearningControls";
import { loadPreferences, useLearningPreferences } from "@/lib/tutor/support";
import { AnimatePresence } from "motion/react";
import { useScreenshotQuestion } from "@/lib/useScreenshotQuestion";
import InfiniteCanvas, { type InfiniteCanvasHandle } from "./InfiniteCanvas";
import MimirOrb from "./MimirOrb";
import QuestionChip from "./QuestionChip";
import Icon, { MimirMark } from "./Icon";
import VisualizationResult, { type VisualizationData } from "./VisualizationResult";

type VisualizationStatus = "loading" | "success" | "error";
export default function PracticeWorkspace() {
  const preferences = useLearningPreferences();
  useEffect(() => { loadPreferences(); }, []);
  const [dark, setDark] = useState(false);
  const [visualizationOpen, setVisualizationOpen] = useState(false);
  const [visualizationProblem, setVisualizationProblem] = useState("");
  const [visualizationStatus, setVisualizationStatus] = useState<VisualizationStatus>("loading");
  const [visualization, setVisualization] = useState<VisualizationData | null>(null);
  const [visualizationError, setVisualizationError] = useState("");
  const [visualizationRevision, setVisualizationRevision] = useState(0);
  const visualizationDialogRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<InfiniteCanvasHandle>(null);
  const visualizationAbortRef = useRef<AbortController | null>(null);
  const visualizationRequestIdRef = useRef(0);
  const question = useScreenshotQuestion();
  const { importScreenshot, setPasteError } = question;

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
      setVisualizationError("Paste your problem onto the canvas, then click Visualize on the textbox.");
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

  const placeVisualizationOnCanvas = useCallback(() => {
    if (!visualization) return;
    canvasRef.current?.embedVisualization(visualizationProblem, visualization);
    closeVisualization();
  }, [visualization, visualizationProblem, closeVisualization]);

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
    await importScreenshot(file);
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

  return (
    <div className="practice-app" data-theme={dark ? "dark" : "light"} data-calm={preferences.calm} data-large-text={preferences.largeText} data-roomy-text={preferences.roomyText}>
      <header className="app-header" inert={visualizationOpen}>
        <div className="wordmark" aria-label="Mimir"><span className="brand-symbol"><MimirMark /></span>mimir<span className="brand-period">.</span></div>
        <div className="header-actions">
          <LearningControls />
          <button className="icon-button theme-toggle" onClick={() => setDark(value => !value)} aria-label={dark ? "Use light theme" : "Use dark theme"}><Icon name={dark ? "sun" : "moon"} size={19}/></button>
        </div>
      </header>
      <div className="workspace-layout" inert={visualizationOpen}>
        <main className="workspace-main" aria-label="Math workspace">
          <InfiniteCanvas ref={canvasRef} dark={dark} screenshot={question.screenshot} onVisualizeRequest={openVisualization} onPasteImage={acceptImage} onRemoveScreenshot={question.removeScreenshot} />
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
      {visualizationOpen && <div className="visualize-backdrop" role="presentation" onMouseDown={closeVisualization}>
        <section ref={visualizationDialogRef} tabIndex={-1} className="visualize-modal" role="dialog" aria-modal="true" aria-label="Problem visualization" onMouseDown={event => event.stopPropagation()}>
          <div className="visualize-heading">{visualizationProblem && <div className="visualize-problem"><h2>{visualizationProblem}</h2></div>}<button className="icon-button" type="button" onClick={closeVisualization} aria-label="Close visualization"><Icon name="close" size={18}/></button></div>
          <div className="visualize-body">
            {visualizationStatus === "loading" && <div className="visualize-loading" role="status"><span className="review-dot"/>Building the visualization…</div>}
            {visualizationStatus === "error" && <div className="visualize-error" role="alert"><p>{visualizationError}</p>{visualizationProblem && <button className="primary-button" type="button" onClick={() => void requestVisualization(visualizationProblem)}>Try again</button>}</div>}
            {visualizationStatus === "success" && visualization && <VisualizationResult key={visualizationRevision} data={visualization} onPlaceOnCanvas={placeVisualizationOnCanvas}/>}
          </div>
        </section>
      </div>}
    </div>
  );
}
