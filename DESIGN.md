---
name: "Mimir"
description: "A quiet workspace for handwritten math and a tutor beside you."
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
  tutor-heading:
    fontFamily: "Geist, Arial, sans-serif"
    fontSize: "25px"
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: "-1px"
  problem:
    fontFamily: "Georgia, Times New Roman, serif"
    fontSize: "33px"
    fontWeight: 400
    lineHeight: 1.25
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
  button-hint:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
    rounded: "{rounded.control}"
    padding: "12px"
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
  problem-tag:
    textColor: "{colors.muted}"
    rounded: "{rounded.tag}"
    padding: "5px 9px"
---

# Design System: Mimir

## Overview

**Creative North Star: "Room to work"**

A student is at a desk after class, with daylight in the room, an iPad, and a problem they are trying to understand. The default workspace is warm and bright, with a quiet green accent. An explicit dark theme supports a different environment without changing the layout.

The canvas is the main surface. A compact header establishes the problem; the tutor occupies a separate right column on wide screens and an optional overlay on small screens. This is product UI, not a marketing page. The visual hierarchy gives writing room while making the next useful action easy to find.

**Key Characteristics:**

- Warm paper, green controls, and an unobtrusive dot grid.
- A fixed problem header above an unrestricted writing surface.
- A compact bottom toolbar with comfortable drawing controls.
- A tutor sidebar that separates prepared guidance from live voice.

Updated after the frontend revamp on 2026-09-19, based on `app/globals.css` and the rendered app. Frontmatter captures the light-theme baseline plus explicit dark counterparts. Application source remains authoritative. The sidecar's generated palette ramps are preview aids, not additional app colors.

## Colors

### Primary

Forest green (`accent`) marks active tools, the hint action, and live voice. The pale green `accent-soft` surface supports selection. Dark mode uses a lighter green accent with dark text on solid buttons. Hover deepens the light-theme green and brightens it in dark mode.

### Neutral

`paper` is the writing surface; `surface` is the header, tutor column, and toolbar. `surface-soft` holds visual examples and quiet hover states. Text uses `ink`, with `muted` and `faint` for supporting copy. Rules and outlines use `line`. All UI neutrals have a small chroma rather than pure black or white.

### Ink

The eight existing ink colors are content choices and retain their literal values. White ink is an explicit user requirement and is the exception to avoiding pure white. Existing strokes are not recolored when a UI accent changes. A theme change adapts the next default pen color; it does not rewrite old ink.

**The Ink Rule.** Keep white available and preserve the student's chosen stroke colors.

## Typography

**Body Font:** Geist, Arial, sans-serif.

**Math Font:** Georgia, Times New Roman, serif for the printed problem and prepared worked examples. Runtime recognized/tutor math uses KaTeX. Student handwriting remains geometry.

Body UI uses a fixed scale: problem math 33 px, introductory tutor heading 25 px, guide copy 13 px, controls 12–13 px, and supporting labels 9–11 px. The wordmark is 25 px with tight tracking. Mobile uses 29 px problem math and an 18 px empty-state heading. Body copy stays well below 65 characters per line in the tutor column.

**The Working Surface Rule.** Use display scale only for the current equation and the short tutor introduction. Keep the remaining UI compact.

## Elevation

The header and sidebar are solid, separated by 1 px neutral rules. The floating drawing toolbar and ink popover use a restrained two-part shadow: `0 4px 18px oklch(27% 0.02 155 / .07), 0 1px 3px oklch(27% 0.02 155 / .04)`. There is no decorative glass or backdrop blur.

**The Canvas Rule.** Elevate the controls, not the handwriting. Never frame completed pen strokes with selection boxes.

## Components

### App shell and problem

A 76 px header contains the mark, practice label, theme control, and Tutor toggle. It becomes 64 px on phones. The main layout reserves 350 px for the tutor, 310 px on smaller wide screens, and 380 px above 1400 px. Below 1000 px the tutor is closed by default and opens as an overlay; below 600 px that overlay occupies the workspace width. Covered workspace controls become inert. Escape or Close returns focus to the Tutor toggle.

The problem block uses 28–40 px spacing and a thin bottom rule. Navigation has previous/next controls and a true three-problem count. Printed equations are prompts; student work remains entirely freehand.

### Canvas and drawing toolbar

The existing Canvas 2D renderer paints a 20-world-unit grid. The empty state disappears after ink is added. The toolbar sits 64 px above the canvas bottom, with zoom/navigation in a separate footer. ResizeObserver maintains the backing store as available width changes.

Pen and Eraser are the only drawing tools. Buttons are 42 px high (40 px minimum width on phones); the selected tool uses pale green. Ink options open in an anchored 320 px popover (300 px on phones), close outside or with Escape, and retain all eight colors and three widths. Undo/redo buttons show disabled state when unavailable.

### Tutor guide

The sidebar uses sections and fine separators, not nested cards. Prepared hints are explicitly labeled. “Help me visualize” reveals a diagram; “Walk me through it” reveals one worked step at a time. Visuals use green x-tiles, neutral unit tiles, thin diagram lines, and explanatory captions. Hints and examples are local problem content, not claims that the canvas was analyzed.

### Voice and recognition

Voice lives in the sidebar footer, with a status label, Talk/End button, pending state, and recoverable error. The small waveform animates only while speaking. Closing the sidebar retains a voice session; switching problems ends it.

The Typeset math switch remains on the canvas. Recognition failures preserve ink and expose a retry action. Recognized math and tutor annotations remain aligned with world coordinates. Provider configuration is required for both live capabilities.

### Interaction and accessibility

Controls have names and visible keyboard focus. Ink/width selections use pressed states; the Tutor toggle has expanded state; recognition is a labeled switch. Decorative icons are hidden from assistive technology. Motion uses brief opacity/transform transitions with ease-out. Reduced-motion preference disables animations and transitions. Physical Pencil behavior and a formal accessibility conformance target remain unverified.

## Do's and Don'ts

### Do:

- Do keep the canvas dominant and the pen active after each stroke.
- Do use the same green action vocabulary throughout the interface.
- Do preserve the voice, recognition, and tutor-annotation integrations.
- Do label prepared guidance separately from live tutor behavior.
- Do check both themes, narrow layouts, and the actual iPad for relevant changes.

### Don't:

- Don't introduce **Selection boxes after every stroke.**
- Don't substitute **Typed math as the primary student input.**
- Don't default to **Unrequested full solutions.** Reveal support when requested.
- Don't prioritize **Teacher dashboards before the core tutor works.**
- Don't add decorative gradients, glass panels, or repeated card grids.
- Don't claim a provider or hardware test passed from frontend-only checks.
