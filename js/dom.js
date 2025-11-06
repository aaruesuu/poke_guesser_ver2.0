import { allPokemonData } from "./all-pokemon-data.js";
import {
  formatDisplayName,
  normalizePokemonName,
  formatDebut,
  formatGenderRate,
} from "./utils.js";
  
const allPokemonNames = Object.keys(allPokemonData);

const modeSelectionScreen = document.getElementById('mode-selection-screen');
const gameContainer = document.getElementById('game-container');

const classicModeButton = document.getElementById('classic-mode-button');
const randomStartModeButton = document.getElementById('random-start-mode-button');
const statsModeButton = document.getElementById('base-stats-mode-button');
const versusModeButton = document.getElementById('versus-mode-button');

const guessButton = document.getElementById('guess-button');
const homeButton = document.getElementById('home-button');

const howToPlayButton = document.getElementById('how-to-play-button');
const howToPlayButtonHome = document.getElementById('how-to-play-button-home');
const aboutSiteButton = document.getElementById('about-site-button');

const modalOverlay = document.getElementById('modal-overlay');
const modalContent = document.getElementById('modal-content');
const modalCloseButton = document.getElementById('modal-close-button');

const resultModalOverlay = document.getElementById('result-modal-overlay');
const resultModal = document.getElementById('result-modal');
const resultModalCloseButton = document.getElementById('result-modal-close-button');

const hamburgerMenu = document.getElementById('hamburger-menu');
const navMenu = document.getElementById('nav-menu');

const guessInput = document.getElementById('guess-input');
const resultHistory = document.getElementById('result-history');
const gameControls = document.getElementById('game-controls');
const inputArea = document.getElementById('input-area');
const suggestionsBox = document.getElementById('suggestions-box');
const randomStartButton = document.getElementById('random-start-button');

const postGamePlayAgainButton = document.getElementById('post-game-play-again');
const postGameBackToMenuButton = document.getElementById('post-game-back-to-menu');
const gameTitle = document.getElementById('game-title');
const gameStatus = document.getElementById('game-status');

let resultAccordionSeq = 0;

function toggleAccordion(btn) {
  if (!btn) return;
  const panelId = btn.getAttribute('aria-controls');
  const panel = document.getElementById(panelId);
  if (!panel) return;

  const expanded = btn.getAttribute('aria-expanded') === 'true';
  const next = !expanded;
  btn.setAttribute('aria-expanded', String(next));

  if (next) {
    panel.hidden = false;
    panel.style.maxHeight = panel.scrollHeight + 'px';
  } else {
    panel.style.maxHeight = '0px';
    setTimeout(() => { panel.hidden = true; }, 200);
  }
}

export function initDOM(handlers) {
  const { onStartClassic, onStartRandom, onStartStats, onGuess, onRandomStart, onPlayAgain, onBackToMenu } = handlers;

  if (hamburgerMenu && navMenu) {
    hamburgerMenu.addEventListener('click', () => {
      hamburgerMenu.classList.toggle('is-active');
      navMenu.classList.toggle('is-active');
    });
    navMenu.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        hamburgerMenu.classList.remove('is-active');
        navMenu.classList.remove('is-active');
      });
    });
  }

  if (classicModeButton) classicModeButton.addEventListener('click', onStartClassic);
  if (randomStartModeButton) randomStartModeButton.addEventListener('click', onStartRandom);
  if (statsModeButton) statsModeButton.addEventListener('click', onStartStats);
  if (versusModeButton && handlers.onStartVersus) versusModeButton.addEventListener('click', handlers.onStartVersus);
  if (randomStartButton) randomStartButton.addEventListener('click', onRandomStart);
  if (guessButton) guessButton.addEventListener('click', onGuess);
  if (homeButton) homeButton.addEventListener('click', onBackToMenu);
  if (postGamePlayAgainButton) postGamePlayAgainButton.addEventListener('click', onPlayAgain);
  if (postGameBackToMenuButton) postGameBackToMenuButton.addEventListener('click', onBackToMenu);

  if (guessInput) guessInput.addEventListener('input', handleInput);
  document.addEventListener('click', (event) => {
    if (!gameControls.contains(event.target)) {
      suggestionsBox.classList.add('hidden');
    }
  });

  if (howToPlayButton) howToPlayButton.addEventListener('click', openHowToPlayModal);
  if (howToPlayButtonHome) howToPlayButtonHome.addEventListener('click', openHowToPlayModal);

  if (modalCloseButton) modalCloseButton.addEventListener('click', closeModal);
  if (modalOverlay) modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });

  if (resultModalCloseButton) {
    resultModalCloseButton.addEventListener('click', () => {
      resultModalOverlay.classList.add('hidden');
      const el = document.getElementById('post-game-actions');
      if (el) el.classList.remove('hidden');
    });
  }
  if (resultModalOverlay) {
    resultModalOverlay.addEventListener('click', (e) => {
      if (e.target === resultModalOverlay) {
        resultModalOverlay.classList.add('hidden');
        const el = document.getElementById('post-game-actions');
        if (el) el.classList.remove('hidden');
      }
    });
  }
}
  
export function switchScreen(targetScreen) {
  const screens = [modeSelectionScreen, gameContainer];
  screens.forEach(screen => {
    if (screen.id === targetScreen) {
      screen.classList.remove('hidden');
    } else {
      screen.classList.add('hidden');
    }
  });
}
  
export function setGameStatus(text) { gameStatus.textContent = text || ""; }
export function setGameTitle(text) { gameTitle.textContent = text || ""; }
export function updateStatusUI(text) { gameStatus.textContent = text || ""; }

export function renderResult(pokemon, comparisonResult, gameMode, isCorrect = false) {
  const row = document.createElement('div');
  row.classList.add('result-row');
  row.classList.add(gameMode === 'stats' ? 'result-row-stats' : 'result-row-classic');

  if (isCorrect) {
    row.id = 'result-history-correct';
    row.classList.add('is-correct');
  }

  // --- ヘッダー ---
  const { main: mainName, form: formName } = formatDisplayName(pokemon.name);
  const displayNameHTML = formName ? `${mainName}<br><span class="form-name">${formName}</span>` : mainName;

  // button化し、モーダルと同じ構造に
  const header = document.createElement('button');
  header.type = 'button';
  const accId = `rh-acc-${++resultAccordionSeq}`;
  const panelId = `${accId}-panel`;

  header.classList.add('result-header', 'accordion-trigger');
  // 既存アコーディオンの属性を流用
  header.setAttribute('id', accId);
  header.setAttribute('aria-controls', panelId);
  header.setAttribute('aria-expanded','true'); // ← 基本開く

  header.innerHTML = `
    <img src="${pokemon.sprite}" alt="${pokemon.name}" class="result-sprite">
    <div class="result-name">${displayNameHTML}</div>
  `;

  // アイコン（既存CSSが回転制御）
  const icon = document.createElement('span');
  icon.className = 'accordion-icon';
  icon.setAttribute('aria-hidden','true');
  header.appendChild(icon);

  row.appendChild(header);

  // 初回だけ既存アコーディオン初期化 → 以後も同じ挙動で利用
  if (!resultHistory.dataset.accordionReady) {
    setupAccordion(resultHistory);
    resultHistory.dataset.accordionReady = "1";
  }

  // クリック/Enter/Spaceで開閉（既存のトグルを利用）
  header.addEventListener('click', () => toggleAccordion(header));
  header.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleAccordion(header);
    }
  });

  // const { main: mainName, form: formName } = formatDisplayName(pokemon.name);
  // const displayNameHTML = formName ? `${mainName}<br><span class="form-name">${formName}</span>` : mainName;
  // const header = document.createElement('div');
  // header.classList.add('result-header');
  // header.innerHTML = `
  //   <img src="${pokemon.sprite}" alt="${pokemon.name}" class="result-sprite">
  //   <div class="result-name">${displayNameHTML}</div>
  // `;
  // row.appendChild(header);

  // --- ボディ ---
  // bodyContainer.classList.add('result-body');
  const bodyContainer = document.createElement('div');
  bodyContainer.classList.add('result-body', 'accordion-panel');

  bodyContainer.setAttribute('id', panelId);
  bodyContainer.setAttribute('role','region');
  bodyContainer.setAttribute('aria-labelledby', accId);

  const formatCombinedField = (items) => {
    const filtered = items.filter(item => item && item !== 'なし');
    return filtered.length > 0 ? filtered.join(' / ') : '—';
  };

  const totalStats =
    pokemon.stats.hp + pokemon.stats.attack + pokemon.stats.defense +
    pokemon.stats.spAttack + pokemon.stats.spDefense + pokemon.stats.speed;

  if (gameMode === 'stats') {
    // 種族値
    bodyContainer.innerHTML = `
      <div class="${comparisonResult.stats.hp.class}">
        <div class="value-wrapper"><span>${pokemon.stats.hp}</span><span class="${comparisonResult.stats.hp.symbolClass}">${comparisonResult.stats.hp.symbol}</span></div>
      </div>
      <div class="${comparisonResult.stats.attack.class}">
        <div class="value-wrapper"><span>${pokemon.stats.attack}</span><span class="${comparisonResult.stats.attack.symbolClass}">${comparisonResult.stats.attack.symbol}</span></div>
      </div>
      <div class="${comparisonResult.stats.defense.class}">
        <div class="value-wrapper"><span>${pokemon.stats.defense}</span><span class="${comparisonResult.stats.defense.symbolClass}">${comparisonResult.stats.defense.symbol}</span></div>
      </div>
      <div class="${comparisonResult.stats.spAttack.class}">
        <div class="value-wrapper"><span>${pokemon.stats.spAttack}</span><span class="${comparisonResult.stats.spAttack.symbolClass}">${comparisonResult.stats.spAttack.symbol}</span></div>
      </div>
      <div class="${comparisonResult.stats.spDefense.class}">
        <div class="value-wrapper"><span>${pokemon.stats.spDefense}</span><span class="${comparisonResult.stats.spDefense.symbolClass}">${comparisonResult.stats.spDefense.symbol}</span></div>
      </div>
      <div class="${comparisonResult.stats.speed.class}">
        <div class="value-wrapper"><span>${pokemon.stats.speed}</span><span class="${comparisonResult.stats.speed.symbolClass}">${comparisonResult.stats.speed.symbol}</span></div>
      </div>
    `;
  } else {
    // クラシック/ランダム
    bodyContainer.innerHTML = `
      <div class="${comparisonResult.debut.class}">
        <div class="value-wrapper">
          <span>${formatDebut(pokemon.debutGen, pokemon.debutTitle)}</span>
          <span class="${comparisonResult.debut.symbolClass}">${comparisonResult.debut.symbol}</span>
        </div>
      </div>
      <div class="${comparisonResult.totalStats.class}">
        <div class="value-wrapper"><span>${totalStats}</span><span class="${comparisonResult.totalStats.symbolClass}">${comparisonResult.totalStats.symbol}</span></div>
      </div>
      <div class="${comparisonResult.types} full-width">${formatCombinedField([pokemon.type1, pokemon.type2])}</div>
      <div class="${comparisonResult.abilities} full-width">${formatCombinedField([pokemon.ability1, pokemon.ability2, pokemon.hiddenAbility])}</div>
      <div class="${comparisonResult.height.class}">
        <div class="value-wrapper"><span>${pokemon.height}m</span><span class="${comparisonResult.height.symbolClass}">${comparisonResult.height.symbol}</span></div>
      </div>
      <div class="${comparisonResult.weight.class}">
        <div class="value-wrapper"><span>${pokemon.weight}kg</span><span class="${comparisonResult.weight.symbolClass}">${comparisonResult.weight.symbol}</span></div>
      </div>
      <div class="${comparisonResult.genderRate}">${formatGenderRate(pokemon.genderRate)}</div>
      <div class="${comparisonResult.evolutionCount}">${pokemon.evolutionCount}</div>
      <div class="${comparisonResult.eggGroups} full-width">${formatCombinedField([pokemon.eggGroup1, pokemon.eggGroup2])}</div>
    `;
  }

  row.appendChild(bodyContainer);
  resultHistory.insertAdjacentElement('afterbegin', row);
}
  
export function showResultModal(pokemon, verdict, gameMode, guessesLeft) {
  const verdictEl = resultModal.querySelector('#result-modal-verdict span');
  verdictEl.textContent = verdict;

  const scoreEl = resultModal.querySelector('#result-modal-score');
  scoreEl.textContent = '';

  const crackerImages = resultModal.querySelectorAll('.verdict-cracker-img');
  if (verdict === '正解') {
    crackerImages.forEach(img => img.classList.remove('hidden'));
    const guessesTaken = 10 - guessesLeft;
    scoreEl.textContent = `${guessesTaken}回でクリア`;
  } else {
    crackerImages.forEach(img => img.classList.add('hidden'));
  }

  const setData = (field, value) => {
    const el = resultModal.querySelector(`[data-field="${field}"]`);
    if (el) el.textContent = value;
  };

  resultModal.querySelector('[data-field="sprite"]').src = pokemon.sprite;

  const { main: mainName, form: formName } = formatDisplayName(pokemon.name);
  setData('name', mainName);
  setData('form', formName);

  let nationalNo = pokemon.id;
  if (pokemon.name.includes('（')) {
    const baseName = pokemon.name.split('（')[0];
    const allPokemonArray = Object.values(allPokemonData);
    const candidateForms = allPokemonArray.filter(p => p.name.startsWith(baseName));
    if (candidateForms.length > 0) {
      const baseForm = candidateForms.reduce((minPokemon, currentPokemon) => {
        return currentPokemon.id < minPokemon.id ? currentPokemon : minPokemon;
      });
      nationalNo = baseForm.id;
    }
  }
  setData('nationalNo', nationalNo ? `No. ${String(nationalNo).padStart(4, '0')}` : '---');

  const profileLeft = resultModal.querySelector('.profile-left');
  const formatCombinedField = (items) => {
    const filtered = items.filter(item => item && item !== 'なし');
    return filtered.length > 0 ? filtered.join(' / ') : '—';
  };
  const totalStats =
    pokemon.stats.hp + pokemon.stats.attack + pokemon.stats.defense +
    pokemon.stats.spAttack + pokemon.stats.spDefense + pokemon.stats.speed;

  profileLeft.innerHTML = `
    <div class="modal-grid-item"><span class="modal-grid-label">初登場作品（世代）</span><span class="modal-grid-value">${formatDebut(pokemon.debutGen, pokemon.debutTitle)}</span></div>
    <div class="modal-grid-item"><span class="modal-grid-label">合計種族値</span><span class="modal-grid-value">${totalStats}</span></div>
    <div class="modal-grid-item full-width"><span class="modal-grid-label">タイプ</span><span class="modal-grid-value">${formatCombinedField([pokemon.type1, pokemon.type2])}</span></div>
    <div class="modal-grid-item full-width"><span class="modal-grid-label">特性</span><span class="modal-grid-value">${formatCombinedField([pokemon.ability1, pokemon.ability2, pokemon.hiddenAbility])}</span></div>
    <div class="modal-grid-item"><span class="modal-grid-label">高さ</span><span class="modal-grid-value">${pokemon.height} m</span></div>
    <div class="modal-grid-item"><span class="modal-grid-label">重さ</span><span class="modal-grid-value">${pokemon.weight} kg</span></div>
    <div class="modal-grid-item"><span class="modal-grid-label">性別比</span><span class="modal-grid-value">${formatGenderRate(pokemon.genderRate)}</span></div>
    <div class="modal-grid-item"><span class="modal-grid-label">進化数</span><span class="modal-grid-value">${pokemon.evolutionCount}</span></div>
    <div class="modal-grid-item full-width"><span class="modal-grid-label">タマゴグループ</span><span class="modal-grid-value">${formatCombinedField([pokemon.eggGroup1, pokemon.eggGroup2])}</span></div>
  `;

  const profileDetails = resultModal.querySelector('.profile-left'); profileDetails.classList.add('pair-grid');
  const profileStats = resultModal.querySelector('.profile-right');
  if (gameMode === 'classic' || gameMode === 'randomStart') {
    profileStats.classList.add('hidden');
    profileDetails.style.gridColumn = '1 / -1';
  } else {
    profileStats.classList.remove('hidden');
    profileDetails.style.gridColumn = '';
  }

  resultModalOverlay.classList.remove('hidden');
}
  
export function clearResults() { resultHistory.innerHTML = ""; }
export function blurGuessInput(){ if (guessInput) guessInput.blur(); }
export function getGuessInputValue(){ return guessInput ? guessInput.value.trim() : ""; }
export function clearGuessInput(){ if (guessInput) guessInput.value = ""; }


let suggestionRequestToken = 0;
function handleInput() {
  const currentToken = ++suggestionRequestToken;
  const inputText = guessInput.value.trim();
  if (inputText.length === 0) {
    suggestionsBox.classList.add('hidden');
    return;
  }

  suggestionsBox.style.width = `${guessInput.offsetWidth}px`;

  const inputTextKana = normalizePokemonName(inputText);
  const suggestions = allPokemonNames
    .filter(name => normalizePokemonName(name).startsWith(inputTextKana))
    .slice(0, 100);

  if (currentToken !== suggestionRequestToken) return;

  if (suggestions.length > 0) {
    const itemsHtml = suggestions.map(name => {
      const pokemon = allPokemonData[name];
      const spriteUrl = pokemon ? pokemon.sprite : 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png';
      return `
        <div class="suggestion-item" data-name="${name}">
          <img src="${spriteUrl}" alt="${name}" class="suggestion-sprite">
          <span>${name}</span>
        </div>
      `;
    }).join('');

    suggestionsBox.innerHTML = itemsHtml;
    suggestionsBox.querySelectorAll('.suggestion-item').forEach(item => {
      item.addEventListener('click', () => {
        guessInput.value = item.dataset.name;
        suggestionsBox.classList.add('hidden');
        guessInput.focus();
      });
    });
    suggestionsBox.classList.remove('hidden');
  } else {
    suggestionsBox.classList.add('hidden');
  }
}
  
// ===== モーダル共通 =====
export function openModal(title, content, options = {}) {

  const { addHeaderDivider = true } = options;

  const titleHTML = title
    ? `<div class="modal-head">
         <h3>${title}</h3>
         ${addHeaderDivider ? '<hr class="modal-head-divider" />' : ''}
       </div>`
    : '';

  if (!modalContent) return;
  modalContent.innerHTML = `${titleHTML}<div class="modal-body">${content}</div>`;

  if (modalOverlay) modalOverlay.classList.remove('hidden');
}

export function closeModal() {
  if (modalOverlay) modalOverlay.classList.add('hidden');
}

function openHowToPlayModal() {
  const howToContent = `
  <p class="lead">
    様々なヒントを駆使して、ターゲットのポケモンを推測するゲームです。<br>
    回答から得られる<strong>色のヒント</strong>や<strong>数値の大小</strong>を手がかりに、正解を目指しましょう！
  </p>

  <div class="accordion" role="region" aria-label="遊び方の詳細">
    <!-- 0) Poke Guesserとは -->
    <section class="accordion-item">
      <h4 class="accordion-header">
        <button class="accordion-trigger" aria-expanded="false" aria-controls="acc-panel-about" id="acc-btn-about">
          Poke Guesserとは
          <span class="accordion-icon" aria-hidden="true"></span>
        </button>
      </h4>
      <div id="acc-panel-about" class="accordion-panel" role="region" aria-labelledby="acc-btn-about" hidden>
        <div class="accordion-panel-inner">
          <p>
            入力したポケモンと正解のポケモンを比較し、<strong>一致・部分一致・不一致</strong>を色で可視化します。<br>
            種族値の合計や高さ・重さなどの<strong>数値項目</strong>が一致しない場合には、
            <strong>▲/▼</strong>（正解の値がある領域）を表示します。
          </p>
          <p class="note">
            対象は本編<strong>第1〜第9世代</strong>（RG〜ZA）に登場するポケモンです（対応フォルムはゲーム内データに準拠）。
          </p>
        </div>
      </div>
    </section>

    <!-- 1) ルール説明 -->
    <section class="accordion-item">
      <h4 class="accordion-header">
        <button class="accordion-trigger" aria-expanded="false" aria-controls="acc-panel-rules" id="acc-btn-rules">
          ルール説明
          <span class="accordion-icon" aria-hidden="true"></span>
        </button>
      </h4>
      <div id="acc-panel-rules" class="accordion-panel" role="region" aria-labelledby="acc-btn-rules" hidden>
        <div class="accordion-panel-inner">
          <p>回答したポケモンが正解にどれだけ近いかを<strong>色</strong>で表示します。</p>
          <ul class="bullets">
            <li><span class="legend legend-green">緑</span>：完全一致</li>
            <li><span class="legend legend-yellow">黄</span>：部分一致<br>（例：タイプ／特性 の片方一致 など）</li>
            <li><span class="legend legend-gray">灰</span>：不一致<br>（数値項目には <strong>▲/▼</strong> を併記）</li>
          </ul>
          <p class="note">1プレイの回答上限は<strong>10回</strong>です。</p>
        </div>
      </div>
    </section>

    <!-- 2) 比較項目等の補足情報 -->
    <section class="accordion-item">
      <h4 class="accordion-header">
        <button class="accordion-trigger" aria-expanded="false" aria-controls="acc-panel-metrics" id="acc-btn-metrics">
          比較項目等の補足情報
          <span class="accordion-icon" aria-hidden="true"></span>
        </button>
      </h4>
      <div id="acc-panel-metrics" class="accordion-panel" role="region" aria-labelledby="acc-btn-metrics" hidden>
        <div class="accordion-panel-inner">
          <ul id="rule-bullets" class="bullets">
            <li><strong>初登場作品（世代）</strong>：<br>
              <span class="legend legend-green">緑</span>＝初登場作品/世代とも一致<br>
              <span class="legend legend-yellow">黄</span>＝世代のみ一致<br>
              <span class="legend legend-gray">灰</span>＝世代が違う<br>※数値比較（<strong>▲/▼</strong>）も表示
            </li>
            <li><strong>タイプ/特性/タマゴグループ</strong>：<br>
              <span class="legend legend-green">緑</span>=完全一致<br>
              <span class="legend legend-yellow">黄</span>=部分一致<br>
              <span class="legend legend-gray">灰</span>=不一致
            </li>
            <li><strong>合計種族値・高さ・重さ</strong>：<br>
              <span class="legend legend-green">緑</span>=完全一致<br>
              <span class="legend legend-gray">灰</span>=不一致<br>※数値比較（<strong>▲/▼</strong>）も表示
            </li>
            <li><strong>性別比・進化数</strong>：<br>
              <span class="legend legend-green">緑</span>=完全一致
              <span class="legend legend-gray">灰</span>=不一致
            </li>
          </ul>
          <p class="note">作品略称の例：RG/SwSh/ZA など</p>
        </div>
      </div>
    </section>

    <!-- 3) クラシックモードとは -->
    <section class="accordion-item">
      <h4 class="accordion-header">
        <button class="accordion-trigger" aria-expanded="false" aria-controls="acc-panel-classic" id="acc-btn-classic">
          クラシックモードとは
          <span class="accordion-icon" aria-hidden="true"></span>
        </button>
      </h4>
      <div id="acc-panel-classic" class="accordion-panel" role="region" aria-labelledby="acc-btn-classic" hidden>
        <div class="accordion-panel-inner">
          <p>Poke Guesserの最も基本的なモードです。1プレイで最大10回の回答が可能です。<br>比較項目は以下になります。</p>
          <ul class="bullets">
            <li>初登場作品（世代）</li>
            <li>合計種族値</li>
            <li>タイプ</li>
            <li>特性</li>
            <li>高さ</li>
            <li>重さ</li>
            <li>性別比</li>
            <li>進化数</li>
            <li>タマゴグループ</li>
          </ul>
        </div>
      </div>
    </section>

    <!-- 4) ランダムモードとは -->
    <section class="accordion-item">
      <h4 class="accordion-header">
        <button class="accordion-trigger" aria-expanded="false" aria-controls="acc-panel-random" id="acc-btn-random">
          ランダムモードとは
          <span class="accordion-icon" aria-hidden="true"></span>
        </button>
      </h4>
      <div id="acc-panel-random" class="accordion-panel" role="region" aria-labelledby="acc-btn-random" hidden>
        <div class="accordion-panel-inner">
            <p> ゲーム開始時に<strong>ランダムな</strong>ポケモンの情報が1匹分表示されます。<br>
            <p class="note">※最大回答数や比較項目はクラシックモードと同様</p>
        </div>
      </div>
    </section>

    <!-- 5) 種族値モードとは -->
    <section class="accordion-item">
      <h4 class="accordion-header">
        <button class="accordion-trigger" aria-expanded="false" aria-controls="acc-panel-stats" id="acc-btn-stats">
          種族値モードとは
          <span class="accordion-icon" aria-hidden="true"></span>
        </button>
      </h4>
      <div id="acc-panel-stats" class="accordion-panel" role="region" aria-labelledby="acc-btn-stats" hidden>
        <div class="accordion-panel-inner">
          <p>ポケモンの<strong>6つの種族値</strong>を手がかりに正解を推測するモードです。<br>
          回答ごとに各種族値が一致しているかどうかが表示されます。<br>比較項目は以下になります。</p>
          <ul class="bullets">
            <li>hp</li>
            <li>こうげき</li>
            <li>ぼうぎょ</li>
            <li>とくこう</li>
            <li>とくぼう</li>
            <li>すばやさ</li>
          </ul>
          <p class="note">※最大回答数は10回です</p>
        </div>
      </div>
    </section>
  </div>
  
`;

  openModal('遊び方', howToContent);

  const accRoot =
    document.querySelector('#modal .modal-body .accordion') ||
    document.querySelector('#modal .accordion') ||
    document.querySelector('.accordion');
  setupAccordion(accRoot);
}

function setupAccordion(root) {
  if (!root) return;
  const triggers = Array.from(root.querySelectorAll('.accordion-trigger'));

  triggers.forEach((btn) => {
    const panelId = btn.getAttribute('aria-controls');
    const panel = document.getElementById(panelId);
    if (!panel) return;
    btn.setAttribute('aria-expanded', 'false');
    panel.hidden = true;
    panel.style.maxHeight = '0px';
  });

  triggers.forEach((btn) => {
    const panelId = btn.getAttribute('aria-controls');
    const panel = document.getElementById(panelId);
    if (!panel) return;

    btn.addEventListener('click', () => {
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!expanded));

      if (!expanded) {
        panel.hidden = false;
        panel.style.maxHeight = panel.scrollHeight + 'px';
      } else {
        panel.style.maxHeight = panel.scrollHeight + 'px';
        requestAnimationFrame(() => {
          panel.style.maxHeight = '0px';
        });
        panel.addEventListener('transitionend', () => {
          panel.hidden = true;
        }, { once: true });
      }
    });

    btn.addEventListener('keydown', (e) => {
      const idx = triggers.indexOf(btn);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = triggers[idx + 1] || triggers[0];
        next.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = triggers[idx - 1] || triggers[triggers.length - 1];
        prev.focus();
      } else if (e.key === 'Home') {
        e.preventDefault();
        triggers[0].focus();
      } else if (e.key === 'End') {
        e.preventDefault();
        triggers[triggers.length - 1].focus();
      }
    });
  });
}

export function showInputArea(){ if (inputArea) inputArea.classList.remove('hidden'); }
export function hideInputArea(){ if (inputArea) inputArea.classList.add('hidden'); }
export function showRandomStartButton(){ if (randomStartButton) randomStartButton.classList.remove('hidden'); }
export function hideRandomStartButton(){ if (randomStartButton) randomStartButton.classList.add('hidden'); }
export function hidePostGameActions(){ const el = document.getElementById('post-game-actions'); if (el) el.classList.add('hidden'); }
export function showPostGameActions(){ const el = document.getElementById('post-game-actions'); if (el) el.classList.remove('hidden'); }
export function hideSuggestions(){ const el = suggestionsBox; if (el) el.classList.add('hidden'); }  