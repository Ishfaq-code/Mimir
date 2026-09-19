"use client";

// Renders a LaTeX string as typeset math using KaTeX (fast, synchronous —
// good for a live preview that re-renders on every pause).

import { useMemo } from "react";
import katex from "katex";

interface LatexPreviewProps {
  latex: string;
  loading?: boolean;
}

export default function LatexPreview({ latex, loading }: LatexPreviewProps) {
  const rendered = useMemo(() => {
    if (!latex) return null;
    try {
      return {
        html: katex.renderToString(latex, {
          displayMode: true,
          throwOnError: false,
          output: "html",
        }),
        error: false,
      };
    } catch {
      return { html: "", error: true };
    }
  }, [latex]);

  return (
    <div className="flex min-h-24 flex-col gap-2">
      <div className="flex min-h-16 items-center justify-center overflow-x-auto rounded-lg bg-white px-4 py-3 dark:bg-zinc-900">
        {rendered && !rendered.error ? (
          <span dangerouslySetInnerHTML={{ __html: rendered.html }} />
        ) : rendered?.error ? (
          <span className="text-sm text-red-500">Could not render LaTeX</span>
        ) : (
          <span className="text-sm text-zinc-400 dark:text-zinc-600">
            {loading ? "Recognizing…" : "Preview will appear here"}
          </span>
        )}
      </div>
      {latex && (
        <code className="block overflow-x-auto rounded bg-black/[.05] px-3 py-2 font-mono text-xs text-zinc-600 dark:bg-white/[.06] dark:text-zinc-400">
          {latex}
        </code>
      )}
    </div>
  );
}
