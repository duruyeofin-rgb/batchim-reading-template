// 읽기 테스트: 두루책방(재단법인 씨앗·에누마)의 책에서 일부 문장을 발췌해 학생이 소리 내어 읽는다.
//
// ※ 출처·저작권
//  - 두루책방의 책은 CC BY 4.0 으로 제공된다. 각 책의 마지막 쪽에
//    “책 제목” is licensed under CC BY 4.0 by Enuma, Inc. & The Foundation SeeArt for Book Culture. © 2019 … 라고 적혀 있다.
//  - CC BY 4.0 조건: 저작자 표시, 라이선스 링크, 변경 표시(여기서는 '일부 발췌'). 삽화는 쓰지 않고 글만 쓴다.
//  - 책을 추가하려면: 두루책방에서 PDF 를 받아 판권 쪽(마지막 쪽)에서 CC BY 4.0 표시와 저작자를 확인한 뒤 아래 목록에 추가한다.

export interface DooruBook {
  /** 두루책방 책 번호(Dir) */
  dir: number
  level: 1 | 2 | 3 | 4 | 5 | 6
  title: string
  authors: string // 글·그림 저작자
  /** 읽을 부분 (책에서 발췌, 한 항목씩 소리 내어 읽는다) */
  sentences: string[]
  /** 발췌한 쪽 */
  pages: string
  /**
   * 외국 원작을 바탕으로 만든 책(2차 저작물)이면 원작 표기. 책 판권 쪽에
   * “…” is a derivative of “원작” by 원작자, used under CC BY 4.0. 라고 적혀 있다. 이런 책은 원작도 함께 표시해야 한다.
   */
  origin?: string
}

export const DOORU_SITE = 'http://xn--hu1b40go5ck8x.com/'
export const DOORU_APP = 'https://play.google.com/store/apps/details?id=com.enuma.easylibrary'
export const CC_BY_URL = 'https://creativecommons.org/licenses/by/4.0/deed.ko'

export const DOORU_BOOKS: DooruBook[] = [
  // ───────── 1단계 ─────────
  {
    dir: 14,
    level: 1,
    title: '나는 누구일까요?',
    authors: '글 김은파, 그림 도진영',
    pages: '2~4쪽',
    sentences: [
      '나는 바닷가에 살아요.',
      '아주 추운 곳이에요.',
      '나는 헤엄을 잘 쳐요.',
      '물속에서 물고기와 새우를 잡아요.',
      '나에게는 날개가 있어요.',
      '하지만 날지 못해요.',
    ],
  },
  {
    dir: 22,
    level: 1,
    title: '그려 주세요',
    authors: '글 정유진, 그림 이가은',
    pages: '2~5쪽',
    sentences: [
      '아빠, 배 그려 주세요.',
      '배? 어디 보자…',
      '자, 여기. 배!',
      '푸하하! 아니 아니, 그 배 아니고요…',
      '이 배가 아니라고?',
    ],
  },

  // ───────── 2단계 ─────────
  {
    dir: 44,
    level: 2,
    title: '내 친구 고양이',
    authors: '글 김은파, 그림 이가은',
    pages: '2~4쪽',
    sentences: [
      '나의 가장 친한 친구 머루는 고양이입니다.',
      '머루와 나는 아기 때부터 친구였어요.',
      '나는 머루의 밥과 물 당번이에요.',
      '그릇에 사료와 깨끗한 물을 담아 주면 머루는 맛있게 먹어요.',
      '머루의 털을 빗어주거나 화장실을 청소하는 일은 엄마랑 아빠가 해요.',
    ],
  },
  {
    dir: 19,
    level: 2,
    title: '예쁜 두 손',
    authors: '글 이정아, 그림 박수진',
    pages: '2~5쪽',
    sentences: [
      '왼손 오른손 예쁜 내 두 손',
      '엄지, 집게손가락, 가운뎃손가락, 약손가락, 새끼손가락',
      '모두 열 손가락 오른손에 다섯 손가락, 왼손에 다섯 손가락',
      '손가락 끝에 손톱 손톱에는 손톱 반달도 있어요.',
    ],
  },
  {
    dir: 43,
    level: 2,
    title: '설날',
    authors: '글 박철주, 그림 조예원',
    pages: '2~4쪽',
    sentences: [
      '어제는 섣달그믐, 한 해의 마지막 날이고요 오늘은 새해 첫날, 설날이에요.',
      '눈썹 하얘졌다!',
      '섣달그믐 밤에 잠들면 눈썹이 하얘진대요.',
      '거울을 보니 눈썹은 그대로예요.',
    ],
  },
  {
    dir: 39,
    level: 2,
    title: '찾아 보아요',
    authors: '글 김은파',
    origin: '“Look Up!” by Aditi Dilip',
    pages: '2~4쪽',
    sentences: [
      '특별한 하나를 찾아 보세요!',
      '새들이 하늘 위로 날아가요.',
      '이 중 하나만 벌써 벌레를 잡았어요.',
      '알록달록 예쁜 연이 하늘에 가득해요.',
      '이 중 하나만 리본이 세 개 달렸어요.',
    ],
  },

  // ───────── 3단계 ─────────
  {
    dir: 50,
    level: 3,
    title: '나무 위의 모험',
    authors: '글 김은파',
    origin: '“Tara’s Treetop Adventure” by Sangeeta Velegar and Sarthak Sinha',
    pages: '2~3쪽',
    sentences: [
      '타라, 밤이 다 되었잖니.',
      '어디 있었니?',
      '엄마가 화난 목소리로 말했습니다.',
      '타라는 대답했습니다.',
      '학교 앞에 있는 큰 나무에 올라갔어요.',
      '하늘에 닿을 정도로 높은 나무였어요.',
    ],
  },
  {
    dir: 60,
    level: 3,
    title: '노란 무당벌레 라라',
    authors: '글 김은파',
    origin: '“Lara the Yellow Ladybird” by Nadene Kriel, Catherine Holtzhausen, and Martha Evans',
    pages: '2~4쪽',
    sentences: [
      '무당벌레 라라는 특별한 벌레였어요.',
      '친구들과 달리 라라의 날개는 노란색이었거든요.',
      '모두가 라라의 노란색 날개를 좋아했어요.',
    ],
  },
  {
    dir: 49,
    level: 3,
    title: '달나라로 떠나자',
    authors: '글 김은파',
    origin: '“To the Moon!” by Mike Jaffe and Nesia Anindita',
    pages: '2~3쪽',
    sentences: [
      '존이라는 남자아이와 준이라는 여자아이가 살고 있었어요.',
      '어느 날 존과 준은 달에 가 보기로 했어요.',
      '달에 갈 때 무엇을 가져 갈까? 존이 물었어요.',
      '준은 말했어요. 음식을 가져 가자.',
    ],
  },
  {
    dir: 52,
    level: 3,
    title: '혼자 병원에 갔어요',
    authors: '글 박철주, 그림 김정현',
    pages: '2·4쪽',
    sentences: [
      '엄마, 열나.',
      '어제부터 목이 아프고 기침이 나더니, 열까지 났어요.',
      '간호사 선생님이 다정하게 맞아 주셨어요.',
      '얼른 접수를 하고 의자에 앉았어요.',
    ],
  },

  // ───────── 4단계 ─────────
  {
    dir: 57,
    level: 4,
    title: '바닷속 탐험',
    authors: '글 김은파',
    origin: '“DIVE!” by Rajiv Eipe',
    pages: '2~3쪽',
    sentences: [
      '오늘은 스쿠버 다이빙을 하기에 아주 좋은 날입니다.',
      '하늘은 맑고 파도는 잔잔합니다.',
      '우리는 두근거리는 마음으로 배에 올랐습니다.',
      '배가 다이빙 장소에 도착했습니다.',
      '물에 들어갈 준비를 해야 합니다.',
      '우리는 오리발을 신고 마스크를 썼습니다.',
    ],
  },
  {
    dir: 200,
    level: 4,
    title: '세종대왕: 임금님이 된 책벌레 왕자',
    authors: '글 이한, 그림 강아람',
    pages: '2~3쪽',
    sentences: [
      '충녕 대군은 조선의 왕자로 태어났습니다.',
      '아버지는 조선의 왕 태종이고 어머니는 원경왕후였습니다.',
      '어머니와 아버지는 충녕 대군을 몹시 사랑했습니다.',
    ],
  },
  {
    dir: 66,
    level: 4,
    title: '손톱 먹은 들쥐',
    authors: '글 차진나, 그림 박수진',
    pages: '2~3쪽',
    sentences: [
      '옛날 깊고 깊은 산속 마을에 게으른 꽁달이가 살았어요.',
      '꽁달이에게는 손톱을 깎고서 마당에 던져 버리는 못된 버릇이 있었습니다.',
      '어느 날 커다란 들쥐 한 마리가 마당을 지나가다가 꽁달이 손톱을 발견했어요.',
      '들쥐는 마당에 버려진 꽁달이 손톱을 오독오독 먹어 버렸습니다.',
    ],
  },
  {
    dir: 61,
    level: 4,
    title: '할아버지의 정원',
    authors: '글 김은파',
    origin: '“Grandpa Farouk’s Garden” by Matthew Kalil and Sam van Riet',
    pages: '2~4쪽',
    sentences: [
      '할아버지의 정원은 도시 한가운데 있어요.',
      '높은 건물들로 둘러싸여 있지요.',
      '아미르는 매주 할아버지 댁에 가요.',
      '할아버지는 꽃과 나무를 아주 좋아해요.',
    ],
  },

  // ───────── 5단계 ─────────
  {
    dir: 78,
    level: 5,
    title: '공룡은 어떻게 살았을까?',
    authors: '글 송지혜, 그림 박은현',
    pages: '2~5쪽',
    sentences: [
      '공룡은 아주 먼 옛날에 지구에 살던 동물이에요.',
      '공룡이라는 이름은 ‘무시무시한 도마뱀’이라는 뜻이지요.',
      '공룡의 종류는 엄청 많고, 생김새도 다양했어요.',
      '크앙! 날카로운 이빨을 가진 공룡이 나타났어요!',
      '공룡들은 다양한 방법으로 스스로를 보호했어요.',
    ],
  },
  {
    dir: 63,
    level: 5,
    title: '나는 커서 어떤 일을 할까?',
    authors: '글 박철주, 그림 지동환',
    pages: '2~4쪽',
    sentences: [
      '오늘은 친구들이랑 직업 체험 왔어요.',
      '체험장 안에는 요리사, 아나운서, 기자, 의사, 은행원 등 직업 체험실이 아주 많았어요.',
      '난 빵 만들기 체험할래.',
      '체험실을 둘러보던 소윤이가 말했어요.',
      '우리는 가위바위보로 체험 순서를 정했어요.',
      '먼저 플로리스트가 되어 보기로 했어요.',
    ],
  },

  // ───────── 6단계 ─────────
  {
    dir: 114,
    level: 6,
    title: '중국 만두 이야기',
    authors: '글 이흠, 그림 오드리 유앵',
    pages: '2·5쪽',
    sentences: [
      '안녕? 나는 만두야.',
      '밀가루 반죽에 재료를 넣어 빚은 만두라는 음식은 오래전 중국에서 처음 만들어졌어.',
      '만두라는 이름도 중국에서 왔지.',
      '중국 만터우는 속에 아무것도 안 들어 있어.',
      '밀가루 반죽을 뜨거운 김에 찐 것인데 부드럽고 담백해.',
    ],
  },
]

/** 책 읽기 화면으로 가는 주소 (두루책방 뷰어) */
export const bookUrl = (b: DooruBook) => `${DOORU_SITE}e-book/ecatalog5.php?Dir=${b.dir}&catimage=1`

/** 기록에 쓰는 번호: unit_id = read-<단계>-<책번호> */
export const readUnitId = (b: DooruBook) => `read-${b.level}-${b.dir}`

export const bookByUnitId = (unitId: string) => DOORU_BOOKS.find((b) => readUnitId(b) === unitId)

export const LEVELS = [1, 2, 3, 4, 5, 6] as const
export const booksOfLevel = (level: number) => DOORU_BOOKS.filter((b) => b.level === level)

/** 단계마다 책 2권을 무작위로 뽑는다 (책이 2권 이하면 모두) */
export function pickBooks(level: number, count = 2): DooruBook[] {
  const pool = [...booksOfLevel(level)]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, count)
}

// ───────── 학생별로 뽑은 책 기억하기 (이어 읽기) ─────────
const KEY = (studentId: string) => `batchim.readtest.v1.${studentId}`

export function loadPicks(studentId: string): Record<string, number[]> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY(studentId)) ?? '{}')
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

/** 단계별로 뽑은 책 번호(dir). 아직 안 뽑았거나 책 목록이 바뀌었으면 새로 뽑아 저장한다 */
export function getOrPickBooks(studentId: string): Record<number, DooruBook[]> {
  const saved = loadPicks(studentId)
  const out: Record<number, DooruBook[]> = {}
  let changed = false
  for (const level of LEVELS) {
    const pool = booksOfLevel(level)
    if (pool.length === 0) continue
    const ids = saved[String(level)] ?? []
    let books = ids.map((d) => pool.find((b) => b.dir === d)).filter((b): b is DooruBook => !!b)
    if (books.length === 0 || books.length < Math.min(2, pool.length)) {
      books = pickBooks(level)
      saved[String(level)] = books.map((b) => b.dir)
      changed = true
    }
    out[level] = books
  }
  if (changed) {
    try {
      localStorage.setItem(KEY(studentId), JSON.stringify(saved))
    } catch {
      /* 저장 못 해도 이번 화면에서는 동작 */
    }
  }
  return out
}
