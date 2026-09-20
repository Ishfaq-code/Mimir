"""Reuse verified hints and check unambiguous short numeric answers without another model."""
import ast
import re
from math_check import polynomial, equivalent
from planner import TeachingPlan, Check, Scaffold, validate_plan

def is_hint_request(text: str) -> bool:
    value=' '.join(re.sub(r"[?.!,]",'',text.lower().replace('’',"'")).split())
    value=re.sub(r'^(?:hey mimir |mimir |please |um |uh )','',value)
    return value in {
        'help','help me','can you help','can you help me','can you help me with this',
        'give me a hint','can you give me a hint','i need a hint','hint','next hint',
        "i'm stuck look at my current work color the part i should focus on and give me just the next hint",
        "i'm stuck",'im stuck','i am stuck',"i'm completely stuck",'i am completely stuck',
        "i'm confused",'im confused','i am confused',"i don't know what to do",
        'what do i do','what do i do first','what do i do next','what should i do next',
        'where do i start','where do i go from here','how do i start','how do i solve this',
        'check my work','check my handwriting',
    }

def numeric_answer(text: str) -> str | None:
    value=text.lower().replace('’',"'").strip().rstrip('?.!')
    value=re.sub(r'^(?:um |uh |i think |so )','',value)
    value=re.sub(r"^(?:it is |it's |the answer is |that is |that's )",'',value).strip()
    words=['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen','twenty']
    if value in words:return str(words.index(value))
    if re.fullmatch(r'[+-]?\d+(?:\.\d+)?(?:/\d+)?',value) and len(value)<=20:return value
    return None

def fast_answer(text: str, previous: TeachingPlan, view: dict) -> TeachingPlan | None:
    answer=numeric_answer(text)
    focus=previous.focus_expression
    if answer is None or not focus or previous.status!='hint':return None
    try:
        # Only a grounded numeric AST subtree is eligible, never an invented calculation.
        source=previous.problem
        if '=' in source:return None
        focus_tree=ast.parse(focus.replace('^','**'),mode='eval').body
        source_tree=ast.parse(source.replace('^','**'),mode='eval').body
        if not isinstance(focus_tree,ast.BinOp) or any(isinstance(n,ast.Name) for n in ast.walk(source_tree)):return None
        target=ast.dump(focus_tree)
        if not any(ast.dump(n)==target for n in ast.walk(source_tree)):return None
        value=polynomial(focus)
        if len(value)!=1:return None
        correct=equivalent(focus,answer)
        plan=previous.model_copy(deep=True)
        plan.status='correct' if correct else 'incorrect';plan.student_answer=answer
        plan.checks=[Check(left=focus,right=answer,equal=correct)];plan.scaffold=None
        plan.focus_expression=None
        if not correct:
            plan.speech=f'Not quite. Try {focus.replace("*"," times ").replace("+"," plus ")} again.'
        elif equivalent(source,answer):
            plan.speech="Yes, that's right. You've finished this problem."
        else:
            class Reduce(ast.NodeTransformer):
                replaced=False
                def visit_BinOp(self,node):
                    if not self.replaced and ast.dump(node)==target:
                        self.replaced=True
                        return ast.parse(str(value[0]),mode='eval').body
                    return self.generic_visit(node)
            reduced=ast.unparse(Reduce().visit(source_tree))
            total=polynomial(reduced)
            if len(total)!=1:return None
            plan.scaffold=Scaffold(template=reduced+' = {{blank}}',answer=str(total[0]))
            plan.speech="Yes. Write the next total in the blank."
        validate_plan(plan,view)
        return plan
    except (ValueError,SyntaxError,ZeroDivisionError,OverflowError):return None

def anticipated_confirmation(previous: TeachingPlan, view: dict) -> str | None:
    """The same checked confirmation can be synthesized while the student thinks."""
    if not previous.focus_expression:return None
    try:
        value=polynomial(previous.focus_expression)
        if len(value)!=1:return None
        reply=fast_answer(str(value[0]),previous,view)
        return reply.speech if reply else None
    except (ValueError,SyntaxError,ZeroDivisionError,OverflowError):return None
