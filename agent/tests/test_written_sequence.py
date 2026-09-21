import unittest

from math_check import equivalent
from planner import Check, Scaffold, TeachingPlan, finalize_plan, normalize_board_hint
from writing import contextual_step, working_expression, written_step


class WrittenSequence(unittest.TestCase):
    def plan(self, **changes):
        values = dict(status='hint', problem='5*(2+3)', student_answer=None,
                      problem_region_ids=['R1'], highlight_region_ids=[], highlight_label='',
                      focus_expression='2+3', speech='What is two plus three?', checks=[], scaffold=None)
        return TeachingPlan(**(values | changes))

    def test_parentheses_and_outer_factor_survive_each_turn(self):
        first = written_step(self.plan(), [], required=True, record_answer=True)
        self.assertEqual(first.template, '5*({{blank}})')
        annotations = [dict(id='step-1', problem='5*(2+3)', template=first.template)]
        answer = self.plan(status='correct', student_answer='5', answer_source='spoken',
                           checks=[Check(left='2+3', right='5', equal=True)])
        second = written_step(answer, annotations, required=True, record_answer=True)
        self.assertEqual(second.template, '5*(5)')
        self.assertEqual(second.replace_id, 'step-1')
        annotations[0]['template'] = second.template
        last = self.plan(status='correct', student_answer='25', answer_source='spoken',
                         checks=[Check(left='5*5', right='25', equal=True)])
        final = written_step(last, annotations, required=True, record_answer=True)
        self.assertEqual(final.template, '5*(5)=25')
        self.assertIsNone(final.replace_id)

    def test_next_blank_keeps_existing_parentheses(self):
        annotations = [dict(id='step-1', problem='5*(2+3)', template='5*(5)')]
        plan = self.plan(focus_expression='5*5', scaffold=Scaffold(template='5*5={{blank}}', answer='25'))
        self.assertEqual(written_step(plan, annotations, required=True, record_answer=True).template, '5*(5)={{blank}}')

    def test_written_answer_is_copied_below_without_replacing_student_ink(self):
        plan = self.plan(status='correct', student_answer='5', answer_source='written',
                         checks=[Check(left='2+3', right='5', equal=True)])
        result = written_step(plan, [dict(id='step-1', problem=plan.problem, template='5*({{blank}})')], required=True, record_answer=True)
        self.assertEqual(result.template, '5*(5)')
        self.assertIsNone(result.replace_id)

    def test_one_operation_changes_and_surrounding_terms_remain(self):
        for source, focus, answer, expected in [
            ('2+3*2', '3*2', '6', '2+6'),
            ('7-(2+3)', '2+3', '5', '7-(5)'),
            ('(2+3)*(4+5)', '2+3', '5', '(5)*(4+5)'),
            ('2*((3+4)*5)', '3+4', '7', '2*((7)*5)'),
            ('(2+3)^2', '2+3', '5', '(5)^2'),
            ('2*(3+4)=14', '3+4', '7', '2*(7)=14'),
            ('2/(1/2)', '1/2', '1/2', '2/((1/2))'),
        ]:
            with self.subTest(source=source):
                actual = contextual_step(source, focus, answer)
                self.assertEqual(actual, expected)
                self.assertTrue(equivalent(source, actual))

    def test_old_detached_steps_recover_full_problem(self):
        old = [dict(id='old', problem='5*(2+3)', template='2+3=5')]
        self.assertEqual(working_expression('5*(2+3)', old), '5*(5)')
        self.assertEqual(working_expression('5*(2+3)', [dict(id='wrong', problem='5*(2+3)', template='2+3=7')]), '5*(2+3)')
        self.assertEqual(working_expression('5*(2+3)', [dict(id='other', problem='2+3', template='2+3=5')]), '5*(2+3)')

    def test_later_operation_can_come_from_the_checked_current_line(self):
        plan = self.plan(problem='1+2+3+4', focus_expression='3+3')
        annotations = [dict(id='step-1', problem=plan.problem, template='3+3+4')]
        self.assertEqual(written_step(plan, annotations, required=True, record_answer=True).template, '{{blank}}+4')

    def test_composite_answer_remains_grouped_in_a_blank(self):
        plan = self.plan(problem='2/(1/2)', status='correct', student_answer='1/2',
                         checks=[Check(left='1/2', right='1/2', equal=True)])
        annotations = [dict(id='blank', problem=plan.problem, template='2/{{blank}}')]
        result = written_step(plan, annotations, required=True, record_answer=True)
        self.assertEqual(result.template, '2/(1/2)')
        self.assertTrue(equivalent(plan.problem, result.template))

    def test_wrong_answers_never_advance_and_writing_still_requires_permission(self):
        self.assertIsNone(written_step(self.plan(), [], required=False, record_answer=True))
        wrong = self.plan(status='incorrect', student_answer='7', checks=[Check(left='2+3', right='7', equal=False)])
        with self.assertRaises(ValueError):
            written_step(wrong, [], required=True, record_answer=True)

    def test_answer_recording_ignores_an_unneeded_future_scaffold(self):
        plan = self.plan(status='correct', student_answer='5', checks=[Check(left='2+3', right='5', equal=True)],
                         scaffold=Scaffold(template='100={{blank}}', answer='100'))
        checked = finalize_plan(plan, {'regions': [{'id': 'R1'}]}, ai_writes=True)
        self.assertEqual(written_step(checked, [], required=True, record_answer=True).template, '5*(5)')

    def test_unrelated_or_ungrounded_conversation_cannot_trigger_writing(self):
        for changes in [dict(focus_expression='8+9'), dict(problem_region_ids=[]), dict(focus_expression=None)]:
            plan = self.plan(status='conversation', **changes)
            self.assertEqual(normalize_board_hint(plan).status, 'conversation')
