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
  compareChampionsSpeed,
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
    (row) => row.engineId && row.id !== row.engineId,
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

test('each side has its own 66 stat points with at most 32 per stat', () => {
  const mon = pokemon('Garchomp', { statPoints: { hp: 2, atk: 32, spe: 32 } });
  const input = { attacker: mon, defender: mon, move: 'Earthquake' };
  assert.doesNotThrow(() => calculateChampionsDamage(input));
  for (const side of ['attacker', 'defender']) {
    for (const [statPoints, path] of [
      [{ atk: 33 }, side + '.statPoints.atk'],
      [{ atk: 21696 }, side + '.statPoints.atk'],
      [{ atk: 1.5 }, side + '.statPoints.atk'],
      [{ hp: -1 }, side + '.statPoints.hp'],
      [{ hp: 3, atk: 32, spe: 32 }, side + '.statPoints'],
    ]) {
      assert.throws(
        () =>
          calculateChampionsDamage({
            ...input,
            [side]: { ...mon, statPoints },
          }),
        (err) =>
          err instanceof ChampionsInputError &&
          err.message.startsWith(path + ':'),
      );
    }
  }
});

test('only Speed-dependent damage is limited; comparisons retain both actual speeds', () => {
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
      move: 'Gyro Ball',
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
    const matchup = { ...input, [side]: overLimit };
    assert.doesNotThrow(() =>
      calculateChampionsDamage({ ...matchup, move: 'Facade' }),
    );
    assert.throws(
      () => calculateChampionsDamage({ ...matchup, move: 'Electro Ball' }),
      ChampionsInputError,
    );
    assert.equal(compareChampionsSpeed(matchup)[side], 1000);
  }
  const dry = calculateChampionsDamage({
    attacker: overLimit,
    defender: pokemon('Altaria', { ability: 'Cloud Nine' }),
    move: 'Surf',
    field: { weather: 'Rain' },
  });
  assert.equal(dry.attacker.stats.spe, 500);
});

test('Unburden defaults on, supports explicit OFF, and shares its state across comparisons and damage', () => {
  const target = pokemon('Hippowdon');
  const sneasler = pokemon('Sneasler', {
    statPoints: { spe: 32 },
    ability: 'Unburden',
  });
  const speed = (attacker) =>
    compareChampionsSpeed({ attacker, defender: target }).attacker;
  assert.equal(speed(sneasler), 378);
  assert.equal(speed({ ...sneasler, abilityActive: false }), 189);
  assert.equal(
    speed({ ...sneasler, abilityActive: false, item: 'Iron Ball' }),
    94,
  );
  assert.throws(
    () => speed({ ...sneasler, item: 'Grassy Seed' }),
    /attacker\.item/,
  );
  assert.throws(
    () => speed({ ...sneasler, abilityActive: 1 }),
    /attacker\.abilityActive/,
  );
  assert.throws(
    () =>
      calculate(target, {
        ...sneasler,
        abilityActive: true,
        item: 'Iron Ball',
      }),
    /defender\.item/,
  );
  const run = (abilityActive) =>
    calculate(sneasler, { ...sneasler, abilityActive }, 'Gyro Ball');
  assert.ok(run(true).reportedPower > run(false).reportedPower);
  assert.equal(speed({ ...sneasler, boosts: { spe: 2 } }), 756);
  const boosted = { ...sneasler, boosts: { spe: 4 } };
  assert.equal(speed(boosted), 1134);
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

test('Speed comparison keeps distinct values over 999, ties, and Trick Room order', () => {
  const runner = (spe) =>
    pokemon('Sneasler', {
      ability: 'Unburden',
      boosts: { spe: 4 },
      statPoints: { spe },
    });
  const matchup = { attacker: runner(12), defender: runner(13) };
  assert.deepEqual(compareChampionsSpeed(matchup), {
    attacker: 1002,
    defender: 1008,
    first: 'defender',
  });
  assert.deepEqual(
    compareChampionsSpeed({ ...matchup, field: { trickRoom: true } }),
    { attacker: 1002, defender: 1008, first: 'attacker' },
  );
  assert.equal(
    compareChampionsSpeed({
      ...matchup,
      defender: runner(12),
      field: { trickRoom: true },
    }).first,
    'tie',
  );
  assert.doesNotThrow(() =>
    calculateChampionsDamage({ ...matchup, move: 'Close Combat' }),
  );
  assert.equal(
    calculateChampionsDamage({ ...matchup, move: 'Payback' }).rawDesc.moveBP,
    50,
  );
  assert.throws(
    () => compareChampionsSpeed({ ...matchup, field: { trickRoom: 1 } }),
    /field\.trickRoom/,
  );
});

test('Speed reads the current status; only Quick Feet boosts other major statuses', () => {
  const attacker = pokemon('Jolteon', { statPoints: { spe: 32 } });
  const defender = pokemon('Hippowdon', { statPoints: { spe: 32 } });
  for (const status of ['', 'par', 'slp', 'brn', 'psn', 'tox', 'frz']) {
    const input = { attacker: { ...attacker, status }, defender };
    assert.equal(
      compareChampionsSpeed(input).attacker,
      status === 'par' ? 100 : 200,
    );
    assert.equal(
      compareChampionsSpeed({
        ...input,
        attacker: { ...input.attacker, ability: 'Quick Feet' },
      }).attacker,
      status ? 300 : 200,
    );
  }
  const matchup = { attacker: { ...attacker, status: 'par' }, defender };
  assert.equal(
    compareChampionsSpeed({ ...matchup, move: 'Snore' }).first,
    'defender',
  );
  const selected = selectChampionsMove(matchup, 'snore');
  assert.equal(compareChampionsSpeed(selected).first, 'attacker');
  assert.equal(matchup.attacker.status, 'par');
  assert.throws(() => selectChampionsMove(matchup, 'Snroe'), /move:/);
});

test('the speed CLI validates confirmed moves before comparing the resolved builds', (t) => {
  const temp = mkdtempSync(join(tmpdir(), 'champions-speed-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const path = join(temp, 'input.json');
  const cli = fileURLToPath(
    new URL('../scripts/calc-check.mjs', import.meta.url),
  );
  const attacker = pokemon('Jolteon', {
    statPoints: { spe: 32 },
    status: 'par',
  });
  const defender = pokemon('Hippowdon', { statPoints: { spe: 32 } });
  for (const [move, expected] of [
    [undefined, 'defender'],
    ['Snore', 'attacker'],
    ['Snroe', null],
    [false, null],
    [null, null],
  ]) {
    writeFileSync(path, JSON.stringify({ attacker, defender, move }));
    const run = spawnSync(process.execPath, [cli, '--speed', path], {
      encoding: 'utf8',
    });
    if (expected) {
      assert.equal(run.status, 0, run.stderr);
      assert.equal(JSON.parse(run.stdout).first, expected);
    } else {
      assert.equal(run.status, 1);
      assert.equal(JSON.parse(run.stderr).stage, 'input');
      assert.match(JSON.parse(run.stderr).message, /^move:/);
    }
  }
});

test('Payback and Analytic use independent manual conditions at any Speed', () => {
  const attacker = pokemon('Starmie', {
    nature: 'Timid',
    ability: 'Analytic',
    item: 'Choice Scarf',
    boosts: { spe: 6 },
    statPoints: { spe: 32 },
  });
  const defender = pokemon('Liepard', {
    ability: 'Unburden',
    boosts: { spe: 6 },
    statPoints: { spe: 32 },
  });
  const psychic = { attacker, defender, move: 'Psychic' };
  for (const abilityActive of [false, true]) {
    assert.deepEqual(
      calculateChampionsDamage({
        ...psychic,
        attacker: { ...attacker, abilityActive },
      }).range(),
      [0, 0],
    );
  }
  const target = pokemon('Hippowdon');
  const run = (stage, abilityActive, moveConditionSatisfied) =>
    calculateChampionsDamage({
      attacker: { ...attacker, boosts: { spe: stage }, abilityActive },
      defender: target,
      move: 'Payback',
      moveConditionSatisfied,
    });
  for (const active of [false, true]) {
    for (const boosted of [false, true]) {
      const fast = run(6, active, boosted);
      assert.equal(fast.rawDesc.moveBP, boosted ? 100 : 50);
      assert.deepEqual(fast.damage, run(-6, active, boosted).damage);
      assert.equal(fast.rawDesc.attackerAbility === 'Analytic', active);
    }
  }
  assert.deepEqual(
    run(-6, undefined, undefined).damage,
    run(6, false, false).damage,
  );
  assert.ok(run(6, true, false).range()[0] > run(6, false, false).range()[0]);
  assert.ok(run(6, false, true).range()[0] > run(6, false, false).range()[0]);
  assert.throws(
    () =>
      calculateChampionsDamage({ ...psychic, moveConditionSatisfied: true }),
    /moveConditionSatisfied/,
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
  const defaults = JSON.parse(
    readFileSync(
      new URL('../data/champions/conditions.json', import.meta.url),
      'utf8',
    ),
  ).catalogDefaults;
  const mud = catalog.find((row) => row.id === 'mudslap');
  assert.equal(
    mud.productPolicy?.selection ?? defaults.selectionByKind.move,
    'included',
  );
  assert.deepEqual(mud.requiredInputIds ?? defaults.requiredInputIds, []);
  assert.deepEqual(mud.productPolicy?.defaults ?? defaults.defaults, {});
  assert.ok(mud.productRuleIds.includes('accuracy-drop-excluded'));
  assert.ok(
    calculate(pokemon('garchomp'), pokemon('hippowdon'), 'mudslap')
      .damageRange[0] > 0,
  );
  assert.ok(
    catalog
      .find((row) => row.id === 'acidspray')
      .requiredInputIds.includes('rankChangesEnabled'),
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

test('Fling loses only the seed consumed by the current terrain', () => {
  const terrains = ['Electric', 'Grassy', 'Misty', 'Psychic'];
  const defender = pokemon('Mimikyu', { ability: 'Disguise' });
  const attack = (attacker, terrain, intact) =>
    summarizeChampionsDamage(
      calculateChampionsDamage({
        attacker,
        defender: { ...defender, disguiseIntact: intact },
        move: 'Fling',
        field: { terrain },
      }),
    );
  for (const seed of terrains) {
    const attacker = pokemon('Garchomp', { item: seed + ' Seed' });
    for (const terrain of [undefined, ...terrains]) {
      for (const intact of [true, false]) {
        const result = attack(attacker, terrain, intact);
        if (terrain === seed) {
          assert.match(result.unavailableReason, /시드가 소모/);
          assert.equal(result.basePower, 0);
          assert.equal(result.reportedPower, 0);
          assert.equal(result.damage, 0);
          assert.equal(result.disguiseHpLoss, undefined);
        } else {
          assert.equal(result.unavailableReason, undefined);
          assert.equal(result.basePower, 10);
          assert.equal(result.reportedPower, 10);
          assert.equal(result.disguiseHpLoss, intact ? 16 : undefined);
          assert.equal(result.damageRange[1] > 0, !intact);
        }
      }
    }
  }
  assert.match(
    attack(
      pokemon('Lopunny', { item: 'Grassy Seed', ability: 'Klutz' }),
      'Grassy',
      false,
    ).unavailableReason,
    /서투름/,
  );
});

test('Parental Bond obeys Champions exclusion flags and preserves eligible hits', () => {
  const parent = pokemon('Kangaskhan-Mega', {
    nature: 'Hardy',
    ability: 'Parental Bond',
    item: 'Kangaskhanite',
  });
  const target = pokemon('Mimikyu', { nature: 'Hardy', ability: 'Disguise' });
  for (const [move, item] of [
    ['Dig', 'Kangaskhanite'],
    ['Solar Beam', 'Kangaskhanite'],
    ['Future Sight', 'Kangaskhanite'],
    ['Fling', 'Iron Ball'],
  ]) {
    const attacker = { ...parent, item };
    const result = calculate(attacker, target, move);
    assert.equal(result.unavailableReason, undefined, move);
    assert.equal(result.hits, 1, move);
    assert.equal(result.damage, 0, move);
    assert.equal(result.disguiseHpLoss, 16, move);
    const broken = { ...target, disguiseIntact: false };
    const expected = calculate({ ...attacker, ability: '' }, broken, move);
    assert.ok(expected.damageRange[0] > 0, move);
    assert.deepEqual(
      calculate(attacker, broken, move).damage,
      expected.damage,
      move,
    );
  }
  const ironTail = calculate(parent, target, 'Iron Tail');
  assert.equal(ironTail.hits, 2);
  assert.ok(ironTail.damage[0].every((roll) => roll === 0));
  assert.ok(ironTail.damage[1].every((roll) => roll > 0));
  assert.deepEqual(
    calculate(parent, pokemon('Hippowdon'), 'Seismic Toss').damage,
    [50, 50],
  );
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

test('Shell Side Arm keeps the pre-hit category when Stamina raises Defense between hits', () => {
  const attacker = pokemon('Slowbro-Galar', {
    nature: 'Hardy',
    ability: 'Parental Bond',
  });
  const defender = pokemon('Dragonite', {
    nature: 'Hardy',
    statPoints: { def: 5, spd: 1 },
  });
  const run = (target, field) =>
    summarizeChampionsDamage(
      calculateChampionsDamage({
        attacker,
        defender: target,
        move: 'Shell Side Arm',
        field,
      }),
    );
  const control = run(defender);
  const result = run({ ...defender, ability: 'Stamina' });
  assert.deepEqual(
    result.categoryBranches.map((b) => [b.category, b.probability]),
    [
      ['Physical', 0.5],
      ['Special', 0.5],
    ],
  );
  const [physical, special] = result.categoryBranches;
  const [originalPhysical, originalSpecial] = control.categoryBranches;
  assert.deepEqual(physical.damage[0], originalPhysical.damage[0]);
  assert.ok(physical.damage[1][15] < originalPhysical.damage[1][15]);
  assert.deepEqual(special.damage, originalSpecial.damage);
  // A terrain seed raises Defense before the first hit, so it affects selection.
  assert.equal(
    run({ ...defender, item: 'Grassy Seed' }, { terrain: 'Grassy' }).category,
    'Special',
  );
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

test('a resist berry reduces one qualifying hit of Parental Bond or a natural multi-hit move', () => {
  const parent = pokemon('Kangaskhan-Mega', { ability: 'Parental Bond' });
  for (const [attacker, defender, move, item, hits] of [
    [parent, pokemon('Metagross'), 'Earthquake', 'Shuca Berry', 2],
    [parent, pokemon('Hippowdon'), 'Facade', 'Chilan Berry', 2],
    [
      pokemon('Maushold'),
      pokemon('Hippowdon'),
      'Population Bomb',
      'Chilan Berry',
      10,
    ],
    [pokemon('Lucario'), pokemon('Metagross'), 'Bone Rush', 'Shuca Berry', 3],
  ]) {
    const control = calculate(attacker, defender, move);
    const berry = calculate(attacker, { ...defender, item }, move);
    assert.equal(berry.hits, hits);
    assert.ok(berry.damage[0].every((roll, i) => roll < control.damage[0][i]));
    assert.deepEqual(berry.damage.slice(1), control.damage.slice(1));
  }
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
