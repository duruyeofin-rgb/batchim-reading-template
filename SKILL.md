---
name: batchim-reading-installer
description: 꿈꾸는 받침 여행(batchim-reading-template)을 선생님의 Supabase와 Vercel에 설치하고 점검한다. Codex 또는 Claude에서 받침 여행 설치, 우리 반에 연결, 설치 오류 해결을 요청할 때 사용한다. 앱 소스는 main 브랜치에서 받는다.
---

# 꿈꾸는 받침 여행 설치 도우미

이 스킬은 설치 지침입니다. 앱 코드와 이미지는 **main 브랜치**에 있고, 스킬 배포용 **batchim-reading-installer 브랜치**에는 앱이 없습니다.

- 앱 저장소: https://github.com/duruyeofin-rgb/batchim-reading-template
- 앱 ZIP: https://github.com/duruyeofin-rgb/batchim-reading-template/archive/refs/heads/main.zip
- 설치 안내: https://github.com/duruyeofin-rgb/batchim-reading-template/blob/main/SETUP.md
- SQL 원문: https://raw.githubusercontent.com/duruyeofin-rgb/batchim-reading-template/main/supabase/setup.sql

## 0. 작업 환경과 진행 상태

1. 현재 대화에서 이미 알려 준 설치 위치, Supabase 준비 상태, 배포 요청을 활용한다. 모르는 필수 정보만 묻고, 가능한 파일 확인과 로컬 준비는 계속한다.
2. Codex 앱·CLI·IDE 또는 Claude Code처럼 파일과 명령을 사용할 수 있으면 아래 절차를 수행한다. 도구가 없는 일반 채팅에서는 마지막의 화면 안내 방식으로 진행한다.
3. GitHub 연결만으로 로컬 파일이나 터미널까지 사용할 수 있다고 가정하지 않는다. 현재 사용 가능한 파일·명령·브라우저 도구를 확인한다.
4. 기존 앱 폴더가 있으면 먼저 파일과 변경 상태를 확인한다. 새 설치라면 허용된 작업 공간 아래 빈 폴더를 사용하고 절대 경로를 알려 준다. 기존 폴더나 .env.local을 덮어쓰지 않는다.

## 1. 앱 내려받기와 필수 파일 확인

Git이 있으면 비어 있는 대상에 main을 받는다. 다음 명령의 batchim-reading은 아직 없는 폴더여야 한다.

~~~sh
git clone --branch main --single-branch https://github.com/duruyeofin-rgb/batchim-reading-template.git batchim-reading
cd batchim-reading
~~~

Git이 없으면 위 앱 ZIP을 새 폴더에 내려받아 압축을 풀고, 실제 앱 루트인 batchim-reading-template-main으로 이동한다. 공개 ZIP 다운로드에는 GitHub 계정이 필요 없다. 다운로드가 차단되면 브라우저로 ZIP을 받아 압축을 푼 앱 폴더를 Codex에서 열도록 안내한다. 관리 정책을 우회하지 않는다.

필수 파일: package.json, package-lock.json, .env.example, CLAUDE.md, SETUP.md, supabase/setup.sql, public/dream/.

- SKILL.md와 작은 ZIP만 보이면 설치 스킬 브랜치를 받은 것이다. 앱은 main에서 다시 받는다.
- 해당 경로에 적용되는 AGENTS.md가 있으면 먼저 읽는다. 이 앱의 CLAUDE.md는 Codex에서도 **명시적으로 열어 읽고**, SETUP.md, package.json, .env.example과 함께 실제 설치 절차를 확인한다. Codex가 CLAUDE.md를 자동으로 읽는다고 가정하지 않는다.
- 저장소 안내는 앱 설정의 근거로 사용한다. 사용자 요청과 실행 환경의 권한을 우선하며, 오래된 안내와 현재 코드가 다르면 차이를 확인하고 설명한다. 파일 이름을 바꾸거나 AGENTS.md를 덮어쓸 필요는 없다.

### 포함된 그림

2026-10-16 main 확인 기준: public/dream/에 29개 직업의 그림 582개(기본 캐릭터 2개, 옷차림 174개, 도구 145개, 배경 87개, 도구를 든 모습 174개)가 있다. public/img/에는 낱말 그림 39개, public/missions/에는 미션 그림 6개가 있다.

기본 설치에는 이미지 생성, OpenAI API 키, 이미지 생성 비용이 필요 없다. public/을 빠짐없이 내려받고 배포한다. 생성 스크립트는 사용자가 새 그림을 요청할 때만 검토한다. 그림·두루책방 글·글꼴의 출처와 이용 조건은 ASSETS.md를 확인하고 출처 표시를 유지한다. 파일 수는 이후 바뀔 수 있으므로 설치 시 현재 코드와 파일 경로를 대조한다.

## 2. 실행 도구와 로컬 준비

- node --version, npm --version으로 도구 유무를 확인한다. package.json과 잠금 파일의 의존성 요구 버전에 맞는 Node.js LTS를 사용한다. 설치가 필요하면 공식 배포 경로를 안내하고 현재 환경의 설치 권한을 따른다.
- 명령은 package.json이 있는 앱 루트에서 실행한다. 잠금 파일이 있으면 npm ci로 재현 가능한 설치를 우선한다. 잠금 파일 불일치를 무시하거나 임의로 삭제하지 말고 원인을 확인한다.
- Windows PowerShell에서 npm.ps1 실행 정책 오류가 나면 npm.cmd를 사용한다. 실행 정책을 완화하지 않는다.
- .env.local이 없을 때만 .env.example을 복사한다. Windows는 Copy-Item .env.example .env.local, macOS/Linux는 cp .env.example .env.local을 사용할 수 있다.

## 3. 선생님의 Supabase 연결

새 전용 프로젝트인지, 이미 학생 기록이 있는 프로젝트인지 먼저 구분한다. 기존 기록이 있는 DB에 초기 설치 SQL을 자동으로 재실행하지 않는다.

선생님이 가입·로그인·비밀번호 입력을 직접 하도록 안내하고 다음 상태를 확인한다.

1. Supabase 프로젝트 생성: 서울 리전을 선택할 수 있으면 선택한다. 요금제와 제한은 현재 대시보드에서 확인한다.
2. Authentication: Anonymous Sign-Ins 켜기, Email 켜기, Confirm email 끄기 후 저장. 이 앱은 교사 아이디를 내부용 이메일 주소로 바꾸므로 이메일 확인을 요구하면 가입이 막힐 수 있다.
3. 새 프로젝트 SQL Editor에서 내려받은 supabase/setup.sql 전체를 실행한다. 고정된 줄 수로 잘라 복사하지 않는다. optional-teacher-invite.sql은 초기 설치에 사용하지 않는다.
4. .env.local에 아래 두 값만 설정한다. 선생님이 로컬 파일에 직접 입력할 수 있고 채팅에 붙일 필요는 없다.

~~~dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_OR_PUBLISHABLE_KEY
~~~

공개 키는 anon 또는 sb_publishable_로 시작하는 publishable 키다. service_role, sb_secret_ 키나 DB 비밀번호는 프런트엔드에 넣지 않는다. 환경 파일 전체를 로그에 출력하지 않는다.

## 4. 설치 검증

다음 로컬 검사를 순서대로 실행하고 실제 종료 결과를 확인한다.

~~~sh
npm run build
npm run check
npm run check:sql
~~~

이 검사들의 성공만으로 실제 Supabase 연결이나 RLS 검증이 끝났다고 말하지 않는다. 연결 설정과 SQL 적용이 준비되면 scripts/verify-install.mjs를 읽고 동작을 설명한 뒤 실행한다.

~~~sh
npm run verify:install
~~~

이 명령은 실제 Supabase에 시험 교사 2명, 익명 학생 계정, 시험 학급과 기록을 생성한다. 정상 완료 시 시험 학급·학생 기록을 정리하지만 인증 계정은 남는다. 도중 실패하면 시험 학급도 남을 수 있다. 실행 대상 프로젝트를 확인하고, 실패 시 생성된 시험 데이터만 식별해서 안내한다. 기존 학급이나 사용자를 일괄 삭제하지 않는다.

이미 요청된 설치 검증 범위에서는 진행하되, 대상 DB가 불명확하거나 기존 운영 데이터 변경이 필요하면 확인받는다. 원인을 수정한 검사만 다시 실행한다. 요청 제한 오류에 연속 재시도하지 않는다. 자격 증명이나 네트워크가 없어 실행하지 못한 검사는 미실행으로 기록한다.

npm run dev로 로컬 화면을 열고 터미널에 나온 주소를 사용한다. 포트를 고정해서 추측하지 않는다.

## 5. Vercel 배포와 화면 확인

사용자가 배포까지 요청했다면 기존 허가 범위에서 진행한다. 로컬 설치만 요청했다면 배포 방법을 안내한다.

- GitHub 방식: Use this template로 선생님 계정에 앱 복사본을 만들고 Vercel에서 Import한다. 앱 코드가 main에 있는지 확인한다.
- GitHub 계정 없이: 로컬 앱 폴더에서 Vercel CLI 경로를 사용할 수 있다. Vercel 가입·로그인은 선생님이 직접 한다.
- 현재 vercel.json과 package.json을 확인한다. 이 앱은 Vite이며 빌드 명령은 npm run build, 출력 폴더는 dist이다.
- Vercel에도 위 두 환경 변수를 배포 대상 환경에 설정한다. Vite 변수는 빌드 시 반영되므로 변경 후 재배포한다.
- .env.local, .vercel, 인증 토큰을 Git에 올리지 않는다. Vercel 도구 실행 뒤 .gitignore 변경과 .env.example의 추적 여부를 확인한다. 임시 토큰은 제거하되 기존 로컬 설정 파일을 통째로 삭제하지 않는다.

실제 배포 주소에서 확인할 것:

1. /teacher 직접 접속 및 새로고침, 교사 가입·로그인, 학급 생성, 6자리 코드와 QR.
2. 다른 브라우저 또는 시크릿 창에서 학생 코드·번호 입장.
3. 연습 후 기록이 교사 화면에 반영되는지.
4. 기본 캐릭터와 직업 그림이 표시되는지, 개발자 도구에서 /dream/ 이미지 404가 없는지.
5. HTTPS와 브라우저 마이크 권한. 실제 녹음·음성 인식은 사용자의 기기에서도 확인한다.

직접 확인할 도구가 없으면 선생님에게 해당 동작만 확인하도록 안내한다. 배포 성공과 화면·DB 검증 성공을 구분해서 보고한다.

## 지킬 규칙

- 학생 이름·연락처·성별·음성 녹음 등 개인정보 저장 기능을 추가하지 않는다.
- 기존 학생 기록, 스키마, RLS를 변경하거나 삭제해야 하면 대상, 백업, 복구 방법을 설명하고 확인받는다. RLS를 끄거나 약하게 만들어 설치 오류를 덮지 않는다.
- 유출된 비밀 키가 발견되면 값을 재출력하지 않고 교체를 안내한다.
- SQL 원본을 수정할 필요가 있으면 npm run build:sql로 setup.sql을 재생성하고 npm run check:sql을 실행한다.
- Supabase 보안 경고는 제목만 보고 모두 정상이라고 단정하지 않는다. 현재 CLAUDE.md의 예상 경고와 정책·함수 권한을 대조하고 새로운 경고나 RLS Disabled 오류는 원인을 확인한다.
- 학교·기관 보안 정책과 OS 보안 기능을 우회하지 않는다.

## 자주 생기는 문제

| 증상 | 확인할 것 |
|---|---|
| package.json을 찾지 못함 | 앱 main을 받았는지, 터미널이 압축 해제된 앱 루트에 있는지 |
| npm을 찾지 못함 | Node.js/npm 설치와 터미널 재시작 |
| npm.ps1 실행이 차단됨 | PowerShell에서 npm.cmd 사용 |
| 학급 생성 실패 | setup.sql 적용, optional-teacher-invite.sql 적용 여부 |
| 교사 가입 실패 | Email 활성화, Confirm email 비활성화 |
| 학생 입장 실패 | Anonymous Sign-Ins, 로그인 요청 제한 |
| 설정 필요 또는 빈 화면 | 두 환경 변수, 프로젝트 주소, 빌드 로그, 환경 변경 후 재배포 |
| 그림이 안 나옴 | public/dream/ 포함 여부, 이미지 경로·대소문자·404 |
| 연결하던 앱이 멈춤 | Supabase 프로젝트 일시정지 상태와 현재 서비스 상태 |
| 마이크가 안 됨 | HTTPS, 권한, 브라우저 지원과 기기 설정 |

## 일반 채팅만 가능한 경우

SETUP.md를 읽어 Supabase 생성 → 로그인 설정 → setup.sql 실행 → GitHub 템플릿 복사 → Vercel Import와 환경 변수 → 교사·학생 화면 확인 순서로 안내한다. 선생님이 이미 끝낸 단계를 반복하지 않는다. GitHub를 쓰지 않는다면 파일·터미널을 사용할 수 있는 Codex 앱·CLI·IDE 환경에서 앱 폴더를 열도록 안내한다. 실행 도구가 없는데 설치·검사를 완료했다고 말하지 않는다.

## 완료 보고

앱 폴더, 사용한 소스 브랜치 또는 커밋, 실제 실행한 검사와 결과, 배포했다면 실제 URL, 남은 사용자 확인 사항을 짧게 정리한다. 로컬 준비, DB 검증, 배포, 기기 확인 중 어디까지 끝났는지 분명히 말한다.
