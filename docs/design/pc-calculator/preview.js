// Fixed, neutral-field examples for layout review. Editing does not run the damage engine.
const dex = {
  445: {
    name: '한카리아스',
    types: ['드래곤', '땅'],
    tint: '#e4dff5',
    nature: '명랑',
    ability: '없음',
    item: '없음',
    moves: ['지진', '드래곤클로'],
    points: [2, 32, 0, 0, 0, 32],
    stats: [185, 182, 115, 90, 105, 169],
  },
  10076: {
    name: '메가 메타그로스',
    types: ['강철', '에스퍼'],
    tint: '#e3eaf4',
    nature: '장난꾸러기',
    ability: '단단한발톱',
    item: '메타그로스나이트',
    moves: ['냉동펀치', '코멧펀치'],
    points: [20, 0, 20, 0, 0, 26],
    stats: [175, 165, 209, 112, 130, 156],
    results: [
      ['확정 2타', '102–120 · 58.3–68.6%'],
      ['확정 1타', '212–252 · 114.6–136.2%'],
    ],
  },
  450: {
    name: '하마돈',
    types: ['땅'],
    tint: '#f1e7d4',
    nature: '장난꾸러기',
    ability: '없음',
    item: '없음',
    moves: ['지진', '깨물어부수기'],
    points: [32, 0, 32, 0, 2, 0],
    stats: [215, 132, 187, 79, 94, 67],
    results: [
      ['확정 4타', '55–66 · 25.6–30.7%'],
      ['확정 3타', '66–78 · 35.7–42.2%'],
    ],
  },
  730: {
    name: '누리레느',
    types: ['물', '페어리'],
    tint: '#dbf0f0',
    nature: '조심',
    ability: '없음',
    item: '없음',
    moves: ['문포스', '하이드로펌프'],
    points: [32, 0, 2, 32, 0, 0],
    stats: [187, 84, 96, 195, 136, 80],
    results: [
      ['확정 2타', '108–127 · 57.8–67.9%'],
      ['확정 1타', '200–236 · 108.1–127.6%'],
    ],
  },
  823: {
    name: '아머까오',
    types: ['비행', '강철'],
    tint: '#e4e7ef',
    nature: '장난꾸러기',
    ability: '없음',
    item: '없음',
    moves: ['브레이브버드', '유턴'],
    points: [32, 0, 32, 0, 2, 0],
    stats: [205, 107, 172, 65, 107, 87],
    results: [
      ['무효', '0 · 0%'],
      ['확정 3타', '64–76 · 34.6–41.1%'],
    ],
  },
};
const typeClass = {
  드래곤: 'dragon',
  땅: 'ground',
  강철: 'steel',
  에스퍼: 'psychic',
  물: 'water',
  페어리: 'fairy',
  비행: 'flying',
};
const art = (id) => 'artwork/' + id + '.png';
const types = (id) =>
  '<span class="types">' +
  dex[id].types
    .map((t) => '<span class="type t-' + typeClass[t] + '">' + t + '</span>')
    .join('') +
  '</span>';
const labels = ['HP', '공격', '방어', '특공', '특방', '스피드'];
const purposes = ['공격', '방어', '스피드'];
const wallNames = ['리플렉터', '빛의장막', '오로라베일'];
const $ = (selector) => document.querySelector(selector);
let own, opponents, expanded, pickerTarget;

function build(id) {
  const d = dex[id];
  return {
    id,
    nature: d.nature,
    ability: d.ability,
    item: d.item,
    move: d.moves[0],
    points: [...d.points],
    ranks: [0, 0, 0, 0, 0, 0],
    hp: 100,
    status: '없음',
    weather: '없음',
    terrain: '없음',
    flags: {},
    modes: [true, true, true],
    extra: false,
  };
}
function initial() {
  own = build(445);
  opponents = [10076, 450, 730].map(build);
  expanded = null;
  render();
}
function exactBuild(b) {
  const d = dex[b.id];
  return (
    b.nature === d.nature &&
    b.ability === d.ability &&
    b.item === d.item &&
    b.move === d.moves[0] &&
    b.points.every((v, i) => v === d.points[i]) &&
    b.ranks.every((v) => v === 0) &&
    b.hp === 100 &&
    b.status === '없음' &&
    b.weather === '없음' &&
    b.terrain === '없음' &&
    !Object.values(b.flags).some(Boolean)
  );
}
function option(value, selected) {
  return (
    '<option' +
    (value === selected ? ' selected' : '') +
    '>' +
    value +
    '</option>'
  );
}
function selectField(label, key, values, b) {
  return (
    '<label class="control"><span>' +
    label +
    '</span><select class="select" data-field="' +
    key +
    '">' +
    [...new Set(values)].map((v) => option(v, b[key])).join('') +
    '</select></label>'
  );
}
function statTable(b) {
  const total = b.points.reduce((a, v) => a + v, 0);
  const points = b.points
    .map(
      (v, i) =>
        '<td><input type="number" min="0" max="32" step="1" data-point="' +
        i +
        '" aria-label="' +
        labels[i] +
        ' 포인트" value="' +
        v +
        '"></td>',
    )
    .join('');
  const ranks = b.ranks
    .map((v, i) =>
      i === 0
        ? '<td class="na">—</td>'
        : '<td><select aria-label="' +
          labels[i] +
          ' 시작 랭크" data-rank="' +
          i +
          '">' +
          Array.from(
            { length: 13 },
            (_, n) =>
              '<option value="' +
              (n - 6) +
              '"' +
              (n - 6 === v ? ' selected' : '') +
              '>' +
              (n > 6 ? '+' : '') +
              (n - 6) +
              '</option>',
          ).join('') +
          '</select></td>',
    )
    .join('');
  const rawValid =
    b.nature === dex[b.id].nature &&
    b.points.every((v, i) => v === dex[b.id].points[i]);
  return (
    '<div class="block-heading"><h4>능력치 배분</h4><span class="budget"><b>' +
    total +
    '</b> / 66 포인트</span></div><table class="stats"><thead><tr><th></th>' +
    labels.map((v) => '<th scope="col">' + v + '</th>').join('') +
    '</tr></thead><tbody><tr><th scope="row">포인트</th>' +
    points +
    '</tr><tr><th scope="row">시작 랭크</th>' +
    ranks +
    '</tr><tr class="value"><th scope="row">실수치</th>' +
    dex[b.id].stats
      .map((v) => '<td>' + (rawValid ? v : '—') + '</td>')
      .join('') +
    '</tr></tbody></table>'
  );
}
function setupFields(b, includeMove) {
  const d = dex[b.id];
  return (
    '<div class="fields">' +
    selectField(
      '성격',
      'nature',
      [d.nature, '명랑', '장난꾸러기', '조심', '고집'],
      b,
    ) +
    selectField('특성', 'ability', [d.ability, '없음'], b) +
    selectField(
      '도구',
      'item',
      [d.item, '없음', '구애스카프', '생명의구슬', '검은철구', '반감열매'],
      b,
    ) +
    (includeMove ? selectField('기술', 'move', d.moves, b) : '') +
    '</div>'
  );
}
function vitals(b) {
  return (
    '<div class="vitals"><div class="health"><div class="health-head"><span>현재 HP</span><label class="hp-box"><input class="hp-number" aria-label="현재 HP 퍼센트 직접 입력" type="number" min="1" max="100" value="' +
    b.hp +
    '">%</label></div><input type="range" min="1" max="100" value="' +
    b.hp +
    '" style="--v:' +
    b.hp +
    '%" class="hp-range" aria-label="현재 HP 슬라이더"></div>' +
    selectField(
      '상태이상',
      'status',
      ['없음', '화상', '마비', '독', '맹독', '수면', '얼음'],
      b,
    ) +
    '</div>'
  );
}
function renderOwn() {
  const d = dex[own.id];
  $('#own').innerHTML =
    '<div class="card" data-owner="own"><div class="hero"><img class="hero-art" alt="" src="' +
    art(own.id) +
    '"><div class="hero-info"><button class="hero-change" data-pick="own">포켓몬 · 폼 변경 <span>⌄</span></button><h3>' +
    d.name +
    '</h3>' +
    types(own.id) +
    '</div></div><div class="own-body">' +
    setupFields(own, true) +
    '<hr class="sep">' +
    statTable(own) +
    '<hr class="sep">' +
    vitals(own) +
    '</div></div>' +
    '<div class="own-metrics" aria-label="세팅 지표, 배치 예시"><div><small>기술 결정력</small><b>' +
    (own.id === 445 && exactBuild(own) ? '27,300' : '—') +
    '</b></div><div><small>물리내구</small><b>—</b></div><div><small>특수내구</small><b>—</b></div></div>';
}
function metric(b, i, valid) {
  let values = dex[b.id].results?.[i];
  if (i === 2) {
    const ownSpeed = dex[own.id].stats[5];
    const opponentSpeed = dex[b.id].stats[5];
    let label = '동속';
    if (ownSpeed > opponentSpeed) label = '내가 빠름';
    else if (ownSpeed < opponentSpeed) label = '내가 느림';
    values = [label, `${ownSpeed} vs ${opponentSpeed}`];
  }
  let value = '—',
    detail = '세팅 변경';
  if (!b.modes[i]) detail = '비교 해제';
  else if (valid && values) [value, detail] = values;
  const title = ['공격 · ' + own.move, '방어 · ' + b.move, '스피드'][i];
  return (
    '<div class="metric ' +
    ['atk', 'def', 'spd'][i] +
    (value === '—' ? ' blank' : '') +
    '"><span class="metric-title"><i></i>' +
    title +
    '</span><strong class="metric-value">' +
    value +
    '</strong><span class="metric-detail">' +
    detail +
    '</span></div>'
  );
}
function toggle(label, attr, checked) {
  return (
    '<label class="toggle"><input type="checkbox" ' +
    attr +
    (checked ? ' checked' : '') +
    '>' +
    label +
    '</label>'
  );
}
function wallSet(title, side, b) {
  return (
    '<fieldset class="wallset"><legend>' +
    title +
    '</legend><div class="wall-opts">' +
    wallNames
      .map((name, i) =>
        toggle(name, 'data-flag="' + side + i + '"', b.flags[side + i]),
      )
      .join('') +
    '</div></fieldset>'
  );
}
function environment(b) {
  return (
    '<div class="environment"><h4 class="env-heading">배틀 조건</h4><div class="fields">' +
    selectField(
      '날씨',
      'weather',
      ['없음', '쾌청', '비', '모래바람', '눈'],
      b,
    ) +
    selectField(
      '필드',
      'terrain',
      ['없음', '일렉트릭필드', '그래스필드', '사이코필드', '미스트필드'],
      b,
    ) +
    '</div>' +
    wallSet('내 쪽 벽', 'own', b) +
    wallSet('상대 쪽 벽', 'op', b) +
    '<details class="extra"' +
    (b.extra ? ' open' : '') +
    '><summary>추가 필드<i class="chev"></i></summary><div class="extra-options">' +
    toggle('중력', 'data-flag="gravity"', b.flags.gravity) +
    toggle('트릭룸', 'data-flag="room"', b.flags.room) +
    '</div></details><button class="remove" data-remove>상대 목록에서 제거</button></div>'
  );
}
function editor(b, index) {
  return (
    '<div class="editor" id="editor-' +
    index +
    '"><div class="editor-top"><h4>상대 설정 <button class="quiet" data-pick="' +
    index +
    '">포켓몬 · 폼 변경</button></h4><fieldset class="modes"><legend>비교 목적</legend>' +
    purposes
      .map((p, i) => toggle(p, 'data-mode="' + i + '"', b.modes[i]))
      .join(' ') +
    '</fieldset></div><div class="editor-cols"><div>' +
    setupFields(b, b.modes[1]) +
    '<hr class="sep">' +
    statTable(b) +
    '<hr class="sep">' +
    vitals(b) +
    '</div>' +
    environment(b) +
    '</div></div>'
  );
}
function renderOpponents() {
  $('#count').textContent = opponents.length;
  $('#opponents').innerHTML =
    opponents
      .map((b, index) => {
        const d = dex[b.id],
          isOpen = expanded === index;
        const valid = own.id === 445 && exactBuild(own) && exactBuild(b);
        return (
          '<article class="card opponent' +
          (isOpen ? ' open' : '') +
          '" data-owner="' +
          index +
          '"><div class="op-head"><div class="op-picture" style="--tint:' +
          d.tint +
          '"><img alt="" src="' +
          art(b.id) +
          '"></div><div class="op-name"><h3>' +
          d.name +
          '</h3>' +
          types(b.id) +
          '</div><button class="open-button" data-expand="' +
          index +
          '" aria-expanded="' +
          isOpen +
          '" aria-label="' +
          d.name +
          ' 상세 설정">' +
          (isOpen ? '접기' : '상세 설정') +
          '<i class="chev"></i></button></div><div class="metrics">' +
          [0, 1, 2].map((i) => metric(b, i, valid)).join('') +
          '</div>' +
          (isOpen ? editor(b, index) : '') +
          '</article>'
        );
      })
      .join('') || '<div class="empty">비교할 상대를 추가하세요.</div>';
}
function render() {
  renderOwn();
  renderOpponents();
}
function ownerOf(el) {
  const ref = el.closest('[data-owner]')?.dataset.owner;
  return ref === 'own' ? own : opponents[Number(ref)];
}
function fillChoices() {
  const filter = $('#search').value.trim().replaceAll(' ', '');
  const list = Object.entries(dex).filter(
    ([id, d]) =>
      d.name.replaceAll(' ', '').includes(filter) &&
      (pickerTarget !== 'add' || !opponents.some((b) => b.id === Number(id))),
  );
  $('#choices').innerHTML =
    list
      .map(
        ([id, d]) =>
          '<button class="choice" data-choice="' +
          id +
          '"><img src="' +
          art(id) +
          '" alt="">' +
          d.name +
          '</button>',
      )
      .join('') || '<p>선택할 수 있는 포켓몬이 없습니다.</p>';
}
function showPicker(target) {
  pickerTarget = target;
  $('#picker-title').textContent =
    target === 'add' ? '비교할 상대 추가' : '포켓몬 · 폼 변경';
  $('#search').value = '';
  fillChoices();
  $('#picker').showModal();
  $('#search').focus();
}
document.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.id === 'reset') {
    initial();
    return;
  }
  if (button.id === 'add') {
    showPicker('add');
    return;
  }
  if (button.hasAttribute('data-pick')) {
    showPicker(button.dataset.pick);
    return;
  }
  if (button.hasAttribute('data-choice')) {
    const b = build(Number(button.dataset.choice));
    if (pickerTarget === 'add') {
      opponents.push(b);
      expanded = opponents.length - 1;
    } else if (pickerTarget === 'own') own = b;
    else opponents[Number(pickerTarget)] = b;
    $('#picker').close();
    render();
    return;
  }
  if (button.hasAttribute('data-expand')) {
    const i = Number(button.dataset.expand);
    expanded = expanded === i ? null : i;
    renderOpponents();
    document
      .querySelector('[data-expand="' + i + '"]')
      .focus({ preventScroll: true });
    return;
  }
  if (button.hasAttribute('data-remove')) {
    opponents.splice(expanded, 1);
    expanded = null;
    renderOpponents();
  }
});
document.addEventListener(
  'toggle',
  (event) => {
    if (event.target.matches('details.extra'))
      ownerOf(event.target).extra = event.target.open;
  },
  true,
);
$('#search').addEventListener('input', fillChoices);
$('#search').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    $('#choices .choice')?.click();
  }
});
document.addEventListener('input', (event) => {
  const el = event.target;
  if (!el.matches('.hp-number,.hp-range')) return;
  const v = el.valueAsNumber;
  if (!Number.isInteger(v) || v < 1 || v > 100) return;
  const health = el.closest('.health');
  health.querySelector('.hp-number').value = v;
  const slider = health.querySelector('.hp-range');
  slider.value = v;
  slider.style.setProperty('--v', v + '%');
});
document.addEventListener('change', (event) => {
  const el = event.target,
    b = ownerOf(el);
  if (!b) return;
  if (el.dataset.field) b[el.dataset.field] = el.value;
  else if ('point' in el.dataset) {
    const i = Number(el.dataset.point);
    const room =
      66 - b.points.reduce((sum, v, j) => sum + (j === i ? 0 : v), 0);
    b.points[i] = Math.min(
      32,
      room,
      Math.max(0, Math.trunc(el.valueAsNumber || 0)),
    );
  } else if ('rank' in el.dataset)
    b.ranks[Number(el.dataset.rank)] = Number(el.value);
  else if ('flag' in el.dataset) b.flags[el.dataset.flag] = el.checked;
  else if ('mode' in el.dataset) {
    if (!el.checked && b.modes.filter(Boolean).length === 1) {
      el.checked = true;
      return;
    }
    b.modes[Number(el.dataset.mode)] = el.checked;
  } else if (el.matches('.hp-number,.hp-range'))
    b.hp = Math.min(100, Math.max(1, Math.round(el.valueAsNumber || b.hp)));
  else return;
  render();
});
initial();
