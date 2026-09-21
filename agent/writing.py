"""Choose a checked visual record without another model request."""
import ast
from dataclasses import dataclass

from math_check import equivalent, polynomial, valid_scaffold
from planner import TeachingPlan, supports_answer


@dataclass(frozen=True)
class WrittenStep:
    template: str
    blank: bool
    replace_id: str | None = None


def related_calculation(problem: str, expression: str) -> bool:
    """An equality must concern this problem, not unrelated correct arithmetic."""
    try:
        if equivalent(problem, expression):
            return True
    except ValueError:
        pass
    polynomial(expression)  # Apply the bounded math parser before walking its AST.
    target = ast.dump(ast.parse(expression.replace('^', '**'), mode='eval').body)
    for side in problem.split('='):
        polynomial(side)
        tree = ast.parse(side.replace('^', '**'), mode='eval')
        if any(ast.dump(node) == target for node in ast.walk(tree)):
            return True
    return False


def written_step(plan: TeachingPlan, annotations: list[dict], *, required: bool = False) -> WrittenStep | None:
    if not required:
        return None
    if plan.scaffold:
        return WrittenStep(plan.scaffold.template, blank=True)
    if plan.status != 'correct' or not plan.student_answer:
        if required:
            raise ValueError('Supply a checked scaffold with one blank, or a correct student answer to record.')
        return None
    answer = plan.student_answer.strip()
    # Fill a tutor blank in place when the student answers it aloud. Only use
    # annotations explicitly associated with this original problem.
    for annotation in reversed(annotations):
        template = annotation.get('template', '')
        if annotation.get('problem') != plan.problem or '{{blank}}' not in template:
            continue
        try:
            if valid_scaffold(template, answer, plan.problem):
                return WrittenStep(template.replace('{{blank}}', answer), blank=False, replace_id=annotation['id'])
        except (ValueError, SyntaxError, ArithmeticError):
            continue
    for check in plan.checks:
        if not check.equal or not supports_answer(check, answer) or not related_calculation(plan.problem, check.left):
            continue
        if '=' in answer:
            return WrittenStep(answer, blank=False)
        if '=' not in check.left:
            return WrittenStep(f'{check.left}={answer}', blank=False)
    raise ValueError('The answer to record needs a checked equality tied to the current problem.')
