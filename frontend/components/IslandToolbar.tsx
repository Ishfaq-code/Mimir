"use client";

import type { Tool } from "@/lib/canvas/types";
import type { ReactNode } from "react";

interface IslandToolbarProps {
  tool: Tool;
  onToolChange: (tool: Tool) => void;
}

interface ToolDef {
  id: Tool;
  label: string;
  shortcut: string;
  icon: ReactNode;
}

const sz = 18;

/* Simple SVG icons — small, recognisable, no dependencies. */

const tools: ToolDef[] = [
  {
    id: "hand",
    label: "Hand",
    shortcut: "H",
    icon: (
      <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 11V6a1 1 0 10-2 0v5M14 10V4a1 1 0 10-2 0v6M10 9.5V5a1 1 0 10-2 0v9" />
        <path d="M18 11a2 2 0 014 0v3a8 8 0 01-8 8h-1a8 8 0 01-8-8V8a1 1 0 112 0" />
      </svg>
    ),
  },
  {
    id: "select",
    label: "Select",
    shortcut: "V",
    icon: (
      <svg width={sz} height={sz} viewBox="0 0 24 24" fill="currentColor" stroke="none">
        <path d="M5.5 3.21V20.8l4.86-5.23h6.78L5.5 3.21z" />
      </svg>
    ),
  },
  {
    id: "freedraw",
    label: "Pencil",
    shortcut: "P",
    icon: (
      <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 21c1.5-3.5 5-8 9-10s7 1 5 4-6 5-9 3" />
      </svg>
    ),
  },
  {
    id: "eraser",
    label: "Eraser",
    shortcut: "E",
    icon: (
      <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 20H7.5l-4.21-4.3a1 1 0 010-1.41L15 2.7a1 1 0 011.41 0L21.7 8a1 1 0 010 1.41L11 20" />
        <line x1="18" y1="13" x2="11" y2="6" />
      </svg>
    ),
  },
];

export default function IslandToolbar({ tool, onToolChange }: IslandToolbarProps) {
  return (
    <div className="pointer-events-auto flex items-center gap-0.5 rounded-xl bg-white p-1 shadow-lg ring-1 ring-black/[.06] dark:bg-zinc-800 dark:ring-white/10">
      {tools.map((t) => (
          <button
            key={t.id}
            type="button"
            title={`${t.label} — ${t.shortcut}`}
            onClick={() => onToolChange(t.id)}
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
              tool === t.id
                ? "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300"
                : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-700"
            }`}
          >
            {t.icon}
          </button>
        ),
      )}
    </div>
  );
}
