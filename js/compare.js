export function comparePokemon(guessed, correct) {
  if (!guessed || !correct) {
    console.error("comparePokemon was called with invalid data:", { guessed, correct });
    return {};
  }

  // 数値比較（▲/▼）
  const createNumericComparison = (guessedValue, correctValue) => {
    let symbol = '';
    let symbolClass = '';
    if (guessedValue > correctValue) {
      symbol = '▼';           // 正解値の方が小さい
      symbolClass = 'text-blue';
    } else if (guessedValue < correctValue) {
      symbol = '▲';           // 正解値の方が大きい
      symbolClass = 'text-red';
    }
    return {
      class: guessedValue === correctValue ? 'bg-green' : 'bg-gray',
      symbol,
      symbolClass
    };
  };

  // セット比較（タイプ・特性・タマゴG 統合）
  const compareSets = (guessedItems, correctItems) => {
    const guessedSet = new Set(guessedItems.filter(i => i && i !== 'なし'));
    const correctSet = new Set(correctItems.filter(i => i && i !== 'なし'));

    if (correctSet.size === 0) {
      return guessedSet.size === 0 ? 'bg-green' : 'bg-gray';
    }
    if (guessedSet.size === 0) return 'bg-gray';

    const intersectionSize = new Set([...guessedSet].filter(i => correctSet.has(i))).size;

    if (guessedSet.size === correctSet.size && intersectionSize === correctSet.size) {
      return 'bg-green';  // 完全一致
    } else if (intersectionSize > 0) {
      return 'bg-yellow'; // 部分一致
    } else {
      return 'bg-gray';   // 不一致
    }
  };

  // 世代/作品 比較（作品まで一致=緑　世代のみ一致=黄　世代も不一致=▲/▼）
  const compareDebut = (gGen, gTitle, cGen, cTitle) => {
    const g = typeof gGen === 'number' ? gGen : null;
    const c = typeof cGen === 'number' ? cGen : null;
    if (g === null || c === null) {
      return { class: 'bg-gray', symbol: '', symbolClass: '' };
    }
    if (g === c) {
      const sameTitle = (gTitle || '') === (cTitle || '');
      return {
        class: sameTitle ? 'bg-green' : 'bg-yellow',
        symbol: '',
        symbolClass: ''
      };
    }
    const cmp = createNumericComparison(g, c);
    return { class: 'bg-gray', symbol: cmp.symbol, symbolClass: cmp.symbolClass };
  };

  // --- クラシック/ランダム用の比較結果 ---
  const result = {};

  // 1) 世代/作品の比較
  result.debut = compareDebut(
    guessed.debutGen, guessed.debutTitle,
    correct.debutGen, correct.debutTitle
  );

  // 2) 統合項目の比較
  result.types = compareSets(
    [guessed.type1, guessed.type2],
    [correct.type1, correct.type2]
  );
  result.abilities = compareSets(
    [guessed.ability1, guessed.ability2, guessed.hiddenAbility],
    [correct.ability1, correct.ability2, correct.hiddenAbility]
  );
  result.eggGroups = compareSets(
    [guessed.eggGroup1, guessed.eggGroup2],
    [correct.eggGroup1, correct.eggGroup2]
  );

  // 3) 数値比較
  result.height = createNumericComparison(guessed.height, correct.height);
  result.weight = createNumericComparison(guessed.weight, correct.weight);

  const gTotal =
    guessed.stats.hp + guessed.stats.attack + guessed.stats.defense +
    guessed.stats.spAttack + guessed.stats.spDefense + guessed.stats.speed;
  const cTotal =
    correct.stats.hp + correct.stats.attack + correct.stats.defense +
    correct.stats.spAttack + correct.stats.spDefense + correct.stats.speed;
  result.totalStats = createNumericComparison(gTotal, cTotal);

  result.evolutionCount = guessed.evolutionCount === correct.evolutionCount ? 'bg-green' : 'bg-gray';
  result.genderRate = guessed.genderRate === correct.genderRate ? 'bg-green' : 'bg-gray';

  // 4) 種族値比較
  result.stats = {
    hp: createNumericComparison(guessed.stats.hp, correct.stats.hp),
    attack: createNumericComparison(guessed.stats.attack, correct.stats.attack),
    defense: createNumericComparison(guessed.stats.defense, correct.stats.defense),
    spAttack: createNumericComparison(guessed.stats.spAttack, correct.stats.spAttack),
    spDefense: createNumericComparison(guessed.stats.spDefense, correct.stats.spDefense),
    speed: createNumericComparison(guessed.stats.speed, correct.stats.speed),
  };

  return result;
}
