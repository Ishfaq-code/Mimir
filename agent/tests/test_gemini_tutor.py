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
        p = patch.object(GeminiTutor, 'session', new_callable=PropertyMock, return_value=self.session)
        p.start()
        self.addCleanup(p.stop)
        self.annotation_result = {'success': True, 'scaffoldPlaced': True}

        async def call(method, args):
            if method == 'get_board_status':
                return {'available': True, 'ready': self.ready, 'revision': self.revision if self.ready else None,
                        'preferences': {'oneStep': True}}
            if method == 'get_canvas_state':
                return {'question': self.question, 'preferences': {'oneStep': True}, 'tutorAnnotations': []}
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

    async def test_voice_turn_already_inspected_is_not_replayed(self):
        self.tutor.on_voice_transcript('Check my work', False)
        await self.inspect()
        self.tutor.on_voice_transcript('Check my work', True)
        self.assertIsNone(self.tutor._queued_turn)
        self.session.generate_reply.assert_not_called()

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
        await self.inspect()
        result = await self.tutor.review_step(self.context, 'r1', self.plan())
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
