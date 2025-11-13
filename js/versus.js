import { allPokemonData } from "./all-pokemon-data.js";
import { comparePokemon } from "./compare.js";
import {
  renderResult,
  setGameStatus,
  setGameTitle,
  showInputArea,
  hideInputArea,
  showResultsArea,
  hideResultsArea,
  hideRandomStartButton,
  hidePostGameActions,
  showResultModal,
  renderMaskedVersusGuess,
} from "./dom.js";
import { requestHint } from "./hints.js";

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  initializeFirestore, doc, getDoc, runTransaction,
  onSnapshot, serverTimestamp, collection, addDoc, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const V90 = 90 * 1000;
const HIDE_HISTORY_DURATION_MS = 20 * 1000;

const SKILL_TYPES = {
  MASK: "mask",
  EXTRA: "extra",
  HINT: "hint",
  HIDE: "hide",
};

const SKILL_LABELS = {
  [SKILL_TYPES.MASK]: "秘匿回答",
  [SKILL_TYPES.EXTRA]: "連続ターン",
  [SKILL_TYPES.HINT]: "ヒント確認",
  [SKILL_TYPES.HIDE]: "履歴隠し",
};

const DEBUG_FIXED_ANSWER = false;

const TURN_MODAL_TYPES = {
  BATTLE_START: "battle-start",
  YOUR_TURN: "your-turn",
  OPPONENT_TURN: "opponent-turn",
};

const TURN_MODAL_CONFIG = {
  [TURN_MODAL_TYPES.BATTLE_START]: {
    id: "versus-battle-start-modal",
    defaultText: "バトルスタート！",
    bannerClass: "battle-start",
    duration: 2200,
  },
  [TURN_MODAL_TYPES.YOUR_TURN]: {
    id: "versus-your-turn-modal",
    defaultText: "あなたの番",
    bannerClass: "your-turn",
    duration: 2200,
  },
  [TURN_MODAL_TYPES.OPPONENT_TURN]: {
    id: "versus-opponent-turn-modal",
    defaultText: "相手の番",
    bannerClass: "opponent-turn",
    duration: 2200,
  },
};

function ensureFirebase() {
  if (getApps().length) return getApps()[0];
  if (globalThis.firebaseApp) return globalThis.firebaseApp;
  if (!globalThis.FIREBASE_CONFIG) return null;
  return initializeApp(globalThis.FIREBASE_CONFIG);
}

function now() { return Date.now(); }

const state = {
  roomId: null,
  code: null,
  me: null,
  correct: null,
  unsubRoom: null,
  unsubGuesses: null,
  unsubSkills: null,
  interval: null,
  roomData: null,
  lastAdvanceAttempt: 0,
  turnNoticeShownFor: null,
  turnModalTimeouts: {},
  turnModalCallbacks: {},
  pendingTurnModal: null,
  resultModalShown: false,
  skillUsed: false,
  usedSkillType: null,
  skillPending: false,
  skillEffects: {
    maskNextGuessTurn: null,
    extraTurnForTurn: null,
  },
  historyHideTimer: null,
  historyHiddenUntil: 0,
  historyMaskActive: false,
  holdHideBanner: false,
  showingOpponentModal: false,
};

const BASE_PLAYER_ID = getPlayerId();

function roomScopedIdKey(roomId) { return `pg-room-${roomId}-pid`; }
function getRoomScopedId(roomId) {
  const k = roomScopedIdKey(roomId);
  return sessionStorage.getItem(k) || BASE_PLAYER_ID;
}
function setRoomScopedId(roomId, id) {
  sessionStorage.setItem(roomScopedIdKey(roomId), id);
}
function genAltId(base) {
  const suffix = Math.random().toString(16).slice(2, 6);
  return `${base}:${suffix}`;
}

function fmtClock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(s / 60)).padStart(1, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}


function safeUUID(){
  try{
    if (typeof crypto !== "undefined") {
      if (crypto.randomUUID) return crypto.randomUUID();
      if (crypto.getRandomValues) {
        const buf = new Uint8Array(16);
        crypto.getRandomValues(buf);
        buf[6] = (buf[6] & 0x0f) | 0x40;
        buf[8] = (buf[8] & 0x3f) | 0x80;
        const hex = [...buf].map(b => b.toString(16).padStart(2,"0")).join("");
        return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
      }
    }
  }catch {}
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = Math.random()*16|0, v = c === "x" ? r : (r&0x3|0x8);
    return v.toString(16);
  });
}

function getPlayerId() {
  const KEY = "pg-player-id";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = safeUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}

function sixDigit() {
  const n = Math.floor(Math.random() * 1_000_000);
  return String(n).padStart(6, "0");
}

function chooseAnswerBySeed(seed) {
  const names = Object.keys(allPokemonData).sort();
  const a = 1103515245, c = 12345, m = 2**31;
  let x = (typeof seed === "number" ? seed : seed.split("").reduce((s,ch)=> (s*31 + ch.charCodeAt(0))>>>0, 0)) >>> 0;
  x = (a * x + c) % m;
  const idx = x % names.length;
  return allPokemonData[names[idx]];
}

function ensureLobbyRoot() {
  let root = document.getElementById("versus-lobby-area");
  if (!root) {
    root = document.createElement("div");
    root.id = "versus-lobby-area";

    const header  = document.getElementById("game-header-area");
    const results = document.getElementById("results-area");

    if (results && results.parentNode) {
      results.parentNode.insertBefore(root, results);
    } else if (header && header.parentNode) {
      header.parentNode.insertBefore(root, header.nextSibling);
    } else {
      (document.getElementById("game-container") || document.body).appendChild(root);
    }
  }
  root.style.display = "";
  return root;
}

function setLobbyContent(html) { ensureLobbyRoot().innerHTML = html; }
function hideLobby() { const r = document.getElementById("versus-lobby-area"); if (r) r.style.display = "none"; }
function showToast(msg) {
  let t = document.getElementById("versus-toast");
  if (!t) { t = document.createElement("div"); t.id = "versus-toast"; document.body.appendChild(t); }
  t.textContent = msg;
  t.style.display = "block";
  setTimeout(() => { t.style.display = "none"; }, 900);
}

function ensureSkillBar() {
  const bar = document.getElementById("versus-skill-bar");
  if (!bar) return null;
  if (!bar.dataset.bound) {
    bar.addEventListener("click", handleSkillBarClick);
    bar.dataset.bound = "1";
  }
  return bar;
}

function handleSkillBarClick(event) {
  const btn = event.target.closest(".versus-skill-button");
  if (!btn) return;
  if (btn.disabled) return;
  if (!state.roomData || state.roomData.status !== "playing") return;
  if (state.roomData.turnOf !== state.me) return;
  if (state.skillUsed || state.skillPending) return;
  const skill = btn.dataset.skill;
  triggerSkill(skill).catch((err) => console.warn("[Versus] triggerSkill failed", err));
}

function updateSkillUI(roomData) {
  const bar = ensureSkillBar();
  if (!bar) return;

  if (!roomData || roomData.status !== "playing") {
    bar.classList.add("hidden");
    return;
  }

  bar.classList.remove("hidden");
  const myTurn = roomData.turnOf === state.me;
  bar.dataset.myTurn = myTurn ? "1" : "0";

  const buttons = bar.querySelectorAll(".versus-skill-button");
  buttons.forEach((btn) => {
    const skill = btn.dataset.skill;
    const used = state.usedSkillType === skill;
    let disabled = !myTurn || state.skillPending || state.skillUsed;
    if (skill === SKILL_TYPES.HINT && !state.correct) {
      disabled = true;
    }
    btn.disabled = disabled;
    btn.classList.toggle("skill-used", used);
    btn.classList.toggle("skill-disabled", btn.disabled && !used);
  });
}

function ensureHistoryMask() {
  const area = document.getElementById("results-area");
  if (!area) return null;
  let mask = document.getElementById("versus-history-mask");
  if (!mask) {
    mask = document.createElement("div");
    mask.id = "versus-history-mask";
    mask.innerHTML = `<div class="versus-history-mask-content"><p></p></div>`;
    area.appendChild(mask);
  }
  return mask;
}

function applyHistoryMask(durationMs = HIDE_HISTORY_DURATION_MS) {
  const mask = ensureHistoryMask();
  if (!mask) return;
  const message = mask.querySelector("p");
  if (message) {
    const seconds = Math.round(durationMs / 1000);
    message.textContent = `相手のスキルで履歴が${seconds}秒間非表示になっています`;
  }
  mask.classList.add("active");
  state.historyMaskActive = true;
  state.historyHiddenUntil = now() + durationMs;
  if (state.historyHideTimer) clearTimeout(state.historyHideTimer);
  state.historyHideTimer = setTimeout(() => {
    clearHistoryMask();
  }, durationMs);
}

function clearHistoryMask() {
  const mask = document.getElementById("versus-history-mask");
  if (mask) mask.classList.remove("active");
  if (state.historyHideTimer) {
    clearTimeout(state.historyHideTimer);
    state.historyHideTimer = null;
  }
  state.historyMaskActive = false;
  state.historyHiddenUntil = 0;
}

function resetSkillState() {
  state.skillUsed = false;
  state.usedSkillType = null;
  state.skillPending = false;
  state.skillEffects.maskNextGuessTurn = null;
  state.skillEffects.extraTurnForTurn = null;
}

function announceSkillUse(skillId, isMine, payload = {}) {
  const label = SKILL_LABELS[skillId] || "スキル";
  let message;
  if (skillId === SKILL_TYPES.HINT && payload.label) {
    message = isMine
      ? `ヒント「${payload.label}」を確認しました`
      : `相手がヒント「${payload.label}」を確認しました`;
  } else {
    message = isMine
      ? `スキル「${label}」を使用しました`
      : `相手が「${label}」を使用！`;
  }
  showToast(message);
}

async function triggerSkill(skillId) {
  if (!state.roomData || state.roomData.status !== "playing") return;
  state.skillPending = true;
  updateSkillUI(state.roomData);

  const turnNumber = state.roomData.turnNumber || 1;
  let consumed = false;
  let toastPayload = {};

  try {
    switch (skillId) {
      case SKILL_TYPES.MASK:
        state.skillEffects.maskNextGuessTurn = turnNumber;
        consumed = true;
        await postSkillEvent(skillId, { turnNumber });
        break;
      case SKILL_TYPES.EXTRA:
        state.skillEffects.extraTurnForTurn = turnNumber;
        consumed = true;
        await postSkillEvent(skillId, { turnNumber });
        break;
      case SKILL_TYPES.HINT: {
        if (!state.correct) break;
        const result = await requestHint({ pokemon: state.correct, mode: "versus" });
        if (!result) {
          return;
        }
        consumed = true;
        toastPayload = { label: result.label };
        await postSkillEvent(skillId, { field: result.key, label: result.label });
        break;
      }
      case SKILL_TYPES.HIDE:
        consumed = true;
        await postSkillEvent(skillId, { durationMs: HIDE_HISTORY_DURATION_MS });
        break;
      default:
        break;
    }

    if (consumed) {
      state.skillUsed = true;
      state.usedSkillType = skillId;
      announceSkillUse(skillId, true, toastPayload);
    }
  } catch (err) {
    console.warn("[Versus] triggerSkill error", err);
    if (err && err.code === "permission-denied") {
      showToast("権限がありません（Firestore ルールを確認してください）");
      state.skillUsed = false;
      state.usedSkillType = null;
    }
    if (skillId === SKILL_TYPES.MASK && state.skillEffects.maskNextGuessTurn === turnNumber) {
      state.skillEffects.maskNextGuessTurn = null;
    }
    if (skillId === SKILL_TYPES.EXTRA && state.skillEffects.extraTurnForTurn === turnNumber) {
      state.skillEffects.extraTurnForTurn = null;
    }
  } finally {
    state.skillPending = false;
    updateSkillUI(state.roomData);
  }
}

async function postSkillEvent(skillId, payload = {}) {
  const roomRef = doc(ensureDB(), "rooms", state.roomId);
  await addDoc(collection(roomRef, "skills"), {
    by: state.me,
    type: skillId,
    turnNumber: state.roomData?.turnNumber || 0,
    payload,
    ts: serverTimestamp(),
  });
}

function handleSkillEvent(evt) {
  if (!evt) return;
  const { type, by, payload = {}, turnNumber } = evt;
  const isMine = by === state.me;

  if (isMine) {
    state.skillUsed = true;
    state.usedSkillType = type;
    state.skillPending = false;
    if (type === SKILL_TYPES.MASK) {
      state.skillEffects.maskNextGuessTurn = turnNumber;
    }
    if (type === SKILL_TYPES.EXTRA) {
      state.skillEffects.extraTurnForTurn = turnNumber;
    }
  } else {
    announceSkillUse(type, false, payload);
  }

  if (type === SKILL_TYPES.HIDE && !isMine) {
    const duration = typeof payload.durationMs === "number" ? payload.durationMs : HIDE_HISTORY_DURATION_MS;
    applyHistoryMask(duration);
  }

  updateSkillUI(state.roomData);
}

let app = null;
let db  = null;

function ensureDB(){
  if (db) return db;
  app = ensureFirebase();
  if (!app) throw new Error("Firebase 未初期化です。window.FIREBASE_CONFIG を設定してください。");
  db = initializeFirestore(app, {
    experimentalAutoDetectLongPolling: true,
    useFetchStreams: false
  });
  return db;
}

function startInterval() {
  stopInterval();
  state.interval = setInterval(onTick, 250);
}
function stopInterval() {
  if (state.interval) { clearInterval(state.interval); state.interval = null; }
}

function ensureTurnModal(type) {
  const config = TURN_MODAL_CONFIG[type];
  if (!config) return null;

  let overlay = document.getElementById(config.id);
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = config.id;
    overlay.className = "versus-modal-overlay hidden";
    overlay.innerHTML = `
      <div class="versus-turn-modal-content" role="alertdialog" aria-live="assertive">
        <div class="versus-turn-banner ${config.bannerClass}">
          <span class="versus-turn-text">${config.defaultText}</span>
        </div>
      </div>
    `;
    overlay.addEventListener("click", () => hideModal(type));
    document.body.appendChild(overlay);
  }
  return overlay;
}

function clearModalTimeout(type) {
  if (state.turnModalTimeouts[type]) {
    clearTimeout(state.turnModalTimeouts[type]);
    delete state.turnModalTimeouts[type];
  }
}

function scheduleModalHide(type, duration, callback) {
  clearModalTimeout(type);
  if (callback) {
    state.turnModalCallbacks[type] = callback;
  } else {
    delete state.turnModalCallbacks[type];
  }
  if (typeof duration !== "number" || duration <= 0) return;
  state.turnModalTimeouts[type] = setTimeout(() => {
    delete state.turnModalTimeouts[type];
    hideModal(type);
  }, duration);
}

function showModal(type, text) {
  const config = TURN_MODAL_CONFIG[type];
  if (!config) return null;
  Object.keys(TURN_MODAL_CONFIG).forEach((key) => {
    if (key !== type) hideModal(key, { runCallback: false });
  });
  const overlay = ensureTurnModal(type);
  if (!overlay) return null;
  const textEl = overlay.querySelector(".versus-turn-text");
  if (textEl) textEl.textContent = text || config.defaultText;
  overlay.classList.remove("hidden");
  overlay.setAttribute("aria-hidden", "false");
  const banner = overlay.querySelector(".versus-turn-banner");
  if (banner) {
    banner.classList.remove("animate");
    void banner.offsetWidth;
    banner.classList.add("animate");
  }
  return overlay;
}

function hideModal(type, { runCallback = true } = {}) {
  const config = TURN_MODAL_CONFIG[type];
  if (!config) return;
  const overlay = document.getElementById(config.id);
  const callback = state.turnModalCallbacks[type];
  if (!overlay) {
    if (runCallback && typeof callback === "function") {
      delete state.turnModalCallbacks[type];
      try { callback(); } catch (err) { console.warn("[Versus] turn modal callback failed", err); }
    } else {
      delete state.turnModalCallbacks[type];
    }
    return;
  }
  clearModalTimeout(type);
  overlay.classList.add("hidden");
  overlay.setAttribute("aria-hidden", "true");
  if (runCallback && typeof callback === "function") {
    delete state.turnModalCallbacks[type];
    try { callback(); } catch (err) { console.warn("[Versus] turn modal callback failed", err); }
  } else {
    delete state.turnModalCallbacks[type];
  }
}

function hideAllTurnModals(options = { runCallback: false }) {
  Object.keys(TURN_MODAL_CONFIG).forEach((type) => hideModal(type, options));
}

function queueTurnModal(turnNumber, mine) {
  state.pendingTurnModal = { turnNumber, mine };
}

function flushPendingTurnModal() {
  if (!state.pendingTurnModal) return;
  const { turnNumber, mine } = state.pendingTurnModal;
  state.pendingTurnModal = null;
  if (mine) {
    showTurnModal(turnNumber);
  } else {
    showOpponentModal();
  }
}

function showTurnModal(turnNumber) {
  state.pendingTurnModal = null;
  showModal(TURN_MODAL_TYPES.YOUR_TURN);
  state.turnNoticeShownFor = turnNumber;
  scheduleModalHide(TURN_MODAL_TYPES.YOUR_TURN, TURN_MODAL_CONFIG[TURN_MODAL_TYPES.YOUR_TURN].duration);
}

function showOpponentModal() {
  state.pendingTurnModal = null;
  state.showingOpponentModal = true;
  state.holdHideBanner = true;
  showModal(TURN_MODAL_TYPES.OPPONENT_TURN);
  scheduleModalHide(
    TURN_MODAL_TYPES.OPPONENT_TURN,
    TURN_MODAL_CONFIG[TURN_MODAL_TYPES.OPPONENT_TURN].duration,
    () => {
      state.showingOpponentModal = false;
      state.holdHideBanner = false;
    },
  );
}

function showBattleStartModal(onComplete) {
  state.holdHideBanner = true;
  state.showingOpponentModal = false;
  showModal(TURN_MODAL_TYPES.BATTLE_START);
  scheduleModalHide(
    TURN_MODAL_TYPES.BATTLE_START,
    TURN_MODAL_CONFIG[TURN_MODAL_TYPES.BATTLE_START].duration,
    () => {
      state.holdHideBanner = false;
      if (typeof onComplete === "function") onComplete();
    },
  );
}

function hideTurnModal() {
  hideAllTurnModals({ runCallback: false });
  state.pendingTurnModal = null;
  state.holdHideBanner = false;
  state.showingOpponentModal = false;
}

function onTick() {
  const d = state.roomData;
  if (!d) return;

  if (d.status === "playing") {
    const left = (d.endsAt || 0) - now();
    const mine = d.turnOf === state.me;
    setGameStatus(`${mine ? "あなた" : "相手"}の番です（残り ${fmtClock(left)}）`);
    if (left <= 0 && (now() - (state.lastAdvanceAttempt || 0) > 1500)) {
      state.lastAdvanceAttempt = now();
      forceAdvanceTurnIfExpired().catch(()=>{});
    }
  }
}

async function joinRoomByCode(code) {
  state.me   = getRoomScopedId(code);
  state.roomId = code;
  state.code   = code;
  return { roomId: code };
}

function opponentId(players, me) {
  const a = (players||[]).map(p=>p.id);
  return a.find(id => id !== me) || null;
}

async function maybeStartMatch(roomRef) {
  await runTransaction(ensureDB(), async (tx) => {
    const rs = await tx.get(roomRef);
    const data = rs.data();
    if (data.status !== "lobby") return;

    const players = Array.isArray(data.players) ? data.players : [];
    if (players.length !== 2) return;

    const creator = data.creatorId;
    const creatorIn = creator && players.some(p => p.id === creator);
    const first = creatorIn ? creator : players[0]?.id;

    const seed = Math.floor(Math.random() * 2**31);
    const endsAt = now() + V90;
    tx.update(roomRef, { status: "playing", seed, turnOf: first, turnNumber: 1, endsAt });
  });
}

function listenRoom(onState, onGuess) {
  const db = ensureDB();
  const roomRef = doc(db, "rooms", state.roomId);

  const getBaseId = () => state.me || (typeof getPlayerId === "function" ? getPlayerId() : null);
  const scopedKey = (rid) => `pg-room-${rid}-pid`;
  const getScopedId = () => {
    try { return sessionStorage.getItem(scopedKey(state.roomId)); } catch { return null; }
  };
  const setScopedId = (id) => { try { sessionStorage.setItem(scopedKey(state.roomId), id); } catch {} };
  const genAltId = (base) => `${base}:${Math.random().toString(16).slice(2, 6)}`;
  const fmtClock = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    const mm = String(Math.floor(s / 60)).padStart(1, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  };

  try { state.unsubRoom && state.unsubRoom(); } catch {}
  try { state.unsubGuesses && state.unsubGuesses(); } catch {}
  try { state.unsubSkills && state.unsubSkills(); } catch {}
  state.unsubRoom = null;
  state.unsubGuesses = null;
  state.unsubSkills = null;

  state.unsubRoom = onSnapshot(roomRef, async (snap) => {
    if (!snap.exists()) {
      hideInputArea();
      hideResultsArea();
      setGameTitle("対戦ロビー");
      setGameStatus("ホストの準備を待っています…");
      state.roomData = null;
      updateSkillUI(null);
      clearHistoryMask();
      resetSkillState();
      return;
    }

    const data = snap.data() || {};
    const prevStatus = state.roomData ? state.roomData.status : null;
    state.roomData = data;

    if (!state.correct) {
      if (DEBUG_FIXED_ANSWER) {
        const fixed = Object.values(allPokemonData).find(p => p.id === 149) || Object.values(allPokemonData)[0];
        state.correct = fixed;
      } else {
        state.correct = chooseAnswerBySeed(data.seed || 0);
      }
    }

    if (data.status === "lobby") {
      const players = Array.isArray(data.players) ? data.players : [];
      const baseId = getBaseId();
      let myScoped = getScopedId() || state.me || baseId;

      state.turnNoticeShownFor = null;
      state.resultModalShown = false;
      hideTurnModal();
      updateSkillUI(null);
      clearHistoryMask();
      resetSkillState();

      const hasExact = players.some(p => p.id === myScoped);
      const hasBase  = baseId && players.some(p => p.id === baseId);
      if (!hasExact && players.length < 2 && baseId) {
        if (myScoped === baseId && hasBase) myScoped = genAltId(baseId);
        try {
          await runTransaction(db, async (tx) => {
            const cur = await tx.get(roomRef);
            if (!cur.exists()) return;
            const r = cur.data() || {};
            const ps = Array.isArray(r.players) ? [...r.players] : [];
            if (ps.some(p => p.id === myScoped)) return;
            if (ps.length >= 2) return;
            ps.push({ id: myScoped, joinedAt: Date.now() });
            const patch = { players: ps };
            if (!r.creatorId) patch.creatorId = (data.creatorId || myScoped);
            tx.update(roomRef, patch);
          });
          state.me = myScoped;
          setScopedId(myScoped);
        } catch (e) {
          console.warn("[Versus] auto-join failed", e);
        }
      }

      const iAmCreator = data.creatorId && state.me && state.me === data.creatorId;
      const iAmFallbackStarter = !data.creatorId && state.me && players[0]?.id === state.me;
      if (players.length === 2 && (iAmCreator || iAmFallbackStarter)) {
        try {
          await maybeStartMatch(roomRef);
        } catch (err) {
          if (!(err && err.code === "failed-precondition")) {
            console.warn("[Versus] maybeStartMatch failed", err);
          }
        }
      }

      hideInputArea();
      hideResultsArea();
      setGameTitle("対戦ロビー");
      setGameStatus((data.players?.length || 0) >= 2 ? "準備中…" : "相手の参加を待っています…");
    }

    if (data.status === "playing") {
      hideLobby();
      hideRandomStartButton();
      showInputArea();
      showResultsArea();
      hidePostGameActions();
      state.resultModalShown = false;
      if (prevStatus !== "playing") {
        resetSkillState();
        clearHistoryMask();
      }

      setGameTitle("対戦モード");

      const left = (data.endsAt || 0) - now();
      const mine = data.turnOf === state.me;
      setGameStatus(`${mine ? "あなた" : "相手"}の番です（残り ${fmtClock(left)}）`);
      updateSkillUI(data);

      const currentTurn = data.turnNumber || 1;
      if (prevStatus !== "playing") {
        if ((currentTurn || 0) <= 1) {
          queueTurnModal(currentTurn, mine);
          showBattleStartModal(() => flushPendingTurnModal());
        } else if (mine) {
          showTurnModal(currentTurn);
        } else {
          showOpponentModal();
        }
      } else if (mine && state.turnNoticeShownFor !== currentTurn && !state.pendingTurnModal) {
        showTurnModal(currentTurn);
      } else if (!mine && !state.holdHideBanner && !state.showingOpponentModal && !state.pendingTurnModal) {
        hideTurnModal();
      }

      try { startInterval && startInterval(); } catch {}
    }

    if (data.status === "ended") {
      try { stopInterval && stopInterval(); } catch {}
      const win = data.winner === state.me;
      setGameTitle("対戦モード");
      showResultsArea();
      setGameStatus(`対戦終了：${win ? "Win" : "Lose"}`);
      hideTurnModal();
      state.turnNoticeShownFor = null;
      hideInputArea();
      updateSkillUI(null);
      clearHistoryMask();
      if (!state.resultModalShown && state.correct) {
        const verdict = win ? "勝利" : "敗北";
        showResultModal(state.correct, verdict, "versus", 0);
        state.resultModalShown = true;
      }
    }

    onState && onState(data);
  });

  const q = query(collection(roomRef, "guesses"), orderBy("ts", "asc"));
  state.unsubGuesses = onSnapshot(q, (qs) => {
    qs.docChanges().forEach((ch) => {
      if (ch.type !== "added") return;
      const g = ch.doc.data();

      if (onGuess) {
        onGuess(g);
        return;
      }

      if (g.masked && g.by !== state.me) {
        renderMaskedVersusGuess(false);
        return;
      }

      const guessed = Object.values(allPokemonData).find(p => p.id === g.id);
      if (!guessed || !state.correct) return;
      const result = comparePokemon(guessed, state.correct);
      const row = renderResult(guessed, result, "classic", !!g.isCorrect);

      const targetRow = row || document.querySelector(".result-row");
      if (targetRow) {
        targetRow.classList.add(g.by === state.me ? "by-me" : "by-opponent");
        const trig = targetRow.querySelector(".accordion-trigger");
        if (trig && trig.hasAttribute("disabled")) trig.removeAttribute("disabled");
      }
    });
  });

  const skillsRef = query(collection(roomRef, "skills"), orderBy("ts", "asc"));
  state.unsubSkills = onSnapshot(skillsRef, {
    next: (qs) => {
    qs.docChanges().forEach((ch) => {
      if (ch.type !== "added") return;
      handleSkillEvent(ch.doc.data());
    });
      },
      error: (e) => {
        console.warn("[Versus] skills listener error", e);
        const bar = document.getElementById("versus-skill-bar");
        if (bar) bar.classList.add("hidden");
        showToast("権限エラー：スキルの同期が無効です");
      }
    });
}


async function postGuess(guessName) {
  const rs = await getDoc(doc(ensureDB(), "rooms", state.roomId));
  if (!rs.exists()) return;
  const data = rs.data();
  if (data.status !== "playing") return;
  if (data.turnOf !== state.me) return;

  const guessed = Object.values(allPokemonData).find(p => p.name === guessName);
  if (!guessed) return;

  const isCorrect = (state.correct && guessed.id === state.correct.id);
  const turnNumber = data.turnNumber || 1;
  const shouldMask = state.skillEffects.maskNextGuessTurn === turnNumber;
  const extraTurnActive = state.skillEffects.extraTurnForTurn === turnNumber;

  await addDoc(collection(ensureDB(), "rooms", state.roomId, "guesses"), {
    by: state.me,
    name: guessed.name,
    id: guessed.id,
    isCorrect,
    masked: shouldMask,
    turnNumber,
    ts: serverTimestamp()
  });

  if (shouldMask && state.skillEffects.maskNextGuessTurn === turnNumber) {
    state.skillEffects.maskNextGuessTurn = null;
  }

  if (isCorrect) {
    const roomRef = doc(ensureDB(), "rooms", state.roomId);
    await runTransaction(ensureDB(), async (tx) => {
      const s = await tx.get(roomRef);
      const r = s.data();
      if (r.status === "playing") {
        tx.update(roomRef, { status: "ended", winner: state.me, endedAt: serverTimestamp() });
      }
    });
  } else {
    const roomRef = doc(ensureDB(), "rooms", state.roomId);
    await runTransaction(ensureDB(), async (tx) => {
      const s = await tx.get(roomRef);
      if (!s.exists()) return;
      const r = s.data();
      if (r.status !== "playing") return;
      if (r.turnOf !== state.me) return;
      if (extraTurnActive) {
        tx.update(roomRef, {
          turnOf: state.me,
          turnNumber: (r.turnNumber || 1) + 1,
          endsAt: now() + V90
        });
      } else {
        const other = opponentId(r.players, state.me) || state.me;
        tx.update(roomRef, {
          turnOf: other,
          turnNumber: (r.turnNumber || 1) + 1,
          endsAt: now() + V90
        });
      }
    });
    if (!extraTurnActive) showOpponentModal();
  }

  if (extraTurnActive && state.skillEffects.extraTurnForTurn === turnNumber) {
    state.skillEffects.extraTurnForTurn = null;
  }
}


async function forceAdvanceTurnIfExpired() {
  const roomRef = doc(ensureDB(), "rooms", state.roomId);
  await runTransaction(ensureDB(), async (tx) => {
    const rs = await tx.get(roomRef);
    if (!rs.exists()) return;
    const data = rs.data();
    if (data.status !== "playing") return;
    if (now() <= (data.endsAt || 0)) return;
    const players = data.players || [];
    const other = opponentId(players, data.turnOf) || data.turnOf;
    tx.update(roomRef, {
      turnOf: other,
      turnNumber: (data.turnNumber || 1) + 1,
      endsAt: now() + V90
    });
  });
}

function boot() {
  state.me = state.me || BASE_PLAYER_ID;
  resetSkillState();
  clearHistoryMask();
  updateSkillUI(null);

  const html = `
    <div class="vlobby-card">
      <div class="vlobby-body">
        <!-- ルーム作成 -->
        <section class="vlobby-panel vlobby-create">
          <h4 class="vlobby-panel-title">ルームを作成</h4>
          <p class="vlobby-panel-description">表示されたコードを共有してください</p>
            <div class="vlobby-code">
              <span id="vs-my-code">------</span>
            </div>
            <div class="vlobby-actions">
              <button id="vs-create" class="vlobby-btn primary">コード生成</button>
            </div>
        </section>
      <div class="vlobby-divider" role="presentation"><span>or</span></div>
        <!-- ルーム参加 -->
        <section class="vlobby-panel vlobby-join">
          <h4 class="vlobby-panel-title">ルームに参加</h4>
          <p class="vlobby-panel-description">コード（数字6桁）を入力してください</p>
          <div class="vlobby-join-input">
            <input
              id="vs-code"
              class="vlobby-input"
              inputmode="numeric"
              pattern="\\d{6}"
              maxlength="6"
              autocomplete="one-time-code"
              placeholder="123456"
              aria-label="6桁のルームコード"
            />
          </div>
          <div class="vlobby-actions">
            <button id="vs-join" class="vlobby-btn ghost small">参加する</button>
          </div>
          <p id="vlobby-error" class="vlobby-error" aria-live="polite" style="display:none;"></p>
        </section>
      </div>
    </div>

  `;
  setLobbyContent(html);

  const root = ensureLobbyRoot();

  const syncNetUI = () => {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    root.querySelectorAll('#vs-create, #vs-join, #vs-code')
      .forEach(el => { if (el) el.disabled = offline; });
    setGameStatus(offline
      ? 'オフラインです'
      : 'ルームを作成 or ルームに参加');
  };
  window.addEventListener('online',  syncNetUI);
  window.addEventListener('offline', syncNetUI);
  syncNetUI();

  root.addEventListener("click", async (ev) => {
    const btn = ev.target.closest("#vs-create, #vs-join");
    if (!btn) return;

    if (btn.id === "vs-create") {
      const { code } = await createRoom();
      const created  = root.querySelector("#create-result");
      const codeSpan = root.querySelector("#vs-my-code");
      if (created)  created.style.display = "";
      if (codeSpan) codeSpan.textContent = code;

      listenRoom(handleRoomState, handleGuessAdded);
      return;
    }

    if (btn.id === "vs-join") {
      const input = root.querySelector("#vs-code");
      const code = (input?.value || "").trim();
      if (!/^\d{6}$/.test(code)) { alert("6桁の数字を入力してください"); return; }

      await joinRoomByCode(code);
      listenRoom(handleRoomState, handleGuessAdded);
      return;
    }
  });
}

function handleRoomState(_data) {

}

function handleGuessAdded(g) {
  if (g.masked && g.by !== state.me) {
    renderMaskedVersusGuess(false);
    return;
  }

  const guessed = Object.values(allPokemonData).find(p => p.id === g.id);
  if (!guessed || !state.correct) return;
  const result = comparePokemon(guessed, state.correct);

  const row = renderResult(guessed, result, "classic", !!g.isCorrect);

  const targetRow = row || document.querySelector(".result-row");
  if (targetRow) {
    targetRow.classList.add(g.by === state.me ? "by-me" : "by-opponent");
    const trig = targetRow.querySelector(".accordion-trigger");
    if (trig && trig.hasAttribute("disabled")) trig.removeAttribute("disabled");
  }
}


function handleGuess(guessRaw) {
  const name = (guessRaw || "").trim();
  if (!name) return;
  postGuess(name).catch((e)=> console.warn("[Versus] postGuess failed", e));
}

async function claimRoomAsync(code) {
  const me = state.me;
  const roomRef = doc(ensureDB(), "rooms", code);
  try {
    await runTransaction(ensureDB(), async (tx) => {
      const rs = await tx.get(roomRef);
      if (rs.exists()) {
        const data = rs.data() || {};
        const players = Array.isArray(data.players) ? [...data.players] : [];
        if (!players.some(p => p.id === me) && players.length < 2) {
          players.push({ id: me, joinedAt: Date.now() });
        }
        tx.update(roomRef, {
          players,
          creatorId: data.creatorId || me,
        });
      } else {
        tx.set(roomRef, {
          code,
          status: "lobby",
          creatorId: me,
          players: [{ id: me, joinedAt: Date.now() }],
          createdAt: serverTimestamp(),
        });
      }
    });
  } catch (e) {
    console.warn("[Versus] claimRoomAsync failed", e);
  }
}

async function createRoom() {
  const me = state.me;
  const code = sixDigit();
  state.roomId = code;
  state.code   = code;
  claimRoomAsync(code);
  return { roomId: code, code };
}

function teardown() {
  try { stopInterval(); } catch {}
  try { state.unsubRoom && state.unsubRoom(); } catch {}
  try { state.unsubGuesses && state.unsubGuesses(); } catch {}
  try { state.unsubSkills && state.unsubSkills(); } catch {}
  state.unsubRoom = null;
  state.unsubGuesses = null;
  state.unsubSkills = null;

  const root = document.getElementById('versus-lobby-area');
  if (root && root.parentNode) {
    root.parentNode.removeChild(root);
  }

  const skillBar = document.getElementById('versus-skill-bar');
  if (skillBar) skillBar.classList.add('hidden');
  clearHistoryMask();
  resetSkillState();
  hideTurnModal();

  state.turnNoticeShownFor = null;
  state.resultModalShown = false;
  state.turnModalTimeouts = {};
  state.turnModalCallbacks = {};
  state.pendingTurnModal = null;

  state.roomId = null; 
  state.code = null;
  state.correct = null;
}

export const PGVersus = { boot, handleGuess, forceAdvanceTurnIfExpired, teardown };
globalThis._pgVersus = PGVersus;
