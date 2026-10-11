// public/img 의 그림을 문항 번호 이름표와 함께 한 장으로 모아 보는 점검용 시트를 만든다.
//   node scripts/contact-sheet.mjs <저장할 png 경로>
import { readdirSync } from 'node:fs'
import sharp from 'sharp'

const outFile = process.argv[2] ?? 'contact-sheet.png'
const files = readdirSync('public/img').filter((f) => f.endsWith('.webp')).sort()
const T = 150
const COLS = 8
const rows = Math.ceil(files.length / COLS)
const comps = []
for (let i = 0; i < files.length; i++) {
  const x = (i % COLS) * T
  const y = Math.floor(i / COLS) * (T + 22)
  comps.push({ input: await sharp('public/img/' + files[i]).resize(T, T).toBuffer(), left: x, top: y })
  const label = files[i].replace('.webp', '')
  comps.push({
    input: Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${T}" height="22"><text x="4" y="16" font-size="15" font-family="Arial" fill="#c00" font-weight="bold">${label}</text></svg>`,
    ),
    left: x,
    top: y + T,
  })
}
await sharp({ create: { width: T * COLS, height: rows * (T + 22), channels: 3, background: '#fff' } })
  .composite(comps)
  .png()
  .toFile(outFile)
console.log(`${files.length}장 → ${outFile}`)
