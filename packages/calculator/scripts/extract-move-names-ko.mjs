import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import console from 'node:console';
import process from 'node:process';
import { withPinnedShowdown } from './showdown-source.mjs';

const dataDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../data/champions',
);
const readJson = (file) =>
  JSON.parse(readFileSync(join(dataDir, file), 'utf8'));
const names = readJson('names.ko.json');
const pin = readJson('source-pin.json');
const args = process.argv.slice(2);
const check = args.includes('--check');
const verifyLocal = check && args.length === 1;
const hangul = /[가-힣]/;
const target = join(dataDir, 'names.ko.json');
const flag = (name) => {
  const index = args.indexOf(name);
  if (index < 0 || !args[index + 1] || args[index + 1].startsWith('--'))
    throw new Error(`Missing ${name}`);
  return resolve(args[index + 1]);
};

const { pokemonAndAbilities, moves: source, moveCrossCheck } = names.sources;
assert.match(pokemonAndAbilities.commit, /^[a-f0-9]{40}$/);
assert.ok(
  pokemonAndAbilities.path &&
    pokemonAndAbilities.pokemonField &&
    pokemonAndAbilities.abilityField,
);
assert.match(pokemonAndAbilities.pokemonListing, /^https:\/\//);
assert.match(pokemonAndAbilities.pokemonListingSha256, /^[a-f0-9]{64}$/);
assert.match(source.repository, /^https:\/\//);
assert.match(source.commit, /^[a-f0-9]{40}$/);
assert.ok(source.path);
assert.match(source.sha256, /^[a-f0-9]{64}$/);
assert.match(moveCrossCheck.url, /^https:\/\//);
assert.match(moveCrossCheck.htmlSha256, /^[a-f0-9]{64}$/);

const formReferences = pokemonAndAbilities.formReferences;
for (const id of [
  'mimikyubusted',
  'polteageistantique',
  'sinistchamasterpiece',
  'vivillonfancy',
  'vivillonpokeball',
]) {
  assert.ok(
    Object.hasOwn(formReferences, id),
    `Missing Korean form reference: ${id}`,
  );
}
for (const [id, url] of Object.entries(formReferences)) {
  assert.ok(
    Object.hasOwn(names.pokemon, id),
    `Unknown Korean form reference: ${id}`,
  );
  assert.match(url, /^https:\/\//);
}

const catalogs = {
  pokemon: readJson('pokemon.json'),
  abilities: readJson('abilities.json'),
  moves: readJson('moves.json'),
};
function readMoveNames(dex, labels) {
  return Object.fromEntries(
    catalogs.moves.map(({ id }) => {
      const move = dex.moves.get(id);
      const name = labels[move.num];
      assert.ok(
        move.exists && typeof name === 'string' && hangul.test(name),
        `Missing Korean move name: ${id}`,
      );
      return [id, { number: move.num, name }];
    }),
  );
}

if (!verifyLocal) {
  if (args.includes('--source-root'))
    throw new Error('Use --archive with the pinned Showdown archive.');
  const text = readFileSync(flag('--names-file'));
  assert.equal(
    createHash('sha256').update(text).digest('hex'),
    source.sha256,
    'Korean move-name source hash mismatch.',
  );
  const labels = text
    .toString('utf8')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/);
  names.moves = withPinnedShowdown(flag('--archive'), pin.showdown, ({ dex }) =>
    readMoveNames(dex, labels),
  );
  names.championsCommit = pin.showdown.commit;
}
assert.equal(
  names.championsCommit,
  pin.showdown.commit,
  'Korean names refer to another Champions catalog.',
);
for (const [group, catalog] of Object.entries(catalogs)) {
  assert.deepEqual(
    Object.keys(names[group]).sort(),
    catalog.map(({ id }) => id).sort(),
    `Korean name IDs differ from ${group}.json`,
  );
  for (const [id, entry] of Object.entries(names[group])) {
    const name = group === 'moves' ? entry.name : entry;
    assert.ok(
      typeof name === 'string' && hangul.test(name),
      `Missing Korean name: ${id}`,
    );
  }
}
const numbers = Object.values(names.moves).map(({ number }) => number);
assert.ok(
  numbers.every((number) => Number.isInteger(number) && number > 0) &&
    new Set(numbers).size === numbers.length,
  'Move numbers must be unique positive integers.',
);

const output = JSON.stringify(names, null, 2) + '\n';
if (check) {
  assert.ok(readFileSync(target, 'utf8') === output, 'names.ko.json is stale.');
} else {
  writeFileSync(target, output);
}
console.log(
  `${check ? 'Verified' : 'Updated'} Korean names for ${catalogs.pokemon.length} forms, ${catalogs.abilities.length} abilities, and ${catalogs.moves.length} moves.`,
);
