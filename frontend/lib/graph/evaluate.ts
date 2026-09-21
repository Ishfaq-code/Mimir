import { compile, derivative as mathjsDerivative, type EvalFunction } from "mathjs";

const FUNCTIONS = new Set([
  "abs", "acos", "acosh", "acot", "acoth", "acsc", "acsch", "asec", "asech",
  "asin", "asinh", "atan", "atanh", "cbrt", "ceil", "cos", "cosh", "cot", "coth",
  "csc", "csch", "exp", "factorial", "floor", "log", "log10", "max", "min", "round",
  "sec", "sech", "sign", "sin", "sinh", "sqrt", "tan", "tanh",
]);
const CONSTANTS = new Set(["e", "pi"]);
const LATEX_FUNCTIONS = [...FUNCTIONS].sort((a, b) => b.length - a.length);
const UNARY_FUNCTIONS = LATEX_FUNCTIONS.filter((name) => name !== "max" && name !== "min");

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
  // \ln → log (mathjs uses log for natural log)
  result = result.replace(/\\ln\b/g, "log");
  // Bare ln with adjacent arg: lnx → log(x), ln(x) → log(x)
  result = result.replace(/\bln\s*\(/g, "log(");
  result = result.replace(/\bln\s+([A-Za-z0-9])/g, "log($1)");
  result = result.replace(/\bln([A-Za-z0-9])/g, "log($1)");
  return result.replace(/\\pi\b/g, "pi");
}

function normalizeShorthandFunctions(source: string): string {
  const names = UNARY_FUNCTIONS.join("|");
  let result = source;

  // Normalize sin^2x, sin^2(x), and sin^{2}x before generic superscript handling.
  result = result.replace(
    new RegExp(
      `\\b(${names})\\s*\\^\\s*(?:\\{([^{}]+)\\}|([A-Za-z]|\\d+(?:\\.\\d*)?))\\s*(\\([^()]*\\)|[A-Za-z0-9.]+)`,
      "g",
    ),
    (_, name: string, bracedExponent: string | undefined, plainExponent: string | undefined, argument: string) => {
      const exponent = bracedExponent ?? plainExponent;
      const value = argument.startsWith("(") ? argument.slice(1, -1) : argument;
      return `(${name}(${value}))^(${exponent})`;
    },
  );

  // Normalize calculator-style forms such as lnx, sinx, and sinhx.
  result = result.replace(
    new RegExp(`\\b(${names})(?!\\s*\\()\\s*([A-Za-z0-9.]+)`, "g"),
    (_, name: string, argument: string) => `${name}(${argument})`,
  );
  return result;
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

/** Pre-convert LaTeX inside a derivative argument so mathjs can differentiate it. */
function preConvertForDerivative(inner: string): string {
  // Recursively use the full latexToExpr pipeline (minus the y= strip)
  let s = inner.trim();
  s = s.replace(/\\left\s*|\\right\s*/g, "");
  s = replaceFractions(s);
  s = replaceRoots(s);
  s = convertLogBase(s);
  s = convertFunctionCommands(s);
  s = convertSuperscripts(s);
  s = s.replace(/\\cdot|\\times/g, "*").replace(/\\div/g, "/");
  s = convertAbsoluteValues(s).replace(/[{}]/g, "");
  s = normalizeShorthandFunctions(s);
  for (const name of LATEX_FUNCTIONS) {
    s = s.replace(new RegExp(`\\b${name}\\s+(?!\\s*\\()([A-Za-z0-9])`, "g"), `${name}($1)`);
  }
  s = s.replace(new RegExp(`\\b(${LATEX_FUNCTIONS.join("|")})\\s+\\(`, "g"), "$1(");
  s = addImplicitMultiplication(protectNames(s)).trim();
  return s;
}

function convertDerivatives(source: string): string {
  let result = source;
  // \frac{d}{dx}(...) or \frac{d}{dx}{expr} — symbolic derivative
  result = result.replace(
    /\\frac\s*\{\s*d\s*\}\s*\{\s*d\s*([a-zA-Z])\s*\}\s*\(([^()]*)\)/g,
    (_, v: string, inner: string) => {
      try { return mathjsDerivative(preConvertForDerivative(inner), v).toString(); }
      catch { return `DERIV(${inner},${v})`; }
    },
  );
  result = result.replace(
    /\\frac\s*\{\s*d\s*\}\s*\{\s*d\s*([a-zA-Z])\s*\}\s*\{([^{}]*)\}/g,
    (_, v: string, inner: string) => {
      try { return mathjsDerivative(preConvertForDerivative(inner), v).toString(); }
      catch { return `DERIV(${inner},${v})`; }
    },
  );
  // \frac{d}{dx} followed by remaining text
  result = result.replace(
    /\\frac\s*\{\s*d\s*\}\s*\{\s*d\s*([a-zA-Z])\s*\}\s*([^\s,;]+)/g,
    (_, v: string, inner: string) => {
      try { return mathjsDerivative(preConvertForDerivative(inner), v).toString(); }
      catch { return `DERIV(${inner},${v})`; }
    },
  );
  // f'(x), f''(x) — prime notation
  result = result.replace(/([a-zA-Z])\s*''\s*\(\s*([^()]*)\s*\)/g, (_, _fn: string, inner: string) => {
    try {
      const first = mathjsDerivative(preConvertForDerivative(inner), "x").toString();
      return mathjsDerivative(first, "x").toString();
    } catch { return `DERIV2(${inner})`; }
  });
  result = result.replace(/([a-zA-Z])\s*'\s*\(\s*([^()]*)\s*\)/g, (_, _fn: string, inner: string) => {
    try { return mathjsDerivative(preConvertForDerivative(inner), "x").toString(); }
    catch { return `DERIV(${inner},x)`; }
  });
  return result;
}

function convertLogBase(source: string): string {
  // \log_{base}{arg} → log(arg, base)
  let result = replaceCommand(source, "\\log_", (base, _opt) => {
    // After reading the base, check if next char starts a group or token
    return `LOG_BASE_${base}_`;
  });
  // Now handle LOG_BASE_n_{arg} or LOG_BASE_n(arg) or LOG_BASE_n token
  result = result.replace(
    /LOG_BASE_([^_]+)_\s*\{([^{}]*)\}/g,
    "log($2, $1)",
  );
  result = result.replace(
    /LOG_BASE_([^_]+)_\s*\(([^()]*)\)/g,
    "log($2, $1)",
  );
  result = result.replace(
    /LOG_BASE_([^_]+)_\s*([a-zA-Z0-9]+)/g,
    "log($2, $1)",
  );
  // Simpler pattern: \log_2(x) after command conversion strips to log_2(x)
  // Handle direct log_n patterns
  result = result.replace(
    /\blog_\{?(\d+)\}?\s*\(([^()]*)\)/g,
    "log($2, $1)",
  );
  result = result.replace(
    /\blog_\{?(\d+)\}?\s*([a-zA-Z])/g,
    "log($2, $1)",
  );
  return result;
}

function convertFactorials(source: string): string {
  // (expr)! → factorial(expr)
  let result = source.replace(/\(([^()]+)\)\s*!/g, "factorial($1)");
  // n! or x! — single token followed by !
  result = result.replace(/([a-zA-Z0-9]+)\s*!/g, "factorial($1)");
  return result;
}

const PROTECTED_NAMES = [...FUNCTIONS, ...CONSTANTS, "nthRoot", "DERIV2", "DERIV"];

function protectNames(source: string): string {
  let result = source;
  PROTECTED_NAMES.forEach((name, index) => {
    result = result.replace(new RegExp(`\\b${name}\\b`, "g"), `\u0001${index}\u0002`);
  });
  return result;
}

function restoreNames(source: string): string {
  return source.replace(/\u0001(\d+)\u0002/g, (_, index: string) => PROTECTED_NAMES[Number(index)] ?? "");
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
    .replace(/\\left\s*|\\right\s*/g, "")
    .replace(/^[yY]\s*=\s*/, "")
    .replace(/^f\s*\(\s*x\s*\)\s*=\s*/i, "");

  // Derivatives: \frac{d}{dx}f(x) or \frac{d}{dx}(expr)
  source = convertDerivatives(source);

  source = replaceFractions(source);
  source = replaceRoots(source);

  // Log with subscript base: \log_{2}(x) → log(x, 2), \log_2 x → log(x, 2)
  source = convertLogBase(source);

  source = convertFunctionCommands(source);
  source = normalizeShorthandFunctions(source);
  source = convertSuperscripts(source);
  source = source.replace(/\\cdot|\\times/g, "*").replace(/\\div/g, "/");

  // Degree symbol: 30° or 30^\circ or 30\degree → (30*pi/180)
  source = source.replace(/(\d+(?:\.\d*)?)\s*\^?\s*(?:°|\\circ\b|\\degree\b)/g, "($1*pi/180)");
  // Standalone degree after parenthesized expression: (expr)° → (expr)*pi/180
  source = source.replace(/\)\s*\^?\s*(?:°|\\circ\b|\\degree\b)/g, ")*pi/180");

  // Factorial: n! → factorial(n)
  source = convertFactorials(source);

  source = convertAbsoluteValues(source).replace(/[{}]/g, "");

  // Turn the common `sin x` form into a call before adding multiplication.
  // Skip if already followed by ( — that's already a call like sin(x) or sin (x).
  for (const name of LATEX_FUNCTIONS) {
    source = source.replace(new RegExp(`\\b${name}\\s+(?!\\s*\\()([A-Za-z0-9])`, "g"), `${name}($1)`);
  }
  // Collapse spaces between function name and opening paren: sin (x) → sin(x)
  source = source.replace(new RegExp(`\\b(${LATEX_FUNCTIONS.join("|")})\\s+\\(`, "g"), "$1(");
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
