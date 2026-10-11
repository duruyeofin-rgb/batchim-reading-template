// 꿈 키우기 그림 변환: art-work/dream/*.png → public/dream/*.webp (가볍게 줄이기)
//   인물·배경: 512×768, 도구: 384×384. 투명 배경은 그대로 유지한다.
// 사용법: node scripts/process-dream.mjs
import { mkdirSync, readdirSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const src = 'art-work/dream'
const out = 'public/dream'
mkdirSync(out, { recursive: true })

let n = 0
let total = 0
for (const f of readdirSync(src).filter((x) => x.endsWith('.png'))) {
  const name = f.replace(/\.png$/, '')
  const isTool = /-tool-\d+$/.test(name)
  const size = isTool ? { width: 384, height: 384 } : { width: 512, height: 768 }
  const info = await sharp(path.join(src, f))
    .resize({ ...size, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 80, alphaQuality: 90 })
    .toFile(path.join(out, `${name}.webp`))
  n++
  total += info.size
}
console.log(`${n}장 변환 완료, 합계 ${Math.round(total / 1024)}KB → ${out}`)
