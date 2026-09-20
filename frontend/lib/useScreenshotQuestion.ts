"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadScreenshot, readScreenshot, type Screenshot } from "./screenshot";
import { setConfirmedQuestion } from "./tutor/store";

export type QuestionPhase = "empty" | "reading" | "review" | "confirmed";

export function useScreenshotQuestion() {
  const [screenshot, setScreenshot] = useState<Screenshot | null>(null);
  const [phase, setPhase] = useState<QuestionPhase>("empty");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [pasteError, setPasteError] = useState("");
  const [progress, setProgress] = useState(0);
  const [voiceSession, setVoiceSession] = useState(0);
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
    setPhase("reading");
    setText("");
    setError("");
    setProgress(0);
    try {
      const result = await readScreenshot(source, request.signal, setProgress);
      if (request.signal.aborted) return;
      if (result.length > 12000) throw new Error("Too much text. Crop to one question and paste again.");
      setText(result);
      if (!result) setError("No text found. Try a clearer screenshot or enter the question below.");
    } catch (failure) {
      if (request.signal.aborted) return;
      setError(failure instanceof Error ? failure.message : "Couldn’t read that image. Try again.");
    } finally {
      if (!request.signal.aborted) setPhase("review");
    }
  }, []);

  const importScreenshot = useCallback(async (file: Blob) => {
    const version = ++importVersion.current;
    setPasteError("");
    try {
      const source = await loadScreenshot(file);
      if (version !== importVersion.current) { URL.revokeObjectURL(source.url); return false; }
      setScreenshot(source);
      setVoiceSession(value => value + 1);
      void read(source);
      return true;
    } catch (failure) {
      if (version === importVersion.current) setPasteError(failure instanceof Error ? failure.message : "Couldn’t paste that image.");
      return false;
    }
  }, [read]);

  const edit = () => {
    requestRef.current?.abort();
    setConfirmedQuestion(null);
    setVoiceSession(value => value + 1);
    setPhase("review");
  };
  const confirm = () => {
    const question = text.trim();
    if (!question) return false;
    setText(question);
    setConfirmedQuestion(question);
    setError("");
    setPhase("confirmed");
    return true;
  };

  return { screenshot, phase, text, setText, error, pasteError, setPasteError, progress, voiceSession,
    importScreenshot, edit, confirm, retry: () => { if (screenshot) void read(screenshot); } };
}
