// 학습 데이터·퀴즈 생성 점검: npx tsx scripts/check.ts
import { existsSync } from 'node:fs'
import { type HelpAttempt, TAG_HELP, TAG_PASS, TAG_SKIP, pendingHelp } from '../src/lib/helpTags'
import { STORIES, UNITS, activeSentences, activeWords } from '../src/data/curriculum'
import { PIC_IDS } from '../src/data/pics'
import { DOORU_BOOKS, bookByUnitId, bookUrl, booksOfLevel, readUnitId } from '../src/data/dooru'
import { growthProblems } from './growth-check'
import { josaProblems } from './josa-check'
import { resetProblems } from './reset-check'
import { ELEMS, STEPS } from '../src/data/dreamWorld'
import { MEANINGS, meaningOf } from '../src/data/meanings'
import { ITEMS, JOBS, imgBg, imgFigure, imgKit, imgTool } from '../src/data/items'
import { REP, jongOf, withJong, isSyllable } from '../src/lib/hangul'
import { LISTENING_CHOICES } from '../src/data/listeningChoices'
import { buildQuestions, makeFeedback } from '../src/lib/quiz'
import { fixNumbers, judgeReading, judgeWord, markWords, similarity, wordFeedbacks } from '../src/lib/similarity'
import { keyIdxOf, makeOptions } from '../src/lib/spelling'

let problems = 0
const bad = (m: string) => {
  problems++
  console.log('✗', m)
}

let words = 0
let sents = 0

// 0) 1부 도전 낱말·문장 점검 + 단원별로 실제 내는 문항 수
console.log('단원별 실제 문항 수 (낱말 / 문장):')
for (const u of UNITS) {
  const aw = activeWords(u)
  const as = activeSentences(u)
  console.log(`  ${u.id}  ${aw.length} / ${as.length}${aw.some(({ w }) => w.tier === 2) ? '  (도전만)' : ''}`)
  const seen = new Set<string>()
  for (const { w, i } of aw) {
    if (seen.has(w.text)) bad(`${u.id} 낱말 중복: ${w.text}`)
    seen.add(w.text)
    if (Array.from(w.pron).length !== Array.from(w.text).length) bad(`${u.id}-w${i} ${w.text} 발음 길이가 다름: ${w.pron}`)
    if (u.part === 1 && w.tier === 2) {
      const chars = Array.from(w.text)
      if (!chars.some((c) => REP[jongOf(c)] === u.sound)) bad(`${u.id}-w${i} ${w.text} 에 단원 받침 소리(${u.sound})가 없음`)
      const k = keyIdxOf(w.text, u)
      if (REP[jongOf(Array.from(w.pron)[k] ?? '')] !== u.sound) bad(`${u.id}-w${i} ${w.text} 핵심 음절 발음 받침이 ${u.sound} 가 아님: ${w.pron}`)
      if (chars.length < 2) bad(`${u.id}-w${i} ${w.text} 는 도전 낱말로는 너무 짧음`)
    }
    if (u.part === 2 && w.tier === 2) {
      // 2부: 단원의 겹받침이 들어 있고, 그 음절의 발음에서 받침이 규칙대로 읽히는지
      const jamos = u.jamos.split(' ')
      const k = keyIdxOf(w.text, u)
      if (!jamos.includes(jongOf(Array.from(w.text)[k]))) bad(`${u.id}-w${i} ${w.text} 의 핵심 받침이 단원(${u.jamos}) 것이 아님`)
    }
  }
  for (const { s: x, i } of as) {
    if (!x.text.includes(x.target)) bad(`${u.id}-s${i} 문장에 목표 낱말이 없음: ${x.target}`)
    if (Array.from(x.pron).length !== Array.from(x.target).length) bad(`${u.id}-s${i} 발음 길이: ${x.target}/${x.pron}`)
  }
  // 도전 단원: 기존 항목의 번호가 그대로인지(앞쪽은 tier 1, 뒤쪽만 tier 2)
  const firstHard = u.words.findIndex((x) => x.tier === 2)
  if (firstHard >= 0 && u.words.slice(firstHard).some((x) => x.tier !== 2)) bad(`${u.id} 도전 낱말은 목록 뒤쪽에만 있어야 함`)
}

for (const u of UNITS) {
  words += u.words.length
  sents += u.sentences.length

  // 1) 실제 생성되는 문항(그림 파일이 없으면 모두 소리 듣고 고르기)
  for (const level of ['word', 'sentence'] as const) {
    for (let k = 0; k < 30; k++) {
      for (const q of buildQuestions(u, level)) {
        const labels = q.options.map((o) => o.label)
        if (q.options.length !== 3) bad(`${q.id} 보기 ${q.options.length}개: ${labels}`)
        if (new Set(labels).size !== labels.length) bad(`${q.id} 보기 중복: ${labels}`)
        if (q.options.filter((o) => o.correct).length !== 1) bad(`${q.id} 정답 개수`)
        if (!labels.includes(q.target)) bad(`${q.id} 정답이 보기에 없음`)
        for (const o of q.options) {
          if (!o.correct && !o.feedback) bad(`${q.id} ${o.label} 피드백 없음`)
          // 소리 듣고 고르기에는 '같은 소리 철자' 보기가 없어야 한다
          if (q.format === 'hear' && o.kind === 'spell') bad(`${q.id} 소리 문제에 동음 철자 보기 ${o.label}`)
          // 실제 낱말 보기는 여러 음절이 달라질 수 있으므로 낱말 전체를 비교한다.
          if (q.format === 'hear' && u.part === 1 && !o.correct) {
            const soundKey = (text: string) => Array.from(text).map(c => isSyllable(c) ? withJong(c, REP[jongOf(c)] ?? jongOf(c)) : c).join('')
            if (soundKey(o.label) === soundKey(q.target)) bad(`${q.id} ${o.label} 소리가 정답과 같음`)
            if (!LISTENING_CHOICES[q.target]?.includes(o.label)) bad(`${q.id} ${o.label} 검토한 실제 낱말 보기가 아님`)
          }
        }
        // 문장은 앞뒤 글자를 그대로 두고, 정답 낱말 자리만 (2부는 소리 나는 대로) 읽어 준다
        if (q.sentence && q.sentence.before + (u.part === 2 ? q.pron : q.sentence.target) + q.sentence.after !== q.audio) bad(`${q.id} 문장 분리`)
        if (q.sentence && q.sentence.before + q.sentence.target + q.sentence.after !== q.audio && u.part === 1) bad(`${q.id} 1부 문장 소리`)
      }
    }
  }

  // 2) 그림 문제 보기 규칙(그림이 있다고 가정하고 모든 낱말을 점검)
  u.words.forEach((w, i) => {
    for (let k = 0; k < 30; k++) {
      const r = makeOptions(w.text, w.pron, u, !!w.special, 'picture')
      const labels = r.options.map((o) => o.label)
      if (r.options.length !== 3 || new Set(labels).size !== 3) bad(`${u.id}-w${i} 그림 보기 이상: ${labels}`)
      if (r.idx !== keyIdxOf(w.text, u)) bad(`${u.id}-w${i} 핵심 음절 위치`)
    }
  })
}
// 그림 목록과 파일이 서로 맞는지, 그림 문제가 실제로 섞여 나오는지
{
  const missing = [...PIC_IDS].filter((id) => !existsSync(`public/img/${id}.webp`))
  if (missing.length) bad(`그림 파일이 없음: ${missing.join(', ')}`)
  const known = new Set(UNITS.flatMap((u) => u.words.map((_, i) => `${u.id}-w${i}`)))
  const unknown = [...PIC_IDS].filter((id) => !known.has(id))
  if (unknown.length) bad(`pics.ts 에 없는 낱말 번호: ${unknown.join(', ')}`)
  let pic = 0
  let total = 0
  for (let k = 0; k < 20; k++)
    for (const u of UNITS)
      for (const q of buildQuestions(u, 'word')) {
        total++
        if (q.format === 'picture') {
          pic++
          if (!q.pic) bad(`${q.id} 그림 문제인데 그림 주소가 없음`)
        }
      }
  console.log(`그림 ${PIC_IDS.size}장 · 단어 문제 중 그림 문제 비율 ${Math.round((pic / total) * 100)}%`)
}
console.log(`단어 ${words} · 문장 ${sents} · 문단 문장 ${STORIES.reduce((a, s) => a + s.sentences.length, 0)}`)
console.log('이야기별 문장 수:', STORIES.map((s) => s.sentences.length).join(','))
console.log('아이템 수:', ITEMS.length, '(직업당', ITEMS.length / 29, ')')

// 대표 문항 출력
const show = (unitId: string, wordText: string, mode: 'picture' | 'hear') => {
  const u = UNITS.find((x) => x.id === unitId)!
  const w = u.words.find((x) => x.text === wordText)!
  const r = makeOptions(w.text, w.pron, u, !!w.special, mode)
  console.log(`\n[${unitId}/${mode}] ${w.text} [${w.pron}] 보기:`, r.options.map((o) => `${o.label}(${o.kind})`).join(' | '))
  for (const o of r.options.filter((x) => x.kind !== 'correct')) {
    console.log(
      '  -',
      o.label,
      '→',
      makeFeedback({ unit: u, mode, target: w.text, pron: w.pron, chosen: o.label, origJong: r.origJong, chosenJong: o.jong, kind: o.kind, special: !!w.special }),
    )
  }
}
show('1-3', '옷', 'picture')
show('1-3', '옷', 'hear')
show('1-1', '책', 'picture')
show('1-2', '산', 'picture')
show('2-6', '닭', 'picture')
show('2-6', '닭', 'hear')
show('2-2', '많다', 'hear')
show('2-3', '밟다', 'hear')
show('2-3', '넓다', 'picture')

// 유사도
const o = '우리 집 강아지 이름은 콩이에요.'
console.log('\n유사도 동일:', similarity(o, '우리 집 강아지 이름은 콩이에요'))
console.log('유사도 일부 틀림:', similarity(o, '우리 집 강아지 이름은 공이에요').toFixed(2), markWords(o, '우리 집 강아지 이름은 공이에요').filter((m) => m.bad).map((m) => m.word))
console.log('유사도 엉뚱:', similarity(o, '안녕하세요').toFixed(2))
// 읽기 테스트(두루책방) 데이터 점검
{
  const dirs = new Set<number>()
  for (const b of DOORU_BOOKS) {
    if (dirs.has(b.dir)) bad(`두루책방 책 번호 중복: ${b.dir}`)
    dirs.add(b.dir)
    if (!b.sentences.length || b.sentences.some((s) => !s.trim())) bad(`${b.title}: 읽을 문장이 비었음`)
    if (!b.authors || !b.pages) bad(`${b.title}: 저작자·쪽 표기 없음 (CC BY 출처 표시에 필요)`)
    if (!bookUrl(b).includes(`Dir=${b.dir}`)) bad(`${b.title}: 책 주소 이상`)
    if (bookByUnitId(readUnitId(b)) !== b) bad(`${b.title}: unit_id 변환 이상`)
    // 모든 문장이 같은 문장으로 자기 자신과 비교하면 통과해야 한다
    for (const s of b.sentences) if (!judgeReading(s, s).pass) bad(`${b.title}: 자기 자신과 비교가 통과하지 않음: ${s}`)
  }
  for (const level of [1, 2, 3, 4, 5, 6]) {
    const n = booksOfLevel(level).length
    if (n > 0) console.log(`읽기 테스트 ${level}단계: 책 ${n}권 → ${booksOfLevel(level).map((b) => b.title).join(', ')} (모두 표시)`)
  }
}

// 이야기 읽기 판정: 틀린 낱말이 하나라도 있으면 통과가 아니어야 한다 (유사도 % 만으로는 통과해 버렸다)
{
  const cases: [string, string, boolean][] = [
    ['우리 집 강아지 이름은 콩이에요.', '우리 집 강아지 이름은 콩이에요', true],
    ['우리 집 강아지 이름은 콩이에요.', '우리집 강아지 이름은 콩이에요', true], // 띄어쓰기는 무시
    ['우리 집 강아지 이름은 콩이에요.', '네 우리 집 강아지 이름은 콩이에요', true], // 더 붙은 말은 허용
    ['우리 집 강아지 이름은 콩이에요.', '우리 집 강아지 이름은 공이에요', false],
    ['책을 읽다가 잠이 들었어요.', '책을 일다가 잠이 들었어요', false],
    ['나는 밥을 맛있게 다 먹었어요.', '나는 밥을 맛있게 다 먹어어요', false],
    ['오늘은 하늘이 맑아요.', '오늘은 하늘이', false],
    ['오늘은 하늘이 맑아요.', '', false],
    // 음성 인식이 소리는 같은데 철자를 다르게 적는 경우는 통과해야 한다
    ['엄지, 집게손가락, 가운뎃손가락, 약손가락, 새끼손가락', '엄지 집게 손가락 가운데 손가락 약 손가락 새끼 손가락', true],
    ['엄지, 집게손가락, 가운뎃손가락, 약손가락, 새끼손가락', '엄지 집게 손가락 가운데 손가락 약 손가락 새끼 손가락', true],
    ['모두 열 손가락 오른손에 다섯 손가락, 왼손에 다섯 손가락', fixNumbers('모두 열 손가락 오른손에 다섯 손가락, 왼손에 다섯 손가락', '모두 10 손가락 오른손에 5 손가락 왼손에 5 손가락'), true],
    // 그래도 진짜로 틀리게 읽은 것은 통과하면 안 된다
    ['엄지, 집게손가락, 가운뎃손가락, 약손가락, 새끼손가락', '엄지 집게 손가락 가운데 손가락 약 손가락 새끼 손가락 손가락', true], // 더 붙은 말은 허용
    ['엄지, 집게손가락, 가운뎃손가락, 약손가락, 새끼손가락', '엄지 집게손가락 가운데 손가락 약손가락', false], // 새끼손가락을 안 읽음
    ['엄지, 집게손가락, 가운뎃손가락, 약손가락, 새끼손가락', '엄지 집게손가락 가운데 손가락 약손가락 새기손가락', false],
    ['오늘 맛집에 갔어요.', '오늘 맛집에 갔어요', true],
    ['오늘 맛집에 갔어요.', '오늘 마지메 갔어요', false],
  ]
  for (const [o, h, want] of cases) {
    const j = judgeReading(o, h)
    if (j.pass !== want) bad(`읽기 판정 이상: "${o}" ← "${h}" → 통과=${j.pass} (기대 ${want}, 유사도 ${(j.similarity * 100).toFixed(0)}%)`)
  }
  if (!judgeWord('읽다가', '읽다가') || judgeWord('읽다가', '일다가')) bad('낱말 따로 읽기 판정 이상')
}

// 선생님 확인 대기 목록: 3번 틀려 '도움 필요'가 남은 문장만, 선생님·학생이 해결하면 사라져야 한다
{
  const mk = (id: number, feedback: string | null, is_correct = false, student = 's1', item = 'story-1-s0'): HelpAttempt => ({
    id, student_id: student, level: 'paragraph', unit_id: 'story-1', item_id: item, target: '문장',
    answer: `읽음${id}`, is_correct, feedback,
  })
  const none = pendingHelp([mk(1, null), mk(2, null)])
  if (none.length !== 0) bad('2번 틀린 것은 대기 목록에 없어야 함')
  const one = pendingHelp([mk(1, null), mk(2, null), mk(3, TAG_HELP)])
  if (one.length !== 1 || one[0].answers.length !== 3) bad('3번 틀리면 대기 목록에 최근 읽은 글자와 함께 나와야 함')
  if (pendingHelp([mk(1, null), mk(2, null), mk(3, TAG_HELP), mk(4, TAG_PASS, true)]).length !== 0) bad('선생님이 통과로 확인하면 목록에서 사라져야 함')
  if (pendingHelp([mk(1, null), mk(2, null), mk(3, TAG_HELP), mk(4, TAG_SKIP, false)]).length !== 0) bad('선생님이 넘어가기를 누르면 목록에서 사라져야 함')
  if (pendingHelp([mk(1, null), mk(2, null), mk(3, TAG_HELP), mk(4, null, true)]).length !== 0) bad('학생이 다시 읽어 통과하면 목록에서 사라져야 함')
  if (pendingHelp([mk(1, TAG_HELP), mk(2, TAG_PASS, true), mk(3, null), mk(4, null), mk(5, TAG_HELP)]).length !== 1) bad('다시 3번 틀리면 다시 대기해야 함')
  if (pendingHelp([mk(1, TAG_HELP, false, 's1'), mk(2, TAG_HELP, false, 's2')]).length !== 2) bad('학생마다 따로 대기해야 함')
}

// 이야기 읽기 피드백(틀린 낱말 짚기 + 받침 힌트)
const fbTest = (orig: string, heard: string) => {
  const r = wordFeedbacks(orig, heard)
  console.log(`\n[읽기] "${orig}" ← "${heard}"`)
  for (const f of r) console.log('  -', f.word, '|', f.hint)
  return r
}
if (fbTest('책을 읽다가 잠이 들었어요.', '책을 일다가 잠이 들었어요').length !== 1) bad('읽다가 피드백 개수')
if (!fbTest('책을 읽다가 잠이 들었어요.', '책을 일다가 잠이 들었어요')[0].hint.includes('ㄺ')) bad('ㄺ 받침 힌트 없음')
if (fbTest('밖에 나가면 꼬리를 흔들어요.', '밖에 나가면 꼬리를 흔들어요').length !== 0) bad('정답인데 피드백 나옴')
if (fbTest('오늘은 하늘이 맑아요.', '오늘은 하늘이 말가요')[0].hint.includes('소리가 나요')) bad('연음인데 받침 힌트가 나옴')
if (!fbTest('닭 한 마리가 꼬끼오 울어요.', '달 한 마리가 꼬끼오 울어요')[0].hint.includes('ㄺ')) bad('닭 받침 힌트 없음')
fbTest('오늘은 하늘이 맑아요.', '오늘은 하늘이 말가요')
fbTest('우리 집 강아지 이름은 콩이에요.', '우리 집 강아지 이름은')
// 겹받침(2부) 문제는 정답 낱말을 소리 나는 대로 읽어 준다 (넓지 → 널찌)
{
  let n = 0
  for (const u of UNITS.filter((x) => x.part === 2)) {
    for (const q of buildQuestions(u, 'word')) {
      n++
      if (!q.audio.includes(q.pron) && !q.audio.includes(q.target)) bad(`${q.target}: 읽어 줄 소리가 없어요`)
      if (q.audio !== q.pron) bad(`${q.target}: 읽어 주는 글자가 ${q.audio} (소리 ${q.pron})`)
      if (q.correctSpeak !== q.pron) bad(`${q.target}: 정답 소리가 ${q.correctSpeak}`)
      const sound = q.options.find((o) => o.kind === 'sound')
      if (!sound) bad(`${q.target}: 소리 나는 대로 쓴 보기가 없어요`)
      else if (sound.label === q.target || sound.speak !== q.pron) bad(`${q.target}: 소리 보기 이상 ${sound.label}`)
      if (q.options.length !== 3 || new Set(q.options.map((o) => o.label)).size !== 3) bad(`${q.target}: 보기 3개가 서로 달라야 해요`)
      const right = q.options.find((o) => o.correct)
      if (right?.speak !== q.pron) bad(`${q.target}: 정답 보기 소리가 ${right?.speak}`)
    }
  }
  console.log('\n[겹받침 소리] 단어 문제', n, '개 확인')
}
// 겹받침 낱말과 문장 정답 낱말에는 모두 뜻 한 줄이 있어야 한다
{
  const miss = new Set<string>()
  for (const u of UNITS.filter((x) => x.part === 2)) {
    for (const { w } of activeWords(u)) if (!meaningOf(w.text)) miss.add(w.text)
    for (const { s } of activeSentences(u)) if (!meaningOf(s.target)) miss.add(s.target)
  }
  if (miss.size) bad(`뜻이 없는 낱말: ${[...miss].join(', ')}`)
  console.log('[뜻 힌트] 겹받침 낱말', Object.keys(MEANINGS).length, '개 · 빠진 것', miss.size)
}
// 꿈 세계: 직업마다 요소 6개, 그림 파일 있음, 직업 정보 문장은 짧게, 돈·상점 표현 금지
console.log('\n[꿈 세계]')
for (const j of JOBS) {
  const es = ELEMS.filter((e) => e.job === j.id)
  if (es.length !== STEPS.length) bad(`${j.label}: 요소 ${es.length}개 (필요 ${STEPS.length}개)`)
  if (new Set(es.map((e) => e.id)).size !== es.length) bad(`${j.label}: 요소 번호가 겹쳐요`)
  for (const e of es) {
    const files = e.kind === 'me' ? [imgFigure(e.job, 'boy', e.idx), imgFigure(e.job, 'girl', e.idx)] : e.kind === 'tool' ? [imgTool(e.job, e.idx)] : [imgBg(e.job, e.idx)]
    for (const f of files) if (!existsSync('public' + f)) bad(`${j.label} ${e.name}: 그림 없음 ${f}`)
    if (!e.fact || e.fact.length > 32) bad(`${j.label} ${e.name}: 직업 정보 문장 길이 ${e.fact.length}`)
    if (/구매|가격|상점|(?<!주)사기/.test(e.name + e.fact)) bad(`${j.label} ${e.name}: 금지 표현`)
  }
}
for (const j of JOBS) {
  for (const g of ['boy', 'girl'] as const) {
    for (let n = 1; n <= 3; n++) if (!existsSync('public' + imgKit(j.id, g, n))) bad(`${j.label} ${g}: 도구 ${n}개 든 모습 그림 없음`)
  }
}
console.log('직업', JOBS.length, '· 요소', ELEMS.length, '· 문장 최대', Math.max(...ELEMS.map((e) => e.fact.length)), '자')
problems += growthProblems + josaProblems + resetProblems
console.log(problems === 0 ? '\n✅ 문제 없음' : `\n❌ 문제 ${problems}건`)

// 자동 점검에서도 발견한 문제를 실패 상태로 전달합니다.
if (problems > 0) process.exitCode = 1
