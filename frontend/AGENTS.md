<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Mimir project references

Read the repository's [working instructions](../AGENTS.md), [product requirements](../PRODUCT.md), [design reference](../DESIGN.md), and [implementation context](../docs/PROJECT_CONTEXT.md) before making changes. The active page uses `components/InfiniteCanvas.tsx`; `components/Canvas.tsx`, `lib/recognizer.ts`, and `components/LatexPreview.tsx` are disconnected scaffolding. The active MyScript pipeline is inside `InfiniteCanvas.tsx`; LiveKit uses `VoiceTutor.tsx`.

For Impeccable, run its context loader from the repository root, not this directory, so it finds `PRODUCT.md` and `DESIGN.md`.
