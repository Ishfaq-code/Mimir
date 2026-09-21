import asyncio
import json
import unittest
from unittest.mock import AsyncMock, MagicMock, PropertyMock, patch

from livekit.agents import StopResponse, llm
from gemini_tutor import GeminiTutor
from planner import TeachingPlan, Check, Scaffold


class GeminiBoardTools(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        with patch('gemini_tutor.CanvasRpc') as rpc:
            self.canvas = rpc.return_value
            self.tutor = GeminiTutor('student')
        self.ready = True
        self.revision = 'r1'
        self.question = {'text': '2 + 3 * 2', 'confirmed': True}
        self.waiting = asyncio.Event()
        self.context = MagicMock()
        self.context.speech_handle.interrupted = False
        self.session = MagicMock()
        self.session.userdata.paused = False
        self.session.agent_state = 'listening'
        self.session.interrupt = AsyncMock()
        self.session.generate_reply.return_value.wait_for_playout = AsyncMock()
        p = patch.object(GeminiTutor, 'session', new_callable=PropertyMock, return_value=self.session)
        p.start()
        self.addCleanup(p.stop)
        self.annotation_result = {'success': True, 'scaffoldPlaced': True}
        self.annotations = []
        self.preferences = {'oneStep': True, 'aiWrites': False}

        async def call(method, args):
            if method == 'get_board_status':
                return {'available': True, 'ready': self.ready, 'revision': self.revision if self.ready else None,
                        'preferences': dict(self.preferences)}
            if method == 'get_canvas_state':
                return {'question': self.question, 'preferences': dict(self.preferences), 'tutorAnnotations': self.annotations}
            if method == 'set_tutor_status' and args['status'] == 'waiting':
                self.waiting.set()
            if method == 'apply_teaching_plan':
                return self.annotation_result
            return {}

        async def capture():
            return {'snapshotId': self.revision, 'revision': self.revision, 'regions': [{'id': 'R1'}]}, b'image'

        async def update(chat):
            self.tutor._chat_ctx = chat

        self.canvas.call = AsyncMock(side_effect=call)
        self.canvas.capture = AsyncMock(side_effect=capture)
        self.tutor.update_chat_ctx = AsyncMock(side_effect=update)

    def plan(self):
        return TeachingPlan(status='correct', problem='2+3*2', student_answer='6', problem_region_ids=['R1'],
                            highlight_region_ids=[], highlight_label='', speech='Yes.',
                            checks=[Check(left='3*2', right='6', equal=True)],
                            scaffold=Scaffold(template='2+6={{blank}}', answer='8'))

    async def inspect(self):
        return await self.tutor.inspect_board(self.context)

    def request_writing(self, text='Please write this step for me'):
        # Exercise the real user-input path, including cancellation and the
        # permission gate, without starting a separate generated response.
        with patch.object(self.tutor, '_submit_after_pen', new_callable=AsyncMock):
            self.tutor.submit(text)

    async def test_waits_for_pen_before_sending_any_image(self):
        self.ready = False
        task = asyncio.create_task(self.inspect())
        await asyncio.wait_for(self.waiting.wait(), 1)
        self.canvas.capture.assert_not_awaited()
        self.tutor.update_chat_ctx.assert_not_awaited()
        self.ready = True
        result = await asyncio.wait_for(task, 1)
        self.assertEqual(result['vision'], 'available')
        self.assertTrue(any(isinstance(x, llm.ImageContent) for x in self.tutor.chat_ctx.items[-1].content))

    async def test_typed_check_waits_before_generating_reply(self):
        self.ready = False
        self.tutor.submit('Check my work')
        await asyncio.wait_for(self.waiting.wait(), 1)
        self.session.generate_reply.assert_not_called()
        self.ready = True
        await asyncio.wait_for(self.tutor._queued_turn, 1)
        self.session.generate_reply.assert_called_once_with(user_input='Check my work', allow_interruptions=True)

    async def test_voice_acknowledgement_still_completes_pending_check(self):
        self.ready = False
        self.tutor.on_voice_transcript('Check my work', False)
        self.tutor.on_voice_transcript('Check my work', True)
        await asyncio.wait_for(self.waiting.wait(), 1)
        self.session.generate_reply.assert_not_called()
        self.ready = True
        await asyncio.wait_for(self.tutor._queued_turn, 1)
        self.session.generate_reply.assert_called_once()
        self.assertIn('Complete the pending student request', self.session.generate_reply.call_args.kwargs['instructions'])

    async def test_voice_turn_already_reviewed_is_not_replayed(self):
        self.tutor.on_voice_transcript('Check my work', False)
        await self.tutor.review_step(self.context, 'r1', self.plan())
        self.tutor.on_voice_transcript('Check my work', True)
        self.assertIsNone(self.tutor._queued_turn)
        self.session.generate_reply.assert_not_called()

    async def test_inspection_without_review_still_completes_voice_request(self):
        self.tutor.on_voice_transcript('Write a blank', False)
        await self.inspect()
        self.tutor.on_voice_transcript('Write a blank', True)
        await self.tutor._queued_turn
        self.assertIn('write_step', self.session.generate_reply.call_args.kwargs['instructions'])

    async def test_short_spoken_answer_followup_is_not_lost(self):
        await self.tutor.review_step(self.context, 'r1', self.plan())
        self.tutor.on_voice_transcript('eight', False)
        self.tutor.on_voice_transcript('eight', True)
        await self.tutor._queued_turn
        self.session.generate_reply.assert_called_once()

    async def test_correct_spoken_answer_guides_student_without_writing(self):
        plan = self.plan()
        plan.scaffold = None
        plan.answer_source = 'spoken'
        result = await self.tutor.review_step(self.context, 'r1', plan)
        self.assertFalse(result['step_placed'])
        self.assertIn('Write that answer on your canvas', result['speech'])
        call = next(c for c in self.canvas.call.await_args_list if c.args[0] == 'apply_teaching_plan')
        self.assertIsNone(call.args[1]['completedStep'])
        self.assertIsNone(call.args[1]['scaffold'])

    async def test_final_spoken_answer_is_recorded(self):
        self.request_writing()
        plan = self.plan()
        plan.student_answer = '8'
        plan.answer_source = 'spoken'
        plan.checks = [Check(left='2+6', right='8', equal=True)]
        result = await self.tutor.write_step(self.context, 'r1', plan)
        self.assertTrue(result['step_placed'])
        self.assertFalse(result['scaffold_placed'])
        call = next(c for c in self.canvas.call.await_args_list if c.args[0] == 'apply_teaching_plan')
        self.assertEqual(call.args[1]['completedStep'], '2+6=8')
        self.assertIsNone(call.args[1]['scaffold'])

    async def test_existing_blank_is_completed_in_place(self):
        self.request_writing('Can you fill in the blank for me?')
        self.annotations = [{'id': 'blank-1', 'problem': '2+3*2', 'template': '2+6={{blank}}'}]
        plan = self.plan()
        plan.student_answer = '8'
        plan.answer_source = 'spoken'
        plan.checks = [Check(left='2+6', right='8', equal=True)]
        await self.tutor.write_step(self.context, 'r1', plan)
        call = next(c for c in self.canvas.call.await_args_list if c.args[0] == 'apply_teaching_plan')
        self.assertEqual(call.args[1]['replaceAnnotationId'], 'blank-1')
        self.assertEqual(call.args[1]['completedStep'], '2+6=8')

    async def test_written_final_answer_does_not_get_copied(self):
        plan = self.plan()
        plan.student_answer = '8'
        plan.answer_source = 'written'
        plan.checks = [Check(left='2+6', right='8', equal=True)]
        await self.tutor.review_step(self.context, 'r1', plan)
        call = next(c for c in self.canvas.call.await_args_list if c.args[0] == 'apply_teaching_plan')
        self.assertIsNone(call.args[1]['completedStep'])
        self.assertIsNone(call.args[1]['scaffold'])

    async def test_explicit_writing_cannot_succeed_without_a_step(self):
        self.request_writing()
        plan = self.plan()
        plan.status = 'hint'
        plan.student_answer = None
        plan.scaffold = None
        plan.checks = []
        result = await self.tutor.write_step(self.context, 'r1', plan)
        self.assertFalse(result['approved'])
        self.assertFalse(any(c.args[0] == 'apply_teaching_plan' for c in self.canvas.call.await_args_list))

    async def test_unrelated_correct_math_cannot_be_recorded(self):
        self.request_writing()
        plan = self.plan()
        plan.scaffold = None
        plan.student_answer = '9'
        plan.checks = [Check(left='3*3', right='9', equal=True)]
        result = await self.tutor.write_step(self.context, 'r1', plan)
        self.assertFalse(result['approved'])

    async def test_failed_completed_step_does_not_claim_to_have_written(self):
        self.request_writing()
        self.annotation_result = {'success': False, 'error': 'blank_contains_student_ink'}
        plan = self.plan()
        plan.scaffold = None
        result = await self.tutor.write_step(self.context, 'r1', plan)
        self.assertTrue(result['approved'])
        self.assertFalse(result['step_placed'])
        self.assertIn("couldn't place", result['speech'])

    async def test_unsolicited_write_tool_is_rejected(self):
        result = await self.tutor.write_step(self.context, 'r1', self.plan())
        self.assertEqual(result['error'], 'writing_not_requested')
        self.assertFalse(any(c.args[0] == 'apply_teaching_plan' for c in self.canvas.call.await_args_list))

    async def test_ai_mode_records_answer_even_through_review_tool(self):
        self.preferences['aiWrites'] = True
        plan = self.plan()
        plan.speech = "That's right. What is two plus six?"
        result = await self.tutor.review_step(self.context, 'r1', plan)
        self.assertTrue(result['step_placed'])
        self.assertEqual(result['speech'], plan.speech)
        call = next(c for c in self.canvas.call.await_args_list if c.args[0] == 'apply_teaching_plan')
        self.assertEqual(call.args[1]['completedStep'], '2+6')
        self.assertIsNone(call.args[1]['scaffold'])
        self.assertTrue(call.args[1]['aiWrites'])

    async def test_ai_mode_fills_blank_on_a_spoken_answer(self):
        self.preferences['aiWrites'] = True
        self.annotations = [{'id': 'blank-1', 'problem': '2+3*2', 'template': '2+6={{blank}}'}]
        plan = self.plan()
        plan.student_answer = '8'
        plan.checks = [Check(left='2+6', right='8', equal=True)]
        result = await self.tutor.review_step(self.context, 'r1', plan)
        self.assertTrue(result['step_placed'])
        call = next(c for c in self.canvas.call.await_args_list if c.args[0] == 'apply_teaching_plan')
        self.assertEqual(call.args[1]['replaceAnnotationId'], 'blank-1')
        self.assertIn('finished', result['speech'])

    async def test_ai_mode_draws_hint_and_does_not_ask_student_to_write(self):
        self.preferences['aiWrites'] = True
        plan = self.plan()
        plan.status, plan.student_answer, plan.checks = 'hint', None, []
        plan.speech = 'What is two plus six?'
        result = await self.tutor.write_step(self.context, 'r1', plan)
        self.assertTrue(result['scaffold_placed'])
        self.assertEqual(result['speech'], plan.speech)

    async def test_ai_mode_incorrect_answer_does_not_advance(self):
        self.preferences['aiWrites'] = True
        plan = self.plan()
        plan.status, plan.student_answer, plan.scaffold = 'incorrect', '7', None
        plan.checks = [Check(left='3*2', right='7', equal=False)]
        plan.speech = 'Try that multiplication again.'
        result = await self.tutor.review_step(self.context, 'r1', plan)
        self.assertTrue(result['approved'])
        self.assertFalse(result['step_placed'])

    async def test_ai_mode_builds_missing_calculation_blank_without_retry(self):
        self.preferences['aiWrites'] = True
        plan = self.plan()
        plan.status, plan.student_answer, plan.checks, plan.scaffold = 'hint', None, [], None
        plan.focus_expression = '3*2'
        result = await self.tutor.review_step(self.context, 'r1', plan)
        self.assertTrue(result['step_placed'])
        call = next(c for c in self.canvas.call.await_args_list if c.args[0] == 'apply_teaching_plan')
        self.assertEqual(call.args[1]['scaffold'], '2+{{blank}}')

    async def test_grounded_hint_mislabeled_conversation_still_writes(self):
        self.preferences['aiWrites'] = True
        plan = self.plan()
        plan.problem = '5(2+3)'
        plan.status, plan.student_answer, plan.checks, plan.scaffold = 'conversation', None, [], None
        plan.focus_expression = '2+3'
        result = await self.tutor.review_step(self.context, 'r1', plan)
        self.assertTrue(result['step_placed'])
        call = next(c for c in self.canvas.call.await_args_list if c.args[0] == 'apply_teaching_plan')
        self.assertEqual(call.args[1]['scaffold'], '5*({{blank}})')
        self.assertEqual(call.args[1]['problem'], '5*(2+3)')

    async def test_ai_mode_restores_context_for_legacy_focused_blank(self):
        self.preferences['aiWrites'] = True
        self.annotations = [{'id': 'focus-1', 'problem': '2 + 3 * 2', 'template': '3*2={{blank}}'}]
        result = await self.tutor.review_step(self.context, 'r1', self.plan())
        self.assertTrue(result['step_placed'])
        call = next(c for c in self.canvas.call.await_args_list if c.args[0] == 'apply_teaching_plan')
        self.assertEqual(call.args[1]['completedStep'], '2+6')
        self.assertIsNone(call.args[1]['replaceAnnotationId'])

    async def test_switching_back_to_student_mode_stops_writing_on_same_board(self):
        self.preferences['aiWrites'] = True
        await self.inspect()
        self.preferences['aiWrites'] = False
        result = await self.tutor.review_step(self.context, 'r1', self.plan())
        self.assertFalse(result['step_placed'])
        self.assertIn('Write that answer', result['speech'])

    async def test_mode_switch_during_tool_application_is_not_approved(self):
        self.preferences['aiWrites'] = True
        self.annotation_result = {'success': False, 'error': 'writing_mode_changed'}
        result = await self.tutor.write_step(self.context, 'r1', self.plan())
        self.assertFalse(result['approved'])
        self.assertEqual(self.tutor._last_review_at, 0)

    async def test_student_can_decline_writing_for_one_ai_mode_turn(self):
        self.preferences['aiWrites'] = True
        self.request_writing("Check this but don't write anything.")
        result = await self.tutor.review_step(self.context, 'r1', self.plan())
        self.assertFalse(result['step_placed'])

    async def test_explicit_request_is_honored_by_review_in_student_mode(self):
        self.request_writing('Could you go ahead and write that down?')
        result = await self.tutor.review_step(self.context, 'r1', self.plan())
        self.assertTrue(result['step_placed'])
        self.assertFalse(self.tutor._writing_authorized)

    async def test_typed_promise_without_tool_gets_one_followup(self):
        self.tutor.submit('Please write a blank for me')
        await self.tutor._queued_turn
        self.assertEqual(self.session.generate_reply.call_count, 2)
        self.assertIn('Pending request', self.session.generate_reply.call_args.kwargs['instructions'])

    async def test_successful_typed_write_has_no_extra_model_turn(self):
        async def complete():
            await self.tutor.write_step(self.context, 'r1', self.plan())
        self.session.generate_reply.return_value.wait_for_playout.side_effect = complete
        self.tutor.submit('Please write a blank for me')
        await self.tutor._queued_turn
        self.session.generate_reply.assert_called_once()

    async def test_review_cannot_draw_even_if_model_supplies_a_scaffold(self):
        result = await self.tutor.review_step(self.context, 'r1', self.plan())
        self.assertFalse(result['step_placed'])
        call = next(c for c in self.canvas.call.await_args_list if c.args[0] == 'apply_teaching_plan')
        self.assertIsNone(call.args[1]['scaffold'])
        self.assertIsNone(call.args[1]['completedStep'])
        self.assertNotIn('blank below', result['speech'])

    async def test_answer_does_not_automatically_fill_existing_blank(self):
        self.annotations = [{'id': 'blank-1', 'problem': '2+3*2', 'template': '2+6={{blank}}'}]
        plan = self.plan()
        plan.student_answer = '8'
        plan.answer_source = 'spoken'
        plan.checks = [Check(left='2+6', right='8', equal=True)]
        result = await self.tutor.review_step(self.context, 'r1', plan)
        self.assertFalse(result['step_placed'])
        call = next(c for c in self.canvas.call.await_args_list if c.args[0] == 'apply_teaching_plan')
        self.assertIsNone(call.args[1]['replaceAnnotationId'])
        self.assertIsNone(call.args[1]['completedStep'])

    async def test_writing_permission_is_consumed_by_one_step(self):
        self.request_writing()
        self.assertTrue((await self.tutor.write_step(self.context, 'r1', self.plan()))['step_placed'])
        again = await self.tutor.write_step(self.context, 'r1', self.plan())
        self.assertEqual(again['error'], 'writing_not_requested')

    async def test_new_answer_revokes_previous_writing_request(self):
        self.request_writing()
        self.request_writing('six')
        result = await self.tutor.write_step(self.context, 'r1', self.plan())
        self.assertEqual(result['error'], 'writing_not_requested')

    async def test_final_voice_request_authorizes_only_requested_writing(self):
        self.tutor.on_voice_transcript('Can you write that down?', False)
        self.assertFalse(self.tutor._writing_authorized)
        self.tutor.on_voice_transcript('Can you write that down?', True)
        self.assertTrue(self.tutor._writing_authorized)
        self.tutor.cancel_turn()
        await asyncio.gather(self.tutor._queued_turn, return_exceptions=True)
        self.assertFalse(self.tutor._writing_authorized)

    async def test_new_request_cancels_queued_review(self):
        self.ready = False
        self.tutor.submit('Check my work')
        pending = self.tutor._queued_turn
        await asyncio.wait_for(self.waiting.wait(), 1)
        self.tutor.submit('hello')
        await asyncio.gather(pending, return_exceptions=True)
        await self.tutor._queued_turn
        self.session.generate_reply.assert_called_once_with(user_input='hello', allow_interruptions=True)

    async def test_interrupt_cancels_pending_pen_wait(self):
        self.ready = False
        task = asyncio.create_task(self.inspect())
        await asyncio.wait_for(self.waiting.wait(), 1)
        self.tutor.cancel_turn()
        with self.assertRaises(StopResponse):
            await asyncio.wait_for(task, 1)
        self.canvas.capture.assert_not_awaited()

    async def test_native_tool_continuation_is_not_a_new_student_turn(self):
        await self.inspect()
        epoch = self.tutor._epoch
        self.tutor.on_user_state('speaking')
        self.assertEqual(self.tutor._epoch, epoch)
        result = await self.tutor.review_step(self.context, 'r1', self.plan())
        self.assertTrue(result['approved'])

    async def test_interrupted_speech_handle_cannot_draw(self):
        await self.inspect()
        self.context.speech_handle.interrupted = True
        with self.assertRaises(StopResponse):
            await self.tutor.review_step(self.context, 'r1', self.plan())
        self.assertFalse(any(c.args[0] == 'apply_teaching_plan' for c in self.canvas.call.await_args_list))

    async def test_review_automatically_inspects_this_turn(self):
        result = await self.tutor.review_step(self.context, 'r1', self.plan())
        self.assertTrue(result['approved'])
        self.canvas.capture.assert_awaited_once()
        self.tutor.cancel_turn()
        self.ready = False
        task = asyncio.create_task(self.tutor.review_step(self.context, 'r1', self.plan()))
        await asyncio.wait_for(self.waiting.wait(), 1)
        self.ready = True
        self.revision = 'r2'
        result = await asyncio.wait_for(task, 1)
        self.assertEqual(result['error'], 'stale_snapshot')

    async def test_wrong_math_is_rejected_before_annotation(self):
        await self.inspect()
        plan = self.plan()
        plan.student_answer = '7'
        plan.checks[0].right = '7'
        result = await self.tutor.review_step(self.context, 'r1', plan)
        self.assertFalse(result['approved'])
        self.assertEqual(result['vision'], 'available')
        self.assertFalse(any(c.args[0] == 'apply_teaching_plan' for c in self.canvas.call.await_args_list))

    async def test_new_ink_rejects_old_plan(self):
        await self.inspect()
        self.revision = 'r2'
        result = await self.tutor.review_step(self.context, 'r1', self.plan())
        self.assertEqual(result['error'], 'stale_snapshot')

    async def test_drawing_failure_keeps_math_and_vision_available(self):
        await self.inspect()
        self.annotation_result = {'success': False, 'error': 'invalid_scaffold'}
        result = await self.tutor.review_step(self.context, 'r1', self.plan())
        self.assertTrue(result['approved'])
        self.assertEqual(result['vision'], 'available')
        self.assertEqual(result['annotation'], 'unavailable')
        self.assertNotIn('blank', result['speech'])
        self.assertNotIn('see', result['speech'])

    async def test_success_preserves_svg_template_and_missing_value_speech(self):
        self.request_writing()
        await self.inspect()
        result = await self.tutor.write_step(self.context, 'r1', self.plan())
        self.assertTrue(result['approved'])
        self.assertEqual(result['speech'], "That's right. Write the missing value in the blank below.")
        call = next(c for c in self.canvas.call.await_args_list if c.args[0] == 'apply_teaching_plan')
        self.assertEqual(call.args[1]['scaffold'], '2+6={{blank}}')

    async def test_rewritten_line_gets_an_independent_local_check(self):
        await self.inspect()
        plan = self.plan()
        plan.student_answer = '2+6'
        result = await self.tutor.review_step(self.context, 'r1', plan)
        self.assertTrue(result['approved'])
        self.assertEqual(result['checks_passed'], 2)
        plan.student_answer = '2+7'
        result = await self.tutor.review_step(self.context, 'r1', plan)
        self.assertFalse(result['approved'])

    async def test_pan_retains_question_and_active_problem(self):
        await self.inspect()
        await self.tutor.review_step(self.context, 'r1', self.plan())
        self.revision = 'panned'
        await self.inspect()
        payload = json.loads(self.tutor.chat_ctx.items[-1].content[0].split('\n', 1)[1])
        self.assertEqual(payload['confirmed_question'], self.question)
        self.assertEqual(payload['active_problem'], '2+3*2')
        self.question = {'text': '5 * 5', 'confirmed': True}
        self.revision = 'replaced'
        await self.inspect()
        self.assertIsNone(self.tutor._active_problem)

    async def test_unchanged_board_does_not_resend_image(self):
        await self.inspect()
        await self.inspect()
        self.canvas.capture.assert_awaited_once()
        self.tutor.update_chat_ctx.assert_awaited_once()

    async def test_cold_inspection_fetches_state_and_image_concurrently(self):
        call = self.canvas.call.side_effect
        capture = self.canvas.capture.side_effect
        state_started, capture_started = asyncio.Event(), asyncio.Event()

        async def read_state(method, args):
            if method == 'get_canvas_state':
                state_started.set()
                await capture_started.wait()
            return await call(method, args)

        async def read_image():
            capture_started.set()
            await state_started.wait()
            return await capture()

        self.canvas.call.side_effect = read_state
        self.canvas.capture.side_effect = read_image
        result = await asyncio.wait_for(self.inspect(), 1)
        self.assertEqual(result['vision'], 'available')

    async def test_new_image_cannot_be_paired_with_old_question_state(self):
        capture = self.canvas.capture.side_effect
        calls = 0

        async def change_question():
            nonlocal calls
            calls += 1
            if calls == 1:
                self.question = {'text': '5 * 5', 'confirmed': True}
                self.revision = 'r2'
            return await capture()

        self.canvas.capture.side_effect = change_question
        result = await asyncio.wait_for(self.inspect(), 1)
        self.assertEqual(result['snapshotId'], 'r2')
        self.tutor.update_chat_ctx.assert_awaited_once()
        payload = json.loads(self.tutor.chat_ctx.items[-1].content[0].split('\n', 1)[1])
        self.assertEqual(payload['confirmed_question']['text'], '5 * 5')

    async def test_cached_review_needs_only_one_freshness_read_before_atomic_apply(self):
        await self.inspect()
        self.canvas.call.reset_mock()
        self.canvas.capture.reset_mock()
        result = await self.tutor.review_step(self.context, 'r1', self.plan())
        self.assertTrue(result['approved'])
        self.assertEqual([c.args[0] for c in self.canvas.call.await_args_list],
                         ['get_board_status', 'apply_teaching_plan'])
        self.canvas.capture.assert_not_awaited()

    async def test_new_ink_during_atomic_apply_rejects_cached_plan(self):
        await self.inspect()
        self.annotation_result = {'success': False, 'error': 'stale_snapshot_look_again'}
        result = await self.tutor.review_step(self.context, 'r1', self.plan())
        self.assertFalse(result['approved'])
        self.assertEqual(result['error'], 'stale_snapshot')
        self.assertIsNone(self.tutor._active_problem)

    async def test_pen_resume_during_capture_retries_request(self):
        capture = self.canvas.capture.side_effect
        calls = 0

        async def racing_capture():
            nonlocal calls
            calls += 1
            if calls == 1:
                self.ready = False
                self.revision = 'r2'
                raise RuntimeError('board changed during capture')
            return await capture()

        self.canvas.capture.side_effect = racing_capture
        task = asyncio.create_task(self.inspect())
        await asyncio.wait_for(self.waiting.wait(), 1)
        self.ready = True
        result = await asyncio.wait_for(task, 1)
        self.assertEqual(result['snapshotId'], 'r2')
        self.tutor.update_chat_ctx.assert_awaited_once()


if __name__ == '__main__':
    unittest.main()
