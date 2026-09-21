"use client";

import { updatePreferences, useLearningPreferences } from "@/lib/tutor/support";
import Icon from "./Icon";

export default function WritingModeSwitch() {
  const { aiWrites } = useLearningPreferences();
  return <div className="writing-mode" role="group" aria-label="Writing mode">
    <label title="You write. Mimir guides you and writes only when asked.">
      <input type="radio" name="writing-mode" value="student" checked={!aiWrites} onChange={() => updatePreferences({ aiWrites: false })}/>
      <span><Icon name="pen" size={15}/>I write</span>
    </label>
    <label title="Mimir writes each step. You answer the questions.">
      <input type="radio" name="writing-mode" value="ai" checked={aiWrites} onChange={() => updatePreferences({ aiWrites: true })}/>
      <span><Icon name="steps" size={15}/>AI writes</span>
    </label>
  </div>;
}
