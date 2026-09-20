import type { CSSProperties } from "react";

const paths = {
  tune: <><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2" fill="var(--surface)"/><circle cx="16" cy="12" r="2" fill="var(--surface)"/><circle cx="10" cy="18" r="2" fill="var(--surface)"/></>,
  volume: <><path d="m11 4-5 4H3v8h3l5 4V4Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></>,
  pause: <><path d="M8 4v16M16 4v16" strokeWidth="3"/></>,
  play: <path d="m8 4 12 8-12 8V4Z"/>,
  micOff: <><path d="m3 3 18 18M9 9v3a3 3 0 0 0 5 2M9 5a3 3 0 0 1 6 0v5M5 10v2a7 7 0 0 0 12 5M12 19v3m-4 0h8"/></>,
  arrowUp: <path d="M12 20V4m-6 6 6-6 6 6"/>,
  text: <><path d="M4 6V3h16v3M12 3v18m-4 0h8"/></>,
  select: <><path d="m5 3 5.5 14 2.5-5 5-2.5L5 3Z"/><path d="m13 14 4 5"/></>,
  clipboard: <><rect x="5" y="5" width="14" height="16" rx="2"/><rect x="9" y="2" width="6" height="5" rx="1"/><path d="M9 12h6m-6 4h4"/></>,
  pen: <><path d="m4 20 4-1 12-12a2.1 2.1 0 0 0-3-3L5 16l-1 4Z"/><path d="m14 7 3 3M4 20h6"/></>,
  eraser: <><path d="m8 20-5-5a2 2 0 0 1 0-3l10-9a2 2 0 0 1 3 0l5 5a2 2 0 0 1 0 3l-9 9H8Z"/><path d="m8 8 9 9M12 20h9"/></>,
  undo: <><path d="m8 4-5 5 5 5"/><path d="M3 9h10a7 7 0 0 1 7 7v3"/></>,
  redo: <><path d="m16 4 5 5-5 5"/><path d="M21 9H11a7 7 0 0 0-7 7v3"/></>,
  chevron: <path d="m8 5 7 7-7 7"/>,
  down: <path d="m6 9 6 6 6-6"/>,
  close: <path d="m6 6 12 12M6 18 18 6"/>,
  sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></>,
  moon: <path d="M20.5 14a8.5 8.5 0 0 1-10.5-10.5A8.5 8.5 0 1 0 20.5 14Z"/>,
  book: <><path d="M12 5v15M12 5C8 2 4 3 2 4v15c4-2 7-1 10 1 3-2 6-3 10-1V4c-2-1-6-2-10 1Z"/></>,
  tutor: <><path d="M5 18 2 21V6a3 3 0 0 1 3-3h14a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H5Z"/><path d="M8 9h8M8 13h5"/></>,
  bulb: <><path d="M9 18h6m-5 3h4M8 14a6 6 0 1 1 8 0c-1 1-1 2-1 2H9s0-1-1-2Z"/></>,
  visual: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M14 17.5h7M17.5 14v7"/></>,
  steps: <><path d="M9 5h12M9 12h12M9 19h12"/><circle cx="3" cy="5" r=".6"/><circle cx="3" cy="12" r=".6"/><circle cx="3" cy="19" r=".6"/></>,
  mic: <><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/></>,
  fit: <><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><rect x="8" y="8" width="8" height="8" rx="1"/></>,
  minus: <path d="M5 12h14"/>,
  plus: <path d="M5 12h14M12 5v14"/>,
  check: <path d="m5 12 4 4L19 6"/>,
} satisfies Record<string, React.ReactNode>;

export type IconName = keyof typeof paths;
export default function Icon({ name, size = 20, className, style }: { name: IconName; size?: number; className?: string; style?: CSSProperties }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>{paths[name]}</svg>;
}

export function MimirMark({ className }: { className?: string }) {
  return <svg aria-hidden="true" viewBox="0 0 32 32" fill="none" className={className}><path d="M7 24V12c0-5 9-5 9 0v12m0-12c0-5 9-5 9 0v12" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"/><path d="M11 20h10" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"/></svg>;
}
