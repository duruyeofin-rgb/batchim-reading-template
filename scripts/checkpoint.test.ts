import test from 'node:test'
import assert from 'node:assert/strict'
import { UNITS, activeWords, activeSentences } from '../src/data/curriculum'
import { LISTENING_CHOICES } from '../src/data/listeningChoices'
import { buildQuestions } from '../src/lib/quiz'
import { CHECKPOINTS, checkpointEligible, checkpointUnits, nextMissionTool } from '../src/mission/checkpoints'
import { missionQuestions } from '../src/mission/missionQuestions'
import { selectMission } from '../src/mission/missionSelector'
import { JOBS, imgTool } from '../src/data/items'
import { elemsOfJob } from '../src/data/dreamWorld'
import { existsSync } from 'node:fs'

test('all active single-final words and sentence targets use reviewed real-word distractors', () => {
  for (const unit of UNITS.filter(u => u.part === 1)) {
    for (const target of [...activeWords(unit).map(x => x.w.text), ...activeSentences(unit).map(x => x.s.target)]) {
      assert(LISTENING_CHOICES[target], `Missing reviewed choices: ${target}`)
      assert.equal(new Set([target,...LISTENING_CHOICES[target]]).size,3)
    }
    for (const level of ['word','sentence'] as const) for (const q of buildQuestions(unit,level)) {
      assert.deepEqual(q.options.filter(o => !o.correct).map(o => o.label).sort(), [...LISTENING_CHOICES[q.target]].sort())
      assert.equal(q.options.filter(o => o.correct).length,1)
    }
  }
  assert.deepEqual(LISTENING_CHOICES['운동장'], ['운동화','농구장'])
  assert.deepEqual(LISTENING_CHOICES['약속'], ['약국','박수'])
})
test('assessments occur every four complete units and cover four separate units', () => {
  assert.deepEqual(CHECKPOINTS.map(u=>u.id),['1-4','1-8','2-4'])
  for (const unit of CHECKPOINTS) {
    const rows=checkpointUnits(unit).flatMap(u=>['word','sentence'].map(level=>({unit_id:u.id,level,passed:true})))
    assert(checkpointEligible(unit,rows))
    for (let i=0;i<rows.length;i++) assert.equal(checkpointEligible(unit,rows.filter((_,j)=>j!==i)),false)
    const questions=missionQuestions(unit,selectMission(unit,[],rows))
    assert.deepEqual([...new Set(questions.map(q=>q.unitId))],checkpointUnits(unit).map(u=>u.id))
    assert.equal(questions.length,12)
    assert.equal(questions.filter(q=>q.fill).length,4)
    assert.equal(questions.filter(q=>q.sentence).length,4)
  }
  assert.equal(checkpointEligible(UNITS[0], [{unit_id:'1-1',level:'word',passed:true},{unit_id:'1-1',level:'sentence',passed:true}]),false)
})
test('each career uses its existing tool pictures in order, skipping owned tools', () => {
  for (const job of JOBS) {
    const owned:string[]=[]
    const expected=elemsOfJob(job.id).filter(e=>e.kind==='tool')
    for (const e of expected) {
      const tool=nextMissionTool(job.id,owned)!
      assert.equal(tool.id,e.id)
      assert(existsSync('public'+imgTool(tool.job,tool.idx)))
      owned.push(tool.id)
    }
    assert.equal(nextMissionTool(job.id,owned),null)
  }
  assert.equal(nextMissionTool('doctor',[])?.id,'doctor-tool-0')
  assert.equal(nextMissionTool('firefighter',[])?.id,'firefighter-tool-1')
})
