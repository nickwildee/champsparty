import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath, URL } from 'node:url';
import {
  calculateChampionsDamage,
  ChampionsInputError,
  selectChampionsMove,
  summarizeChampionsDamage,
} from '../src/index.ts';
import { withPinnedShowdown } from '../scripts/showdown-source.mjs';

const pokemon = (species, options = {}) => ({
  species,
  nature: 'Jolly',
  statPoints: {},
  ...options,
});
const calculate = (attacker, defender, move = 'earthquake') =>
  summarizeChampionsDamage(
    calculateChampionsDamage({ attacker, defender, move }),
  );

test('IDs and English names give the same immunity, held item and damage rolls', () => {
  const attacker = pokemon('Garchomp', { item: 'Soft Sand' });
  const defender = pokemon('Rotom-Wash', { ability: 'Levitate' });
  const idAttacker = pokemon('garchomp', { item: 'softsand', nature: 'jolly' });
  const idDefender = pokemon('rotomwash', { ability: 'levitate' });
  assert.deepEqual(
    calculate(attacker, defender, 'Earthquake'),
    calculate(idAttacker, idDefender),
  );
  assert.deepEqual(calculate(idAttacker, idDefender).damageRange, [0, 0]);
  const grounded = calculate(idAttacker, { ...idDefender, item: 'ironball' });
  assert.deepEqual(
    grounded,
    calculate(attacker, { ...defender, item: 'Iron Ball' }),
  );
  assert.ok(grounded.damageRange[0] > 0);
  assert.deepEqual(
    calculate(attacker, pokemon('Metagross-Mega'), 'Earth Power'),
    calculate(idAttacker, pokemon('metagrossmega'), 'earthpower'),
  );
});

test('catalog form aliases resolve to their engine form', () => {
  const catalog = JSON.parse(
    readFileSync(
      new URL('../data/champions/pokemon.json', import.meta.url),
      'utf8',
    ),
  );
  for (const { id, engineId } of catalog.filter(
    (row) => row.id !== row.engineId,
  )) {
    assert.deepEqual(
      calculate(pokemon('garchomp'), pokemon(id)),
      calculate(pokemon('garchomp'), pokemon(engineId)),
      id,
    );
  }
});

test('missing abilities suppress the species default and unknown names give input errors', () => {
  const attacker = pokemon('garchomp');
  const defender = pokemon('rotomwash');
  assert.ok(calculate(attacker, defender).damageRange[0] > 0);
  assert.deepEqual(
    calculate(attacker, defender),
    calculate(attacker, { ...defender, ability: '  ' }),
  );
  for (const key of ['species', 'nature', 'item', 'ability']) {
    assert.throws(
      () => calculate(attacker, { ...defender, [key]: 'unknown-name' }),
      ChampionsInputError,
    );
  }
  for (const name of ['unknown-name', 'constructor']) {
    assert.throws(
      () => calculate(attacker, defender, name),
      ChampionsInputError,
    );
  }
});

test('displayed HP selects the upper compatible value independently for each side', () => {
  const mon = pokemon('metagrossmega', { statPoints: { hp: 20 } });
  const result = calculate({ ...mon, hpPercent: 1 }, { ...mon, hpPercent: 50 });
  assert.deepEqual(result.attackerHp, { current: 3, max: 175 });
  assert.deepEqual(result.defenderHp, { current: 89, max: 175 });
  assert.deepEqual(calculate(mon, mon).defenderHp, { current: 175, max: 175 });
  for (const hpPercent of [0, 101, 1.5]) {
    assert.throws(
      () => calculate(mon, { ...mon, hpPercent }),
      ChampionsInputError,
    );
  }
});

test('final Speed of 999 is accepted and 1000 is rejected on either side', () => {
  const target = pokemon('Hippowdon');
  // 148 × 3 (+4) × 1.5 (Quick Feet) × 1.5 (Choice Scarf) = 999.
  const atLimit = pokemon('Jolteon', {
    nature: 'Quiet',
    statPoints: { spe: 15 },
    boosts: { spe: 4 },
    ability: 'Quick Feet',
    status: 'psn',
    item: 'Choice Scarf',
  });
  // 125 × 4 (+6) × 2 (Swift Swim in rain) = 1000.
  const overLimit = pokemon('Qwilfish', {
    nature: 'Hardy',
    statPoints: { spe: 20 },
    boosts: { spe: 6 },
    ability: 'Swift Swim',
  });
  for (const side of ['attacker', 'defender']) {
    const input = {
      attacker: target,
      defender: target,
      move: 'Facade',
      field: { weather: 'Rain' },
    };
    assert.equal(
      calculateChampionsDamage({ ...input, [side]: atLimit })[side].stats.spe,
      999,
    );
    assert.throws(
      () => calculateChampionsDamage({ ...input, [side]: overLimit }),
      (err) =>
        err instanceof ChampionsInputError &&
        err.message.startsWith(side + '.spe:'),
    );
  }
  const dry = calculateChampionsDamage({
    attacker: overLimit,
    defender: pokemon('Altaria', { ability: 'Cloud Nine' }),
    move: 'Surf',
    field: { weather: 'Rain' },
  });
  assert.equal(dry.attacker.stats.spe, 500);
});

test('the speed limit uses active Unburden, status and effective items', () => {
  const target = pokemon('Hippowdon');
  const sneasler = pokemon('Sneasler', {
    statPoints: { spe: 32 },
    ability: 'Unburden',
  });
  const speed = (attacker) =>
    calculateChampionsDamage({
      attacker,
      defender: target,
      move: 'Acrobatics',
    }).attacker.stats.spe;
  assert.equal(speed(sneasler), 378);
  assert.equal(speed({ ...sneasler, boosts: { spe: 2 } }), 756);
  const boosted = { ...sneasler, boosts: { spe: 4 } };
  assert.throws(() => speed(boosted), /attacker\.spe: 최종 스피드가 999/);
  assert.equal(speed({ ...boosted, status: 'par' }), 567);
  const klutz = pokemon('Lopunny', {
    statPoints: { spe: 32 },
    boosts: { spe: 6 },
    ability: 'Klutz',
    item: 'Choice Scarf',
  });
  assert.equal(speed(klutz), 688);
  assert.throws(
    () => speed(pokemon('Sneasler', { statPoints: { spe: 65536 } })),
    ChampionsInputError,
  );
});

test('the shared source reader rejects bytes outside the pinned Showdown archive before loading data', () => {
  const pinFile = new URL('../data/champions/source-pin.json', import.meta.url);
  const { showdown } = JSON.parse(readFileSync(pinFile, 'utf8'));
  assert.throws(
    () =>
      withPinnedShowdown(fileURLToPath(pinFile), showdown, () =>
        assert.fail('unexpected source read'),
      ),
    /Archive SHA-256/,
  );
});

test('the shared calculator reports the path of malformed inputs', () => {
  const a = pokemon('garchomp');
  const d = pokemon('hippowdon');
  const valid = { attacker: a, defender: d, move: 'earthquake' };
  const cases = [
    [null, 'input'],
    [[valid], 'input'],
    [{ ...valid, attacker: null }, 'attacker'],
    [{ ...valid, defender: { ...d, species: '' } }, 'defender.species'],
    [
      { ...valid, attacker: { ...a, statPoints: undefined } },
      'attacker.statPoints',
    ],
    [{ ...valid, attacker: { ...a, statPoints: [] } }, 'attacker.statPoints'],
    [
      { ...valid, attacker: { ...a, statPoints: { atk: '32' } } },
      'attacker.statPoints.atk',
    ],
    [
      { ...valid, defender: { ...d, boosts: { def: 7 } } },
      'defender.boosts.def',
    ],
    [{ ...valid, defender: { ...d, boosts: { hp: 1 } } }, 'defender.boosts.hp'],
    [{ ...valid, defender: { ...d, status: 'Typo' } }, 'defender.status'],
    [{ ...valid, attacker: { ...a, hpPercent: null } }, 'attacker.hpPercent'],
    [{ ...valid, field: [] }, 'field'],
    [{ ...valid, field: { weather: 'Typo' } }, 'field.weather'],
    [{ ...valid, field: { gravity: 'false' } }, 'field.gravity'],
    [{ ...valid, field: { attackerSide: null } }, 'field.attackerSide'],
    [
      { ...valid, field: { defenderSide: { reflect: 1 } } },
      'field.defenderSide.reflect',
    ],
  ];
  for (const [input, path] of cases) {
    assert.throws(
      () => calculateChampionsDamage(input),
      (e) =>
        e instanceof ChampionsInputError && e.message.startsWith(path + ':'),
    );
  }
});

test('CLI rejects malformed stats and terrain with an input error and no damage output', (t) => {
  const temp = mkdtempSync(join(tmpdir(), 'champions-cli-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const path = join(temp, 'input.json');
  const cli = fileURLToPath(
    new URL('../scripts/calc-check.mjs', import.meta.url),
  );
  const base = {
    attacker: pokemon('garchomp'),
    defender: pokemon('hippowdon'),
    move: 'earthquake',
  };
  for (const [input, field] of [
    [
      { ...base, attacker: { ...base.attacker, statPoints: { atk: {} } } },
      'attacker.statPoints.atk',
    ],
    [
      { ...base, move: 'Steel Roller', field: { terrain: 'Typo' } },
      'field.terrain',
    ],
    [null, 'input'],
  ]) {
    writeFileSync(path, JSON.stringify(input));
    const run = spawnSync(process.execPath, [cli, path], { encoding: 'utf8' });
    assert.equal(run.status, 1);
    assert.equal(run.stdout, '');
    const error = JSON.parse(run.stderr);
    assert.equal(error.stage, 'input');
    assert.ok(error.message.startsWith(field + ':'));
  }
});

test('Gale Wings changes which Flying attacks get through priority protection', () => {
  const attacker = pokemon('talonflame', { ability: 'galewings' });
  const defenders = [
    [pokemon('hippowdon'), { terrain: 'Psychic' }],
    [pokemon('farigiraf', { ability: 'armortail' }), {}],
    [pokemon('tsareena', { ability: 'queenlymajesty' }), {}],
  ];
  const damage = (user, target, field, move = 'bravebird') =>
    calculateChampionsDamage({
      attacker: user,
      defender: target,
      move,
      field,
    }).range();
  for (const [target, field] of defenders) {
    assert.deepEqual(damage(attacker, target, field), [0, 0]);
    assert.deepEqual(damage(attacker, target, field, 'airslash'), [0, 0]);
    assert.ok(damage({ ...attacker, hpPercent: 99 }, target, field)[0] > 0);
    assert.ok(damage(attacker, target, field, 'flareblitz')[0] > 0);
  }
  const airborne = pokemon('hippowdon', { item: 'Air Balloon' });
  assert.ok(damage(attacker, airborne, { terrain: 'Psychic' })[0] > 0);
  assert.deepEqual(
    damage(attacker, airborne, { terrain: 'Psychic', gravity: true }),
    [0, 0],
  );
});

test('Grassy Glide uses terrain and effective grounding before priority protection', () => {
  const attacker = pokemon('abomasnow');
  const defender = pokemon('farigiraf', { ability: 'Armor Tail' });
  const damage = (user, field, target = defender) =>
    calculateChampionsDamage({
      attacker: user,
      defender: target,
      move: 'grassyglide',
      field,
    }).range();
  const grassy = { terrain: 'Grassy' };
  const balloon = { ...attacker, item: 'Air Balloon' };
  assert.deepEqual(damage(attacker, grassy), [0, 0]);
  assert.ok(damage(attacker, {})[0] > 0);
  assert.ok(damage(balloon, grassy)[0] > 0);
  assert.deepEqual(damage(balloon, { ...grassy, gravity: true }), [0, 0]);
  assert.ok(damage(attacker, grassy, pokemon('farigiraf'))[0] > 0);
});

test('Mud-Slap deals damage without a rank toggle; Acid Spray keeps its Special Defense drop', () => {
  const catalog = JSON.parse(
    readFileSync(
      new URL('../data/champions/moves.json', import.meta.url),
      'utf8',
    ),
  );
  const mud = catalog.find((row) => row.id === 'mudslap').classification;
  assert.equal(mud.productPolicy.selection, 'included');
  assert.deepEqual(mud.requiredInputIds, []);
  assert.deepEqual(mud.productPolicy.defaults, {});
  assert.ok(mud.productRuleIds.includes('accuracy-drop-excluded'));
  assert.ok(
    calculate(pokemon('garchomp'), pokemon('hippowdon'), 'mudslap')
      .damageRange[0] > 0,
  );
  assert.ok(
    catalog
      .find((row) => row.id === 'acidspray')
      .classification.requiredInputIds.includes('rankChangesEnabled'),
  );
});

test('selecting Snore replaces the user status with sleep until another status is chosen', () => {
  const defender = pokemon('hippowdon', { status: 'par' });
  for (const status of [
    undefined,
    '',
    'brn',
    'par',
    'psn',
    'tox',
    'frz',
    'slp',
  ]) {
    const input = {
      attacker: pokemon('garchomp', { status }),
      defender,
      move: 'earthquake',
    };
    const selected = selectChampionsMove(input, 'Snore');
    assert.equal(selected.attacker.status, 'slp');
    assert.equal(selected.defender.status, 'par');

    const direct = calculateChampionsDamage({ ...input, move: 'snore' });
    assert.equal(direct.attacker.status, 'slp');
    assert.equal(direct.defender.status, 'par');
    assert.ok(direct.range()[0] > 0);
    assert.equal(
      selectChampionsMove(selected, 'earthquake').attacker.status,
      'slp',
    );
  }
  const input = {
    attacker: pokemon('garchomp', { status: 'brn' }),
    defender,
    move: 'earthquake',
  };
  assert.equal(calculateChampionsDamage(input).attacker.status, 'brn');
  assert.throws(
    () =>
      calculateChampionsDamage({
        ...input,
        attacker: { ...input.attacker, status: 'invalid' },
        move: 'snore',
      }),
    ChampionsInputError,
  );
});

test('Fling uses the held item for its power, rolls and first-use item bonuses', () => {
  const target = pokemon('hippowdon');
  const cases = [
    ['bigroot', 10, [5, 6]],
    ['Shell Bell', 30, [13, 16]],
    ['Abomasite', 80, [34, 40]],
    ['Iron Ball', 130, [54, 64]],
    ['Life Orb', 30, [17, 21]],
  ];
  for (const [item, power, range] of cases) {
    const result = calculate(pokemon('garchomp', { item }), target, 'fling');
    assert.equal(result.basePower, power, item);
    assert.equal(result.reportedPower, power, item);
    assert.deepEqual(result.damageRange, range, item);
    assert.equal(result.damage.length, 16, item);
    assert.equal(result.unavailableReason, undefined, item);
  }
  assert.deepEqual(
    calculate(pokemon('garchomp', { item: 'Abomasite' }), target, 'fling')
      .damage,
    [34, 34, 34, 35, 35, 36, 36, 36, 37, 37, 38, 38, 38, 39, 39, 40],
  );
});

test('Fling distinguishes missing items, incompatible holders and Klutz', () => {
  const target = pokemon('hippowdon');
  for (const [species, item, ability, reason] of [
    ['garchomp', undefined, undefined, /던질 도구가 없/],
    ['garchomp', 'Normal Gem', undefined, /던질 수 없는 도구/],
    ['garchomp', 'Garchompite', undefined, /자신의 메가스톤/],
    ['garchompmega', 'Garchompite Z', undefined, /자신의 메가스톤/],
    ['floetteeternal', 'Floettite', undefined, /자신의 메가스톤/],
    ['lopunny', 'Iron Ball', 'Klutz', /서투름/],
  ]) {
    const result = calculate(
      pokemon(species, { item, ability }),
      target,
      'Fling',
    );
    assert.match(result.unavailableReason, reason);
    assert.equal(result.basePower, 0);
    assert.equal(result.reportedPower, 0);
    assert.deepEqual(result.damageRange, [0, 0]);
    assert.equal(result.damage, 0);
  }
});

test('Shell Side Arm scores before damage modifiers and exposes both outcomes of an integer tie', () => {
  const attacker = pokemon('Slowbro-Galar', { nature: 'Hardy' });
  const defender = pokemon('Dragonite', {
    nature: 'Hardy',
    statPoints: { def: 5, spd: 1 },
  });
  const input = {
    attacker,
    defender,
    move: 'Shell Side Arm',
    field: { defenderSide: { reflect: true } },
  };
  const run = (changes = {}) =>
    summarizeChampionsDamage(
      calculateChampionsDamage({ ...input, ...changes }),
    );
  const result = run();
  // Ratios 120/120 and 120/121 both score 39. Reflect applies only after selection.
  assert.equal(result.category, undefined);
  assert.deepEqual(
    result.categoryBranches.map(({ category, probability, damageRange }) => [
      category,
      probability,
      damageRange,
    ]),
    [
      ['Physical', 0.5, [25, 30]],
      ['Special', 0.5, [51, 61]],
    ],
  );
  assert.deepEqual(result.damageRange, [25, 61]);
  assert.deepEqual(
    result.damage,
    result.categoryBranches.flatMap((b) => b.damage).sort((a, b) => a - b),
  );
  assert.equal(result.damage.length, 32);
  assert.deepEqual(run(), result);
  for (const [atk, spa, category] of [
    [1, 0, 'Physical'],
    [0, 1, 'Special'],
  ]) {
    const single = run({ attacker: { ...attacker, boosts: { atk, spa } } });
    assert.equal(single.category, category);
    assert.equal(single.categoryBranches, undefined);
    assert.equal(single.damage.length, 16);
  }
  // Equal ratios take the engine's other default branch; still offer physical contact.
  const equal = run({ defender: { ...defender, statPoints: { def: 5 } } });
  assert.deepEqual(equal.categoryBranches, result.categoryBranches);
});

test('Disguise absorbs only the first effective hit and reports break HP separately', () => {
  const attacker = pokemon('Abomasnow');
  const defender = pokemon('Mimikyu', { ability: 'Disguise' });
  const hit = (d, move = 'Bullet Seed', a = attacker) => calculate(a, d, move);
  const normal = hit({ ...defender, disguiseIntact: false });
  const shield = hit(defender);
  assert.equal(shield.disguiseHpLoss, 16);
  assert.deepEqual(shield.damageRange, [32, 42]);
  assert.ok(shield.damage[0].every((n) => n === 0));
  assert.deepEqual(shield.damage.slice(1), normal.damage.slice(1));
  assert.equal(normal.disguiseHpLoss, undefined);
  assert.deepEqual(
    hit({ ...defender, species: 'Mimikyu-Busted' }).damage,
    normal.damage,
  );
  const single = hit(defender, 'Ice Beam');
  assert.equal(single.damage, 0);
  assert.equal(single.disguiseHpLoss, 16);
  const low = hit({ ...defender, hpPercent: 1 });
  assert.equal(low.damage, 0);
  assert.equal(low.hits, 1);
  assert.equal(low.disguiseHpLoss, low.defenderHp.current);
  const immune = hit(defender, 'Facade');
  assert.equal(immune.damage, 0);
  assert.equal(immune.disguiseHpLoss, undefined);
  const bypass = hit(
    defender,
    'Iron Head',
    pokemon('Excadrill', { ability: 'Mold Breaker' }),
  );
  assert.ok(bypass.damageRange[0] > 0);
  assert.equal(bypass.disguiseHpLoss, undefined);
  const axel = hit(defender, 'Triple Axel', pokemon('Froslass'));
  const uncovered = hit(
    { ...defender, disguiseIntact: false },
    'Triple Axel',
    pokemon('Froslass'),
  );
  assert.deepEqual(axel.damage.slice(1), uncovered.damage.slice(1));
  const parent = pokemon('Kangaskhan-Mega', { ability: 'Parental Bond' });
  const child = hit(defender, 'Iron Tail', parent);
  const berry = hit({ ...defender, item: 'Babiri Berry' }, 'Iron Tail', parent);
  assert.deepEqual(berry.damage[0], Array(16).fill(0));
  assert.ok(berry.damage[1][15] < child.damage[1][15]);
  assert.equal(berry.disguiseHpLoss, 16);
});

test('Multiscale and defense-stage-ignoring moves keep the native damage rolls', () => {
  const dragon = pokemon('Dragonite', { ability: 'Multiscale' });
  const full = calculate(pokemon('Abomasnow'), dragon, 'Bullet Seed');
  const chipped = calculate(
    pokemon('Abomasnow'),
    { ...dragon, hpPercent: 99 },
    'Bullet Seed',
  );
  assert.deepEqual(
    full.damage.map((hit) => [hit[0], hit[15]]),
    [
      [1, 2],
      [3, 4],
      [3, 4],
    ],
  );
  assert.deepEqual(
    chipped.damage.map((hit) => [hit[0], hit[15]]),
    [
      [3, 4],
      [3, 4],
      [3, 4],
    ],
  );
  for (const [species, move] of [
    ['Gallade', 'Sacred Sword'],
    ['Incineroar', 'Darkest Lariat'],
  ]) {
    const rolls = (def) =>
      calculate(
        pokemon(species),
        pokemon('Hippowdon', { boosts: { def } }),
        move,
      ).damage;
    assert.deepEqual(rolls(-6), rolls(0));
    assert.deepEqual(rolls(6), rolls(0));
  }
});
