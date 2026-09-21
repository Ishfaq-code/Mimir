import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import ts from "typescript";

const temp = mkdtempSync(join(process.cwd(), ".graph-check-"));
try {
  const output = join(temp, "evaluate.cjs");
  writeFileSync(output, ts.transpileModule(readFileSync("lib/graph/evaluate.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText);
  const require = createRequire(import.meta.url);
  const graph = require(output);

  const cases = [
    ["y = 2x + 3", "2*x + 3", []],
    ["y = ax^2 + bx + c", "a*x^2 + b*x + c", ["a", "b", "c"]],
    ["y = A\\sin(Bx+C)+D", "A*sin(B*x+C)+D", ["A", "B", "C", "D"]],
    ["y = \\frac{x+1}{x-2}", "((x+1)/(x-2))", []],
    ["y = \\log(x)", "log(x)", []],
    ["y = lnx", "log(x)", []],
    ["y = \\ln x", "log(x)", []],
    ["y = sin^2x", "(sin(x))^(2)", []],
    ["y = sin^2(x)", "(sin(x))^(2)", []],
    ["y = sin^{2}x", "(sin(x))^(2)", []],
    ["y = A sin^2(Bx)", "A*(sin(B*x))^(2)", ["A", "B"]],
    ["y = \\sqrt{x}", "sqrt(x)", []],
    ["y = |x-1|", "abs(x-1)", []],
    ["y = 5!", "factorial(5)", []],
    ["y = x!", "factorial(x)", []],
  ];

  for (const [latex, expected, variables] of cases) {
    const expression = graph.latexToExpr(latex);
    assert.equal(expression, expected, `${latex} normalized unexpectedly: ${expression}`);
    graph.validateExpression(expression);
    assert.deepEqual(graph.extractVariables(expression), variables, `${latex} variables`);
  }

  const rational = graph.computeCurve(graph.latexToExpr("y=1/(x-2)"), {}, -5, 5, 200, { yMin: -10, yMax: 10 });
  assert.ok(rational.some((point) => point === null), "rational asymptote should split the curve");
  const logarithm = graph.computeCurve(graph.latexToExpr("y=log(x)"), {}, -2, 2, 100);
  assert.ok(logarithm.some((point) => point === null), "logarithm domain should contain gaps");
  const sine = graph.computeCurve(graph.latexToExpr("y=sin(x)"), {}, -Math.PI, Math.PI, 100);
  assert.ok(sine.some((point) => point && Math.abs(point[1]) < 0.01), "sine should evaluate numerically");
  const poweredSine = graph.computeCurve(graph.latexToExpr("y=sin^2x"), {}, -Math.PI, Math.PI, 100);
  assert.ok(poweredSine.some((point) => point && Math.abs(point[1] - 1) < 0.02), "sin^2 should evaluate numerically");
  const ln = graph.computeCurve(graph.latexToExpr("y=lnx"), {}, 0.5, 2, 100);
  assert.ok(ln.every((point) => point === null || Number.isFinite(point[1])), "lnx should evaluate numerically");
  const combinedExpressions = ["y=x^2-3", "y=sinx"].map(graph.latexToExpr);
  const combinedCurves = combinedExpressions.map((expression) => graph.computeCurve(expression, {}, -3, 3, 100));
  assert.equal(combinedCurves.length, 2, "multiple equations should produce multiple curves");
  assert.ok(combinedCurves.every((curve) => curve.some(Boolean)), "each selected equation should have drawable samples");

  // Derivative: d/dx x^2 should produce 2*x
  const derivExpr = graph.latexToExpr("\\frac{d}{dx}{x^2}");
  graph.validateExpression(derivExpr);
  const derivCurve = graph.computeCurve(derivExpr, {}, -3, 3, 20);
  const derivAt2 = derivCurve.find(p => p && Math.abs(p[0] - 2) < 0.5);
  assert.ok(derivAt2 && Math.abs(derivAt2[1] - 4) < 1, "d/dx x^2 at x=2 should be ~4");

  // Degree: sin(30°) should be ~0.5
  const degExpr = graph.latexToExpr("\\sin(30°)");
  graph.validateExpression(degExpr);
  const degCurve = graph.computeCurve(degExpr, {}, 0, 1, 1);
  assert.ok(degCurve[0] && Math.abs(degCurve[0][1] - 0.5) < 0.01, "sin(30°) should be ~0.5");

  // Factorial: 5! = 120
  const factExpr = graph.latexToExpr("5!");
  graph.validateExpression(factExpr);
  const factCurve = graph.computeCurve(factExpr, {}, 0, 1, 1);
  assert.ok(factCurve[0] && factCurve[0][1] === 120, "5! should be 120");

  console.log(`Passed: ${cases.length} expression forms, multi-curve sampling, coefficient extraction, domains, and asymptote gaps.`);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
