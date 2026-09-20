"""Bounded arithmetic/polynomial checks. Never eval model-generated code."""
import ast
from fractions import Fraction


def polynomial(expression: str) -> tuple[Fraction, ...]:
    if not expression or len(expression) > 160:
        raise ValueError('Expression too long or empty')
    tree = ast.parse(expression.strip().replace('^', '**'), mode='eval')
    if len(list(ast.walk(tree))) > 80:
        raise ValueError('Expression too complex')
    variables = {n.id for n in ast.walk(tree) if isinstance(n, ast.Name)}
    if len(variables) > 1 or any(len(name) != 1 for name in variables):
        raise ValueError('Only one variable is supported')

    def trim(p):
        while len(p) > 1 and p[-1] == 0: p.pop()
        if len(p) > 5 or any(abs(c.numerator) > 10**12 or c.denominator > 10**12 for c in p):
            raise ValueError('Calculation out of bounds')
        return tuple(p)

    def add(a, b, sign=1):
        return trim([(a[i] if i < len(a) else 0) + sign * (b[i] if i < len(b) else 0) for i in range(max(len(a), len(b)))])

    def multiply(a, b):
        p = [Fraction(0)] * (len(a) + len(b) - 1)
        for i, x in enumerate(a):
            for j, y in enumerate(b): p[i+j] += x*y
        return trim(p)

    def visit(node):
        if isinstance(node, ast.Constant) and type(node.value) in (int, float):
            return trim([Fraction(str(node.value))])
        if isinstance(node, ast.Name): return (Fraction(0), Fraction(1))
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
            return tuple((-1 if isinstance(node.op, ast.USub) else 1)*x for x in visit(node.operand))
        if isinstance(node, ast.BinOp):
            a, b = visit(node.left), visit(node.right)
            if isinstance(node.op, ast.Add): return add(a, b)
            if isinstance(node.op, ast.Sub): return add(a, b, -1)
            if isinstance(node.op, ast.Mult): return multiply(a, b)
            if isinstance(node.op, ast.Div) and len(b) == 1 and b[0]: return trim([x/b[0] for x in a])
            if isinstance(node.op, ast.Pow) and len(b) == 1 and b[0].denominator == 1 and 0 <= b[0] <= 4:
                result = (Fraction(1),)
                for _ in range(int(b[0])): result = multiply(result, a)
                return result
        raise ValueError('Unsupported math syntax')
    return visit(tree.body)


def equivalent(left: str, right: str) -> bool:
    left, right = left.strip(), right.strip()
    if max(len(left), len(right)) > 160: raise ValueError('Expression too long')
    variables = {n.id for s in (left, right) for n in ast.walk(ast.parse(s.replace('^', '**').replace('=', '-'), mode='eval')) if isinstance(n, ast.Name)}
    if len(variables) > 1: raise ValueError('Different variables')
    if '=' not in left and '=' not in right:
        return polynomial(left) == polynomial(right)
    if left.count('=') != 1 or right.count('=') != 1:
        raise ValueError('Use two equations or two expressions')
    def coefficients(eq):
        a,b = eq.split('=')
        p = polynomial(f'({a})-({b})')
        if len(p) > 2: raise ValueError('Only linear equation steps supported')
        return p
    a,b = coefficients(left), coefficients(right)
    if len(a) == len(b) == 1: return (a[0] == 0) == (b[0] == 0)
    if len(a) != len(b): return False
    return a[0]*b[1] == b[0]*a[1]


def valid_scaffold(template: str, answer: str, source: str) -> bool:
    if template.count('{{blank}}') != 1 or len(template) > 120 or not answer or len(answer) > 40: return False
    completed = template.replace('{{blank}}', f'({answer})')
    if '=' in source: return equivalent(source, completed)
    if '=' in completed:
        left,right = completed.split('=')
        return equivalent(source, left) and equivalent(left, right)
    return equivalent(source, completed)
