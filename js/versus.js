// vs: Firestore-backed Versus mode (MVP, hardened)
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
} from "./dom.js";

// --- Firebase (modular) ---
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  initializeFirestore, doc, getDoc, runTransaction,
  onSnapshot, serverTimestamp, collection, addDoc, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const V90 = 90 * 1000; // 90s per turn

// ▼ 開発時固定（本番は false 推奨）
const DEBUG_FIXED_ANSWER = true;

// ---------- helpers ----------
function ensureFirebase() {
  if (getApps().length) return getApps()[0];
  if (globalThis.firebaseApp) return globalThis.firebaseApp;
  if (!globalThis.FIREBASE_CONFIG) return null;
  return initializeApp(globalThis.FIREBASE_CONFIG);
}

function now() { return Date.now(); }

// 追加：状態（UI更新用）
const state = {
  roomId: null,
  code: null,
  me: null,
  correct: null,
  unsubRoom: null,
  unsubGuesses: null,
  interval: null,                  // ← UI/交代監視のtick
  roomData: null,                  // ← 最新のroomスナップショット
  lastAdvanceAttempt: 0,           // ← 連打防止
  turnNoticeShownFor: null,
  turnModalTimeout: null,
  resultModalShown: false,
};

// 既存：getPlayerId() はそのまま利用
const BASE_PLAYER_ID = getPlayerId(); // localStorage の共通ID（タブ間共通）

function roomScopedIdKey(roomId) { return `pg-room-${roomId}-pid`; }
function getRoomScopedId(roomId) {
  const k = roomScopedIdKey(roomId);
  return sessionStorage.getItem(k) || BASE_PLAYER_ID; // 既に割当があればそれを使う
}
function setRoomScopedId(roomId, id) {
  sessionStorage.setItem(roomScopedIdKey(roomId), id);
}
function genAltId(base) {
  const suffix = Math.random().toString(16).slice(2, 6); // 4桁
  return `${base}:${suffix}`;
}


// 追加：mm:ss 整形
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
        // RFC4122 v4
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

// --------- minimal UI helpers (lobby, toast) ----------
function ensureLobbyRoot() {
  let root = document.getElementById("versus-lobby-area");
  if (!root) {
    root = document.createElement("div");
    root.id = "versus-lobby-area";

    const header  = document.getElementById("game-header-area");
    const results = document.getElementById("results-area");

    if (results && results.parentNode) {
      // results の直前に差し込む → header と results の“間”になる
      results.parentNode.insertBefore(root, results);
    } else if (header && header.parentNode) {
      // 安全策：header の直後に入れる
      header.parentNode.insertBefore(root, header.nextSibling);
    } else {
      // 最後の保険：game-container 先頭 or body 末尾
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

// ------------- Firestore Core ---------------
let app = null;
let db  = null;

function ensureDB(){
  if (db) return db;
  app = ensureFirebase();
  if (!app) throw new Error("Firebase 未初期化です。window.FIREBASE_CONFIG を設定してください。");
  // 不安定回線/プロキシ対策（長ポーリングへ自動フォールバック）
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

function ensureTurnModal() {
  let overlay = document.getElementById("versus-turn-modal");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "versus-turn-modal";
    overlay.className = "hidden";
    overlay.innerHTML = `
      <div class="versus-turn-modal-content" role="alertdialog" aria-live="assertive">
        <p>あなたの番です</p>
      </div>
    `;
    overlay.addEventListener("click", hideTurnModal);
    document.body.appendChild(overlay);
  }
  return overlay;
}

function showTurnModal(turnNumber) {
  const overlay = ensureTurnModal();
  overlay.classList.remove("hidden");
  overlay.setAttribute("aria-hidden", "false");
  state.turnNoticeShownFor = turnNumber;
  if (state.turnModalTimeout) {
    clearTimeout(state.turnModalTimeout);
  }
  state.turnModalTimeout = setTimeout(() => {
    hideTurnModal();
  }, 1500);
}

function hideTurnModal() {
  const overlay = document.getElementById("versus-turn-modal");
  if (!overlay) return;
  overlay.classList.add("hidden");
  overlay.setAttribute("aria-hidden", "true");
  if (state.turnModalTimeout) {
    clearTimeout(state.turnModalTimeout);
    state.turnModalTimeout = null;
  }
}

function onTick() {
  const d = state.roomData;
  if (!d) return;

  // ① 残り時間の表示
  if (d.status === "playing") {
    const left = (d.endsAt || 0) - now();
    const mine = d.turnOf === state.me;
    setGameStatus(`${mine ? "あなた" : "相手"}の番です（残り ${fmtClock(left)}）`);
    // 期限超過 → 交代を一度だけ試みる（スパム防止）
    if (left <= 0 && (now() - (state.lastAdvanceAttempt || 0) > 1500)) {
      state.lastAdvanceAttempt = now();
      forceAdvanceTurnIfExpired().catch(()=>{});
    }
  }
}

// 置換：即時に roomId をセットして返す。実参加は listenRoom 側で自動実行。
async function joinRoomByCode(code) {
  state.me   = getRoomScopedId(code);
  state.roomId = code;
  state.code   = code;
  return { roomId: code }; // 即返却
}

function opponentId(players, me) {
  const a = (players||[]).map(p=>p.id);
  return a.find(id => id !== me) || null;
}

// 置換：creatorId が参加者に含まれていれば先手、それ以外は配列先頭。
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


// 置換：rooms/{code} を監視し、lobbyで自分が未登録ならTxで即参加。
// 参加2名が揃ったら先手=creatorId（なければ先頭）で開始。
// そのまま置き換え
function listenRoom(onState, onGuess) {
  const db = ensureDB();
  const roomRef = doc(db, "rooms", state.roomId);

  // --- 内部ヘルパー（この部屋での一意ID管理 & 時計表示） ---
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

  // 既存購読を解除してから再購読
  try { state.unsubRoom && state.unsubRoom(); } catch {}
  try { state.unsubGuesses && state.unsubGuesses(); } catch {}
  state.unsubRoom = null;
  state.unsubGuesses = null;

  // ---- rooms/{roomId} を購読 ----
  state.unsubRoom = onSnapshot(roomRef, async (snap) => {
    if (!snap.exists()) {
      // ホストがdocを作るまで待機
      hideInputArea();
      hideResultsArea();
      setGameTitle("対戦ロビー");
      setGameStatus("ホストの準備を待っています…");
      state.roomData = null;
      return;
    }

    const data = snap.data() || {};
    state.roomData = data;

    // 正解の共有（初回のみ）
    if (!state.correct) {
      if (DEBUG_FIXED_ANSWER) {
        const fixed = Object.values(allPokemonData).find(p => p.id === 149) || Object.values(allPokemonData)[0];
        state.correct = fixed;
      } else {
        state.correct = chooseAnswerBySeed(data.seed || 0);
      }
    }

    // ===== LOBBY =====
    if (data.status === "lobby") {
      const players = Array.isArray(data.players) ? data.players : [];
      const baseId = getBaseId();
      let myScoped = getScopedId() || state.me || baseId;

      state.turnNoticeShownFor = null;
      state.resultModalShown = false;
      hideTurnModal();

      // 自動ジョイン：自分が未登録 & 空きあり → 参加
      const hasExact = players.some(p => p.id === myScoped);
      const hasBase  = baseId && players.some(p => p.id === baseId);
      if (!hasExact && players.length < 2 && baseId) {
        // 同一ブラウザ2タブ対策：ベースIDが既に居る時は alt ID を採番
        if (myScoped === baseId && hasBase) myScoped = genAltId(baseId);
        try {
          await runTransaction(db, async (tx) => {
            const cur = await tx.get(roomRef);
            if (!cur.exists()) return;
            const r = cur.data() || {};
            const ps = Array.isArray(r.players) ? [...r.players] : [];
            if (ps.some(p => p.id === myScoped)) return; // すでに入っていれば何もしない
            if (ps.length >= 2) return;                  // 満員
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

      // 2人揃えば開始判定（creatorId優先は maybeStartMatch 側で処理）
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

    // ===== PLAYING =====
    if (data.status === "playing") {
      hideLobby();
      hideRandomStartButton();
      showInputArea();
      showResultsArea();
      hidePostGameActions();
      state.resultModalShown = false;

      setGameTitle("対戦モード");

      // 残り時間を即表示（連続更新は startInterval に任せる実装でもOK）
      const left = (data.endsAt || 0) - now();
      const mine = data.turnOf === state.me;
      setGameStatus(`${mine ? "あなた" : "相手"}の番です（残り ${fmtClock(left)}）`);

      const currentTurn = data.turnNumber || 1;
      if (mine && state.turnNoticeShownFor !== currentTurn) {
        showTurnModal(currentTurn);
      } else if (!mine) {
        hideTurnModal();
      }

      try { startInterval && startInterval(); } catch {}
    }

    // ===== ENDED =====
    if (data.status === "ended") {
      try { stopInterval && stopInterval(); } catch {}
      const win = data.winner === state.me;
      setGameTitle("対戦モード");
      showResultsArea();
      setGameStatus(`対戦終了：${win ? "Win" : "Lose"}`);
      hideTurnModal();
      state.turnNoticeShownFor = null;
      hideInputArea();
      if (!state.resultModalShown && state.correct) {
        const verdict = win ? "勝利" : "敗北";
        showResultModal(state.correct, verdict, "versus", 0);
        state.resultModalShown = true;
      }
    }

    onState && onState(data);
  });

  // ---- guesses を購読（追加分だけ処理） ----
  const q = query(collection(roomRef, "guesses"), orderBy("ts", "asc"));
  state.unsubGuesses = onSnapshot(q, (qs) => {
    qs.docChanges().forEach((ch) => {
      if (ch.type !== "added") return;
      const g = ch.doc.data();

      if (onGuess) {
        onGuess(g);
        return;
      }

      // フォールバック（onGuess未提供でも動くように）
      const guessed = Object.values(allPokemonData).find(p => p.id === g.id);
      if (!guessed || !state.correct) return;
      const result = comparePokemon(guessed, state.correct);
      const row = renderResult(guessed, result, "classic", !!g.isCorrect);

      // あなた=赤／相手=青。アコーディオンのdisabledグレー化を無効化
      const targetRow = row || document.querySelector(".result-row");
      if (targetRow) {
        targetRow.classList.add(g.by === state.me ? "by-me" : "by-opponent");
        const trig = targetRow.querySelector(".accordion-trigger");
        if (trig && trig.hasAttribute("disabled")) trig.removeAttribute("disabled");
      }
    });
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

  await addDoc(collection(ensureDB(), "rooms", state.roomId, "guesses"), {
    by: state.me,
    name: guessed.name,
    id: guessed.id,
    isCorrect,
    ts: serverTimestamp()
  });

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
    // ② 不正解なら即ターン交代（1手1回答ルール）
    const roomRef = doc(ensureDB(), "rooms", state.roomId);
    await runTransaction(ensureDB(), async (tx) => {
      const s = await tx.get(roomRef);
      if (!s.exists()) return;
      const r = s.data();
      if (r.status !== "playing") return;
      if (r.turnOf !== state.me) return; // 競合安全
      const other = opponentId(r.players, state.me) || state.me;
      tx.update(roomRef, {
        turnOf: other,
        turnNumber: (r.turnNumber || 1) + 1,
        endsAt: now() + V90
      });
    });
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

// ---- public bootstrap ----
function boot() {
  state.me = state.me || BASE_PLAYER_ID;  // 遅延初期化

  const html = `
    <div class="vlobby">
      <div class="vlobby-card">
        <div class="vlobby-body">
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
        <div class="vlobby-divider" role="presentation"><span>or</span></div>
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
        </div>
      </div>
    </div>

  `;
  setLobbyContent(html);

  // クリック委譲で安全にイベントを束ねる（nullに対してonclickしない）
  const root = ensureLobbyRoot();

  // --- ネットワーク状態をUIに反映 ---
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

    // クリック委譲の中だけ置換
    if (btn.id === "vs-create") {
      // 即時発行
      const { code } = await createRoom(); // ← 即返却
      const created  = root.querySelector("#create-result");
      const codeSpan = root.querySelector("#vs-my-code");
      if (created)  created.style.display = "";
      if (codeSpan) codeSpan.textContent = code;

      // すぐ監視開始（docは後から現れてOK）
      listenRoom(handleRoomState, handleGuessAdded);
      return;
    }

    if (btn.id === "vs-join") {
      const input = root.querySelector("#vs-code");
      const code = (input?.value || "").trim();
      if (!/^\d{6}$/.test(code)) { alert("6桁の数字を入力してください"); return; }

      await joinRoomByCode(code);                // 即返却
      listenRoom(handleRoomState, handleGuessAdded); // すぐ監視開始
      return;
    }
  });
}

function handleRoomState(_data) {
  // UIは listenRoom 内で更新済み
}

function handleGuessAdded(g) {
  const guessed = Object.values(allPokemonData).find(p => p.id === g.id);
  if (!guessed || !state.correct) return;
  const result = comparePokemon(guessed, state.correct);

  const row = renderResult(guessed, result, "classic", !!g.isCorrect);

  // ③ 行に「あなた/相手」の配色クラスを付与 & 誤ってdisabledなら解除
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

// 追加：作成者が裏で rooms/{code} を確保（なければ作成、あればplayersに自分を反映）
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

// 置換：押した瞬間に code を返す。Firestore確保は裏で開始。
async function createRoom() {
  const me = state.me;
  const code = sixDigit();           // 6桁生成（先頭0可）
  state.roomId = code;
  state.code   = code;
  // Firestore確保は待たない（UIは即返し）
  claimRoomAsync(code);              // 裏で確保を走らせる
  return { roomId: code, code };     // ← 即返却
}


// ---- 末尾の export の少し上あたりに追加 ----
function teardown() {
  try { stopInterval(); } catch {}
  try { state.unsubRoom && state.unsubRoom(); } catch {}
  try { state.unsubGuesses && state.unsubGuesses(); } catch {}
  state.unsubRoom = null;
  state.unsubGuesses = null;

  // UIを完全撤去（イベント委譲ごと破棄）
  const root = document.getElementById('versus-lobby-area');
  if (root && root.parentNode) {
    root.parentNode.removeChild(root);
  }

  hideTurnModal();
  state.turnNoticeShownFor = null;
  state.resultModalShown = false;
  if (state.turnModalTimeout) {
    clearTimeout(state.turnModalTimeout);
    state.turnModalTimeout = null;
  }

  // 状態リセット（次回 boot で再初期化される）
  state.roomId = null;
  state.code = null;
  state.correct = null;
}

// 既存の export に teardown を足す
export const PGVersus = { boot, handleGuess, forceAdvanceTurnIfExpired, teardown };
globalThis._pgVersus = PGVersus;
