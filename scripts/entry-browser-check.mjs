// Exercise the real app. All remote requests are intercepted; no production accounts or records.
import { chromium } from 'playwright-core'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
// supabase-js 는 로그인 세션을 sb-<프로젝트 앞부분>-auth-token 에 저장한다. 내 .env.local 주소에서 계산한다.
const envUrl = process.env.VITE_SUPABASE_URL || (() => { try { return /^VITE_SUPABASE_URL=(.+)$/m.exec(readFileSync('.env.local', 'utf8'))?.[1]?.trim() } catch { return undefined } })() || 'http://localhost:54321'
const storageKey = `sb-${new URL(envUrl).hostname.split('.')[0]}-auth-token`
const browser = await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']})
const page = await browser.newPage({viewport:{width:1280,height:800},reducedMotion:'reduce'})
page.setDefaultTimeout(10000)
const errors=[];page.on('pageerror',e=>errors.push(e.message))
const user={id:'33333333-3333-4333-8333-333333333333',aud:'authenticated',role:'authenticated',is_anonymous:true}
const expires_at=Math.floor(Date.now()/1000)+3600
const token='eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({sub:user.id,role:'authenticated',exp:expires_at})).toString('base64url')+'.test'
const session={access_token:token,refresh_token:'test-refresh',expires_at,expires_in:3600,token_type:'bearer',user}
const student={id:'test-student',class_id:'test-class',number:1,character:'boy',job:'doctor',dream_total:7,items:[],equipped:{}}
let joins=[],codes=[],holdJoin=false,holdProgress=false,release=()=>{},progressRows=[],failContext=false,failSave=false,saved=[]
const base=process.env.BATCHIM_TEST_URL || 'http://127.0.0.1:5173'
await page.route('**/*',async route=>{
 const req=route.request(),url=new URL(req.url())
 if(url.origin===new URL(base).origin){
  if(url.protocol==='http:')return route.continue()
  const response=await fetch(req.url());const headers=Object.fromEntries(response.headers)
  delete headers['content-encoding'];delete headers['content-length']
  return route.fulfill({status:response.status,headers,body:Buffer.from(await response.arrayBuffer())})
 }
 if(url.hostname.startsWith('fonts.'))return route.fulfill({status:200,body:''})
 const body=req.postDataJSON?.(),path=url.pathname;let data=[]
 if(path.endsWith('/auth/v1/signup')||path.endsWith('/auth/v1/token'))data=session
 else if(path.endsWith('/rpc/class_size')){codes.push(body.p_code);data=body.p_code==='123456'?2:0}
 else if(path.endsWith('/rpc/join_class')){
  joins.push(body);if(holdJoin){holdJoin=false;await new Promise(resolve=>{release=resolve})}data=student
 }else if(path.endsWith('/progress')&&holdProgress){holdProgress=false;await new Promise(resolve=>{release=resolve})}
 else if(path.endsWith('/progress'))data=progressRows
 else if(path.endsWith('/students'))data=student
 else if(path.endsWith('/rpc/learning_context')){
  if(failContext)return route.abort('internetdisconnected')
  data={epoch:'test-epoch',schedules:[],practice:[],stories:[]}
 }else if(path.endsWith('/rpc/submit_learning')){
  if(failSave)return route.abort('internetdisconnected')
  saved.push(body);data=null
 }
 return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)})
})
await page.addInitScript(({session,storageKey})=>{
 localStorage.setItem('batchim.login.v1',JSON.stringify({code:'654321',number:2}))
 localStorage.setItem(storageKey,JSON.stringify(session))
 localStorage.setItem('batchim.learning.v1:retained-draft','retained')
},{session,storageKey})
const blank=async()=>{
 await page.getByText('선생님이 알려 준 코드를 눌러요',{exact:true}).waitFor()
 assert(await page.getByRole('button',{name:'입장하기 ▶',exact:true}).isDisabled())
 assert.equal(await page.getByRole('button',{name:'친구 바꾸기',exact:true}).count(),0)
 assert.equal(await page.evaluate(()=>localStorage.getItem('batchim.login.v1')),null)
 assert.equal(await page.evaluate(()=>localStorage.getItem('batchim.learning.v1:retained-draft')),'retained')
}
const code=async()=>{
 for(const n of '123456')await page.getByRole('button',{name:n,exact:true}).click()
 await page.getByRole('button',{name:'입장하기 ▶',exact:true}).click()
 await page.getByText('내 번호를 눌러요',{exact:true}).waitFor()
}
const enter=async()=>{
 await code();await page.getByRole('button',{name:'1',exact:true}).click()
 await page.getByText('🗺️ 받침 여행 지도',{exact:true}).waitFor()
}
const restore=()=>page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})))
try{
 for(const path of ['/','/join','/join/','/?c=123456','/?utm_source=teacher']){
  await page.goto(base+path);await blank();assert.equal(joins.length,0)
  await page.reload();await blank();assert.equal(joins.length,0)
 }
 console.log('PASS all direct/QR URLs and reloads require a blank class code despite saved student and auth session')
 await enter();assert.deepEqual(joins,[{p_code:'123456',p_number:1}])
 assert.equal(await page.evaluate(()=>localStorage.getItem('batchim.login.v1')),null)
 await page.getByRole('button').filter({hasText:/^1-1/}).click({force:true}) // The lesson tile continuously bobs.
 await page.getByRole('button',{name:'시작하기 ▶',exact:true}).waitFor()
 await page.getByRole('button',{name:'지도로',exact:true}).click()
 await page.getByText('🗺️ 받침 여행 지도',{exact:true}).waitFor();assert.equal(joins.length,1)
 console.log('PASS explicit code → number → dashboard, internal lesson navigation stays in the current session')
 await page.reload();await blank();assert.equal(joins.length,1)
 await enter();await restore();await blank();assert.equal(joins.length,2)
 await code();await restore();await blank()
 console.log('PASS restored browser page and partially entered login both restart at an empty code')
 await code();holdJoin=true
 const request=page.waitForRequest('**/rpc/join_class'),response=page.waitForResponse('**/rpc/join_class')
 await page.getByRole('button',{name:'1',exact:true}).click();await request
 await restore();await blank();release();await response;await page.waitForTimeout(100);await blank()
 console.log('PASS late join response cannot resurrect the previous student')
 await code();holdProgress=true
 const progressRequest=page.waitForRequest('**/rest/v1/progress?*'),progressResponse=page.waitForResponse('**/rest/v1/progress?*')
 await page.getByRole('button',{name:'1',exact:true}).click();await progressRequest
 await restore();await blank();release();await progressResponse;await page.waitForTimeout(100);await blank()
 console.log('PASS late progress response cannot restore a dashboard after a new entry')
 await enter()
 await page.evaluate(()=>{history.pushState({key:'another-entry'},'','/join');window.dispatchEvent(new PopStateEvent('popstate',{state:history.state}))})
 await blank();assert.deepEqual(errors,[])
 console.log('PASS client-side entry navigation, no runtime errors, learning drafts preserved')
 // Reproduce the completed result card inside the real lesson and parent navigation.
 progressRows=['word','sentence'].map(level=>({student_id:student.id,unit_id:'1-1',level,passed:true,first_try_correct:7,total:8}))
 await enter()
 await page.evaluate(()=>{
  const submission={id:'complete-result',student:'test-student',epoch:'test-epoch',unit:'1-1',kind:'practice',round:0,reflection:'',results:Array.from({length:8},(_,i)=>({id:'answer-'+i,skill:'ㄱ',first:i>0,passed:true,helped:i===0}))}
  localStorage.setItem('batchim.learning.v1:test-student:1-1:practice',JSON.stringify({submission,questions:[],answers:[],readings:[],at:4,readingDone:true}))
 })
 const openUnit=async()=>{
  await page.getByRole('button').filter({hasText:/^1-1/}).click({force:true})
  await page.getByRole('button',{name:'시작하기 ▶',exact:true}).click()
 }
 await openUnit()
 failSave=true
 await page.getByRole('button',{name:'결과 저장하기',exact:true}).click()
 await page.getByText('단원 1-1 통과!',{exact:true}).waitFor()
 assert.equal(await page.getByRole('button',{name:'결과 저장하기',exact:true}).count(),0)
 assert.equal(await page.getByRole('button',{name:'계속하기 ▶',exact:true}).count(),0)
 assert.equal(saved.length,0)
 await page.reload();await blank();await enter();await openUnit()
 await page.getByText('단원 1-1 통과!',{exact:true}).waitFor()
 failSave=false
 const sent=page.waitForResponse('**/rpc/submit_learning')
 await page.evaluate(()=>window.dispatchEvent(new Event('online')));await sent
 await page.waitForFunction(()=>!Object.keys(localStorage).some(k=>k.startsWith('batchim.learning.pending.v1:')))
 assert.equal(saved.length,1)
 failContext=true
 await page.getByRole('button',{name:'받침 여행 지도 ▶',exact:true}).click()
 await page.evaluate(()=>localStorage.removeItem('batchim.learning.context.v1:test-student'))
 await openUnit()
 await page.getByText('단원 1-1 통과!',{exact:true}).waitFor()
 assert.equal(await page.getByRole('button',{name:'다시 불러오기',exact:true}).count(),0)
 assert.deepEqual(errors,[])
 console.log('PASS real app: save directly advances, offline result survives re-entry, reconnect saves once, context error cannot trap student')

}catch(e){console.log((await page.locator('body').innerText()).slice(0,1000));console.log(errors);throw e}
finally{release();await browser.close()}
