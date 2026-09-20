---
name: "Mimir"
description: "A screenshot, a canvas, and a tutor."
colors:
  paper: "oklch(98.5% 0.007 100)"
  surface: "oklch(99.4% 0.003 100)"
  surface-soft: "oklch(96.5% 0.009 120)"
  ink: "oklch(27% 0.02 155)"
  muted: "oklch(53% 0.015 155)"
  faint: "oklch(65% 0.015 155)"
  line: "oklch(89% 0.009 130)"
  accent: "oklch(40% 0.079 159)"
  accent-hover: "oklch(34% 0.072 159)"
  accent-soft: "oklch(93% 0.026 155)"
  on-accent: "oklch(98.5% 0.005 155)"
  error: "oklch(48% 0.15 28)"
  paper-dark: "oklch(20% 0.009 155)"
  surface-dark: "oklch(23% 0.01 155)"
  ink-dark: "oklch(93% 0.008 120)"
  accent-dark: "oklch(75% 0.09 155)"
  accent-soft-dark: "oklch(31% 0.035 155)"
typography:
  body:
    fontFamily: "Geist, Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.8
  review-heading:
    fontFamily: "Geist, Arial, sans-serif"
    fontSize: "21px"
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: "-1px"
  control:
    fontFamily: "Geist, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 500
  label:
    fontFamily: "Geist, Arial, sans-serif"
    fontSize: "10px"
    fontWeight: 600
    letterSpacing: ".15em"
rounded:
  tag: "5px"
  control: "8px"
  action: "9px"
  popover: "12px"
  toolbar: "13px"
spacing:
  xs: "6px"
  sm: "12px"
  md: "20px"
  lg: "28px"
  xl: "40px"
components:
  button-voice:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.action}"
    padding: "13px 16px"
  button-confirm:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.control}"
    padding: "13px 15px"
  tool-selected:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
    rounded: "{rounded.control}"
    height: "42px"
  tool-ghost:
    textColor: "{colors.muted}"
    rounded: "{rounded.control}"
    height: "42px"
  drawing-toolbar:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.toolbar}"
    padding: "6px"
---

# Design System: Mimir

## Overview

**Creative North Star: "Room to work"**

A student is at a desk after class, with daylight in the room, an iPad, and a problem they are trying to understand. The default workspace is warm and bright, with a quiet green accent. An explicit dark theme supports a different environment without changing the layout.

The canvas is the main surface. A 64 px header holds only the mark, Paste screenshot, theme, and Tutor controls. The sidebar is initially closed; pasting opens a question review. No preset problem header, slogan, welcome paragraph, or prepared hint menu remains.

**Key Characteristics:**

- Warm paper, a restrained green accent, and a quiet dot grid.
- The pasted question remains in the same world space as the student's ink.
- Inline OCR review and correction before the tutor receives the question.
- A compact drawing toolbar, with no handles after pen strokes.

Updated for screenshot import and question confirmation. Source code is authoritative; generated palette ramps in the sidecar are preview aids, not additional app colors.

## Colors

### Primary

Forest green (`accent`) marks active tools, question confirmation, and live voice. The pale green `accent-soft` surface supports selection. Dark mode uses a lighter green accent with dark text on solid buttons. Hover deepens the light-theme green and brightens it in dark mode.

### Neutral

`paper` is the writing surface; `surface` is the header, tutor column, and toolbar. `surface-soft` holds loading placeholders and quiet hover states. Text uses `ink`, with `muted` and `faint` for supporting copy. Rules and outlines use `line`. All UI neutrals have a small chroma rather than pure black or white.

### Ink

The eight existing ink colors are content choices and retain their literal values. White ink is an explicit user requirement and is the exception to avoiding pure white. Existing strokes are not recolored when a UI accent changes. A theme change adapts the next default pen color; it does not rewrite old ink.

**The Ink Rule.** Keep white available and preserve the student's chosen stroke colors.

## Typography

**Body Font:** Geist, Arial, sans-serif.

**Math Font:** Runtime recognized handwriting and tutor math use KaTeX. Imported question text uses the body font; the original screenshot preserves its own typography. Student handwriting remains geometry.

Review headings use 21 px, corrected question text uses 15–16 px, controls use 12–13 px, and compact status uses 10–11 px. Keep question text below 75ch. The textarea is 16 px to avoid small-input zoom on mobile.

**The Working Surface Rule.** No slogans or decorative instructions. Every visible word must support an action, content review, or recovery.

## Elevation

The header and sidebar are solid, separated by 1 px neutral rules. The floating drawing toolbar and ink popover use a restrained two-part shadow: `0 4px 18px oklch(27% 0.02 155 / .07), 0 1px 3px oklch(27% 0.02 155 / .04)`. There is no decorative glass or backdrop blur.

**The Canvas Rule.** Elevate the controls, not the handwriting. Never frame completed pen strokes with selection boxes.

## Components

### App shell and question review

The header is 64 px at every size. The canvas initially fills the workspace. The optional tutor column is 350 px, 330 px on smaller wide screens, and 380 px above 1400 px. Below 1000 px it overlays the workspace; below 600 px it fills the workspace width. Covered canvas controls are inert. Escape or Close returns focus to Tutor.

Pasting an image opens the review panel with a short loading status, skeleton lines, and progress. The result asks “Is this right?”, shows an editable textarea, and provides Confirm question and Read again. Empty text cannot be confirmed. A small screenshot preview in narrow layouts keeps the original visible while editing. Completion focuses the review heading rather than automatically opening the iPad keyboard.

Confirmed text replaces the review form and supplies the reviewed question to the voice tutor. The floating Tutor island opens the panel and reveals the voice control even before a question is pasted. Edit returns to review and ends voice. Screenshot/read errors give a specific recovery action. No modal interrupts writing.

### Canvas and drawing toolbar

The existing Canvas 2D renderer paints a 20-world-unit grid. The single “Paste a screenshot” affordance disappears after ink or an image is added. The toolbar sits 64 px above the canvas bottom, with zoom/navigation in a separate footer. ResizeObserver maintains the backing store as available width changes.

Pen, Eraser, and Text are the exposed tools. Text mode supports tap-to-create and tap-to-edit, Done/Enter to save, Shift+Enter for a new line, and Escape/Cancel to discard edits. Text uses the selected ink color and participates in undo/redo and erasing. Finger taps create text in Text mode; finger navigation remains available with the other tools. Buttons are 42 px high (40 px minimum width on phones); the selected tool uses pale green. Ink options open in an anchored 320 px popover (300 px on phones), close outside or with Escape, and retain all eight colors and three widths. Undo/redo buttons show disabled state when unavailable.

### Voice and recognition

Voice lives in the sidebar footer, with a status label, Talk/End button, pending state, and recoverable error. The small waveform animates only while speaking. The Tutor island floats at the side of the canvas and opens the panel before or after question confirmation. Closing the sidebar retains a voice session; editing or replacing a question ends it. Confirmed text is optional context, not a prerequisite for starting voice.

The Typeset math switch remains on the canvas. Recognition failures preserve ink and expose a retry action. Recognized math and tutor annotations remain aligned with world coordinates. Provider configuration is required for voice and stroke conversion. Screenshot OCR is local and needs no provider credentials.

### Interaction and accessibility

Controls have names and visible keyboard focus. Ink/width selections use pressed states; the Tutor toggle has expanded state; recognition is a labeled switch. Decorative icons are hidden from assistive technology. Motion uses brief opacity/transform transitions with ease-out. Reduced-motion preference disables animations and transitions. Physical Pencil behavior and a formal accessibility conformance target remain unverified.

## Do's and Don'ts

### Do:

- Do keep the canvas dominant and the pen active after each stroke.
- Do use the same green action vocabulary throughout the interface.
- Do preserve the voice, recognition, and tutor-annotation integrations.
- Do require confirmation before publishing screenshot text as tutor context.
- Do check both themes, narrow layouts, and the actual iPad for relevant changes.

### Don't:

- Don't introduce **Selection boxes after every stroke.**
- Don't substitute **Typed math as the primary student input.**
- Don't default to **Unrequested full solutions.** Reveal support when requested.
- Don't prioritize **Teacher dashboards before the core tutor works.**
- Don't add decorative gradients, glass panels, repeated card grids, or filler copy.
- Don't claim a provider or hardware test passed from frontend-only checks.
