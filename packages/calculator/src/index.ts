import {
  calculate,
  Field,
  Generations,
  Move,
  Pokemon,
  toID,
  type StatID,
  type StatsTable,
} from '@smogon/calc';

export type StatPoints = Readonly<StatsTable>;
export type Weather = 'None' | 'Sun' | 'Rain' | 'Sand' | 'Snow';
export type Terrain = 'None' | 'Electric' | 'Grassy' | 'Psychic' | 'Misty';
export type Screen = 'None' | 'Reflect' | 'Light Screen' | 'Aurora Veil';
export type SupportedItem =
  'None' | 'Life Orb' | 'Expert Belt' | 'Soft Sand' | 'Metagrossite';

export interface ChampionsPokemonInput {
  species: string;
  nature: string;
  // Required so the engine cannot silently select the species' default ability.
  ability: string;
  item: SupportedItem;
  statPoints: StatPoints;
  boosts?: Readonly<Partial<Omit<StatsTable, 'hp'>>>;
}

export interface ChampionsDamageInput {
  attacker: ChampionsPokemonInput;
  defender: ChampionsPokemonInput;
  // Expand the move contract after verifying repeated-hit and state-changing moves.
  move: 'Earthquake';
  field: {
    weather: Weather;
    terrain: Terrain;
    screen: Screen;
  };
}

export interface ChampionsDamageResult {
  attackerStats: StatsTable;
  defenderStats: StatsTable;
  damageRolls: number[];
  damageRange: [number, number];
  damagePercent: [number, number];
  ko: {
    status: 'calculated' | 'unquantified' | 'out-of-range' | 'immune';
    hits: number;
    chance: number | null;
    approximate: boolean;
    engineText: string;
  };
}

const champions = Generations.get(0);
const stats: StatID[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

function createPokemon(input: ChampionsPokemonInput): Pokemon {
  if (!champions.species.get(toID(input.species))) {
    throw new Error(`지원 데이터에 없는 포켓몬입니다: ${input.species}`);
  }
  if (!champions.natures.get(toID(input.nature))) {
    throw new Error(`알 수 없는 성격입니다: ${input.nature}`);
  }
  if (!champions.abilities.get(toID(input.ability))) {
    throw new Error(`알 수 없는 특성입니다: ${input.ability}`);
  }
  if (
    !['None', 'Life Orb', 'Expert Belt', 'Soft Sand', 'Metagrossite'].includes(
      input.item,
    ) ||
    (input.item !== 'None' && !champions.items.get(toID(input.item)))
  ) {
    throw new Error('현재 계산 계약에서 지원하지 않는 도구입니다.');
  }

  let total = 0;
  for (const stat of stats) {
    const points = input.statPoints[stat];
    if (!Number.isInteger(points) || points < 0 || points > 32) {
      throw new Error(
        '능력치 포인트는 각 항목에 0~32 사이의 정수를 입력해야 합니다.',
      );
    }
    total += points;
  }
  if (total > 66) {
    throw new Error('능력치 포인트의 합계는 66을 넘을 수 없습니다.');
  }
  for (const [stat, boost] of Object.entries(input.boosts ?? {})) {
    if (stat === 'hp' || !stats.includes(stat as StatID)) {
      throw new Error('랭크를 적용할 수 없는 능력치입니다.');
    }
    if (!Number.isInteger(boost) || boost < -6 || boost > 6) {
      throw new Error('랭크는 -6~6 사이의 정수를 입력해야 합니다.');
    }
  }

  return new Pokemon(champions, input.species, {
    nature: input.nature,
    ability: input.ability,
    item: input.item === 'None' ? undefined : input.item,
    // In Champions, the API's `evs` field takes stat points directly, not classic EVs.
    evs: { ...input.statPoints },
    boosts: { ...input.boosts },
  });
}

export function calculateChampionsDamage(
  input: ChampionsDamageInput,
): ChampionsDamageResult {
  if (!['None', 'Sun', 'Rain', 'Sand', 'Snow'].includes(input.field.weather)) {
    throw new Error('현재 지원하지 않는 날씨입니다.');
  }
  if (
    !['None', 'Electric', 'Grassy', 'Psychic', 'Misty'].includes(
      input.field.terrain,
    )
  ) {
    throw new Error('현재 지원하지 않는 지형입니다.');
  }
  if (
    !['None', 'Reflect', 'Light Screen', 'Aurora Veil'].includes(
      input.field.screen,
    )
  ) {
    throw new Error('현재 지원하지 않는 벽입니다.');
  }
  if (input.move !== 'Earthquake') {
    throw new Error('이번 계산 계약에서 지원하는 기술은 지진입니다.');
  }

  const result = calculate(
    champions,
    createPokemon(input.attacker),
    createPokemon(input.defender),
    new Move(champions, input.move),
    new Field({
      gameType: 'Singles',
      weather: input.field.weather === 'None' ? undefined : input.field.weather,
      terrain: input.field.terrain === 'None' ? undefined : input.field.terrain,
      defenderSide: {
        isReflect: input.field.screen === 'Reflect',
        isLightScreen: input.field.screen === 'Light Screen',
        isAuroraVeil: input.field.screen === 'Aurora Veil',
      },
    }),
  );

  // A flat 16-entry array is required for this single-hit verification contract.
  // Keep duplicates: their frequency contributes to the KO probability.
  const damage =
    result.damage === 0 ? Array<number>(16).fill(0) : result.damage;
  if (!isDamageRolls(damage)) {
    throw new Error('현재 지원하지 않는 대미지 결과 형식입니다.');
  }
  const damageRange = result.range();
  const hp = result.defender.maxHP();
  // Damage already contains field modifiers. KO here accumulates only that damage;
  // remove terrain healing and weather chip rather than silently adding turn effects.
  result.field.terrain = undefined;
  result.field.weather = undefined;
  // An immunity has no KO; the upstream kochance() throws on all-zero damage.
  const ko = damageRange[1] === 0 ? null : result.kochance();

  return {
    attackerStats: { ...result.attacker.stats },
    defenderStats: { ...result.defender.stats },
    damageRolls: [...damage],
    damageRange,
    // Use rounding to one decimal instead of parsing the engine's truncated prose.
    damagePercent: damageRange.map(
      (damage) => Math.round((damage / hp) * 1000) / 10,
    ) as [number, number],
    ko: {
      status:
        damageRange[1] === 0
          ? 'immune'
          : !ko?.n
            ? 'out-of-range'
            : ko.chance === undefined
              ? 'unquantified'
              : 'calculated',
      hits: ko?.n ?? 0,
      chance: damageRange[1] === 0 ? 0 : ko?.n ? (ko.chance ?? null) : null,
      approximate: ko?.text.includes('approx.') ?? false,
      engineText: ko?.text ?? 'not a KO',
    },
  };
}

function isDamageRolls(
  damage: number | number[] | number[][],
): damage is number[] {
  return (
    Array.isArray(damage) &&
    damage.length === 16 &&
    damage.every(
      (roll) => typeof roll === 'number' && Number.isInteger(roll) && roll >= 0,
    )
  );
}
