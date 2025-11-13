import {
  allPokemonData
} from "./all-pokemon-data.js";

import {
  finalEvoData
} from "./final-evo-data.js";

import {
  normalizePokemonName
} from "./utils.js";

import {
  comparePokemon
} from "./compare.js";

import {
  clearResults,
  hideInputArea,
  hidePostGameActions,
  hideRandomStartButton,
  hideSuggestions,
  renderResult,
  setGameStatus,
  setGameTitle,
  hideResultsArea,
  showResultsArea,
  showInputArea,
  showRandomStartButton,
  showResultModal,
  switchScreen,
  getGuessInputValue,
  clearGuessInput,
  blurGuessInput,
  openModal,
  showHintButton,
  hideHintButton,
  setHintButtonEnabled,
} from "./dom.js";

import {
  requestHint,
  getHintKeysForMode
} from "./hints.js";


// === 正解ポケモン固定 ===
const DEBUG_FIXED_ANSWER = false;
const DEBUG_FIXED_NAME = 'カイリュー';
const DEBUG_FIXED_ID = 149;
// =======================

let gameMode = null;
let guessesLeft = 10;
let gameOver = false;
const allPokemonNames = Object.keys(allPokemonData);
const finalEvolutionPokemonNames = allPokemonNames.filter((name) => finalEvoData[name]?.isFinalEvolution);
let correctPokemon = null;
let answeredPokemonNames = new Set();
let correctCount = 0;
let correctlyAnsweredPokemon = [];
const hintRevealedKeys = new Set();

export function initGame() {
  switchScreen('mode-selection-screen');
  setGameTitle('');
  setGameStatus('');
}

export const Handlers = {
  onStartClassic: () => startGame('classic'),
  onStartRandom:  () => startGame('randomStart'),
  onStartStats:   () => startGame('stats'),
  onStartVersus:  () => startVersus(),
  onGuess:        () => handleGuess(),
  onRandomStart:  () => handleRandomStart(),
  onPlayAgain:    () => startGame(gameMode || 'classic'),
  onBackToMenu:   () => { resetGame(); switchScreen('mode-selection-screen'); },
  onHint:         () => handleHintRequest(),
};

function startGame(mode) {
  gameMode = mode;

  if (globalThis._pgVersus && typeof globalThis._pgVersus.teardown === 'function') {
    globalThis._pgVersus.teardown();
  }

  document.getElementById('versus-lobby-area')?.remove();
  document.getElementById('game-header-area')?.style && (document.getElementById('game-header-area').style.display = '');
  showResultsArea();
  resetGame();
  switchScreen('game-container');
  setupUIForMode();
  initRound();
  
  if (gameMode !== 'versus') {
    showHintButton();
    updateHintAvailability();
  }
}

function getEligiblePokemonNames() {
  if (gameMode === 'stats') {
    return finalEvolutionPokemonNames.length ? finalEvolutionPokemonNames : allPokemonNames;
  }
  return allPokemonNames;
}

function initRound() {
  hintRevealedKeys.clear();

  if (DEBUG_FIXED_ANSWER) {
    const byName = allPokemonData[DEBUG_FIXED_NAME];
    const byId   = Object.values(allPokemonData).find(p => p.id === DEBUG_FIXED_ID);
    correctPokemon = byName || byId || null;
  } else {
    const candidates = getEligiblePokemonNames();
    const pool = candidates.length ? candidates : allPokemonNames;
    const name = pool[Math.floor(Math.random() * pool.length)];
    correctPokemon = allPokemonData[name] || null;
  }

  guessesLeft = 10;
  gameOver = false;
  answeredPokemonNames = new Set();
  clearResults();
  setGameStatus(`残り回数：${guessesLeft}`);
  updateHintAvailability();
}
  

function resetGame() {
  gameOver = false;
  guessesLeft = 10;
  correctCount = 0;
  correctlyAnsweredPokemon = [];
  
  hintRevealedKeys.clear();
  
  clearResults();
  showInputArea();
  hidePostGameActions();

  const playAgainBtn = document.getElementById('post-game-play-again');
  if (playAgainBtn) playAgainBtn.classList.remove('hidden');
  const backToMenuBtn = document.getElementById('post-game-back-to-menu');
  if (backToMenuBtn) backToMenuBtn.textContent = 'モード選択へ';
  
  setGameStatus('');
  hideHintButton();
  setHintButtonEnabled(false);
}

function isCorrectAnswer(guessed, correct) {
  if (!guessed || !correct) return false;
  if (guessed.id === correct.id) return true;
  if (normalizePokemonName(guessed.name) === normalizePokemonName(correct.name)) return true;
  
  return false;
}

function handleGuess() {
  if (gameOver) return;

  if (gameMode === 'versus' && globalThis._pgVersus && typeof globalThis._pgVersus.handleGuess === 'function') {
    const guessRaw = getGuessInputValue();
    globalThis._pgVersus.handleGuess(guessRaw);
    hideSuggestions();
    clearGuessInput();
    blurGuessInput();
    
    return;
  }

  if (gameOver) return;

  const guessRaw = getGuessInputValue();
  if (!guessRaw) return;

  let guessedPokemon = Object.values(allPokemonData).find(p => p.name === guessRaw);
  if (!guessedPokemon) {
    const guessName = normalizePokemonName(guessRaw);
    guessedPokemon = Object.values(allPokemonData).find(p => normalizePokemonName(p.name) === guessName);
  }

  if (!guessedPokemon) {
    hideSuggestions();
    openModal(null, "入力されたポケモンが見つかりませんでした");
    blurGuessInput();
    
    return;
  }

  const comparisonResult = comparePokemon(guessedPokemon, correctPokemon);
  if (!comparisonResult) return;
  
  const isCorrect = isCorrectAnswer(guessedPokemon, correctPokemon);
  renderResult(guessedPokemon, comparisonResult, gameMode, isCorrect);

  guessesLeft--;
  setGameStatus(`残り回数：${guessesLeft}`);

  if (isCorrect) {
    endGame(true);
  } else if ((gameMode === 'classic' || gameMode === 'randomStart') && guessesLeft <= 0) {
    endGame(false);
  }

  hideSuggestions();
  clearGuessInput();
  blurGuessInput();
}

function handleRandomStart() {
  let randomGuess;
  do {
    const randomName = allPokemonNames[Math.floor(Math.random() * allPokemonNames.length)];
    randomGuess = allPokemonData[randomName];
  } while (isCorrectAnswer(randomGuess, correctPokemon));

  const comparisonResult = comparePokemon(randomGuess, correctPokemon);
  renderResult(randomGuess, comparisonResult, gameMode);

  setGameStatus(`残り回数：${guessesLeft}`);

  hideRandomStartButton();
  showInputArea();
}

function setupUIForMode() {
  hideRandomStartButton();
  showInputArea();

  if (gameMode === 'classic' || gameMode === 'scoreAttack') {
    setGameTitle(gameMode === 'classic' ? 'クラシックモード' : 'スコアアタック');
  } else if (gameMode === 'stats') {
    setGameTitle('種族値モード');
  } else if (gameMode === 'randomStart') {
    setGameTitle('ランダムモード');
    showRandomStartButton();
    hideInputArea();
  }
  setGameStatus('');
  updateHintAvailability();
}

function endGame(isWin) {
  gameOver = true;
  showResultModal(correctPokemon, isWin ? "正解" : "残念", gameMode, guessesLeft);
  setHintButtonEnabled(false);
}

function startVersus() {
  gameMode = 'versus';
  resetGame();
  hideHintButton();
  setHintButtonEnabled(false);
  switchScreen('game-container');
  setGameTitle('対戦ロビー');
  setGameStatus('ルームを作成するか、コードを入力して参加してください');
  hideRandomStartButton();
  hideInputArea();
  hideResultsArea();
  const tryBoot = () => {
    if (globalThis._pgVersus && typeof globalThis._pgVersus.boot === 'function') {
      globalThis._pgVersus.boot();
      return;
    }
    import('./versus.js')
      .then(() => {
        if (globalThis._pgVersus && typeof globalThis._pgVersus.boot === 'function') {
          globalThis._pgVersus.boot();
        } else {
          console.warn('[Versus] versus module loaded but bootstrapper missing');
        }
      })
      .catch((e) => console.error('[Versus] failed to load module', e));
  };
  tryBoot();
}

async function handleHintRequest() {
  if (gameMode === 'versus' || gameOver) return;
  if (!correctPokemon) return;

  const result = await requestHint({
    pokemon: correctPokemon,
    mode: gameMode,
    disabledKeys: hintRevealedKeys,
  });

  if (result && result.key) {
    hintRevealedKeys.add(result.key);
    updateHintAvailability();
  }
}

function updateHintAvailability() {
  if (gameMode === 'versus') {
    hideHintButton();
    setHintButtonEnabled(false);
    return;
  }

  if (!correctPokemon) {
    setHintButtonEnabled(false);
    return;
  }

  const keys = getHintKeysForMode(gameMode);
  if (!keys || keys.length === 0) {
    hideHintButton();
    setHintButtonEnabled(false);
    return;
  }

  showHintButton();
  const remaining = keys.filter((key) => !hintRevealedKeys.has(key));
  const hasAvailable = remaining.length > 0;
  setHintButtonEnabled(hasAvailable && !gameOver);
}
