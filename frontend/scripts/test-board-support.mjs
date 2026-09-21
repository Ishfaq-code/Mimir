import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import ts from 'typescript';
const temp = mkdtempSync(join(process.cwd(), '.board-check-'));
const modules = ['screenshot', 'tutor/types', 'tutor/support', 'tutor/boardView', 'tutor/store', 'tutor/handwriting', 'tutor/teachingPlan', 'canvas/types', 'canvas/inkRegions', 'canvas/renderer', 'canvas/capture'];
try {
  for (const name of modules) {
    const output = join(temp, `${name}.js`);
    mkdirSync(dirname(output), {recursive:true});
    writeFileSync(output, ts.transpileModule(readFileSync(`lib/${name}.ts`, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText);
  }
  const require = createRequire(import.meta.url);
  const board = require(join(temp,'tutor/boardView.js'));
  const support = require(join(temp,'tutor/support.js'));
  const teaching = require(join(temp,'tutor/teachingPlan.js'));
  const capture = require(join(temp,'canvas/capture.js'));
  const ink = require(join(temp,'canvas/inkRegions.js'));
  const view = {snapshotId:'test',revision:'a',width:1400,height:700,world:{x:-120,y:250,width:800,height:400},text:[],regions:[{id:'R1',bounds:{x:30,y:40,width:20,height:30}},{id:'R2',bounds:{x:90,y:42,width:22,height:32}}]};
  assert.deepEqual(board.regionToWorld(view,{x:250,y:500,width:100,height:100}),{x:80,y:450,width:80,height:40});
  for (const region of [{x:NaN,y:0,width:2,height:2},{x:-1,y:0,width:2,height:2},{x:999,y:0,width:3,height:2},{x:0,y:0,width:0,height:2}]) assert.equal(board.regionToWorld(view,region),null);
  let revision='a',captures=0,busy=false,settled=true;
  const detach=board.registerBoardSource({revision:()=>revision,isBusy:()=>busy,isSettled:()=>settled,capture:async()=>{captures++;return {view,blob:new Blob()};},snap:b=>b});
  const args={snapshotId:'test',x:250,y:500,width:100,height:100,label:'3 × 2'};
  assert.equal(board.highlightRegion(args).success,false);
  await board.captureBoard();
  await board.captureBoard();
  assert.equal(captures,1,'An unchanged board reuses its image and snapshot IDs');
  busy=true;
  assert.equal(board.getCurrentView('test'),null);
  assert.equal(board.getBoardStatus().ready,false);
  await assert.rejects(board.captureBoard(),/writing/);
  busy=false;
  settled=false;
  assert.equal(board.getBoardStatus().ready,false,'Brief pen lifts are still writing');
  assert.equal(board.getCurrentView('test'),null,'Do not apply a check while ink is settling');
  await assert.rejects(board.captureBoard(),/writing/);
  settled=true;
  assert.equal(board.highlightRegion(args).success,true);
  assert.deepEqual(board.getHighlight().bounds,{x:80,y:450,width:80,height:40});
  assert.equal(board.highlightKnownRegions({snapshotId:'test',regionIds:['R1','R2'],label:'3 × 2'}).success,true);
  assert.deepEqual(board.getHighlight().bounds,{x:30,y:40,width:82,height:34});
  assert.equal(board.highlightKnownRegions({snapshotId:'test',regionIds:['invented'],label:'x'}).error,'unknown_region');
  revision='b';
  assert.equal(board.highlightRegion(args).error,'stale_snapshot_look_again');
  await assert.rejects(board.captureBoard(), /changed/);
  revision='a';
  support.setPaused(true);
  assert.equal(board.highlightRegion(args).error,'highlight_disabled');
  await assert.rejects(board.captureBoard(), /paused/);
  support.setPaused(false);
  support.updatePreferences({highlights:false});
  assert.equal(board.highlightRegion(args).success,false);
  assert.equal(support.parsePreferences({calm:'yes',captions:false,largeText:true}).calm,false);
  assert.equal(support.getPreferences().captions,true);
  assert.equal(support.getPreferences().aiWrites,false,'Student writing is the default');
  assert.equal(support.parsePreferences({aiWrites:'true'}).aiWrites,false,'Malformed stored modes cannot enable automatic ink');
  assert.equal(support.parsePreferences({aiWrites:true}).aiWrites,true);
  const stroke=(id,x,y,width,height)=>({id,x,y,width,height,type:'freedraw',isDeleted:false,points:[{x:0,y:0,t:0},{x:width,y:height,t:1}]});
  assert.deepEqual(capture.snapToInk({x:20,y:30,width:120,height:60},[stroke('a',30,40,20,30),stroke('b',90,42,22,32),stroke('outside',200,40,20,30)]),{x:30,y:40,width:82,height:34});
  assert.equal(capture.inkRegions([stroke('one',30,40,20,0),stroke('two',50,40,0,30),stroke('three',90,40,20,30)]).length,2);
  const drawn=(id,points)=>({...stroke(id,0,0,0,0),style:{strokeColor:'#000',strokeWidth:2,fillColor:'transparent'},points:points.map(([x,y],t)=>({x,y,t}))});
  const parenthesesAndDigit=[
    drawn('parenthesis',[[52,0],[25,30],[15,90],[15,140],[35,180],[65,200]]),
    drawn('digit',[[60,65],[75,50],[110,50],[120,80],[85,130],[70,140],[125,125]]),
  ];
  assert.equal(ink.connectedInk(parenthesesAndDigit).length,2,'Overlapping rectangles do not merge separate curved ink');
  const plus=[drawn('horizontal',[[140,90],[180,90]]),drawn('vertical',[[160,65],[160,115]])];
  assert.deepEqual(ink.connectedInk(plus)[0].strokeIds,['horizontal','vertical'],'Intersecting strokes form one operator');
  const fakeCtx=new Proxy({},{get:(target,key)=>key==='measureText'?()=>({width:10}):()=>{},set:()=>true});
  const renderer=require(join(temp,'canvas/renderer.js'));
  // Exact stroke membership is retained, rather than inferred again from rectangle overlap.
  view.regions=[{id:'P',bounds:{x:15,y:0,width:50,height:200},strokeIds:['parenthesis']},{id:'D',bounds:{x:60,y:50,width:65,height:90},strokeIds:['digit']}];
  support.updatePreferences({highlights:true});
  assert.equal(board.highlightKnownRegions({snapshotId:'test',regionIds:['D'],label:'2'}).success,true);
  assert.deepEqual(board.getHighlight().strokeIds,['digit']);
  assert.deepEqual(board.getHighlight().nonInkRegions,[]);
  renderer.renderScene(fakeCtx,300,250,parenthesesAndDigit,new Set(),{x:0,y:0,zoom:1},false,new Set(),null,false,null,[],board.getHighlight());
  // Graph selection's hidden source strokes must coexist with precise tutoring tint.
  const paintedColors=[];
  let selectionRects=0;
  const combinedCtx=new Proxy({}, {get:(_,key)=>key==='strokeRect'?()=>selectionRects++:()=>{},set:(_,key,value)=>{if(key==='strokeStyle')paintedColors.push(value);return true;}});
  renderer.renderScene(combinedCtx,300,250,parenthesesAndDigit,new Set(['digit']),{x:0,y:0,zoom:1},false,new Set(),null,false,null,[],board.getHighlight(),new Set(['digit']));
  assert.ok(paintedColors.includes('#7954d6'),'Tutor highlights survive the graph renderer merge');
  assert.equal(selectionRects,0,'Typeset source strokes do not gain duplicate selection boxes');
  board.setFocus({x:10,y:10,width:300,height:300});
  assert.equal(board.getCurrentView('test'),null, 'Changing focus invalidates an in-flight answer');
  board.setFocus(null);
  const world={x:0,y:0,width:1200,height:720}, problem={x:100,y:120,width:200,height:30};
  const placed=teaching.scaffoldPosition(world,problem,250,64,[]);
  assert.ok(placed && placed.y>150);
  const belowOccupied=teaching.scaffoldPosition(world,problem,250,64,[{x:0,y:0,width:1200,height:720}]);
  assert.ok(belowOccupied.y>720,'Use empty space below a full viewport; reveal pans there');
  const belowWork=teaching.scaffoldPosition(world,problem,250,74,[{x:100,y:320,width:180,height:55},{x:850,y:650,width:150,height:60}]);
  assert.equal(belowWork.x+belowWork.width/2,200,'Stay centered on the working column');
  assert.ok(belowWork.y>375 && belowWork.y<650,'Follow the student work, not another column');
  assert.equal(teaching.scaffoldPosition(world,problem,2000,74,[]).x+1000,200,'Wide steps stay centered and full size on the infinite canvas');
  const handwriting=require(join(temp,'tutor/handwriting.js'));
  for(const expression of ['5 * 4 = {{blank}}','2*x + {{blank}} = 14','1/2 + 1/3 = {{blank}}','x^(2+1) = {{blank}}','X + x = {{blank}}']) {
    const drawing=handwriting.layoutHandwriting(expression);
    assert.ok(drawing?.paths.length && drawing.width>100);
    assert.ok(drawing.paths.every(p=>p.y-4*p.scale>=0 && p.y+44*p.scale<=drawing.height));
    assert.ok(drawing.paths.some(p=>p.d==='M3 35 Q49 34 98 35'),'Keep a wide handwriting blank');
  }
  const power=handwriting.layoutHandwriting('x^2');
  assert.ok(power.paths.some(p=>p.scale<1),'Powers are raised and scaled, not lost');
  assert.notDeepEqual(handwriting.layoutHandwriting('X').paths,handwriting.layoutHandwriting('x').paths,'Case must retain its mathematical meaning');
  assert.equal(handwriting.layoutHandwriting('x^('),null);
  assert.equal(handwriting.layoutHandwriting('<script>'),null);
  assert.equal(teaching.applyTeachingPlan({snapshotId:'old',problemRegionIds:['R1'],regionIds:[],label:'',scaffold:null}).success,false);
  const store = require(join(temp,'tutor/store.js'));
  view.world=world;
  view.regions=[
    {id:'R1',bounds:{x:110,y:120,width:40,height:120},strokeIds:['question']},
    {id:'R2',bounds:{x:150,y:310,width:40,height:60},strokeIds:['working-1'],strokeWidth:2},
    {id:'R3',bounds:{x:230,y:310,width:40,height:60},strokeIds:['working-2'],strokeWidth:2},
  ];
  assert.deepEqual(teaching.handwritingStyle(view.regions),{scale:2,x:150,bounds:{x:150,y:310,width:120,height:60},strokeWidth:2},'Use the latest handwriting line, not a larger question above');
  await board.captureBoard();
  const write={snapshotId:'test',problemRegionIds:['R1','R2','R3'],regionIds:[],label:'',problem:'2+3*2',scaffold:'2+6={{blank}}'};
  const written=teaching.applyTeachingPlan(write);
  assert.equal(written.stepPlaced,true);
  assert.equal(teaching.applyTeachingPlan({...write,aiWrites:true}).error,'writing_mode_changed','Switching back stops pending automatic ink');
  support.updatePreferences({aiWrites:true});
  assert.equal(teaching.applyTeachingPlan({...write,aiWrites:false}).error,'writing_mode_changed');
  assert.equal(teaching.applyTeachingPlan({...write,aiWrites:true}).reused,true);
  support.updatePreferences({aiWrites:false});
  const annotation=store.getTutorAnnotations()[0];
  assert.equal(annotation.handwritingScale,2);
  assert.equal(annotation.handwritingStrokeWidth,2,'Match pen thickness without making large writing artificially bold');
  assert.equal(annotation.x+annotation.width/2,210,'Center the full tutor line beneath the current handwritten line');
  assert.equal(annotation.width,handwriting.layoutHandwriting(write.scaffold).width*2);
  assert.equal(teaching.applyTeachingPlan(write).reused,true);
  assert.equal(store.getTutorAnnotations().length,1,'Repeated tool calls reuse the existing step');
  const fill={...write,scaffold:null,completedStep:'2+6=8',replaceAnnotationId:annotation.id};
  assert.equal(teaching.applyTeachingPlan(fill).stepPlaced,true);
  const filled=store.getTutorAnnotations()[0];
  assert.equal(store.getTutorAnnotations().length,1);
  assert.equal(filled.template,'2+6=8');
  assert.equal(filled.id,annotation.id);
  assert.equal(filled.x+filled.width/2,annotation.x+annotation.width/2,'Completed steps keep their center as the blank shrinks');
  assert.equal(filled.y,annotation.y);
  assert.equal(filled.handwritingScale,2,'Filling a tutor blank preserves size and position');
  const continued=teaching.applyTeachingPlan({...write,problem:'2 + 3 * 2',problemRegionIds:['R3'],scaffold:null,completedStep:'3*2=6'});
  assert.equal(continued.stepPlaced,true);
  const nextLine=store.getTutorAnnotations().find(a=>a.id===continued.annotationId);
  assert.equal(nextLine.x+nextLine.width/2,filled.x+filled.width/2,'Partial region selection must not move the established working column');
  assert.equal(nextLine.handwritingScale,filled.handwritingScale,'Consecutive tutor steps keep the same size');
  store.clearTutorAnnotations();
  const fresh=teaching.applyTeachingPlan(write);
  const freshAnnotation=store.getTutorAnnotations()[0];
  view.regions.push({id:'student-answer',strokeIds:['answer'],bounds:{x:freshAnnotation.x+10,y:freshAnnotation.y+10,width:20,height:30}});
  assert.equal(teaching.applyTeachingPlan({...fill,replaceAnnotationId:fresh.annotationId}).error,'blank_contains_student_ink');
  assert.equal(store.getTutorAnnotations()[0].template,write.scaffold,'Never overwrite a blank the student is filling');
  store.clearTutorAnnotations();
  // Screenshot regression: a handwritten answer on the RIGHT of a blank must
  // not become the next line's left edge or make all subsequent writing bigger.
  view.regions=[
    {id:'factor',bounds:{x:100,y:100,width:40,height:60},strokeIds:['factor'],strokeWidth:2},
    {id:'open',bounds:{x:148,y:85,width:20,height:90},strokeIds:['open'],strokeWidth:2},
    {id:'two',bounds:{x:175,y:100,width:40,height:60},strokeIds:['two'],strokeWidth:2},
    {id:'plus',bounds:{x:225,y:118,width:30,height:30},strokeIds:['plus'],strokeWidth:2},
    {id:'three',bounds:{x:265,y:100,width:40,height:60},strokeIds:['three'],strokeWidth:2},
    {id:'close',bounds:{x:315,y:85,width:20,height:90},strokeIds:['close'],strokeWidth:2},
  ];
  const chain={snapshotId:'test',problemRegionIds:view.regions.map(r=>r.id),regionIds:[],label:'',problem:'5*(2+3)',scaffold:'5*({{blank}})'};
  assert.equal(teaching.applyTeachingPlan(chain).stepPlaced,true);
  const blankLine=store.getTutorAnnotations()[0];
  assert.equal(blankLine.x+blankLine.width/2,217.5,'Center under the whole problem, including its parentheses');
  assert.equal(blankLine.handwritingScale,2,'Tall parentheses do not increase ordinary digit size');
  view.regions.push({id:'five',bounds:{x:blankLine.x+blankLine.width*.65,y:blankLine.y+20,width:50,height:100},strokeIds:['student-five'],strokeWidth:2});
  const second=teaching.applyTeachingPlan({...chain,problemRegionIds:['five'],scaffold:null,completedStep:'5*(5)'});
  assert.equal(second.stepPlaced,true);
  const fullLine=store.getTutorAnnotations().find(a=>a.id===second.annotationId);
  assert.equal(fullLine.x+fullLine.width/2,217.5,'An answer-only region still belongs to its existing centered column');
  assert.equal(fullLine.handwritingScale,blankLine.handwritingScale,'Answer ink inside a blank cannot enlarge the next row');
  assert.ok(fullLine.y>=blankLine.y+blankLine.height+28,'Write below the full prior line');
  const third=teaching.applyTeachingPlan({...chain,problemRegionIds:['five'],scaffold:null,completedStep:'5*(5)=25'});
  const resultLine=store.getTutorAnnotations().find(a=>a.id===third.annotationId);
  assert.equal(resultLine.x+resultLine.width/2,217.5);
  assert.ok(resultLine.y>=fullLine.y+fullLine.height+28);
  const parentheses=handwriting.layoutHandwriting('5*(5)').paths;
  assert.ok(parentheses.some(p=>p.d==='M12 -1 C0 6 0 27 11 36'));
  assert.ok(parentheses.some(p=>p.d==='M2 -1 C14 7 14 27 2 36'));
  store.clearTutorAnnotations();
  detach(); assert.equal(board.getHighlight(),null);
  console.log('Passed: world coordinates, invalid regions, stale images, pause, preferences, ink snapping, focus invalidation, scaffold placement and cleanup.');
} finally {rmSync(temp,{recursive:true,force:true});}
