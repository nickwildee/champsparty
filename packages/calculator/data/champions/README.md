# 챔피언스 계산기 카탈로그

포켓몬을 고르면 해당 폼이 가질 수 있는 특성과 배울 수 있는 기술을 제공한다. 등장 범위와 습득 관계는 [고정한 Pokémon Showdown 원본](source-pin.json)의 챔피언스 모드를 따르고, 대미지 계산에는 `@smogon/calc`를 사용한다. 시즌별 참가 자격과 모든 기술·특성 조합의 적법성은 검증 범위 밖이다.

| 파일                                                                              | 내용                                                                                                            |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| [pokemon.json](pokemon.json)                                                      | 포켓몬·폼, 변신 조건, 특성 슬롯, 습득 기술 ID와 엔진 연결                                                       |
| [moves.json](moves.json) · [abilities.json](abilities.json)                       | 등장 기술·특성, 선택과 추가 입력에 적용할 규칙                                                                  |
| [conditions.json](conditions.json)                                                | 규칙별 입력, 기본값, 선택·제외·사용 횟수 정책                                                                   |
| [names.ko.json](names.ko.json)                                                    | ID별 한글 표시명과 명칭 출처. 포켓몬·폼과 특성은 이 파일에서 관리하고 기술명은 고정한 게임 텍스트에서 갱신한다. |
| [source-pin.json](source-pin.json) · [UPSTREAM-LICENSE.txt](UPSTREAM-LICENSE.txt) | 원본 커밋·아카이브 해시, 엔진 버전, Showdown의 저작권 고지                                                      |

CLI 계산은 폼별 엔진 ID 예외(`species-aliases.json`), 내던지기 도구 보정(`fling-item-overrides.json`), 부자유친 제외 기술(`parental-bond-exclusions.json`)을 직접 읽는다. 엔진을 올릴 때는 이 파일과 패치에 대응하는 회귀 테스트도 실행한다.

누락된 선택·입력 필드는 `conditions.json`의 `catalogDefaults`를 따른다. 폼의 `engineId`와 `baseSpeciesId`가 없으면 해당 폼의 `id`를 사용한다.

## 계산기 선택 목록

- 각 폼의 `abilities`와 `moveIds`에서 해당 항목의 `productPolicy.selection`이 `excluded`인 ID를 뺀다. 382개 폼에서 선택 가능한 특성은 총 110개, 공격 기술은 326개다. 선택할 특성이 없는 폼은 특성 칸을 비워 둔다. 원본 특성 슬롯은 가능한 상태이상을 확인할 때도 사용한다.
- 일반 도구는 `conditions.json`의 `productRules.common.heldItemOptions`에 있는 32개 중 하나를 고르거나 비워 둔다. 키는 선택 ID, 값은 한글 표시명이다. `resistberry`는 반감열매 18종을 묶은 선택 ID다. 메가스톤은 일반 도구에서 제외하고 폼별 `requiredItemIds`를 유지한다. 메가진화 선택은 포켓몬 옆 토글로 제공할 예정이다.
- 기합의띠·기합의머리띠·옹골참은 제외한다. 유턴·탁쳐서떨구기·애크러뱃은 공격 기술로 제공하며, 뒤의 두 기술에는 위력 강화 ON/OFF를 입력 규칙으로 지정했다.

## 갱신과 확인

저장소 루트에서 실행한다. Showdown 아카이브 주소와 SHA-256은 [source-pin.json](source-pin.json)에 있다. `--check`는 고정 원본으로 다시 만든 파일과 저장된 파일을 비교한다. 갱신하려면 같은 명령에서 `--check`를 뺀다.

```sh
pnpm catalog:extract --archive /path/to/showdown.tar.gz --check
node packages/calculator/scripts/extract-move-names-ko.mjs --archive /path/to/showdown.tar.gz --names-file /path/to/text_Moves_ko.txt --check
```

한글명의 전체 ID와 필수 값만 확인할 때는 `node packages/calculator/scripts/extract-move-names-ko.mjs --check`를 실행한다. 원본이나 엔진을 바꿀 때는 `catalog:extract`에 `--diagnostics /tmp/champions-diagnostics`를 추가해 엔진 차이와 생성 파일 해시를 별도로 확인할 수 있다. 새 폼이나 특성의 한글명은 이름 사전에 추가한다. 기술·특성별 입력 정책은 [제품 규칙](../../scripts/champions-product-rules.mjs)에서 수정한 뒤 다시 추출한다.

## 확인한 범위

- 고정 원본에서 382개 포켓몬·폼, 216개 특성, 515개 기술과 습득 관계 23,176건을 추출했다. 모든 습득 기술 ID가 기술 목록에 있고, 382개 폼 모두 엔진에 연결된다.
- 과거에는 조건부 기술·특성의 460개 사례를 대조했다. 예를 들어 엔진 0.12.0에서 성묘에 쓰러진 아군 수 0과 2를 주어도 모두 42~50이 나왔다. 당시 조사 결과와 전체 입력 지원 여부는 구분한다. [제품 결정](../../../../docs/DECISIONS.md) · [당시 조사 원본](https://github.com/nickwildee/champsparty/tree/9e1baaaca1a537b17d91a1c34b2f7bcd5d3b7bb5/packages/calculator/data/champions)
