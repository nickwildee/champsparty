import { calculate, Field, Move, Pokemon, Result } from '@smogon/calc';

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
  const result = calculate(move.gen, attacker, defender, move, field);
  if (!move.named('Shell Side Arm')) {
    return applyDisguise(result, attacker, defender, move, field);
  }

  const { atk, spa } = result.attacker.stats;
  const { def, spd } = result.defender.stats;
  const factor = (Math.floor((2 * attacker.level) / 5) + 2) * move.bp;
  const score = (offense: number, defense: number) =>
    Math.floor(Math.floor((factor * offense) / defense) / 50);
  const tied = score(atk, def) === score(spa, spd);
  const first = applyDisguise(result, attacker, defender, move, field);
  if (!tied) return first;

  const alternative =
    first.move.category === 'Physical' ? 'Special' : 'Physical';
  const alternateMove = new Move(move.gen, move.name, {
    ability: attacker.ability,
    item: attacker.item,
    overrides: {
      ...move.overrides,
      category: alternative,
      flags: { ...move.flags, contact: alternative === 'Physical' ? 1 : 0 },
    },
  });
  const alternate = applyDisguise(
    calculate(move.gen, attacker, defender, alternateMove, field),
    attacker,
    defender,
    alternateMove,
    field,
  );
  const branches =
    first.move.category === 'Physical'
      ? [describeBranch(first), describeBranch(alternate)]
      : [describeBranch(alternate), describeBranch(first)];
  first.categoryBranches = branches;
  first.damage = shellRolls(branches[0].damage)
    .concat(shellRolls(branches[1].damage))
    .sort((a, b) => a - b);
  return first;
}
