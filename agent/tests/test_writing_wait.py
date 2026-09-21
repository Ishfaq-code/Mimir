import asyncio
import unittest
from unittest.mock import AsyncMock, MagicMock, PropertyMock, patch

from planner import TeachingPlan, Planner, Check, Scaffold
from tutor import MathTutor


class WritingWait(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.tutor = object.__new__(MathTutor)
        self.tutor._epoch = 1
        self.tutor._history = []
        self.tutor._active = None
        self.tutor._canvas = MagicMock()
        self.tutor._planner = MagicMock()
        self.tutor._speak = AsyncMock()
        self.ready = False
        self.revision = 'r1'
        self.waiting = asyncio.Event()
        self.applied = []
        self.applications = []
        self.preferences = {'aiWrites': False}
        self.session = MagicMock()
        self.session.userdata.paused = False
        self.session.user_state = 'listening'
        self.session.interrupt = AsyncMock()
        self.session_patch = patch.object(MathTutor, 'session', new_callable=PropertyMock, return_value=self.session)
        self.session_patch.start()
        self.addCleanup(self.session_patch.stop)

        async def rpc(method, args):
            if method == 'get_board_status':
                return {'ready': self.ready, 'revision': self.revision if self.ready else None, 'available': True, 'preferences': self.preferences}
            if method == 'set_tutor_status' and args['status'] == 'waiting': self.waiting.set()
            if method == 'apply_teaching_plan':
                self.applied.append(args['snapshotId'])
                self.applications.append(args)
                return {'success': args['snapshotId'] == self.revision,
                        'error': 'stale_snapshot_look_again', 'stepPlaced': bool(args.get('completedStep') or args.get('scaffold'))}
            return {}

        async def capture():
            return {'snapshotId': self.revision, 'revision': self.revision, 'regions': [{'id': 'R1'}]}, b'image'

        self.tutor._canvas.call = AsyncMock(side_effect=rpc)
        self.tutor._canvas.capture = AsyncMock(side_effect=capture)
        self.tutor._planner.plan = AsyncMock(return_value=self.plan('CURRENT CHECK'))

    def plan(self, speech):
        return TeachingPlan(status='hint', problem='2+2', problem_region_ids=['R1'],
                            highlight_region_ids=[], highlight_label='', speech=speech, checks=[], scaffold=None)

    async def test_requested_check_waits_without_capturing_or_speaking(self):
        task = asyncio.create_task(self.tutor._respond('check my work', 1))
        await asyncio.wait_for(self.waiting.wait(), 1)
        self.tutor._canvas.capture.assert_not_awaited()
        self.tutor._planner.plan.assert_not_awaited()
        self.tutor._speak.assert_not_awaited()
        self.ready = True
        await asyncio.wait_for(task, 1)
        self.tutor._speak.assert_awaited_once_with('CURRENT CHECK')

    async def test_new_strokes_during_check_reuse_request_with_fresh_snapshot(self):
        self.ready = True
        async def plan(*args):
            if self.revision == 'r1':
                self.revision = 'r2'
                return self.plan('OUTDATED CHECK')
            return self.plan('CURRENT CHECK')
        self.tutor._planner.plan.side_effect = plan
        await self.tutor._respond('check my work', 1)
        self.assertEqual(self.applied, ['r1', 'r2'])
        self.assertEqual(self.tutor._canvas.capture.await_count, 2)
        self.tutor._speak.assert_awaited_once_with('CURRENT CHECK')
        self.assertEqual(self.tutor._history[-1]['text'], 'CURRENT CHECK')

    async def test_pen_resuming_during_capture_waits_and_recaptures(self):
        self.ready = True
        count = 0
        async def capture():
            nonlocal count
            count += 1
            if count == 1:
                self.ready = False
                self.revision = 'r2'
                raise RuntimeError('pen moved during image encoding')
            return {'snapshotId': self.revision, 'revision': self.revision, 'regions': [{'id': 'R1'}]}, b'new ink'
        self.tutor._canvas.capture.side_effect = capture
        task = asyncio.create_task(self.tutor._respond('check my work', 1))
        await asyncio.wait_for(self.waiting.wait(), 1)
        self.tutor._planner.plan.assert_not_awaited()
        self.ready = True
        await asyncio.wait_for(task, 1)
        self.assertEqual(self.applied, ['r2'])
        self.tutor._speak.assert_awaited_once_with('CURRENT CHECK')

    async def test_cancel_while_writing_never_restarts_review(self):
        self.tutor._turn = asyncio.create_task(self.tutor._respond('check my work', 1))
        await asyncio.wait_for(self.waiting.wait(), 1)
        self.tutor.cancel_turn()
        with self.assertRaises(asyncio.CancelledError): await self.tutor._turn
        self.ready = True
        self.tutor._canvas.capture.assert_not_awaited()
        self.tutor._speak.assert_not_awaited()

    async def test_pause_while_waiting_does_not_review(self):
        task = asyncio.create_task(self.tutor._respond('check my work', 1))
        await asyncio.wait_for(self.waiting.wait(), 1)
        self.session.userdata.paused = True
        await asyncio.wait_for(task, 1)
        self.tutor._canvas.capture.assert_not_awaited()
        self.tutor._speak.assert_not_awaited()

    async def test_scaffold_speech_requests_only_the_missing_value(self):
        planner = object.__new__(Planner)
        planner.client = MagicMock()
        response = MagicMock()
        response.usage = None
        response.output_parsed = TeachingPlan(status='correct', problem='2+3*2', student_answer='6',
            problem_region_ids=['R1'], highlight_region_ids=[], highlight_label='',
            speech='Now write 2 + 6 = in the blank.', checks=[Check(left='3*2', right='6', equal=True)],
            scaffold=Scaffold(template='2+6={{blank}}', answer='8'))
        planner.client.responses.parse = AsyncMock(return_value=response)
        plan = await planner.plan('Please write the next step for me', {}, {'regions':[{'id':'R1'}]}, b'image', [], None)
        self.assertIsNotNone(plan.scaffold)
        self.assertEqual(plan.speech, "That's right. Write the missing value in the blank below.")

    async def test_legacy_planner_removes_unrequested_writing(self):
        planner = object.__new__(Planner)
        planner.client = MagicMock()
        response = MagicMock()
        response.usage = None
        response.output_parsed = TeachingPlan(status='correct', problem='2+3*2', student_answer='6',
            answer_source='spoken', problem_region_ids=['R1'], highlight_region_ids=[], highlight_label='',
            speech='I wrote the next step below.', checks=[Check(left='3*2', right='6', equal=True)],
            scaffold=Scaffold(template='2+6={{blank}}', answer='8'))
        planner.client.responses.parse = AsyncMock(return_value=response)
        plan = await planner.plan('six', {}, {'regions': [{'id': 'R1'}]}, b'image', [], None)
        self.assertIsNone(plan.scaffold)
        self.assertEqual(plan.speech, "That's right. Write that answer on your canvas.")

    async def test_legacy_ai_mode_records_correct_spoken_answer(self):
        self.ready = True
        self.preferences['aiWrites'] = True
        plan = self.plan('Correct.')
        plan.status, plan.student_answer, plan.answer_source = 'correct', '4', 'spoken'
        plan.checks = [Check(left='2+2', right='4', equal=True)]
        self.tutor._planner.plan.return_value = plan
        await self.tutor._respond('four', 1)
        self.assertEqual(self.applications[-1]['completedStep'], '2+2=4')
        self.assertTrue(self.applications[-1]['aiWrites'])
        self.assertNotIn('Write', self.tutor._speak.call_args.args[0])


if __name__ == '__main__': unittest.main()
