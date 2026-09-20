import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import ts from 'typescript';
const temp = mkdtempSync(join(process.cwd(), '.board-check-'));
const modules = ['screenshot', 'tutor/types', 'tutor/support', 'tutor/boardView', 'tutor/store', 'tutor/teachingPlan', 'canvas/types', 'canvas/inkRegions', 'canvas/renderer', 'canvas/capture'];
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
  let revision='a',captures=0,busy=false;
  const detach=board.registerBoardSource({revision:()=>revision,isBusy:()=>busy,capture:async()=>{captures++;return {view,blob:new Blob()};},snap:b=>b});
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
  assert.equal(teaching.scaffoldPosition(world,problem,250,64,[{x:0,y:0,width:1200,height:720}]),null, 'Do not write over occupied space');
  assert.equal(teaching.applyTeachingPlan({snapshotId:'old',problemRegionIds:['R1'],regionIds:[],label:'',scaffold:null}).success,false);
  detach(); assert.equal(board.getHighlight(),null);
  console.log('Passed: world coordinates, invalid regions, stale images, pause, preferences, ink snapping, focus invalidation, scaffold placement and cleanup.');
} finally {rmSync(temp,{recursive:true,force:true});}
