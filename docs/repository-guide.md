# 1인 개발 레포지토리 운영 가이드

이 문서는 champsparty의 GitHub 설정과 일상적인 작업 순서를 설명합니다.
2026-11-16에 설정했습니다. GitHub 화면은 이후 달라질 수 있습니다.

## 기본 운영 방식

- `main`: 병합이 끝난 기준 코드입니다.
- 작업 브랜치: 기능, 오류 수정, 문서 변경을 진행하는 공간입니다.
- Issue: 작업 목적과 완료 기준을 기록합니다.
- Pull request(PR): 작업 브랜치의 변경을 `main`에 합치기 전에 차이를 확인하고 검증 결과를 기록합니다.
- Squash merge: PR 안의 여러 커밋을 `main`에서 하나의 커밋으로 합칩니다.

혼자 개발해도 PR을 작성하는 이유는 변경 이유와 확인 결과를 남기기 위해서입니다.
작은 오타마다 이슈를 만들 필요는 없습니다. 기능과 재현할 버그처럼 추적할 가치가 있는 작업부터 기록합니다.
`develop` 같은 중간 브랜치는 현재 필요하지 않습니다.

## 적용한 GitHub 설정

### General

| 항목 | 설정 | 효용 |
| --- | --- | --- |
| Visibility | 기존 Public 유지 | 로그인 없이 포트폴리오 코드를 볼 수 있습니다. |
| Default branch | 기존 main 유지 | PR과 저장소의 기준 브랜치를 통일합니다. |
| Allow squash merging | 켬 | PR 하나를 main 커밋 하나로 정리합니다. |
| Allow merge commits / rebase merging | 끔 | 이 프로젝트의 PR 병합 방식을 하나로 통일합니다. |
| Squash 기본 메시지 | PR 제목과 본문 | 변경 이유와 검증 결과를 병합 커밋에도 남깁니다. |
| Automatically delete head branches | 켬 | 병합이 끝난 원격 작업 브랜치를 정리합니다. 커밋과 PR 기록은 남습니다. |
| Always suggest updating PR branches | 켬 | main이 바뀌었을 때 작업 브랜치를 갱신할 수 있도록 안내합니다. |
| Issues / Projects | 기존 켬 유지 | 작업 목록과 필요할 때 보드를 사용할 수 있습니다. 보드를 새로 만들지는 않았습니다. |
| Auto-close issues with merged linked PRs | 기존 켬 유지 | PR 본문의 Closes #번호와 연결된 이슈를 병합 시 닫습니다. |
| Wikis | 끔 | 문서는 README와 docs에 모아 코드와 함께 변경 이력을 관리합니다. |
| Discussions / Sponsorships / Auto-merge | 기존 끔 유지 | 필요해질 때 추가합니다. 병합은 직접 확인하고 진행합니다. |

### Rulesets → protect-main

대상은 기본 브랜치이며 현재 `main`입니다. 상태는 Active, 우회 목록은 비어 있습니다.
관리자와 자동화 도구도 이 규칙을 따라야 합니다.

| 항목 | 설정 | 효용 |
| --- | --- | --- |
| Restrict deletions | 켬 | main 브랜치의 실수 삭제를 막습니다. |
| Block force pushes | 켬 | main의 기존 이력을 강제로 덮어쓰는 것을 막습니다. |
| Require linear history | 켬 | main 이력을 선형으로 유지합니다. Squash merge와 함께 사용합니다. |
| Require a pull request before merging | 켬 | main에 직접 push하지 않고 PR에서 변경을 확인합니다. |
| Required approvals | 0명 | 본인이 작성한 PR을 타인의 승인 없이 병합할 수 있습니다. |
| Require conversation resolution before merging | 켬 | 코드에 달린 미해결 검토 대화를 정리한 뒤 병합합니다. |
| Require status checks to pass | 아직 끔 | 앱과 CI가 생긴 뒤 실제 검사 이름을 필수 조건으로 지정합니다. |

이 규칙이 있다고 코드의 실행 가능성이 보장되지는 않습니다. 현재 앱 코드와 자동 검사는 없습니다.
이후 개발 환경을 만들 때 lint, 타입 검사, 빌드와 필요한 테스트를 실행하는 CI를 추가하고,
실제로 한 번 이상 실행된 검사 이름을 main의 필수 검사로 연결합니다.

### Advanced Security

| 항목 | 상태 | 효용 |
| --- | --- | --- |
| Dependency graph | 켬 | 프로젝트가 사용하는 패키지와 연결 관계를 파악합니다. |
| Dependabot alerts | 켬 | 사용하는 패키지에 알려진 취약점이 있으면 알립니다. |
| Malware alerts | 켬 | 지원되는 의존성에서 탐지된 악성 패키지를 알립니다. |
| Dependabot security updates | 켬 | 지원되는 취약점에 대해 가능한 보안 수정 PR을 만듭니다. 자동 병합은 하지 않습니다. |
| Grouped security updates | 켬 | 같은 패키지 관리자와 경로의 보안 수정을 묶어 PR 수를 줄입니다. |
| Secret Protection / Push protection | 기존 켬 확인 | 지원되는 비밀키 유형을 탐지하고 포함된 push를 차단합니다. |

패키지 분석은 지원되는 manifest와 lockfile이 저장된 이후 의미가 있습니다.
정기적인 일반 버전 업데이트용 dependabot.yml과 CodeQL은 앱의 기술 스택이 확정된 뒤 검토합니다.
비밀키 탐지는 모든 문자열을 알아내지 못합니다. `.env`는 Git에 올리지 않고,
`.env.example`에는 변수 이름과 가짜 예시 값만 작성합니다.
이미 유출된 비밀키는 파일 삭제만으로 해결되지 않으므로 발급처에서 폐기하고 재발급합니다.

### Actions → General

- 기본 Workflow permissions는 기존 읽기 권한을 유지했습니다.
- Actions의 PR 생성 및 승인 허용은 기존 끔 상태입니다.
- 외부 기여자의 fork PR 워크플로 실행은 매번 관리자의 승인이 필요하도록 설정했습니다.
- 본인이 같은 저장소의 작업 브랜치에서 만든 PR에 타인 승인을 요구하는 설정은 아닙니다.
- 배포에 추가 권한이 필요하면 해당 워크플로에 필요한 권한만 명시합니다.

## 파일별 역할

| 파일 | 역할 |
| --- | --- |
| .gitignore | 기존 설정 유지. node_modules, .env 계열, 운영체제 임시 파일을 제외하고 .env.example은 허용합니다. |
| .gitattributes | 텍스트의 Git 줄바꿈을 LF로 맞춰 Windows와 macOS 간 불필요한 전체 줄 변경을 줄입니다. bat와 cmd는 CRLF를 사용합니다. |
| .editorconfig | 지원하는 편집기에서 UTF-8, 들여쓰기 2칸, 마지막 개행 등 기본 편집 규칙을 맞춥니다. 포매터나 린터를 대신하지는 않습니다. |
| .github/ISSUE_TEMPLATE | 작업과 버그 이슈를 작성할 때 기본 양식을 제공합니다. |
| .github/pull_request_template.md | PR에 변경 이유와 실제 검증 결과를 빠뜨리지 않도록 양식을 제공합니다. |

프레임워크가 정해지면 해당 프레임워크의 빌드 결과와 캐시를 .gitignore에 추가합니다.
패키지 lockfile은 버전을 재현하기 위해 커밋합니다.
.gitignore는 이미 추적 중인 파일을 자동으로 제거하지 않습니다.
VS Code에서 .editorconfig가 자동 적용되지 않으면 EditorConfig 확장을 설치할 수 있습니다.
이후 사용할 포매터와도 설정을 맞춥니다.

## 작업 순서

1. GitHub Issues에서 목적, 작업 범위, 완료 기준을 적습니다.
2. 최신 main에서 작업 브랜치를 만듭니다.

   ```sh
   git switch main
   git pull --ff-only origin main
   git switch -c feat/login
   ```

3. 파일을 수정하고 변경 내용을 확인한 뒤, 의도한 파일만 골라 커밋합니다.

   ```sh
   git status
   git diff
   git add 수정한파일경로
   git commit -m "feat: 로그인 화면 추가"
   git push -u origin feat/login
   ```

4. GitHub의 Pull requests에서 New pull request를 누릅니다. base는 main, compare는 작업 브랜치를 선택합니다.
5. PR 양식에 변경 이유와 확인 방법을 적고, 완료되는 이슈가 있다면 `Closes #이슈번호`를 적습니다.
6. Files changed에서 차이를 확인합니다. 화면 변경이 있다면 실제 화면도 확인합니다.
7. 확인이 끝나면 Squash and merge로 병합합니다. 원격 작업 브랜치는 자동으로 정리됩니다.
8. 로컬 main을 갱신합니다.

   ```sh
   git switch main
   git pull --ff-only origin main
   git fetch --prune
   ```

Squash 후에는 작업 브랜치를 이어 쓰지 말고 최신 main에서 새 브랜치를 만듭니다.
원격 브랜치 자동 삭제는 로컬 브랜치를 삭제하지 않습니다.
Squash 방식은 원래 커밋을 그대로 병합하지 않으므로 로컬 `git branch -d`가 미병합 경고를 낼 수 있습니다.
이 경우 먼저 해당 PR의 Merged 상태와 변경 반영을 확인합니다. 로컬 브랜치는 당장 지우지 않아도 됩니다.

브랜치 이름은 feat/기능, fix/오류, docs/문서, chore/설정 정도면 충분합니다.
커밋 제목의 feat, fix, docs, chore도 같은 의미로 사용하되 별도 강제 도구는 아직 두지 않습니다.

## 사용자가 직접 할 일과 이후 설정

### GitHub CLI 로그인 복구

현재 로컬 gh의 기존 인증이 유효하지 않습니다. 본인 터미널에서 실행합니다.

```sh
gh auth login --hostname github.com --git-protocol https --web
gh auth setup-git
gh auth status
```

화면에 표시되는 GitHub.com과 본인 계정을 확인하고 브라우저 인증을 직접 완료합니다.
인증 토큰을 채팅이나 공개 이슈에 붙여 넣지 않습니다.

### 프로젝트 설명이 정해지면

1. 레포 첫 화면 오른쪽 About의 톱니바퀴를 누릅니다.
2. Description에 누구의 어떤 문제를 해결하는 서비스인지 한 문장으로 적습니다.
3. 실제 사용한 기술과 프로젝트 주제를 Topics에 추가합니다.
4. 배포 후 Website에 동작하는 서비스 주소를 적습니다.
5. README에 서비스 소개, 화면, 실행 방법, 환경 변수 이름, 기술 선택 이유, 주요 문제 해결 기록을 추가합니다.

현재는 구체적인 기능과 기술 스택을 문서에 임의로 기재하지 않았습니다.

### 라이선스와 계정 설정

- 공개 저장소와 자유로운 재사용 허용은 별개의 결정입니다. 공개 코드의 사용 범위를 정한 뒤 LICENSE를 선택합니다.
- 계정의 2단계 인증과 커밋 이메일 공개 여부는 본인의 Settings에서 직접 점검할 수 있습니다.
- 배포 환경, Secrets, 도메인, 배포 자동화는 배포 방식이 정해질 때 설정합니다.
- 채용 담당자에게 보여줄 준비가 되면 프로필에서 저장소를 Pin합니다.

지금은 이 정도로 레포 설정을 마치고 프로젝트 기획과 개발 환경 구성으로 넘어가면 충분합니다.
