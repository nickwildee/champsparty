import {
  Field,
  Generations,
  Move,
  Pokemon,
  Result,
  toID,
  type State,
  type StatsTable,
} from '@smogon/calc';
import type { Move as MoveData } from '@smogon/calc/dist/data/interface.js';
import { getFlingPower } from '@smogon/calc/dist/items.js';
import {
  checkAirLock,
  checkItem,
  getFinalSpeed,
  isGrounded,
} from '@smogon/calc/dist/mechanics/util.js';
import flingOverrides from '../data/champions/fling-item-overrides.json' with { type: 'json' };
import speciesAliases from '../data/champions/species-aliases.json' with { type: 'json' };
import {
  calculateOneUse,
  type CategoryBranch,
  type OneUseResult,
} from './one-use.ts';

export interface ChampionsPokemonInput {
  species: string;
  nature: string;
  ability?: string;
  item?: string;
  /** Omitted stats have 0 points. */
  statPoints: Readonly<Partial<StatsTable>>;
  boosts?: Readonly<Partial<Omit<StatsTable, 'hp'>>>;
  /** Whole HP percentage from 1 to 100. Defaults to 100. */
  hpPercent?: number;
  status?: State.Pokemon['status'];
  /** Applies to Mimikyu with Disguise. Defaults to intact. */
  disguiseIntact?: boolean;
}

interface ChampionsFieldSideInput {
  reflect?: boolean;
  lightScreen?: boolean;
  auroraVeil?: boolean;
}

const weatherOptions = ['Sun', 'Rain', 'Sand', 'Snow'] as const;
const terrainOptions = ['Electric', 'Grassy', 'Psychic', 'Misty'] as const;
const statusOptions = ['', 'slp', 'psn', 'brn', 'frz', 'par', 'tox'] as const;

export interface ChampionsFieldInput {
  weather?: (typeof weatherOptions)[number];
  terrain?: State.Field['terrain'];
  gravity?: boolean;
  attackerSide?: ChampionsFieldSideInput;
  defenderSide?: ChampionsFieldSideInput;
}

export interface ChampionsDamageInput {
  attacker: ChampionsPokemonInput;
  defender: ChampionsPokemonInput;
  move: string;
  field?: ChampionsFieldInput;
}

export interface ChampionsDamageSummary {
  move: string;
  hits: number;
  basePower: number;
  /** Power reported in the engine description, when available. */
  reportedPower: number | null;
  attackerHp: { current: number; max: number };
  defenderHp: { current: number; max: number };
  damageRange: [number, number];
  damage: Result['damage'];
  unavailableReason?: string;
  category?: 'Physical' | 'Special';
  categoryBranches?: CategoryBranch[];
  disguiseHpLoss?: number;
}

export type ChampionsDamageResult = OneUseResult & {
  unavailableReason?: string;
};

export class ChampionsInputError extends RangeError {}

const champions = Generations.get(0);

const speciesEngineIds = new Map(Object.entries(speciesAliases));

const flingItems: Readonly<
  Record<
    string,
    { power?: number; blockedHolders?: readonly string[] } | undefined
  >
> = flingOverrides;

function engineEntry<T extends { id: string; name: string }>(
  table: { get(id: ReturnType<typeof toID>): T | undefined },
  value: string,
  label: string,
  aliases?: ReadonlyMap<string, string>,
): T {
  if (typeof value !== 'string')
    throw new ChampionsInputError(
      `${label}: 이름 또는 ID 문자열이 필요합니다.`,
    );
  const id = toID(value);
  const key = toID(aliases?.get(id) ?? id);
  const entry = key && table.get(key);
  if (!entry || entry.id !== key || !entry.name)
    throw new ChampionsInputError(
      `${label}: 엔진에서 찾을 수 없는 이름입니다 (${value}).`,
    );
  return entry;
}

function requireObject(value: unknown, path: string): asserts value is object {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ChampionsInputError(`${path}: 객체가 필요합니다.`);
  }
}

function checkOption(
  value: unknown,
  options: readonly string[],
  path: string,
): void {
  if (
    value !== undefined &&
    (typeof value !== 'string' || !options.includes(value))
  ) {
    throw new ChampionsInputError(
      `${path}: 허용된 값은 ${options.filter(Boolean).join(', ')}입니다.`,
    );
  }
}

function checkBoolean(value: unknown, path: string): void {
  if (value !== undefined && typeof value !== 'boolean') {
    throw new ChampionsInputError(`${path}: true 또는 false가 필요합니다.`);
  }
}

function checkStats(
  input: ChampionsPokemonInput,
  side: string,
  key: 'statPoints' | 'boosts',
): void {
  const stats = input[key];
  if (key === 'boosts' && stats === undefined) return;
  const path = `${side}.${key}`;
  const ranks = key === 'boosts';
  requireObject(stats, path);
  for (const [stat, value] of Object.entries(stats)) {
    if (
      !['atk', 'def', 'spa', 'spd', 'spe'].includes(stat) &&
      !(stat === 'hp' && !ranks)
    ) {
      throw new ChampionsInputError(
        `${path}.${stat}: 지원하지 않는 능력치입니다.`,
      );
    }
    if (
      typeof value !== 'number' ||
      !Number.isSafeInteger(value) ||
      (ranks ? value < -6 || value > 6 : value < 0)
    ) {
      const range = ranks ? '-6~6 사이의 정수' : '0 이상의 정수';
      throw new ChampionsInputError(`${path}.${stat}: ${range}가 필요합니다.`);
    }
  }
}

function createPokemon(
  input: ChampionsPokemonInput,
  side: 'attacker' | 'defender',
): Pokemon {
  requireObject(input, side);
  checkBoolean(input.disguiseIntact, `${side}.disguiseIntact`);
  checkStats(input, side, 'statPoints');
  checkStats(input, side, 'boosts');
  checkOption(input.status, statusOptions, `${side}.status`);
  const hpPercent = input.hpPercent === undefined ? 100 : input.hpPercent;
  if (!Number.isInteger(hpPercent) || hpPercent < 1 || hpPercent > 100) {
    throw new ChampionsInputError(
      `${side}.hpPercent: HP 비율은 1~100 사이의 정수여야 합니다.`,
    );
  }

  const pokemon = new Pokemon(
    champions,
    engineEntry(
      champions.species,
      input.species,
      `${side}.species`,
      speciesEngineIds,
    ).name,
    {
      nature: engineEntry(champions.natures, input.nature, `${side}.nature`)
        .name,
      ability:
        input.ability == null ||
        (typeof input.ability === 'string' &&
          (!input.ability.trim() || toID(input.ability) === 'noability'))
          ? 'No Ability'
          : engineEntry(champions.abilities, input.ability, `${side}.ability`)
              .name,
      item:
        input.item == null ||
        (typeof input.item === 'string' && !input.item.trim())
          ? undefined
          : engineEntry(champions.items, input.item, `${side}.item`).name,
      // Champions uses stat points directly and defaults omitted points to 0.
      evs: { ...input.statPoints },
      boosts: { ...input.boosts },
      status: input.status,
    },
  );

  if (pokemon.named('Mimikyu') && pokemon.hasAbility('Disguise')) {
    pokemon.abilityOn = input.disguiseIntact ?? true;
  }
  if (pokemon.hasAbility('Unburden') && !pokemon.item) pokemon.abilityOn = true;

  if (hpPercent < 100) {
    // The game floors the displayed percentage. Stay below the next percent.
    const nextPercentHp = ((hpPercent + 1) * pokemon.maxHP()) / 100;
    pokemon.originalCurHP = Math.max(1, Math.ceil(nextPercentHp) - 1);
  }

  return pokemon;
}

function toEngineSide(
  side: ChampionsFieldSideInput | undefined,
  path: string,
): State.Side {
  if (side !== undefined) {
    requireObject(side, path);
    for (const flag of ['reflect', 'lightScreen', 'auroraVeil'] as const) {
      checkBoolean(side[flag], `${path}.${flag}`);
    }
  }
  return {
    isReflect: side?.reflect,
    isLightScreen: side?.lightScreen,
    isAuroraVeil: side?.auroraVeil,
  };
}

function checkSpeedLimit(attacker: Pokemon, defender: Pokemon, field: Field) {
  const speedField = field.clone();
  checkAirLock(attacker, speedField);
  checkAirLock(defender, speedField);
  // In calc 0.12.0 the modern Speed rules match Champions, but their cap
  // allows us to distinguish exactly 999 from a value truncated to 999.
  const speedRules = Generations.get(9);
  for (const [path, pokemon, side] of [
    ['attacker', attacker, speedField.attackerSide],
    ['defender', defender, speedField.defenderSide],
  ] as const) {
    const holder = pokemon.clone();
    checkItem(holder, speedField.isMagicRoom);
    // An unrestricted stat-point input can overflow the engine's 16-bit
    // rank calculation. At that magnitude even the slowest result exceeds 999.
    const rankNumerator = Math.max(2, 2 + holder.boosts.spe);
    if (
      holder.rawStats.spe * rankNumerator > 65535 ||
      getFinalSpeed(speedRules, holder, speedField, side) > 999
    ) {
      throw new ChampionsInputError(
        `${path}.spe: 최종 스피드가 999를 초과합니다.`,
      );
    }
  }
}

function resolveFling(attacker: Pokemon): {
  power: number;
  overridePower?: number;
  unavailableReason?: string;
} {
  const item = attacker.item;
  if (!item) return { power: 0, unavailableReason: '던질 도구가 없습니다.' };
  if (attacker.hasAbility('Klutz')) {
    return {
      power: 0,
      unavailableReason: '서투름 특성으로 도구를 던질 수 없습니다.',
    };
  }
  const rule = flingItems[toID(item)];
  if (rule?.blockedHolders?.includes(attacker.species.id)) {
    return {
      power: 0,
      unavailableReason: '이 포켓몬은 자신의 메가스톤을 던질 수 없습니다.',
    };
  }
  const power = rule?.power ?? getFlingPower(item, champions.num);
  if (power === 0)
    return { power, unavailableReason: '내던지기로 던질 수 없는 도구입니다.' };
  return { power, overridePower: rule?.power };
}

function createMove(
  data: MoveData,
  attacker: Pokemon,
  field: Field,
  powerOverride?: number,
): Move {
  let priorityBoosted = false;
  if (data.name === 'Grassy Glide' && field.hasTerrain('Grassy')) {
    // The engine checks held-item suppression before determining groundedness.
    const holder = attacker.clone();
    checkItem(holder, field.isMagicRoom);
    priorityBoosted = isGrounded(holder, field);
  } else if (
    data.type === 'Flying' &&
    data.category !== 'Status' &&
    attacker.hasAbility('Gale Wings') &&
    attacker.curHP() === attacker.maxHP()
  ) {
    priorityBoosted = true;
  }
  return new Move(champions, data.name, {
    ability: attacker.ability,
    item: attacker.item,
    // calculate() clones the move. Constructor overrides survive that clone.
    overrides: {
      ...(priorityBoosted && { priority: (data.priority ?? 0) + 1 }),
      ...(powerOverride !== undefined && { basePower: powerOverride }),
    },
  });
}

function unavailableMoveReason(move: Move, field: Field): string | undefined {
  if (
    field.isGravity &&
    move.named('Bounce', 'Fly', 'Flying Press', 'High Jump Kick')
  ) {
    return '중력이 적용되어 사용할 수 없습니다.';
  }
  if (move.named('Steel Roller') && !field.terrain) {
    return '필드가 없어 사용할 수 없습니다.';
  }
}

/** Returns the new selection, including any change to the user's status slot. */
export function selectChampionsMove(
  input: ChampionsDamageInput,
  move: string,
): ChampionsDamageInput {
  const selected = { ...input, move };
  if (typeof move === 'string' && toID(move) === 'snore') {
    requireObject(input.attacker, 'attacker');
    checkOption(input.attacker.status, statusOptions, 'attacker.status');
    selected.attacker = { ...input.attacker, status: 'slp' };
  }
  return selected;
}

export function calculateChampionsDamage(
  request: ChampionsDamageInput,
): ChampionsDamageResult {
  requireObject(request, 'input');
  const input = selectChampionsMove(request, request.move);
  const attacker = createPokemon(input.attacker, 'attacker');
  const defender = createPokemon(input.defender, 'defender');
  if (input.field !== undefined) {
    requireObject(input.field, 'field');
    checkOption(input.field.weather, weatherOptions, 'field.weather');
    checkOption(input.field.terrain, terrainOptions, 'field.terrain');
    checkBoolean(input.field.gravity, 'field.gravity');
  }
  const field = new Field({
    gameType: 'Singles',
    weather: input.field?.weather,
    terrain: input.field?.terrain,
    isGravity: input.field?.gravity,
    attackerSide: toEngineSide(input.field?.attackerSide, 'field.attackerSide'),
    defenderSide: toEngineSide(input.field?.defenderSide, 'field.defenderSide'),
  });

  checkSpeedLimit(attacker, defender, field);
  const data = engineEntry(champions.moves, input.move, 'move');
  const fling = data.name === 'Fling' ? resolveFling(attacker) : undefined;
  const move = createMove(data, attacker, field, fling?.overridePower);
  const unavailableReason =
    fling?.unavailableReason ?? unavailableMoveReason(move, field);
  if (unavailableReason) {
    const result = new Result(champions, attacker, defender, move, field, 0, {
      attackerName: attacker.name,
      defenderName: defender.name,
      moveName: move.name,
      ...(fling && { moveBP: fling.power }),
    });
    return Object.assign(result, { unavailableReason });
  }

  const result = calculateOneUse(attacker, defender, move, field);
  if (fling) {
    result.move.bp = fling.power;
    result.rawDesc.moveBP ??= fling.power;
  }
  // Version 0.12.0 checks these Ground immunities even when Iron Ball grounds the holder.
  if (
    result.damage === 0 &&
    result.move.hasType('Ground') &&
    result.defender.hasItem('Iron Ball') &&
    result.defender.hasAbility('Levitate', 'Eelevate') &&
    result.rawDesc.defenderAbility === result.defender.ability
  ) {
    const groundedDefender = createPokemon(
      {
        ...input.defender,
        ability: 'No Ability',
      },
      'defender',
    );
    const groundedResult = calculateOneUse(
      attacker,
      groundedDefender,
      move,
      field,
    );
    groundedResult.defender.ability = defender.ability;
    return groundedResult;
  }
  return result;
}

export function summarizeChampionsDamage(
  result: ChampionsDamageResult,
): ChampionsDamageSummary {
  return {
    move: result.move.name,
    hits: result.move.hits,
    basePower: result.move.bp,
    reportedPower: result.rawDesc.moveBP ?? null,
    attackerHp: {
      current: result.attacker.curHP(),
      max: result.attacker.maxHP(),
    },
    defenderHp: {
      current: result.defender.curHP(),
      max: result.defender.maxHP(),
    },
    damageRange: result.range(),
    damage: result.damage,
    ...(result.move.named('Shell Side Arm') &&
      !result.categoryBranches && {
        category: result.move.category as 'Physical' | 'Special',
      }),
    ...(result.categoryBranches && {
      categoryBranches: result.categoryBranches,
    }),
    ...(result.disguiseHpLoss !== undefined && {
      disguiseHpLoss: result.disguiseHpLoss,
    }),
    ...(result.unavailableReason && {
      unavailableReason: result.unavailableReason,
    }),
  };
}
