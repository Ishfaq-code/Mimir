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

The canvas is the main surface. A 64 px header holds only the mark, Paste screenshot, and theme controls. A single Mimir orb floats at the right edge of the workspace; pressing it starts and ends the voice session, and a screen-edge aura is present while the tutor is live. There is no sidebar. No preset problem header, slogan, welcome paragraph, or prepared hint menu remains.

**Key Characteristics:**

- Warm paper, a restrained green accent, and a quiet dot grid.
- The pasted question remains in the same world space as the student's ink.
- A passive question chip shows the read text with tap-to-edit; edits update tutor context immediately.
- A compact drawing toolbar, with no handles after pen strokes.

Updated for screenshot import and question confirmation. Source code is authoritative; generated palette ramps in the sidecar are preview aids, not additional app colors.

## Colors

### Primary

Forest green (`accent`) marks active tools and question actions. Live voice uses the orb’s cyan, violet, and pink palette. The pale green `accent-soft` surface supports selection. Dark mode uses a lighter green accent with dark text on solid buttons. Hover deepens the light-theme green and brightens it in dark mode.

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

The header and sidebar are solid, separated by 1 px neutral rules. The floating drawing toolbar and ink popover use a restrained two-part shadow: `0 4px 18px oklch(27% 0.02 155 / .07), 0 1px 3px oklch(27% 0.02 155 / .04)`. Workspace panels do not use decorative glass or backdrop blur; the Mimir orb is the intentional exception.

**The Canvas Rule.** Elevate the controls, not the handwriting. Never frame completed pen strokes with selection boxes.

## Components

### App shell and question chip

The header is 64 px at every size. The canvas fills the workspace below it; there is no sidebar or panel. The Mimir orb floats at the right edge, vertically centered (64 px, 52 px on phones).

Pasting an image lands it on the canvas and opens a floating question chip below the orb (300 px wide, narrower on phones). While reading, the chip shows a short status and progress. The read text appears with an Edit action; edits in the chip's textarea update tutor context immediately — there is no separate confirm step. Empty reads and failures show a specific recovery action (type the question, read again). The chip is dismissible; dismissing removes the question from tutor context while the image stays on the canvas. Replacing a screenshot reopens the chip for the new image and preserves existing ink. No modal interrupts writing.

### Canvas and drawing toolbar

The existing Canvas 2D renderer paints a 20-world-unit grid. The single “Paste a screenshot” affordance disappears after ink or an image is added. The toolbar sits 64 px above the canvas bottom, with zoom/navigation in a separate footer. ResizeObserver maintains the backing store as available width changes.

Select, Pen, Eraser, and Text are the exposed tools. Select supports click/Shift-click selection, marquee selection, multi-element movement, and corner resizing; the pasted screenshot is selectable and transformable as well. Text mode supports tap-to-create and tap-to-edit, Done/Enter to save, Shift+Enter for a new line, and Escape/Cancel to discard edits. Text uses the selected ink color and participates in undo/redo and erasing. Finger taps create text in Text mode; finger navigation remains available with the other tools. Buttons are 42 px high (40 px minimum width on phones); the selected tool uses pale green. Ink options open in an anchored 320 px popover (300 px on phones), close outside or with Escape, and retain all eight colors and three widths. Undo/redo buttons show disabled state when unavailable.

### Kinematics visualization

Paste plain text onto the canvas, select its textbox, and click Visualize to open the kinematics modal. Pasted text wraps to the viewport and participates in undo/redo; Select becomes active without automatically selecting the textbox. A selected screenshot uses its confirmed question. With no valid selection, the modal explains the paste/select action; it never generates a replacement question. Premade demo questions live in [docs/DEMO_PROBLEMS.md](docs/DEMO_PROBLEMS.md). Every selected problem is interpreted through the API, using the examples as guidance. The object label follows the problem. Unsupported problems explain what to clarify; provider failures offer retry. The compact modal header shows the full question beside Close, with scroll access for long questions; there is no eyebrow, extra title, or scope paragraph. The dialog retains an accessible name. An unboxed four-column readout names Time, Distance, Speed, and Acceleration, with tabular values and quieter units. The animation uses a tighter horizontal viewport and a separate vertical viewport for falling motion. Inherit the existing paper, green accent, Geist typography, and light/dark themes.

Results autoplay over eight seconds with smooth interpolation between validated frames. Grouped SVG Backward, Play/Pause, and Forward controls sit above the timeline with at least 44 px targets. Show elapsed and total simulated time instead of a percentage. Stepping or seeking pauses playback, and Play at the end restarts. Narrow layouts retain all four values and transport controls. Loading, retry, and empty-selection guidance remain. The modal retains cancellation, focus restoration, and an inert background.

### Voice and recognition

The orb follows the supplied Siri reference: a deep violet glass sphere, a fine luminous rim, overlapping cyan/violet/pink light ribbons, and a white luminous center. CSS animates the interior with state-dependent pacing; reduced motion keeps it static. It remains 64 px on desktop and 52 px on phones.

Pressing the orb connects the voice session (mic permission on first press); pressing again ends it. The orb's motion encodes state — breathing while listening, a quick pulse while thinking, ripple rings while speaking — and a state-reactive aura glows around the screen edges while the session is live: cyan on the left, pink on the right, and violet along the top and bottom. A minimal status label sits under the orb, and recoverable errors (denied mic, unavailable voice) show there. The first-run "Talk to Mimir" hint fades after the first connection. Chip text is optional context, not a prerequisite for starting voice; chip edits and screenshot replacement keep the session alive because the tutor pulls context live. The `motion` library drives the outer pulse and aura animations, and `prefers-reduced-motion` swaps them for static states.

The Typeset math switch remains on the canvas. Recognition failures preserve ink and expose a retry action. Recognized math and tutor annotations remain aligned with world coordinates. Provider configuration is required for voice and stroke conversion. Screenshot OCR is local and needs no provider credentials.

### Interaction and accessibility

Controls have names and visible keyboard focus. Ink/width selections use pressed states; the Mimir orb has a pressed state and a live status region; recognition is a labeled switch. Decorative icons are hidden from assistive technology. Orb and aura motion uses the `motion` library with ease-out pacing. Reduced-motion preference replaces them with static states and disables CSS transitions. Physical Pencil behavior and a formal accessibility conformance target remain unverified.

## Do's and Don'ts

### Do:

- Do keep the canvas dominant and the pen active after each stroke.
- Do use the same green action vocabulary throughout the interface.
- Do preserve the voice, recognition, and tutor-annotation integrations.
- Do show pasted question text in the chip and update tutor context from live edits.
- Do check both themes, narrow layouts, and the actual iPad for relevant changes.

### Don't:

- Don't introduce **Selection boxes after every stroke.**
- Don't substitute **Typed math as the primary student input.**
- Don't default to **Unrequested full solutions.** Reveal support when requested.
- Don't prioritize **Teacher dashboards before the core tutor works.**
- Don't add decorative gradients outside the orb, glass panels, repeated card grids, or filler copy.
- Don't claim a provider or hardware test passed from frontend-only checks.


## Inline learning support (2026-09-20)

Learning tools lives in a header popover with native checkboxes and keyboard dismissal. The canvas keeps its full width. During a conversation, a compact caption dock sits above the drawing toolbar; full history and a text composer expand on request. It shows the latest Mimir turn by default. Quick-action transcripts use the visible action name, not internal prompting text. The question chip moves to the upper right while this dock is open.

Tutor emphasis temporarily paints the selected ink/text/screenshot symbols purple, with a quiet underline as a second cue. It has a dismiss control and expires after nine seconds. Original ink styles and image pixels remain unchanged; the tint is only a rendering layer. Pan and zoom move this layer with the board; edits invalidate stale targets. The model sees numbered stroke/symbol regions only inside its private snapshot, not on the student's working surface.

Larger reading text is 20 px; extra spacing uses 1.9 line height and small letter/word spacing. Calm motion disables decorative motion and the aura. System reduced-motion remains honored. No special font or diagnosis label is imposed.

A small **Focus a problem** control below the top line lets students drag a working area. A quiet dashed outline marks that area; the tutor sees its crop. **Checking your work…** appears in the existing caption dock while vision/reasoning runs. Next-step notation uses one empty handwriting space and a remove button, on the existing canvas without a sidebar.
