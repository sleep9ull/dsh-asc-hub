<p align="center">
  <img src="https://raw.githubusercontent.com/sleep9ull/dsh-asc-hub/main/icon.svg" width="88" alt="dsh-asc-hub 아이콘">
</p>

<h1 align="center">dsh-asc-hub</h1>

<p align="center">
  <strong>DeepSeek Harness 안의 App Store Connect 콘솔.</strong><br>
  지금 세션의 작업 디렉터리를 빌드하고, TestFlight로 보내고, 심사를 제출하고, 배포합니다 — 이 코드를 만든 세션 옆의 사이드 패널에서.
</p>

<p align="center">
  <a href="https://github.com/sleep9ull/dsh-asc-hub/blob/main/README.md">English</a> | <a href="https://github.com/sleep9ull/dsh-asc-hub/blob/main/README.zh.md">简体中文</a> | 한국어 | <a href="https://github.com/sleep9ull/dsh-asc-hub/blob/main/README.ja.md">日本語</a>
</p>

<p align="center">
  <a href="https://github.com/sleep9ull/dsh-asc-hub/blob/main/README.ko.md#%EC%9A%94%EA%B5%AC-%EC%82%AC%ED%95%AD"><img alt="DSH" src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fsleep9ull%2Fdsh-asc-hub%2Fmain%2Fpackage.json&query=%24.engines.dsh&label=DSH&style=flat-square&color=4c6ef5&labelColor=454a54"></a>
  <a href="https://nodejs.org/"><img alt="Node" src="https://img.shields.io/node/v/%40sleep9ull%2Fdsh-asc-hub?style=flat-square&label=Node&logo=node.js&logoColor=white&color=339933"></a>
  <a href="https://github.com/sleep9ull/dsh-asc-hub/blob/main/tsconfig.json"><img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square&logo=typescript&logoColor=white"></a>
  <a href="https://github.com/sleep9ull/dsh-asc-hub/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/npm/l/%40sleep9ull%2Fdsh-asc-hub?style=flat-square&color=263146"></a>
  <a href="https://github.com/sleep9ull/dsh-asc-hub/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/sleep9ull/dsh-asc-hub?style=flat-square&color=4b6fff"></a>
  <a href="https://www.npmjs.com/package/@sleep9ull/dsh-asc-hub"><img alt="npm" src="https://img.shields.io/npm/v/%40sleep9ull%2Fdsh-asc-hub?style=flat-square&label=npm&color=cb3837"></a>
</p>

<div align="center">

[개요](#개요) · [설치](#설치) · [기능](#기능) · [워크플로](#워크플로) · [최초 설정](#최초-설정) ·
[요구 사항](#요구-사항) · [보안](#보안) · [설정](#설정) · [개발](#개발) ·
[알려진 제한](#알려진-제한) · [문서](#문서)

</div>

## 개요

iOS 앱 하나를 내보내는 시간은 대부분 코드를 쓰는 데 쓰이지 않습니다. 방금 빌드한 것을 아카이브하고,
업로드하고, 맞는 TestFlight 그룹에 맞는 빌드를 고르고, 테스터가 무엇을 봐야 하는지 적고, 심사를
기다리고, 배포하는 데 쓰입니다. 보통 Xcode Organizer, 브라우저 탭 하나, 터미널 사이를 오가며, 그리고
대개 에이전트가 코드를 끝낸 몇 분 뒤에 일어납니다.

`dsh-asc-hub`는 이 후반부를 Harness 사이드 패널에 넣고, 실제로 일어나는 순서대로 배열합니다. 오픈소스
[`asc`](https://github.com/rorkai/App-Store-Connect-CLI) CLI를 **외부 엔진으로 상속**합니다 — 설치하고,
실행하고, 출력을 읽습니다 — 콘솔과 상태 머신, 안전 장치는 이 플러그인이 소유합니다. CLI를 포크하거나
내장하거나 다시 구현하지 않으므로, `asc` 업그레이드가 곧 제품 기능의 업그레이드입니다.

문 두 개, 디스패처 하나: 패널과 `asc_hub` 모델 도구는 같은 Host 작업을 호출하므로 분류, 게이트,
민감정보 마스킹을 공유합니다.

> **버전 0.1.0** — DeepSeek Harness 0.2.2-rc.1 및 `asc` 6.5.3에서 검증했습니다.

## 설치

설치는 Harness의 플러그인 관리자로 합니다 — `git clone`도, 셸 명령도, tarball 다운로드도 필요 없습니다.

### Plugins → Add plugin (플러그인 → 플러그인 추가)

**Plugins → Add plugin(플러그인 → 플러그인 추가)**을 열고 spec을 붙여넣고 확인합니다:

```
@sleep9ull/dsh-asc-hub
```

버전을 고정하려면 `@sleep9ull/dsh-asc-hub@0.1.0`처럼 씁니다. 이후 업데이트는
**Plugins → Installed → Versions(플러그인 → 설치됨 → 버전)**이 담당합니다.

그다음 `asc-hub` 행을 켜고(플러그인 관리자에서 제목은 **App Store Connect hub(App Store Connect 콘솔)**), 오른쪽 사이드바에서
**ASC Hub(ASC 콘솔)** 탭을 엽니다.

> 데스크톱 앱의 profile은 앱이 직접 관리합니다. 셸에서 `profiles/<name>`에 설치하면 성공으로 보이지만
> 앱에는 나타나지 않을 수 있습니다 — 앱의 플러그인 페이지에서 설치하세요.

## 기능

| 구역 | 하는 일 | 뒤에서 도는 `asc` |
|---|---|---|
| **App & Bundle** | 앱을 선택하고 브라우저별로 기억 | `asc apps list` |
| **Working directory** | 세션이 어디서 작업하는지: 경로, 브랜치, `origin/main`과의 차이, 커밋되지 않은 파일, 그리고 **이 코드가 빌드 가능한지** — 불가능하면 이유까지 | `git status --porcelain=v1 --branch`, `xcode-select -p` |
| **Build** | 세션 작업 디렉터리의 코드를 아카이브하고 `.ipa`로 내보내 업로드; 버전과 빌드 번호는 두 개의 필드 | `asc xcode archive` → `asc xcode export` → `asc builds upload --wait` |
| **Builds** | 최신 빌드를 세 개씩, 바닥에 release 빌드 고정 행, `Internal` / `External` / `Release` 태그 | `asc builds list` |
| **TestFlight** | 빌드 선택, 그룹 선택, *What to Test* 작성, 발송 | `asc builds test-notes create`, `asc builds add-groups` |
| **Review** | 빌드 선택; 버전이 이미 배포됐으면 `Reviewed`, 아니면 readiness와 막는 항목, `Submit for review` | `asc validate`, `asc versions create`, `asc review submit` |
| **Release** | 심사를 통과한 버전을 배포 | `asc versions release` |
| **Skills** | 상속한 `asc` 스킬 팩을 보고하고 요청 시 설치 | `asc install-skills` |

패널이 그리지 않지만 모델이 쓸 수 있는 것도 있습니다: 판매 요약, analytics 리포트 요청, 펜스가 쳐진
읽기 전용 `asc` argv 탈출구, 그리고 `asc_hub` 도구를 통한 모든 패널 동작.

알아 둘 만한 설계 결정:

- **Build는 파일이 아니라 디렉터리를 빌드합니다.** 작업 단위는 세션이 보고 있는 코드이고, 산출물은 임시
  디렉터리에 떨어지며, 버전은 빌드 설정(`MARKETING_VERSION` / `CURRENT_PROJECT_VERSION`)으로 전달되므로
  프로젝트 파일을 절대 고쳐 쓰지 않습니다.
- **심사를 거치지 않은 빌드가 거쳤다고 말하지 않습니다.** 심사는 버전에 적용되므로 패널은 "어느 버전이 이
  빌드를 담고 있는가"를 묻습니다. TestFlight로만 나간 빌드는 올바르게 "심사 미제출"로 표시됩니다.
- **새로고침 버튼은 하나**이고 모든 구역을 한 번에 다시 읽습니다. 각 단계는 자기 빌드 메뉴를 가집니다.
  "테스터에게 보내기"와 "심사 제출"은 같은 목록 위의 서로 다른 결정이기 때문입니다.

## 워크플로

```
작업 디렉터리  →  Build  →  Builds  →  TestFlight  →  Review  →  Release
 빌드 가능?      아카이브    하나 고르기   그룹에 발송    Apple에 제출   스토어 배포
                내보내기
                업로드
```

모든 단계는 실제 `asc` 호출이고, 패널이 시작하든 모델이 시작하든 게이트는 동일합니다.

## 최초 설정

두 단계 모두 **로컬 동작**이며 기본 `read-only` 모드에서 끝낼 수 있습니다 — App Store Connect에 쓰는
동작만 `mode: write`가 필요합니다.

**1. `asc` 엔진 설치.** 패널이 먼저 탐지하고(`asc version`), Homebrew(`brew install asc`) 또는 공식
스크립트(`curl -fsSL https://asccli.sh/install | bash`)로 설치하며, 마스킹된 로그를 보여 줍니다.

**2. App Store Connect API Key로 로그인.**
[App Store Connect → 사용자 및 액세스 → 통합](https://appstoreconnect.apple.com/access/integrations/api)에서
키를 만들고 **Key ID**와 **Issuer ID**를 적어 두고 `AuthKey_XXXXXXXXXX.p8`을 한 번만 내려받아, 두 id와
함께 패널로 끌어다 놓습니다. Host는 PEM을 `0600` 임시 파일로 쓰고 `asc auth login --private-key …`에
넘긴 뒤 삭제합니다 — 자격 증명은 `asc`가 macOS Keychain에 보관합니다. 로그인은 **패널 전용**입니다:
모델은 `CLIENT_ONLY`만 받으므로 자격 증명 전달은 사람 쪽에서만 일어납니다.

키의 역할이 무엇을 할 수 있는지 결정합니다(업로드, TestFlight, 제출에는 Admin 또는 App Manager가
필요하고, 판매 데이터에는 리포트 권한이 필요합니다). Apple이 강제하며, 콘솔은 거부를 보고할 뿐
우회하지 않습니다. 전체 흐름과 문제 해결은 [docs/ONBOARDING.md](https://github.com/sleep9ull/dsh-asc-hub/blob/main/docs/ONBOARDING.md).

## 요구 사항

| | |
|---|---|
| **호스트** | 플러그인을 지원하는 DeepSeek Harness, `>=0.2.2-rc.1 <0.3.0` (`engines.dsh`에 선언되며, 호환되지 않으면 플러그인 관리자가 설치를 거부합니다) |
| **Node** | 22 이상 |
| **OS** | macOS — 자격 증명은 Keychain에, Build에는 Xcode가 필요합니다 |
| **Build** | 전체 Xcode (`xcode-select -p`가 `Xcode.app/Contents/Developer`를 가리켜야 합니다); Command Line Tools만 있으면 패널이 *cannot build: Xcode is not installed*를 보여 주고 나머지 기능은 그대로 동작합니다 |
| **엔진** | `asc` 6.5.x, 실행 시 탐지; 명령 표면이 곧 호환성 계약입니다 ([docs/UPSTREAM-ASC.md](https://github.com/sleep9ull/dsh-asc-hub/blob/main/docs/UPSTREAM-ASC.md) |
| **계정** | App Store Connect 접근 권한이 있는 Apple Developer Program 멤버십 |

## 보안

- **Apple ID 비밀번호는 절대 쓰지 않습니다.** App Store Connect API Key가 JWT를 서명합니다. 플러그인을
  거치는 비밀번호도, 2FA도 없습니다.
- **키 자료는 저장·기록·에코되지 않습니다.** PEM은 `0600` 임시 파일에만 존재하고 `finally`에서 삭제됩니다.
  모든 출력 문자열은 마스킹되며(개인 키 블록, `ASC_*` 할당, `AuthKey_*.p8` 경로, JWT), id는 마지막 네
  글자만 남깁니다.
- **기본은 읽기 전용.** 모든 App Store Connect 쓰기에는 `mode: write` **와** `input.confirm: true`가
  필요하고, 모델이 시작하면 Host 승인까지 필요합니다. 엔진 설치와 로그인은 로컬 동작이라 `read-only`에서도
  의도적으로 허용됩니다.
- **탈출구에는 펜스가 있습니다.** 원시 `run` 동작은 `auth`, `web`, `install-skills`와 상태를 바꾸는 명령
  계열을 거부하고, `read-only`에서는 자식 프로세스에 `asc --read-only`가 붙습니다.
- **텔레메트리는 꺼져 있습니다.** 기본으로 `ASC_TELEMETRY_DISABLED=1`로 `asc`를 실행합니다.
- **패널 경로는 세션 로그나 모델 기록을 쓰지 않습니다** — Fetch 라우트를 쓰고, 세션 명령이 아닙니다.

## 설정

이 행의 `config`는 Host가 읽고, 타입이 틀린 값은 안전한 기본값으로 되돌아갑니다.
[docs/CONTRACT.md § Configuration](https://github.com/sleep9ull/dsh-asc-hub/blob/main/docs/CONTRACT.md)와 일치합니다.

| 키 | 기본값 | 의미 |
|---|---|---|
| `ascPath` | `asc` | 실행할 바이너리: `PATH`의 이름 또는 절대 경로. |
| `profile` | `null` | `--profile`로 넘길 이름 있는 로그인 설정; 비우면 `asc` 기본값. |
| `mode` | `read-only` | `READ_ONLY_MODE`로 App Store Connect 쓰기를 거부합니다. 배포하려면 `write`. |
| `requireApproval` | `true` | 모델이 시작하는 쓰기 전에 사람에게 묻습니다. 패널 자체 쓰기는 확인 단계를 씁니다. |
| `timeoutMs` | `60000` | 일반 `asc` 호출의 제한 시간. |
| `longTimeoutMs` | `1800000` | `run` 제한 시간과 도구 실행 예산의 상한. |
| `maxOutputBytes` | `262144` | 패널이나 모델로 돌려주는 로그/stdout 텍스트의 상한. |
| `telemetryDisabled` | `true` | `ASC_TELEMETRY_DISABLED=1`로 `asc`를 실행합니다. |
| `bypassKeychain` | `false` | `ASC_BYPASS_KEYCHAIN=1`로 실행해 자격 증명을 설정 파일에 둡니다. 권장하지 않습니다. |
| `defaultAppId` | `null` | 동작이 `appId`를 생략할 때 쓰는 앱 id. |
| `vendorNumber` | `null` | Sales and Trends 페이지 URL에 있는 vendor number. 판매 요약에 필요합니다. |

> `mode`에는 두 가지 경로가 있습니다. 패널 하단의 `read-only mode` / `write mode` 배지가 스위치이며,
> 클릭하면 **이번 세션**에만 적용됩니다(`mode.set`, 디스크에 쓰지 않음). 다음 시작에도 유지하려면
> 플러그인 관리자에서 이 행의 `config.mode`를 `write`로 바꾸거나 profile의 `cordis.patch.yml`에서
> 덮어쓰세요. 플러그인은 profile 패치를 스스로 고치지 않습니다.

패널은 선택한 앱 id를 `localStorage`(`dsh.asc-hub.v1.app`)에 둡니다. Host는 선택 상태를 저장하지
않습니다.

## 개발

코드는 TypeScript입니다. 두 개의 `tsc` 프로젝트가 `dist/`를 만듭니다: Host는 ESM과 선언 파일로, client는
단일 스크립트(`module: none`)로 — Harness 모듈 로더가 실제로 평가하는 그 한 파일입니다.

```
src/index.ts            Host 진입점: apply(ctx, config)
src/host/*.ts           config, exec, asc 이음새, engine, auth, ops, dispatch, rpc, tool, skills,
                        workspace, build, redact, 그리고 types.ts (DSH가 공개하지 않는 표면)
src/client.ts           패널: 상태 버튼, 온보딩, 콘솔
test/*.ts               host 테스트, 컴파일 후 dist/를 대상으로 실행
client/__smoke__.mts    client 테스트 하네스: 로더처럼 dist/client.js를 적재
```

```sh
npm run build      # dist/ (host + client)
npm run check      # 네 프로젝트 tsc --noEmit
npm test           # 61개 host 테스트, dist/ 대상
npm run smoke      # 248개 client 검사, dist/client.js 대상
npm run verify     # 위 전부
```

자기 checkout을 Harness에서 돌리려면: `plugin_manager` → `install_bundle`에 이 디렉터리의 절대 경로를
넘깁니다 — `link:` 설치이고 개발 전용이며, 제자리 업그레이드는 되지 않습니다. `src/**`를 고친 뒤에는
`npm run build`를 해야 패널이 보고, Host 쪽은 이 행을 다시 설치해 모듈 세대를 다시 읽혀야 합니다.
규약, 불변식, 모듈 지도는 [AGENTS.md](https://github.com/sleep9ull/dsh-asc-hub/blob/main/AGENTS.md), [docs/ARCHITECTURE.md](https://github.com/sleep9ull/dsh-asc-hub/blob/main/docs/ARCHITECTURE.md),
[docs/WORKFLOW.md](https://github.com/sleep9ull/dsh-asc-hub/blob/main/docs/WORKFLOW.md)에 있습니다.

## 알려진 제한

- **Build에는 전체 Xcode가 필요합니다.** 없으면 패널이 `cannot build`와 이유를 보여 주고, 콘솔의 나머지는
  그대로 동작합니다.
- **판매와 analytics는 Host 동작만 있고 카드는 아직 없습니다.** `sales.summary`와 `analytics.reports`는
  구현되어 모델이 쓸 수 있지만, 패널 카드는 보류 상태입니다.
- **월 단위 판매와 원시 TSV 내보내기는 지원하지 않습니다** (`analytics sales --output`은 파일 경로입니다).
- **업로드와 대기는 하나의 뒤집히는 `busy` 상태**이고, 스트리밍 진행률은 없습니다.
- **바닥의 업데이트 표시는 비활성입니다**: `status.update`는 현재 상수이고, 알림과 동작은
  **Plugins → Installed(플러그인 → 설치됨)**이 담당합니다.
- **이 문서에는 스크린샷을 두지 않습니다.** 패널은 Harness 테마로 렌더링되고, 정적 이미지는 이 글보다
  빨리 낡습니다.

## 문서

| | |
|---|---|
| [docs/CONTRACT.md](https://github.com/sleep9ull/dsh-asc-hub/blob/main/docs/CONTRACT.md) | 전선 계약: 전송, 동작, 게이트, Hub 상태, 오류 코드, 마스킹, 설정 — 권위 문서 |
| [docs/ARCHITECTURE.md](https://github.com/sleep9ull/dsh-asc-hub/blob/main/docs/ARCHITECTURE.md) | 파이프라인, 모듈 지도, 빌드 |
| [docs/ONBOARDING.md](https://github.com/sleep9ull/dsh-asc-hub/blob/main/docs/ONBOARDING.md) | 엔진, API Key, 키 역할, 문제 해결 |
| [docs/OPERATIONS.md](https://github.com/sleep9ull/dsh-asc-hub/blob/main/docs/OPERATIONS.md) | 각 콘솔 동작이 실제로 실행하는 것과 출력 읽는 법 |
| [docs/UPSTREAM-ASC.md](https://github.com/sleep9ull/dsh-asc-hub/blob/main/docs/UPSTREAM-ASC.md) | `asc`에서 무엇을 상속했고 업그레이드가 어떻게 흐르는지 |
| [docs/RELEASING.md](https://github.com/sleep9ull/dsh-asc-hub/blob/main/docs/RELEASING.md) | 배포, 발견, 업그레이드 매트릭스, 등록 점검 |
| [docs/WORKFLOW.md](https://github.com/sleep9ull/dsh-asc-hub/blob/main/docs/WORKFLOW.md) | 일상 리듬: 언제 빌드하고, 언제 버전을 올리고, 언제 배포하는지 |
| [AGENTS.md](https://github.com/sleep9ull/dsh-asc-hub/blob/main/AGENTS.md) | 이 저장소에서 일하는 에이전트를 위한 불변식과 모듈 지도 |

## 라이선스

플러그인은 MIT 라이선스입니다 — [LICENSE](https://github.com/sleep9ull/dsh-asc-hub/blob/main/LICENSE)를 보세요. `asc` CLI도 MIT이며 Copyright (c) 2026
Rudrank Riyam입니다. 별도로 설치되고 이 플러그인에 포함되지 않습니다 —
[THIRD_PARTY_NOTICES.md](https://github.com/sleep9ull/dsh-asc-hub/blob/main/THIRD_PARTY_NOTICES.md)를 보세요.

이 프로젝트는 독립적이며 비공식입니다. Apple Inc.와 제휴, 보증, 후원 관계가 없습니다.
App Store Connect, TestFlight, Xcode Cloud, Apple은 Apple Inc.의 상표입니다.
