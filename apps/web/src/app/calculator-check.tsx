'use client';

import {
  calculateChampionsDamage,
  type ChampionsDamageInput,
  type ChampionsDamageResult,
  type Screen,
  type SupportedItem,
  type Terrain,
  type Weather,
} from '@champsparty/calculator';
import { CHAMPIONS_DAMAGE_CASE } from '@champsparty/calculator/verification';
import { useState } from 'react';

interface Controls {
  nature: 'Jolly' | 'Adamant';
  attackPoints: string;
  attackBoost: number;
  item: SupportedItem;
  weather: Weather;
  terrain: Terrain;
  screen: Screen;
}

const initialControls: Controls = {
  nature: 'Jolly',
  attackPoints: '32',
  attackBoost: 0,
  item: 'None',
  weather: 'None',
  terrain: 'None',
  screen: 'None',
};

const controlClass =
  'mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700';

function koSummary(ko: ChampionsDamageResult['ko']): string {
  if (ko.status === 'immune') return '데미지 무효 · KO 불가';
  if (ko.status === 'out-of-range')
    return 'KO 타수 미산출 · 엔진의 9타 범위 초과';
  const prefix = ko.approximate ? '근사값 · ' : '';
  if (ko.chance === null) return `${prefix}${ko.hits}타 KO 가능 · 확률 미산출`;
  if (ko.chance === 1) return `${prefix}확정 ${ko.hits}타`;
  return `${prefix}${ko.hits}타 KO 확률 ${Number((ko.chance * 100).toFixed(2))}%`;
}

export function CalculatorCheck() {
  const [controls, setControls] = useState(initialControls);
  const baseline = CHAMPIONS_DAMAGE_CASE.input;
  let result: ChampionsDamageResult | undefined;
  let error: string | undefined;

  try {
    if (controls.attackPoints.trim() === '') {
      throw new Error('공격 포인트를 입력해 주세요.');
    }
    const input: ChampionsDamageInput = {
      ...baseline,
      attacker: {
        ...baseline.attacker,
        nature: controls.nature,
        statPoints: {
          ...baseline.attacker.statPoints,
          atk: Number(controls.attackPoints),
        },
        boosts: { atk: controls.attackBoost },
        item: controls.item,
      },
      field: {
        weather: controls.weather,
        terrain: controls.terrain,
        screen: controls.screen,
      },
    };
    // Derive the result from current inputs; do not keep a second result state.
    result = calculateChampionsDamage(input);
  } catch (cause) {
    error =
      cause instanceof Error ? cause.message : '계산 중 오류가 발생했습니다.';
  }

  return (
    <section aria-labelledby="calculator-check-title" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="calculator-check-title" className="text-lg font-semibold">
          계산 엔진 검증
        </h2>
        <button
          type="button"
          onClick={() => setControls(initialControls)}
          className="cursor-pointer rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
        >
          기준 조건으로 초기화
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <fieldset className="rounded-xl border border-slate-200 p-5">
          <legend className="px-1 font-semibold">공격 · 한카리아스</legend>
          <p className="text-sm text-slate-600">
            H2 · A{controls.attackPoints || '—'} · S32 / 모래숨기 / 지진
          </p>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <label className="text-sm font-medium">
              성격
              <select
                className={controlClass}
                value={controls.nature}
                onChange={(event) =>
                  setControls({
                    ...controls,
                    nature: event.target.value as Controls['nature'],
                  })
                }
              >
                <option value="Jolly">명랑</option>
                <option value="Adamant">고집</option>
              </select>
            </label>
            <label className="text-sm font-medium">
              공격 포인트
              <input
                className={controlClass}
                type="number"
                min="0"
                max="32"
                step="1"
                value={controls.attackPoints}
                onChange={(event) =>
                  setControls({ ...controls, attackPoints: event.target.value })
                }
              />
            </label>
            <label className="text-sm font-medium">
              공격 랭크
              <select
                className={controlClass}
                value={controls.attackBoost}
                onChange={(event) =>
                  setControls({
                    ...controls,
                    attackBoost: Number(event.target.value),
                  })
                }
              >
                {Array.from({ length: 13 }, (_, index) => index - 6).map(
                  (rank) => (
                    <option key={rank} value={rank}>
                      {rank > 0 ? `+${rank}` : rank}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label className="text-sm font-medium">
              도구
              <select
                className={controlClass}
                value={controls.item}
                onChange={(event) =>
                  setControls({
                    ...controls,
                    item: event.target.value as SupportedItem,
                  })
                }
              >
                <option value="None">없음</option>
                <option value="Life Orb">생명의구슬</option>
                <option value="Expert Belt">달인의띠</option>
                <option value="Soft Sand">부드러운모래</option>
              </select>
            </label>
          </div>
        </fieldset>

        <section
          className="space-y-3 rounded-xl border border-slate-200 p-5"
          aria-labelledby="defender-title"
        >
          <h3 id="defender-title" className="font-semibold">
            방어 · 메가 메타그로스
          </h3>
          <p className="text-sm text-slate-600">장난꾸러기 / H20 · B20 · S26</p>
          <p className="text-sm text-slate-600">
            단단한발톱 / 메타그로스나이트 / 랭크 0
          </p>
          <p className="text-sm text-slate-600">양쪽 시작 HP 100% · 레벨 50</p>
          <p className="border-t border-slate-200 pt-3 text-sm leading-6 text-slate-600">
            기준 기대값: 102~120 (58.3~68.6%), 확정 2타. 입력을 바꾸면 현재
            조건의 결과를 바로 계산합니다.
          </p>
        </section>
      </div>

      <fieldset className="rounded-xl border border-slate-200 p-5">
        <legend className="px-1 font-semibold">필드 조건 · 싱글</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="text-sm font-medium">
            날씨
            <select
              className={controlClass}
              value={controls.weather}
              onChange={(event) =>
                setControls({
                  ...controls,
                  weather: event.target.value as Weather,
                })
              }
            >
              <option value="None">없음</option>
              <option value="Sun">쾌청</option>
              <option value="Rain">비</option>
              <option value="Sand">모래바람</option>
              <option value="Snow">눈</option>
            </select>
          </label>
          <label className="text-sm font-medium">
            지형
            <select
              className={controlClass}
              value={controls.terrain}
              onChange={(event) =>
                setControls({
                  ...controls,
                  terrain: event.target.value as Terrain,
                })
              }
            >
              <option value="None">없음</option>
              <option value="Electric">일렉트릭필드</option>
              <option value="Grassy">그래스필드</option>
              <option value="Psychic">사이코필드</option>
              <option value="Misty">미스트필드</option>
            </select>
          </label>
          <label className="text-sm font-medium">
            방어 측 벽
            <select
              className={controlClass}
              value={controls.screen}
              onChange={(event) =>
                setControls({
                  ...controls,
                  screen: event.target.value as Screen,
                })
              }
            >
              <option value="None">없음</option>
              <option value="Reflect">리플렉터</option>
              <option value="Light Screen">빛의장막</option>
              <option value="Aurora Veil">오로라베일</option>
            </select>
          </label>
        </div>
      </fieldset>

      <div aria-live="polite" aria-atomic="true">
        {error && (
          <p
            role="alert"
            className="rounded-xl border border-red-300 bg-red-50 p-5 text-red-800"
          >
            {error}
          </p>
        )}
        {result && (
          <section
            aria-labelledby="damage-title"
            className="space-y-5 rounded-xl bg-slate-950 p-5 text-white sm:p-6"
          >
            <h3
              id="damage-title"
              className="text-sm font-medium text-slate-300"
            >
              현재 조건의 데미지
            </h3>
            <output
              aria-label="데미지 범위"
              className="block text-4xl font-bold tabular-nums"
            >
              {result.damageRange[0]}~{result.damageRange[1]}
            </output>
            <p className="text-lg tabular-nums">
              {result.damagePercent[0].toFixed(1)}~
              {result.damagePercent[1].toFixed(1)}%
              <span className="ml-3 text-sm text-slate-300">
                상대 HP {result.defenderStats.hp}
              </span>
            </p>
            <p aria-label="KO 결과" className="font-semibold text-emerald-300">
              {koSummary(result.ko)}
            </p>
            <p className="text-sm text-slate-300">
              공격 실수치 {result.attackerStats.atk} · 방어 실수치{' '}
              {result.defenderStats.def} (성격·랭크 반영)
            </p>
            <details className="border-t border-slate-700 pt-4">
              <summary className="cursor-pointer text-sm font-medium">
                난수별 데미지 16개
              </summary>
              <ol className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-8">
                {result.damageRolls.map((damage, index) => (
                  <li
                    key={index}
                    className="rounded-lg bg-slate-800 p-2 text-center tabular-nums"
                  >
                    <span className="block text-xs text-slate-400">
                      {85 + index}%
                    </span>
                    <span className="font-semibold">{damage}</span>
                  </li>
                ))}
              </ol>
            </details>
          </section>
        )}
      </div>
      <p className="text-sm leading-6 text-slate-600">
        KO 확률은 동일 기술이 모두 명중하고 현재 조건이 유지될 때의 데미지 난수
        기준입니다. 회복·턴 종료 데미지·생명의구슬 반동에 따른 공격자 기절은
        계산하지 않습니다. 그래스필드의 지진 약화는 반영합니다. 데미지 비율은
        소수 첫째 자리까지, KO 확률은 소수 둘째 자리까지 반올림합니다.
      </p>
    </section>
  );
}
