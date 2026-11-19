import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import process from 'node:process';
import console from 'node:console';
import {
  Generations,
  Pokemon,
  Move,
  Field,
  calculate,
  toID,
} from '@smogon/calc';
import { loadShowdownSource, sourceEntryIndex } from './showdown-source.mjs';
import {
  classifyMove,
  classifyAbility,
  conditionDefinitions,
  productRules,
} from './champions-conditions.mjs';

const require = createRequire(import.meta.url);
const dataDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../data/champions',
);
const pin = JSON.parse(readFileSync(join(dataDir, 'source-pin.json'), 'utf8'));
const args = process.argv.slice(2);
const archiveIndex = args.indexOf('--archive');
if (archiveIndex < 0 || !args[archiveIndex + 1]) {
  throw new Error(
    'Usage: catalog:extract --archive /path/to/pinned/showdown.tar.gz [--check]',
  );
}
const archive = resolve(args[archiveIndex + 1]);
const archiveHash = createHash('sha256')
  .update(readFileSync(archive))
  .digest('hex');
if (archiveHash !== pin.showdown.archiveSha256)
  throw new Error('Archive SHA-256 does not match the pinned source.');
const check = args.includes('--check');
const engineVersion = require('@smogon/calc/package.json').version;
if (engineVersion !== pin.engine.version)
  throw new Error('Engine version differs from source-pin.json.');
const temporaryRoot = mkdtempSync(join(tmpdir(), 'champsparty-showdown-'));
const sourceRoot = join(
  temporaryRoot,
  `pokemon-showdown-${pin.showdown.commit}`,
);
let loaded;
try {
  execFileSync('tar', ['-xzf', archive, '-C', temporaryRoot]);
  loaded = loadShowdownSource(sourceRoot);
  extract(loaded.dex);
} finally {
  loaded?.restore();
  rmSync(temporaryRoot, { recursive: true, force: true });
}

function sorted(values) {
  return [...new Set(values)].sort();
}

function extract(dex) {
  const engine = Generations.get(0);
  const engineSpecies = new Map([...engine.species].map((s) => [s.id, s]));
  const engineMoves = new Map([...engine.moves].map((m) => [m.id, m]));
  const engineAbilities = new Map([...engine.abilities].map((a) => [a.id, a]));
  const candidates = dex.species
    .all()
    .filter((s) => s.exists && s.num > 0 && !s.isNonstandard)
    .sort((a, b) => a.id.localeCompare(b.id, 'en'));
  // Battle-only forms can inherit an empty availability flag even when every
  // form they can transform from is marked Past. Do not promote those to a
  // Champions roster entry. Floette-Mega correctly uses Floette-Eternal here,
  // rather than the unavailable ordinary Floette base species.
  const unavailableBattleFormParents = (species) => {
    if (!species.battleOnly) return [];
    const parents = (
      Array.isArray(species.battleOnly)
        ? species.battleOnly
        : [species.battleOnly]
    ).map((name) => dex.species.get(name));
    return parents.every((parent) => !parent.exists || parent.isNonstandard)
      ? parents.map((parent) => ({
          id: parent.id,
          nonstandard: parent.isNonstandard || 'missing',
        }))
      : [];
  };
  const excludedBattleOnlyForms = candidates
    .filter((species) => unavailableBattleFormParents(species).length)
    .map((species) => ({
      id: species.id,
      name: species.name,
      reason: 'all-transformation-prerequisites-unavailable',
      prerequisites: unavailableBattleFormParents(species),
    }));
  const excludedFormIds = new Set(excludedBattleOnlyForms.map((s) => s.id));
  const roster = candidates.filter((s) => !excludedFormIds.has(s.id));
  const availableMoves = dex.moves
    .all()
    .filter((m) => m.exists && m.num > 0 && !m.isNonstandard);
  const rosterIds = new Set(roster.map((s) => s.id));
  const moveIds = new Set(availableMoves.map((m) => m.id));
  const referencedMoveIds = new Set(moveIds);
  const usedAbilityIds = new Set();
  const indexes = {};
  for (const path of [
    'data/pokedex.ts',
    'data/mods/champions/formats-data.ts',
    'data/mods/champions/learnsets.ts',
    'data/moves.ts',
    'data/mods/champions/moves.ts',
    'data/abilities.ts',
    'data/mods/champions/abilities.ts',
  ])
    indexes[path] = sourceEntryIndex(sourceRoot, path);
  const evidence = (id, paths) =>
    paths.flatMap((path) =>
      indexes[path].has(id) ? [indexes[path].get(id)] : [],
    );
  const pokemon = [];
  const speciesMissing = [];
  const aliases = [];
  const statDifferences = [];
  const typeDifferences = [];
  const weightDifferences = [];
  const defaultAbilityDifferences = [];
  const additionalAbilityOptions = [];
  const unavailableLearnsetReferences = [];
  const errors = [];

  for (const s of roster) {
    const abilities = Object.entries(s.abilities).map(([slot, name]) => {
      const id = toID(name);
      usedAbilityIds.add(id);
      return { slot, id, name, hidden: slot === 'H', special: slot === 'S' };
    });
    let rawMoveIds = [];
    let parents = [];
    try {
      parents = dex.species.getFullLearnset(s.id).map((l) => l.species.id);
      rawMoveIds = sorted(dex.species.getMovePool(s.id));
    } catch (error) {
      errors.push({ speciesId: s.id, error: error.message });
    }
    for (const id of rawMoveIds) referencedMoveIds.add(id);
    const excluded = rawMoveIds.filter((id) => !moveIds.has(id));
    for (const id of excluded)
      unavailableLearnsetReferences.push({
        speciesId: s.id,
        moveId: id,
        reason: dex.moves.get(id).isNonstandard ?? 'not-in-available-move-list',
      });
    let engineId = engineSpecies.has(s.id) ? s.id : null;
    let aliasReason = null;
    if (s.id === 'aegislash' && engineSpecies.has('aegislashshield')) {
      engineId = 'aegislashshield';
      aliasReason = 'shield-form-naming';
    } else if (!engineId && s.isCosmeticForme) {
      const candidate = engineSpecies.get(toID(s.baseSpecies));
      if (
        candidate &&
        JSON.stringify(candidate.baseStats) === JSON.stringify(s.baseStats) &&
        JSON.stringify(candidate.types) === JSON.stringify(s.types) &&
        candidate.weightkg === s.weightkg
      ) {
        engineId = candidate.id;
        aliasReason = 'cosmetic-form-same-calculation-data';
      }
    }
    if (aliasReason)
      aliases.push({ speciesId: s.id, engineId, reason: aliasReason });
    const e = engineId ? engineSpecies.get(engineId) : null;
    if (!e)
      speciesMissing.push({
        id: s.id,
        name: s.name,
        battleOnly: s.battleOnly || null,
        changesFrom: s.changesFrom || null,
        cosmetic: !!s.isCosmeticForme,
      });
    else {
      for (const stat of ['hp', 'atk', 'def', 'spa', 'spd', 'spe']) {
        if (s.baseStats[stat] !== e.baseStats[stat])
          statDifferences.push({
            speciesId: s.id,
            engineId,
            stat,
            showdown: s.baseStats[stat],
            engine: e.baseStats[stat],
          });
      }
      if (JSON.stringify(s.types) !== JSON.stringify(e.types))
        typeDifferences.push({
          speciesId: s.id,
          engineId,
          showdown: s.types,
          engine: e.types,
        });
      if (s.weightkg !== e.weightkg)
        weightDifferences.push({
          speciesId: s.id,
          engineId,
          showdown: s.weightkg,
          engine: e.weightkg,
        });
      if (s.abilities[0] !== e.abilities?.[0])
        defaultAbilityDifferences.push({
          speciesId: s.id,
          engineId,
          showdown: s.abilities[0],
          engine: e.abilities?.[0] ?? null,
        });
      const extra = abilities.filter((a) => a.name !== e.abilities?.[0]);
      if (extra.length)
        additionalAbilityOptions.push({
          speciesId: s.id,
          abilities: extra.map((a) => a.id),
        });
    }
    pokemon.push({
      id: s.id,
      name: s.name,
      nationalDexNumber: s.num,
      baseSpeciesId: toID(s.baseSpecies),
      forme: s.forme || null,
      cosmetic: !!s.isCosmeticForme,
      battleOnly: s.battleOnly || null,
      changesFrom: s.changesFrom ? toID(s.changesFrom) : null,
      requiredItemIds: sorted(
        (s.requiredItems || (s.requiredItem ? [s.requiredItem] : [])).map(toID),
      ),
      abilities,
      moveIds: rawMoveIds.filter((id) => moveIds.has(id)),
      excludedMoveIds: excluded,
      learnsetSourceSpeciesIds: sorted(parents),
      engineId,
      engineMapping: aliasReason || (engineId ? 'exact-id' : 'missing'),
      source: evidence(s.id, [
        'data/pokedex.ts',
        'data/mods/champions/formats-data.ts',
      ]),
      learnsetSource: sorted(parents).flatMap((id) =>
        evidence(id, ['data/mods/champions/learnsets.ts']),
      ),
    });
  }

  const moves = sorted(referencedMoveIds).map((id) => {
    const m = dex.moves.get(id);
    return {
      id,
      name: m.name,
      availableInSource: moveIds.has(id),
      sourceNonstandard: m.isNonstandard || null,
      engineDataPresent: engineMoves.has(id),
      classification: classifyMove(m, dex.data.Moves[id]),
      source: evidence(id, ['data/moves.ts', 'data/mods/champions/moves.ts']),
    };
  });
  const abilities = sorted(usedAbilityIds).map((id) => {
    const a = dex.abilities.get(id);
    return {
      id,
      name: a.name,
      sourceNonstandard: a.isNonstandard || null,
      engineDataPresent: engineAbilities.has(id),
      classification: classifyAbility(a, dex.data.Abilities[id]),
      source: evidence(id, [
        'data/abilities.ts',
        'data/mods/champions/abilities.ts',
      ]),
    };
  });
  const moveDifferences = [];
  for (const m of availableMoves) {
    const e = engineMoves.get(m.id);
    if (!e) continue;
    for (const [field, sourceValue, engineValue] of [
      ['basePower', m.basePower, e.basePower],
      ['type', m.type, e.type],
      ['category', m.category, new Move(engine, e.name).category],
      ['multihit', m.multihit || null, e.multihit || null],
      ['priority', m.priority || 0, e.priority || 0],
      ['willCrit', !!m.willCrit, !!e.willCrit],
    ]) {
      if (JSON.stringify(sourceValue) !== JSON.stringify(engineValue))
        moveDifferences.push({
          moveId: m.id,
          field,
          showdown: sourceValue,
          engine: engineValue,
          interpretation:
            field === 'priority' && sourceValue < 0 && engineValue === 0
              ? 'engine-normalization-negative-priority-not-modeled'
              : m.category === 'Status'
                ? 'metadata-difference-on-status-move'
                : 'requires-mechanic-review',
        });
    }
  }
  const report = {
    schemaVersion: 1,
    counts: {
      rawSourceCandidateForms: candidates.length,
      excludedUnavailableBattleForms: excludedBattleOnlyForms.length,
      sourcePokemonForms: pokemon.length,
      sourceAvailableMoves: availableMoves.length,
      sourceReferencedMoves: moves.length,
      usedAbilities: abilities.length,
      enginePokemonForms: engineSpecies.size,
      engineMoves: engineMoves.size,
      learnsetEdges: pokemon.reduce((sum, p) => sum + p.moveIds.length, 0),
      mappedCosmeticOrNamingAliases: aliases.length,
      missingSpeciesAfterMapping: speciesMissing.length,
      additionalAbilityOptions: additionalAbilityOptions.length,
      unavailableLearnsetReferences: unavailableLearnsetReferences.length,
    },
    speciesMissingAfterMapping: speciesMissing,
    excludedBattleOnlyForms,
    speciesMappings: aliases,
    engineOnlySpecies: [...engineSpecies.values()]
      .filter((s) => !rosterIds.has(s.id))
      .map((s) => ({
        id: s.id,
        name: s.name,
        showdownNonstandard: dex.species.get(s.id).isNonstandard || null,
      })),
    speciesStatDifferences: statDifferences,
    speciesTypeDifferences: typeDifferences,
    speciesWeightDifferences: weightDifferences,
    defaultAbilityDifferences,
    additionalAbilityOptions,
    movesMissingFromEngine: availableMoves
      .filter((m) => !engineMoves.has(m.id))
      .map((m) => ({
        id: m.id,
        name: m.name,
        learners: pokemon
          .filter((p) => p.moveIds.includes(m.id))
          .map((p) => p.id),
      })),
    engineOnlyMoves: [...engineMoves.values()]
      .filter((m) => !moveIds.has(m.id))
      .map((m) => ({
        id: m.id,
        name: m.name,
        showdownNonstandard: dex.moves.get(m.id).isNonstandard || null,
      })),
    moveDataDifferences: moveDifferences,
    missingAbilityData: abilities
      .filter((a) => !a.engineDataPresent)
      .map((a) => a.id),
    unavailableLearnsetReferences,
    sourceAbilityAvailabilityConflicts: abilities
      .filter((a) => a.sourceNonstandard)
      .map((a) => ({ id: a.id, nonstandard: a.sourceNonstandard })),
    extractionErrors: errors,
    classificationReviewRequired: {
      moves: moves
        .filter((m) => m.classification.reviewRequired)
        .map((m) => m.id),
      abilities: abilities
        .filter((a) => a.classification.reviewRequired)
        .map((a) => a.id),
    },
    conditionInputIndex: {
      availableMoves: moves
        .filter(
          (m) =>
            m.availableInSource && m.classification.requiredInputIds.length,
        )
        .map((m) => ({
          id: m.id,
          name: m.name,
          inputs: m.classification.requiredInputIds,
          rules: m.classification.ruleIds,
        })),
      unavailableReferencedMoves: moves
        .filter(
          (m) =>
            !m.availableInSource && m.classification.requiredInputIds.length,
        )
        .map((m) => ({
          id: m.id,
          name: m.name,
          inputs: m.classification.requiredInputIds,
        })),
      abilities: abilities
        .filter((a) => a.classification.requiredInputIds.length)
        .map((a) => ({
          id: a.id,
          name: a.name,
          inputs: a.classification.requiredInputIds,
          rules: a.classification.ruleIds,
        })),
    },
    mechanicProbes: mechanicProbes(engine),
  };
  const conditions = {
    schemaVersion: 2,
    definitions: conditionDefinitions,
    productRules,
    note: 'Product inputs and processing are planned, not implemented. mechanicInputIds/mechanicReviewRuleIds preserve the diagnostic audit scope; requiredInputIds/productRuleIds describe current product decisions.',
  };
  const manifest = {
    ...pin,
    extraction: {
      speciesApi: "Dex.mod('champions').species.all()",
      movePoolApi: "Dex.mod('champions').species.getMovePool(id, false)",
      preserveRawMovePool:
        'Reconstruct as the sorted union of moveIds and excludedMoveIds.',
      availabilityFilter:
        'exists && num > 0 && !isNonstandard; battle-only forms also need at least one available battleOnly prerequisite',
      legalityScope:
        'Data availability and one-move learnability only; not full team/event/ability combination validation or official game audit.',
      baseCalculationData:
        'Not duplicated into catalog: keep @smogon/calc as calculation source.',
    },
    sourceFileSha256: Object.fromEntries(
      [...loaded.sourceHashes.entries()].sort(([a], [b]) =>
        a.localeCompare(b, 'en'),
      ),
    ),
    generatorFileSha256: Object.fromEntries(
      [
        'extract-champions.mjs',
        'showdown-source.mjs',
        'champions-conditions.mjs',
        'champions-product-rules.mjs',
      ].map((file) => [
        file,
        createHash('sha256')
          .update(
            readFileSync(join(dirname(fileURLToPath(import.meta.url)), file)),
          )
          .digest('hex'),
      ]),
    ),
    artifactSha256: {},
  };
  for (const [file, content] of Object.entries({
    'pokemon.json': pokemon,
    'moves.json': moves,
    'abilities.json': abilities,
    'conditions.json': conditions,
    'engine-diff.json': report,
  })) {
    const json = JSON.stringify(content, null, 2) + '\n';
    manifest.artifactSha256[file] = createHash('sha256')
      .update(json)
      .digest('hex');
    output(file, json);
  }
  output('manifest.json', JSON.stringify(manifest, null, 2) + '\n');
  console.log(
    JSON.stringify(
      {
        ...report.counts,
        moveDataDifferences: moveDifferences.length,
        missingAbilities: report.missingAbilityData.length,
        reviewMoves: report.classificationReviewRequired.moves.length,
        reviewAbilities: report.classificationReviewRequired.abilities.length,
        check,
      },
      null,
      2,
    ),
  );
  if (errors.length)
    throw new Error(
      'Some learnsets could not be extracted; see engine-diff.json.',
    );
}

function output(file, json) {
  const path = join(dataDir, file);
  if (check) {
    if (readFileSync(path, 'utf8') !== json)
      throw new Error(`Catalog is not reproducible: ${file}`);
  } else writeFileSync(path, json);
}

function mechanicProbes(gen) {
  const probes = [];
  for (const alliesFainted of [0, 2]) {
    const result = calculate(
      gen,
      new Pokemon(gen, 'Houndstone', { alliesFainted }),
      new Pokemon(gen, 'Metagross-Mega'),
      new Move(gen, 'Last Respects'),
      new Field({ gameType: 'Singles' }),
    );
    probes.push({
      id: 'lastrespects-fainted-allies',
      alliesFainted,
      range: result.range(),
      kind: 'engine-behavior-probe-not-game-reference',
    });
  }
  return probes;
}
