// Browser checks use real React screens, simulated speech and intercepted APIs. No production data.
import { chromium } from 'playwright-core'
import assert from 'node:assert/strict'
import { mkdir, writeFile, rm } from 'node:fs/promises'
const harness = '.dorms-check/learning-harness.html'
await mkdir('.dorms-check', { recursive: true })
await writeFile(
  harness,
  `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';import {retryLearning} from '/src/learning/api.ts';import {createRoot} from 'react-dom/client';import {Ctx} from '/src/student/ctx.ts';import {worldState} from '/src/data/dreamWorld.ts';import {UNITS} from '/src/data/curriculum.ts';import {DOORU_BOOKS} from '/src/data/dooru.ts';import Practice from '/src/learning/Practice.tsx';import StoryActivities from '/src/learning/StoryActivities.tsx';import ReviewHub from '/src/learning/ReviewHub.tsx';import TeacherLearning from '/src/learning/TeacherLearning.tsx';import '/src/index.css';
const params=new URLSearchParams(location.search);const student={id:'test-student',class_id:'test-class',number:1,character:'boy',job:'doctor',dream_total:10,items:[],equipped:{}};const progress=new Map();
const ctx={student,progress,world:worldState(student,progress),earnDream:()=>{throw Error('Deep practice awarded unexpected stars')},updateStudent:()=>{},setProgressRow:()=>{throw Error('Deep practice changed lesson progress')},refreshStudent:async()=>{}};
window.SpeechRecognition=class {start(){this.onresult?.({results:[[{transcript:window.__say??document.querySelector('.bg-yellow-100')?.textContent?.trim()??''}]]});this.onend?.()} stop(){}};
const root=createRoot(document.getElementById('root'));window.exitCount=0;const exit=()=>{window.exitCount++;root.render(React.createElement('h1',{},'다음 화면'))};window.addEventListener('online',()=>void retryLearning(student.id));void retryLearning(student.id);const book=DOORU_BOOKS.find(b=>b.dir===Number(params.get('book')||14));const unit=UNITS.find(u=>u.id===(params.get('unit')||'1-1'));
const body=params.has('teacher')?React.createElement(TeacherLearning,{studentId:student.id}):params.has('hub')?React.createElement(ReviewHub,{onReview:exit}):params.has('book')?React.createElement(StoryActivities,{book,onExit:exit}):React.createElement(Practice,{unit,review:params.has('review'),onDone:exit,onExit:exit});
root.render(React.createElement(Ctx.Provider,{value:ctx},body));</script></body></html>`,
)
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' })
page.setDefaultTimeout(12000)
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
let epoch = 'epoch-one',
  failSave = false,
  failContext = false,
  rejectSave = null,
  delayedProgress = null,
  progressWrites = [],
  saved = [],
  calls = 0,
  round = 0,
  stage = 0,
  weak = ['ㄱ']
const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date())
await page.route('**/*', async (route) => {
  const req = route.request(),
    url = new URL(req.url())
  if (['localhost', '127.0.0.1'].includes(url.hostname)) return route.continue()
  if (url.hostname.startsWith('fonts.')) return route.fulfill({ status: 200, body: '' })
  const body = req.postDataJSON?.(),
    path = url.pathname
  let data = []
  if (path.endsWith('/rpc/learning_context')) {
    if (failContext) return route.abort('internetdisconnected')
    data = {
      epoch,
      schedules: [{ unit_id: '1-1', due_on: today, anchor_on: today, stage, round, weak }],
      practice: [],
      stories: [],
    }
  } else if (path.endsWith('/progress') && req.method() === 'POST') {
    progressWrites.push(body)
    if (delayedProgress) await delayedProgress
    data = null
  } else if (path.endsWith('/rpc/submit_learning')) {
    calls++
    if (failSave) return route.abort('internetdisconnected')
    if (rejectSave) return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify(rejectSave)})
    saved.push(body)
    data = null
  } else if (path.endsWith('/learning_sessions'))
    data = saved.map((r, i) => ({
      id: String(i),
      unit_id: r.p_unit,
      kind: r.p_kind,
      results: r.p_results,
      reflection: r.p_reflection,
      created_at: new Date().toISOString(),
    }))
  else if (path.endsWith('/learning_schedule')) data = [{ unit_id: '1-1', due_on: today, weak }]
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
})
const url = (query = '') => 'http://127.0.0.1:5173/' + harness + '?' + query
const getDraft = (kind) =>
  page.evaluate((kind) => JSON.parse(localStorage.getItem('batchim.learning.v1:test-student:' + (new URLSearchParams(location.search).get('unit') || '1-1') + ':' + kind)), kind)
async function fill(kind = 'practice') {
  for (let i = 0; i < 4; i++) {
    await page.locator('.mission-question').waitFor()
    // Initial draft is stored on load, and after every answer.
    const d = await getDraft(kind),
      at = d.answers.findIndex((a) => !a.resolved),
      correct = d.questions[at].options.find((o) => o.correct).label
    await page.getByRole('button', { name: correct + ' 선택', exact: true }).click()
    await page.getByRole('button', { name: i === 3 ? '새 낱말 읽기 ▶' : '다음 문제 ▶', exact: true }).click()
  }
}
async function readAll(count) {
  for (let i = 0; i < count; i++) {
    await page.getByRole('button', { name: '🎤 내가 읽어 볼래요', exact: true }).click()
    await page.getByRole('button', { name: i === count - 1 ? '끝! ▶' : '다음 문장 ▶', exact: true }).click()
  }
}
try {
  // A failed context request with no cache must lead on, never to a retry/error card.
  failContext = true
  await page.goto(url())
  await page.getByText('다음 화면', { exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: '다시 불러오기' }).count(), 0)
  failContext = false
  await page.goto(url())
  await page.getByText('2단계 · 빠진 받침 채우기', { exact: true }).waitFor()
  let d = await getDraft('practice')
  assert.equal(d.questions.length, 4)
  assert.equal(d.readings.length, 4)
  assert.equal(await page.locator('.mission-word-card').count(), 0)
  await page.screenshot({ path: '.dorms-check/learning-fill.png', fullPage: true })
  // Wrong answer persisted across a reload and leads to a weak result.
  const wrong = d.questions[0].options.find((o) => !o.correct).label
  await page.getByRole('button', { name: wrong + ' 선택', exact: true }).click()
  await page.reload()
  await page.locator('.mission-word-card').waitFor()
  assert.equal((await getDraft('practice')).answers[0].first_correct, false)
  await fill()
  await page.getByText('3단계 · 새 낱말과 문장을 읽어요', { exact: false }).waitFor()
  await page.screenshot({ path: '.dorms-check/learning-read.png', fullPage: true })
  await readAll(4)
  failSave = true
  failContext = true
  // The old completed draft is still available when loading context fails.
  await page.reload()
  await page.getByRole('button', { name: '결과 저장하기', exact: true }).click()
  await page.getByText('다음 화면', { exact: true }).waitFor()
  assert.equal(await page.evaluate(() => window.exitCount), 1)
  assert.equal(await getDraft('practice'), null)
  assert.equal(saved.length, 0)
  const pending = () => page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('batchim.learning.pending.v1:test-student:')).map(k => JSON.parse(localStorage.getItem(k))))
  assert.equal((await pending()).length, 1)
  await page.reload()
  await page.getByText('다음 화면', { exact: true }).waitFor()
  assert.equal((await pending()).length, 1)
  failContext = false
  await page.evaluate(async () => { const {retryLearning} = await import('/src/learning/api.ts'); await retryLearning('test-student') })
  assert.equal((await pending()).length, 1, 'a failed server save must retain the result')
  assert.equal(saved.length, 0)
  failSave = false
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await page.waitForFunction(() => !Object.keys(localStorage).some(k => k.startsWith('batchim.learning.pending.v1:')))
  assert.equal(saved.length, 1)
  assert.equal(saved[0].p_results.length, 8)
  assert.equal(saved[0].p_results[0].first, false)
  assert.equal(saved[0].p_results[0].helped, true)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  assert.equal(saved.length, 1)
  console.log('PASS save advances once offline, completed draft survives context failure, reload and automatic reconnect retry')
  await page.goto(url('review=1'))
  await page.getByText('다시 만나는 복습', { exact: true }).waitFor()
  d = await getDraft('review')
  assert.equal(d.readings.length, 2)
  assert.notDeepEqual(d.readings, ['목도리', '박수'])
  await fill('review')
  await readAll(2)
  await page.getByRole('button', { name: '결과 저장하기', exact: true }).click()
  await page.getByText('다음 화면', { exact: true }).waitFor()
  await page.waitForFunction(() => !Object.keys(localStorage).some(k => k.startsWith('batchim.learning.pending.v1:')))
  assert.equal(saved[1].p_results.length, 6)
  console.log('PASS due review: alternate questions and reading, six independent results')
  await page.goto(url('hub=1'))
  await page.getByRole('button', { name: /복습하기/ }).waitFor()
  await page.screenshot({ path: '.dorms-check/learning-review.png', fullPage: true })
  // Every story screen is reachable and grounded in its book, no runtime exceptions.
  for (const book of [14, 22, 44, 19, 43, 39, 50, 60, 49, 52, 57, 200, 66, 61, 78, 63, 114]) {
    await page.goto(url('book=' + book))
    await page.getByRole('button', { name: '생각 확인하기', exact: true }).waitFor()
  }
  await page.goto(url('book=14'))
  await page.getByRole('button', { name: '아주 추운 바닷가', exact: true }).click()
  await page.getByRole('button', { name: '생각 확인하기', exact: true }).click()
  await page.getByRole('button', { name: '다음 활동 ▶', exact: true }).click()
  await page.getByRole('button', { name: '날기', exact: true }).click()
  await page.getByRole('button', { name: '생각 확인하기', exact: true }).click()
  await page.getByRole('button', { name: '다음 활동 ▶', exact: true }).click()
  await page.screenshot({ path: '.dorms-check/learning-story-order.png', fullPage: true })
  for (const text of ['사는 곳을 말해요.', '헤엄치며 먹이를 잡는다고 해요.', '날개는 있지만 날지 못한다고 해요.'])
    await page.getByRole('button', { name: text, exact: true }).click()
  await page.getByRole('button', { name: '생각 확인하기', exact: true }).click()
  await page.getByRole('button', { name: '다음 활동 ▶', exact: true }).click()
  await page.getByLabel(/내 생각/).fill('이 동물은 추운 바닷가에서 살고 헤엄을 잘 쳐요.')
  await page.reload()
  await page.getByLabel(/내 생각/).waitFor()
  assert((await page.getByLabel(/내 생각/).inputValue()).includes('헤엄'))
  await page.screenshot({ path: '.dorms-check/learning-story-write.png', fullPage: true })
  await page.getByRole('button', { name: '내 생각 전하기', exact: true }).click()
  await page.getByText('다음 화면', { exact: true }).waitFor()
  await page.waitForFunction(() => !Object.keys(localStorage).some(k => k.startsWith('batchim.learning.pending.v1:')))
  assert.equal(saved[2].p_results.length, 3)
  assert(saved[2].p_reflection.includes('헤엄'))
  await page.goto(url('teacher=1'))
  await page.getByText(saved[2].p_reflection, { exact: true }).waitFor()
  await page.getByText('학생의 한 문장 · 교사 확인용', { exact: true }).waitFor()
  console.log('PASS 17 story activities, comprehension, ordering, persisted reflection and teacher visibility')
  // Storage failure must never claim a result was saved unless the server accepts it.
  const sample = {id:'storage-check',student:'test-student',epoch,unit:'1-1',kind:'practice',round:0,results:saved[0].p_results,reflection:''}
  failSave = true
  const storageFailure = await page.evaluate(async sample => {
    const {saveLearningAndContinue} = await import('/src/learning/api.ts')
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = () => { throw new Error('storage full') }
    try { await saveLearningAndContinue(sample); return 'incorrectly accepted' }
    catch { return 'retained on screen' }
    finally { Storage.prototype.setItem = original }
  }, sample)
  assert.equal(storageFailure, 'retained on screen')
  failSave = false
  // Permission/validation failures keep the answer; a teacher reset fences old work.
  rejectSave = {code:'42501',message:'not allowed'}
  await page.evaluate(async sample => {
    const {saveLearningAndContinue,retryLearning} = await import('/src/learning/api.ts')
    await saveLearningAndContinue(sample)
    await Promise.all([retryLearning(sample.student),retryLearning(sample.student)])
  }, sample)
  assert.equal((await pending()).length, 1)
  rejectSave = null
  epoch = 'reset-epoch'
  const beforeReset = saved.length
  await page.evaluate(async () => {const {retryLearning}=await import('/src/learning/api.ts');await retryLearning('test-student')})
  assert.equal((await pending()).length, 0)
  assert.equal(saved.length, beforeReset, 'never resubmit pre-reset answers under a new epoch')
  console.log('PASS failed storage/server cannot silently discard answers, retries are serialized, teacher reset is respected')
  // Loading from cached context remains usable while disconnected, including a new unit.
  failContext = true
  await page.goto(url('unit=1-2'))
  await page.locator('.mission-question').waitFor()
  failContext = false
  // flush callers must await the ongoing request; edits to the same row cannot be dropped.
  let releaseProgress
  delayedProgress = new Promise(resolve => { releaseProgress = resolve })
  await page.evaluate(async () => {
    const { enqueue, flush } = await import('/src/lib/queue.ts')
    enqueue({k:'progress',row:{student_id:'test-student',unit_id:'1-1',level:'word',passed:false}})
    enqueue({k:'progress',row:{student_id:'test-student',unit_id:'1-1',level:'word',passed:true}})
    window.flushDone = false
    void flush().then(() => { window.flushDone = true })
  })
  assert.equal(await page.evaluate(() => window.flushDone), false)
  delayedProgress = null
  releaseProgress()
  await page.waitForFunction(() => window.flushDone)
  assert.deepEqual(progressWrites.map(p => p.passed), [false, true])
  console.log('PASS concurrent queue flush waits and preserves edits made during transmission')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(url('unit=2-6'))
  await page.locator('.mission-question').waitFor()
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await page.screenshot({ path: '.dorms-check/learning-mobile.png', fullPage: true })
  // An authoritative new epoch discards a stale local practice before replay.
  epoch = 'epoch-two'
  await page.reload()
  await page.locator('.mission-question').waitFor()
  assert.equal(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('batchim.learning.v1:test-student:2-6:practice')).submission.epoch,
    ),
    epoch,
  )
  await fill()
  await page.evaluate(() => {window.__say='비행기'})
  await page.getByRole('button',{name:'🎤 내가 읽어 볼래요',exact:true}).click()
  for(let i=0;i<2;i++) await page.getByRole('button',{name:'🎤 문장 다시 읽기',exact:true}).click()
  await page.getByText('손을 들어요. 선생님이 확인하면 넘어가요.',{exact:false}).waitFor()
  assert.equal(await page.getByRole('button',{name:'다음 문장 ▶',exact:true}).count(),0)
  assert.equal(await page.getByRole('button',{name:'결과 저장하기',exact:true}).count(),0)
  console.log('PASS three failed readings still require teacher confirmation')
  assert.deepEqual(errors, [])
  console.log('PASS mobile layout, reset epoch reconciliation and no runtime errors')
} catch (e) {
  console.log((await page.locator('body').innerText()).slice(0, 1500))
  console.log(errors)
  await page.screenshot({ path: '.dorms-check/learning-failure.png', fullPage: true })
  throw e
} finally {
  await browser.close()
  await rm(harness, { force: true })
}
