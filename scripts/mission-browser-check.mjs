// Actual React screens with deterministic test responses; never writes to production.
import { chromium } from 'playwright-core'
import assert from 'node:assert/strict'
import { mkdir, writeFile, rm } from 'node:fs/promises'
const harness='.dorms-check/mission-harness.html'
await mkdir('.dorms-check',{recursive:true})
await writeFile(harness,`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {Ctx} from '/src/student/ctx.ts';import {UNITS} from '/src/data/curriculum.ts';
import {fetchOwnStudent} from '/src/lib/api.ts';import {worldState} from '/src/data/dreamWorld.ts';import {buildQuestions} from '/src/lib/quiz.ts';
import {checkpointUnits} from '/src/mission/checkpoints.ts';import UnitPlay from '/src/student/UnitPlay.tsx';
import MissionGate from '/src/mission/MissionGate.tsx';import TeacherMissions from '/src/mission/TeacherMissions.tsx';
import MapScreen from '/src/student/MapScreen.tsx';import '/src/index.css';
Math.random=()=>0.42;
const params=new URLSearchParams(location.search),unit=UNITS.find(u=>u.id===(params.get('unit')||'1-4'));
const job=params.get('job')||'doctor';window.__serverStudent={id:'test-student',class_id:'test-class',number:1,character:'boy',job,dream_total:40,items:[job+'-outfit-0'],equipped:{}};
window.__stars=0;
let rows=checkpointUnits(unit).flatMap(u=>['word','sentence'].map(level=>({student_id:'test-student',unit_id:u.id,level,first_try_correct:8,total:8,passed:true})));
if(params.has('lesson'))rows=rows.filter(r=>r.unit_id!==unit.id || (params.has('wordpassed')&&r.level==='word'));
if(params.has('incomplete'))rows=rows.slice(0,-1);
const progress=new Map(rows.map(r=>[r.unit_id+'|'+r.level,r]));
window.__lessonQuestions=buildQuestions(unit,params.has('wordpassed')?'sentence':'word').map(q=>q.target);
function Harness(){
 const [student,setStudent]=useState(window.__serverStudent),[screen,setScreen]=useState(params.has('lesson')?'lesson':params.has('map')?'map':'mission');
 const ctx={student,progress,world:worldState(student,progress),earnDream:()=>window.__stars++,updateStudent:()=>{throw Error('Unexpected client reward write')},setProgressRow:r=>progress.set(r.unit_id+'|'+r.level,r),refreshStudent:async()=>setStudent(await fetchOwnStudent(student.id))};
 const exit=()=>setScreen('exit');
 return React.createElement(Ctx.Provider,{value:ctx},params.has('blank')?null:params.has('teacher')?React.createElement(TeacherMissions,{studentId:student.id}):screen==='exit'?'지도로 돌아왔어요':screen==='map'?React.createElement(MapScreen,{onUnit:()=>{},onDone:()=>{},onReadTest:()=>{},onMission:()=>setScreen('mission')}):screen==='lesson'?React.createElement(UnitPlay,{unit,onExit:exit,onMission:()=>setScreen('mission')}):React.createElement(MissionGate,{unit,currentWrong:[],onNext:exit,onReset:exit}));
}createRoot(document.getElementById('root')).render(React.createElement(Harness));
</script></body></html>`)
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']})
const context=await browser.newContext({viewport:{width:1280,height:800},reducedMotion:'reduce'})
const page=await context.newPage();page.setDefaultTimeout(12000)
const errors=[];page.on('pageerror',e=>errors.push(e.message))
let serverStudent={id:'test-student',class_id:'test-class',number:1,character:'boy',job:'doctor',dream_total:40,items:['doctor-outfit-0'],equipped:{}}
let epoch='generation-one',eligible=true,offline=false,missing=false,runs=new Map(),rewards=new Map(),history=[],joins=0
await page.route('**/*',async route=>{
 const req=route.request(),u=new URL(req.url());if(['127.0.0.1','localhost'].includes(u.hostname))return route.continue()
 if(u.hostname==='fonts.googleapis.com'||u.hostname==='fonts.gstatic.com')return route.fulfill({status:200,body:''})
 if(offline)return route.abort('internetdisconnected')
 const body=req.postDataJSON?.(),path=u.pathname;let data=[]
 if(path.endsWith('/rpc/checkpoint_context')){
  if(missing)return route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({code:'PGRST202'})})
  data={epoch,eligible,run:runs.get(body.p_unit_id)||null}
 }else if(path.endsWith('/rpc/learning_context')){data={epoch,schedules:[],practice:['1-1','1-2','1-3','1-4'],stories:[]}}else if(path.endsWith('/checkpoint_runs')){
  if(req.method()==='POST'){
   const old=runs.get(body.unit_id)
   if(body.epoch===epoch&&(!old||(old.status==='started'&&old.revision<body.revision)))runs.set(body.unit_id,body)
   data=null
  }else data=[...runs.values()]
 }else if(path.endsWith('/rpc/claim_checkpoint_reward')){
  assert.equal(runs.get(body.p_unit_id)?.status,'completed')
  const s=serverStudent
  if(!rewards.has(body.p_unit_id)){
   const indices=s.job==='firefighter'?[1,2,4]:[0,3,4]
   const item=indices.map(i=>s.job+'-tool-'+i).find(x=>!s.items.includes(x))||null
   if(item)s.items.push(item)
   rewards.set(body.p_unit_id,{item_id:item,job:s.job,student:s})
   serverStudent=s
  }
  data=rewards.get(body.p_unit_id)
 }else if(path.endsWith('/students'))data=serverStudent
 else if(path.endsWith('/attempts'))data=history
 else if(path.endsWith('/rpc/join_class')){joins++;data={}}
 return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)})
})
const url=(q='')=>'http://127.0.0.1:5173/'+harness+'?'+q
const draft=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('batchim.checkpoint.v1:test-student:'+(new URLSearchParams(location.search).get('unit')||'1-4'))))
async function clear(){await page.goto(url('blank=1'));await page.evaluate(()=>localStorage.clear());runs.clear();rewards.clear();history=[]}
async function begin(query=''){const job=new URLSearchParams(query).get('job')||'doctor';serverStudent={...serverStudent,job,items:[job+'-outfit-0']};await page.goto(url(query));await page.getByRole('button',{name:'좋아! 도와줄게'}).click();await page.locator('.mission-question').waitFor()}
async function answer(correct=true){const d=await draft(),i=d.run.results.findIndex(r=>!r.resolved&&!r.continued),o=d.questions[i].options.find(o=>o.correct===correct);await page.getByRole('button',{name:o.label+' 선택',exact:true}).click();await page.waitForTimeout(380)}
async function finish(start=0){for(let i=start;i<12;i++){await answer();await page.getByRole('button',{name:i===11?'미션 마치기':'다음 친구 만나기',exact:true}).click()}}
try{
 // Direct URLs, QR and legacy QR always start with an empty class code.
 await page.addInitScript(()=>localStorage.setItem('batchim.login.v1',JSON.stringify({code:'654321',number:2})))
 for(const path of ['/','/join','/?c=123456']){
  await page.goto('http://127.0.0.1:5173'+path)
  await page.getByText('선생님이 알려 준 코드를 눌러요',{exact:true}).waitFor()
  assert(await page.getByRole('button',{name:'입장하기 ▶'}).isDisabled());assert.equal(joins,0)
 }
 console.log('PASS direct URL and QR: stored student never bypasses empty class-code entry')
 await clear();await begin()
 assert.equal((await draft()).questions.length,12)
 assert.equal(await page.locator('.mission-word-card').count(),0,'answer spelling must be hidden before hint')
 assert((await page.locator('.mission-scene').boundingBox()).height>=430)
 assert((await page.locator('.mission-companion').boundingBox()).height>=280)
 await page.screenshot({path:'.dorms-check/mission-rescue.png',fullPage:true})
 await answer(false);await answer(false);await answer(false)
 await page.getByRole('button',{name:'설명을 보고 함께 넘어가기'}).click()
 await page.getByRole('button',{name:'다음 친구 만나기',exact:true}).click();await finish(1)
 await page.getByText('청진기를 얻었어요!',{exact:true}).waitFor()
 assert.equal((await draft()).run.results[0].continued,true)
 assert.equal(await page.evaluate(()=>window.__stars),0);assert.equal(rewards.size,1)
 await page.goto(url());await page.locator('.mission-reward').waitFor();assert.equal(await page.locator('.mission-question').count(),0)
 assert.equal(rewards.size,1)
 console.log('PASS assessment: twelve questions, hidden answer, larger scene, hints, reward and no duplicate play')
 await page.goto(url('teacher=1'));await page.getByText('설명 후 진행 · 지도 참고').waitFor()
 console.log('PASS teacher: checkpoint and assisted result remain separate from lesson scores')
 await clear();await begin('unit=2-4&job=firefighter');await answer();await page.getByRole('button',{name:'다음 친구 만나기',exact:true}).click()
 offline=true;await answer(false);const saved=(await draft()).questions[1].id;offline=false
 await page.goto(url('unit=2-4&job=firefighter'));await page.locator('.mission-question').waitFor();assert.equal((await draft()).questions[1].id,saved)
 await page.screenshot({path:'.dorms-check/mission-treasure.png',fullPage:true});await finish(1)
 await page.getByText('소방 헬멧을 얻었어요!',{exact:true}).waitFor()
 assert((await page.locator('.mission-reward img').getAttribute('src')).endsWith('firefighter-tool-1.webp'))
 assert.equal(await page.locator('img[src*="chest-open"]').count(),0)
 await page.screenshot({path:'.dorms-check/mission-reward.png',fullPage:true})
 console.log('PASS treasure: offline resume and firefighter career tool replaces telescope')
 await clear();history=Array.from({length:16},(_,i)=>({id:i+1,student_id:'test-student',level:i<8?'word':'sentence',unit_id:'1-1',item_id:'event-'+i,target:'test',is_correct:i<8,first_try:true,created_at:new Date(2026,9,1,i).toISOString()})).reverse()
 await begin();assert.equal((await draft()).run.kind,'train');await finish();await page.getByText('병원에 도착했어요!').waitFor()
 await page.screenshot({path:'.dorms-check/mission-train.png',fullPage:true})
 console.log('PASS train: four-unit personalized sentence review')
 await clear();await begin();await answer(false);epoch='generation-two';eligible=false;runs.clear()
 await page.getByText('지도로 돌아왔어요').waitFor();assert.equal(await draft(),null);eligible=true
 console.log('PASS reset: active assessment exits and stale draft is discarded')
 await clear();await begin();await page.getByRole('button',{name:'잠깐 쉬기',exact:true}).click();await page.getByText('지도로 돌아왔어요').waitFor();assert.equal(rewards.size,0);assert.equal((await draft()).run.status,'started')
 await page.goto(url());await page.locator('.mission-question').waitFor();assert.equal((await draft()).run.results.length,12)
 await clear();await page.setViewportSize({width:390,height:844});await begin('unit=2-4')
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'.dorms-check/mission-mobile.png',fullPage:true})
 console.log('PASS pause and resume without reward, and narrow-screen layout')
 await clear();await page.setViewportSize({width:1280,height:800});await page.goto(url('lesson=1&unit=1-1'))
 await page.getByRole('button',{name:'시작하기 ▶'}).click()
 const targets=await page.evaluate(()=>window.__lessonQuestions)
 for(let i=0;i<targets.length;i++){
  await page.getByRole('button',{name:targets[i],exact:true}).click()
  await page.getByRole('button',{name:i===targets.length-1?'끝! ▶':'다음 ▶',exact:true}).click()
 }
 await page.getByRole('button',{name:'다음으로 ▶',exact:true}).click();await page.getByText('1단계 · 문장 듣기',{exact:false}).first().waitFor()
 assert.equal(await page.locator('.mission-scene').count(),0)
 console.log('PASS normal unit: word completion goes directly to sentences')
 await clear();await page.goto(url('lesson=1&wordpassed=1&unit=1-4'));await page.getByRole('button',{name:'시작하기 ▶'}).click()
 const sentences=await page.evaluate(()=>window.__lessonQuestions)
 for(let i=0;i<sentences.length;i++){
  await page.getByRole('button',{name:sentences[i],exact:true}).click()
  await page.getByRole('button',{name:i===sentences.length-1?'끝! ▶':'다음 ▶',exact:true}).click()
 }
 await page.getByText('2단계 · 빠진 받침 채우기',{exact:true}).waitFor()
 assert.equal(await page.getByRole('button',{name:'중간 평가 미션 ▶'}).count(),0)
 console.log('PASS fourth unit: sentence completion enters deeper practice before assessment')
 await page.goto(url('map=1&incomplete=1'));assert(await page.getByRole('button',{name:/1차 중간 평가/}).isDisabled())
 await clear();missing=true;await page.goto(url());await page.getByText('지도로 돌아왔어요').waitFor();missing=false
 assert.deepEqual(errors,[]);console.log('PASS eligibility, missing migration fallback and no runtime errors')
}catch(e){console.log('Page errors:',errors);console.log((await page.locator('body').innerText()).slice(0,1400));await page.screenshot({path:'.dorms-check/mission-failure.png',fullPage:true});throw e}
finally{await browser.close();await rm(harness,{force:true})}
