import { useSyncExternalStore } from "react";

export interface LearningPreferences {
  aiWrites: boolean;
  captions: boolean;
  oneStep: boolean;
  shortReplies: boolean;
  largeText: boolean;
  roomyText: boolean;
  calm: boolean;
  highlights: boolean;
  slowerVoice: boolean;
}
export const DEFAULT_PREFERENCES: LearningPreferences = {
  aiWrites: false,
  captions: true, oneStep: true, shortReplies: true, largeText: false,
  roomyText: false, calm: false, highlights: true, slowerVoice: false,
};
let preferences = DEFAULT_PREFERENCES;
let paused = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(fn => fn());
export const subscribeSupport = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const getPreferences = () => preferences;
export const getPaused = () => paused;
export const setPaused = (value: boolean) => { paused = value; emit(); };
export function useLearningPreferences() {
  return useSyncExternalStore(subscribeSupport, getPreferences, () => DEFAULT_PREFERENCES);
}
export function parsePreferences(value: unknown): LearningPreferences {
  const result = { ...DEFAULT_PREFERENCES };
  if (!value || typeof value !== "object") return result;
  for (const key of Object.keys(result) as (keyof LearningPreferences)[]) {
    const next = (value as Record<string, unknown>)[key];
    if (typeof next === "boolean") result[key] = next;
  }
  return result;
}
export function loadPreferences() {
  try { preferences = parsePreferences(JSON.parse(localStorage.getItem("mimir.learning.v1") ?? "null")); }
  catch { preferences = { ...DEFAULT_PREFERENCES }; }
  emit();
}
export function updatePreferences(patch: Partial<LearningPreferences>) {
  preferences = parsePreferences({ ...preferences, ...patch });
  try { localStorage.setItem("mimir.learning.v1", JSON.stringify(preferences)); } catch { /* Private browsing may disable storage. */ }
  emit();
}
