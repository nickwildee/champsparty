import { createRequire } from 'node:module';
import { readFileSync, realpathSync, mkdtempSync, rmSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

const require = createRequire(import.meta.url);

// This development-only reader uses our existing TypeScript dependency. It never
// installs or bundles the Showdown server, and is not imported by browser code.
export function withPinnedShowdown(archive, pin, inspect) {
  const bytes = readFileSync(archive);
  if (createHash('sha256').update(bytes).digest('hex') !== pin.archiveSha256)
    throw new Error('Archive SHA-256 does not match the pinned source.');

  const directory = mkdtempSync(join(tmpdir(), 'champsparty-showdown-'));
  let loaded;
  try {
    execFileSync('tar', ['-xzf', '-', '-C', directory], { input: bytes });
    loaded = loadShowdownSource(
      join(directory, `pokemon-showdown-${pin.commit}`),
    );
    return inspect(loaded);
  } finally {
    loaded?.restore();
    rmSync(directory, { recursive: true, force: true });
  }
}

function loadShowdownSource(root) {
  // require resolves symlinks (macOS /var -> /private/var). Canonicalize the
  // root too, so provenance never contains random temporary directory names.
  root = realpathSync(root);
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  if (pkg.name !== 'pokemon-showdown')
    throw new Error('Expected a Showdown source checkout.');
  const previous = require.extensions['.ts'];
  const sourceHashes = new Map();
  require.extensions['.ts'] = (module, filename) => {
    const source = readFileSync(filename, 'utf8');
    sourceHashes.set(
      relative(root, filename).split(sep).join('/'),
      createHash('sha256').update(source).digest('hex'),
    );
    const compiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: filename,
    });
    module._compile(compiled.outputText, filename);
  };
  try {
    const { Dex } = require(join(root, 'sim/dex.ts'));
    const dex = Dex.mod('champions');
    return {
      dex,
      root,
      sourceHashes,
      restore() {
        if (previous) require.extensions['.ts'] = previous;
        else delete require.extensions['.ts'];
      },
    };
  } catch (error) {
    if (previous) require.extensions['.ts'] = previous;
    else delete require.extensions['.ts'];
    throw error;
  }
}
