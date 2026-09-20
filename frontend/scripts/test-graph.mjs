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
    ["y = lnx", "ln(x)", []],
    ["y = \\ln x", "ln(x)", []],
    ["y = sin^2x", "(sin(x))^(2)", []],
    ["y = sin^2(x)", "(sin(x))^(2)", []],
    ["y = sin^{2}x", "(sin(x))^(2)", []],
    ["y = A sin^2(Bx)", "A*(sin(B*x))^(2)", ["A", "B"]],
    ["y = \\sqrt{x}", "sqrt(x)", []],
    ["y = |x-1|", "abs(x-1)", []],
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

  console.log(`Passed: ${cases.length} expression forms, coefficient extraction, domains, and asymptote gaps.`);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
