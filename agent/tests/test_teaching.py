import asyncio
import unittest
from unittest.mock import AsyncMock, MagicMock
from math_check import equivalent, polynomial, valid_scaffold
from planner import TeachingPlan, Check, Scaffold, validate_plan, finished_problem
from tutor import MathTutor, meaningful_transcript, conversation_control

class MathChecks(unittest.TestCase):
    def test_arithmetic_and_algebra(self):
        for a,b,expected in [('2+3*2','8',True),('2+3*2','10',False),('2*3','7',False),('1/3+1/6','1/2',True),('2*(x+3)=14','2*x+3=14',False),('2*(x+3)=14','2*x+6=14',True),('-3*x=12','x=-4',True),('2*x+6=14','x=4',True),('x+2=x+3','2=3',True)]:
            self.assertEqual(equivalent(a,b),expected,(a,b))
    def test_no_execution_or_unbounded_math(self):
        for expression in ['__import__("os").system("echo bad")','2**1000000','x/y','1/0','[1][0]','True','a+b','1e999']:
            with self.assertRaises((ValueError,OverflowError,ZeroDivisionError)): polynomial(expression)
    def test_blank_preserves_equation(self):
        self.assertTrue(valid_scaffold('2 + 6 = {{blank}}','8','2+3*2'))
        self.assertTrue(valid_scaffold('2*x + {{blank}} = 14','6','2*(x+3)=14'))
        self.assertFalse(valid_scaffold('2 + 6 = {{blank}}','10','2+3*2'))
        self.assertFalse(valid_scaffold('2*x + {{blank}} = 14','3','2*(x+3)=14'))
    def test_bad_judgment_rejected(self):
        view={'regions':[{'id':'R1'}]}
        p=TeachingPlan(status='correct',problem='2*3',student_answer='7',problem_region_ids=['R1'],highlight_region_ids=[],highlight_label='',speech='Yes',checks=[Check(left='2*3',right='7',equal=True)],scaffold=None)
        with self.assertRaises(ValueError):validate_plan(p,view)
        p.student_answer='6'
        p.checks=[Check(left='2*3',right='6',equal=True)]
        validate_plan(p,view)
        p.highlight_region_ids=['R2']
        with self.assertRaises(ValueError):validate_plan(p,view)
    def test_final_answer_does_not_invent_new_problem(self):
        p=TeachingPlan(status='correct',problem='2+3*2',student_answer='8',problem_region_ids=['R1'],highlight_region_ids=[],highlight_label='',speech='Yes',checks=[Check(left='2+6',right='8',equal=True)],scaffold=None)
        self.assertTrue(finished_problem(p))
        p.student_answer='2+6'
        self.assertFalse(finished_problem(p))
        p.student_answer='6'
        p.checks=[Check(left='3*2',right='6',equal=True)]
        self.assertFalse(finished_problem(p))
        p.scaffold=Scaffold(template='3*3={{blank}}',answer='9')
        with self.assertRaises(ValueError):validate_plan(p,{'regions':[{'id':'R1'}]})
    def test_handwritten_equation_answer_is_checked_without_retry(self):
        p=TeachingPlan(status='correct',problem='2+3*2',student_answer='3*2=6',problem_region_ids=['R1'],highlight_region_ids=[],highlight_label='',speech='Yes',checks=[Check(left='3*2',right='6',equal=True)],scaffold=None)
        view={'regions':[{'id':'R1'}]}
        validate_plan(p,view)
        self.assertFalse(finished_problem(p))
        p.scaffold=Scaffold(template='2+6={{blank}}',answer='8')
        validate_plan(p,view)
        p.scaffold=Scaffold(template='100={{blank}}',answer='100')
        with self.assertRaises(ValueError):validate_plan(p,view)
        p.scaffold=None
        p.student_answer='2+6=8';p.checks=[Check(left='2+6',right='8',equal=True)]
        validate_plan(p,view)
        self.assertTrue(finished_problem(p))
        p.student_answer='3*2=7'
        with self.assertRaises(ValueError):validate_plan(p,view)
        p.status='incorrect';p.checks=[Check(left='3*2',right='7',equal=False)]
        validate_plan(p,view)
    def test_noise_does_not_start_turn(self):
        for text in ['', '...', '[noise]', '[BLANK_AUDIO]', '(music)']:
            self.assertFalse(meaningful_transcript(text))
        for text in ['6','six','stop','wait','No']:
            self.assertTrue(meaningful_transcript(text))
    def test_only_conversational_controls_skip_math(self):
        self.assertEqual(conversation_control('Wait, stop!'),'stop')
        self.assertEqual(conversation_control('Can you repeat that?'),'repeat')
        for text in ['repeat 2+3','wait, why is it six?','no','6','hello, check my work']:
            self.assertIsNone(conversation_control(text))

class TurnGate(unittest.IsolatedAsyncioTestCase):
    async def test_stop_and_repeat_do_not_wait_for_vision(self):
        tutor=object.__new__(MathTutor)
        tutor._epoch=1;tutor._canvas=MagicMock();tutor._planner=MagicMock();tutor._last_speech='What is three times two?'
        tutor._canvas.call=AsyncMock(return_value={'ready':True,'revision':'r1'});tutor._canvas.capture=AsyncMock()
        tutor._planner.plan=AsyncMock();tutor._speak=AsyncMock()
        session=MagicMock();session.userdata.paused=False;session.interrupt=AsyncMock()
        from unittest.mock import patch,PropertyMock
        with patch.object(MathTutor,'session',new_callable=PropertyMock,return_value=session):
            await tutor._respond('Stop',1)
            tutor._speak.assert_not_awaited()
            await tutor._respond('Repeat that',1)
        tutor._canvas.capture.assert_not_awaited()
        tutor._planner.plan.assert_not_awaited()
        tutor._speak.assert_awaited_once_with('What is three times two?')

    async def test_speech_start_cancels_pending_math_before_transcript(self):
        tutor=object.__new__(MathTutor)
        tutor._epoch=1;tutor._canvas=MagicMock();tutor._canvas.call=AsyncMock()
        tutor._barge_in=None;tutor._turn=asyncio.create_task(asyncio.sleep(30))
        session=MagicMock();session.userdata.paused=False;session.user_state='speaking';session.interrupt=AsyncMock()
        from unittest.mock import patch,PropertyMock
        with patch.object(MathTutor,'session',new_callable=PropertyMock,return_value=session):
            tutor.on_user_state('speaking')
            await tutor._barge_in
        self.assertTrue(tutor._turn.cancelled())
        session.interrupt.assert_awaited_once_with(force=True)
        self.assertEqual(tutor._epoch,2)

    async def test_short_noise_blip_does_not_cancel_math(self):
        tutor=object.__new__(MathTutor)
        tutor._epoch=1;tutor._barge_in=None;tutor.cancel_turn=MagicMock()
        session=MagicMock();session.userdata.paused=False;session.interrupt=AsyncMock()
        from unittest.mock import patch,PropertyMock
        with patch.object(MathTutor,'session',new_callable=PropertyMock,return_value=session):
            tutor.on_user_state('speaking')
            pending=tutor._barge_in
            tutor.on_user_state('listening')
            await asyncio.gather(pending,return_exceptions=True)
        tutor.cancel_turn.assert_not_called()
        session.interrupt.assert_not_awaited()

    async def test_cancelled_capture_cannot_leave_background_work(self):
        tutor=object.__new__(MathTutor)
        tutor._epoch=1;tutor._canvas=MagicMock();tutor._planner=MagicMock();tutor._history=[];tutor._active=None
        capturing=asyncio.Event(); cancelled=asyncio.Event()
        async def capture():
            capturing.set()
            try: await asyncio.Future()
            finally: cancelled.set()
        tutor._canvas.call=AsyncMock(return_value={'ready':True,'revision':'r1'})
        tutor._canvas.capture=capture
        tutor._planner.plan=AsyncMock();tutor._speak=AsyncMock()
        session=MagicMock();session.userdata.paused=False;session.interrupt=AsyncMock()
        from unittest.mock import patch,PropertyMock
        with patch.object(MathTutor,'session',new_callable=PropertyMock,return_value=session):
            tutor._turn=asyncio.create_task(tutor._respond('hint',1))
            await asyncio.wait_for(capturing.wait(),1)
            tutor.cancel_turn()
            with self.assertRaises(asyncio.CancelledError):await tutor._turn
        self.assertTrue(cancelled.is_set())
        tutor._planner.plan.assert_not_awaited()
        tutor._speak.assert_not_awaited()

    async def test_capture_failure_never_calls_planner(self):
        tutor=object.__new__(MathTutor)
        tutor._epoch=1;tutor._canvas=MagicMock();tutor._planner=MagicMock();tutor._history=[];tutor._active=None
        tutor._canvas.call=AsyncMock(return_value={'ready':True,'revision':'r1'})
        tutor._canvas.capture=AsyncMock(side_effect=RuntimeError('capture failed'))
        tutor._planner.plan=AsyncMock();tutor._speak=AsyncMock()
        session=MagicMock();session.userdata.paused=False;session.interrupt=AsyncMock()
        from unittest.mock import patch,PropertyMock
        with patch.object(MathTutor,'session',new_callable=PropertyMock,return_value=session):
            await tutor._respond('check my work',1)
        tutor._planner.plan.assert_not_awaited()
        self.assertIn("reliable check",tutor._speak.call_args.args[0])
    async def test_annotation_failure_does_not_discard_verified_math(self):
        tutor=object.__new__(MathTutor)
        tutor._epoch=1;tutor._canvas=MagicMock();tutor._planner=MagicMock();tutor._history=[];tutor._active=None
        async def rpc(name,args):return {'success':False,'error':'invalid_scaffold'} if name=='apply_teaching_plan' else {'ready':True,'revision':'r1'}
        tutor._canvas.call=AsyncMock(side_effect=rpc)
        tutor._canvas.capture=AsyncMock(return_value=({'snapshotId':'v1','revision':'r1','regions':[{'id':'R1'}]},b'image'))
        p=TeachingPlan(status='hint',problem='x',problem_region_ids=['R1'],highlight_region_ids=[],highlight_label='',speech='Which operation would you try first?',checks=[],scaffold=None)
        tutor._planner.plan=AsyncMock(return_value=p);tutor._speak=AsyncMock()
        session=MagicMock();session.userdata.paused=False
        interrupted=asyncio.get_running_loop().create_future();interrupted.set_result(None)
        session.interrupt=MagicMock(return_value=interrupted)
        from unittest.mock import patch,PropertyMock
        with patch.object(MathTutor,'session',new_callable=PropertyMock,return_value=session):await tutor._respond('hint',1)
        tutor._speak.assert_awaited_once_with('Which operation would you try first?')

if __name__=='__main__':unittest.main()
