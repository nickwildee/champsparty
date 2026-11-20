import {
  calculate,
  Field,
  Generations,
  Move,
  Pokemon,
  Result,
  toID,
  type State,
  type StatsTable,
} from '@smogon/calc';
import speciesAliases from '../data/champions/species-aliases.json' with { type: 'json' };

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
}

interface ChampionsFieldSideInput {
  reflect?: boolean;
  lightScreen?: boolean;
  auroraVeil?: boolean;
}

export interface ChampionsFieldInput {
  weather?: State.Field['weather'];
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
}

export type ChampionsDamageResult = Result & { unavailableReason?: string };

export class ChampionsInputError extends RangeError {}

const champions = Generations.get(0);

const speciesEngineIds = new Map(Object.entries(speciesAliases));

function engineName(
  table: {
    get(id: ReturnType<typeof toID>): { id: string; name: string } | undefined;
  },
  value: string,
  label: string,
  aliases?: ReadonlyMap<string, string>,
): string {
  const id = typeof value === 'string' ? toID(value) : '';
  const key = toID(aliases?.get(id) ?? id);
  const entry = key && table.get(key);
  if (!entry || entry.id !== key || !entry.name)
    throw new ChampionsInputError(
      `${label}을(를) 엔진에서 찾을 수 없습니다: ${value}`,
    );
  return entry.name;
}

function createPokemon(input: ChampionsPokemonInput): Pokemon {
  const hpPercent = input.hpPercent ?? 100;
  if (!Number.isInteger(hpPercent) || hpPercent < 1 || hpPercent > 100) {
    throw new ChampionsInputError('HP 비율은 1~100 사이의 정수여야 합니다.');
  }

  const pokemon = new Pokemon(
    champions,
    engineName(champions.species, input.species, '포켓몬', speciesEngineIds),
    {
      nature: engineName(champions.natures, input.nature, '성격'),
      ability:
        input.ability == null ||
        (typeof input.ability === 'string' &&
          (!input.ability.trim() || toID(input.ability) === 'noability'))
          ? 'No Ability'
          : engineName(champions.abilities, input.ability, '특성'),
      item:
        input.item == null ||
        (typeof input.item === 'string' && !input.item.trim())
          ? undefined
          : engineName(champions.items, input.item, '도구'),
      // Champions uses stat points directly and defaults omitted points to 0.
      evs: { ...input.statPoints },
      boosts: { ...input.boosts },
      status: input.status,
    },
  );

  if (hpPercent < 100) {
    // The game floors the displayed percentage. Stay below the next percent.
    const nextPercentHp = ((hpPercent + 1) * pokemon.maxHP()) / 100;
    pokemon.originalCurHP = Math.max(1, Math.ceil(nextPercentHp) - 1);
  }

  return pokemon;
}

function toEngineSide(side?: ChampionsFieldSideInput): State.Side {
  return {
    isReflect: side?.reflect,
    isLightScreen: side?.lightScreen,
    isAuroraVeil: side?.auroraVeil,
  };
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

export function calculateChampionsDamage(
  input: ChampionsDamageInput,
): ChampionsDamageResult {
  const attacker = createPokemon(input.attacker);
  const defender = createPokemon(input.defender);
  const move = new Move(
    champions,
    engineName(champions.moves, input.move, '기술'),
    {
      ability: attacker.ability,
      item: attacker.item,
    },
  );
  const field = new Field({
    gameType: 'Singles',
    weather: input.field?.weather,
    terrain: input.field?.terrain,
    isGravity: input.field?.gravity,
    attackerSide: toEngineSide(input.field?.attackerSide),
    defenderSide: toEngineSide(input.field?.defenderSide),
  });

  const unavailableReason = unavailableMoveReason(move, field);
  if (unavailableReason) {
    const result = new Result(champions, attacker, defender, move, field, 0, {
      attackerName: attacker.name,
      defenderName: defender.name,
      moveName: move.name,
    });
    return Object.assign(result, { unavailableReason });
  }

  const result = calculate(champions, attacker, defender, move, field);
  // Version 0.12.0 checks these Ground immunities even when Iron Ball grounds the holder.
  if (
    result.damage === 0 &&
    result.move.hasType('Ground') &&
    result.defender.hasItem('Iron Ball') &&
    result.defender.hasAbility('Levitate', 'Eelevate') &&
    result.rawDesc.defenderAbility === result.defender.ability
  ) {
    const groundedDefender = createPokemon({
      ...input.defender,
      ability: 'No Ability',
    });
    const groundedResult = calculate(
      champions,
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
    ...(result.unavailableReason && {
      unavailableReason: result.unavailableReason,
    }),
  };
}
