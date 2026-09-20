"use client";
import { useEffect, useRef } from "react";
import { updatePreferences, useLearningPreferences, type LearningPreferences } from "@/lib/tutor/support";
import Icon from "./Icon";

const options: [keyof LearningPreferences, string][] = [
  ["captions", "Live captions"], ["oneStep", "One step at a time"],
  ["shortReplies", "Short explanations"], ["slowerVoice", "Slower speech"],
  ["largeText", "Larger reading text"], ["roomyText", "More text spacing"],
  ["calm", "Calm motion"], ["highlights", "Color key expressions"],
];
export default function LearningControls() {
  const preferences = useLearningPreferences();
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !ref.current?.contains(event.target)) ref.current?.removeAttribute("open"); };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && ref.current?.open) { ref.current.open = false; ref.current.querySelector("summary")?.focus(); }
    };
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, []);
  return <details className="learning-controls" ref={ref}>
    <summary aria-label="Learning and accessibility settings"><Icon name="tune" size={18}/><span>Learning tools</span></summary>
    <div className="learning-popover" role="group" aria-label="Learning preferences">
      <div className="learning-heading">Learning preferences</div>
      {options.map(([key, label]) => <label className="learning-option" key={key}>
        <span>{label}</span><input type="checkbox" aria-label={label} checked={preferences[key]} onChange={event => updatePreferences({ [key]: event.target.checked })}/>
      </label>)}
    </div>
  </details>;
}
