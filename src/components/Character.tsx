import { sceneOf } from '../data/dreamWorld'
import { type Gender, genderOf, imgBase, imgBg, imgFigure, imgKit, itemById } from '../data/items'

interface Props {
  character?: string | null
  /** 학생이 가진 요소(items)와 직업 — 열린 것만 장면에 나타난다 */
  job?: string | null
  items?: string[]
  className?: string // 높이를 정한다. 가로는 2:3 비율로 맞춰진다.
  showBg?: boolean
}

/**
 * 장면: 일하는 곳(배경) 위에 내 모습이 선다.
 * 도구는 따로 놓지 않고, 열린 도구를 캐릭터가 직접 들거나 쓴 그림으로 보여 준다.
 */
export default function Character({ character, job, items = [], className = '', showBg = true }: Props) {
  const g: Gender = genderOf(character)
  const scene = sceneOf(job, items)
  const outfit = itemById(scene.outfit)
  const bg = itemById(scene.bg)
  const n = Math.min(3, scene.tools.length)
  const figure = !outfit ? imgBase(g) : n > 0 ? imgKit(outfit.job, g, n) : imgFigure(outfit.job, g, outfit.idx)
  return (
    <div
      className={`relative aspect-[2/3] shrink-0 overflow-hidden rounded-2xl bg-gradient-to-b from-sky-100 to-amber-50 ${className}`}
      role="img"
      aria-label="나의 꿈 장면"
    >
      {showBg && bg && <img src={imgBg(bg.job, bg.idx)} alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />}
      <img src={figure} alt="" className="absolute inset-0 h-full w-full object-contain" draggable={false} />
    </div>
  )
}
