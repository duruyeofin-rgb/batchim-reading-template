// Web Speech API (speechSynthesis) 로 한국어 읽어 주기
//
// 안드로이드 크롬에서 잘 되는 방식으로 맞춘다.
//  - 목소리를 직접 고르지 않고 lang='ko-KR' 만 지정해 기기가 알아서 고르게 한다
//    (목소리를 직접 골랐다가 조용해지는 기기가 있다)
//  - 재생 중인 소리를 끊은 뒤에는 잠깐 기다렸다가 새로 읽는다
let current: SpeechSynthesisUtterance | null = null // 재생 중 소리가 사라지지 않게 참조를 붙잡아 둔다
let timer: ReturnType<typeof setTimeout> | undefined

/** 화면 표시용 기호(**, [ ], ( ), ★)를 지우고 읽기 좋게 만든다 */
export const speakable = (t: string) => t.replace(/\*\*/g, '').replace(/[\[\]()★]/g, '').trim()

export const ttsSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window

/** 소리가 시작되지 않았을 때 알리는 이벤트 이름 (화면에서 안내를 띄운다) */
export const TTS_SILENT_EVENT = 'batchim-tts-silent'

export function speak(text: string, rate = 0.8) {
  if (!ttsSupported()) return
  const clean = speakable(text)
  if (!clean) return
  const synth = window.speechSynthesis
  const go = () => {
    try {
      const u = new SpeechSynthesisUtterance(clean)
      u.lang = 'ko-KR'
      u.rate = rate
      u.pitch = 1.1
      let started = false
      current = u
      u.onstart = () => {
        started = true
      }
      u.onend = () => {
        if (current === u) current = null
      }
      u.onerror = (e) => {
        if (current === u) current = null
        if (e.error !== 'canceled' && e.error !== 'interrupted') window.dispatchEvent(new Event(TTS_SILENT_EVENT))
      }
      synth.resume()
      synth.speak(u)
      // 3초 안에 소리가 시작되지 않으면 이 기기에서는 소리가 안 나는 것으로 본다
      setTimeout(() => {
        if (!started && current === u) window.dispatchEvent(new Event(TTS_SILENT_EVENT))
      }, 3000)
    } catch {
      window.dispatchEvent(new Event(TTS_SILENT_EVENT))
    }
  }
  clearTimeout(timer)
  if (synth.speaking || synth.pending) {
    synth.cancel()
    timer = setTimeout(go, 120)
  } else {
    go()
  }
}

export function stopSpeaking() {
  clearTimeout(timer)
  try {
    window.speechSynthesis?.cancel()
  } catch {
    /* ignore */
  }
}
