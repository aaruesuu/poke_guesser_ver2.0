import { formatDebut, formatGenderRate } from "./utils.js";

const COMMON_HINTS = [
  {
    key: "debut",
    label: "初登場作品（世代）",
    getValue: (pokemon) => formatDebut(pokemon.debutGen, pokemon.debutTitle) || "—",
  },
  {
    key: "totalStats",
    label: "合計種族値",
    getValue: (pokemon) => {
      const stats = pokemon.stats || {};
      const total =
        (stats.hp || 0) +
        (stats.attack || 0) +
        (stats.defense || 0) +
        (stats.spAttack || 0) +
        (stats.spDefense || 0) +
        (stats.speed || 0);
      return total || total === 0 ? String(total) : "—";
    },
  },
  {
    key: "types",
    label: "タイプ",
    getValue: (pokemon) => formatCombined([pokemon.type1, pokemon.type2]),
  },
  {
    key: "abilities",
    label: "特性",
    getValue: (pokemon) => formatCombined([pokemon.ability1, pokemon.ability2, pokemon.hiddenAbility]),
  },
  {
    key: "height",
    label: "高さ",
    getValue: (pokemon) => (pokemon.height ? `${pokemon.height} m` : "—"),
  },
  {
    key: "weight",
    label: "重さ",
    getValue: (pokemon) => (pokemon.weight ? `${pokemon.weight} kg` : "—"),
  },
  {
    key: "genderRate",
    label: "性別比",
    getValue: (pokemon) => formatGenderRate(pokemon.genderRate),
  },
  {
    key: "evolutionCount",
    label: "進化数",
    getValue: (pokemon) =>
      typeof pokemon.evolutionCount === "number" ? String(pokemon.evolutionCount) : "—",
  },
  {
    key: "eggGroups",
    label: "タマゴグループ",
    getValue: (pokemon) => formatCombined([pokemon.eggGroup1, pokemon.eggGroup2]),
  },
];

const STATS_HINTS = [
  { key: "stats.hp", label: "HP", getValue: (pokemon) => safeStat(pokemon, "hp") },
  { key: "stats.attack", label: "こうげき", getValue: (pokemon) => safeStat(pokemon, "attack") },
  { key: "stats.defense", label: "ぼうぎょ", getValue: (pokemon) => safeStat(pokemon, "defense") },
  { key: "stats.spAttack", label: "とくこう", getValue: (pokemon) => safeStat(pokemon, "spAttack") },
  { key: "stats.spDefense", label: "とくぼう", getValue: (pokemon) => safeStat(pokemon, "spDefense") },
  { key: "stats.speed", label: "すばやさ", getValue: (pokemon) => safeStat(pokemon, "speed") },
];

function formatCombined(items) {
  const filtered = (items || []).filter((item) => item && item !== "なし");
  return filtered.length > 0 ? filtered.join(" / ") : "—";
}

function safeStat(pokemon, key) {
  const stats = pokemon.stats || {};
  const value = stats[key];
  return typeof value === "number" ? String(value) : "—";
}

function normalizeMode(mode) {
  if (mode === "stats") return "stats";
  return "classic";
}

function collectDefinitions(mode) {
  const normalized = normalizeMode(mode);
  if (normalized === "stats") {
    return [...COMMON_HINTS, ...STATS_HINTS];
  }
  return [...COMMON_HINTS];
}

function ensureElements() {
  const overlay = document.getElementById("hint-modal-overlay");
  const modal = document.getElementById("hint-modal");
  const options = document.getElementById("hint-modal-options");
  const closeButton = document.getElementById("hint-modal-close-button");
  const result = document.getElementById("hint-modal-result");
  const labelEl = result?.querySelector(".hint-selected-label");
  const valueEl = result?.querySelector(".hint-selected-value");

  if (!overlay || !modal || !options || !closeButton || !result || !labelEl || !valueEl) {
    throw new Error("Hint modal elements are missing in the DOM");
  }

  return { overlay, modal, options, closeButton, result, labelEl, valueEl };
}

function clearOptions(container) {
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
}

export function getHintKeysForMode(mode) {
  return collectDefinitions(mode).map((def) => def.key);
}

export function requestHint({ pokemon, mode, disabledKeys = new Set() }) {
  if (!pokemon) return Promise.resolve(null);
  const defs = collectDefinitions(mode);
  const options = defs.map((def) => ({
    key: def.key,
    label: def.label,
    value: def.getValue(pokemon) ?? "—",
    disabled: disabledKeys instanceof Set ? disabledKeys.has(def.key) : false,
  }));

  const available = options.filter((opt) => !opt.disabled);
  if (available.length === 0) {
    return Promise.resolve(null);
  }

  const { overlay, options: optionsContainer, closeButton, result, labelEl, valueEl } = ensureElements();

  clearOptions(optionsContainer);
  result.classList.add("hidden");
  labelEl.textContent = "";
  valueEl.textContent = "";

  return new Promise((resolve) => {
    let resolved = false;

    const resolveOnce = (payload) => {
      if (!resolved) {
        resolved = true;
        resolve(payload);
      }
    };

    const finish = () => {
      overlay.classList.add("hidden");
      overlay.removeEventListener("click", onOverlayClick);
      closeButton.removeEventListener("click", onClose);
      clearOptions(optionsContainer);
    };

    const onClose = () => {
      finish();
      resolveOnce(null);
    };
    const onOverlayClick = (event) => {
      if (event.target === overlay) {
        finish();
        resolveOnce(null);
      }
    };

    overlay.addEventListener("click", onOverlayClick);
    closeButton.addEventListener("click", onClose);

    options.forEach((opt) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "hint-option-button";
      btn.textContent = opt.label;
      if (opt.disabled) {
        btn.disabled = true;
        btn.classList.add("is-disabled");
      }

      const onSelect = () => {
        if (btn.disabled) return;
        btn.classList.add("is-selected");
        optionsContainer.querySelectorAll("button").forEach((other) => {
          if (other === btn) return;
          other.disabled = true;
          other.classList.add("is-disabled");
        });

        labelEl.textContent = opt.label;
        valueEl.textContent = opt.value || "—";
        result.classList.remove("hidden");
        resolveOnce({
          key: opt.key,
          label: opt.label,
          value: opt.value || "—",
          totalOptions: options.length,
        });
      };

      btn.addEventListener("click", onSelect, { once: true });
      optionsContainer.appendChild(btn);
    });

    overlay.classList.remove("hidden");
  });
}