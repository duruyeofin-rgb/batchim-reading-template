import { useEffect, useRef, useState } from 'react'
import { eulReul } from '../lib/hangul'
import { elemById } from '../data/dreamWorld'
import { imgTool } from '../data/items'
import { useStu } from '../student/ctx'
import { claimMissionReward } from './missionApi'
import type { MissionRun } from './missionTypes'

export default function MissionReward({run, pending}: {run: MissionRun; pending: boolean}) {
  const { refreshStudent } = useStu()
  const refresh = useRef(refreshStudent)
  refresh.current = refreshStudent
  const [reward, setReward] = useState<{item_id: string | null} | null>(null)
  const [retry, setRetry] = useState(0)
  const [error, setError] = useState(false)
  useEffect(() => {
    if (pending) return
    let alive = true
    setError(false)
    claimMissionReward(run).then(async saved => {
      if (!alive) return
      setReward(saved)
      await refresh.current()
    }).catch(() => { if (alive) setError(true) })
    return () => { alive = false }
  }, [run.student_id, run.unit_id, run.epoch, pending, retry])
  const tool = elemById(reward?.item_id)
  return <div className="mission-reward" aria-live="polite">
    {tool ? <><img src={imgTool(tool.job, tool.idx)} alt={tool.name} /><h3>{tool.name}{eulReul(tool.name)} 얻었어요!</h3><p>{tool.fact}</p><p>꿈 상자에서 내 도구를 만나 보세요.</p></>
      : reward ? <><h3>내 직업의 도구를 모두 모았어요!</h3><p>새 도구를 중복해서 받지는 않아요.</p></>
      : <><p>{pending ? '평가를 저장하면 꿈 도구를 받을 수 있어요.' : error ? '도구를 아직 받지 못했어요. 연결된 뒤 다시 받아요.' : '내 꿈 도구를 가져오고 있어요…'}</p>
        {error && <button className="btn-soft" onClick={() => setRetry(x => x + 1)}>도구 다시 받기</button>}</>}
  </div>
}
