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
