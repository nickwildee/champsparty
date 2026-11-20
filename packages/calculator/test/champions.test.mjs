import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
  assert.throws(
    () => calculate(attacker, defender, 'unknown-name'),
    ChampionsInputError,
  );
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
