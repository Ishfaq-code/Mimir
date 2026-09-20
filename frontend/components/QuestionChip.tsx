"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import Icon from "./Icon";
import type { QuestionStatus } from "@/lib/useScreenshotQuestion";

interface QuestionChipProps {
  status: QuestionStatus;
  text: string;
  error: string;
  progress: number;
  onSetText: (value: string) => void;
  onRetry: () => void;
  onDismiss: () => void;
}

/** Floating chip for the pasted question. Shows the OCR result, offers a
 * quick edit, and never blocks the conversation — edits update tutor
 * context live. */
export default function QuestionChip({ status, text, error, progress, onSetText, onRetry, onDismiss }: QuestionChipProps) {
  const [editing, setEditing] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (editing) {
      const editor = editorRef.current;
      if (editor) {
        editor.focus();
        editor.setSelectionRange(editor.value.length, editor.value.length);
      }
    }
  }, [editing]);

  return (
    <motion.div
      className={`question-chip chip-${status}`}
      role="region"
      aria-label="Pasted question"
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.96 }}
      animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.97 }}
      transition={reduced ? { duration: 0 } : { duration: 0.28, ease: "easeOut" }}
      onKeyDown={event => {
        if (event.key === "Escape") {
          event.stopPropagation();
          if (editing) setEditing(false);
          else onDismiss();
        }
      }}
    >
      <button type="button" className="icon-button chip-dismiss" onClick={onDismiss} aria-label="Dismiss question"><Icon name="close" size={15}/></button>
      {status === "reading" && (
        <div className="chip-reading" role="status">
          <span className="chip-title">Reading screenshot…</span>
          <progress max={1} value={progress || undefined} aria-label="Reading screenshot"/>
        </div>
      )}
      {status !== "reading" && !editing && (
        <>
          <span className="chip-title">
            {status === "error" ? "Couldn’t read that screenshot" : "Question for Mimir"}
          </span>
          {text && <p className="chip-text">{text}</p>}
          {!text && error && <p className={status === "error" ? "chip-error" : "chip-note"}>{error}</p>}
          <div className="chip-actions">
            <button type="button" className="chip-action" onClick={() => setEditing(true)}>{text ? "Edit" : "Type question"}</button>
            {status === "error" && <button type="button" className="chip-action" onClick={onRetry}>Read again</button>}
          </div>
        </>
      )}
      {editing && (
        <div className="chip-editor">
          <label htmlFor="chip-question-text" className="chip-note">Question text — edits update the tutor instantly.</label>
          <textarea
            id="chip-question-text"
            ref={editorRef}
            aria-label="Question text"
            value={text}
            onChange={event => onSetText(event.target.value)}
            maxLength={12000}
            rows={5}
            spellCheck={false}
          />
          <div className="chip-actions">
            <button type="button" className="chip-action chip-done" onClick={() => setEditing(false)}>Done</button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
