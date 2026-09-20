import { compile, type EvalFunction } from "mathjs";

const FUNCTIONS = ["asin", "acos", "atan", "sin", "cos", "tan", "sqrt", "log", "ln", "abs"];

// Placeholders use @ which won't match [a-zA-Z0-9_()] in implicit mult regexes
const PH = FUNCTIONS.map((_, i) => `@${i}@`);

function protect(s: string): string {
  // Protect longer names first (asin before sin)
  for (let i = 0; i < FUNCTIONS.length; i++) {
    s = s.replaceAll(FUNCTIONS[i], PH[i]);
  }
  s = s.replaceAll("pi", "@PI@");
  return s;
}

function restore(s: string): string {
  for (let i = 0; i < FUNCTIONS.length; i++) {
    s = s.replaceAll(PH[i], FUNCTIONS[i]);
  }
  s = s.replaceAll("@PI@", "pi");
  return s;
}

/**
 * Convert a LaTeX math expression to a mathjs-parseable string.
 */
export function latexToExpr(latex: string): string {
  let s = latex.trim();

  // Strip display wrappers
  s = s.replace(/^\$\$?|\$\$?$/g, "");
  s = s.replace(/^\\[[(]|\\[\])]$/g, "");

  // Remove \left and \right
  s = s.replace(/\\left\s*/g, "").replace(/\\right\s*/g, "");

  // Strip "y =" prefix
  s = s.replace(/^[yY]\s*=\s*/, "").replace(/^f\s*\(\s*x\s*\)\s*=\s*/, "");

  // Insert * before \func when preceded by letter/digit/): a\sin → a*\sin
  s = s.replace(/([a-zA-Z0-9)])\s*\\(?=sin|cos|tan|asin|acos|atan|sqrt|log|ln|abs|pi)/g, "$1*\\");

  // \frac{a}{b} → ((a)/(b))
  for (let i = 0; i < 5; i++) {
    s = s.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "(($1)/($2))");
  }

  // --- Convert all \func forms to placeholder with parenthesized args ---

  // \sqrt[n]{x} → sqrt(x, n)
  s = s.replace(/\\sqrt\s*\[([^\]]*)\]\s*\{([^{}]*)\}/g, "nthRoot($2, $1)");

  for (const fn of FUNCTIONS) {
    const esc = fn.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // \func^{n}{x} → (func(x))^(n)
    s = s.replace(new RegExp(`\\\\${esc}\\s*\\^\\s*\\{([^{}]*)\\}\\s*\\{([^{}]*)\\}`, "g"), `(${fn}($2))^($1)`);
    // \func^{n}(x) → (func(x))^(n)
    s = s.replace(new RegExp(`\\\\${esc}\\s*\\^\\s*\\{([^{}]*)\\}\\s*\\(([^)]*)\\)`, "g"), `(${fn}($2))^($1)`);
    // \func{x} → func(x)
    s = s.replace(new RegExp(`\\\\${esc}\\s*\\{([^{}]*)\\}`, "g"), `${fn}($1)`);
    // \func(x) → func(x)
    s = s.replace(new RegExp(`\\\\${esc}\\s*\\(`, "g"), `${fn}(`);
    // \func x → func(x)  (single token after space)
    s = s.replace(new RegExp(`\\\\${esc}\\s+([a-zA-Z0-9])`, "g"), `${fn}($1)`);
    // bare \func → func
    s = s.replace(new RegExp(`\\\\${esc}`, "g"), fn);
  }

  // \pi → pi
  s = s.replace(/\\pi\b/g, "pi");

  // \cdot and \times → *
  s = s.replace(/\\cdot/g, "*").replace(/\\times/g, "*");

  // ^{n} → ^(n)
  s = s.replace(/\^\{([^{}]*)\}/g, "^($1)");

  // Strip remaining braces
  s = s.replace(/[{}]/g, "");

  // Fix bare function calls after brace stripping: sinx → sin(x)
  for (const fn of FUNCTIONS) {
    s = s.replace(new RegExp(`\\b${fn}([a-zA-Z])\\b`, "g"), `${fn}($1)`);
  }

  // --- Now protect function names before implicit multiplication ---
  s = protect(s);

  // Implicit mult: number followed by letter or (
  s = s.replace(/(\d)([a-zA-Z(_])/g, "$1*$2");

  // Implicit mult: adjacent single letters (a x → a*x)
  s = s.replace(/([a-zA-Z])([a-zA-Z])/g, "$1*$2");
  s = s.replace(/([a-zA-Z])([a-zA-Z])/g, "$1*$2");

  // Implicit mult: ) followed by letter, number, or (
  s = s.replace(/\)([a-zA-Z0-9_(])/g, ")*$1");

  // Implicit mult: letter followed by (
  s = s.replace(/([a-zA-Z])\(/g, "$1*(");

  // Implicit mult: number or letter or ) followed by placeholder
  s = s.replace(/([a-zA-Z0-9)])(@\d+@)/g, "$1*$2");

  // Restore function names
  s = restore(s);

  return s.trim();
}

/**
 * Find single-letter variables in a mathjs expression string, excluding x, y, e.
 */
export function extractVariables(expr: string): string[] {
  let cleaned = expr;
  for (const fn of FUNCTIONS) {
    cleaned = cleaned.replace(new RegExp(`\\b${fn}\\b`, "g"), " ");
  }
  cleaned = cleaned.replace(/\bpi\b/g, " ");
  cleaned = cleaned.replace(/\bnthRoot\b/g, " ");
  cleaned = cleaned.replace(/[^a-zA-Z]/g, " ");
  const letters = new Set(
    cleaned.split(/\s+/).filter((c) => /^[a-zA-Z]$/.test(c)),
  );
  letters.delete("x");
  letters.delete("y");
  letters.delete("e");
  return [...letters].sort();
}

const compiledCache = new Map<string, EvalFunction>();

function getCompiled(expr: string): EvalFunction {
  let fn = compiledCache.get(expr);
  if (!fn) {
    fn = compile(expr);
    compiledCache.set(expr, fn);
  }
  return fn;
}

/**
 * Compute [x, y] coordinate pairs for a curve.
 * Returns null entries for gaps (NaN/Infinity) so the renderer can break the line.
 */
export function computeCurve(
  expr: string,
  vars: Record<string, number>,
  xMin: number,
  xMax: number,
  steps: number,
): ([number, number] | null)[] {
  const fn = getCompiled(expr);
  const points: ([number, number] | null)[] = [];
  const dx = (xMax - xMin) / steps;
  for (let i = 0; i <= steps; i++) {
    const x = xMin + i * dx;
    try {
      const y = fn.evaluate({ ...vars, x }) as number;
      if (typeof y === "number" && isFinite(y)) {
        points.push([x, y]);
      } else {
        points.push(null);
      }
    } catch {
      points.push(null);
    }
  }
  return points;
}
