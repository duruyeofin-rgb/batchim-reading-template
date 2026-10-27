import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { isPermissionDenied, tableErrorHint, probeColumn } from './verify-install-helpers.mjs'

test('install diagnostics distinguish permissions, missing tables and unrelated errors', () => {
  assert.equal(probeColumn('progress'), 'student_id')
  assert.equal(isPermissionDenied({ code: '42501' }), true)
  for (const code of ['23503', '42703', '42P01', 'PGRST205', '23505']) assert.equal(isPermissionDenied({ code }), false)
  assert.match(tableErrorHint('classes', { code: '42501', message: 'denied' }), /권한 부족/)
  for (const code of ['42P01', 'PGRST205']) assert.match(tableErrorHint('classes', { code, message: 'missing' }), /없는 표/)
  assert.match(tableErrorHint('progress', { code: '42703', message: 'column missing' }), /조회 오류/)
})

for (const legacy of [false, true]) test(`full setup PostgreSQL permissions: ${legacy ? 'existing grants' : 'no automatic grants'}`, async () => {
  const db = new PGlite()
  const teacher = '11111111-1111-4111-8111-111111111111'
  const pupil = '22222222-2222-4222-8222-222222222222'
  const outsider = '33333333-3333-4333-8333-333333333333'
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('is_anonymous', coalesce(current_setting('test.anonymous',true),'false')::boolean) $$;
      grant usage on schema auth to authenticated,anon;
      insert into auth.users values('${teacher}'),('${pupil}'),('${outsider}');`)
    if (legacy) await db.exec('alter default privileges in schema public grant all on tables to authenticated, anon;')
    const setup = readFileSync('supabase/setup.sql', 'utf8')
    await db.exec(setup)
    await db.exec(setup)
    const asUser = async (id: string, anonymous = false) => {
      await db.exec('reset role')
      await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('test.anonymous',$2,false)", [id, String(anonymous)])
      await db.exec('set role authenticated')
    }
    await asUser(teacher)
    const cid = (await db.query<{ id: string }>("insert into classes(name,code,student_count) values('test','123456',3) returning id")).rows[0].id
    const cid2 = (await db.query<{ id: string }>("insert into classes(name,code) values('target','654321') returning id")).rows[0].id
    await asUser(pupil, true)
    assert.equal((await db.query<{ n: number }>("select class_size('123456') n")).rows[0].n, 3)
    const sid = (await db.query<{ id: string }>("select id from join_class('123456',1)")).rows[0].id
    await db.exec(`update students set character='boy',job='doctor',dream_total=3,items='{}',equipped='{}',updated_at=now() where id='${sid}'`)
    for (const n of [1, 2]) {
      await db.exec(`insert into progress(student_id,unit_id,level,total) values('${sid}','1-1','word',${n}) on conflict(student_id,unit_id,level) do update set total=excluded.total`)
      assert.equal((await db.query<{ total: number }>('select total from progress')).rows[0].total, n)
    }
    await db.exec(`insert into attempts(student_id,class_id,level,unit_id,item_id,target,is_correct,first_try) values('${sid}','${cid}','word','1-1','1-1-w0','test',true,true)`)
    assert.equal((await db.query('select * from attempts')).rows.length, 1)
    await db.exec("reset role; select set_config('request.jwt.claim.sub','',false); set role anon;")
    for (const table of ['classes', 'students', 'attempts', 'progress']) {
      if (legacy) assert.equal((await db.query(`select * from ${table}`)).rows.length, 0)
      else await assert.rejects(db.query(`select * from ${table}`), (e: any) => e.code === '42501')
    }
    await asUser(outsider, true)
    const otherSid = (await db.query<{ id: string }>("select id from join_class('123456',2)")).rows[0].id
    assert.deepEqual((await db.query<{ id: string }>('select id from students')).rows.map(r => r.id), [otherSid])
    assert.equal((await db.query('select * from progress')).rows.length, 0)
    assert.equal((await db.query('select * from attempts')).rows.length, 0)
    await assert.rejects(db.exec(`insert into progress(student_id,unit_id,level) values('${sid}','1-2','word')`), (e: any) => e.code === '42501')
    await assert.rejects(db.exec(`insert into attempts(student_id,class_id,level,unit_id,item_id,target,is_correct,first_try) values('${sid}','${cid}','word','1-1','forged','test',true,true)`), (e: any) => e.code === '42501')
    // Unlink this temporary second student before checking an unrelated teacher.
    await asUser(teacher)
    await db.exec(`delete from students where id='${otherSid}'`)
    // Both destination class and auth user exist; failure must be privilege code, never FK.
    for (const who of [pupil, teacher]) {
      await asUser(who, who === pupil)
      for (const assignment of [`class_id='${cid2}'`, `auth_uid='${outsider}'`]) {
        await assert.rejects(db.exec(`update students set ${assignment} where id='${sid}'`), (e: any) => e.code === '42501')
      }
    }
    await asUser(outsider)
    for (const table of ['classes', 'students', 'attempts', 'progress']) assert.equal((await db.query(`select * from ${table}`)).rows.length, 0)
    await db.exec(`delete from attempts where student_id='${sid}'; delete from progress where student_id='${sid}'; delete from classes where id='${cid}';`)
    await asUser(teacher)
    assert.equal((await db.query('select * from attempts')).rows.length, 1)
    assert.equal((await db.query('select * from progress')).rows.length, 1)
    await db.exec(`delete from attempts where student_id='${sid}'; delete from progress where student_id='${sid}'; update students set character=null,job=null,dream_total=0,items='{}',equipped='{}',updated_at=now() where id='${sid}';`)
    assert.equal((await db.query('select * from attempts')).rows.length, 0)
    assert.equal((await db.query('select * from progress')).rows.length, 0)
    assert.equal((await db.query<{ dream_total: number }>('select dream_total from students')).rows[0].dream_total, 0)
    await db.exec(`delete from students where id='${sid}'; delete from classes where id in ('${cid}','${cid2}');`)
    assert.equal((await db.query('select * from students')).rows.length, 0)
    assert.equal((await db.query('select * from classes')).rows.length, 0)
    await db.exec("reset role; select set_config('request.jwt.claim.sub','',false); set role anon;")
    for (const table of ['classes', 'students', 'attempts', 'progress']) {
      if (legacy) assert.equal((await db.query(`select * from ${table}`)).rows.length, 0)
      else await assert.rejects(db.query(`select * from ${table}`), (e: any) => e.code === '42501')
    }
  } finally { await db.close() }
})
