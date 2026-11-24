import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import console from 'node:console';
import {
  Generations,
  Pokemon,
  Move,
  Field,
  calculate,
  toID,
} from '@smogon/calc';
import { getFlingPower } from '@smogon/calc/dist/items.js';
import { withPinnedShowdown } from './showdown-source.mjs';
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
const { values } = parseArgs({
  options: {
    archive: { type: 'string' },
    check: { type: 'boolean', default: false },
    diagnostics: { type: 'string' },
  },
});
if (!values.archive || values.diagnostics === '')
  throw new Error(
    'Usage: catalog:extract --archive <pinned archive> [--check] [--diagnostics <directory>]',
  );
const archive = resolve(values.archive);
const diagnosticsDir = values.diagnostics && resolve(values.diagnostics);
const check = values.check;
const catalogDefaults = {
  availableInSource: true,
  engineDataPresent: true,
  ruleIds: ['existing-context'],
  requiredInputIds: [],
  productRuleIds: [],
  selectionByKind: { move: 'included', ability: 'damage-or-speed-only' },
  implementation:
    productRules.defaultImplementation ?? productRules.implementation,
  maximumUses: null,
  defaults: {},
};
const engineVersion = require('@smogon/calc/package.json').version;
if (engineVersion !== pin.engine.version)
  throw new Error('Engine version differs from source-pin.json.');
withPinnedShowdown(archive, pin.showdown, extract);

// Omitted fields take the defaults shared by the catalog in conditions.json.
function productEntry(
  { id, name, classification, engineDataPresent, availableInSource },
  kind,
) {
  const {
    category,
    ruleIds,
    hitCount,
    defaultStatus,
    requiredInputIds,
    productRuleIds,
    productPolicy,
  } = classification;
  const policy = {};
  if (productPolicy.selection !== catalogDefaults.selectionByKind[kind])
    policy.selection = productPolicy.selection;
  if (productPolicy.implementation !== catalogDefaults.implementation)
    policy.implementation = productPolicy.implementation;
  if (productPolicy.maximumUses !== null)
    policy.maximumUses = productPolicy.maximumUses;
  if (Object.keys(productPolicy.defaults).length)
    policy.defaults = productPolicy.defaults;
  return {
    id,
    name,
    ...(category && { category }),
    ...(availableInSource === false && { availableInSource: false }),
    ...(!engineDataPresent && { engineDataPresent: false }),
    ...(ruleIds.length === 1 && ruleIds[0] === 'existing-context'
      ? {}
      : { ruleIds }),
    ...(hitCount && { hitCount }),
    ...(defaultStatus && { defaultStatus }),
    ...(requiredInputIds.length > 0 && { requiredInputIds }),
    ...(productRuleIds.length > 0 && { productRuleIds }),
    ...(Object.keys(policy).length > 0 && { productPolicy: policy }),
  };
}

function sorted(values) {
  return [...new Set(values)].sort();
}

// Use the pinned Champions Fling and TakeItem data. Store only differences
// from the engine's power table and holder-specific throw restrictions.
function flingItemOverrides(dex, engine, pokemon) {
  const overrides = {};
  for (const item of [...dex.items.all()].sort((a, b) =>
    a.id.localeCompare(b.id, 'en'),
  )) {
    if (!item.exists || item.num <= 0 || item.isNonstandard) continue;
    const engineItem = engine.items.get(item.id);
    if (!engineItem) continue;
    const power = item.fling?.basePower ?? 0;
    const entry = {};
    if (power !== getFlingPower(engineItem.name, engine.num))
      entry.power = power;
    if (item.onTakeItem) {
      const blocked = pokemon.filter(({ id }) => {
        const holder = { baseSpecies: dex.species.get(id) };
        return item.onTakeItem(item, holder) === false;
      });
      const blockedHolders = sorted(
        blocked.map((holder) => holder.engineId ?? holder.id),
      );
      if (blockedHolders.length) entry.blockedHolders = blockedHolders;
    }
    if (Object.keys(entry).length) overrides[item.id] = entry;
  }
  return overrides;
}

function extract({ dex, sourceHashes }) {
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
  const excludedBattleOnlyForms = candidates.flatMap((species) => {
    const prerequisites = unavailableBattleFormParents(species);
    return prerequisites.length
      ? [
          {
            id: species.id,
            name: species.name,
            reason: 'all-transformation-prerequisites-unavailable',
            prerequisites,
          },
        ]
      : [];
  });
  const excludedFormIds = new Set(excludedBattleOnlyForms.map((s) => s.id));
  const roster = candidates.filter((s) => !excludedFormIds.has(s.id));
  const availableMoves = dex.moves
    .all()
    .filter((m) => m.exists && m.num > 0 && !m.isNonstandard);
  const moveIds = new Set(availableMoves.map((m) => m.id));
  const referencedMoveIds = new Set(moveIds);
  const usedAbilityIds = new Set();
  const pokemon = [];
  const speciesMissing = [];
  const aliases = [];
  const statDifferences = [];
  const typeDifferences = [];
  const weightDifferences = [];
  const defaultAbilityDifferences = [];
  const additionalAbilityOptions = [];
  const unavailableLearnsetReferences = [];

  for (const s of roster) {
    const abilities = Object.entries(s.abilities).map(([slot, name]) => {
      const id = toID(name);
      usedAbilityIds.add(id);
      return { slot, id, name };
    });
    const rawMoveIds = sorted(dex.species.getMovePool(s.id));
    for (const id of rawMoveIds) referencedMoveIds.add(id);
    if (diagnosticsDir) {
      for (const id of rawMoveIds) {
        if (!moveIds.has(id)) {
          unavailableLearnsetReferences.push({
            speciesId: s.id,
            moveId: id,
            reason:
              dex.moves.get(id).isNonstandard ?? 'not-in-available-move-list',
          });
        }
      }
    }
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
    if (diagnosticsDir && !e)
      speciesMissing.push({
        id: s.id,
        name: s.name,
        battleOnly: s.battleOnly || null,
        changesFrom: s.changesFrom || null,
        cosmetic: !!s.isCosmeticForme,
      });
    else if (diagnosticsDir) {
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
      ...(s.id !== toID(s.baseSpecies) && {
        baseSpeciesId: toID(s.baseSpecies),
      }),
      ...(s.forme && { forme: s.forme }),
      ...(s.isCosmeticForme && { cosmetic: true }),
      ...(s.battleOnly && { battleOnly: s.battleOnly }),
      ...(s.changesFrom && { changesFrom: toID(s.changesFrom) }),
      ...((s.requiredItems?.length || s.requiredItem) && {
        requiredItemIds: sorted(
          (s.requiredItems || [s.requiredItem]).map(toID),
        ),
      }),
      ...(engineId !== s.id && { engineId }),
      abilities: Object.fromEntries(
        abilities.map(({ slot, id }) => [slot, id]),
      ),
      moveIds: rawMoveIds.filter((id) => moveIds.has(id)),
    });
  }

  const moves = sorted(referencedMoveIds).map((id) => {
    const m = dex.moves.get(id);
    return {
      id,
      name: m.name,
      availableInSource: moveIds.has(id),
      engineDataPresent: engineMoves.has(id),
      classification: classifyMove(m, dex.data.Moves[id]),
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
    };
  });
  const conditions = {
    schemaVersion: 4,
    catalogDefaults,
    definitions: conditionDefinitions,
    productRules,
  };
  const artifacts = {
    'pokemon.json': pokemon,
    'species-aliases.json': Object.fromEntries(
      aliases.map(({ speciesId, engineId }) => [speciesId, engineId]),
    ),
    'fling-item-overrides.json': flingItemOverrides(dex, engine, pokemon),
    'parental-bond-exclusions.json': sorted(
      availableMoves
        .filter(
          ({ category, flags }) =>
            category !== 'Status' &&
            (flags.noparentalbond || flags.charge || flags.futuremove),
        )
        .map(({ id }) => id),
    ),
    'moves.json': moves.map((row) => productEntry(row, 'move')),
    'abilities.json': abilities.map((row) => productEntry(row, 'ability')),
    'conditions.json': conditions,
  };
  const hashes = {};
  for (const [file, content] of Object.entries(artifacts)) {
    // A single catalog record is the unit of review. Keep the lists of IDs inline.
    const rows = ['pokemon.json', 'moves.json', 'abilities.json'].includes(
      file,
    );
    const json = rows
      ? '[\n' +
        content.map((row) => '  ' + JSON.stringify(row)).join(',\n') +
        '\n]\n'
      : pretty(content);
    output(dataDir, file, json);
    if (diagnosticsDir) hashes[file] = hash(json);
  }
  console.log(
    `${check ? 'Verified' : 'Wrote'} ${pokemon.length} forms, ${moves.length} moves, ${abilities.length} abilities.`,
  );
  if (!diagnosticsDir) return;

  const rosterIds = new Set(roster.map((s) => s.id));
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
    // Preserve exceptional evidence without distributing it as selection metadata.
    mechanicNotes: [
      ...moves.map((entry) => ({ kind: 'move', ...entry })),
      ...abilities.map((entry) => ({ kind: 'ability', ...entry })),
    ].flatMap(({ kind, id, classification }) => {
      const {
        mechanicNote,
        historyDependencies,
        counterSemantics,
        knownEngineGap,
      } = classification;
      if (
        !mechanicNote &&
        !historyDependencies &&
        !counterSemantics &&
        !knownEngineGap
      )
        return [];
      return [
        {
          kind,
          id,
          mechanicNote,
          historyDependencies,
          counterSemantics,
          knownEngineGap,
        },
      ];
    }),
    mechanicProbes: mechanicProbes(engine),
  };
  const manifest = {
    ...pin,
    extraction: {
      speciesApi: "Dex.mod('champions').species.all()",
      movePoolApi: "Dex.mod('champions').species.getMovePool(id, false)",
      availabilityFilter:
        'exists && num > 0 && !isNonstandard; battle-only forms also need at least one available battleOnly prerequisite',
      legalityScope:
        'Data availability and one-move learnability only; not full team/event/ability combination validation or official game audit.',
      baseCalculationData:
        'Not duplicated into catalog: keep @smogon/calc as calculation source.',
    },
    sourceFileSha256: Object.fromEntries(
      [...sourceHashes.entries()].sort(([a], [b]) => a.localeCompare(b, 'en')),
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
    artifactSha256: hashes,
  };
  if (!check) mkdirSync(diagnosticsDir, { recursive: true });
  const reportJson = pretty(report);
  hashes['engine-diff.json'] = hash(reportJson);
  output(diagnosticsDir, 'engine-diff.json', reportJson);
  output(diagnosticsDir, 'manifest.json', pretty(manifest));
}

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

function pretty(value) {
  return JSON.stringify(value, null, 2) + '\n';
}

function output(directory, file, json) {
  const path = join(directory, file);
  if (check) {
    if (readFileSync(path, 'utf8') !== json)
      throw new Error(`Catalog is not reproducible: ${path}`);
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
