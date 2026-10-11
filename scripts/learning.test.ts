import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { UNITS, activeWords, activeSentences } from '../src/data/curriculum'
import { DOORU_BOOKS } from '../src/data/dooru'
import { TRANSFER, fillQuestion, koreaDay } from '../src/learning/content'
import { STORY_ACTIVITIES } from '../src/learning/storyContent'
import { jongOf } from '../src/lib/hangul'

test('all 15 units have transfer vocabulary, novel sentences and valid final-consonant questions', () => {
  for (const u of UNITS) {
    assert.equal(TRANSFER[u.id].length, 4)
    for (const [i, t] of TRANSFER[u.id].entries()) {
      assert(t.sentence.includes(t.word), t.word)
      assert(!activeWords(u).some((x) => x.w.text === t.word), `Not a novel word: ${t.word}`)
      assert(!activeSentences(u).some((x) => x.s.text === t.sentence))
      const q = fillQuestion(u, i, t.word, t.pron, t.meaning)
      assert(jongOf([...t.word][q.keyIdx]), t.word)
      assert(u.jamos.split(' ').includes(jongOf([...t.word][q.keyIdx])), t.word)
      assert.equal(q.options.length, 3)
      assert.equal(new Set(q.options.map((o) => o.label)).size, 3)
      assert.equal(q.options.filter((o) => o.correct).length, 1)
    }
    for (const { w, i } of activeWords(u))
      assert(fillQuestion(u, i, w.text, w.pron).options.some((o) => o.correct && o.label))
  }
})
test('17 books each include grounded comprehension, ordering, and a sentence prompt', () => {
  assert.equal(Object.keys(STORY_ACTIVITIES).length, DOORU_BOOKS.length)
  for (const b of DOORU_BOOKS) {
    const a = STORY_ACTIVITIES[b.dir]
    assert.equal(a.questions.length, 2)
    assert.equal(new Set(a.sequence).size, 3)
    assert(a.explain.length > 10)
    for (const q of a.questions) {
      assert.equal(new Set(q.choices).size, 3)
      assert(q.evidence)
      assert(q.answer >= 0 && q.answer < 3)
    }
  }
})
test('Korean date boundary is independent of device timezone', () => {
  assert.equal(koreaDay(new Date('2026-10-09T14:59:59Z')), '2026-10-09')
  assert.equal(koreaDay(new Date('2026-10-09T15:00:00Z')), '2026-10-10')
})
const teacher = '11111111-1111-4111-8111-111111111111',
  otherTeacher = '22222222-2222-4222-8222-222222222222',
  pupil = '33333333-3333-4333-8333-333333333333',
  otherPupil = '44444444-4444-4444-8444-444444444444',
  sid = '55555555-5555-4555-8555-555555555555',
  sid2 = '66666666-6666-4666-8666-666666666666',
  cid = '77777777-7777-4777-8777-777777777777',
  cid2 = '88888888-8888-4888-8888-888888888888'
test('PostgreSQL: learning ownership, scheduling, idempotence, 12-question coverage, reset fencing and legacy retention', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  create function auth.jwt() returns jsonb language sql stable as $$select '{}'::jsonb$$;grant usage on schema auth to authenticated,anon;`)
    for (const path of ['schema', 'mission_runs', 'checkpoint_missions', 'deeper_learning'])
      await db.exec(readFileSync(`supabase/${path}.sql`, 'utf8'))
    await db.exec(readFileSync('supabase/deeper_learning.sql', 'utf8'))
    await db.exec(`grant select,insert,update,delete on public.classes,public.students,public.progress,public.attempts to authenticated;
  insert into auth.users(id) values('${teacher}'),('${otherTeacher}'),('${pupil}'),('${otherPupil}');
  insert into classes(id,teacher_id,name,code) values('${cid}','${teacher}','test','111111'),('${cid2}','${otherTeacher}','other','222222');
  insert into students(id,class_id,number,auth_uid,job) values('${sid}','${cid}',1,'${pupil}','doctor'),('${sid2}','${cid2}',1,'${otherPupil}','doctor');
  insert into progress(student_id,unit_id,level,passed) select '${sid}',u,l,true from unnest(array['1-1','1-2','1-3','1-4']) u cross join unnest(array['word','sentence']) l;
  insert into progress(student_id,unit_id,level,passed) values('${sid}','read-1-14','paragraph',true);`)
    const user = async (id: string) => {
      await db.exec('reset role')
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id])
      await db.exec('set role authenticated')
    }
    const context = async () =>
      (await db.query<{ c: { epoch: string; schedules: any[] } }>(`select learning_context('${sid}') c`)).rows[0].c
    const schedule = async () =>
      (await db.query<any>(`select * from learning_schedule where student_id='${sid}' and unit_id='1-1'`)).rows[0]
    await user(pupil)
    const ctx = await context()
    assert.equal(ctx.schedules.length, 4)
    const results = (n: number, weak = false) =>
      Array.from({ length: n }, (_, i) => ({ id: `item-${i}`, skill: 'ㄱ', first: !weak, passed: true, helped: weak }))
    const submit = async (
      kind = 'practice',
      round = 0,
      weak = false,
      id = crypto.randomUUID(),
      epoch = ctx.epoch,
      unit = '1-1',
    ) =>
      db.query(`select submit_learning($1,$2,$3,$4,$5,$6,$7,$8)`, [
        id,
        sid,
        epoch,
        unit,
        kind,
        round,
        JSON.stringify(results(kind === 'practice' ? 8 : kind === 'review' ? 6 : 3, weak)),
        kind === 'story' ? '이 동물은 헤엄을 잘 치지만 날지 못해요.' : '',
      ])
    const id = crypto.randomUUID()
    await submit('practice', 0, false, id)
    await submit('practice', 0, false, id)
    assert.equal((await db.query<{ n: number }>('select count(*)::int n from learning_sessions')).rows[0].n, 1)
    await assert.rejects(submit('practice', 0, true, id), /immutable/)
    await assert.rejects(submit('review'), /not due/)
    await submit('story', 0, false, crypto.randomUUID(), ctx.epoch, 'read-1-14')
    await assert.rejects(submit('story', 0, false, crypto.randomUUID(), ctx.epoch, 'read-1-22'), /read the story first/)
    await assert.rejects(db.exec('update learning_schedule set stage=3'), /permission denied/)
    await user(otherPupil)
    assert.equal((await db.query('select * from learning_sessions')).rows.length, 0)
    await assert.rejects(context(), /not allowed/)
    await assert.rejects(submit(), /not allowed/)
    await user(otherTeacher)
    assert.equal((await db.query('select * from learning_schedule')).rows.length, 0)
    await assert.rejects(db.query(`select reset_learning_records(array['${sid}']::uuid[])`), /not allowed/)
    await user(teacher)
    assert.equal((await db.query('select * from learning_sessions')).rows.length, 2)
    // Set date fixtures as DB owner; submit as the real learner role.
    await db.exec(
      `reset role; update learning_schedule set anchor_on=timezone('Asia/Seoul',now())::date-1,due_on=timezone('Asia/Seoul',now())::date where student_id='${sid}' and unit_id='1-1'`,
    )
    await user(pupil)
    await submit('review', 0)
    assert.equal((await schedule()).stage, 1)
    await assert.rejects(submit('review', 0), /not due or already/)
    await db.exec(
      `reset role;update learning_schedule set due_on=timezone('Asia/Seoul',now())::date where student_id='${sid}' and unit_id='1-1'`,
    )
    await user(pupil)
    await submit('review', 1, true)
    assert.equal((await schedule()).stage, 1)
    assert.deepEqual((await schedule()).weak, ['ㄱ'])
    await db.exec(
      `reset role;update learning_schedule set due_on=timezone('Asia/Seoul',now())::date,stage=2 where student_id='${sid}' and unit_id='1-1'`,
    )
    await user(pupil)
    await submit('review', 2)
    assert.equal((await schedule()).due_on, null)
    await db.exec('reset role')
    const dates = (
      await db.query<any>(
        `select next_review('2026-10-01',0,'2026-10-01',false) a,next_review('2026-10-01',1,'2026-10-02',false) b,next_review('2026-10-01',2,'2026-10-04',false) c,next_review('2026-10-01',1,'2026-10-10',false) late,next_review('2026-10-01',2,'2026-10-08',true) weak`,
      )
    ).rows[0]
    assert.deepEqual(
      Object.fromEntries(Object.entries(dates).map(([k, v]) => [k, (v as Date).toISOString().slice(0, 10)])),
      { a: '2026-10-02', b: '2026-10-04', c: '2026-10-08', late: '2026-10-11', weak: '2026-10-09' },
    )
    await user(pupil)
    assert.equal((await db.query<any>(`select checkpoint_context('${sid}','1-4') c`)).rows[0].c.eligible,false)
    for (const unit of ['1-2', '1-3', '1-4']) await submit('practice', 0, false, crypto.randomUUID(), ctx.epoch, unit)
    const ids = ['1-1', '1-2', '1-3', '1-4'].flatMap((u) => ['w', 'f', 's'].map((m) => `${u}-${m}10`))
    const mission = ids.map((item_id, i) => ({
      item_id,
      first_correct: i !== 0,
      hint_used: i === 0,
      resolved: true,
      tries: i === 0 ? 2 : 1,
      continued: false,
    }))
    assert.equal((await db.query<any>(`select checkpoint_context('${sid}','1-4') c`)).rows[0].c.eligible,true)
    await assert.rejects(db.query(`insert into checkpoint_runs(student_id,class_id,unit_id,epoch,kind,reason,status,item_ids,results,revision,started_at,updated_at) values($1,$2,'1-4',$3,'rescue','test','completed',$4,$5,1,now(),now())`,[sid,cid,ctx.epoch,ids.map((x,i)=>i===1?ids[0]:x),JSON.stringify(mission)]),/invalid question count/)
    await db.query(
      `insert into checkpoint_runs(student_id,class_id,unit_id,epoch,kind,reason,status,item_ids,results,revision,started_at,updated_at) values($1,$2,'1-4',$3,'rescue','test','completed',$4,$5,1,now(),now())`,
      [sid, cid, ctx.epoch, ids, JSON.stringify(mission)],
    )
    assert((await schedule()).due_on, 'a weak assessment reopens finished review')
    const reward = (await db.query<any>(`select claim_checkpoint_reward('${sid}','1-4','${ctx.epoch}') r`)).rows[0].r
    assert.equal(reward.item_id, 'doctor-tool-0')
    await db.query(`select claim_checkpoint_reward('${sid}','1-4','${ctx.epoch}')`)
    assert.equal((await db.query('select * from checkpoint_rewards')).rows.length, 1)
    await user(teacher)
    await db.query(`select reset_learning_records(array['${sid}']::uuid[])`)
    assert.equal((await db.query('select * from learning_sessions')).rows.length, 0)
    await user(pupil)
    await assert.rejects(submit(), /learning reset/)
    // Validate the same full payload shape generated by Practice for every actual unit.
    const actualContext = await context()
    await db.exec('reset role')
    for (const unit of UNITS) {
      await db.query(`insert into progress(student_id,unit_id,level,passed) values($1,$2,'word',true),($1,$2,'sentence',true) on conflict(student_id,unit_id,level) do update set passed=true`,[sid,unit.id])
    }
    await user(pupil)
    for (const unit of UNITS) {
      const questions = activeWords(unit).slice(0,4).map(({w,i})=>fillQuestion(unit,i,w.text,w.pron))
      const answers = [
        ...questions.map((q,i)=>({id:q.id,skill:jongOf([...q.target][q.keyIdx]),first:i!==0,passed:true,helped:i===0})),
        ...Array.from({length:4},(_,i)=>({id:`${unit.id}-read-0-${i}`,skill:unit.jamos,first:true,passed:true,helped:false}))
      ]
      await db.query('select submit_learning($1,$2,$3,$4,$5,0,$6,$7)',[crypto.randomUUID(),sid,actualContext.epoch,unit.id,'practice',JSON.stringify(answers),''])
    }
    assert.equal((await db.query('select * from learning_sessions')).rows.length,15)
    const fresh=await context(), oldIds=['1-1-w10','1-2-w10','1-3-w10','1-4-w10']
    await db.query(`insert into checkpoint_runs(student_id,class_id,unit_id,epoch,kind,reason,status,item_ids,results,revision,started_at,updated_at) values($1,$2,'1-4',$3,'rescue','legacy','completed',$4,$5,1,now(),now())`,[sid,cid,fresh.epoch,oldIds,JSON.stringify(oldIds.map(item_id=>({item_id,first_correct:true,hint_used:false,resolved:true,tries:1,continued:false})))])
    await db.exec('reset role');await db.exec(readFileSync('supabase/deeper_learning.sql','utf8'));await user(pupil)
    const legacy=(await db.query<any>(`select checkpoint_context('${sid}','1-4') c`)).rows[0].c
    assert.equal(legacy.run.item_ids.length,4);assert.equal(legacy.eligible,true)
    await db.exec('set role anon')
    await assert.rejects(context(), /permission denied/)
  } finally {
    await db.close()
  }
})
