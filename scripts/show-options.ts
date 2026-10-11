// 낱말 하나의 보기와 오답 피드백을 미리 보는 도구:  npx tsx scripts/show-options.ts 2-2 많고
import { UNITS } from '../src/data/curriculum'
import { makeFeedback } from '../src/lib/quiz'
import { makeOptions } from '../src/lib/spelling'

const pairs: [string, string][] = process.argv[2] && process.argv[3]
  ? [[process.argv[2], process.argv[3]]]
  : [['2-2', '많고'], ['2-2', '않는다'], ['2-3', '밟고'], ['2-6', '읽지'], ['2-7', '삶고'], ['1-2', '한복']]

for (const [uid, t] of pairs) {
  const u = UNITS.find((x) => x.id === uid)
  const w = u?.words.find((x) => x.text === t)
  if (!u || !w) {
    console.log(`없는 낱말: ${uid} ${t}`)
    continue
  }
  const r = makeOptions(w.text, w.pron, u, !!w.special, 'hear')
  console.log(`\n[${uid}] ${t} [${w.pron}] 보기: ${r.options.map((o) => o.label + (o.kind === 'correct' ? '✔' : `(${o.kind})`)).join(' | ')}`)
  for (const o of r.options.filter((x) => x.kind !== 'correct' && x.kind !== 'swap')) {
    console.log(
      '   ',
      o.label,
      '→',
      makeFeedback({ unit: u, mode: 'hear', target: w.text, pron: w.pron, chosen: o.label, origJong: r.origJong, chosenJong: o.jong, kind: o.kind, special: !!w.special }),
    )
  }
}
