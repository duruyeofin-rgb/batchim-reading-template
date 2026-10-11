// 꿈 키우기 그림 일괄 만들기 (OpenAI 이미지 API). 키는 .env.local 의 OPENAI_API_KEY 만 쓰고 api.openai.com 으로만 보낸다.
// 결과 PNG 는 art-work/dream/ 에 저장된다(Git 제외). 이미 있는 파일은 건너뛴다.
//
// 사용법
//   node scripts/gen-dream.mjs base                  # 기본 캐릭터(남/여) 2장
//   node scripts/gen-dream.mjs jobs [직업id ...]     # 직업별 옷차림 3벌(남/여)·도구 5개·배경 3개. id 를 안 쓰면 전부
//   node scripts/gen-dream.mjs kit [직업id ...]      # 도구를 들거나 쓴 모습(단계 1~3, 남/여)
//   환경변수: PART=tools,bgs,outfits(일부만)  CONC=4(동시 요청 수)  IMG_QUALITY=medium  FORCE=1(있어도 다시 만듦)
// 파일 이름: <직업>-outfit-<번호>-<boy|girl>.png, <직업>-tool-<번호>.png, <직업>-bg-<번호>.png
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const OUT = 'art-work/dream'
mkdirSync(OUT, { recursive: true })

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
)
const KEY = env.OPENAI_API_KEY
if (!KEY) {
  console.error('.env.local 에 OPENAI_API_KEY 가 없어요.')
  process.exit(1)
}
const MODEL = process.env.IMG_MODEL || 'gpt-image-1'
const QUALITY = process.env.IMG_QUALITY || 'medium'
const CONC = Number(process.env.CONC || 4)
const FORCE = process.env.FORCE === '1'
const mask = (s) => String(s).replace(/sk-[A-Za-z0-9_-]+/g, 'sk-***')
const sleep = (ms) => new Promise((s) => setTimeout(s, ms))

const STYLE =
  'Original 3D animated-movie style, glossy smooth skin, big expressive brown eyes, rosy cheeks, vibrant saturated colors, soft cinematic lighting, high quality render. '
const KID = {
  boy: 'a cute elementary-school boy about 8 years old with short black hair and warm brown eyes',
  girl: 'a cute elementary-school girl about 8 years old with long black hair tied in a neat low ponytail and warm brown eyes',
}
const NO = ' No text, no letters, no logos, no speech bubble, no watermark.'

async function call(url, init) {
  for (let i = 1; i <= 8; i++) {
    try {
      const r = await fetch(url, init())
      const j = await r.json()
      if (r.ok) return Buffer.from(j.data[0].b64_json, 'base64')
      const msg = mask(JSON.stringify(j.error ?? j)).slice(0, 300)
      if ((r.status === 429 || r.status >= 500) && i < 8) {
        // 한도에 걸리면 안내된 시간만큼 기다렸다가 다시 시도한다 (예: "try again in 12s")
        const m = /try again in ([\d.]+)s/.exec(msg)
        await sleep((m ? Number(m[1]) + 3 : 5 * i) * 1000)
        continue
      }
      throw new Error(`${r.status} ${msg}`)
    } catch (e) {
      if (i === 8 || /^\d{3} /.test(e.message)) throw new Error(mask(e.message))
      await sleep(3000 * i)
    }
  }
}

const gen = ({ prompt, size, transparent }) =>
  call('https://api.openai.com/v1/images/generations', () => ({
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL, prompt, size, quality: QUALITY, n: 1, output_format: 'png',
      ...(transparent ? { background: 'transparent' } : {}),
    }),
  }))

const edit = ({ prompt, size, transparent, refs }) =>
  call('https://api.openai.com/v1/images/edits', () => {
    const f = new FormData()
    f.append('model', MODEL)
    f.append('prompt', prompt)
    f.append('size', size)
    f.append('quality', QUALITY)
    f.append('output_format', 'png')
    if (transparent) f.append('background', 'transparent')
    for (const p of refs) f.append('image[]', new Blob([readFileSync(p)], { type: 'image/png' }), path.basename(p))
    return { method: 'POST', headers: { Authorization: `Bearer ${KEY}` }, body: f }
  })

async function pool(tasks) {
  let i = 0, ok = 0, fail = 0
  const worker = async () => {
    while (i < tasks.length) {
      const t = tasks[i++]
      const file = path.join(OUT, t.file)
      if (!FORCE && existsSync(file)) continue
      try {
        writeFileSync(file, await t.run())
        ok++
        console.log('저장', t.file)
      } catch (e) {
        fail++
        console.error('실패', t.file, e.message)
      }
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker))
  console.log(`\n완료: 새로 ${ok}장, 실패 ${fail}장`)
}

const mode = process.argv[2]

if (mode === 'base') {
  const tasks = ['boy', 'girl'].map((g) => ({
    file: `base-${g}.png`,
    run: () =>
      gen({
        size: '1024x1536',
        transparent: true,
        prompt:
          STYLE +
          `Full-body standing character: ${KID[g]}, wearing a simple colorful casual outfit (teal jacket over a white t-shirt, jeans and blue sneakers), friendly smile, relaxed pose, facing the camera, head to shoes fully visible.` +
          NO,
      }),
  }))
  await pool(tasks)
} else if (mode === 'jobs') {
  const jobs = JSON.parse(readFileSync('src/data/jobs.json', 'utf8'))
  const extra = JSON.parse(readFileSync('src/data/jobs-extra.json', 'utf8'))
  const parts = (process.env.PART || 'tools,bgs,outfits').split(',')
  const want = process.argv.slice(3)
  const list = want.length ? jobs.filter((j) => want.includes(j.id)) : jobs
  const tasks = []
  for (const j of list) {
    const x = extra[j.id] ?? { tools: [], bgs: [], outfits: [] }
    const tools = [j.tool, ...x.tools.map((t) => t[1])]
    const bgs = [j.bg, ...x.bgs.map((t) => t[1])]
    const outfits = [j.outfit, ...x.outfits.map((t) => t[1])]
    if (parts.includes('tools')) {
      tools.forEach((t, i) =>
        tasks.push({
          file: `${j.id}-tool-${i}.png`,
          run: () =>
            gen({
              size: '1024x1024',
              transparent: true,
              prompt: STYLE + `A single glossy 3D toy-like object, centered, filling most of the frame: ${t}. Cute, bold colors, clean shape.` + NO,
            }),
        }),
      )
    }
    if (parts.includes('bgs')) {
      bgs.forEach((b, i) =>
        tasks.push({
          file: `${j.id}-bg-${i}.png`,
          run: () =>
            gen({
              size: '1024x1536',
              transparent: false,
              prompt:
                STYLE +
                `A colorful children's-movie style background scene: ${b}. No people. Large empty floor area in the lower center where a character can stand. Vertical composition.` +
                NO,
            }),
        }),
      )
    }
    if (parts.includes('outfits')) {
      outfits.forEach((o, i) => {
        for (const g of ['boy', 'girl']) {
          tasks.push({
            file: `${j.id}-outfit-${i}-${g}.png`,
            run: () =>
              edit({
                size: '1024x1536',
                transparent: true,
                refs: [path.join(OUT, `base-${g}.png`)],
                prompt:
                  STYLE +
                  `Keep exactly the same character (same face, hair, eyes, skin, proportions, art style) as the reference image, but now dressed as a ${j.label} (role-play outfit): ${o}. Full-body standing pose, friendly smile, facing the camera, head to shoes fully visible. Replace the casual clothes completely with the job outfit. No printed words or logos on clothing.` +
                  NO,
              }),
          })
        }
      })
    }
  }
  await pool(tasks)
} else if (mode === 'kit') {
  // 도구를 들거나 쓴 모습: 옷차림 그림(outfit-0)을 바탕으로 도구를 1개·2개·3개 가진 모습을 만든다.
  // 도구는 열리는 차례대로 하나씩 늘어나므로 단계(kit-1~3)마다 이전 도구가 그대로 있다.
  // 파일 이름: <직업>-kit-<1|2|3>-<boy|girl>.png
  const jobs = JSON.parse(readFileSync('src/data/jobs.json', 'utf8'))
  const extra = JSON.parse(readFileSync('src/data/jobs-extra.json', 'utf8'))
  const world = JSON.parse(readFileSync('src/data/jobs-world.json', 'utf8'))
  const want = process.argv.slice(3)
  const list = want.length ? jobs.filter((j) => want.includes(j.id)) : jobs
  const tasks = []
  for (const j of list) {
    const tools = world[j.id].tools.map(([idx]) => (idx === 0 ? j.tool : extra[j.id].tools[idx - 1][1]))
    for (const g of ['boy', 'girl']) {
      for (let n = 1; n <= 3; n++) {
        const items = tools.slice(0, n).join('; ')
        tasks.push({
          file: `${j.id}-kit-${n}-${g}.png`,
          run: () =>
            edit({
              size: '1024x1536',
              transparent: true,
              refs: [path.join(OUT, `${j.id}-outfit-0-${g}.png`)],
              prompt:
                STYLE +
                `Keep exactly the same character (same face, hair, eyes, skin, proportions, art style) and exactly the same ${j.label} outfit as the reference image. Full-body standing pose, friendly smile, facing the camera, head to shoes fully visible. The character now naturally has exactly these job items: ${items}. Place each item naturally: a small item is held in one hand, an item that is normally worn is worn the usual way, and a large item stands right beside the character on the ground. Add ONLY the listed items. Do not add any other accessory, prop or clothing that is not in the list or in the reference image. A hand that is not holding a listed item stays empty and relaxed at the side. Nothing floats in the air.` +
                NO,
            }),
        })
      }
    }
  }
  await pool(tasks)
} else {
  console.error('사용법: node scripts/gen-dream.mjs base | jobs [직업id ...]')
  process.exit(1)
}
