# Voice latency and partial highlighting — 2026-09-20

Investigation of the handwritten `5(2 + 2) =` report. No runtime behavior was changed during this investigation. The baseline is `tutor/refinements` at `37e202e` plus the existing uncommitted checked-teaching implementation.

The follow-up implementation is now recorded in [project context](PROJECT_CONTEXT.md#prepared-hints-and-exact-speech-2026-09-20). Measurements below describe the earlier baseline.

## Confirmed response bottleneck

The earlier committed agent let Realtime own the audio conversation. The current agent disables automatic responses, waits for a **final transcript** in `agent/main.py`, then serially awaits a fresh board capture, a separate Responses API vision/reasoning request, annotation application, and Realtime speech generation in `agent/tutor.py`.

The newly mandatory model request, not the color rendering, is the largest measured delay. The planner uses `gpt-5.4-mini`/low, a high-detail JPEG, a structured teaching plan, and no automatic retries. Exact arithmetic validation runs locally after that request; the logged check time is overwhelmingly the model request, not the local arithmetic.

The recent user-room turn at 15:26:52 logged capture 0.25s, checking 3.81s, annotation application 0.09s, and voice startup 0.53s: **4.67s after final transcript**, not after the student stopped speaking. Previous first-speech logs excluded end-of-turn detection, transcription, and client audio delivery. Consequently those logs cannot reconstruct every second of the reported 10-second wait.

## Bounded live reproduction

A separate LiveKit room published synthesized “What do I do first?” as a microphone track and supplied the user's screenshot with reconstructed region labels. The running worker used its normal capture, planner and voice code. The RPC receiver recorded the requested annotation without changing the user's actual canvas. This is not a physical microphone/iPad or browser rendering test.

| Stage | Seconds |
| --- | ---: |
| End of injected utterance to final-transcript turn start | approximately 1.36 |
| Board/context capture | 0.20 |
| Separate vision/reasoning request and validation | 2.64 |
| Annotation RPC | 0.08 |
| Realtime speech startup | 0.45 |
| Agent speaking state to received non-silent audio | 0.27 |
| Total, utterance end to received audio | **5.00** |

The reply was “Start inside the parentheses: what is 2 + 2?” but requested **no highlight regions**. The room disconnected after completion.

Separate single-call tests of the same screenshot took **6.90s** using reconstructed current grouping and **4.34s** with individually separated ink components. These are single samples, not a performance comparison between grouping methods or a latency guarantee. Together with the live test, they demonstrate variable planner latency; they do not recreate the original 10-second event exactly.

## Confirmed highlight defects

1. `frontend/lib/canvas/capture.ts:inkRegions` merges strokes when their bounding rectangles overlap or are within seven world units. It does not test whether the actual ink touches. Reconstructing ink components from the attached screenshot reproduces a merged left parenthesis/first `2` and a merged second `2`/right parenthesis. The `+` remains its own region. This reproduction uses image components, not the unavailable original vector stroke data.
2. `TeachingPlan.highlight_region_ids` has no requirement to cover the complete operation named in speech. The prompt does not require both operands plus the operator. Validation only checks that selected IDs exist and belong to the chosen problem.
3. The frontend recolors exactly the returned regions. It does not resolve “2 + 2” to a complete set of strokes. In the screenshot test, the planner selected the left merged region plus the `+`, omitting the right `2`; another run selected nothing. This reproduces incomplete/inconsistent selection, though not the exact original plus-only selection (its region IDs were not logged).

Separating rectangles alone is insufficient: selection instructions and stroke-level targeting also need correction. Rendering should retain the selected stroke IDs so overlapping rectangles do not recolor unrelated neighboring strokes.

## Recommended implementation direction

- Prepare a versioned board interpretation and checked next step after handwriting settles, reuse it while the source content remains unchanged, and invalidate it on edits or focus changes. This moves repeated full-board vision work out of the ordinary conversation response path. New/ambiguous math still requires verification.
- Group by actual stroke proximity, retain stroke IDs, and require highlights to include the complete subexpression the tutor asks about. For this example: both `2`s and `+`, followed by “What is two plus two?”
- Correlate speech-end, final transcript, model start/end, cancellation, annotation and received-audio timestamps. Existing post-transcript timing should not be presented as the user's entire wait.

Relevant code: [turn gate](../agent/main.py), [serial teaching pipeline](../agent/tutor.py), [planner](../agent/planner.py), [ink grouping](../frontend/lib/canvas/capture.ts), [region validation](../frontend/lib/tutor/boardView.ts), [color rendering](../frontend/lib/canvas/renderer.ts). The earlier default conversation behavior is consistent with [OpenAI's Realtime conversation flow](https://developers.openai.com/api/docs/guides/realtime-conversations).
