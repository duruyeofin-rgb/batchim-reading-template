// 그림 변환: PNG/JPG 파일을 사이트용 512px webp 로 바꿔 public/img 에 저장한다.
//
// 사용법:  node scripts/process-pics.mjs <그림이 든 폴더>
//   - 폴더 안 파일 이름이 문항 번호여야 한다.  예) 1-3-w2.png  →  public/img/1-3-w2.webp
//   - 변환한 뒤 src/data/pics.ts 의 PIC_IDS 에 그 번호를 추가하면 그림 문제에 섞여 나온다.
import { mkdir, readdir } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const src = process.argv[2]
if (!src) {
  console.error('사용법: node scripts/process-pics.mjs <그림 폴더>')
  process.exit(1)
}
const out = path.resolve('public/img')
await mkdir(out, { recursive: true })

let n = 0
for (const f of await readdir(src)) {
  const m = f.match(/^(\d-\d-w\d+)\.(png|jpe?g|webp)$/i)
  if (!m) {
    console.log('건너뜀(이름 규칙이 아님):', f)
    continue
  }
  const info = await sharp(path.join(src, f))
    .resize(512, 512, { fit: 'contain', background: '#ffffff' })
    .webp({ quality: 82 })
    .toFile(path.join(out, `${m[1]}.webp`))
  console.log(`${m[1]}.webp  ${Math.round(info.size / 1024)}KB`)
  n++
}
console.log(`\n${n}장 변환 완료 → public/img`)
