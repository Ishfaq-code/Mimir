"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadScreenshot, readScreenshot, type Screenshot } from "./screenshot";
import { setConfirmedQuestion } from "./tutor/store";

export type QuestionStatus = "idle" | "reading" | "ready" | "error";

/** Pasted-screenshot question: the image lands on the canvas, local OCR feeds
 * a floating chip, and edits update tutor context live (implicit confirm). */
export function useScreenshotQuestion() {
  const [screenshot, setScreenshot] = useState<Screenshot | null>(null);
  const [status, setStatus] = useState<QuestionStatus>("idle");
  const [text, setTextState] = useState("");
  const [error, setError] = useState("");
  const [pasteError, setPasteError] = useState("");
  const [progress, setProgress] = useState(0);
  const [chipOpen, setChipOpen] = useState(false);
  const requestRef = useRef<AbortController | null>(null);
  const importVersion = useRef(0);

  useEffect(() => () => {
    importVersion.current += 1;
    requestRef.current?.abort();
    setConfirmedQuestion(null);
  }, []);
  useEffect(() => () => { if (screenshot) URL.revokeObjectURL(screenshot.url); }, [screenshot]);

  const read = useCallback(async (source: Screenshot) => {
    requestRef.current?.abort();
    const request = new AbortController();
    requestRef.current = request;
    setConfirmedQuestion(null);
    setStatus("reading");
    setTextState("");
    setError("");
    setProgress(0);
    try {
      const result = await readScreenshot(source, request.signal, setProgress);
      if (request.signal.aborted) return;
      if (result.length > 12000) throw new Error("Too much text. Crop to one question and paste again.");
      setTextState(result);
      setConfirmedQuestion(result || null);
      setStatus("ready");
      if (!result) setError("No text found. Edit to type the question.");
    } catch (failure) {
      if (request.signal.aborted) return;
      setError(failure instanceof Error ? failure.message : "Couldn’t read that image. Try again.");
      setStatus("error");
    }
  }, []);

  const importScreenshot = useCallback(async (file: Blob) => {
    const version = ++importVersion.current;
    setPasteError("");
    try {
      const source = await loadScreenshot(file);
      if (version !== importVersion.current) { URL.revokeObjectURL(source.url); return false; }
      setScreenshot(source);
      setChipOpen(true);
      void read(source);
      return true;
    } catch (failure) {
      if (version === importVersion.current) setPasteError(failure instanceof Error && failure.message ? failure.message : "Couldn’t paste that image.");
      return false;
    }
  }, [read]);

  const setText = useCallback((value: string) => {
    setTextState(value);
    setConfirmedQuestion(value.trim() || null);
  }, []);

  const dismiss = useCallback(() => {
    requestRef.current?.abort();
    setChipOpen(false);
    setConfirmedQuestion(null);
  }, []);

  const removeScreenshot = useCallback(() => {
    requestRef.current?.abort();
    importVersion.current += 1;
    setScreenshot(null);
    setChipOpen(false);
    setStatus("idle");
    setTextState("");
    setError("");
    setConfirmedQuestion(null);
  }, []);

  const retry = useCallback(() => {
    if (screenshot) { setChipOpen(true); void read(screenshot); }
  }, [read, screenshot]);

  return { screenshot, status, text, setText, error, pasteError, setPasteError, progress,
    chipOpen, dismiss, removeScreenshot, importScreenshot, retry };
}
