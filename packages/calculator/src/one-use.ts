import { calculate, Field, Move, Pokemon, Result } from '@smogon/calc';
import {
  checkIntimidate,
  checkItem,
  checkSeedBoost,
  computeFinalStats,
} from '@smogon/calc/dist/mechanics/util.js';

type Category = 'Physical' | 'Special';

export interface CategoryBranch {
  category: Category;
  probability: 0.5;
  damageRange: [number, number];
  damage: Result['damage'];
}

export type OneUseResult = Result & {
  categoryBranches?: CategoryBranch[];
  disguiseHpLoss?: number;
};

function applyDisguise(
  result: OneUseResult,
  attacker: Pokemon,
  defender: Pokemon,
  move: Move,
  field: Field,
): OneUseResult {
  if (
    !result.defender.named('Mimikyu') ||
    !result.defender.hasAbility('Disguise') ||
    !result.defender.abilityOn ||
    result.range()[1] === 0
  )
    return result;

  const hpLoss = Math.min(defender.curHP(), Math.floor(defender.maxHP() / 8));
  const remainingHP = defender.curHP() - hpLoss;
  result.disguiseHpLoss = hpLoss;
  result.rawDesc.defenderAbility = defender.ability;
  const damage = result.damage;
  // The engine represents ordinary hits as 16 rolls, fixed multi-hits as
  // a short array, and variable multi-hits as a separate array for each hit.
  if (
    remainingHP === 0 ||
    typeof damage === 'number' ||
    (typeof damage[0] === 'number' && damage.length >= 16)
  ) {
    result.damage = 0;
    result.move.hits = 1;
  } else if (typeof damage[0] === 'number') {
    result.damage = [0, ...(damage as number[]).slice(1)];
  } else {
    // Keep the original hit numbers (e.g. Triple Axel's second hit is 40 BP).
    const nextDefender = defender.clone();
    nextDefender.originalCurHP = remainingHP;
    const afterBreak = calculate(
      result.gen,
      attacker,
      nextDefender,
      move,
      field,
    );
    const laterHits = (afterBreak.damage as number[][]).slice(1);
    result.damage = [Array<number>(16).fill(0), ...laterHits];
  }
  return result;
}

// Shell Side Arm hits once, or twice with Parental Bond. The combined rolls
// represent one use. A category is chosen once for the entire use.
function shellRolls(damage: Result['damage']): number[] {
  if (typeof damage === 'number') return Array<number>(16).fill(damage);
  if (!Array.isArray(damage[0])) return damage as number[];
  const [first, second] = damage as number[][];
  const totals: number[] = [];
  for (const parent of first) {
    for (const child of second) totals.push(parent + child);
  }
  return totals;
}

function describeBranch(result: Result): CategoryBranch {
  return {
    category: result.move.category as Category,
    probability: 0.5,
    damageRange: result.range(),
    damage: result.damage,
  };
}

export function calculateOneUse(
  attacker: Pokemon,
  defender: Pokemon,
  move: Move,
  field: Field,
): OneUseResult {
  if (!move.named('Shell Side Arm')) {
    const result = calculate(move.gen, attacker, defender, move, field);
    return applyDisguise(result, attacker, defender, move, field);
  }

  // Apply pre-hit stat changes on copies. A hit can subsequently change the
  // defender's stats (e.g. Stamina) even within the same use.
  const source = attacker.clone();
  const target = defender.clone();
  for (const pokemon of [source, target]) {
    checkItem(pokemon, field.isMagicRoom);
    checkSeedBoost(pokemon, field);
  }
  checkIntimidate(move.gen, source, target);
  checkIntimidate(move.gen, target, source);
  computeFinalStats(
    move.gen,
    source,
    target,
    field,
    'atk',
    'spa',
    'def',
    'spd',
  );
  const factor = (Math.floor((2 * attacker.level) / 5) + 2) * move.bp;
  const score = (offense: number, defense: number) =>
    Math.floor(Math.floor((factor * offense) / defense) / 50);
  const physical = score(source.stats.atk, target.stats.def);
  const special = score(source.stats.spa, target.stats.spd);

  function calculateCategory(category: Category) {
    const selected = new Move(move.gen, move.name, {
      ability: attacker.ability,
      item: attacker.item,
      overrides: {
        ...move.overrides,
        category,
        flags: { ...move.flags, contact: category === 'Physical' ? 1 : 0 },
      },
    });
    const result = calculate(move.gen, attacker, defender, selected, field);
    return applyDisguise(result, attacker, defender, selected, field);
  }

  const first = calculateCategory(physical >= special ? 'Physical' : 'Special');
  if (physical !== special) return first;
  const branches = [
    describeBranch(first),
    describeBranch(calculateCategory('Special')),
  ];
  first.categoryBranches = branches;
  first.damage = shellRolls(branches[0].damage)
    .concat(shellRolls(branches[1].damage))
    .sort((a, b) => a - b);
  return first;
}
