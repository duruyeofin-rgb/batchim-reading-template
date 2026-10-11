// QR 로 들어온 주소(?c=학급코드)인지 알아본다. 학생 화면은 이 주소로 들어오면 코드를 자동으로 넣지 않고 입력부터 시작한다.
// 서버 연결과 무관한 작은 파일이라 점검 스크립트에서도 쓸 수 있다.

/** 주소의 ?c=코드 에서 6자리 학급 코드를 읽는다. 없거나 6자리가 아니면 빈 글자 */
export function codeFromUrl(search?: string): string {
  try {
    const q = search ?? window.location.search
    const c = new URLSearchParams(q).get('c') ?? ''
    const clean = c.replace(/[^0-9A-Za-z]/g, '').toUpperCase()
    return clean.length === 6 ? clean : ''
  } catch {
    return ''
  }
}
