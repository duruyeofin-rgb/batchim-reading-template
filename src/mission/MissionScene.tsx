import Character from '../components/Character'
import type { Student } from '../lib/api'
import { missionAssets as art } from './missionAssets'
import { MISSION_NAMES, type MissionKind } from './missionTypes'

export default function MissionScene({
  kind,
  done,
  total = 4,
  student,
}: {
  kind: MissionKind
  done: number
  total?: number
  student: Student
}) {
  const complete = done === total
  return (
    <div
      className={`mission-scene mission-scene-${kind}`}
      role="img"
      aria-label={`${MISSION_NAMES[kind]}: ${total}문제 중 ${done}문제 해결`}
    >
      <div className="mission-cloud cloud-one" />
      <div className="mission-cloud cloud-two" />
      <div className="mission-companion">
        <Character
          character={student.character}
          job={student.job}
          items={student.items}
          showBg={false}
          className="h-full"
        />
        <span>함께 해요</span>
      </div>
      {kind === 'rescue' && (
        <div className="mission-monsters">
          <div className={`mission-monster ${complete ? 'is-free' : 'in-bubble'}`}>
            <img
              src={art.monster}
              alt=""
              draggable={false}
              style={{ filter: `hue-rotate(${Math.min(done, total - 1) * 65}deg)` }}
            />
            <span className="mission-step-label">
              {complete ? '친구들을 모두 구했어요!' : `${done + 1}번째 친구를 구해 줘!`}
            </span>
          </div>
        </div>
      )}
      {kind === 'treasure' && (
        <div className={`mission-treasure ${complete ? 'is-open' : ''}`}>
          <img className="mission-chest" src={art.chest} alt="" draggable={false} />
          <div className="mission-locks">
            {Array.from({ length: Math.min(total, 4) }, (_, n) => {
              const i = Math.min(Math.floor(done / 4) * 4, total - Math.min(total, 4)) + n
              return (
                <div key={i} className={i < done ? 'unlocked' : ''}>
                  <img src={art.lock} alt="" />
                  <span>{i < done ? '열림' : i + 1}</span>
                </div>
              )
            })}
          </div>
          {complete && <span className="mission-found">내 직업의 꿈 도구를 발견했어!</span>}
        </div>
      )}
      {kind === 'train' && (
        <div className="mission-railway">
          <img className="mission-hospital" src={art.hospital} alt="" />
          <div className="mission-track" />
          <img className="mission-train" src={art.train} alt="" style={{ left: `${(done / total) * 47}%` }} />
          <span className="mission-station">{complete ? '병원에 도착했어요!' : '친구들과 병원으로'}</span>
        </div>
      )}
      <div className="mission-scene-progress" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={i < done ? 'is-done' : ''}>
            {i < done ? '✓' : i + 1}
          </span>
        ))}
      </div>
    </div>
  )
}
