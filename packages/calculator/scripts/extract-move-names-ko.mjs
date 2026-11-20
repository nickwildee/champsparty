import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import console from 'node:console';
import process from 'node:process';
import { withPinnedShowdown } from './showdown-source.mjs';

// Display names only. Availability and learnsets stay in the Champions catalog.
const source = {
  repository: 'https://github.com/kwsch/PKHeX',
  commit: 'fd1c538cc5e91cd7328f5048007f5f44bb78577c',
  path: 'PKHeX.Core/Resources/text/other/ko/text_Moves_ko.txt',
  sha256: '00431074f8cda5994ae8e4364124c57ed7915e15ea51457d8cbe903913affbeb',
};
const dataDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../data/champions',
);
const args = process.argv.slice(2);
if (args.includes('--source-root'))
  throw new Error('Use --archive with the pinned Showdown archive.');
const flag = (name) => {
  const index = args.indexOf(name);
  if (index < 0 || !args[index + 1]) throw new Error(`Missing ${name}`);
  return resolve(args[index + 1]);
};
const hash = (value) => createHash('sha256').update(value).digest('hex');
const text = readFileSync(flag('--names-file'));
if (hash(text) !== source.sha256)
  throw new Error('Korean-name source hash differs from the pinned file.');
const names = text
  .toString('utf8')
  .replace(/^\uFEFF/, '')
  .split(/\r?\n/);
const catalogText = readFileSync(join(dataDir, 'moves.json'));
const catalog = JSON.parse(catalogText.toString('utf8'));
const pin = JSON.parse(readFileSync(join(dataDir, 'source-pin.json'), 'utf8'));
const moves = withPinnedShowdown(flag('--archive'), pin.showdown, ({ dex }) =>
  Object.fromEntries(
    catalog.map(({ id }) => {
      const move = dex.moves.get(id);
      const name = names[move.num];
      if (!move.exists || !name || !/[가-힣]/.test(name))
        throw new Error(`Missing Korean name: ${id}`);
      return [id, { number: move.num, name }];
    }),
  ),
);
const output = `${JSON.stringify(
  {
    schemaVersion: 1,
    asOf: '2026-11-18',
    scope:
      'Only IDs in the pinned Champions moves.json; display labels, not mechanics or availability.',
    championsCommit: pin.showdown.commit,
    catalogSha256: hash(catalogText),
    source,
    moves,
  },
  null,
  2,
)}\n`;
const target = join(dataDir, 'move-names.ko.json');
if (args.includes('--check')) {
  if (readFileSync(target, 'utf8') !== output)
    throw new Error('move-names.ko.json is stale.');
} else {
  writeFileSync(target, output);
}
console.log(
  `${args.includes('--check') ? 'Verified' : 'Wrote'} ${Object.keys(moves).length} Champions Korean move names.`,
);
