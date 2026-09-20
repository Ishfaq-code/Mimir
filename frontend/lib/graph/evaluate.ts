import { compile, type EvalFunction } from "mathjs";

const FUNCTIONS = new Set([
  "abs", "acos", "acosh", "acot", "acoth", "acsc", "acsch", "asec", "asech",
  "asin", "asinh", "atan", "atanh", "cbrt", "ceil", "cos", "cosh", "cot", "coth",
  "csc", "csch", "exp", "floor", "log", "log10", "ln", "max", "min", "round",
  "sec", "sech", "sign", "sin", "sinh", "sqrt", "tan", "tanh",
]);
const CONSTANTS = new Set(["e", "pi"]);
const LATEX_FUNCTIONS = [...FUNCTIONS].sort((a, b) => b.length - a.length);

function readGroup(source: string, start: number, open = "{", close = "}"): [string, number] | null {
  if (source[start] !== open) return null;
  let depth = 0;
  for (let i = start; i < source.length; i++) {
    if (source[i] === open) depth++;
    if (source[i] === close) depth--;
    if (depth === 0) return [source.slice(start + 1, i), i + 1];
  }
  return null;
}

function replaceCommand(source: string, command: string, replacer: (argument: string, optional: string | null) => string): string {
  let result = "";
  let cursor = 0;
  while (cursor < source.length) {
    const index = source.indexOf(command, cursor);
    if (index < 0) {
      result += source.slice(cursor);
      break;
    }
    result += source.slice(cursor, index);
    let position = index + command.length;
    while (/\s/.test(source[position] ?? "")) position++;
    let optional: string | null = null;
    if (source[position] === "[") {
      const group = readGroup(source, position, "[", "]");
      if (!group) {
        result += source.slice(index);
        break;
      }
      optional = group[0];
      position = group[1];
      while (/\s/.test(source[position] ?? "")) position++;
    }
    const group = readGroup(source, position);
    if (!group) {
      result += source.slice(index, position);
      cursor = position;
      continue;
    }
    result += replacer(group[0], optional);
    cursor = group[1];
  }
  return result;
}

function replaceFractions(source: string): string {
  let result = source;
  let previous = "";
  while (result !== previous) {
    previous = result;
    let output = "";
    let cursor = 0;
    while (cursor < result.length) {
      const index = result.indexOf("\\frac", cursor);
      if (index < 0) {
        output += result.slice(cursor);
        break;
      }
      output += result.slice(cursor, index);
      let position = index + "\\frac".length;
      while (/\s/.test(result[position] ?? "")) position++;
      const numerator = readGroup(result, position);
      if (!numerator) {
        output += result.slice(index);
        break;
      }
      position = numerator[1];
      while (/\s/.test(result[position] ?? "")) position++;
      const denominator = readGroup(result, position);
      if (!denominator) {
        output += result.slice(index);
        break;
      }
      output += `((${replaceFractions(numerator[0])})/(${replaceFractions(denominator[0])}))`;
      cursor = denominator[1];
    }
    result = output;
  }
  return result;
}

function replaceRoots(source: string): string {
  return replaceCommand(source, "\\sqrt", (argument, index) => {
    const value = replaceRoots(argument);
    return index === null ? `sqrt(${value})` : `nthRoot(${value},${replaceRoots(index)})`;
  });
}

function convertFunctionCommands(source: string): string {
  let result = source.replace(/\\operatorname\s*\{([^{}]+)\}/g, "$1");
  result = result.replace(/\\(?:mathrm|text)\s*\{([^{}]+)\}/g, "$1");
  result = result.replace(
    new RegExp(`([A-Za-z0-9)])\\s*(?=\\\\(?:${LATEX_FUNCTIONS.join("|")})\\b)`, "g"),
    "$1*",
  );
  for (const name of LATEX_FUNCTIONS) {
    result = result.replace(new RegExp(`\\\\${name}\\b`, "g"), name);
  }
  return result.replace(/\\pi\b/g, "pi");
}

function convertSuperscripts(source: string): string {
  let result = source.replace(/\^\s*\{([^{}]*)\}/g, "^($1)");
  result = result.replace(/_\s*\{([^{}]*)\}/g, "");
  // sin^2(x), cos^2(x), and similar notation.
  result = result.replace(
    new RegExp(`\\b(${LATEX_FUNCTIONS.join("|")})\\s*\\^\\s*([A-Za-z0-9.+-]+)\\s*\\(([^()]*)\\)`, "g"),
    "($1($3))^($2)",
  );
  return result;
}

function convertAbsoluteValues(source: string): string {
  let result = source;
  for (let i = 0; i < 8; i++) {
    const next = result.replace(/\|([^|]+)\|/g, "abs($1)");
    if (next === result) break;
    result = next;
  }
  return result;
}

function protectNames(source: string): string {
  let result = source;
  const names = [...FUNCTIONS, ...CONSTANTS, "nthRoot"];
  names.forEach((name, index) => {
    result = result.replace(new RegExp(`\\b${name}\\b`, "g"), `\u0001${index}\u0002`);
  });
  return result;
}

function restoreNames(source: string): string {
  const names = [...FUNCTIONS, ...CONSTANTS, "nthRoot"];
  return source.replace(/\u0001(\d+)\u0002/g, (_, index: string) => names[Number(index)] ?? "");
}

function splitAdjacentLetters(source: string): string {
  // LaTeX handwriting recognition commonly emits Bx or ax as adjacent letters.
  return source.replace(/([A-Za-z])(?=[A-Za-z])/g, "$1*");
}

function addImplicitMultiplication(source: string): string {
  let result = splitAdjacentLetters(source);
  // Names are protected, so these rules cannot split sin, log, pi, or e.
  result = result.replace(/(\d|\))\s*(?=[A-Za-z_(]|\u0001)/g, "$1*");
  result = result.replace(/([A-Za-z_)])\s*(?=\d|\(|\u0001)/g, "$1*");
  result = result.replace(/\)\s*(?=[A-Za-z0-9_(])/g, ")*");
  result = result.replace(/\s+/g, " ");
  return restoreNames(result);
}

/** Convert common LaTeX output into a mathjs expression with x as its input. */
export function latexToExpr(latex: string): string {
  let source = latex.trim()
    .replace(/^\$\$?\s*|\s*\$\$?$/g, "")
    .replace(/^\\\[|\\\]$/g, "")
    .replace(/\\left|\\right/g, "")
    .replace(/^[yY]\s*=\s*/, "")
    .replace(/^f\s*\(\s*x\s*\)\s*=\s*/i, "");

  source = replaceFractions(source);
  source = replaceRoots(source);
  source = convertFunctionCommands(source);
  source = convertSuperscripts(source);
  source = source.replace(/\\cdot|\\times/g, "*").replace(/\\div/g, "/");
  source = convertAbsoluteValues(source).replace(/[{}]/g, "");

  // Turn the common `sin x` form into a call before adding multiplication.
  for (const name of LATEX_FUNCTIONS) {
    source = source.replace(new RegExp(`\\b${name}\\s+([A-Za-z0-9(])`, "g"), `${name}($1)`);
  }
  return addImplicitMultiplication(protectNames(source)).trim();
}

/** Return all free symbols except x, y, constants, and callable names. */
export function extractVariables(expr: string): string[] {
  const names = expr.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
  return [...new Set(names)].filter((name) =>
    name !== "x" && name !== "y" && !CONSTANTS.has(name) && !FUNCTIONS.has(name) && name !== "nthRoot",
  ).sort();
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

export function validateExpression(expr: string): void {
  getCompiled(expr);
}

/** Compute samples and insert gaps where the function is undefined or crosses an asymptote. */
export function computeCurve(
  expr: string,
  vars: Record<string, number>,
  xMin: number,
  xMax: number,
  steps: number,
  options: { yMin?: number; yMax?: number } = {},
): ([number, number] | null)[] {
  const fn = getCompiled(expr);
  const points: ([number, number] | null)[] = [];
  const dx = (xMax - xMin) / Math.max(1, steps);
  const yRange = options.yMin !== undefined && options.yMax !== undefined ? options.yMax - options.yMin : 20;
  const jumpLimit = Math.max(100, Math.abs(yRange) * 5);
  let previous: [number, number] | null = null;

  for (let i = 0; i <= steps; i++) {
    const x = xMin + i * dx;
    try {
      const value = fn.evaluate({ ...vars, x });
      const y = typeof value === "number" ? value : Number.NaN;
      if (!Number.isFinite(y) || (previous && Math.abs(y - previous[1]) > jumpLimit)) {
        points.push(null);
        previous = null;
      } else {
        points.push([x, y]);
        previous = [x, y];
      }
    } catch {
      points.push(null);
      previous = null;
    }
  }
  return points;
}
