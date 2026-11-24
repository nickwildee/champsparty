// Product decisions are separate from the contexts used to probe the engine.
// Product rules default to planned until their calculator behavior is implemented.
const ids = (value) => value.split(' ');
const move = (id, moves, options) => ({
  id,
  kind: 'move',
  ids: ids(moves),
  ...options,
});
const ability = (id, abilities, options) => ({
  id,
  kind: 'ability',
  ids: ids(abilities),
  ...options,
});

export const productRules = {
  updatedOn: '2026-11-20',
  defaultImplementation: 'planned',
  common: {
    game: 'Champions',
    battle: 'Singles',
    initialHpPercent: 100,
    initialHpPercentRange: [1, 100],
    moveCountPerPokemon: 1,
    ownStateScope: 'Shared across opponents.',
    opponentStateScope:
      'Local to one opponent; shared by its attack, defense and speed comparisons.',
    fieldScope: 'Per opponent; shared by its comparisons.',
    abilityOptional: true,
    emptyAbility: 'No Ability',
    abilitySelection:
      'Only effects relevant to supported direct damage or Speed; field-setting abilities use field inputs instead.',
    status:
      'One selected status per Pokemon; preserve it during repeated KO calculation.',
    automaticMoveStatusChanges: false,
    screens:
      'For repeated uses of the same move by the same attacker against the same defender, ignore screens on every hit if the move breaks them or the attacker bypasses them with Infiltrator.',
    rankChangesDefaultEnabled: true,
    probabilisticRankChanges: false,
    endOfTurnDamage: false,
    healing: false,
    recoilKo: false,
    accuracyProbability: false,
    criticalProbability: false,
    terrainGravityCoexist: true,
    gravity: {
      scope: 'opponent',
      placement: 'additional-field',
      defaultEnabled: false,
    },
    itemTransfer: false,
    berries:
      'One generic resist-berry option; no healing/stat-raising berries or separate stolen-berry eating effects.',
    consumption:
      'Resist berries affect one qualifying hit; Normal Gem affects the whole first qualifying use; White Herb restores negative ranks once.',
    hpAndProtection:
      'Update remaining HP and supported protection/consumption state after each hit, preserving outcome probabilities.',
  },
  rules: [
    {
      id: 'status-move-excluded',
      kind: 'move',
      category: 'Status',
      selection: 'excluded',
      inputs: [],
    },
    move('ohko-excluded', 'fissure guillotine horndrill sheercold', {
      selection: 'excluded',
      inputs: [],
    }),
    move('hp-manipulation-excluded', 'superfang painsplit endeavor', {
      selection: 'excluded',
      inputs: [],
    }),
    move('party-attack-excluded', 'beatup', {
      selection: 'excluded',
      inputs: [],
    }),
    move('delegated-move-excluded', 'copycat sleeptalk transform', {
      selection: 'excluded',
      inputs: [],
    }),
    {
      id: 'hit-count',
      kind: 'move',
      sourceRule: 'variable-hit-count',
      inputs: ['hitCount'],
      defaults: { hitCount: 'move-maximum' },
      processing:
        'Integer within each move range; fixed-count/Skill Link conditions constrain it; reuse the selected count per use, without accuracy aggregation.',
    },
    move('fainted-allies', 'lastrespects', {
      inputs: ['alliesFainted'],
      bounds: { min: 0, max: 5 },
      defaults: { alliesFainted: 0 },
    }),
    ability('fainted-allies-ability', 'supremeoverlord', {
      inputs: ['alliesFainted'],
      bounds: { min: 0, max: 5 },
      defaults: { alliesFainted: 0 },
      processing:
        'Use the faint count captured at entry, rather than reapplying an entry event.',
    }),
    move('hits-taken', 'ragefist', {
      inputs: ['hitsTaken'],
      bounds: { min: 0, max: 6 },
      defaults: { hitsTaken: 0 },
    }),
    move('stockpile-count', 'spitup', {
      inputs: ['stockpileCount'],
      bounds: { min: 0, max: 3 },
      defaults: { stockpileCount: 0 },
      processing:
        'Zero is unusable; starting final Defense/Special Defense ranks are separate and not boosted again.',
    }),
    move(
      'power-boost-toggle',
      'assurance avalanche lashout stompingtantrum temperflare round ficklebeam',
      {
        inputs: ['powerBoostEnabled'],
        defaults: { powerBoostEnabled: false },
        scope:
          'Own-history conditions are Pokemon state; target-relative conditions are opponent-local.',
        processing:
          'Keep the selected power branch for every use; do not aggregate its activation probability.',
      },
    ),
    move('payback-toggle', 'payback', {
      implementation: 'implemented',
      inputs: ['moveConditionSatisfied'],
      defaults: { moveConditionSatisfied: false },
      scope: 'opponent',
      processing:
        'Manual activation; do not infer from Speed. Keep the selected state on repeated uses.',
    }),
    move(
      'success-assumed',
      'belch lastresort focuspunch suckerpunch upperhand',
      {
        inputs: [],
        processing:
          'Assume the move success prerequisites; no history or failure toggle.',
      },
    ),
    move('linked-reflection', 'counter mirrorcoat metalburst comeuppance', {
      inputs: ['opponentMoveId'],
      maximumUses: 1,
      processing:
        'Calculate incoming damage using the linked opponent build and move, then reflect it. Prompt when that move is missing; do not require a defense-comparison checkbox or simulate exchanged attacks.',
    }),
    move(
      'single-use',
      'fakeout firstimpression fling selfdestruct explosion mistyexplosion finalgambit gigatonhammer spitup burnup doubleshock steelroller',
      {
        maximumUses: 1,
        processing: 'Show one-use damage, rolls and OHKO probability only.',
      },
    ),
    move('steel-roller-exception', 'steelroller', {
      requiresTerrain: true,
      processing:
        'Return zero damage without terrain. With terrain, calculate one use with the selected battle conditions.',
    }),
    move('fling', 'fling', {
      processing:
        'Use item-dependent power and validate throwability; no after-hit item effects or item reacquisition.',
    }),
    move('sleep-required', 'snore', {
      implementation: 'implemented',
      inputs: [],
      scope: 'pokemon',
      requiredUserStatus: 'slp',
      lockedUserStatus: 'slp',
      processing:
        'Selecting Snore replaces the user’s status with sleep. Keep sleep locked while Snore is selected and discard the previous status.',
    }),
    move('status-from-user', 'facade', {
      inputs: ['status'],
      scope: 'pokemon',
      processing:
        'Derive activation from the same selected status used by abilities and Speed.',
    }),
    move('status-from-target', 'hex infernalparade venoshock barbbarrage', {
      inputs: ['targetStatus'],
      scope: 'opponent',
      processing:
        'Derive activation from the target Pokemon status; poison-specific moves require poison/toxic poison.',
    }),
    move('accuracy-drop-excluded', 'mudslap', {
      inputs: [],
      processing:
        'Calculate direct damage; ignore the accuracy drop and omit the rank toggle.',
    }),
    {
      id: 'guaranteed-rank-change',
      kind: 'move',
      guaranteedRankChange: true,
      inputs: ['rankChangesEnabled'],
      defaults: { rankChangesEnabled: true },
      processing:
        'Respect the actual before/after-hit timing and caps. OFF freezes supplied initial final ranks. Exclude probabilistic changes. Clear Smog resets only after its first successful damage calculation.',
    },
    move('pre-attack-rank-change', 'electroshot meteorbeam', {
      inputs: ['rankChangesEnabled'],
      defaults: { rankChangesEnabled: true },
      processing:
        'Apply the guaranteed pre-attack Special Attack increase at its original timing, including the first attack; do not double-count it as an entry boost.',
    }),
    move(
      'screen-terrain-removal',
      'brickbreak psychicfangs ragingbull icespinner steelroller',
      {
        processing:
          'Remove supported screens/terrain at the move-specific timing; recalculate affected later damage.',
      },
    ),
    move('item-removal', 'knockoff', {
      processing:
        'Apply the eligible first-use power bonus; remove the item after the hit and recalculate later damage, respecting removal restrictions.',
    }),
    move('item-transfer-excluded', 'thief covet', {
      processing: 'Calculate ordinary damage without transferring held items.',
    }),
    move('berry-eating-effects-excluded', 'bugbite pluck', {
      processing:
        'Only the supported resist-berry reduction/consumption applies; no separate stolen-berry eating effects.',
    }),
    move('smack-down-grounding-excluded', 'smackdown', {
      processing:
        'Keep ordinary move damage; do not change groundedness after hitting.',
    }),
    move('move-status-changes-excluded', 'mortalspin sparklingaria uproar', {
      processing:
        'Keep direct damage and the selected status; do not apply status changes, PP changes or turn/action locks.',
    }),
    ability('status-trigger', 'guts marvelscale quickfeet', {
      inputs: ['status'],
      scope: 'pokemon',
      defaults: { status: 'brn' },
      processing:
        'Selecting the ability sets its default status; allow explicit changes/clearing. No status damage or healing.',
    }),
    ability(
      'activation-default-on',
      'overgrow blaze torrent swarm flashfire electromorphosis stakeout',
      {
        inputs: ['abilityActive'],
        defaults: { abilityActive: true },
        processing:
          'Keep the chosen activation during repeated uses; OFF retains passive effects. Low-HP toggles do not change actual HP. Stakeout is opponent-local.',
      },
    ),
    ability('analytic-toggle', 'analytic', {
      implementation: 'implemented',
      inputs: ['abilityActive'],
      defaults: { abilityActive: false },
      scope: 'opponent',
      processing: 'Manual activation; do not infer from Speed.',
    }),
    ability('unburden-no-item', 'unburden', {
      implementation: 'implemented',
      inputs: ['abilityActive'],
      defaults: { abilityActive: true },
      processing:
        'When active (default), reject a held item. When inactive, allow a held item and keep the ability off.',
    }),
    ability('rivalry-toggle', 'rivalry', {
      inputs: ['rivalrySameGender'],
      scope: 'opponent',
      processing:
        'Same/different relation selects the modifier; do not request genders. Leave the ability blank for a neutral comparison.',
    }),
    ability('move-type-change', 'protean libero', {
      inputs: ['abilityActive', 'moveId'],
      defaults: { abilityActive: true },
      processing:
        'ON uses the selected move type as current Pokemon type for attack/defense; OFF uses original types. Prompt for a missing move.',
    }),
    ability('fixed-form', 'stancechange hungerswitch zerotohero', {
      inputs: [],
      processing:
        'Select the calculation form directly and keep it during repeated KO; no turn/switch history.',
    }),
    ability('disguise', 'disguise', {
      inputs: ['disguiseIntact'],
      defaults: { disguiseIntact: true },
      processing:
        'Absorb the first qualifying hit, apply the break HP loss, then process remaining hits with broken Disguise; preserve ability-bypass rules.',
    }),
    ability('hp-protection', 'multiscale sturdy terashell shadowshield', {
      inputs: [],
      processing:
        'Use the current HP for supported protection; update HP between hits. Sturdy survival affects KO, not the raw move damage rolls.',
    }),
    ability(
      'field-setter-excluded',
      'drizzle drought sandstream snowwarning sandspit electricsurge grassysurge mistysurge psychicsurge seedsower',
      {
        selection: 'excluded',
        inputs: [],
        processing:
          'Select the current field directly; do not simulate field-setting events.',
      },
    ),
    ability(
      'ability-change-excluded',
      'trace receiver powerofalchemy imposter mummy wanderingspirit',
      { selection: 'excluded', inputs: [] },
    ),
    ability('item-transfer-ability-excluded', 'magician pickpocket symbiosis', {
      selection: 'excluded',
      inputs: [],
    }),
    ability(
      'residual-only-excluded',
      'roughskin ironbarbs aftermath cheekpouch cudchew harvest raindish icebody poisonheal regenerator healer hospitality shedskin',
      { selection: 'excluded', inputs: [] },
    ),
  ],
};

function guaranteedRankChange(raw) {
  const hasSupportedBoost = (value) =>
    value && ['atk', 'def', 'spa', 'spd', 'spe'].some((stat) => value[stat]);
  return !!(
    hasSupportedBoost(raw?.self?.boosts) ||
    hasSupportedBoost(raw?.selfBoost?.boosts) ||
    raw?.id === 'clearsmog' ||
    [raw?.secondary, ...(raw?.secondaries ?? [])].some(
      (s) =>
        s &&
        (s.chance ?? 100) === 100 &&
        (hasSupportedBoost(s.boosts) || hasSupportedBoost(s.self?.boosts)),
    )
  );
}

export function applyProductRules(kind, id, classification, raw) {
  const matches = productRules.rules.filter(
    (r) =>
      r.kind === kind &&
      (r.ids?.includes(id) ||
        (r.category && r.category === classification.category) ||
        (r.sourceRule && classification.ruleIds.includes(r.sourceRule)) ||
        (r.guaranteedRankChange &&
          (id === 'clearsmog' || guaranteedRankChange(raw)))),
  );
  const excluded = matches.some((r) => r.selection === 'excluded');
  const inputs = [...new Set(matches.flatMap((r) => r.inputs ?? []))].sort();
  const defaults = Object.assign({}, ...matches.map((r) => r.defaults ?? {}));
  return {
    ...classification,
    requiredInputIds: excluded ? [] : inputs,
    productRuleIds: matches.map((r) => r.id),
    productPolicy: {
      selection: excluded
        ? 'excluded'
        : kind === 'ability'
          ? 'damage-or-speed-only'
          : 'included',
      implementation:
        matches.length > 0 &&
        matches.every((rule) => rule.implementation === 'implemented')
          ? 'implemented'
          : productRules.defaultImplementation,
      maximumUses: excluded
        ? 0
        : matches.some((r) => r.maximumUses === 1)
          ? 1
          : null,
      defaults: excluded ? {} : defaults,
    },
  };
}
