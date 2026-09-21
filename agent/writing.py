"""Choose a checked visual record without another model request."""
import ast
from dataclasses import dataclass

from math_check import equivalent, polynomial, valid_scaffold, related_calculation
from planner import TeachingPlan, supports_answer, finished_problem, speech_without_scaffold


@dataclass(frozen=True)
class WrittenStep:
    template: str
    blank: bool
    replace_id: str | None = None


def grouped_value(value: str) -> str:
    if value == '{{blank}}':
        return value
    node = ast.parse(value.replace('^', '**'), mode='eval').body
    return value if isinstance(node, (ast.Constant, ast.Name)) else f'({value})'


def contextual_step(source: str, calculation: str, value: str) -> str | None:
    """Replace one calculation in its full line, retaining surrounding notation.

    AST locations identify the operation; slicing the original text preserves
    parentheses that AST pretty-printers would discard. No model call is needed.
    """
    polynomial(calculation)
    target = ast.dump(ast.parse(calculation.strip().replace('^', '**'), mode='eval').body)
    sides = [side.strip().replace('^', '**') for side in source.split('=')]
    if len(sides) > 2:
        return None
    for index, side in enumerate(sides):
        polynomial(side)
        tree = ast.parse(side, mode='eval').body
        matches = sorted((node for node in ast.walk(tree) if ast.dump(node) == target), key=lambda node: node.col_offset)
        if not matches:
            continue
        node = matches[0]
        if node is tree and len(sides) == 1:
            return f'{source}={value}'
        replacement = grouped_value(value)
        sides[index] = side[:node.col_offset] + replacement + side[node.end_col_offset:]
        return '='.join(sides).replace('**', '^')
    # A student may have written a newer full line that is not a tutor annotation.
    # Keep that checked line instead of undoing its completed simplification.
    if '=' not in source and equivalent(source, calculation):
        return f'{calculation}={value}'
    return None


def working_expression(problem: str, annotations: list[dict]) -> str:
    """Recover the latest checked full line, including older isolated substeps."""
    current = problem
    for annotation in annotations:
        if ''.join(str(annotation.get('problem', '')).split()) != ''.join(problem.split()):
            continue
        template = annotation.get('template', '')
        if not template or '{{blank}}' in template:
            continue
        try:
            if template.count('=') == problem.count('=') and equivalent(problem, template):
                current = template
            elif '=' not in problem and template.count('=') == 1:
                left, right = template.split('=')
                if equivalent(left, right):
                    reconstructed = contextual_step(current, left, right)
                    if reconstructed and '=' not in reconstructed and equivalent(problem, reconstructed):
                        current = reconstructed
        except (ValueError, SyntaxError, ArithmeticError):
            continue
    return current


def written_step(plan: TeachingPlan, annotations: list[dict], *, required: bool = False, record_answer: bool = False) -> WrittenStep | None:
    if not required:
        return None
    current = working_expression(plan.problem, annotations)
    # In AI mode keep a visible record of the answer before moving to a new blank.
    if plan.scaffold and not (record_answer and plan.status == 'correct'):
        focus = plan.focus_expression
        if not focus and plan.scaffold.template.endswith('={{blank}}'):
            focus = plan.scaffold.template[:-len('={{blank}}')]
        if focus and len(polynomial(focus)) == 1:
            contextual = contextual_step(current, focus, '{{blank}}')
            if contextual and valid_scaffold(contextual, plan.scaffold.answer, plan.problem):
                return WrittenStep(contextual, blank=True)
        return WrittenStep(plan.scaffold.template, blank=True)
    if record_answer and plan.status == 'hint' and plan.problem:
        # Gemini often supplies a useful checked focus but omits a scaffold.
        # Draw that pending calculation locally instead of another model retry.
        focus = plan.focus_expression
        if focus:
            coefficients = polynomial(focus)
            if len(coefficients) == 1 and (related_calculation(plan.problem, focus) or related_calculation(current, focus)):
                contextual = contextual_step(current, focus, '{{blank}}')
                if contextual:
                    return WrittenStep(contextual, blank=True)
        # For an algebra question without a numeric focus, copy the current
        # equation. This exposes no new answer or unsupported transformation.
        for side in plan.problem.split('='):
            polynomial(side)
        return WrittenStep(current, blank=False)
    if plan.status != 'correct' or not plan.student_answer:
        if required:
            raise ValueError('Supply a checked scaffold with one blank, or a correct student answer to record.')
        return None
    answer = plan.student_answer.strip()
    # Fill a tutor blank in place when the student answers it aloud. Only use
    # annotations explicitly associated with this original problem.
    for annotation in reversed(annotations):
        template = annotation.get('template', '')
        if ''.join(str(annotation.get('problem', '')).split()) != ''.join(plan.problem.split()) or '{{blank}}' not in template:
            continue
        try:
            if valid_scaffold(template, answer, plan.problem):
                # Student ink inside a blank stays untouched. Record the full
                # completed expression on the next line when they wrote it.
                return WrittenStep(template.replace('{{blank}}', grouped_value(answer)), blank=False,
                                   replace_id=None if plan.answer_source == 'written' else annotation['id'])
            # A focused arithmetic blank records one operation in the original
            # problem, not necessarily the final answer to the entire problem.
            if template.endswith('={{blank}}'):
                calculation = template[:-len('={{blank}}')]
                if related_calculation(plan.problem, calculation) and equivalent(calculation, answer):
                    contextual = contextual_step(current, calculation, answer)
                    if contextual:
                        return WrittenStep(contextual, blank=False)
        except (ValueError, SyntaxError, ArithmeticError):
            continue
    for check in plan.checks:
        if not check.equal or not supports_answer(check, answer) or not (related_calculation(plan.problem, check.left) or related_calculation(current, check.left)):
            continue
        if '=' in answer:
            return WrittenStep(answer, blank=False)
        if '=' not in check.left:
            contextual = contextual_step(current, check.left, answer)
            if contextual:
                return WrittenStep(contextual, blank=False)
    raise ValueError('The answer to record needs a checked equality tied to the current problem.')


def written_speech(plan: TeachingPlan, writing: WrittenStep | None, placed: bool, *, ai_writes: bool = False) -> str:
    if not writing:
        return plan.speech
    if not placed:
        if ai_writes:
            return "I couldn't place that step. Let's work through it aloud."
        if writing.blank:
            return speech_without_scaffold(plan)
        return "That's right. I couldn't place the written step; you can write it on the canvas."
    if ai_writes:
        if finished_problem(plan):
            return "That's right. You've finished this problem."
        # Recording an answer can take priority over the proposed next blank.
        # Never refer to a blank that was not placed or ask the student to write.
        if ('blank' in plan.speech.lower() and not writing.blank) or any(word in plan.speech.lower() for word in ('write', 'written', 'canvas')):
            return "What goes in the blank?" if writing.blank else "That's right. What would you do next?"
        return plan.speech
    if writing.blank:
        return plan.speech
    return "That's right. I've filled in that step." if writing.replace_id else "That's right. I've written that step below."
