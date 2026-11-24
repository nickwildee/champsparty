// This is application metadata, not another battle engine. Rule IDs describe
// inputs/context and scope; they do not claim that a mechanic is implemented.
import { applyProductRules, productRules } from './champions-product-rules.mjs';
export { productRules };

export const conditionDefinitions = {
  'unresolved-context': {
    label: '원본 문맥 참조',
    inputs: [],
    policy: 'automatic',
    note: 'Source-context evidence is retained for engine diagnostics; use productRules for the current processing scope.',
  },
  'variable-hit-count': {
    label: '가변 연속기 타격 횟수',
    inputs: ['hitCount'],
    policy: 'approved',
    bounds:
      'Use the move-specific multihit range; ability/item exceptions also need validation.',
    defaults: {
      hitCount: 'move-maximum',
    },
    note: 'Select an integer within the move-specific range; fixed-count and Skill Link restrictions apply.',
  },
  'fixed-hit-count': {
    label: '고정 연속기',
    inputs: [],
    policy: 'automatic',
    note: 'Keep per-hit mechanics; a fixed hit count is not the number of move uses.',
  },
  'fainted-allies': {
    label: '쓰러진 아군 수',
    inputs: ['alliesFainted'],
    policy: 'approved',
    bounds: {
      min: 0,
      max: 5,
    },
    mechanicCaps: {
      supremeoverlord: 5,
      lastrespects: 100,
    },
    defaultValue: 0,
    note: 'Product input is 0–5 for both moves/abilities; the source Last Respects mechanic cap remains 100.',
  },
  'status-trigger': {
    label: '상태이상 선택',
    inputs: ['status'],
    policy: 'approved',
    defaultEnabled: true,
    defaultStatus: 'none',
    note: 'One status per Pokemon. A selected status-trigger ability assigns its required/default status; users may change or clear it. No status damage/healing or action-failure probability.',
  },
  'ability-activation': {
    label: '특성 발동 토글',
    inputs: ['abilityActive'],
    policy: 'approved',
    note: 'Default ON for the agreed activation abilities; Analytic defaults OFF. Active Unburden disables item input. See per-ability product rules.',
    defaultEnabled: true,
  },
  'low-hp-activation': {
    label: 'HP 조건 특성 발동 토글',
    inputs: ['abilityActive'],
    policy: 'approved',
    note: 'Default ON on ability selection; force only the activation effect while preserving the supplied initial HP.',
    defaultEnabled: true,
  },
  'existing-context': {
    label: '기존 입력·종 데이터로 결정',
    inputs: [],
    policy: 'automatic',
  },
  'final-ranks': {
    label: '랭크 변화는 최종 랭크에 포함',
    inputs: [],
    policy: 'approved',
    note: 'Do not reapply entry/event rank changes on top of the supplied final ranks. Preserve unrelated effects of the ability.',
  },
  'field-setting': {
    label: '날씨·필드 생성 효과',
    inputs: [],
    policy: 'excluded-from-selector',
    note: 'Field-setting abilities are not selected; use the opponent-local shared field inputs without simulating entry/hit events.',
  },
  'gender-condition': {
    label: '투쟁심 상대 관계',
    inputs: ['rivalrySameGender'],
    policy: 'approved',
    note: 'Manual same/different toggle; no gender inputs or automatic neutral-gender override. Leave ability blank for no modifier.',
  },
  'hits-taken': {
    label: '공격받은 누적 횟수',
    inputs: ['hitsTaken'],
    policy: 'approved',
    bounds: {
      min: 0,
      max: 6,
    },
    defaultValue: 0,
    note: 'Six hits already reaches the power cap.',
  },
  'stockpile-count': {
    label: '비축 횟수',
    inputs: ['stockpileCount'],
    policy: 'approved',
    bounds: {
      min: 0,
      max: 3,
    },
    defaultValue: 0,
    note: 'Zero is unusable. One-use result only; final ranks are entered separately.',
  },
  'party-composition': {
    label: '아군별 참여 조건·종족값',
    inputs: [],
    policy: 'excluded',
    note: 'Beat Up is excluded from the calculation selector.',
  },
  'turn-history': {
    label: '현재 턴·이전 행동의 조건',
    inputs: [],
    policy: 'approved',
    note: 'Per-move product rules distinguish default-OFF power toggles, assumed success and single-use results. No general battle-history input.',
  },
  'incoming-damage': {
    label: '직전에 받은 데미지와 공격 종류',
    inputs: ['opponentMoveId'],
    policy: 'approved-derived',
    note: 'Derive incoming damage from the linked opponent build and move. Prompt for a missing move; do not require defense comparison. Reflection results are single-use only.',
  },
  'random-power': {
    label: '기술 자체의 위력 분기',
    inputs: ['powerBoostEnabled'],
    policy: 'approved',
    note: 'Choose the strengthened branch manually and keep it on repeated uses; do not aggregate its activation probability.',
    defaultEnabled: false,
  },
  'copied-ability': {
    label: '복사한 특성',
    inputs: [],
    policy: 'excluded',
    note: 'Ability copying/exchanging/replacement is excluded.',
  },
  transformation: {
    label: '변신·폼 변화',
    inputs: [],
    policy: 'approved-scoped',
    note: 'Keep selected calculation forms fixed. Protean/Libero use a default-ON move-type toggle; Disguise has an intact toggle. Transform/Imposter are excluded.',
  },
  'repeat-state-change': {
    label: '반복 사용 중 상태 변화',
    inputs: [],
    policy: 'approved-scoped',
    note: 'Apply supported HP, item, screen/terrain and guaranteed-rank changes at their actual timing. Rank changes default ON. Exclude probabilistic rank/status changes, ability changes, item transfers and berry-eating effects; respect single-use limits.',
  },
  'repeated-use-power': {
    label: '연속 사용 위력 변화',
    inputs: [],
    policy: 'approved-in-principle',
    note: 'Track successive uses internally. Only implement for moves actually available in Champions.',
  },
  'delegated-move': {
    label: '다른 기술을 호출',
    inputs: [],
    policy: 'excluded',
    note: 'Copycat/Sleep Talk are excluded; choose the actual damaging move.',
  },
  'hp-dependent': {
    label: '현재 HP 의존',
    inputs: [],
    policy: 'approved-scoped',
    note: 'Start at the supplied HP and update remaining HP per outcome. Super Fang/Pain Split/Endeavor are excluded; Final Gambit is single-use only.',
  },
  'status-move': {
    label: '변화기',
    inputs: [],
    policy: 'outside-current-direct-damage-contract',
    note: 'Keep in the full learnset. Exclusion from the damage selector is separate from game availability.',
  },
  'secondary-effects': {
    label: '확률 부가효과',
    inputs: [],
    policy: 'probability-excluded',
    note: 'Keep deterministic first-hit damage modifiers; do not combine secondary-effect chances with KO damage randomness.',
  },
  'residual-effects': {
    label: '회복·턴 종료·반동 효과',
    inputs: [],
    policy: 'excluded-from-current-ko-contract',
    note: 'This tag does not discard other damage/stat effects of the same ability or move.',
  },
  'accuracy-effects': {
    label: '명중률·행동 가능성 효과',
    inputs: [],
    policy: 'accuracy-input-excluded',
  },
  'critical-effects': {
    label: '급소 관련 효과',
    inputs: [],
    policy: 'critical-input-excluded',
    note: 'No user critical toggle or probability aggregation; preserve intrinsic move mechanics supplied by the engine.',
  },
  'ally-only': {
    label: '아군을 요구하는 효과',
    inputs: [],
    policy: 'outside-singles-context',
    note: 'Apply only to strictly ally-only effects, not all hooks whose name contains Ally.',
  },
  'custom-damage': {
    label: '일반 위력식이 아닌 데미지',
    inputs: [],
    policy: 'approved-scoped',
    note: 'Native fixed-damage moves use engine data; linked reflection is single-use. OHKO moves and the three HP-manipulation exclusions are not selectable.',
  },
};

const moveGroups = [
  ['fainted-allies', 'lastrespects'],
  ['hits-taken', 'ragefist'],
  ['stockpile-count', 'spitup'],
  ['party-composition', 'beatup'],
  ['incoming-damage', 'counter mirrorcoat metalburst comeuppance'],
  ['random-power', 'ficklebeam'],
  [
    'turn-history',
    'assurance avalanche lashout stompingtantrum temperflare belch fakeout firstimpression lastresort focuspunch suckerpunch upperhand payback round',
  ],
  [
    'hp-dependent',
    'eruption waterspout flail reversal hardpress endeavor superfang finalgambit',
  ],
  [
    'custom-damage',
    'endeavor superfang finalgambit seismictoss nightshade fissure guillotine horndrill sheercold dragonrage sonicboom',
  ],
  [
    'existing-context',
    'acrobatics aurawheel bodypress foulplay shellsidearm electroball gyroball grassknot lowkick heatcrash heavyslam storedpower powertrip facade hex infernalparade barbbarrage venoshock weatherball terrainpulse risingvoltage expandingforce grassyglide gravapple solarbeam solarblade knockoff poltergeist fling steelroller flyingpress freezedry ragingbull mistyexplosion burnup doubleshock round',
  ],
  [
    'repeat-state-change',
    'knockoff fling bugbite pluck thief covet incinerate brickbreak psychicfangs ragingbull icespinner steelroller clearsmog sparklingaria burnup doubleshock electroshot meteorbeam poweruppunch fellstinger flamecharge rapidspin scaleshot closecombat leafstorm overheat dracometeor superpower hammerarm icehammer spinout vcreate gigatonhammer bloodmoon torchsong aquastep trailblaze acidarmor stockpile echoedvoice furycutter rollout iceball',
  ],
  ['final-ranks', 'electroshot meteorbeam'],
  ['repeated-use-power', 'echoedvoice furycutter rollout iceball'],
  [
    'residual-effects',
    'axekick highjumpkick supercellslam jumpkick steelbeam struggle finalgambit mistyexplosion explosion selfdestruct',
  ],
];

const abilityGroups = [
  [
    'status-trigger',
    'guts marvelscale quickfeet flareboost toxicboost poisonheal',
  ],
  ['low-hp-activation', 'overgrow blaze torrent swarm defeatist'],
  [
    'ability-activation',
    'flashfire unburden slowstart electromorphosis analytic stakeout',
  ],
  ['fainted-allies', 'supremeoverlord'],
  ['gender-condition', 'rivalry'],
  ['copied-ability', 'trace receiver powerofalchemy'],
  [
    'transformation',
    'imposter forecast disguise iceface shieldsdown schooling zenmode stancechange hungerswitch zerotohero protean libero gulpmissile terashift teraformzero',
  ],
  [
    'final-ranks',
    'intimidate download intrepidsword dauntlessshield defiant competitive guarddog angerpoint berserk battlebond eelevate moxie speedboost stamina weakarmor steadfast justified rattled sapsipper lightningrod stormdrain motordrive thermalexchange steamengine watercompaction windrider moody opportunist soulheart chillingneigh grimneigh embodyaspectteal embodyaspecthearthflame embodyaspectwellspring embodyaspectcornerstone supersweetsyrup',
  ],
  [
    'field-setting',
    'drizzle drought sandstream snowwarning sandspit electricsurge grassysurge mistysurge psychicsurge seedsower',
  ],
  [
    'existing-context',
    'chlorophyll swiftswim sandrush slushrush sandforce solarpower grasspelt surgesurfer forecast flowergift dryskin hydration raindish icebody sandveil snowcloak multiscale shadowshield sturdy galewings terashell heavymetal lightmetal skilllink parentalbond soundproof bulletproof flashfire eartheater waterabsorb voltabsorb levitate eelevate fluffy furcoat filter solidrock neuroforce technician strongjaw toughclaws sharpness ironfist megalauncher punkrock reckless sheerforce adaptability aerilate refrigerate pixilate dragonize firemane waterbubble hugepower purepower hustle heatproof thickfat infiltrator unaware scrappy neutralizinggas moldbreaker teravolt turboblaze poisonheal magicguard klutz magicbounce unnerve ripen stickyhold',
  ],
  [
    'residual-effects',
    'aftermath cheekpouch cudchew dryskin eartheater harvest hydration icebody raindish healer hospitality poisonheal regenerator roughskin ironbarbs liquidooze magicguard rockhead shedskin solarpower waterabsorb voltabsorb',
  ],
  [
    'secondary-effects',
    'effectspore flamebody poisonpoint poisontouch static stench serenegrace shielddust cursedbody cutecharm spicyspray',
  ],
  [
    'accuracy-effects',
    'compoundeyes sandveil snowcloak tangledfeet keeneye illuminate noguard hustle victorystar',
  ],
  ['critical-effects', 'battlearmor shellarmor sniper superluck'],
  [
    'ally-only',
    'friendguard healer hospitality symbiosis telepathy battery powerspot plus minus receiver powerofalchemy',
  ],
  [
    'repeat-state-change',
    'mummy wanderingspirit magician pickpocket symbiosis gulpmissile hungerswitch parentalbond sandspit seedsower',
  ],
];

const historyDependencies = {
  assurance: ['target.damagedThisTurn'],
  avalanche: ['user.hitByTargetThisTurn'],
  lashout: ['user.statLoweredThisTurn'],
  stompingtantrum: ['user.previousMoveFailed'],
  temperflare: ['user.previousMoveFailed'],
  belch: ['user.berryConsumed'],
  fakeout: ['user.firstTurnOnField'],
  firstimpression: ['user.firstTurnOnField'],
  lastresort: ['user.otherKnownMoves', 'user.otherMovesUsedSinceEntry'],
  focuspunch: ['user.damagedBeforeActing'],
  suckerpunch: ['target.chosenMove', 'target.actedThisTurn'],
  upperhand: ['target.chosenMovePriority', 'target.actedThisTurn'],
  payback: ['relativeActionOrder'],
  round: ['otherPokemon.chosenMove', 'relativeActionOrder'],
};

function addGroups(rules, id, groups) {
  for (const [rule, ids] of groups)
    if (ids.split(' ').includes(id)) rules.add(rule);
}

function functionText(value, depth = 0) {
  if (typeof value === 'function') return value.toString();
  if (!value || typeof value !== 'object' || depth > 4) return '';
  return Object.values(value)
    .map((child) => functionText(child, depth + 1))
    .join('\n');
}

function sourceSignals(raw) {
  const text = functionText(raw);
  const patterns = {
    hp: /\.(?:hp|maxhp)\b/,
    status: /\.status\b|hasStatus\(/,
    field: /this\.field\b|\.isWeather\(|\.isTerrain\(|\.effectiveWeather\(/,
    ranks: /\.boosts\b|\.boost\(/,
    item: /\.item\b|hasItem\(|\.takeItem\(|\.useItem\(|\.eatItem\(/,
    ability: /\.ability\b|hasAbility\(|\.setAbility\(/,
    weight: /\.getWeight\(|\.weightkg\b/,
    gender: /\.gender\b/,
    party: /\.side\.(?:pokemon|totalFainted)\b/,
    volatileState: /\.volatiles\b/,
    actionHistory:
      /activeMoveActions|moveLastTurnResult|lastMove|attackedBy|hurtThisTurn|timesAttacked|timesHit/,
  };
  return Object.entries(patterns)
    .filter(([, pattern]) => pattern.test(text))
    .map(([name]) => name);
}

export function classifyMove(move, raw) {
  const rules = new Set();
  const extras = { category: move.category };
  if (move.category === 'Status') {
    rules.add('status-move');
    // Nature Power selects a damaging move, so it is not silently treated as harmless.
    if (
      [
        'naturepower',
        'sleeptalk',
        'metronome',
        'copycat',
        'assist',
        'mirrormove',
        'mefirst',
      ].includes(move.id)
    ) {
      rules.add('existing-context');
      rules.add('delegated-move');
      extras.mechanicNote =
        'Status-category move may delegate to another move; requires separate damage-contract review.';
    }
  } else {
    addGroups(rules, move.id, moveGroups);
    if (move.multihit) {
      const selectableHits = Array.isArray(move.multihit) || move.multiaccuracy;
      rules.add(selectableHits ? 'variable-hit-count' : 'fixed-hit-count');
      extras.hitCount = Array.isArray(move.multihit)
        ? { min: move.multihit[0], max: move.multihit[1] }
        : move.multiaccuracy
          ? { min: 1, max: move.multihit, countsSuccessfulHits: true }
          : { fixed: move.multihit };
    }
    if (move.damage !== undefined || raw?.damageCallback || move.ohko)
      rules.add('custom-damage');
    if (raw?.secondary || raw?.secondaries) rules.add('secondary-effects');
    if (move.recoil || move.drain || move.selfdestruct || move.mindBlownRecoil)
      rules.add('residual-effects');
    if (raw?.self?.boosts || raw?.self?.onHit || raw?.selfBoost?.boosts)
      rules.add('repeat-state-change');
    if (move.willCrit || (move.critRatio || 1) > 1)
      rules.add('critical-effects');
    if (!rules.size) rules.add('existing-context');
  }
  if (historyDependencies[move.id])
    extras.historyDependencies = historyDependencies[move.id];
  if (
    move.category !== 'Status' &&
    ![...rules].some((id) =>
      [
        'turn-history',
        'stockpile-count',
        'hits-taken',
        'party-composition',
        'fainted-allies',
        'repeat-state-change',
        'incoming-damage',
        'random-power',
      ].includes(id),
    )
  ) {
    if (
      sourceSignals(raw).some((signal) =>
        ['actionHistory', 'volatileState', 'party', 'gender'].includes(signal),
      )
    )
      rules.add('unresolved-context');
  }
  if (move.id === 'lastrespects')
    extras.knownEngineGap =
      'Installed Champions mechanics do not use alliesFainted for Last Respects; see the comparison probe.';
  if (move.id === 'ragefist')
    extras.knownEngineGap =
      'The current app has no hitsTaken input, and the installed Champions mechanics have no Rage Fist counter branch.';
  if (move.id === 'spitup')
    extras.knownEngineGap =
      'The app has no stockpile input; verify the engine adapter before enabling this move.';
  if (move.id === 'beatup')
    extras.mechanicNote =
      'Party member base Attack and eligibility are needed for each hit; generic 2-5 hit input is insufficient.';
  if (move.id === 'ficklebeam')
    extras.mechanicNote =
      'The move-power random branch is separate from the 16 damage random rolls.';
  if (['hardpress', 'superfang', 'endeavor'].includes(move.id))
    extras.mechanicNote =
      'Recompute using remaining HP for repeated attacks; do not repeat the initial damage array.';
  return applyProductRules(
    'move',
    move.id,
    { ...extras, ruleIds: [...rules].sort() },
    raw,
  );
}

export function classifyAbility(ability, raw) {
  const rules = new Set();
  addGroups(rules, ability.id, abilityGroups);
  if (!rules.size) rules.add('existing-context');
  const extras = {};
  if (rules.has('status-trigger'))
    extras.defaultStatus = ['toxicboost', 'poisonheal'].includes(ability.id)
      ? 'psn'
      : 'brn';
  if (rules.has('low-hp-activation'))
    extras.knownEngineGap =
      'Engine checks actual HP; an activation-only adapter is needed to preserve the supplied HP.';
  if (ability.id === 'supremeoverlord')
    extras.counterSemantics =
      'Faint count is captured on entry, capped at 5; Last Respects reads cumulative faints. Same UI quantity does not imply identical timing semantics.';
  if (ability.id === 'unburden')
    extras.mechanicNote =
      'Unburden defaults to active with no held item; switching it off allows a held item.';
  if (ability.id === 'poisonheal')
    extras.mechanicNote =
      'Poison and toxic poison are diagnostic inputs for the original ability. Its end-of-turn recovery is excluded from the product; no selectable ability or automatic poison status.';
  if (
    ['disguise', 'iceface', 'multiscale', 'sturdy', 'terashell'].includes(
      ability.id,
    )
  ) {
    rules.add('repeat-state-change');
    extras.mechanicNote =
      'First-hit protection/full-HP effects may change after damage; single-hit support does not prove exact multi-hit/KO support.';
  }
  return applyProductRules(
    'ability',
    ability.id,
    { ...extras, ruleIds: [...rules].sort() },
    raw,
  );
}
