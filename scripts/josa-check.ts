// 조사 점검: 화면 글자에 "이(가)", "을(를)" 같은 어색한 표기가 남아 있지 않은지, 조사 도구가 맞는지 확인한다.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { JOBS } from '../src/data/items'
import { eulReul, euroRo, iGa, iRago } from '../src/lib/hangul'

let bad = 0
const expect = (cond: boolean, msg: string) => {
  if (!cond) {
    bad++
    console.log('✗ 조사 점검:', msg)
  }
}

console.log('\n[조사]')
expect(iGa('의사') === '가' && iGa('선생님') === '이' && iGa('화가') === '가' && iGa('경찰관') === '이', '이/가')
expect(eulReul('닭') === '을' && eulReul('낱말') === '을' && eulReul('의자') === '를', '을/를')
expect(iRago('안따') === '라고' && iRago('앉') === '이라고', '이라고/라고')
expect(euroRo('의사') === '로' && euroRo('선생님') === '으로' && euroRo('우주비행사') === '로', '(으)로')

// 모든 직업의 꿈 완성 문장
for (const j of JOBS) {
  const s = `멋진 ${j.label}${iGa(j.label)} 되었어요!`
  const last = j.label[j.label.length - 1]
  const hasFinal = (last.charCodeAt(0) - 0xac00) % 28 !== 0
  expect(s.includes(hasFinal ? `${j.label}이 되` : `${j.label}가 되`), `꿈 완성 문장 ${s}`)
}

// 소스에 남은 어색한 조사 표기 (낱말 데이터는 제외)
const BAD = /이\(가\)|을\(를\)|은\(는\)|와\(과\)|\(이\)라고|\(으\)로/
function walk(dir: string, out: string[] = []) {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(tsx?|json)$/.test(f)) out.push(p)
  }
  return out
}
for (const f of walk('src')) {
  if (f.endsWith(path.join('lib', 'hangul.ts'))) continue // 도구 설명 주석
  const lines = readFileSync(f, 'utf8').split('\n')
  lines.forEach((l, i) => {
    if (BAD.test(l) && !l.trim().startsWith('//') && !l.trim().startsWith('*')) expect(false, `${f}:${i + 1} ${l.trim().slice(0, 60)}`)
  })
}

console.log(bad === 0 ? '조사 점검 통과' : `조사 점검 ${bad}건 실패`)
export const josaProblems = bad
