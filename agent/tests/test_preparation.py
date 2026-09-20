import asyncio
import unittest
from unittest.mock import AsyncMock, MagicMock
from planner import TeachingPlan, validate_plan
from preparation import BoardPreparation
from fast_turn import is_hint_request, fast_answer, numeric_answer

VIEW={'snapshotId':'s1','revision':'r1','regions':[{'id':f'R{i}'} for i in range(1,7)]}
def hint():
    return TeachingPlan(status='hint',problem='5*(2+2)',problem_region_ids=[f'R{i}' for i in range(1,7)],highlight_region_ids=['R3','R4','R5'],highlight_label='2 + 2',focus_expression='2+2',speech='What is two plus two?',checks=[],scaffold=None)

class FastAnswers(unittest.TestCase):
    def test_hint_intent_does_not_swallow_specific_questions(self):
        for text in ["I'm stuck",'What do I do first?','Can you help me with this?',"I'm stuck. Look at my current work, color the part I should focus on and give me just the next hint."]:
            self.assertTrue(is_hint_request(text))
        for text in ['What do I do first on the right?', 'Help me with 3+4', 'Why do we multiply?', 'Read this', 'Stop']:
            self.assertFalse(is_hint_request(text))
    def test_grounded_numeric_answer_is_checked_locally(self):
        p=fast_answer('four',hint(),VIEW)
        self.assertEqual(p.status,'correct')
        self.assertEqual(p.scaffold.template,'5 * 4 = {{blank}}')
        self.assertEqual(p.scaffold.answer,'20')
        validate_plan(p,VIEW)
        p=fast_answer('five',hint(),VIEW)
        self.assertEqual(p.status,'incorrect');self.assertIsNone(p.scaffold)
        self.assertEqual(p.highlight_region_ids,['R3','R4','R5'])
    def test_no_guessing_from_ambiguous_or_unrelated_answers(self):
        for text in ['four or five','is it four?','four why','4+0','I think we multiply']:
            self.assertIsNone(numeric_answer(text))
        p=hint();p.focus_expression='3+3'
        self.assertIsNone(fast_answer('six',p,VIEW))
        p=hint();p.problem='5*(x+2)'
        self.assertIsNone(fast_answer('four',p,VIEW))
    def test_final_answer_finishes_without_new_exercise(self):
        p=hint();p.problem='2+2'
        answer=fast_answer('4',p,VIEW)
        self.assertIsNone(answer.scaffold)
        self.assertIn('finished',answer.speech)

class Cache(unittest.IsolatedAsyncioTestCase):
    def setup_cache(self):
        self.canvas=MagicMock();self.canvas.call=AsyncMock(return_value={})
        self.canvas.capture=AsyncMock(return_value=(VIEW,b'image'))
        self.planner=MagicMock();self.planner.plan=AsyncMock(return_value=hint())
        self.cache=BoardPreparation(self.canvas,self.planner,lambda:([],None),lambda:False,lambda:False)
    async def test_unchanged_revision_reuses_single_analysis(self):
        self.setup_cache();self.cache.begin('r1')
        a=await self.cache.take('r1');b=await self.cache.take('r1')
        self.assertIs(a,b);self.planner.plan.assert_awaited_once()
        self.assertIsNone(await self.cache.take('r2'))
        await self.cache.close()
    async def test_new_revision_discards_and_cancels_old_analysis(self):
        self.setup_cache();started=asyncio.Event()
        async def slow(*args):started.set();await asyncio.Future()
        self.planner.plan=slow;self.cache.begin('r1')
        pending=self.cache.pending
        await started.wait();self.cache.invalidate()
        await asyncio.gather(pending,return_exceptions=True)
        self.assertTrue(pending.cancelled());self.assertIsNone(self.cache.ready)
        await self.cache.close()
    async def test_cancelled_question_does_not_cancel_shared_preparation(self):
        self.setup_cache();gate=asyncio.Event()
        async def slow(*args):await gate.wait();return hint()
        self.planner.plan=slow;self.cache.begin('r1')
        waiter=asyncio.create_task(self.cache.take('r1'));await asyncio.sleep(0)
        waiter.cancel();await asyncio.gather(waiter,return_exceptions=True)
        gate.set();self.assertIsNotNone(await self.cache.take('r1'))
        await self.cache.close()
    async def test_invalidating_board_allows_waiting_question_to_capture_again(self):
        self.setup_cache();gate=asyncio.Event()
        async def slow(*args):gate.set();await asyncio.Future()
        self.planner.plan=slow;self.cache.begin('r1')
        waiter=asyncio.create_task(self.cache.take('r1'))
        await gate.wait();self.cache.invalidate()
        self.assertIsNone(await waiter)
        await self.cache.close()
    async def test_prepared_hint_skips_foreground_model_and_capture(self):
        from tutor import MathTutor
        from unittest.mock import patch,PropertyMock
        self.setup_cache();self.cache.begin('r1');await self.cache.take('r1')
        tutor=object.__new__(MathTutor)
        tutor._epoch=1;tutor._history=[];tutor._active=None;tutor._preparation=self.cache
        tutor._canvas=self.canvas;tutor._planner=self.planner;tutor._speak=AsyncMock()
        async def rpc(name,args):
            if name=='get_board_status':return {'ready':True,'revision':'r1'}
            if name=='apply_teaching_plan':return {'success':True}
            return {}
        self.canvas.call=AsyncMock(side_effect=rpc)
        session=MagicMock();session.userdata.paused=False;session.interrupt=AsyncMock()
        with patch.object(MathTutor,'session',new_callable=PropertyMock,return_value=session):
            await tutor._respond('What do I do first?',1)
            await tutor._respond('4',1)
        self.planner.plan.assert_awaited_once();self.canvas.capture.assert_awaited_once()
        self.assertEqual(tutor._speak.await_count,2)
        await self.cache.close()

if __name__=='__main__':unittest.main()
