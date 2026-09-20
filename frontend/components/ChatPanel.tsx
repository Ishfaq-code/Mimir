"use client";

import { useState } from "react";
import type { PracticeProblem } from "@/lib/problems";
import Icon, { MimirMark } from "./Icon";

function ProblemVisual({ problem }: { problem: PracticeProblem }) {
  return <figure className="problem-visual">
    <svg viewBox="0 0 280 164" role="img" aria-label={problem.visualCaption}>
      {problem.visual === "groups" ? <>
        {[28, 88].map(y => <g key={y}><rect className="visual-x" x="28" y={y} width="94" height="40" rx="6"/><text x="75" y={y + 26}>x</text>{[0,1,2].map(i => <g key={i}><rect className="visual-unit" x={138 + i * 38} y={y} width="28" height="40" rx="5"/><text className="unit-label" x={152 + i * 38} y={y + 25}>1</text></g>)}</g>)}
        <path className="visual-line" d="M16 28h-5v100h5"/><text className="visual-caption" x="140" y="151">2 groups of (x + 3)</text>
      </> : problem.visual === "balance" ? <>
        <path className="visual-line" d="M140 42v90m-18 10 18-18 18 18M30 57h220M52 57v43m176-43v43M23 100q29 26 58 0m118 0q29 26 58 0"/>
        <rect className="visual-x" x="19" y="22" width="66" height="30" rx="5"/><text className="unit-label" x="52" y="43">3x + 5</text>
        <rect className="visual-unit" x="207" y="22" width="42" height="30" rx="5"/><text className="unit-label" x="228" y="43">20</text>
      </> : <>
        <path className="visual-line" d="M26 38v-8h228v8"/><text className="visual-caption" x="140" y="22">one whole x</text>
        {[0,1,2,3].map(i=><rect key={i} className={i===0 ? "visual-x" : "visual-unit"} x={26+i*58} y="57" width="52" height="51" rx="5"/>)}
        <text className="visual-caption" x="52" y="136">x ÷ 4</text><path className="visual-line" d="M52 114v8"/>
      </>}
    </svg>
    <figcaption>{problem.visualCaption}</figcaption>
  </figure>;
}

export default function ChatPanel({ problem, onClose }: { problem: PracticeProblem; onClose: () => void }) {
  const [hintCount, setHintCount] = useState(0);
  const [stepCount, setStepCount] = useState(0);
  const [visualOpen, setVisualOpen] = useState(false);

  return <>
    <div className="tutor-heading"><div className="tutor-title"><span className="tutor-mark"><MimirMark /></span><span>Mimir <span className="preview-badge">Problem guide</span></span></div><button className="icon-button" onClick={onClose} aria-label="Close tutor"><Icon name="close" size={18}/></button></div>
    <div className="tutor-body">
      <div className="tutor-intro"><span className="eyebrow">A LITTLE GUIDANCE</span><h2>You’ve got this.<br/>Let’s find a way in.</h2><p>Try it on your own. When you need a nudge, I’m right here.</p></div>
      <div className="tutor-conversation" aria-live="polite" aria-relevant="additions">
        {hintCount === 0 && stepCount === 0 && !visualOpen ? <div className="first-prompt"><span className="small-dot"/><p>What’s the first thing you notice about this equation?</p></div> : null}
        {problem.hints.slice(0,hintCount).map((hint,index)=><div className="hint-message" key={hint}><div className="message-label"><Icon name="bulb" size={15}/>HINT {String(index+1).padStart(2,"0")}</div><p>{hint}</p></div>)}
        {visualOpen ? <div className="visual-message"><div className="message-label"><Icon name="visual" size={15}/>ANOTHER WAY TO SEE IT</div><ProblemVisual problem={problem}/><button className="text-button" onClick={()=>setVisualOpen(false)}>Hide visual</button></div> : null}
        {stepCount > 0 ? <div className="worked-example"><div className="message-label"><Icon name="steps" size={15}/>WORKED EXAMPLE</div><ol>{problem.steps.slice(0,stepCount).map((step,index)=><li key={step.equation}><span className="step-number">{index+1}</span><div><p className="step-equation">{step.equation}</p><p>{step.explanation}</p></div></li>)}</ol>{stepCount < problem.steps.length ? <button className="text-button" onClick={()=>setStepCount(count=>count+1)}>Show the next step <Icon name="chevron" size={14}/></button> : <p className="example-complete"><Icon name="check" size={16}/>Now try the steps in your own handwriting.</p>}</div> : null}
      </div>
      <div className="help-actions"><span className="guide-label">PREPARED HINTS</span>
        <button className="hint-button" disabled={hintCount === problem.hints.length} onClick={()=>setHintCount(count=>Math.min(count+1,problem.hints.length))}><Icon name="bulb" size={18}/><span>{hintCount === 0 ? "Give me a hint" : hintCount < problem.hints.length ? "Give me another hint" : "All hints revealed"}</span><Icon name="chevron" size={16}/></button>
        <button className="help-action" disabled={visualOpen} onClick={()=>setVisualOpen(true)}><Icon name="visual" size={18}/><span>Help me visualize</span><Icon name="chevron" size={15}/></button>
        <button className="help-action" disabled={stepCount > 0} onClick={()=>setStepCount(1)}><Icon name="steps" size={18}/><span>Walk me through it</span><Icon name="chevron" size={15}/></button>
      </div>
    </div>

  </>;
}
