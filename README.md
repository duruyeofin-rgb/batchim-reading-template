# 꿈꾸는 받침 여행 — Codex 설치 도우미

이 브랜치는 **설치 스킬 배포용**입니다. 실제 앱 코드와 그림은 [main 브랜치](https://github.com/duruyeofin-rgb/batchim-reading-template/tree/main)에 있습니다.

## Codex에서 시작하기

Codex의 스킬 설치 도우미가 제공되는 환경에서는 다음 문장을 붙여 넣으세요.

~~~text
$skill-installer
https://github.com/duruyeofin-rgb/batchim-reading-template/tree/batchim-reading-installer
이 브랜치 루트의 SKILL.md를 batchim-reading-installer라는 이름으로 설치해 줘.
앱 자체는 아직 배포하지 말고 스킬 등록만 확인해 줘.
~~~

스킬이 보이지 않으면 Codex를 재시작하세요. 이후 앱을 설치할 작업 폴더를 열고 다음처럼 요청하세요.

~~~text
$batchim-reading-installer
꿈꾸는 받침 여행을 내 Supabase와 Vercel에 설치해 줘.
실제 앱은 main 브랜치에서 받아 줘.
가입·로그인·비밀번호 입력은 내가 직접 할게.
로컬 검사, DB 연결 검사, 배포 결과를 구분해서 알려 줘.
~~~

Supabase를 이미 만들었다면 어디까지 했는지도 알려 주세요. 비밀번호·비밀 키를 채팅에 넣을 필요는 없습니다.

## ZIP으로 수동 등록하기

[스킬 ZIP 다운로드](https://github.com/duruyeofin-rgb/batchim-reading-template/raw/refs/heads/batchim-reading-installer/batchim-reading-installer.zip)

ZIP에는 batchim-reading-installer/SKILL.md가 들어 있습니다. 압축을 푼 **batchim-reading-installer 폴더**를 다음 중 한 곳에 두세요.

- 현재 프로젝트 전용: 프로젝트 루트의 .agents/skills/batchim-reading-installer/SKILL.md
- 모든 프로젝트에서 사용: 사용자 홈의 .agents/skills/batchim-reading-installer/SKILL.md
- Windows 사용자 범위 예: %USERPROFILE%\.agents\skills\batchim-reading-installer\SKILL.md

같은 이름의 스킬을 여러 경로에 중복 설치하지 마세요. 기존 설치는 백업 후 갱신하세요. Codex의 설치 도우미가 관리하는 위치가 이미 있다면 그 위치를 유지하고 인식 여부를 확인하세요. 상세 규칙은 [OpenAI 공식 스킬 문서](https://learn.chatgpt.com/docs/build-skills)를 참고하세요.

스킬을 등록하지 않고도 이 브랜치의 SKILL.md를 Codex에 제공하고 “이 지침을 읽고 설치를 도와줘”라고 요청할 수 있습니다.

## 이미지도 들어 있나요?

**네. 앱 main 브랜치에 포함되어 있습니다.** 2026-10-16 파일 목록을 직업 정의와 대조한 결과입니다.

| 종류 | 파일 수 |
|---|---:|
| 기본 캐릭터 | 2 |
| 직업별 옷차림(29직업 × 3종 × 2모습) | 174 |
| 직업 도구(29 × 5) | 145 |
| 직업 배경(29 × 3) | 87 |
| 도구를 든 모습(29 × 3단계 × 2모습) | 174 |
| **public/dream/ 합계** | **582** |
| 낱말 그림 public/img/ | 39 |
| 미션 그림 public/missions/ | 6 |

기본 설치에는 이미지 생성이나 OpenAI API 키가 필요 없습니다. 스킬 ZIP은 설치 안내만 담고 있으므로 [앱 전체 ZIP](https://github.com/duruyeofin-rgb/batchim-reading-template/archive/refs/heads/main.zip)을 별도로 받아야 합니다. 앱의 학습 화면에서는 진행 상황에 따라 일부 아이템만 열립니다.

그림과 글의 출처·이용 조건은 [ASSETS.md](https://github.com/duruyeofin-rgb/batchim-reading-template/blob/main/ASSETS.md)를 확인하세요.

## 설치 완료의 기준

로컬 빌드 성공, 실제 Supabase 접근 규칙 검사 성공, Vercel 배포 성공은 서로 다른 확인 단계입니다. 특히 npm run verify:install은 실제 DB에 시험 데이터를 만들며 인증 계정이 남을 수 있습니다. 자세한 절차와 오류 해결은 [SKILL.md](SKILL.md)에 있습니다.
