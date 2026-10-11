import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const teacher = '11111111-1111-4111-8111-111111111111',
  otherTeacher = '22222222-2222-4222-8222-222222222222'
const pupil = '33333333-3333-4333-8333-333333333333',
  otherPupil = '44444444-4444-4444-8444-444444444444'
const sid = '55555555-5555-4555-8555-555555555555',
  sid2 = '66666666-6666-4666-8666-666666666666'
const cid = '77777777-7777-4777-8777-777777777777',
  cid2 = '88888888-8888-4888-8888-888888888888'

test('actual PostgreSQL migration: RLS isolation, idempotence, terminal guards and teacher reset fencing', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
 grant usage on schema auth to authenticated,anon;`)
    await db.exec(readFileSync('supabase/schema.sql', 'utf8'))
    // Supabase grants these default privileges on existing application tables.
    await db.exec(`grant select,insert,update,delete on public.classes,public.students,public.progress,public.attempts to authenticated;
 insert into auth.users(id) values('${teacher}'),('${otherTeacher}'),('${pupil}'),('${otherPupil}');
 insert into public.classes(id,teacher_id,name,code) values('${cid}','${teacher}','test','111111'),('${cid2}','${otherTeacher}','other','222222');
 insert into public.students(id,class_id,number,auth_uid) values('${sid}','${cid}',1,'${pupil}'),('${sid2}','${cid2}',1,'${otherPupil}');
 insert into public.progress(student_id,unit_id,level,passed) values('${sid}','1-1','word',true),('${sid2}','1-1','word',true);`)
    const migration = readFileSync('supabase/mission_runs.sql', 'utf8')
    await db.exec(migration)
    await db.exec(migration)
    const asUser = async (uid: string) => {
      await db.exec('reset role')
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid])
      await db.exec('set role authenticated')
    }
    await asUser(pupil)
    const ctx = async () =>
      (
        await db.query<{ value: { epoch: string; eligible: boolean } }>(
          `select public.mission_context('${sid}','1-1') as value`,
        )
      ).rows[0].value
    const context = await ctx()
    assert(context.eligible)
    await assert.rejects(db.query(`select public.mission_context('${sid2}','1-1')`), /not allowed/)
    const ids = ['1-1-w10', '1-1-w11', '1-1-w12']
    const results = ids.map((item_id) => ({
      item_id,
      first_correct: null,
      hint_used: false,
      resolved: false,
      tries: 0,
      continued: false,
    }))
    const insert = async (epoch = context.epoch, cls = cid) =>
      db.query(
        `insert into public.mission_runs(student_id,class_id,unit_id,epoch,kind,reason,status,item_ids,results,revision,started_at,updated_at) values($1,$2,'1-1',$3,'rescue','test','started',$4,$5,1,now(),now())`,
        [sid, cls, epoch, ids, JSON.stringify(results)],
      )
    await assert.rejects(insert(context.epoch, cid2), /row-level security/)
    await insert()
    await db.query(`update public.mission_runs set revision=2,results=$1 where student_id=$2`, [
      JSON.stringify(results.map((r) => ({ ...r, first_correct: true, resolved: true, tries: 1 }))),
      sid,
    ])
    await db.exec(`update public.mission_runs set status='completed',revision=3 where student_id='${sid}';`)
    await db.exec(`update public.mission_runs set status='started',revision=4 where student_id='${sid}';`)
    assert.equal(
      (await db.query<{ status: string }>('select status from public.mission_runs')).rows[0].status,
      'completed',
    )
    await asUser(otherPupil)
    assert.equal((await db.query('select * from public.mission_runs')).rows.length, 0)
    await asUser(otherTeacher)
    assert.equal((await db.query('select * from public.mission_runs')).rows.length, 0)
    await asUser(teacher)
    assert.equal((await db.query('select * from public.mission_runs')).rows.length, 1)
    // Merely resetting stars/profile must not touch missions.
    await db.exec(`update public.students set dream_total=0,character=null where id='${sid}';`)
    assert.equal((await db.query('select * from public.mission_runs')).rows.length, 1)
    // Existing reset uses progress DELETE. The trigger removes missions and rotates the epoch atomically.
    await db.exec(`delete from public.progress where student_id='${sid}';`)
    assert.equal((await db.query('select * from public.mission_runs')).rows.length, 0)
    await asUser(pupil)
    const reset = await ctx()
    assert.notEqual(reset.epoch, context.epoch)
    assert.equal(reset.eligible, false)
    await assert.rejects(insert(), /word progress required|mission reset/)
    await db.exec(`insert into public.progress(student_id,unit_id,level,passed) values('${sid}','1-1','word',true);`)
    await assert.rejects(insert(), /mission reset/)
    await insert(reset.epoch)
    assert.equal((await db.query('select * from public.mission_runs')).rows.length, 1)
    assert.equal((await db.query('select * from public.attempts')).rows.length, 0)
  } finally {
    await db.close()
  }
})

test('checkpoint PostgreSQL: four-unit eligibility, isolated records, career reward once and reset fencing', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
      grant usage on schema auth to authenticated,anon;`)
    await db.exec(readFileSync('supabase/schema.sql','utf8'))
    await db.exec(`grant select,insert,update,delete on public.classes,public.students,public.progress,public.attempts to authenticated;
      insert into auth.users(id) values('${teacher}'),('${otherTeacher}'),('${pupil}'),('${otherPupil}');
      insert into public.classes(id,teacher_id,name,code) values('${cid}','${teacher}','test','111111'),('${cid2}','${otherTeacher}','other','222222');
      insert into public.students(id,class_id,number,auth_uid,job,dream_total,items) values('${sid}','${cid}',1,'${pupil}','doctor',40,array['doctor-outfit-0']),('${sid2}','${cid2}',1,'${otherPupil}','firefighter',0,'{}');`)
    await db.exec(readFileSync('supabase/mission_runs.sql','utf8'))
    const migration=readFileSync('supabase/checkpoint_missions.sql','utf8')
    await db.exec(migration); await db.exec(migration)
    const asUser=async(uid:string)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);await db.exec('set role authenticated')}
    await asUser(pupil)
    const context=async(unit='1-4')=>(await db.query<{v:{epoch:string;eligible:boolean}}>(`select public.checkpoint_context($1,$2) v`,[sid,unit])).rows[0].v
    const initial=await context();assert.equal(initial.eligible,false)
    const addProgress=async(ids:string[])=>{for(const id of ids)for(const level of ['word','sentence'])await db.query('insert into public.progress(student_id,unit_id,level,passed) values($1,$2,$3,true) on conflict do nothing',[sid,id,level])}
    await addProgress(['1-1','1-2','1-3'])
    await db.exec(`insert into public.progress(student_id,unit_id,level,passed) values('${sid}','1-4','word',true)`)
    assert.equal((await context()).eligible,false)
    await addProgress(['1-4']); assert.equal((await context()).eligible,true)
    assert.equal((await context('1-1')).eligible,false)
    const insert=async(unit:string,ids:string[],epoch=initial.epoch,cls=cid)=>db.query(`insert into public.checkpoint_runs(student_id,class_id,unit_id,epoch,kind,reason,status,item_ids,results,revision,started_at,updated_at) values($1,$2,$3,$4,'rescue','test','started',$5,$6,1,now(),now())`,[sid,cls,unit,epoch,ids,JSON.stringify(ids.map(item_id=>({item_id,first_correct:null,hint_used:false,resolved:false,tries:0,continued:false})))])
    const claim=async(unit='1-4',epoch=initial.epoch)=>(await db.query<{v:{item_id:string|null;student:{items:string[];dream_total:number}}}>(`select public.claim_checkpoint_reward($1,$2,$3) v`,[sid,unit,epoch])).rows[0].v
    const ids=['1-1-w10','1-2-w8','1-3-w10','1-4-w12']
    await assert.rejects(insert('1-4',ids,initial.epoch,cid2),/row-level security/)
    await assert.rejects(insert('1-4',[...ids.slice(0,3),'2-7-w0']),/one question per checkpoint unit/)
    await insert('1-4',ids)
    await assert.rejects(claim(),/completed checkpoint required/)
    const complete=async(unit:string)=>db.query(`update public.checkpoint_runs set revision=revision+1,status='completed',results=(select jsonb_agg(jsonb_build_object('item_id',item,'first_correct',true,'hint_used',false,'resolved',true,'tries',1,'continued',false)) from unnest(item_ids) item) where student_id=$1 and unit_id=$2`,[sid,unit])
    await complete('1-4')
    const reward=await claim();assert.equal(reward.item_id,'doctor-tool-0');assert.equal(reward.student.dream_total,40)
    assert.deepEqual((await claim()).student.items,['doctor-outfit-0','doctor-tool-0'])
    await db.exec(`update public.checkpoint_runs set status='started',revision=99 where student_id='${sid}'`)
    assert.equal((await db.query<{status:string}>('select status from public.checkpoint_runs')).rows[0].status,'completed')
    await assert.rejects(db.exec(`insert into public.checkpoint_rewards(student_id,unit_id,epoch,job,item_id) values('${sid}','1-8','${initial.epoch}','doctor','doctor-tool-4')`),/permission denied/)
    await asUser(otherPupil);assert.equal((await db.query('select * from public.checkpoint_runs')).rows.length,0)
    assert.equal((await db.query('select * from public.checkpoint_rewards')).rows.length,0)
    await assert.rejects(claim(),/not allowed/)
    await asUser(otherTeacher);assert.equal((await db.query('select * from public.checkpoint_runs')).rows.length,0)
    await asUser(teacher);assert.equal((await db.query('select * from public.checkpoint_rewards')).rows.length,1)
    await assert.rejects(claim(),/not allowed/)
    await asUser(pupil)
    await addProgress(['1-5','1-6','1-7','1-8'])
    await insert('1-8',['1-5-w0','1-6-w0','1-7-w0','1-8-w0']);await complete('1-8')
    assert.equal((await claim('1-8')).item_id,'doctor-tool-3')
    await db.exec(`update public.students set job='firefighter' where id='${sid}'`)
    await addProgress(['2-1','2-2','2-3','2-4'])
    await insert('2-4',['2-1-w0','2-2-w0','2-3-w0','2-4-w0']);await complete('2-4')
    assert.equal((await claim('2-4')).item_id,'firefighter-tool-1')
    assert.equal((await db.query('select * from public.attempts')).rows.length,0)
    // Legacy records remain readable until the teacher intentionally resets progress.
    await db.query(`insert into public.mission_runs(student_id,class_id,unit_id,epoch,kind,reason,status,item_ids,results,revision,started_at,updated_at) select student_id,class_id,unit_id,epoch,kind,reason,status,item_ids[1:3],results - 3,revision,started_at,updated_at from public.checkpoint_runs where unit_id='1-4'`)
    assert.equal((await db.query('select * from public.mission_runs')).rows.length,1)
    await asUser(teacher);await db.exec(`delete from public.progress where student_id='${sid}' and unit_id='1-1'`)
    assert.equal((await db.query('select * from public.mission_runs')).rows.length,0)
    assert.equal((await db.query('select * from public.checkpoint_runs')).rows.length,0)
    assert.equal((await db.query('select * from public.checkpoint_rewards')).rows.length,0)
    await asUser(pupil);await addProgress(['1-1'])
    assert.notEqual((await context()).epoch,initial.epoch)
    await assert.rejects(insert('1-4',ids),/mission reset/)
    await assert.rejects(claim(),/mission reset/)
  } finally {await db.close()}
})
