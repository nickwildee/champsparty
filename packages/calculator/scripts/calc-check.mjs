import { readFileSync } from 'node:fs';
import process from 'node:process';
import {
  calculateChampionsDamage,
  ChampionsInputError,
  summarizeChampionsDamage,
} from '../src/index.ts';

const args = process.argv.slice(2);
let stage = 'input';

try {
  if (args.length !== 1) {
    throw new Error('사용법: pnpm calc:check <입력.json>');
  }

  const input = JSON.parse(readFileSync(args[0], 'utf8'));

  stage = 'engine';
  const result = calculateChampionsDamage(input);

  stage = 'result';
  const summary = summarizeChampionsDamage(result);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
} catch (error) {
  const failure = {
    stage: error instanceof ChampionsInputError ? 'input' : stage,
    message: error instanceof Error ? error.message : String(error),
  };
  process.stderr.write(`${JSON.stringify(failure, null, 2)}\n`);
  process.exitCode = 1;
}
