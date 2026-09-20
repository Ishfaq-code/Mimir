# Mimir frontend

The Next.js application for Mimir's handwritten math workspace.

Start with the repository [README](../README.md) for Docker and hot-reload commands. Read [AGENTS.md](AGENTS.md) before changing frontend code.

- [Product requirements](../PRODUCT.md)
- [Design reference](../DESIGN.md)
- [Architecture and current status](../docs/PROJECT_CONTEXT.md)

The active route is `app/page.tsx` → `components/PracticeWorkspace.tsx` → `components/InfiniteCanvas.tsx`. It uses a custom Canvas 2D renderer, not the Excalidraw SDK. The tutor sidebar contains prepared problem guides plus the LiveKit voice control. MyScript conversion lives in `InfiniteCanvas.tsx`; the older `Canvas.tsx`, `LatexPreview.tsx`, and `lib/recognizer.ts` modules remain unused.

Scripts: `npm run dev`, `npm run build`, `npm run start`, and `npm run lint`. The Next.js version is 16.3.5; framework documentation is installed under `node_modules/next/dist/docs/`.
