import { readFileSync } from 'node:fs';
import process from 'node:process';
import {
  calculateChampionsDamage,
  ChampionsInputError,
  compareChampionsSpeed,
  selectChampionsMove,
  summarizeChampionsDamage,
} from '../src/index.ts';

const args = process.argv.slice(2);
let stage = 'input';

try {
  const speed = args[0] === '--speed';
  if (args.length !== (speed ? 2 : 1)) {
    throw new Error('사용법: pnpm calc:check [--speed] <입력.json>');
  }

  const input = JSON.parse(readFileSync(args[speed ? 1 : 0], 'utf8'));

  stage = 'engine';
  let summary;
  if (speed) {
    const selected =
      input?.move === undefined
        ? input
        : selectChampionsMove(input, input.move);
    summary = compareChampionsSpeed(selected);
  } else {
    const result = calculateChampionsDamage(input);
    stage = 'result';
    summary = summarizeChampionsDamage(result);
  }
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
} catch (error) {
  const failure = {
    stage: error instanceof ChampionsInputError ? 'input' : stage,
    message: error instanceof Error ? error.message : String(error),
  };
  process.stderr.write(`${JSON.stringify(failure, null, 2)}\n`);
  process.exitCode = 1;
}
