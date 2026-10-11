// 직업 그림 만들기 (OpenAI 이미지 API). 키는 .env.local 의 OPENAI_API_KEY 만 쓰고, api.openai.com 으로만 보낸다.
//
// 사용법: node scripts/gen-art.mjs <출력파일.png> <크기: 1024x1024|1024x1536|1536x1024> <투명: yes|no> "<프롬프트>"
// 예)     node scripts/gen-art.mjs art-work/doctor-figure.png 1024x1536 yes "..."
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const [out, size = '1024x1024', transparent = 'no', ...rest] = process.argv.slice(2)
const prompt = rest.join(' ')
if (!out || !prompt) {
  console.error('사용법: node scripts/gen-art.mjs <출력.png> <크기> <투명 yes|no> "<프롬프트>"')
  process.exit(1)
}

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
)
const key = env.OPENAI_API_KEY
if (!key) {
  console.error('.env.local 에 OPENAI_API_KEY 가 없어요.')
  process.exit(1)
}

const body = {
  model: process.env.IMG_MODEL || 'gpt-image-1',
  prompt,
  size,
  quality: process.env.IMG_QUALITY || 'medium',
  n: 1,
  output_format: 'png',
}
if (transparent === 'yes') body.background = 'transparent'

const r = await fetch('https://api.openai.com/v1/images/generations', {
  method: 'POST',
  headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})
const j = await r.json()
if (!r.ok) {
  // 오류 메시지에는 키가 들어 있지 않다. 그래도 키 모양 문자열은 가려서 출력한다.
  console.error('실패', r.status, JSON.stringify(j.error ?? j).replace(/sk-[A-Za-z0-9_-]+/g, 'sk-***').slice(0, 400))
  process.exit(2)
}
mkdirSync(path.dirname(out), { recursive: true })
writeFileSync(out, Buffer.from(j.data[0].b64_json, 'base64'))
console.log('저장:', out, `(${body.model}, ${size}, ${body.quality}${j.usage ? ', 토큰 ' + j.usage.total_tokens : ''})`)
