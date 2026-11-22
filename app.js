(function () {
  const DATA = window.KRILLION_DATA;
  const PX_PER_METER = 2; // 700 pts * 10m = 7000m = 14000px
  const ROUND_SECONDS = 25;
  const STORAGE_KEY = 'krillion_ru_state_v1';

  const DEFAULT_STATE = {
    settings: {
      muted: false,
      lowPower: false,
      colorblind: false,
      answerCorrections: true,
      clearRejected: false,
      shareLink: true,
      unlockAllBuddies: false
    },
    buddyId: 'krillion',
    stats: {
      played: 0,
      streak: 0,
      bestStreak: 0,
      lastDiveDay: null,
      totalScore: 0,
      bestScore: 0
    },
    completedDives: {}, // diveNumber -> { score, depth, results: [...] }
    expeditions: {}, // expeditionId -> { bestScore, bestDepth, stars, plays }
    seenEndlessIds: [], // prompt IDs already seen in Endless shuffle bag
    suggestions: [],
    ratings: {}
  };

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(DEFAULT_STATE);
      const parsed = JSON.parse(raw);
      return {
        settings: { ...DEFAULT_STATE.settings, ...(parsed.settings || {}) },
        buddyId: parsed.buddyId || 'krillion',
        stats: { ...DEFAULT_STATE.stats, ...(parsed.stats || {}) },
        completedDives: parsed.completedDives || {},
        expeditions: parsed.expeditions || {},
        seenEndlessIds: Array.isArray(parsed.seenEndlessIds) ? parsed.seenEndlessIds : [],
        suggestions: parsed.suggestions || [],
        ratings: parsed.ratings || {}
      };
    } catch {
      return structuredClone(DEFAULT_STATE);
    }
  }

  let appState = loadState();
  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
    } catch {
      // ignore storage quota issues
    }
  }

  // ---------------- Web Audio Synth ----------------
  class SoundFX {
    constructor() {
      this.ctx = null;
    }

    ensureCtx() {
      if (appState.settings.muted) return null;
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return null;
        this.ctx = new AudioCtx();
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    }

    tone(freq, dur, type = 'sine', gainVal = 0.08, delay = 0, freqEnd = null) {
      const ctx = this.ensureCtx();
      if (!ctx) return;
      const now = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      if (freqEnd) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + dur);
      }
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(gainVal, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + dur + 0.02);
    }

    click() {
      this.tone(520, 0.06, 'triangle', 0.05, 0, 660);
    }

    countdownTick(final = false) {
      this.tone(final ? 880 : 620, 0.09, 'sine', 0.06);
    }

    urgentTick() {
      this.tone(940, 0.07, 'square', 0.035);
    }

    reject() {
      this.tone(170, 0.11, 'sawtooth', 0.05, 0, 120);
      this.tone(140, 0.12, 'sawtooth', 0.04, 0.08, 100);
    }

    suggest() {
      this.tone(440, 0.08, 'triangle', 0.05, 0);
      this.tone(587, 0.1, 'triangle', 0.05, 0.06);
    }

    diveStart() {
      this.tone(420, 0.35, 'sine', 0.07, 0, 140);
    }

    crossTier(idx) {
      const notes = [330, 392, 494, 587, 740, 988];
      this.tone(notes[idx] || 440, 0.14, 'triangle', 0.06, 0);
    }

    land(tierId) {
      this.tone(110, 0.25, 'triangle', 0.1, 0, 48);
      if (tierId === 'miss') {
        this.tone(180, 0.3, 'sawtooth', 0.04, 0.04, 110);
      } else if (tierId === 'krillion') {
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
          this.tone(f, 0.35, 'triangle', 0.07, 0.05 + i * 0.07);
        });
      } else if (tierId === 'deepcut' || tierId === 'rare') {
        this.tone(440, 0.25, 'triangle', 0.06, 0.04);
        this.tone(659.25, 0.32, 'triangle', 0.06, 0.12);
      } else {
        this.tone(392, 0.22, 'sine', 0.06, 0.04);
      }
    }

    mascot() {
      this.tone(620, 0.08, 'sine', 0.06, 0, 960);
      this.tone(860, 0.11, 'triangle', 0.05, 0.07, 1180);
    }
  }

  const sfx = new SoundFX();

  // ---------------- Text Matching, Morphology & Phonetic Transliteration ----------------
  function normalizeInput(str) {
    return (str || '')
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/[’'`"«»()]/g, ' ')
      .replace(/[^a-zа-я0-9+#* ]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function compactStr(str) {
    return normalizeInput(str).replace(/ /g, '');
  }

  function skeletonStr(str) {
    return compactStr(str)
      .replace(/[ъь]/g, '')
      .replace(/щ/g, 'ш')
      .replace(/э/g, 'е')
      .replace(/й/g, 'и')
      .replace(/(.)\1+/g, '$1');
  }

  const ROMAN_TO_ARABIC = {
    i: '1', ii: '2', iii: '3', iv: '4', v: '5',
    vi: '6', vii: '7', viii: '8', ix: '9', x: '10',
    xi: '11', xii: '12'
  };

  function swapNumerals(normStr) {
    const tokens = normStr.split(' ');
    if (tokens.length < 2) return normStr;
    return tokens.map((tok, idx) => {
      if (ROMAN_TO_ARABIC[tok] && (idx > 0 || tok.length >= 2)) {
        return ROMAN_TO_ARABIC[tok];
      }
      return tok;
    }).join(' ');
  }

  const GENERIC_WORDS = new Set([
    'море', 'океан', 'сыр', 'город', 'цвет', 'оттенок', 'дерево', 'куст',
    'кустарник', 'птица', 'животное', 'камень', 'минерал', 'металл', 'элемент',
    'игра', 'видеоигра', 'фильм', 'сериал', 'мультфильм', 'мультик', 'аниме',
    'книга', 'роман', 'повесть', 'сказка', 'инструмент', 'страна', 'республика',
    'паста', 'макароны', 'герой', 'персонаж', 'бог', 'богиня', 'профессия',
    'порода', 'собака', 'кошка', 'кот', 'машина', 'автомобиль', 'марка', 'бренд',
    'компания', 'язык', 'соус', 'заправка', 'суп', 'блюдо', 'десерт', 'торт',
    'пирожное', 'коктейль', 'напиток', 'фрукт', 'овощ', 'ягода', 'гриб', 'цветок',
    'насекомое', 'жук', 'паук', 'бабочка', 'рыба', 'зверь', 'динозавр', 'змея',
    'ящерица', 'черепаха', 'лягушка', 'планета', 'звезда', 'созвездие', 'спутник',
    'река', 'гора', 'вулкан', 'хребет', 'остров', 'станция', 'метро', 'валюта',
    'единица', 'величина', 'орган', 'кость', 'мышца', 'явление', 'здание', 'храм',
    'собор', 'башня', 'ткань', 'материал', 'танец', 'стиль', 'спорт', 'вид', 'спорта',
    'боевое', 'искусство', 'единоборство', 'жанр', 'группа', 'песня', 'игрушка',
    'фобия', 'страх', 'боязнь', 'праздник', 'одежда', 'обувь', 'аксессуар', 'предмет',
    'вещь', 'прибор', 'музыкальный', 'the', 'a', 'an', 'of', 'game', 'movie'
  ]);

  function stripGeneric(normStr) {
    const words = normStr.split(' ').filter((w) => w && !GENERIC_WORDS.has(w));
    return words.join(' ').trim();
  }

  const RU_ADJ_RE = /^(?:[а-я]{3,})(?:ый|ий|ой|ая|яя|ое|ее|ые|ие|ого|его|ому|ему|ым|им|их|ых|ую|юю)$/;
  const RU_ENDINGS_LONG = [
    'иями', 'ями', 'ами', 'ого', 'его', 'ому', 'ему', 'ими', 'ыми', 'ою', 'ею', 'ией',
    'ая', 'яя', 'ое', 'ее', 'ые', 'ие', 'ый', 'ий', 'ой', 'ей', 'ия', 'ов', 'ев',
    'ам', 'ям', 'ах', 'ях', 'ом', 'ем', 'ую', 'юю', 'ью'
  ];

  function ruStemWord(word) {
    if (!/^[а-я]{4,}$/.test(word)) return word;
    let w = word;
    for (const end of RU_ENDINGS_LONG) {
      if (w.endsWith(end) && w.length - end.length >= 3) {
        w = w.slice(0, -end.length);
        break;
      }
    }
    if (w === word && w.length >= 4 && /[аяыиуюеоь]$/.test(w)) {
      w = w.slice(0, -1);
    }
    // Fleeting vowel normalization: кроссовок <-> кроссовки, ботинок <-> ботинки
    w = w.replace(/([бвгджзклмнпрстфхцчшщ])[ое](к)$/, '$1$2');
    return w.replace(/й$/, 'и');
  }

  function ruStemPhrase(normStr) {
    return normStr
      .split(' ')
      .filter((w) => w && !GENERIC_WORDS.has(w))
      .map((w) => ruStemWord(w))
      .join(' ');
  }

  function stripAdjectives(normStr) {
    const toks = normStr.split(' ').filter((w) => w && !GENERIC_WORDS.has(w));
    if (toks.length < 2) return '';
    const heads = toks.filter((w) => !RU_ADJ_RE.test(w));
    return heads.length ? heads.join(' ') : '';
  }

  function enToRuPhonetic(str) {
    let s = normalizeInput(str);
    s = s
      .replace(/sch/g, 'ш')
      .replace(/sh/g, 'ш')
      .replace(/ch/g, 'ч')
      .replace(/zh/g, 'ж')
      .replace(/kh/g, 'х')
      .replace(/ph/g, 'ф')
      .replace(/th/g, 'т')
      .replace(/ts/g, 'ц')
      .replace(/qu/g, 'кв')
      .replace(/ck/g, 'к')
      .replace(/ya/g, 'я')
      .replace(/yu/g, 'ю')
      .replace(/yo/g, 'е')
      .replace(/ye/g, 'е')
      .replace(/oo/g, 'у')
      .replace(/ee/g, 'и')
      .replace(/ea/g, 'и')
      .replace(/ai/g, 'аи')
      .replace(/ei/g, 'еи')
      .replace(/au/g, 'ау')
      .replace(/ou/g, 'ау')
      .replace(/ow/g, 'оу')
      .replace(/c([eiy])/g, 'с$1')
      .replace(/g([eiy])/g, 'дж$1')
      .replace(/j/g, 'дж')
      .replace(/x/g, 'кс')
      .replace(/w/g, 'в')
      .replace(/q/g, 'к')
      .replace(/c/g, 'к');
    const map = {
      a: 'а', b: 'б', d: 'д', e: 'е', f: 'ф', g: 'г', h: 'х', i: 'и',
      k: 'к', l: 'л', m: 'м', n: 'н', o: 'о', p: 'п', r: 'р', s: 'с',
      t: 'т', u: 'у', v: 'в', y: 'и', z: 'з'
    };
    return s.replace(/[a-z]/g, (ch) => map[ch] || ch);
  }

  function ruToEnPhonetic(str) {
    const map = {
      а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z',
      и: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p',
      р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch',
      ш: 'sh', щ: 'sh', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya'
    };
    return normalizeInput(str).replace(/[а-я]/g, (ch) => map[ch] ?? ch);
  }

  function levenshtein(a, b) {
    if (a === b) return 0;
    const m = a.length;
    const n = b.length;
    if (!m) return n;
    if (!n) return m;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      }
    }
    return dp[m][n];
  }

  function expandIndexVariants(rawName, aliases) {
    const out = [rawName, ...(aliases || [])];
    // Split colons/parentheses for partial titles (e.g. "Fallout: New Vegas", "S.T.A.L.K.E.R.: Тень Чернобыля")
    if (rawName.includes(':')) {
      const [head, tail] = rawName.split(':');
      if (head && head.trim().length >= 4) out.push(head.trim());
      if (tail && tail.trim().length >= 4) out.push(tail.trim());
    }
    if (rawName.includes('(')) {
      const stripped = rawName.replace(/\s*\([^)]*\)/g, '').trim();
      if (stripped.length >= 3) out.push(stripped);
    }
    return out;
  }

  const ENTITY_TOKEN_PROMPTS = new Set([
    'talking-animal-movie', 'anime-title', 'anime-character', 'pixar-disney-char',
    'harry-potter', 'lord-of-rings', 'star-wars', 'sci-fi-fantasy-movie',
    'horror-movie', 'tv-series-hit', 'indie-game', 'retro-console-game',
    'open-world-game', 'minecraft-mob-item', 'moba-hero-shooter', 'comic-hero-villain',
    'russian-literature', 'soviet-cartoon', 'soviet-comedy', 'fairy-tale-folk',
    'scientist-inventor', 'historical-ruler', 'rock-pop-band', 'cis-music-artist',
    'building-landmark', 'video-game-char', 'world-literature', 'film-director',
    'movie-actor', 'classical-composer', 'painter-artist', 'historic-event',
    'animated-series', 'ancient-state', 'football-club',
    'philosopher', 'movie-villain', 'myth-egypt-slavic', 'game-studio',
    'ru-cartoon-char', 'space-mission-phenom', 'cs-term-map', 'internet-meme',
    'witcher-skyrim', 'food-drink-brand', 'hockey-nba-f1-team',
    'film-studio-award', 'game-console',
    'gta-rdr-entity', 'ancient-wonder-ruin', 'historical-dynasty-order',
    'explorer-traveler', 'movie-franchise', 'tv-series-char',
    'famous-singer-solo', 'music-album-classic', 'soundtrack-composer-ost',
    'famous-song-title', 'music-fest-award', 'scifi-universe-ship',
    'retail-marketplace-bank', 'airline-delivery-brand', 'crypto-tech-company',
    'luxury-watch-perfume', 'famous-author', 'tv-show-90s-2000s',
    'nostalgia-snack-90s', 'old-internet-2000s', 'nostalgia-cartoon-series-90s',
    'famous-athlete'
  ]);

  const COMMON_STOP_TOKENS = new Set([
    'класс', 'книга', 'машина', 'город', 'звезда', 'ночь', 'день', 'утро', 'вечер',
    'голос', 'рука', 'сердце', 'слово', 'место', 'семья', 'письмо', 'дорога', 'время',
    'жизнь', 'жизни', 'смерть', 'любовь', 'война', 'снег', 'дождь', 'солнце', 'луна',
    'небо', 'море', 'огонь', 'вода', 'земля', 'ветер', 'птица', 'собака', 'кошка',
    'волк', 'лиса', 'медведь', 'рыцарь', 'король', 'принц', 'герой', 'человек', 'люди',
    'девочка', 'мальчик', 'брат', 'сестра', 'отец', 'мать', 'учитель', 'доктор',
    'капитан', 'солдат', 'остров', 'замок', 'улица', 'школа', 'история', 'сказка',
    'песня', 'танец', 'игра', 'призрак', 'тень', 'свет', 'тьма', 'грех', 'тайна',
    'секрет', 'легенда', 'дракон', 'демон', 'ангел', 'мастер', 'бог', 'мир', 'дом',
    'world', 'story', 'legend', 'house', 'night', 'black', 'white', 'death', 'shadow',
    'blood', 'prince', 'king', 'queen', 'master', 'magic', 'chronicle', 'chronicles',
    'super', 'ultra', 'project', 'return', 'season', 'movie', 'series', 'anime', 'part'
  ]);

  const ADJ_TOKEN_END_RE = /(?:ый|ий|ой|ая|яя|ое|ее|ые|ие|ого|ому|ым|им|ую|юю)$/;

  function hasLoadedAnswers(prompt) {
    return Boolean(prompt && Array.isArray(prompt.answers) && prompt.answers.length > 0);
  }

  function getPromptIndex(prompt) {
    if (prompt._index && hasLoadedAnswers(prompt)) return prompt._index;
    const answers = hasLoadedAnswers(prompt) ? prompt.answers : [];
    const strict = !!prompt.strictShape;
    const allowTokenFallback = ENTITY_TOKEN_PROMPTS.has(prompt.id);
    const exactMap = new Map();
    const compactMap = new Map();
    const skeletonMap = new Map();
    const strippedMap = new Map();
    const stemMap = new Map();
    const bagMap = new Map();
    const uniqueTokenMap = new Map();
    const tokenOwners = allowTokenFallback ? new Map() : null;
    const fuzzyEntries = [];
    if (!answers.length) {
      return { exactMap, compactMap, skeletonMap, strippedMap, stemMap, bagMap, uniqueTokenMap, fuzzyEntries };
    }

    const addTo = (map, key, ans) => {
      if (key && !map.has(key)) map.set(key, ans);
    };

    const registerVariantList = (ans, rawList, collectTokens) => {
      for (const v of rawList) {
        const vn = normalizeInput(v);
        if (!vn) continue;
        const swapped = swapNumerals(vn);
        const vc = compactStr(vn);
        const vswapC = compactStr(swapped);
        const vsk = skeletonStr(vn);
        const vruSk = skeletonStr(enToRuPhonetic(vn));
        const venSk = skeletonStr(ruToEnPhonetic(vn));
        const vstrip = compactStr(stripGeneric(swapped));

        addTo(exactMap, vn, ans);
        addTo(exactMap, swapped, ans);
        addTo(compactMap, vc, ans);
        addTo(compactMap, vswapC, ans);
        addTo(skeletonMap, vsk, ans);
        addTo(skeletonMap, vruSk, ans);
        addTo(skeletonMap, venSk, ans);
        if (vstrip.length >= 3) addTo(strippedMap, vstrip, ans);

        if (!strict) {
          const stPhrase = compactStr(ruStemPhrase(swapped));
          if (stPhrase.length >= 3) addTo(stemMap, stPhrase, ans);
          const singleNoGen = stripGeneric(swapped);
          if (singleNoGen && !singleNoGen.includes(' ')) {
            const singleSt = ruStemWord(singleNoGen);
            if (singleSt.length >= 3) addTo(stemMap, singleSt, ans);
          }
          const words = swapped.split(/\s+/).filter(Boolean);
          if (words.length >= 2 && words.length <= 3) {
            const bagKey = words.slice().sort().join('');
            if (bagKey.length >= 4) addTo(bagMap, bagKey, ans);
          }
          if (collectTokens && tokenOwners && words.length >= 2) {
            for (const tok of words) {
              if (tok.length >= 5 && !COMMON_STOP_TOKENS.has(tok) && !ADJ_TOKEN_END_RE.test(tok)) {
                let set = tokenOwners.get(tok);
                if (!set) { set = new Set(); tokenOwners.set(tok, set); }
                set.add(ans);
              }
            }
          }
        }

        if (vn.length >= 4) {
          fuzzyEntries.push({ ans, vn });
        }
      }
    };

    // Pass 1: register canonical answer names first so another entry's bundled alias never hijacks a canonical answer.
    for (const ans of answers) {
      registerVariantList(ans, expandIndexVariants(ans.name, []), true);
    }
    // Pass 2: register explicit aliases as fallback keys.
    for (const ans of answers) {
      if (ans.aliases && ans.aliases.length) {
        registerVariantList(ans, ans.aliases, false);
      }
    }
    // Pass 3: register uniquely identifying non-generic single words in multi-word entity titles (e.g. "такопи" -> "Первородный грех Такопи").
    if (tokenOwners) {
      for (const [tok, owners] of tokenOwners.entries()) {
        if (owners.size === 1) {
          const onlyAns = owners.values().next().value;
          addTo(uniqueTokenMap, tok, onlyAns);
          const tokStem = ruStemWord(tok);
          if (tokStem.length >= 5) addTo(uniqueTokenMap, tokStem, onlyAns);
        }
      }
    }

    prompt._index = { exactMap, compactMap, skeletonMap, strippedMap, stemMap, bagMap, uniqueTokenMap, fuzzyEntries };
    return prompt._index;
  }

  const SYMBOL_KEY_MAP = {
    '.': 'точка', ',': 'запятая', '!': 'восклицательный знак', '?': 'вопросительный знак',
    ':': 'двоеточие', ';': 'точка с запятой', '—': 'тире', '–': 'короткое тире',
    '-': 'дефис', '...': 'многоточие', '…': 'многоточие', '"': 'кавычки',
    '«»': 'кавычки-ёлочки', '«': 'кавычки-ёлочки', '»': 'кавычки-ёлочки',
    '„“': 'кавычки-лапки', '()': 'скобки', '(': 'скобки', ')': 'скобки',
    '[]': 'квадратные скобки', '[': 'квадратные скобки', ']': 'квадратные скобки',
    '{}': 'фигурные скобки', '{': 'фигурные скобки', '}': 'фигурные скобки',
    '<>': 'угловые скобки', "'": 'апостроф', '/': 'слэш', '\\': 'обратный слэш',
    '|': 'вертикальная черта', '@': 'собака', '#': 'хэштег', '$': 'доллар',
    '%': 'процент', '&': 'амперсанд', '*': 'звёздочка', '~': 'тильда',
    '^': 'карет', '_': 'подчёркивание', '+': 'плюс', '=': 'равно',
    '>': 'больше', '<': 'меньше', '§': 'параграф', '№': 'знак номера',
    '©': 'копирайт', '™': 'трейдмарк', '®': 'знак зарегистрированной марки',
    '°': 'градус', '±': 'плюс-минус', '×': 'знак умножения', '÷': 'знак деления',
    '∞': 'бесконечность', '€': 'евро', '£': 'фунт', '₽': 'рубль', '¥': 'иена',
    '•': 'буллит', '‽': 'интерробанг', '¶': 'пилкроу', '†': 'обелиск',
    '‰': 'промилле', '≠': 'не равно', '≈': 'примерно равно', '√': 'знак корня',
    '∑': 'знак суммы', '∫': 'знак интеграла', '₿': 'биткоин', '¢': 'цент',
    '‽': 'интерробанг', '¿': 'перевёрнутый вопросительный знак', '♭': 'бемоль',
    '♮': 'бекар', '♯': 'диесис'
  };

  function matchAnswer(rawInput, prompt) {
    let effectiveInput = rawInput;
    if (prompt && prompt.id === 'symbol-key') {
      const trimmed = (rawInput || '').trim();
      if (SYMBOL_KEY_MAP[trimmed]) effectiveInput = SYMBOL_KEY_MAP[trimmed];
    }
    const norm = normalizeInput(effectiveInput);
    const comp = compactStr(norm);
    if (!norm) return { status: 'empty' };

    const swapped = swapNumerals(norm);
    const swapComp = compactStr(swapped);
    const sk = skeletonStr(swapped);
    const ruSk = skeletonStr(enToRuPhonetic(swapped));
    const enSk = skeletonStr(ruToEnPhonetic(swapped));
    const stripped = compactStr(stripGeneric(swapped));

    const idx = getPromptIndex(prompt);
    const strict = !!prompt.strictShape;
    const isDoubleRule = prompt.id === 'word-double-letter';

    // 1. O(1) exact & normalized forms
    const exactHit = idx.exactMap.get(norm)
      || idx.exactMap.get(swapped)
      || (comp.length >= 2 && idx.compactMap.get(comp))
      || (swapComp.length >= 2 && idx.compactMap.get(swapComp));
    if (exactHit) return { status: 'exact', answer: exactHit };

    // Cross-script & skeleton (skip double-letter collapsing on "word-double-letter")
    if (!isDoubleRule && sk.length >= 3) {
      const skHit = idx.skeletonMap.get(sk)
        || idx.skeletonMap.get(ruSk)
        || idx.skeletonMap.get(enSk);
      if (skHit) return { status: 'exact', answer: skHit };
    } else if (isDoubleRule && sk.length >= 3) {
      const phHit = idx.exactMap.get(normalizeInput(enToRuPhonetic(norm)));
      if (phHit) return { status: 'exact', answer: phHit };
    }

    if (stripped.length >= 3) {
      const strHit = idx.strippedMap.get(stripped);
      if (strHit) return { status: 'exact', answer: strHit };
    }

    // 2. Russian morphological stemming, word-order swaps, unique entity tokens & adjective stripping (disabled for formal word-shape rules)
    if (!strict) {
      const inWords = swapped.split(/\s+/).filter(Boolean);
      if (inWords.length >= 2 && inWords.length <= 3) {
        const bagHit = idx.bagMap.get(inWords.slice().sort().join(''));
        if (bagHit) return { status: 'exact', answer: bagHit };
      }

      if (inWords.length === 1 && idx.uniqueTokenMap.size > 0) {
        const w0 = inWords[0];
        const tokHit = (w0.length >= 5 && idx.uniqueTokenMap.get(w0))
          || (ruStemWord(w0).length >= 5 && idx.uniqueTokenMap.get(ruStemWord(w0)));
        if (tokHit) return { status: 'exact', answer: tokHit };
      }

      const stPhrase = compactStr(ruStemPhrase(swapped));
      if (stPhrase.length >= 3 && idx.stemMap.has(stPhrase)) {
        return { status: 'exact', answer: idx.stemMap.get(stPhrase) };
      }

      const adjStripped = stripAdjectives(swapped);
      if (adjStripped) {
        const adjComp = compactStr(adjStripped);
        const adjStem = compactStr(ruStemPhrase(adjStripped));
        const headHit = idx.compactMap.get(adjComp)
          || idx.strippedMap.get(adjComp)
          || idx.stemMap.get(adjStem);
        if (headHit) return { status: 'exact', answer: headHit };
      }
    }

    // 3. Fuzzy typo / prefix check (across native & transliterated forms)
    let bestAns = null;
    let bestDist = 99;
    const formsToCheck = [swapped];
    const ruNorm = normalizeInput(enToRuPhonetic(swapped));
    const enNorm = normalizeInput(ruToEnPhonetic(swapped));
    if (ruNorm && ruNorm !== swapped) formsToCheck.push(ruNorm);
    if (enNorm && enNorm !== swapped) formsToCheck.push(enNorm);

    for (const e of idx.fuzzyEntries) {
      for (const f of formsToCheck) {
        if (f.length < 3) continue;

        if (!isDoubleRule && f.length >= 5 && e.vn.startsWith(f)) {
          return { status: 'fuzzy', answer: e.ans };
        }

        const maxDist = e.vn.length >= 7 ? 2 : 1;
        if (Math.abs(e.vn.length - f.length) <= maxDist) {
          const d = levenshtein(f, e.vn);
          if (d <= maxDist && d < bestDist) {
            bestDist = d;
            bestAns = e.ans;
          }
        }
      }
    }

    if (bestAns) {
      return { status: 'fuzzy', answer: bestAns };
    }

    return { status: 'none' };
  }

  // ---------------- Ocean Dual-Canvas Engine ----------------
  class OceanStage {
    constructor(seaCanvas, foreCanvas, worldEl) {
      this.sea = seaCanvas;
      this.fore = foreCanvas;
      this.seaCtx = seaCanvas.getContext('2d');
      this.foreCtx = foreCanvas.getContext('2d');
      this.worldEl = worldEl;

      this.width = window.innerWidth;
      this.height = window.innerHeight;
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);

      this.cameraY = 0;
      this.worldOffset = this.height * 0.54;

      this.particles = [];
      this.fish = [];
      this.bubbles = [];
      this.sparks = [];
      this.inkPuffs = [];
      this.clouds = [];
      this.kelp = [];
      this.orbitEffect = null; // { kind: 'schooler'|'krillion'|'rare', x, y, hex }

      this.initEntities();
      this.resize();
    }

    initEntities() {
      this.particles = Array.from({ length: 145 }, (_, i) => ({
        x: Math.random(),
        y: Math.random(),
        r: 1.1 + Math.random() * 1.7,
        speed: 0.14 + Math.random() * 0.44,
        alpha: 0.12 + Math.random() * 0.36,
        parallax: 0.14 + Math.random() * 0.46,
        twinkle: Math.random() * Math.PI * 2,
        spark: i % 9 === 0,
        gold: i % 27 === 0
      }));

      this.currents = Array.from({ length: 14 }, (_, i) => ({
        x: Math.random(),
        y: 0.08 + ((i * 0.071) % 0.86),
        len: 22 + Math.random() * 44,
        speed: 0.008 + Math.random() * 0.014,
        alpha: 0.05 + Math.random() * 0.07,
        parallax: 0.18 + (i % 4) * 0.08
      }));

      this.fish = Array.from({ length: 18 }, (_, i) => ({
        x: Math.random(),
        depthPx: 140 + i * 320 + Math.random() * 200,
        size: 10 + Math.random() * 14,
        speed: (Math.random() > 0.5 ? 1 : -1) * (0.00014 + Math.random() * 0.0002),
        alpha: 0.25 + Math.random() * 0.25,
        phase: Math.random() * Math.PI * 2
      }));

      this.schools = Array.from({ length: 5 }, (_, i) => ({
        x: (i * 0.21 + 0.12) % 1,
        depthPx: 210 + i * 420,
        dir: i % 2 === 0 ? 1 : -1,
        speed: 0.00022 + (i % 3) * 0.00006,
        phase: i * 1.7,
        members: Array.from({ length: 6 }, (_, m) => ({
          ox: (m - 2.5) * 11 + ((m * 7) % 5) - 2,
          oy: ((m % 3) - 1) * 7 + ((m * 13) % 5) - 2,
          phase: m * 0.9
        }))
      }));

      this.mantas = [
        { x: 0.15, depthPx: 1120, speed: 0.00011, size: 1.0, phase: 0.4 },
        { x: 0.72, depthPx: 2650, speed: -0.00009, size: 1.2, phase: 2.6 }
      ];

      this.anglers = [
        { x: 0.22, depthPx: 3650, speed: 0.00007, phase: 0.8 },
        { x: 0.76, depthPx: 5400, speed: -0.000065, phase: 3.1 },
        { x: 0.42, depthPx: 8900, speed: 0.00006, phase: 1.9 }
      ];

      this.bubbles = Array.from({ length: 30 }, () => ({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        r: 1.3 + Math.random() * 3.1,
        vy: 0.42 + Math.random() * 1.05,
        wobble: Math.random() * Math.PI * 2
      }));

      this.clouds = [
        { x: 0.06, y: 0.28, scale: 1.0, speed: 0.004 },
        { x: 0.32, y: 0.21, scale: 1.25, speed: 0.003 },
        { x: 0.52, y: 0.42, scale: 0.9, speed: 0.0045 },
        { x: 0.86, y: 0.36, scale: 1.05, speed: 0.0035 }
      ];

      this.cirrus = [
        { x: 0.14, y: 0.14, w: 68, speed: 0.0016 },
        { x: 0.58, y: 0.11, w: 86, speed: 0.0012 },
        { x: 0.79, y: 0.24, w: 54, speed: 0.0019 }
      ];

      this.gulls = [
        { x: 0.18, y: 0.24, speed: 0.0085, phase: 0.3, scale: 1.0 },
        { x: 0.24, y: 0.29, speed: 0.0075, phase: 2.1, scale: 0.85 },
        { x: 0.67, y: 0.22, speed: 0.0095, phase: 4.0, scale: 1.1 },
        { x: 0.74, y: 0.27, speed: 0.0082, phase: 1.2, scale: 0.8 }
      ];

      this.jellies = Array.from({ length: 9 }, (_, i) => ({
        x: 0.08 + ((i * 0.21) % 0.84),
        depthPx: 1250 + i * 680 + (i % 2) * 160,
        pink: i % 3 === 1,
        gold: i % 5 === 4,
        scale: 0.85 + (i % 3) * 0.18,
        phase: i * 1.4,
        drift: (i % 2 === 0 ? 1 : -1) * 18
      }));

      this.kelp = [
        { side: 'L', offset: 16, depthPx: 580, height: 245, phase: 0.2, back: true },
        { side: 'L', offset: 42, depthPx: 660, height: 210, phase: 1.3, back: false },
        { side: 'L', offset: 68, depthPx: 740, height: 155, phase: 2.6, back: true },
        { side: 'R', offset: 22, depthPx: 630, height: 235, phase: 2.1, back: true },
        { side: 'R', offset: 54, depthPx: 690, height: 195, phase: 0.8, back: false },
        { side: 'L', offset: 32, depthPx: 1220, height: 195, phase: 0.9, back: false },
        { side: 'R', offset: 44, depthPx: 1290, height: 175, phase: 3.1, back: false }
      ];
    }

    resize() {
      const vv = window.visualViewport;
      this.width = vv ? Math.round(vv.width) : window.innerWidth;
      this.height = vv ? Math.round(vv.height) : window.innerHeight;
      this.dpr = appState.settings.lowPower ? 1 : Math.min(window.devicePixelRatio || 1, 2);

      [this.sea, this.fore].forEach((c) => {
        c.width = Math.floor(this.width * this.dpr);
        c.height = Math.floor(this.height * this.dpr);
        c.style.width = this.width + 'px';
        c.style.height = this.height + 'px';
      });
    }

    setCameraDepthPx(depthPx, ratio = 0.38) {
      this.cameraY = depthPx;
      this.worldOffset = this.height * ratio - depthPx;
      this.worldEl.style.transform = `translate3d(0px, ${this.worldOffset.toFixed(2)}px, 0px)`;
    }

    spawnChipBubbles(screenX, screenY, color = '#4de3ff') {
      const count = appState.settings.lowPower ? 1 : 3;
      for (let i = 0; i < count; i++) {
        this.bubbles.push({
          x: screenX + (Math.random() - 0.5) * 60,
          y: screenY + (Math.random() - 0.5) * 14,
          r: 2 + Math.random() * 3.5,
          vy: 1.1 + Math.random() * 1.7,
          wobble: Math.random() * Math.PI * 2,
          color,
          ephemeral: true,
          life: 1.0
        });
      }
      if (this.bubbles.length > 95) {
        this.bubbles.splice(0, this.bubbles.length - 95);
      }
    }

    spawnBurst(screenX, screenY, color = '#4de3ff', count = 14) {
      if (appState.settings.lowPower) count = Math.min(count, 4);
      for (let i = 0; i < count; i++) {
        const ang = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
        const spd = 1.4 + Math.random() * 3.6;
        this.sparks.push({
          x: screenX,
          y: screenY,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          size: 3 + Math.floor(Math.random() * 3),
          color,
          life: 1.0
        });
      }
      if (this.sparks.length > 160) this.sparks.splice(0, this.sparks.length - 160);
    }

    spawnInkPuff(screenX, screenY) {
      if (appState.settings.lowPower) return;
      for (let i = 0; i < 4; i++) {
        this.inkPuffs.push({
          x: screenX + (Math.random() - 0.5) * 32,
          y: screenY + (Math.random() - 0.5) * 18,
          r: 8 + Math.random() * 14,
          vx: (Math.random() - 0.5) * 0.7,
          vy: -0.4 - Math.random() * 0.6,
          life: 1.0
        });
      }
      if (this.inkPuffs.length > 50) this.inkPuffs.splice(0, this.inkPuffs.length - 50);
    }

    drawPixelCloud(ctx, x, y, s) {
      const p = Math.round(7 * s);
      // Cool pale-blue underside shadow
      ctx.fillStyle = 'rgba(158, 210, 236, 0.78)';
      ctx.fillRect(x + p, y + p * 4, p * 11, Math.max(3, Math.round(p * 0.75)));
      ctx.fillRect(x + p * 3, y + Math.round(p * 4.5), p * 7, Math.max(2, Math.round(p * 0.45)));
      // Mid cloud body
      ctx.fillStyle = 'rgba(222, 243, 252, 0.86)';
      ctx.fillRect(x + p * 2, y + p * 3, p * 11, p);
      ctx.fillRect(x, y + p * 3, p * 13, Math.round(p * 0.9));
      // Sunlit white upper puffs
      ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
      ctx.fillRect(x + p * 3, y + p * 0.2, p * 4, p);
      ctx.fillRect(x + p * 8, y + p * 1.2, p * 3, p);
      ctx.fillRect(x + p * 2, y + p * 1, p * 8, p);
      ctx.fillRect(x + p, y + p * 2, p * 11, p);
      // Crisp top-left highlight pixel ridge
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + p * 3, y + p * 0.2, p * 3, Math.max(2, Math.round(p * 0.35)));
      ctx.fillRect(x + p * 2, y + p, p * 4, Math.max(2, Math.round(p * 0.3)));
    }

    drawPixelBoat(ctx, cx, cy, tiltRad, t = 0) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(tiltRad);
      const u = 4;

      // Submerged cable + yellow bathysphere pod suspended off stern crane
      const sway = Math.round(Math.sin(t * 2.2) * 1.5);
      ctx.fillStyle = 'rgba(77, 227, 255, 0.55)';
      ctx.fillRect(-14 * u + sway, -8 * u, 2, 9 * u);
      ctx.fillStyle = '#ffd166';
      ctx.fillRect(-15 * u + sway, 0.5 * u, 3 * u, 2.2 * u);
      ctx.fillStyle = '#fff3c4';
      ctx.fillRect(-15 * u + sway, 0.5 * u, u, u);
      ctx.fillStyle = '#4de3ff';
      ctx.fillRect(-13.5 * u + sway, 1.2 * u, u, u);

      // Dark silhouetted trawler hull & lower keel
      ctx.fillStyle = '#081424';
      ctx.fillRect(-10 * u, -1.5 * u, 21 * u, 2 * u);
      ctx.fillStyle = '#0c1c30';
      ctx.fillRect(-11 * u, -2.5 * u, 23 * u, 1.8 * u);
      // Bow prow + stern rail step
      ctx.fillRect(-12 * u, -4 * u, 26 * u, 2 * u);
      ctx.fillRect(11 * u, -5 * u, 4 * u, 1.5 * u);
      ctx.fillRect(-12 * u, -5 * u, 2.5 * u, 1.2 * u);

      // Cyan waterline trim & brass hull portholes
      ctx.fillStyle = '#2498bd';
      ctx.fillRect(-10.5 * u, -2 * u, 22 * u, Math.max(2, u * 0.45));
      ctx.fillStyle = '#ffd166';
      ctx.fillRect(-7 * u, -3.4 * u, u * 0.9, u * 0.9);
      ctx.fillRect(-2 * u, -3.4 * u, u * 0.9, u * 0.9);
      ctx.fillRect(4 * u, -3.4 * u, u * 0.9, u * 0.9);

      // Stern A-frame crane lifting bathysphere
      ctx.fillStyle = '#152b47';
      ctx.fillRect(-11.5 * u, -8 * u, u, 4 * u);
      ctx.fillRect(-14 * u, -9 * u, 4 * u, u);

      // Wheelhouse cabin + upper bridge trim
      ctx.fillStyle = '#0c1c30';
      ctx.fillRect(-4 * u, -9 * u, 8.5 * u, 5 * u);
      ctx.fillRect(-2.5 * u, -11 * u, 5.5 * u, 2 * u);
      ctx.fillStyle = '#173152';
      ctx.fillRect(-3 * u, -9.5 * u, 6.5 * u, u * 0.6);

      // Glowing cyan cabin windows + bright pixel glint
      ctx.fillStyle = '#4de3ff';
      ctx.fillRect(-2 * u, -8 * u, 2 * u, 2 * u);
      ctx.fillRect(1.2 * u, -8 * u, 2.2 * u, 2 * u);
      ctx.fillStyle = '#ccf7ff';
      ctx.fillRect(-2 * u, -8 * u, u * 0.8, u * 0.8);
      ctx.fillRect(1.2 * u, -8 * u, u * 0.8, u * 0.8);

      // Warm bow floodlight pixel
      ctx.fillStyle = '#ffd166';
      ctx.fillRect(7.5 * u, -4.8 * u, u, u);
      ctx.fillStyle = 'rgba(255, 209, 102, 0.25)';
      ctx.fillRect(6.5 * u, -5.8 * u, 3 * u, 3 * u);

      // Smokestack funnel behind cabin + faint rising puffs
      ctx.fillStyle = '#10243d';
      ctx.fillRect(-6 * u, -7.5 * u, 1.8 * u, 3.5 * u);
      ctx.fillStyle = '#ff5d8f';
      ctx.fillRect(-6 * u, -7 * u, 1.8 * u, u * 0.6);
      if (!appState.settings.lowPower) {
        for (let i = 0; i < 3; i++) {
          const p = ((t * 0.75 + i * 0.33) % 1);
          const px = -6 * u - p * 5 * u;
          const py = -8.5 * u - p * 4.5 * u;
          const alpha = (1 - p) * 0.28;
          ctx.fillStyle = `rgba(218, 240, 255, ${alpha.toFixed(2)})`;
          ctx.fillRect(Math.round(px), Math.round(py), u + Math.round(p * u), Math.max(2, u - Math.round(p * 1.5)));
        }
      }

      // Tall mast + radar spinner + blinking beacon + flapping Krillion Pink Pennant Flag
      ctx.fillStyle = '#0c1c30';
      ctx.fillRect(0, -18.5 * u, u, 8.5 * u);
      const radarW = Math.max(u, Math.round(Math.abs(Math.cos(t * 2.4)) * 3.5 * u));
      ctx.fillStyle = '#20426b';
      ctx.fillRect(Math.round(u * 0.5 - radarW * 0.5), -12.8 * u, radarW, Math.max(2, u * 0.5));
      // Masthead navigation beacon
      const beaconOn = Math.sin(t * 3.8) > 0.15;
      ctx.fillStyle = beaconOn ? '#ff5d8f' : 'rgba(255, 93, 143, 0.25)';
      ctx.fillRect(0, -19.5 * u, u, u * 0.75);
      if (beaconOn && !appState.settings.lowPower) {
        ctx.fillStyle = 'rgba(255, 93, 143, 0.22)';
        ctx.fillRect(-u, -20.5 * u, 3 * u, 2.5 * u);
      }

      const flutter = Math.sin(t * 5.2) > 0 ? 0 : 1;
      ctx.fillStyle = '#ff5d8f';
      ctx.fillRect(-6 * u, -17.5 * u, 6 * u, 3 * u);
      ctx.fillStyle = '#ff99b8';
      ctx.fillRect(-8 * u, (-16.5 + flutter * 0.5) * u, 2 * u, u);

      // Animated bow wave foam spray & subtle water reflections beneath keel
      if (!appState.settings.lowPower) {
        const spray = Math.round(Math.sin(t * 4.4) * 2);
        ctx.fillStyle = 'rgba(232, 250, 255, 0.72)';
        ctx.fillRect(12 * u, -1.6 * u + spray * 0.4, 2.2 * u, u * 0.55);
        ctx.fillRect(14.5 * u, -2.4 * u - spray * 0.5, u * 1.1, u * 0.5);
        ctx.fillStyle = 'rgba(77, 227, 255, 0.22)';
        ctx.fillRect(-3 * u + spray, 1.4 * u, 6 * u, u * 0.45);
        ctx.fillStyle = 'rgba(255, 209, 102, 0.24)';
        ctx.fillRect(-7 * u - spray * 0.5, 1.8 * u, 2 * u, u * 0.4);
        ctx.fillRect(4 * u + spray * 0.5, 2.1 * u, 2 * u, u * 0.4);
      }
      ctx.restore();
    }

    drawDepthRuler(fctx, waterlineScreenY) {
      const phase = appEl.dataset.phase;
      const showRuler = phase === 'preview' || phase === 'answering' || phase === 'feedback' || phase === 'intro';
      if (!showRuler) return;

      const x = this.width - 10;
      const topBound = Math.max(waterlineScreenY, 56);
      if (topBound >= this.height) return;

      fctx.save();
      fctx.strokeStyle = 'rgba(125, 147, 184, 0.42)';
      fctx.lineWidth = 1;
      fctx.beginPath();
      fctx.moveTo(x, Math.max(0, waterlineScreenY));
      fctx.lineTo(x, this.height);
      fctx.stroke();

      fctx.font = '11px "JetBrains Mono", monospace';
      fctx.textAlign = 'right';
      fctx.textBaseline = 'middle';

      const showYou = phase !== 'intro' && session.totalDepthM > 0;
      const youY = showYou ? Math.round(this.worldOffset + session.totalDepthM * PX_PER_METER) : -9999;

      const startM = Math.max(0, Math.floor((0 - this.worldOffset) / PX_PER_METER / 10) * 10);
      const endM = Math.min(7000, Math.ceil((this.height - this.worldOffset) / PX_PER_METER / 10) * 10);

      for (let m = startM; m <= endM; m += 10) {
        const sy = Math.round(this.worldOffset + m * PX_PER_METER) + 0.5;
        if (sy < waterlineScreenY - 2 || sy > this.height - 8) continue;
        const is500 = m > 0 && m % 500 === 0;
        const is100 = m % 100 === 0;
        const is50 = m % 50 === 0;
        const tickLen = is500 ? 13 : is100 ? 11 : is50 ? 7 : 4;

        fctx.strokeStyle = is500
          ? 'rgba(77, 227, 255, 0.72)'
          : is100 ? 'rgba(164, 192, 232, 0.75)' : 'rgba(125, 147, 184, 0.34)';
        fctx.beginPath();
        fctx.moveTo(x - tickLen, sy);
        fctx.lineTo(x, sy);
        fctx.stroke();

        // Skip 100m text label if "ВЫ" indicator occupies that vertical band
        if (is100 && (!showYou || Math.abs(sy - youY) > 15)) {
          fctx.fillStyle = m === 0
            ? 'rgba(205, 234, 255, 0.9)'
            : is500 ? 'rgba(128, 226, 255, 0.88)' : 'rgba(148, 173, 214, 0.85)';
          const label = m === 0 ? '0м' : `-${m}м`;
          fctx.fillText(label, x - 14, sy);
        }
      }

      // Pink "ВЫ" depth indicator marker during active dive
      if (showYou) {
        if (youY >= 40 && youY <= this.height - 20) {
          fctx.strokeStyle = '#ff5d8f';
          fctx.lineWidth = 2;
          fctx.beginPath();
          fctx.moveTo(x - 16, youY);
          fctx.lineTo(x, youY);
          fctx.stroke();

          fctx.fillStyle = '#ff5d8f';
          fctx.beginPath();
          fctx.moveTo(x, youY);
          fctx.lineTo(x + 7, youY - 4);
          fctx.lineTo(x + 7, youY + 4);
          fctx.closePath();
          fctx.fill();

          fctx.font = 'bold 11px "JetBrains Mono", monospace';
          fctx.fillStyle = 'rgba(5, 10, 20, 0.92)';
          fctx.fillRect(x - 43, youY - 8, 25, 16);
          fctx.strokeStyle = 'rgba(255, 93, 143, 0.72)';
          fctx.lineWidth = 1;
          fctx.strokeRect(x - 42.5, youY - 7.5, 24, 15);
          fctx.fillStyle = '#ff5d8f';
          fctx.fillText('ВЫ', x - 21, youY);
        }
      }

      fctx.restore();
    }

    render(ts) {
      const t = ts * 0.001;
      const ctx = this.seaCtx;
      const fctx = this.foreCtx;
      ctx.save();
      ctx.scale(this.dpr, this.dpr);
      fctx.save();
      fctx.scale(this.dpr, this.dpr);

      ctx.clearRect(0, 0, this.width, this.height);
      fctx.clearRect(0, 0, this.width, this.height);

      const depthFrac = Math.max(0, Math.min(1, this.cameraY / 14000));
      const waterlineScreenY = this.worldOffset;

      // 1. Bright Daylight Cyan Pixel Sky when waterline is on screen (krillion.io parity)
      if (waterlineScreenY > -10) {
        const skyH = Math.min(this.height, waterlineScreenY + 24);
        const skyGrad = ctx.createLinearGradient(0, 0, 0, skyH);
        skyGrad.addColorStop(0, '#62b3db');
        skyGrad.addColorStop(0.55, '#8fd2ed');
        skyGrad.addColorStop(1, '#c3e9f8');
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, this.width, skyH);

        // Glowing Pixel Sun (upper right)
        const sunX = this.width * 0.84;
        const sunY = Math.max(46, waterlineScreenY * 0.34);
        const sunGrad = ctx.createRadialGradient(sunX, sunY, 18, sunX, sunY, 96);
        sunGrad.addColorStop(0, 'rgba(255, 232, 130, 0.72)');
        sunGrad.addColorStop(0.55, 'rgba(255, 224, 110, 0.22)');
        sunGrad.addColorStop(1, 'rgba(255, 224, 110, 0)');
        ctx.fillStyle = sunGrad;
        ctx.beginPath();
        ctx.arc(sunX, sunY, 96, 0, Math.PI * 2);
        ctx.fill();

        // Stepped Pixel Sun Core (multi-tone)
        ctx.fillStyle = 'rgba(255, 229, 133, 0.35)';
        ctx.fillRect(Math.round(sunX - 28), Math.round(sunY - 36), 56, 72);
        ctx.fillRect(Math.round(sunX - 36), Math.round(sunY - 28), 72, 56);
        ctx.fillStyle = '#ffe585';
        ctx.fillRect(Math.round(sunX - 24), Math.round(sunY - 32), 48, 64);
        ctx.fillRect(Math.round(sunX - 32), Math.round(sunY - 24), 64, 48);
        ctx.fillStyle = '#fff3b8';
        ctx.fillRect(Math.round(sunX - 18), Math.round(sunY - 24), 36, 48);
        ctx.fillRect(Math.round(sunX - 24), Math.round(sunY - 18), 48, 36);
        ctx.fillStyle = '#fffce0';
        ctx.fillRect(Math.round(sunX - 14), Math.round(sunY - 16), 16, 16);

        // High-altitude pixel cirrus wisps
        if (!appState.settings.lowPower) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.34)';
          for (const ci of this.cirrus) {
            const cix = Math.round((((ci.x + t * ci.speed) % 1.2) - 0.1) * this.width);
            const ciy = Math.round(Math.max(14, waterlineScreenY * ci.y));
            if (ciy < waterlineScreenY - 22) {
              ctx.fillRect(cix, ciy, ci.w, 2);
              ctx.fillRect(cix + 10, ciy + 2, Math.round(ci.w * 0.65), 2);
              ctx.fillRect(cix - 6, ciy - 2, Math.round(ci.w * 0.42), 2);
            }
          }
        }

        // Distant hazy pixel islet + tiny lighthouse silhouette on far left horizon
        if (waterlineScreenY > 48) {
          const lx = Math.round(this.width * 0.09);
          const ly = Math.round(waterlineScreenY);
          ctx.fillStyle = 'rgba(98, 165, 199, 0.58)';
          ctx.fillRect(lx - 26, ly - 5, 58, 7);
          ctx.fillRect(lx - 18, ly - 9, 36, 4);
          ctx.fillRect(lx - 10, ly - 12, 18, 3);
          // Miniature lighthouse tower
          ctx.fillStyle = 'rgba(72, 126, 160, 0.72)';
          ctx.fillRect(lx - 3, ly - 24, 5, 12);
          ctx.fillStyle = 'rgba(232, 248, 255, 0.72)';
          ctx.fillRect(lx - 2, ly - 21, 3, 3);
          ctx.fillRect(lx - 2, ly - 15, 3, 2);
          // Subtle blinking lighthouse beam
          const lhPulse = 0.35 + 0.65 * Math.max(0, Math.sin(t * 2.1));
          ctx.fillStyle = `rgba(255, 240, 170, ${(lhPulse * 0.85).toFixed(2)})`;
          ctx.fillRect(lx - 2, ly - 26, 3, 2);
          if (!appState.settings.lowPower && lhPulse > 0.6) {
            ctx.fillStyle = `rgba(255, 243, 184, ${((lhPulse - 0.6) * 0.32).toFixed(2)})`;
            ctx.fillRect(lx + 1, ly - 27, 16, 2);
            ctx.fillRect(lx - 18, ly - 27, 16, 2);
          }
        }

        // Distant gliding pixel seagulls above horizon (2-segment articulated wings)
        if (!appState.settings.lowPower) {
          for (const g of this.gulls) {
            const gx = Math.round((((g.x + t * g.speed) % 1.15) - 0.08) * this.width);
            const gy = Math.round(Math.max(20, waterlineScreenY * g.y + Math.sin(t * 1.8 + g.phase) * 5));
            if (gy < waterlineScreenY - 14) {
              const flap = Math.sin(t * 5.4 + g.phase);
              const w1 = flap > 0.2 ? -2 : flap < -0.2 ? 1 : -1;
              const w2 = flap > 0.2 ? -4 : flap < -0.2 ? 2 : -1;
              ctx.fillStyle = 'rgba(18, 42, 68, 0.62)';
              ctx.fillRect(gx - 6, gy + w2, 3, 2);
              ctx.fillRect(gx - 3, gy + w1, 3, 2);
              ctx.fillRect(gx, gy, 3, 2);
              ctx.fillRect(gx + 3, gy + w1, 3, 2);
              ctx.fillRect(gx + 6, gy + w2, 3, 2);
              ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
              ctx.fillRect(gx, gy + 1, 2, 1);
            }
          }
        }

        // Pixel Clouds drifting gently
        if (!appState.settings.lowPower) {
          for (const cl of this.clouds) {
            const cx = (((cl.x + t * cl.speed) % 1.25) - 0.12) * this.width;
            const cy = Math.max(24, waterlineScreenY * cl.y);
            if (cy < waterlineScreenY - 12) {
              this.drawPixelCloud(ctx, Math.round(cx), Math.round(cy), cl.scale);
            }
          }
        }
      }

      // 2. Ocean Body (exact krillion.io multi-stop depth progression)
      const oceanStart = Math.max(0, waterlineScreenY);
      if (oceanStart < this.height) {
        const stops = [
          [0.00, '#1d5580', '#123a5e'],
          [0.08, '#123a5e', '#0b1e38'],
          [0.22, '#0b1526', '#081020'],
          [0.50, '#081020', '#050a14'],
          [0.78, '#050a14', '#03070f'],
          [1.00, '#03070f', '#02050b']
        ];
        let sA = stops[0], sB = stops[stops.length - 1];
        for (let i = 0; i < stops.length - 1; i++) {
          if (depthFrac >= stops[i][0] && depthFrac <= stops[i + 1][0]) {
            sA = stops[i];
            sB = stops[i + 1];
            break;
          }
        }
        const span = Math.max(0.0001, sB[0] - sA[0]);
        const localT = (depthFrac - sA[0]) / span;
        const topColor = lerpHex(sA[1], sB[1], localT);
        const botColor = lerpHex(sA[2], sB[2], localT);

        const seaGrad = ctx.createLinearGradient(0, oceanStart, 0, this.height);
        seaGrad.addColorStop(0, topColor);
        seaGrad.addColorStop(1, botColor);
        ctx.fillStyle = seaGrad;
        ctx.fillRect(0, oceanStart, this.width, this.height - oceanStart);

        // Soft Sun Caustic Light Shafts + crisp sub-surface caustic ripples near surface
        if (depthFrac < 0.14 && !appState.settings.lowPower) {
          const rayAlpha = (1 - depthFrac / 0.14) * 0.058;
          for (let i = 0; i < 6; i++) {
            const rx = this.width * (0.08 + i * 0.17) + Math.sin(t * 0.35 + i * 1.1) * 24;
            const rGrad = ctx.createLinearGradient(0, oceanStart, 0, this.height * 0.9);
            rGrad.addColorStop(0, `rgba(110, 224, 255, ${(rayAlpha * 1.45).toFixed(3)})`);
            rGrad.addColorStop(1, 'rgba(77, 227, 255, 0)');
            ctx.fillStyle = rGrad;
            ctx.beginPath();
            ctx.moveTo(rx - 18, oceanStart);
            ctx.lineTo(rx + 26, oceanStart);
            ctx.lineTo(rx + 125, this.height);
            ctx.lineTo(rx - 85, this.height);
            ctx.closePath();
            ctx.fill();
          }

          // Subtle pixel caustic web just beneath waterline
          const causticAlpha = (1 - depthFrac / 0.14) * 0.14;
          for (let row = 0; row < 4; row++) {
            const cy = Math.round(oceanStart + 24 + row * 24);
            if (cy >= this.height) break;
            const step = 64 + row * 14;
            const fade = causticAlpha * (1 - row * 0.22);
            ctx.fillStyle = `rgba(155, 236, 255, ${fade.toFixed(3)})`;
            for (let cx = 18; cx < this.width - 18; cx += step) {
              const drift = Math.round(Math.sin(t * 1.4 + row * 1.7 + cx * 0.03) * 10);
              const w = 14 + ((cx + row * 11) % 14);
              ctx.fillRect(cx + drift, cy, w, 2);
              ctx.fillRect(cx + drift + 4, cy + 2, Math.max(4, w - 8), 1);
            }
          }
        }
      }

      // 3. Undulating Surface Wave Crest (rear + front parallax) + Pixel Trawler Boat + Horizon Buoy
      if (waterlineScreenY > -55 && waterlineScreenY < this.height + 40) {
        // Distant rear wave layer (smooth fade into ocean body)
        ctx.beginPath();
        ctx.moveTo(0, waterlineScreenY - 2);
        for (let x = 0; x <= this.width; x += 16) {
          const wy = waterlineScreenY - 2 + Math.sin(x * 0.011 - t * 1.2) * 3.5;
          ctx.lineTo(x, wy);
        }
        const rearBotY = Math.min(this.height, waterlineScreenY + 32);
        ctx.lineTo(this.width, rearBotY);
        ctx.lineTo(0, rearBotY);
        ctx.closePath();
        const rearGrad = ctx.createLinearGradient(0, waterlineScreenY - 6, 0, rearBotY);
        rearGrad.addColorStop(0, '#144064');
        rearGrad.addColorStop(0.55, 'rgba(20, 64, 100, 0.72)');
        rearGrad.addColorStop(1, 'rgba(20, 64, 100, 0)');
        ctx.fillStyle = rearGrad;
        ctx.fill();

        // Distant channel marker buoy on right horizon + water shimmer reflection
        const buoyX = Math.round(this.width * 0.79);
        const buoyY = Math.round(waterlineScreenY + Math.sin(buoyX * 0.011 - t * 1.2) * 3.5);
        const buoyLit = Math.sin(t * 3.2) > 0.35;
        ctx.fillStyle = '#0c1c30';
        ctx.fillRect(buoyX - 5, buoyY - 4, 10, 5);
        ctx.fillRect(buoyX - 2, buoyY - 12, 4, 8);
        ctx.fillStyle = '#ff5d8f';
        ctx.fillRect(buoyX - 4, buoyY - 3, 8, 2);
        ctx.fillStyle = buoyLit ? '#4de3ff' : 'rgba(77, 227, 255, 0.3)';
        ctx.fillRect(buoyX - 1, buoyY - 14, 3, 2);
        if (buoyLit && !appState.settings.lowPower) {
          ctx.fillStyle = 'rgba(77, 227, 255, 0.24)';
          ctx.fillRect(buoyX - 4, buoyY - 16, 9, 6);
          ctx.fillStyle = 'rgba(77, 227, 255, 0.34)';
          ctx.fillRect(buoyX - 3 + Math.round(Math.sin(t * 4) * 2), buoyY + 5, 6, 2);
          ctx.fillRect(buoyX - 2 - Math.round(Math.sin(t * 3.5) * 2), buoyY + 10, 4, 2);
        }

        // Foreground surface wave (seamless fade into ocean body so caustic rays don't clip)
        ctx.beginPath();
        ctx.moveTo(0, waterlineScreenY);
        for (let x = 0; x <= this.width; x += 16) {
          const wy = waterlineScreenY + Math.sin(x * 0.014 + t * 1.9) * 5 + Math.cos(x * 0.028 - t * 1.2) * 2.5;
          ctx.lineTo(x, wy);
        }
        const waveBotY = Math.min(this.height, waterlineScreenY + 42);
        ctx.lineTo(this.width, waveBotY);
        ctx.lineTo(0, waveBotY);
        ctx.closePath();
        const waveGrad = ctx.createLinearGradient(0, waterlineScreenY - 8, 0, waveBotY);
        waveGrad.addColorStop(0, '#1a527c');
        waveGrad.addColorStop(0.45, 'rgba(24, 75, 115, 0.86)');
        waveGrad.addColorStop(1, 'rgba(24, 75, 115, 0)');
        ctx.fillStyle = waveGrad;
        ctx.fill();

        ctx.beginPath();
        for (let x = 0; x <= this.width; x += 16) {
          const wy = waterlineScreenY + Math.sin(x * 0.014 + t * 1.9) * 5 + Math.cos(x * 0.028 - t * 1.2) * 2.5;
          if (x === 0) ctx.moveTo(x, wy);
          else ctx.lineTo(x, wy);
        }
        ctx.strokeStyle = 'rgba(216, 248, 255, 0.68)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Scattered crisp pixel foam flecks on crests + golden sun-glint path under sun
        if (!appState.settings.lowPower) {
          ctx.fillStyle = 'rgba(232, 250, 255, 0.55)';
          for (let fx = 24; fx < this.width - 24; fx += 72) {
            const crestY = waterlineScreenY + Math.sin(fx * 0.014 + t * 1.9) * 5 + Math.cos(fx * 0.028 - t * 1.2) * 2.5;
            ctx.fillRect(Math.round(fx + Math.sin(t + fx) * 6), Math.round(crestY + 4), 6, 2);
          }

          // Golden pixel sun shimmer path on waves below upper-right sun
          const sunX = this.width * 0.84;
          for (let g = 0; g < 6; g++) {
            const gy = Math.round(waterlineScreenY + 6 + g * 8);
            if (gy >= this.height) break;
            const spread = 28 - g * 3;
            const gx = Math.round(sunX + Math.sin(t * 2.4 + g * 1.9) * (8 + g * 2) - spread * 0.5);
            const alpha = (0.42 - g * 0.055) * (0.7 + 0.3 * Math.sin(t * 4.2 + g));
            ctx.fillStyle = `rgba(255, 240, 175, ${Math.max(0.05, alpha).toFixed(2)})`;
            ctx.fillRect(gx, gy, Math.max(6, spread), 2);
          }
        }

        // Bobbing black pixel trawler boat
        const boatX = Math.round(this.width * 0.29);
        const boatWaveY = waterlineScreenY + Math.sin(boatX * 0.014 + t * 1.9) * 5 + Math.cos(boatX * 0.028 - t * 1.2) * 2.5;
        const slope = Math.cos(boatX * 0.014 + t * 1.9) * 0.065;
        this.drawPixelBoat(ctx, boatX, boatWaveY + 2, slope, t);
      }

      // 4. Pixel Kelp Silhouettes + rising oxygen micro-bubbles (200m - 700m depth band)
      for (const k of this.kelp) {
        const ky = this.worldOffset + k.depthPx;
        if (ky < waterlineScreenY + 40 || ky - k.height > this.height) continue;
        const kx = k.side === 'L' ? k.offset : this.width - k.offset;
        const segH = 12;
        const steps = Math.floor(k.height / segH);
        const backScale = k.back ? 0.62 : 1.0;
        for (let s = 0; s < steps; s++) {
          const sy = ky - s * segH;
          const sway = Math.sin(t * 1.2 + k.phase + s * 0.32) * (s * 0.75);
          const w = (k.back ? 8 : 10) - (s / steps) * 3.5;
          const rx = Math.round(kx + sway);
          const ry = Math.round(sy);
          ctx.fillStyle = `rgba(7, 20, 38, ${(0.88 * backScale).toFixed(2)})`;
          ctx.fillRect(rx, ry, Math.round(w), segH + 1);
          ctx.fillStyle = `rgba(15, 44, 68, ${(0.72 * backScale).toFixed(2)})`;
          ctx.fillRect(rx + 2, ry + 1, Math.max(2, Math.round(w * 0.45)), segH);
          if (s % 2 === 0 && s > 1) {
            const leafDir = s % 4 === 0 ? 1 : -1;
            const lx = Math.round(kx + sway + leafDir * w);
            ctx.fillStyle = `rgba(11, 34, 56, ${(0.85 * backScale).toFixed(2)})`;
            ctx.fillRect(lx, ry + 2, Math.round(w * 1.4), 7);
            ctx.fillRect(lx + (leafDir > 0 ? Math.round(w * 0.9) : -3), ry + 4, 4, 4);
            if (s % 6 === 0 && !k.back) {
              const podGlow = 0.22 + 0.2 * Math.sin(t * 2.4 + k.phase + s);
              ctx.fillStyle = `rgba(77, 227, 255, ${podGlow.toFixed(2)})`;
              ctx.fillRect(lx + (leafDir > 0 ? 2 : 1), ry + 3, 2, 2);
            }
          }
        }
        // Tiny oxygen micro-bubbles rising from kelp tips
        if (!appState.settings.lowPower && !k.back) {
          for (let b = 0; b < 2; b++) {
            const prog = (t * 0.24 + k.phase * 0.3 + b * 0.5) % 1;
            const bx = Math.round(kx + Math.sin(t * 2.2 + b * 3 + k.phase) * 6);
            const by = Math.round((ky - k.height) - prog * 54);
            if (by > waterlineScreenY + 8 && by < this.height) {
              ctx.fillStyle = `rgba(165, 236, 255, ${((1 - prog) * 0.36).toFixed(2)})`;
              ctx.fillRect(bx, by, 2, 2);
            }
          }
        }
      }

      // 5. Rocky Trench Walls + Glowing Crystal Clusters + Deep Hydrothermal Vents (deep > 1800px / 900m)
      if (this.cameraY > 1400 || this.worldOffset < -1000) {
        const wallAlpha = Math.min(0.92, Math.max(0, (this.cameraY - 1200) / 2200));
        if (wallAlpha > 0.04) {
          const blockH = 72;
          const topIdx = Math.max(18, Math.floor((0 - this.worldOffset) / blockH) - 1);
          const botIdx = Math.min(205, Math.ceil((this.height - this.worldOffset) / blockH) + 1);
          for (let i = topIdx; i <= botIdx; i++) {
            const sy = this.worldOffset + i * blockH;
            const lw = 20 + ((i * 37) % 28);
            const rw = 20 + ((i * 53) % 28);
            ctx.fillStyle = `rgba(9, 17, 31, ${wallAlpha.toFixed(2)})`;
            ctx.fillRect(0, sy, lw, blockH + 2);
            ctx.fillRect(this.width - rw, sy, rw, blockH + 2);
            // Stepped rock shelf
            ctx.fillStyle = `rgba(17, 32, 56, ${(wallAlpha * 0.82).toFixed(2)})`;
            ctx.fillRect(Math.max(0, lw - 10), sy + 6, 10, blockH - 12);
            ctx.fillRect(this.width - rw, sy + 8, 10, blockH - 16);
            // Crisp cyan-slate rock edge highlight
            ctx.fillStyle = `rgba(38, 66, 106, ${(wallAlpha * 0.55).toFixed(2)})`;
            ctx.fillRect(lw - 3, sy + 10, 3, blockH - 22);
            ctx.fillRect(this.width - rw, sy + 12, 3, blockH - 24);

            // Faceted bioluminescent crystal clusters in trench rocks (with soft ambient halo)
            if (i % 3 === 0) {
              const pulse = 0.42 + 0.52 * Math.sin(t * 2.1 + i);
              const pinkCrystal = i % 6 === 0;
              const rgb = pinkCrystal ? '255, 93, 143' : '77, 227, 255';
              const lx = Math.max(4, lw - 11);
              const rx = Math.min(this.width - 10, this.width - rw + 6);
              if (!appState.settings.lowPower) {
                ctx.fillStyle = `rgba(${rgb}, ${(wallAlpha * pulse * 0.16).toFixed(2)})`;
                ctx.fillRect(lx - 4, sy + 12, 15, 15);
                ctx.fillRect(rx - 6, sy + 32, 15, 15);
              }
              ctx.fillStyle = `rgba(${rgb}, ${(wallAlpha * pulse).toFixed(2)})`;
              ctx.fillRect(lx, sy + 16, 4, 7);
              ctx.fillRect(lx + 4, sy + 19, 3, 4);
              ctx.fillRect(rx, sy + 36, 4, 7);
              ctx.fillRect(rx - 3, sy + 39, 3, 4);
              ctx.fillStyle = `rgba(230, 245, 255, ${(wallAlpha * pulse * 0.85).toFixed(2)})`;
              ctx.fillRect(lx + 1, sy + 17, 2, 2);
              ctx.fillRect(rx + 1, sy + 37, 2, 2);
            }

            // Deep hydrothermal crevice glow + warm rising plume particles (> 2200m / i >= 60)
            if (i >= 60 && i % 7 === 0 && !appState.settings.lowPower) {
              const glow = 0.35 + 0.3 * Math.sin(t * 3.1 + i * 1.3);
              const onLeft = i % 14 === 0;
              const vx = onLeft ? lw - 2 : this.width - rw;
              const vy = Math.round(sy + 44);
              ctx.fillStyle = `rgba(255, 130, 74, ${(wallAlpha * glow * 0.72).toFixed(2)})`;
              ctx.fillRect(onLeft ? vx - 4 : vx, vy, 5, 3);
              ctx.fillStyle = `rgba(255, 209, 102, ${(wallAlpha * glow * 0.55).toFixed(2)})`;
              ctx.fillRect(onLeft ? vx - 2 : vx + 1, vy + 1, 2, 2);
              for (let vp = 0; vp < 3; vp++) {
                const prog = (t * 0.42 + vp * 0.33 + i) % 1;
                const px = Math.round(vx + (onLeft ? 3 : -4) + Math.sin(t * 3 + vp * 2) * 3);
                const py = Math.round(vy - prog * 34);
                ctx.fillStyle = `rgba(255, 165, 110, ${((1 - prog) * 0.36 * wallAlpha).toFixed(2)})`;
                ctx.fillRect(px, py, 2, 2);
              }
            }
          }
        }
      }

      // 6. Sunken 4-Funnel Titanic Hull Silhouette at -3,800m (7600px)
      const titanicY = this.worldOffset + 7620;
      if (titanicY > -120 && titanicY < this.height + 120) {
        const tx = Math.round(this.width * 0.38);
        // Hull & prow raked step
        ctx.fillStyle = 'rgba(13, 25, 45, 0.78)';
        ctx.fillRect(tx - 118, titanicY - 22, 236, 34);
        ctx.fillRect(tx - 134, titanicY - 26, 22, 16);
        // Upper superstructure & decks
        ctx.fillRect(tx - 84, titanicY - 38, 164, 16);
        ctx.fillRect(tx - 64, titanicY - 46, 120, 8);
        // 4 iconic funnels (#4 slightly tilted/snapped) + mast + aft mast
        ctx.fillRect(tx - 54, titanicY - 64, 13, 18);
        ctx.fillRect(tx - 24, titanicY - 64, 13, 18);
        ctx.fillRect(tx + 6, titanicY - 64, 13, 18);
        ctx.fillRect(tx + 36, titanicY - 58, 13, 12);
        ctx.fillRect(tx - 98, titanicY - 62, 4, 40);
        ctx.fillRect(tx + 82, titanicY - 52, 3, 30);
        // Faint rigging lines
        ctx.strokeStyle = 'rgba(54, 92, 140, 0.28)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(tx - 96, titanicY - 60);
        ctx.lineTo(tx - 132, titanicY - 26);
        ctx.moveTo(tx - 96, titanicY - 58);
        ctx.lineTo(tx - 54, titanicY - 56);
        ctx.stroke();
        // Subtle hull rim + eerie sunken porthole glints
        ctx.fillStyle = 'rgba(42, 74, 118, 0.5)';
        ctx.fillRect(tx - 116, titanicY - 22, 232, 2);
        ctx.fillStyle = 'rgba(77, 227, 255, 0.32)';
        for (let px = -72; px <= 68; px += 16) {
          ctx.fillRect(tx + px, titanicY - 32, 4, 3);
        }
        const glint = 0.16 + 0.14 * Math.sin(t * 1.9);
        ctx.fillStyle = `rgba(255, 209, 102, ${glint.toFixed(2)})`;
        ctx.fillRect(tx - 48, titanicY - 14, 4, 3);
        ctx.fillRect(tx + 12, titanicY - 14, 4, 3);
        // Slow trail of bubbles escaping from snapped 4th funnel
        if (!appState.settings.lowPower) {
          for (let tb = 0; tb < 4; tb++) {
            const prog = (t * 0.22 + tb * 0.25) % 1;
            const bx = Math.round(tx + 42 + Math.sin(t * 2.5 + tb * 2) * 4);
            const by = Math.round(titanicY - 60 - prog * 68);
            ctx.fillStyle = `rgba(140, 224, 255, ${((1 - prog) * 0.32).toFixed(2)})`;
            ctx.fillRect(bx, by, 2, 2);
          }
        }
      }

      // 7. Deep Ambient Currents + Multi-Layer Marine Snow & Twinkling Bioluminescent Sparks
      if (!appState.settings.lowPower) {
        for (const c of this.currents) {
          const cx = ((c.x + t * c.speed) % 1.15 - 0.08) * this.width;
          const cy = ((c.y * this.height + this.worldOffset * c.parallax) % this.height + this.height) % this.height;
          if (cy <= waterlineScreenY + 14) continue;
          ctx.fillStyle = depthFrac > 0.45
            ? `rgba(77, 227, 255, ${(c.alpha * 0.72).toFixed(3)})`
            : `rgba(182, 232, 255, ${c.alpha.toFixed(3)})`;
          ctx.fillRect(Math.round(cx), Math.round(cy), Math.round(c.len), 1);
          ctx.fillRect(Math.round(cx + c.len * 0.25), Math.round(cy + 2), Math.round(c.len * 0.5), 1);
        }
      }

      const pLimit = appState.settings.lowPower ? 36 : this.particles.length;
      for (let i = 0; i < pLimit; i++) {
        const p = this.particles[i];
        const px = Math.round(((p.x * this.width + Math.sin(t * p.speed + i) * 14) % this.width + this.width) % this.width);
        const rawY = p.y * this.height + this.worldOffset * p.parallax + t * p.speed * 18;
        const py = Math.round(((rawY % this.height) + this.height) % this.height);
        if (py <= waterlineScreenY + 4) continue;

        const tw = p.spark ? (0.45 + 0.55 * Math.sin(t * 2.6 + p.twinkle)) : 1;
        const a = p.alpha * tw;
        if (depthFrac > 0.35 && p.spark) {
          const rgb = p.gold ? '255, 209, 102' : (i % 3 === 0 ? '255, 93, 143' : '77, 227, 255');
          ctx.fillStyle = `rgba(${rgb}, ${(a * 0.95).toFixed(2)})`;
          ctx.fillRect(px, py, 2, 2);
          if (tw > 0.72 && !appState.settings.lowPower) {
            ctx.fillStyle = `rgba(${rgb}, ${(a * 0.45).toFixed(2)})`;
            ctx.fillRect(px - 2, py, 6, 2);
            ctx.fillRect(px, py - 2, 2, 6);
          }
        } else if (depthFrac > 0.55) {
          ctx.fillStyle = i % 3 === 0
            ? `rgba(255, 93, 143, ${(a * 0.75).toFixed(2)})`
            : `rgba(77, 227, 255, ${(a * 0.75).toFixed(2)})`;
          ctx.fillRect(px, py, p.r, p.r);
        } else {
          ctx.fillStyle = `rgba(198, 236, 255, ${(a * 0.85).toFixed(2)})`;
          ctx.fillRect(px, py, p.r, p.r);
        }
      }

      // 8. Pixel Fish Silhouettes, Ambient Micro-Schools, Manta Rays, Deep Anglerfish & Jellyfish
      if (!appState.settings.lowPower) {
        // Synchronized micro-fish schools in upper/mid zones
        for (const sc of this.schools) {
          sc.x = (sc.x + sc.dir * sc.speed + 1) % 1;
          const sy = this.worldOffset + sc.depthPx;
          if (sy < Math.max(waterlineScreenY + 24, -40) || sy > this.height + 40) continue;
          const sx = sc.x * (this.width + 120) - 60;
          for (const m of sc.members) {
            const mx = Math.round(sx + m.ox);
            const my = Math.round(sy + m.oy + Math.sin(t * 3.1 + sc.phase + m.phase) * 2.5);
            ctx.fillStyle = 'rgba(10, 28, 52, 0.56)';
            ctx.fillRect(mx - 3, my - 1, 6, 3);
            ctx.fillRect(sc.dir > 0 ? mx - 5 : mx + 3, my - 2, 2, 4);
            ctx.fillStyle = 'rgba(130, 220, 255, 0.28)';
            ctx.fillRect(mx - 1, my, 3, 1);
          }
        }

        // Individual pixel fish silhouettes
        for (const f of this.fish) {
          f.x = (f.x + f.speed + 1) % 1;
          const fy = this.worldOffset + f.depthPx + Math.sin(t * 1.4 + f.phase) * 3;
          if (fy < Math.max(waterlineScreenY + 18, -40) || fy > this.height + 40) continue;
          const fx = f.x * (this.width + 80) - 40;
          const dir = f.speed > 0 ? 1 : -1;
          const fa = Math.min(0.68, f.alpha * 1.9);
          ctx.save();
          ctx.translate(fx, fy);
          ctx.scale(dir, 1);
          ctx.fillStyle = `rgba(6, 16, 30, ${fa.toFixed(2)})`;
          ctx.fillRect(-f.size * 0.45, -f.size * 0.22, f.size * 0.95, f.size * 0.42);
          ctx.fillRect(-f.size * 0.12, -f.size * 0.38, f.size * 0.32, f.size * 0.16);
          ctx.fillRect(-f.size * 0.82, -f.size * 0.34, f.size * 0.35, f.size * 0.26);
          ctx.fillRect(-f.size * 0.82, f.size * 0.08, f.size * 0.35, f.size * 0.26);
          ctx.fillStyle = `rgba(18, 42, 70, ${(fa * 0.7).toFixed(2)})`;
          ctx.fillRect(-f.size * 0.25, f.size * 0.05, f.size * 0.55, f.size * 0.12);
          if (depthFrac > 0.35) {
            ctx.fillStyle = 'rgba(77, 227, 255, 0.58)';
            ctx.fillRect(f.size * 0.26, -f.size * 0.1, 2, 2);
          }
          ctx.restore();
        }

        // Gliding manta ray silhouettes in mid twilight depths
        for (const m of this.mantas) {
          m.x = (m.x + m.speed + 1) % 1;
          const my = this.worldOffset + m.depthPx + Math.sin(t * 0.8 + m.phase) * 10;
          if (my < Math.max(waterlineScreenY + 36, -60) || my > this.height + 60) continue;
          const mx = m.x * (this.width + 140) - 70;
          const dir = m.speed > 0 ? 1 : -1;
          const wing = Math.round(Math.sin(t * 1.9 + m.phase) * 4);
          ctx.save();
          ctx.translate(Math.round(mx), Math.round(my));
          ctx.scale(dir * m.size, m.size);
          ctx.fillStyle = 'rgba(7, 18, 34, 0.56)';
          ctx.fillRect(-14, -4, 28, 8);
          ctx.fillRect(-6, -10 + wing, 14, 6);
          ctx.fillRect(-4, 4 - wing, 12, 6);
          ctx.fillRect(-28, -1, 14, 2); // whip tail
          ctx.fillStyle = 'rgba(28, 62, 98, 0.38)';
          ctx.fillRect(-6, -2, 16, 3);
          ctx.restore();
        }

        // Deep-sea anglerfish silhouettes with bobbing bioluminescent lure
        for (const a of this.anglers) {
          a.x = (a.x + a.speed + 1) % 1;
          const ay = this.worldOffset + a.depthPx + Math.sin(t * 0.7 + a.phase) * 8;
          if (ay < -50 || ay > this.height + 50) continue;
          const ax = a.x * (this.width + 120) - 60;
          const dir = a.speed > 0 ? 1 : -1;
          const lurePulse = 0.55 + 0.45 * Math.sin(t * 3.4 + a.phase);
          ctx.save();
          ctx.translate(Math.round(ax), Math.round(ay));
          ctx.scale(dir, 1);
          ctx.fillStyle = 'rgba(8, 16, 30, 0.72)';
          ctx.fillRect(-11, -6, 20, 12);
          ctx.fillRect(-16, -4, 5, 8);
          ctx.fillRect(6, -10, 2, 5); // lure stalk
          ctx.fillRect(8, -10, 6, 2);
          // Glowing lure bulb + halo
          ctx.fillStyle = `rgba(255, 209, 102, ${(lurePulse * 0.22).toFixed(2)})`;
          ctx.fillRect(11, -13, 10, 10);
          ctx.fillStyle = `rgba(255, 230, 140, ${lurePulse.toFixed(2)})`;
          ctx.fillRect(14, -10, 4, 4);
          ctx.fillStyle = 'rgba(255, 93, 143, 0.6)';
          ctx.fillRect(4, -3, 2, 2); // tiny eye
          ctx.restore();
        }

        // Translucent pulsing jellyfish with soft bioluminescent halo & wavy segmented tentacles
        for (const j of this.jellies) {
          const jy = this.worldOffset + j.depthPx + Math.sin(t * 0.9 + j.phase) * 14;
          if (jy < Math.max(waterlineScreenY + 24, -40) || jy > this.height + 55) continue;
          const jx = Math.round(j.x * this.width + Math.sin(t * 0.45 + j.phase) * j.drift);
          const ry = Math.round(jy);
          const pulse = 0.24 + 0.16 * Math.sin(t * 2.2 + j.phase);
          const rgb = j.gold ? '255, 209, 102' : (j.pink ? '255, 93, 143' : '77, 227, 255');
          const sc = j.scale || 1;
          const bellW = Math.round(14 * sc);
          const halfW = Math.round(bellW * 0.5);
          // Soft ambient halo
          ctx.fillStyle = `rgba(${rgb}, ${(pulse * 0.22).toFixed(2)})`;
          ctx.fillRect(jx - halfW - 3, ry - 9, bellW + 6, 13);
          // Stepped bell dome + glowing core
          ctx.fillStyle = `rgba(${rgb}, ${(pulse * 0.72).toFixed(2)})`;
          ctx.fillRect(jx - halfW, ry - 4, bellW, 5);
          ctx.fillRect(jx - halfW + 2, ry - 7, bellW - 4, 3);
          ctx.fillStyle = `rgba(${rgb}, ${(pulse * 1.15).toFixed(2)})`;
          ctx.fillRect(jx - Math.round(halfW * 0.5), ry - 5, Math.max(4, Math.round(bellW * 0.5)), 3);
          ctx.fillStyle = `rgba(240, 250, 255, ${(pulse * 0.85).toFixed(2)})`;
          ctx.fillRect(jx - 2, ry - 6, 4, 2);
          // Wavy 4-segment tentacles
          const tentXs = [-halfW + 2, -1, halfW - 4];
          for (let ti = 0; ti < tentXs.length; ti++) {
            const baseTx = jx + tentXs[ti];
            const segs = ti === 1 ? 5 : 4;
            for (let s = 0; s < segs; s++) {
              const waveX = Math.round(Math.sin(t * 3.0 + j.phase + s * 0.9 + ti) * 1.8);
              ctx.fillStyle = `rgba(${rgb}, ${(pulse * (0.95 - s * 0.16)).toFixed(2)})`;
              ctx.fillRect(baseTx + waveX, ry + 1 + s * 3, 2, 3);
            }
          }
        }
      }

      // 9. Orbiting effects around sinking chip (schooler fish, krillion swarm, ink puffs)
      if (this.orbitEffect && !appState.settings.lowPower) {
        const oe = this.orbitEffect;
        const count = oe.kind === 'krillion' ? 14 : oe.kind === 'schooler' ? 6 : 0;
        for (let i = 0; i < count; i++) {
          const ang = t * (oe.kind === 'krillion' ? 2.8 : 1.9) + (i * Math.PI * 2) / count;
          const rad = (oe.kind === 'krillion' ? 76 : 64) + Math.sin(t * 2 + i) * 14;
          const ox = oe.x + Math.cos(ang) * rad;
          const oy = oe.y + Math.sin(ang) * rad * 0.55;
          fctx.fillStyle = oe.kind === 'krillion' ? '#ff5d8f' : '#4de3ff';
          fctx.fillRect(Math.round(ox - 4), Math.round(oy - 2), 8, 4);
          fctx.fillRect(Math.round(ox - 7), Math.round(oy - 3), 3, 6);
        }
      }

      // 10. Ink puffs (squid rare tier)
      for (let i = this.inkPuffs.length - 1; i >= 0; i--) {
        const p = this.inkPuffs[i];
        p.x += p.vx;
        p.y += p.vy;
        p.r += 0.35;
        p.life -= 0.018;
        if (p.life <= 0) {
          this.inkPuffs.splice(i, 1);
          continue;
        }
        fctx.fillStyle = `rgba(110, 14, 34, ${(p.life * 0.45).toFixed(3)})`;
        fctx.beginPath();
        fctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        fctx.fill();
      }

      // 11. Pixel spark bursts
      for (let i = this.sparks.length - 1; i >= 0; i--) {
        const sp = this.sparks[i];
        sp.x += sp.vx;
        sp.y += sp.vy;
        sp.vy += 0.06;
        sp.life -= 0.032;
        if (sp.life <= 0) {
          this.sparks.splice(i, 1);
          continue;
        }
        fctx.globalAlpha = Math.max(0, sp.life);
        fctx.fillStyle = sp.color;
        fctx.fillRect(Math.round(sp.x), Math.round(sp.y), sp.size, sp.size);
      }
      fctx.globalAlpha = 1;

      // 12. Foreground rising bubbles
      for (let i = this.bubbles.length - 1; i >= 0; i--) {
        const b = this.bubbles[i];
        b.y -= b.vy;
        b.x += Math.sin(t * 2 + b.wobble) * 0.35;
        if (b.ephemeral) {
          b.life -= 0.016;
          if (b.life <= 0) {
            this.bubbles.splice(i, 1);
            continue;
          }
        } else if (b.y < Math.max(0, waterlineScreenY)) {
          b.y = this.height + 10;
          b.x = Math.random() * this.width;
        }
        if (b.y <= waterlineScreenY + 4) continue;
        fctx.strokeStyle = b.color || 'rgba(195, 240, 255, 0.38)';
        fctx.globalAlpha = b.ephemeral ? Math.max(0, b.life * 0.72) : 0.4;
        fctx.lineWidth = 1.5;
        fctx.beginPath();
        fctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        fctx.stroke();
        if (b.r >= 2) {
          fctx.fillStyle = 'rgba(235, 250, 255, 0.72)';
          fctx.fillRect(Math.round(b.x - b.r * 0.4), Math.round(b.y - b.r * 0.4), 1.5, 1.5);
        }
      }
      fctx.globalAlpha = 1;

      // 13. Right-Edge Canvas Depth Ruler (hidden behind Done dashboard)
      if (!appEl || appEl.dataset.phase !== 'done') {
        this.drawDepthRuler(fctx, waterlineScreenY);
      }

      ctx.restore();
      fctx.restore();
    }
  }

  function lerpHex(a, b, t) {
    const ah = parseInt(a.slice(1), 16);
    const bh = parseInt(b.slice(1), 16);
    const ar = (ah >> 16) & 255, ag = (ah >> 8) & 255, ab = ah & 255;
    const br = (bh >> 16) & 255, bg = (bh >> 8) & 255, bb = bh & 255;
    const rr = Math.round(ar + (br - ar) * t);
    const rg = Math.round(ag + (bg - ag) * t);
    const rb = Math.round(ab + (bb - ab) * t);
    return `rgb(${rr}, ${rg}, ${rb})`;
  }

  // ---------------- Mascot Controller ----------------
  class MascotController {
    constructor(el, imgEl) {
      this.el = el;
      this.img = imgEl;
      this.x = 40;
      this.y = 200;
      this.prevX = 40;
      this.facing = 1;
      this.spriteWrap = this.el.querySelector('.ds-mascot-sprite');
      this.applyBuddy();
      this.el.addEventListener('click', () => this.poke());
      this.el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.poke();
        }
      });
    }

    applyBuddy() {
      const buddy = DATA.BUDDIES.find((b) => b.id === appState.buddyId) || DATA.BUDDIES[0];
      this.img.src = buddy.sprite;
      this.img.alt = buddy.name;
      this.el.style.setProperty('--dsm-color', buddy.color);
      this.el.style.setProperty('--dsm-glow', buddy.color);
      this.el.style.setProperty('--dsm-shadow', buddy.color + '73');
      this.el.classList.toggle('gold', !!buddy.gold);
    }

    playAnim(cls) {
      this.img.classList.remove('jet', 'chomp', 'dive');
      void this.img.offsetWidth;
      if (cls) this.img.classList.add(cls);
    }

    setPanic() {
      // No-op: keep motion smooth and natural like original krillion.io
    }

    react(kind, color) {
      if (kind === 'reject' || kind === 'miss') return;
      const buddy = DATA.BUDDIES.find((b) => b.id === appState.buddyId) || DATA.BUDDIES[0];
      const fxColor = color || buddy.color;
      if (kind === 'krillion' || kind === 'deepcut') {
        this.playAnim('jet');
        ocean.spawnBurst(this.x + 32, this.y + 32, fxColor, 14);
      } else if (kind === 'rare' || kind === 'schooler') {
        this.playAnim('dive');
        ocean.spawnBurst(this.x + 32, this.y + 32, fxColor, 8);
      } else {
        this.playAnim('dive');
      }
    }

    poke() {
      sfx.mascot();
      this.playAnim(Math.random() > 0.45 ? 'jet' : 'chomp');
      const buddy = DATA.BUDDIES.find((b) => b.id === appState.buddyId) || DATA.BUDDIES[0];
      ocean.spawnBurst(this.x + 32, this.y + 32, buddy.color, 10);
    }

    update(ts, phase) {
      const vv = window.visualViewport;
      const w = vv ? vv.width : window.innerWidth;
      const h = vv ? vv.height : window.innerHeight;
      if (phase === 'done') {
        if (w < 560) {
          this.el.style.opacity = '0';
          return;
        }
        this.el.style.opacity = '';
        this.x = Math.max(w - 110, w * 0.78);
        this.y = 115 + Math.sin(ts * 0.002) * 8;
        this.el.style.transform = `translate3d(${this.x.toFixed(1)}px, ${this.y.toFixed(1)}px, 0) rotate(-6deg)`;
        if (this.spriteWrap) this.spriteWrap.style.transform = '';
        return;
      }
      this.el.style.opacity = '';
      if (appState.settings.lowPower) {
        this.x = phase === 'intro' ? Math.round(w - 108) : 28;
        this.y = phase === 'intro' ? Math.round(h * 0.62) : Math.round(h - 178);
        this.el.style.transform = `translate3d(${this.x}px, ${this.y}px, 0) rotate(-4deg)`;
        if (this.spriteWrap) this.spriteWrap.style.transform = '';
        return;
      }
      const t = ts * 0.0008;
      if (phase === 'intro') {
        const cx = w * 0.72;
        const cy = h * 0.62;
        const rx = Math.min(w * 0.14, 110);
        const ry = Math.min(h * 0.06, 42);
        this.x = Math.max(16, Math.min(w - 88, cx + Math.cos(t) * rx));
        this.y = Math.max(76, Math.min(h - 165, cy + Math.sin(t * 1.6) * ry));
        const rot = Math.sin(t * 2.1) * 11;
        this.el.style.transform = `translate3d(${this.x.toFixed(1)}px, ${this.y.toFixed(1)}px, 0) rotate(${rot.toFixed(1)}deg)`;
        if (this.spriteWrap) this.spriteWrap.style.transform = (this.x - this.prevX) > 0.04 ? 'scaleX(-1)' : '';
        this.prevX = this.x;
        return;
      }
      // Smooth krillion.io-style figure-8 floating in open water beside the prompt
      const cx = w >= 860 ? w * 0.8 : w * 0.78;
      const cy = h * 0.64;
      const rx = w >= 860 ? Math.min(w * 0.09, 95) : Math.min(w * 0.12, 54);
      const ry = Math.min(h * 0.07, 46);
      this.x = Math.max(18, Math.min(w - 86, cx + Math.cos(t * 0.9) * rx));
      this.y = Math.max(88, Math.min(h - 150, cy + Math.sin(t * 1.5) * ry));
      const dx = this.x - this.prevX;
      if (Math.abs(dx) > 0.05) this.facing = dx > 0 ? -1 : 1;
      this.prevX = this.x;
      const rot = Math.sin(t * 1.8) * 10 + (phase === 'feedback' ? 8 : 0);
      this.el.style.transform = `translate3d(${this.x.toFixed(1)}px, ${this.y.toFixed(1)}px, 0) rotate(${rot.toFixed(1)}deg)`;
      if (this.spriteWrap) {
        this.spriteWrap.style.transform = this.facing === -1 ? 'scaleX(-1)' : '';
      }
    }
  }

  // ---------------- DOM References ----------------
  const appEl = document.getElementById('app');
  const stageEl = document.getElementById('stage');
  const worldEl = document.getElementById('world');
  const worldMarkersEl = document.getElementById('world-markers');
  const roundLayerEl = document.getElementById('round-layer');
  const floorEl = document.getElementById('floor');
  const seaCanvas = document.getElementById('sea-canvas');
  const foreCanvas = document.getElementById('fore-canvas');
  const dimEl = document.getElementById('dim-overlay');
  const vignetteEl = document.getElementById('vignette');
  const crtEl = document.getElementById('crt');

  const heroTitleEl = document.getElementById('hero-title');
  const heroTaglineEl = document.getElementById('hero-tagline');
  const heroSublineEl = document.getElementById('hero-subline');
  const surfaceNoteEl = document.getElementById('surface-note');
  const introDiveNumEl = document.getElementById('intro-dive-num');
  const beginBtn = document.getElementById('begin-btn');
  const metaDailyBtn = document.getElementById('meta-daily-btn');
  const metaEndlessBtn = document.getElementById('meta-endless-btn');

  const hudDepthEl = document.getElementById('hud-depth');
  const hudScoreEl = document.getElementById('hud-score');
  const scorePodEl = document.getElementById('score-pod');
  const hudDotsEl = document.getElementById('hud-dots');
  const hudCountEl = document.getElementById('hud-count');
  const endlessSurfaceBtn = document.getElementById('endless-surface-btn');

  const promptCardEl = document.getElementById('prompt-card');
  const cardRoundEl = document.getElementById('card-round');
  const cardPromptEl = document.getElementById('card-prompt');

  const previewSecEl = document.getElementById('preview-sec');
  const answerForm = document.getElementById('answer-form');
  const answerInput = document.getElementById('answer-input');
  const diveBtn = document.getElementById('dive-btn');
  const timerDigitsEl = document.getElementById('timer-digits');
  const fuseFillEl = document.getElementById('fuse-fill');
  const correctionBoxEl = document.getElementById('correction-box');
  const rejectBoxEl = document.getElementById('reject-box');

  const nextWrapEl = document.getElementById('next-wrap');
  const nextBtn = document.getElementById('next-btn');
  const nextSurfaceBtn = document.getElementById('next-surface-btn');

  const doneInnerEl = document.getElementById('done-inner');

  const menuBtn = document.getElementById('menu-btn');
  const muteBtn = document.getElementById('mute-btn');
  const muteIconOn = document.getElementById('mute-icon-on');
  const muteIconOff = document.getElementById('mute-icon-off');
  const settingsBtn = document.getElementById('settings-btn');
  const wardrobeBtn = document.getElementById('wardrobe-btn');

  const ocean = new OceanStage(seaCanvas, foreCanvas, worldEl);
  const mascot = new MascotController(document.getElementById('mascot'), document.getElementById('mascot-img'));

  // ---------------- Static World Elements ----------------
  function initStaticDecor() {
    // Staggered bobbing hero letters
    const titleWord = 'КРИЛЛИОН';
    heroTitleEl.innerHTML = titleWord
      .split('')
      .map((ch, i) => `<span style="animation-delay: ${(i * 0.18).toFixed(2)}s;">${ch}</span>`)
      .join('');

    // Ambient markers
    worldMarkersEl.innerHTML = DATA.AMBIENT_MARKERS.map((m) => {
      const inner = m.side === 'L'
        ? `<span class="dash">──</span> ${m.text}`
        : `${m.text} <span class="dash">──</span>`;
      return `<div class="ds-amb ${m.side}${m.major ? ' major' : ''}" style="top: ${m.top}px;">${inner}</div>`;
    }).join('');

    // Trench floor rocky sill + hydrothermal vent glow
    floorEl.innerHTML = `
      <svg viewBox="0 0 800 320" preserveAspectRatio="none" shape-rendering="crispEdges" style="width:100%;height:100%;display:block;">
        <rect width="800" height="320" fill="#02050b"/>
        <path d="M0 140h60v-20h80v30h90v-40h110v25h70v-15h100v35h80v-25h110v15h100v175H0z" fill="#060f1e"/>
        <path d="M0 190h90v-15h120v20h80v-25h130v30h90v-20h120v15h170v125H0z" fill="#09162b"/>
        <rect x="110" y="130" width="24" height="60" fill="#101d33"/>
        <rect x="116" y="124" width="12" height="6" fill="#ff5d8f"/>
        <rect x="520" y="140" width="32" height="55" fill="#101d33"/>
        <rect x="528" y="134" width="16" height="6" fill="#4de3ff"/>
        <rect x="330" y="185" width="40" height="12" fill="#ffd166" opacity="0.25"/>
        <rect x="0" y="240" width="800" height="80" fill="#050a14"/>
      </svg>
    `;
  }

  // ---------------- Game Session State ----------------
  let session = {
    mode: 'daily', // 'daily' | 'archive' | 'endless'
    diveNumber: DATA.getTodayDiveNumber(),
    phase: 'intro',
    prompts: [],
    roundIndex: 0,
    totalScore: 0,
    totalDepthM: 0,
    results: [],
    pendingSuggestion: null, // { typed, answer }
    previewTimer: null,
    answerTimerRaf: null,
    feedbackAnimRaf: null,
    answerDeadline: 0,
    lastShownSecond: ROUND_SECONDS
  };

  function setPhase(phase) {
    const prevPhase = session.phase;
    session.phase = phase;
    appEl.dataset.phase = phase;
    if (phase !== 'answering') {
      document.documentElement.classList.remove('kb-open');
      if (prevPhase === 'answering' && typeof syncViewportLayout === 'function') {
        requestAnimationFrame(syncViewportLayout);
      }
    }
    crtEl.classList.remove('zap');
    void crtEl.offsetWidth;
    crtEl.classList.add('zap');
  }

  function applySettingsToDom() {
    document.documentElement.classList.toggle('colorblind', !!appState.settings.colorblind);
    document.documentElement.classList.toggle('lowpower', !!appState.settings.lowPower);
    const muted = !!appState.settings.muted;
    muteIconOn.hidden = muted;
    muteIconOff.hidden = !muted;
    muteBtn.setAttribute('aria-pressed', String(muted));
    muteBtn.setAttribute('aria-label', muted ? 'Включить звук' : 'Выключить звук');

    document.getElementById('opt-lowpower').checked = !!appState.settings.lowPower;
    document.getElementById('opt-colorblind').checked = !!appState.settings.colorblind;
    document.getElementById('opt-corrections').checked = !!appState.settings.answerCorrections;
    document.getElementById('opt-clear-rejected').checked = !!appState.settings.clearRejected;
    document.getElementById('opt-share-link').checked = !!appState.settings.shareLink;
    document.getElementById('opt-unlock-buddies').checked = !!appState.settings.unlockAllBuddies;

    ocean.resize();
    mascot.applyBuddy();
  }

  function clearTimers() {
    if (session.previewTimer) {
      clearInterval(session.previewTimer);
      session.previewTimer = null;
    }
    if (session.answerTimerRaf) {
      cancelAnimationFrame(session.answerTimerRaf);
      session.answerTimerRaf = null;
    }
    if (session.feedbackAnimRaf) {
      cancelAnimationFrame(session.feedbackAnimRaf);
      session.feedbackAnimRaf = null;
    }
  }

  // ---------------- Mode Setup ----------------
  function buildEndlessDeck() {
    const seenSet = new Set(appState.seenEndlessIds || []);
    let unseen = DATA.PROMPTS.filter((p) => !seenSet.has(p.id));
    if (unseen.length === 0) {
      appState.seenEndlessIds = [];
      saveState();
      unseen = DATA.PROMPTS.slice();
    }
    const rest = DATA.PROMPTS.filter((p) => seenSet.has(p.id));
    return shufflePrompts(unseen).concat(shufflePrompts(rest));
  }

  function openMode(mode, param = DATA.getTodayDiveNumber()) {
    clearTimers();
    session.mode = mode;
    session.diveNumber = mode === 'expedition' ? DATA.getTodayDiveNumber() : param;
    session.expeditionId = mode === 'expedition' ? param : null;
    session.newlyUnlockedBuddies = [];
    session.roundIndex = 0;
    session.totalScore = 0;
    session.totalDepthM = 0;
    session.results = [];
    session.pendingSuggestion = null;
    ocean.orbitEffect = null;

    roundLayerEl.innerHTML = '';
    worldEl.classList.remove('ds-reveal');
    dimEl.classList.remove('on');
    nextWrapEl.classList.remove('visible');
    promptCardEl.hidden = true;
    correctionBoxEl.hidden = true;
    correctionBoxEl.innerHTML = '';
    rejectBoxEl.hidden = true;
    rejectBoxEl.textContent = '';
    appEl.style.setProperty('--ds-urgency', '0');
    appEl.classList.remove('hot');
    answerForm.classList.remove('hot');
    floorEl.style.display = mode === 'endless' ? 'none' : 'block';

    const expObj = mode === 'expedition' && DATA.getExpedition ? DATA.getExpedition(param) : null;
    const diveTheme = expObj
      ? expObj
      : (mode === 'daily' || mode === 'archive') && DATA.getDiveTheme
        ? DATA.getDiveTheme(session.diveNumber)
        : null;

    if (diveTheme) {
      const kickerText = expObj ? `ЭКСПЕДИЦИЯ #${expObj.num}` : 'ТЕМА ДНЯ';
      surfaceNoteEl.classList.add('ds-theme-pill');
      surfaceNoteEl.style.setProperty('--theme-accent', diveTheme.accent);
      surfaceNoteEl.innerHTML = `<span class="ds-theme-pill-kicker">${kickerText}</span><span class="ds-theme-pill-icon" aria-hidden="true">${escapeHtml(diveTheme.icon)}</span><span>${escapeHtml(diveTheme.title)}</span>`;
      surfaceNoteEl.hidden = false;
    } else {
      surfaceNoteEl.classList.remove('ds-theme-pill');
      surfaceNoteEl.style.removeProperty('--theme-accent');
      surfaceNoteEl.textContent = '';
      surfaceNoteEl.hidden = true;
    }

    if (mode === 'daily') {
      session.prompts = DATA.getDailyPrompts(session.diveNumber);
      heroTaglineEl.textContent = 'ЕЖЕДНЕВНОЕ ПОГРУЖЕНИЕ';
      heroSublineEl.textContent = '7 вопросов · 25 секунд на каждый · редкие ответы погружают глубже';
      introDiveNumEl.textContent = `ПОГРУЖЕНИЕ #${session.diveNumber}`;
      metaDailyBtn.hidden = true;
      metaEndlessBtn.hidden = false;

      const saved = appState.completedDives[String(session.diveNumber)];
      if (saved) {
        beginBtn.textContent = '▼ ПОСМОТРЕТЬ РЕЗУЛЬТАТЫ ▼';
        beginBtn.classList.add('secondary');
      } else {
        beginBtn.textContent = '▼ НАЧАТЬ ПОГРУЖЕНИЕ ▼';
        beginBtn.classList.remove('secondary');
      }
    } else if (mode === 'archive') {
      session.prompts = DATA.getDailyPrompts(session.diveNumber);
      heroTaglineEl.textContent = `АРХИВ · ПОГРУЖЕНИЕ #${session.diveNumber}`;
      heroSublineEl.textContent = `7 вопросов от ${DATA.getDiveDateLabel(session.diveNumber)} · бесплатный доступ`;
      introDiveNumEl.textContent = `АРХИВ #${session.diveNumber}`;
      metaDailyBtn.hidden = false;
      metaEndlessBtn.hidden = false;
      beginBtn.textContent = '▼ НАЧАТЬ ПОГРУЖЕНИЕ ▼';
      beginBtn.classList.remove('secondary');
    } else if (mode === 'expedition' && expObj) {
      session.prompts = DATA.getExpeditionPrompts(expObj.id);
      const savedExp = (appState.expeditions || {})[expObj.id];
      heroTaglineEl.textContent = `ЭКСПЕДИЦИЯ #${expObj.num} ИЗ ${DATA.EXPEDITIONS.length}`;
      heroSublineEl.textContent = savedExp
        ? `7 вопросов по теме · лучший результат: ${savedExp.bestScore} очк (-${savedExp.bestDepth}м)`
        : expObj.desc;
      introDiveNumEl.textContent = `ЭКСПЕДИЦИЯ · ${expObj.short.toUpperCase()}`;
      metaDailyBtn.hidden = false;
      metaEndlessBtn.hidden = false;
      beginBtn.textContent = savedExp ? '▼ ПОГРУЗИТЬСЯ ЕЩЁ РАЗ ▼' : '▼ НАЧАТЬ ЭКСПЕДИЦИЮ ▼';
      beginBtn.classList.remove('secondary');
    } else {
      session.prompts = buildEndlessDeck();
      heroTaglineEl.textContent = 'БЕСКОНЕЧНОЕ ПОГРУЖЕНИЕ';
      const totalTopics = DATA.PROMPTS.length;
      const m10 = totalTopics % 10;
      const m100 = totalTopics % 100;
      const topicsWord = (m10 === 1 && m100 !== 11) ? 'тема' : (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) ? 'темы' : 'тем';
      heroSublineEl.textContent = `${totalTopics} ${topicsWord} без повторов · без ограничений · всплывайте в любой момент`;
      introDiveNumEl.textContent = `БЕСКОНЕЧНЫЙ · ${totalTopics} ${topicsWord.toUpperCase()}`;
      metaDailyBtn.hidden = false;
      metaEndlessBtn.hidden = true;
      beginBtn.textContent = '▼ НАЧАТЬ ПОГРУЖЕНИЕ ▼';
      beginBtn.classList.remove('secondary');
    }

    ocean.setCameraDepthPx(0, 0.54);
    vignetteEl.style.opacity = '0.25';
    setPhase('intro');
    updateMenuCurrent();
    if (DATA.preloadPrompts) {
      DATA.preloadPrompts(session.prompts.slice(0, 7));
    }
  }

  function shufflePrompts(list) {
    const arr = list.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function updateMenuCurrent() {
    document.querySelectorAll('[data-nav]').forEach((el) => {
      const target = el.dataset.nav;
      const active = target === session.mode || (target === 'expeditions' && session.mode === 'expedition');
      el.setAttribute('aria-current', active ? 'page' : 'false');
    });
  }

  // ---------------- Gameplay Loop ----------------
  function startDiveOrShowResults() {
    sfx.click();
    if (session.mode === 'daily') {
      const saved = appState.completedDives[String(session.diveNumber)];
      if (saved) {
        session.results = saved.results;
        session.totalScore = saved.score;
        session.totalDepthM = saved.depth;
        showDoneScreen();
        return;
      }
    }
    startNextRound();
  }

  function getCurrentPrompt() {
    if (session.mode === 'endless') {
      if (session.roundIndex >= session.prompts.length) {
        appState.seenEndlessIds = [];
        saveState();
        session.prompts = session.prompts.concat(shufflePrompts(DATA.PROMPTS));
      }
    }
    return session.prompts[session.roundIndex];
  }

  function updateHud() {
    hudDepthEl.textContent = `${session.totalDepthM.toLocaleString('ru-RU')}м`;
    hudScoreEl.textContent = String(session.totalScore);
    endlessSurfaceBtn.hidden = session.mode !== 'endless' || session.results.length === 0;

    if (session.mode === 'endless') {
      hudCountEl.textContent = `ВОПРОС ${session.roundIndex + 1} · БЕСКОНЕЧНЫЙ`;
      const recent = session.results.slice(-7);
      hudDotsEl.innerHTML = recent
        .map((r) => `<i class="done" style="--tc:${DATA.TIERS[r.tier].color};"></i>`)
        .join('') + '<i class="cur"></i>';
    } else {
      hudCountEl.textContent = `ВОПРОС ${session.roundIndex + 1} ИЗ 7`;
      hudDotsEl.innerHTML = Array.from({ length: 7 }, (_, i) => {
        if (i < session.results.length) {
          const t = DATA.TIERS[session.results[i].tier];
          return `<i class="done" style="--tc:${t.color};"></i>`;
        }
        if (i === session.roundIndex) return '<i class="cur"></i>';
        return '<i></i>';
      }).join('');
    }
  }

  function startNextRound() {
    clearTimers();
    const prompt = getCurrentPrompt();
    const loadPromise = (DATA.loadPromptAnswers && !hasLoadedAnswers(prompt))
      ? DATA.loadPromptAnswers(prompt.id)
      : Promise.resolve(prompt.answers);
    if (DATA.preloadPrompts && session.prompts[session.roundIndex + 1]) {
      DATA.preloadPrompts([session.prompts[session.roundIndex + 1]]);
    }
    const startPx = session.totalDepthM * PX_PER_METER;
    ocean.setCameraDepthPx(startPx, 0.38);

    worldEl.classList.remove('ds-reveal');
    dimEl.classList.remove('on');
    roundLayerEl.innerHTML = '';
    nextWrapEl.classList.remove('visible');
    correctionBoxEl.hidden = true;
    correctionBoxEl.innerHTML = '';
    rejectBoxEl.hidden = true;
    rejectBoxEl.textContent = '';
    session.pendingSuggestion = null;
    appEl.style.setProperty('--ds-urgency', '0');
    appEl.classList.remove('hot');
    answerForm.classList.remove('hot');

    const pill = previewSecEl.parentElement;
    if (pill) {
      pill.onclick = null;
      pill.style.cursor = '';
    }

    updateHud();

    const roundTheme = session.mode !== 'endless' && DATA.getDiveTheme
      ? DATA.getDiveTheme(session.diveNumber)
      : null;
    cardRoundEl.textContent = session.mode === 'endless'
      ? `ВОПРОС ${session.roundIndex + 1} · БЕСКОНЕЧНЫЙ`
      : roundTheme
        ? `ВОПРОС ${session.roundIndex + 1} ИЗ 7 · ${roundTheme.icon} ${roundTheme.short.toUpperCase()}`
        : `ВОПРОС ${session.roundIndex + 1} ИЗ 7`;
    cardPromptEl.textContent = prompt.text;
    promptCardEl.classList.remove('gone');
    promptCardEl.hidden = false;

    setPhase('preview');

    let left = 3;
    previewSecEl.textContent = String(left);
    sfx.countdownTick(false);

    const beginWhenReady = () => {
      if (session.phase !== 'preview') return;
      if (hasLoadedAnswers(prompt)) {
        if (pill) {
          pill.onclick = null;
          pill.style.cursor = '';
        }
        sfx.countdownTick(true);
        beginAnsweringPhase();
        return;
      }
      previewSecEl.textContent = 'ошибка (нажмите для повтора)';
      if (pill) {
        pill.style.cursor = 'pointer';
        pill.onclick = () => {
          if (session.phase !== 'preview') return;
          previewSecEl.textContent = '…';
          DATA.loadPromptAnswers(prompt.id).then(beginWhenReady);
        };
      }
    };

    session.previewTimer = setInterval(() => {
      left -= 1;
      if (left > 0) {
        previewSecEl.textContent = String(left);
        sfx.countdownTick(false);
      } else {
        clearInterval(session.previewTimer);
        session.previewTimer = null;
        if (hasLoadedAnswers(prompt)) {
          beginWhenReady();
        } else {
          previewSecEl.textContent = '…';
          loadPromise.then(beginWhenReady);
        }
      }
    }, 820);
  }

  function beginAnsweringPhase() {
    setPhase('answering');
    answerInput.value = '';
    answerInput.disabled = false;
    diveBtn.disabled = false;
    timerDigitsEl.textContent = String(ROUND_SECONDS);
    timerDigitsEl.classList.remove('hot');
    fuseFillEl.style.transform = 'scaleX(1)';

    setTimeout(() => {
      answerInput.focus();
    }, 60);

    const durationMs = ROUND_SECONDS * 1000;
    session.answerDeadline = performance.now() + durationMs;
    session.lastShownSecond = ROUND_SECONDS;

    const step = (now) => {
      if (session.phase !== 'answering') return;
      const remMs = Math.max(0, session.answerDeadline - now);
      const frac = remMs / durationMs;
      const sec = Math.ceil(remMs / 1000);

      fuseFillEl.style.transform = `scaleX(${frac.toFixed(4)})`;

      if (sec !== session.lastShownSecond) {
        session.lastShownSecond = sec;
        timerDigitsEl.textContent = String(sec);
        if (sec <= 5 && sec > 0) {
          sfx.urgentTick();
        }
      }

      if (remMs <= 5000) {
        answerForm.classList.add('hot');
        appEl.classList.add('hot');
        timerDigitsEl.classList.add('hot');
        mascot.setPanic(true);
        const urg = ((5000 - remMs) / 5000).toFixed(3);
        appEl.style.setProperty('--ds-urgency', urg);
      }

      if (remMs <= 0) {
        handleTimeout();
        return;
      }

      session.answerTimerRaf = requestAnimationFrame(step);
    };

    session.answerTimerRaf = requestAnimationFrame(step);
  }

  function handleTimeout() {
    clearTimers();
    mascot.setPanic(false);
    appEl.style.setProperty('--ds-urgency', '0');
    appEl.classList.remove('hot');
    answerForm.classList.remove('hot');

    // If an autocorrect suggestion is waiting, auto-accept it!
    if (session.pendingSuggestion) {
      acceptAnswer(session.pendingSuggestion.answer);
      return;
    }

    // Check if whatever is currently typed happens to be valid
    const prompt = getCurrentPrompt();
    if (answerInput.value.trim()) {
      const m = matchAnswer(answerInput.value, prompt);
      if (m.status === 'exact' || m.status === 'fuzzy') {
        acceptAnswer(m.answer);
        return;
      }
    }

    // Miss
    acceptAnswer(null);
  }

  function showReject(typed) {
    sfx.reject();
    rejectBoxEl.innerHTML = '';
    const msgSpan = document.createElement('span');
    msgSpan.textContent = `«${typed}»: нет эха. попробуйте ещё`;
    const repBtn = document.createElement('button');
    repBtn.type = 'button';
    repBtn.className = 'ds-reject-report-btn';
    repBtn.textContent = '⚑ должен быть?';
    repBtn.addEventListener('click', () => {
      sfx.click();
      const prompt = getCurrentPrompt();
      openBugReportModal({
        category: 'missing-answer',
        promptText: prompt ? `${prompt.text} [${prompt.id}]` : '',
        answerText: typed,
        descText: ''
      });
    });
    rejectBoxEl.appendChild(msgSpan);
    rejectBoxEl.appendChild(repBtn);
    rejectBoxEl.hidden = false;
    rejectBoxEl.classList.remove('ds-reject-shake');
    void rejectBoxEl.offsetWidth;
    rejectBoxEl.classList.add('ds-reject-shake');

    if (appState.settings.clearRejected) {
      answerInput.value = '';
    }
  }

  function showCorrection(typed, canonical) {
    sfx.suggest();
    rejectBoxEl.hidden = true;
    correctionBoxEl.innerHTML = `
      <div class="ds-correction-panel ds-px-sm">
        <span>«${escapeHtml(typed)}»</span>
        <span class="ds-correction-arrow">→</span>
        <span>«${escapeHtml(canonical)}»</span>
        <span class="ds-correction-hint">отправьте ещё раз для подтверждения · или исправьте</span>
      </div>
    `;
    correctionBoxEl.hidden = false;
  }

  answerInput.addEventListener('input', () => {
    rejectBoxEl.hidden = true;
    rejectBoxEl.textContent = '';
    if (session.pendingSuggestion && normalizeInput(answerInput.value) !== normalizeInput(session.pendingSuggestion.typed)) {
      session.pendingSuggestion = null;
      correctionBoxEl.hidden = true;
      correctionBoxEl.innerHTML = '';
    }
  });

  answerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (session.phase !== 'answering') return;

    const raw = answerInput.value.trim();
    if (!raw) return;

    const prompt = getCurrentPrompt();

    // Confirming pending suggestion
    if (session.pendingSuggestion && normalizeInput(raw) === normalizeInput(session.pendingSuggestion.typed)) {
      acceptAnswer(session.pendingSuggestion.answer);
      return;
    }

    const res = matchAnswer(raw, prompt);
    if (res.status === 'exact') {
      acceptAnswer(res.answer);
    } else if (res.status === 'fuzzy') {
      if (appState.settings.answerCorrections) {
        session.pendingSuggestion = { typed: raw, answer: res.answer };
        showCorrection(raw, res.answer.name);
      } else {
        acceptAnswer(res.answer);
      }
    } else {
      session.pendingSuggestion = null;
      correctionBoxEl.hidden = true;
      correctionBoxEl.innerHTML = '';
      showReject(raw);
      mascot.react('reject');
    }
  });

  function acceptAnswer(answerObj) {
    clearTimers();
    mascot.setPanic(false);
    answerInput.blur();
    answerInput.disabled = true;
    diveBtn.disabled = true;
    correctionBoxEl.hidden = true;
    correctionBoxEl.innerHTML = '';
    rejectBoxEl.hidden = true;
    rejectBoxEl.textContent = '';
    session.pendingSuggestion = null;
    appEl.style.setProperty('--ds-urgency', '0');
    appEl.classList.remove('hot');
    answerForm.classList.remove('hot');

    promptCardEl.classList.add('gone');
    setTimeout(() => {
      if (session.phase === 'feedback') promptCardEl.hidden = true;
    }, 520);

    const tierId = answerObj ? answerObj.tier : 'miss';
    const tier = DATA.TIERS[tierId];
    mascot.react(tierId, tier.color);
    const prompt = getCurrentPrompt();

    const startDepthM = session.totalDepthM;
    const endDepthM = startDepthM + tier.depth;
    const startScore = session.totalScore;
    const endScore = startScore + tier.pts;

    const resultRecord = {
      promptId: prompt.id,
      promptText: prompt.text,
      answer: answerObj ? answerObj.name : null,
      players: answerObj ? answerObj.players : 0,
      tier: tierId,
      pts: tier.pts,
      depth: tier.depth
    };
    session.results.push(resultRecord);
    session.totalDepthM = endDepthM;
    session.totalScore = endScore;

    if (session.mode === 'endless') {
      if (!appState.seenEndlessIds) appState.seenEndlessIds = [];
      if (!appState.seenEndlessIds.includes(prompt.id)) {
        appState.seenEndlessIds.push(prompt.id);
        saveState();
      }
    }

    setPhase('feedback');
    sfx.diveStart();
    worldEl.classList.add('ds-reveal');

    // Render 6 tier threshold lines & sinking chip inside #round-layer
    const basePx = startDepthM * PX_PER_METER;
    const targetPx = endDepthM * PX_PER_METER;
    const tierList = ['plankton', 'tooclever', 'schooler', 'rare', 'deepcut', 'krillion'];

    let html = tierList.map((tid, idx) => {
      const t = DATA.TIERS[tid];
      const top = basePx + t.depth * PX_PER_METER;
      return `
        <div class="ds-tierline" data-tier-idx="${idx}" data-top="${top}" style="top: ${top}px; --tc: ${t.color}; opacity: 1; transition: opacity 0.5s ease-out ${idx * 80}ms;">
          <div class="tag">
            <img src="${t.sprite}" alt="">
            <span>${t.name} · ${t.pts}</span>
          </div>
        </div>
      `;
    }).join('');

    const chipLabel = answerObj ? `«${escapeHtml(answerObj.name)}»` : 'ВРЕМЯ ВЫШЛО';
    html += `<div id="sinking-chip" class="ds-chip ds-px${tierId === 'krillion' ? ' gold' : ''}" style="--cc: ${tier.color}; transform: translate3d(-50%, ${basePx + 40}px, 0);">${chipLabel}</div>`;
    roundLayerEl.innerHTML = html;

    const chipEl = document.getElementById('sinking-chip');
    const lineEls = Array.from(roundLayerEl.querySelectorAll('.ds-tierline'));
    const crossed = new Set();

    const descentDuration = tierId === 'miss' ? 950 : Math.min(2700, 1250 + tier.depth * 1.45);
    const t0 = performance.now();

    const animateDescent = (now) => {
      const p = Math.min(1, (now - t0) / descentDuration);
      const ease = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

      const curPx = basePx + (targetPx - basePx) * ease;
      const chipY = (basePx + 40) + (targetPx - (basePx + 40)) * ease;
      const swayX = Math.sin(p * Math.PI * 3) * (tierId === 'miss' ? 2 : 11) * (1 - p);
      const tilt = Math.sin(p * Math.PI * 3) * 4 * (1 - p);

      ocean.setCameraDepthPx(curPx, 0.38);
      chipEl.style.transform = `translate3d(calc(-50% + ${swayX.toFixed(1)}px), ${chipY.toFixed(1)}px, 0) rotate(${tilt.toFixed(1)}deg)`;

      const screenY = ocean.worldOffset + chipY;
      const screenX = ocean.width * 0.5 + swayX;
      if (tierId === 'schooler' || tierId === 'krillion') {
        ocean.orbitEffect = { kind: tierId, x: screenX, y: screenY, hex: tier.hex };
      } else {
        ocean.orbitEffect = null;
      }

      if (tierId !== 'miss' && p < 0.96) {
        ocean.spawnChipBubbles(screenX, screenY, tier.hex);
        if (tierId === 'rare' && Math.random() < 0.25) {
          ocean.spawnInkPuff(screenX, screenY);
        }
      }

      lineEls.forEach((le) => {
        const idx = Number(le.dataset.tierIdx);
        const lTop = Number(le.dataset.top);
        if (chipY >= lTop && !crossed.has(idx)) {
          crossed.add(idx);
          le.classList.add('passed');
          sfx.crossTier(idx);
          ocean.spawnBurst(screenX, ocean.worldOffset + lTop, tierList[idx] ? DATA.TIERS[tierList[idx]].hex : tier.hex, 10);
        }
      });

      const curMeters = Math.round(startDepthM + tier.depth * ease);
      const curPts = Math.round(startScore + tier.pts * ease);
      hudDepthEl.textContent = `${curMeters.toLocaleString('ru-RU')}м`;
      hudScoreEl.textContent = String(curPts);
      vignetteEl.style.opacity = (0.25 + Math.min(0.65, curMeters / 9500)).toFixed(3);

      if (p < 1) {
        session.feedbackAnimRaf = requestAnimationFrame(animateDescent);
      } else {
        onChipLanded(resultRecord, targetPx, tier);
      }
    };

    session.feedbackAnimRaf = requestAnimationFrame(animateDescent);
  }

  function onChipLanded(record, targetPx, tier) {
    sfx.land(tier.id);
    ocean.orbitEffect = null;
    updateHud();

    if (tier.pts > 0) {
      scorePodEl.classList.remove('slam');
      void scorePodEl.offsetWidth;
      scorePodEl.classList.add('slam');
      ocean.spawnBurst(ocean.width * 0.5, ocean.worldOffset + targetPx, tier.hex, 22);
    }

    stageEl.classList.remove('ds-shake');
    void stageEl.offsetWidth;
    stageEl.classList.add('ds-shake');
    dimEl.classList.add('on');

    const chip = document.getElementById('sinking-chip');
    if (chip) chip.remove();
    roundLayerEl.querySelectorAll('.ds-tierline').forEach((el) => {
      el.style.opacity = '0.35';
    });

    const ansText = record.answer ? `«${escapeHtml(record.answer)}»` : 'Ответ не дан';
    const banner = document.createElement('div');
    banner.className = 'ds-landed';
    banner.style.top = `${targetPx}px`;
    banner.style.setProperty('--tc', tier.color);
    banner.innerHTML = `
      <img class="icon" src="${tier.sprite}" alt="">
      <div class="tname">${tier.name}</div>
      <div class="tans">${ansText}</div>
      <div class="tpts"><b>+${tier.pts} ОЧК</b> · погружение на ${tier.depth} м</div>
      <div class="tsub">${tier.desc}</div>
    `;
    roundLayerEl.appendChild(banner);

    const isLastDaily = session.mode !== 'endless' && session.roundIndex === 6;
    nextBtn.textContent = isLastDaily ? 'ВСПЛЫТЬ ▲' : `К ВОПРОСУ ${session.roundIndex + 2} →`;
    nextSurfaceBtn.hidden = session.mode !== 'endless';
    nextWrapEl.classList.add('visible');
  }

  nextBtn.addEventListener('click', () => {
    sfx.click();
    nextWrapEl.classList.remove('visible');
    if (session.mode !== 'endless' && session.roundIndex >= 6) {
      finishDive();
    } else {
      session.roundIndex += 1;
      startNextRound();
    }
  });

  function triggerSurfaceFromEndless() {
    sfx.click();
    clearTimers();
    nextWrapEl.classList.remove('visible');
    promptCardEl.hidden = true;
    finishDive();
  }

  nextSurfaceBtn.addEventListener('click', triggerSurfaceFromEndless);
  endlessSurfaceBtn.addEventListener('click', triggerSurfaceFromEndless);

  // ---------------- Finish Dive & Done Dashboard ----------------
  function getExpeditionStars(score) {
    if (score >= 450) return 3;
    if (score >= 300) return 2;
    return 1;
  }

  function getExpeditionStats() {
    const map = appState.expeditions || {};
    const list = DATA.EXPEDITIONS || [];
    let completedCount = 0;
    let goldCount = 0;
    let totalBestDepth = 0;
    list.forEach((exp) => {
      const rec = map[exp.id];
      if (rec) {
        completedCount += 1;
        if ((rec.stars || 0) >= 3 || (rec.bestScore || 0) >= 450) goldCount += 1;
        totalBestDepth += rec.bestDepth || 0;
      }
    });
    return { completedCount, goldCount, totalBestDepth, totalCount: list.length };
  }

  function isBuddyUnlocked(buddy, ignoreSandbox = false) {
    if (!ignoreSandbox && appState.settings.unlockAllBuddies) return true;
    if (buddy.expeditionGoldReq) {
      return getExpeditionStats().goldCount >= buddy.expeditionGoldReq;
    }
    if (buddy.expeditionReq) {
      return getExpeditionStats().completedCount >= buddy.expeditionReq;
    }
    return (appState.stats.bestStreak || 0) >= buddy.streak;
  }

  function finishDive() {
    session.newlyUnlockedBuddies = [];
    const unlockedBefore = new Set(
      DATA.BUDDIES.filter((b) => isBuddyUnlocked(b, true)).map((b) => b.id)
    );

    if (session.mode === 'daily') {
      const key = String(session.diveNumber);
      if (!appState.completedDives[key]) {
        appState.stats.played += 1;
        appState.stats.totalScore += session.totalScore;
        if (session.totalScore > appState.stats.bestScore) {
          appState.stats.bestScore = session.totalScore;
        }
        if (appState.stats.lastDiveDay === session.diveNumber - 1) {
          appState.stats.streak += 1;
        } else if (appState.stats.lastDiveDay !== session.diveNumber) {
          appState.stats.streak = 1;
        }
        if (appState.stats.streak > appState.stats.bestStreak) {
          appState.stats.bestStreak = appState.stats.streak;
        }
        appState.stats.lastDiveDay = session.diveNumber;
      }
      appState.completedDives[key] = {
        score: session.totalScore,
        depth: session.totalDepthM,
        results: session.results
      };
      saveState();
    } else if (session.mode === 'archive') {
      const key = String(session.diveNumber);
      const prev = appState.completedDives[key];
      if (!prev || session.totalScore >= prev.score) {
        appState.completedDives[key] = {
          score: session.totalScore,
          depth: session.totalDepthM,
          results: session.results
        };
        saveState();
      }
    } else if (session.mode === 'expedition' && session.expeditionId) {
      if (!appState.expeditions) appState.expeditions = {};
      const prev = appState.expeditions[session.expeditionId];
      const stars = getExpeditionStars(session.totalScore);
      const bestScore = prev ? Math.max(prev.bestScore || 0, session.totalScore) : session.totalScore;
      const bestDepth = prev ? Math.max(prev.bestDepth || 0, session.totalDepthM) : session.totalDepthM;
      const bestStars = prev ? Math.max(prev.stars || 1, stars) : stars;
      appState.expeditions[session.expeditionId] = {
        bestScore,
        bestDepth,
        stars: bestStars,
        plays: (prev ? prev.plays || 0 : 0) + 1
      };
      saveState();
    }

    session.newlyUnlockedBuddies = DATA.BUDDIES.filter(
      (b) => !unlockedBefore.has(b.id) && isBuddyUnlocked(b, true)
    );

    showDoneScreen();
  }

  function computePercentile(score, maxScore = 700) {
    const ratio = Math.max(0, Math.min(1, score / Math.max(100, maxScore)));
    // Smooth S-curve roughly matching krillion distribution (335/700 -> ~73%)
    const pct = Math.round(100 / (1 + Math.exp(-(ratio - 0.36) * 8.4)));
    return Math.max(1, Math.min(99, pct));
  }

  function getBearingBrackets(isEndless) {
    if (isEndless) {
      return [
        { tierId: 'plankton', min: 0, max: 21, range: '0–21', color: 'var(--tier-plankton)', text: 'Планктон. В океане ещё много неизведанного.' },
        { tierId: 'schooler', min: 22, max: 35, range: '22–35', color: 'var(--tier-schooler)', text: 'Косяк. Плывёте вместе со стаей.' },
        { tierId: 'rare', min: 36, max: 50, range: '36–50', color: 'var(--tier-rare)', text: 'Редкий. Ниже термоклина. Отлично.' },
        { tierId: 'deepcut', min: 51, max: 64, range: '51–64', color: 'var(--tier-deepcut)', text: 'Глубоководный. Серьёзное погружение.' },
        { tierId: 'krillion', min: 65, max: 99999, range: '65+', color: 'var(--tier-krillion)', text: 'Один на криллион. Обитатель впадины.' }
      ];
    }
    return [
      { tierId: 'plankton', min: 0, max: 150, range: '0–150', color: 'var(--tier-plankton)', text: 'Планктон. В океане ещё много неизведанного.' },
      { tierId: 'schooler', min: 151, max: 250, range: '151–250', color: 'var(--tier-schooler)', text: 'Косяк. Плывёте вместе со стаей.' },
      { tierId: 'rare', min: 251, max: 350, range: '251–350', color: 'var(--tier-rare)', text: 'Редкий. Ниже термоклина. Отлично.' },
      { tierId: 'deepcut', min: 351, max: 449, range: '351–449', color: 'var(--tier-deepcut)', text: 'Глубоководный. Серьёзное погружение.' },
      { tierId: 'krillion', min: 450, max: 99999, range: '450+', color: 'var(--tier-krillion)', text: 'Один на криллион. Обитатель впадины.' }
    ];
  }

  function pluralRu(n, one, few, many) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
    return many;
  }

  function buildBellCurveSvg(score, maxPossible) {
    const xStart = 12;
    const width = 316;
    const baseY = 78;
    const amp = 66;
    const meanU = 0.39;
    const sigma = 0.148;

    const pts = [];
    const steps = 64;
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const x = xStart + u * width;
      const g = Math.exp(-0.5 * Math.pow((u - meanU) / sigma, 2));
      const y = baseY - amp * g;
      pts.push([x.toFixed(1), y.toFixed(1)]);
    }

    const linePath = 'M ' + pts.map((p) => p.join(',')).join(' L ');
    const areaPath = `${linePath} L ${(xStart + width).toFixed(1)},${baseY} L ${xStart},${baseY} Z`;

    const uScore = Math.max(0.01, Math.min(0.99, score / Math.max(100, maxPossible)));
    const curX = (xStart + uScore * width).toFixed(1);
    const curG = Math.exp(-0.5 * Math.pow((uScore - meanU) / sigma, 2));
    const curY = (baseY - amp * curG).toFixed(1);

    const axisLabels = [0, 100, 200, 300, 400, 500, 600, 700].map((val) => {
      const ratio = val / 700;
      const tx = (xStart + ratio * width).toFixed(1);
      const disp = maxPossible !== 700 ? Math.round((val / 700) * maxPossible) : val;
      return `
        <line x1="${tx}" y1="${baseY}" x2="${tx}" y2="${baseY + 4}" stroke="rgba(125,147,184,0.45)" stroke-width="1"></line>
        <text x="${tx}" y="${baseY + 14}" fill="rgba(125,147,184,0.72)" font-size="9" text-anchor="middle" font-family="'JetBrains Mono', monospace">${disp}</text>
      `;
    }).join('');

    return `
      <svg viewBox="0 0 340 108" style="width:100%;height:auto;display:block;" role="img" aria-label="Распределение очков игроков">
        <defs>
          <linearGradient id="pc-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--color-lumen-cyan)" stop-opacity="0.52"></stop>
            <stop offset="100%" stop-color="var(--color-lumen-cyan)" stop-opacity="0.04"></stop>
          </linearGradient>
          <clipPath id="pc-beaten">
            <rect x="0" y="0" width="${curX}" height="96"></rect>
          </clipPath>
        </defs>
        <path d="${areaPath}" fill="url(#pc-fill)" opacity="0.2"></path>
        <path clip-path="url(#pc-beaten)" d="${areaPath}" fill="url(#pc-fill)" opacity="0.92"></path>
        <path d="${linePath}" fill="none" stroke="var(--color-lumen-cyan)" stroke-width="1.8"></path>
        ${axisLabels}
        <line x1="${curX}" y1="${curY}" x2="${curX}" y2="${baseY}" stroke="var(--color-lumen-pink)" stroke-width="2"></line>
        <circle cx="${curX}" cy="${curY}" r="3.5" fill="var(--color-lumen-pink)" stroke="#ffffff" stroke-width="0.8"></circle>
        <text x="${curX}" y="${baseY + 25}" fill="var(--color-lumen-pink)" font-size="9.5" font-weight="700" text-anchor="middle" font-family="'JetBrains Mono', monospace">ВЫ</text>
      </svg>
    `;
  }

  function buildDiveLogSvg(results) {
    const n = Math.max(1, results.length);
    const leftPad = 36;
    const rightPad = 14;
    const w = Math.max(360, n * 38 + leftPad + rightPad);
    const chartW = w - leftPad - rightPad;
    const topY = 14;
    const spanY = 112; // 0m .. -100m (100 pts)

    const gridLevels = [
      { pts: 0, label: '0м' },
      { pts: 25, label: '-25' },
      { pts: 50, label: '-50' },
      { pts: 75, label: '-75' },
      { pts: 100, label: '-100' }
    ];

    const gridHtml = gridLevels.map((g) => {
      const y = (topY + (g.pts / 100) * spanY).toFixed(1);
      return `
        <text x="${leftPad - 8}" y="${y}" fill="rgba(125,147,184,0.7)" font-size="9" text-anchor="end" dominant-baseline="middle" font-family="'JetBrains Mono', monospace">${g.label}</text>
        <line x1="${leftPad}" y1="${y}" x2="${w - rightPad}" y2="${y}" stroke="rgba(125,147,184,0.2)" stroke-width="1" stroke-dasharray="2 3"></line>
      `;
    }).join('');

    const colHtml = results.map((r, idx) => {
      const t = DATA.TIERS[r.tier];
      const cx = (leftPad + ((idx + 0.5) / n) * chartW).toFixed(1);
      const tipY = (topY + (r.pts / 100) * spanY).toFixed(1);
      const lineLen = r.pts > 0 ? tipY : topY + 6;
      return `
        <line x1="${cx}" y1="${topY}" x2="${cx}" y2="${lineLen}" stroke="${t.hex}" stroke-width="1.5" stroke-opacity="0.72"></line>
        <circle cx="${cx}" cy="${tipY}" r="9" fill="${t.hex}" fill-opacity="0.16"></circle>
        <image href="${t.sprite}" x="${(Number(cx) - 10).toFixed(1)}" y="${(Number(tipY) - 10).toFixed(1)}" width="20" height="20" style="image-rendering:pixelated;"></image>
        <text x="${cx}" y="${topY + spanY + 20}" fill="rgba(125,147,184,0.8)" font-size="9.5" text-anchor="middle" font-family="'JetBrains Mono', monospace">${idx + 1}</text>
      `;
    }).join('');

    return `
      <div class="ds-divelog-wrap" style="overflow-x:auto;">
        <svg class="ds-divelog-svg" viewBox="0 0 ${w} 154" style="min-width:${Math.min(w, 320)}px;" role="img" aria-label="Журнал глубины по вопросам">
          ${gridHtml}
          ${colHtml}
        </svg>
      </div>
    `;
  }

  function showDoneScreen() {
    roundLayerEl.innerHTML = '';
    ocean.orbitEffect = null;
    dimEl.classList.remove('on');
    endlessSurfaceBtn.hidden = true;
    ocean.setCameraDepthPx(0, 0.42);
    vignetteEl.style.opacity = '0.25';
    setPhase('done');

    const roundCount = session.results.length;
    const isEndless = session.mode === 'endless';
    const maxPossible = Math.max(100, roundCount * 100);
    const pct = computePercentile(session.totalScore, maxPossible);
    const avgPerRound = roundCount > 0 ? Math.round(session.totalScore / roundCount) : 0;

    const badgeText = session.mode === 'daily'
      ? `ПОГРУЖЕНИЕ #${session.diveNumber} ЗАВЕРШЕНО`
      : session.mode === 'archive'
        ? `АРХИВ #${session.diveNumber} ЗАВЕРШЁН`
        : `БЕСКОНЕЧНОЕ · ${roundCount} ${pluralRu(roundCount, 'ВОПРОС', 'ВОПРОСА', 'ВОПРОСОВ')}`;

    const avg = appState.stats.played > 0
      ? Math.round(appState.stats.totalScore / appState.stats.played)
      : session.totalScore;

    const brackets = getBearingBrackets(isEndless);
    const bearingValue = isEndless ? avgPerRound : session.totalScore;

    const bearingHtml = brackets.map((b) => {
      const active = bearingValue >= b.min && bearingValue <= b.max;
      const tierIcon = DATA.TIERS[b.tierId].sprite;
      return `
        <div class="ds-bearing-row${active ? ' active' : ''}" style="--tc: ${b.color};">
          <img class="ds-bearing-icon" src="${tierIcon}" alt="">
          <span class="ds-bearing-range">${b.range}</span>
          <span>${b.text}</span>
        </div>
      `;
    }).join('');

    const catchHtml = session.results.map((r, idx) => renderCatchRow(r, idx)).join('');
    const existingRating = appState.ratings[String(session.diveNumber)] || 0;
    const pctCaption = isEndless
      ? `ТЕМП ${avgPerRound} ОЧК/ВОПРОС · ЛУЧШЕ, ЧЕМ У ${pct}% НЫРЯЛЬЩИКОВ`
      : `ЛУЧШЕ, ЧЕМ У ${pct}% СЕГОДНЯШНИХ НЫРЯЛЬЩИКОВ`;

    const doneTheme = !isEndless && DATA.getDiveTheme
      ? DATA.getDiveTheme(session.diveNumber)
      : null;
    const doneThemeHtml = doneTheme
      ? `<div class="ds-done-theme" style="--theme-accent:${doneTheme.accent};"><span>${escapeHtml(doneTheme.icon)}</span><span>${escapeHtml(doneTheme.title)}</span></div>`
      : '';

    doneInnerEl.innerHTML = `
      <div>
        <div class="ds-done-header">
          <span class="ds-done-krill">КРИЛЛИОН</span>
          <span class="ds-done-badge">${badgeText}</span>
        </div>
        ${doneThemeHtml}

        <div class="ds-done-score-row">
          <span class="ds-done-bigscore tabular-nums">${session.totalScore}</span>
          <span class="ds-done-depth tabular-nums">-${session.totalDepthM.toLocaleString('ru-RU')}м</span>
        </div>

        <div class="ds-percentile-wrap">
          ${buildBellCurveSvg(session.totalScore, maxPossible)}
          <p class="ds-percentile-text">${pctCaption}</p>
        </div>
      </div>

      <div>
        <div class="ds-fathom-rule">
          <span>ЖУРНАЛ ПОГРУЖЕНИЯ</span>
          <span class="ds-fathom-sub">ГЛУБЖЕ = РЕЖЕ</span>
        </div>
        <div class="ds-divelog">
          ${buildDiveLogSvg(session.results)}
        </div>
      </div>

      <div>
        <div class="ds-fathom-rule">
          <span>ОРИЕНТИР</span>
          ${isEndless ? '<span class="ds-fathom-sub">В СРЕДНЕМ ЗА ВОПРОС</span>' : ''}
        </div>
        <div class="ds-bearing">${bearingHtml}</div>
      </div>

      <div class="ds-actions-stack">
        <button id="copy-result-btn" type="button" class="ds-action-btn btn-descend">СКОПИРОВАТЬ РЕЗУЛЬТАТ</button>
        <div class="ds-actions-sub">
          <button id="done-endless-btn" type="button" class="ds-action-btn">НЫРЯТЬ ДАЛЬШЕ ∞</button>
          <button id="done-archive-btn" type="button" class="ds-action-btn">АРХИВ ⟲</button>
        </div>
        ${session.mode !== 'daily' ? '<button id="done-replay-btn" type="button" class="ds-action-btn">СЫГРАТЬ ЗАНОВО</button>' : ''}
      </div>

      <div>
        <div class="ds-fathom-rule">
          <span>УЛОВ</span>
          <span class="ds-fathom-sub">НАЖМИТЕ ДЛЯ ВСЕХ ОТВЕТОВ</span>
        </div>
        <div id="catch-list" class="ds-catch-list">${catchHtml}</div>
      </div>

      <div class="ds-logbook">
        <div class="ds-logbook-stats">
          бортовой журнал · серия <b>${appState.stats.streak}</b> · игр <b>${appState.stats.played}</b> · среднее <b>${avg}</b> · рекорд <b>${Math.max(appState.stats.bestScore, session.totalScore)}</b> · следующее погружение через <b id="next-dive-countdown">--:--:--</b>
        </div>

        <div class="ds-rating-row">
          <span>как прошло погружение? (1 = так себе · 5 = огонь):</span>
          <div class="ds-rate-btns" role="radiogroup" aria-label="Оценка погружения">
            ${[1, 2, 3, 4, 5].map((n) => `
              <button type="button" class="ds-rate-btn" data-rate="${n}" aria-checked="${existingRating === n ? 'true' : 'false'}">${n}</button>
            `).join('')}
          </div>
        </div>

        <form id="suggest-form" class="ds-suggest-row">
          <input id="suggest-input" class="ds-suggest-input" type="text" placeholder="есть идея для вопроса? предложите…" maxlength="140">
          <button type="submit" class="ds-suggest-btn">отправить</button>
        </form>

        <div class="ds-footer-links">
          <button type="button" id="done-daily-link">ежедневное</button>
          <button type="button" id="done-settings-link">настройки</button>
          <button type="button" id="done-faq-link">частые вопросы</button>
          <button type="button" id="done-bug-link">⚑ сообщить об ошибке</button>
          <a href="https://gogaportwine.online/">gogaportwine.online</a>
        </div>
      </div>
    `;

    wireDoneHandlers();
    startMidnightCountdown();
  }

  function renderCatchRow(result, idx) {
    const tier = DATA.TIERS[result.tier];
    const ansLabel = result.answer ? escapeHtml(result.answer) : 'Время вышло';
    const playerWord = pluralRu(result.players, 'игрок выбрал', 'игрока выбрали', 'игроков выбрали');
    const popLine = result.answer
      ? `<span>${result.players.toLocaleString('ru-RU')}</span> ${playerWord} это`
      : 'Ответ не был засчитан';

    return `
      <div class="ds-catch-item" data-round-idx="${idx}">
        <button type="button" class="ds-catch-btn" aria-expanded="false">
          <span class="ds-catch-idx">${idx + 1}</span>
          <img class="ds-catch-icon" src="${tier.sprite}" alt="">
          <div class="ds-catch-meta">
            <div class="ds-catch-prompt">${escapeHtml(result.promptText)}</div>
            <div class="ds-catch-ans">${ansLabel}</div>
            <div class="ds-catch-pop">${popLine}</div>
          </div>
          <span class="ds-catch-pts" style="color: ${tier.color};">${result.pts}</span>
          <span class="ds-catch-plus">+</span>
        </button>
        <div class="ds-catch-drawer" hidden></div>
      </div>
    `;
  }

  async function renderCatchDrawerContent(drawerEl, promptId, userAnswer) {
    const prompt = DATA.PROMPTS.find((p) => p.id === promptId);
    if (!prompt) return;

    if (DATA.loadPromptAnswers && !hasLoadedAnswers(prompt)) {
      drawerEl.innerHTML = '<div style="padding:10px;color:var(--color-drift);font-size:13px;">Загрузка ответов…</div>';
      await DATA.loadPromptAnswers(prompt.id);
    }

    if (!hasLoadedAnswers(prompt)) {
      drawerEl.innerHTML = `
        <div style="padding:10px;color:var(--color-drift);font-size:13px;display:flex;align-items:center;justify-content:space-between;gap:10px;">
          <span>Не удалось загрузить базу ответов.</span>
          <button type="button" class="ds-endless-surface-btn" data-retry-chunk="1">↻ Повторить</button>
        </div>
      `;
      const retryBtn = drawerEl.querySelector('[data-retry-chunk]');
      if (retryBtn) {
        retryBtn.addEventListener('click', () => {
          sfx.click();
          renderCatchDrawerContent(drawerEl, promptId, userAnswer);
        });
      }
      return;
    }

    const sorted = (prompt.answers || []).slice().sort((a, b) => DATA.TIERS[b.tier].pts - DATA.TIERS[a.tier].pts || a.players - b.players);
    const counts = { all: sorted.length };
    DATA.TIER_ORDER.forEach((t) => { counts[t] = 0; });
    sorted.forEach((a) => { counts[a.tier] = (counts[a.tier] || 0) + 1; });

    let activeFilter = 'all';
    let searchQuery = '';

    const filtersHtml = [
      `<button type="button" class="ds-filter-pill" data-filter="all" aria-pressed="true" style="color: var(--color-foam);">Все <span style="opacity:.7">${counts.all}</span></button>`,
      ...DATA.TIER_ORDER.map((tid) => {
        const t = DATA.TIERS[tid];
        return `<button type="button" class="ds-filter-pill" data-filter="${tid}" aria-pressed="false" style="color: ${t.color};">${t.short} <span style="opacity:.7">${counts[tid] || 0}</span></button>`;
      })
    ].join('');

    drawerEl.innerHTML = `
      <div class="ds-tier-filters" role="group" aria-label="Фильтр по редкости">${filtersHtml}</div>
      <input type="search" class="ds-catch-search" placeholder="Поиск по всем ответам…" aria-label="Поиск ответов">
      <ul class="ds-answer-ul"></ul>
      <div class="ds-catch-report-row">
        <button type="button" class="ds-catch-report-btn">⚑ Не нашли свой ответ или заметили ошибку в этой теме?</button>
      </div>
    `;

    const reportRoundBtn = drawerEl.querySelector('.ds-catch-report-btn');
    if (reportRoundBtn) {
      reportRoundBtn.addEventListener('click', () => {
        sfx.click();
        openBugReportModal({
          category: 'missing-answer',
          promptText: `${prompt.text} [${prompt.id}]`,
          answerText: searchInput.value.trim() || userAnswer || '',
          descText: ''
        });
      });
    }

    const ul = drawerEl.querySelector('.ds-answer-ul');
    const searchInput = drawerEl.querySelector('.ds-catch-search');
    const filterBtns = drawerEl.querySelectorAll('.ds-filter-pill');

    function redrawList() {
      const q = normalizeInput(searchQuery);
      const filtered = sorted.filter((a) => {
        if (activeFilter !== 'all' && a.tier !== activeFilter) return false;
        if (!q) return true;
        return normalizeInput(a.name).includes(q) || (a.aliases || []).some((al) => normalizeInput(al).includes(q));
      });

      if (!filtered.length) {
        ul.innerHTML = '<li class="ds-answer-li" style="color:var(--color-drift);">Ничего не найдено</li>';
        return;
      }

      const visibleLimit = 300;
      let toRender = filtered;
      if (filtered.length > visibleLimit) {
        const sliced = filtered.slice(0, visibleLimit);
        if (userAnswer && activeFilter === 'all' && !q) {
          const mineObj = filtered.find((a) => a.name === userAnswer);
          if (mineObj && !sliced.includes(mineObj)) {
            toRender = [mineObj, ...sliced.slice(0, visibleLimit - 1)];
          }
        } else {
          toRender = sliced;
        }
      }

      const itemsHtml = toRender.map((a) => {
        const t = DATA.TIERS[a.tier];
        const isMine = userAnswer && a.name === userAnswer;
        return `
          <li class="ds-answer-li${isMine ? ' mine' : ''}">
            <img src="${t.sprite}" alt="">
            <div class="ds-answer-main">
              <span>${escapeHtml(a.name)}</span>
              ${a.note ? `<span class="ds-answer-note">${escapeHtml(a.note)} · ${a.players.toLocaleString('ru-RU')} игр.</span>` : ''}
            </div>
            <span class="ds-answer-pts" style="color: ${t.color};">+${t.pts}</span>
          </li>
        `;
      }).join('');
      const moreHtml = filtered.length > visibleLimit
        ? `<li class="ds-answer-li" style="color:var(--color-drift);justify-content:center;font-size:12px;">Показаны первые ${visibleLimit} из ${filtered.length.toLocaleString('ru-RU')} — уточните поиском или фильтром</li>`
        : '';
      ul.innerHTML = itemsHtml + moreHtml;
    }

    filterBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        sfx.click();
        activeFilter = btn.dataset.filter;
        filterBtns.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
        redrawList();
      });
    });

    searchInput.addEventListener('input', () => {
      searchQuery = searchInput.value;
      redrawList();
    });

    redrawList();
  }

  function wireDoneHandlers() {
    const copyBtn = document.getElementById('copy-result-btn');
    copyBtn.addEventListener('click', () => {
      sfx.click();
      const blocks = session.results.map((r) => DATA.TIERS[r.tier].emoji).join('');
      const expObj = session.mode === 'expedition' && DATA.getExpedition
        ? DATA.getExpedition(session.expeditionId)
        : null;
      const shareTheme = expObj
        ? expObj
        : session.mode !== 'endless' && DATA.getDiveTheme
          ? DATA.getDiveTheme(session.diveNumber)
          : null;
      const themeSuffix = shareTheme ? ` · ${shareTheme.icon} ${shareTheme.title}` : '';
      const expStarsStr = expObj
        ? ` (${'★'.repeat(getExpeditionStars(session.totalScore))}${'☆'.repeat(3 - getExpeditionStars(session.totalScore))})`
        : '';
      const header = session.mode === 'daily'
        ? `КРИЛЛИОН #${session.diveNumber}${themeSuffix}`
        : session.mode === 'archive'
          ? `КРИЛЛИОН (Архив #${session.diveNumber}${themeSuffix})`
          : expObj
            ? `КРИЛЛИОН · Экспедиция #${expObj.num}${themeSuffix}${expStarsStr}`
            : `КРИЛЛИОН (Бесконечный · ${session.results.length} раунд.)`;
      let text = `${header}\n${session.totalScore} очков · -${session.totalDepthM.toLocaleString('ru-RU')}м\n${blocks}`;
      if (appState.settings.shareLink) {
        text += `\n${window.location.href.split('#')[0]}`;
      }
      navigator.clipboard?.writeText(text).catch(() => {});
      copyBtn.textContent = 'СКОПИРОВАНО ✓';
      copyBtn.classList.add('copied');
      setTimeout(() => {
        copyBtn.textContent = 'СКОПИРОВАТЬ РЕЗУЛЬТАТ';
        copyBtn.classList.remove('copied');
      }, 2200);
    });

    const doneEndlessBtn = document.getElementById('done-endless-btn');
    if (doneEndlessBtn) {
      doneEndlessBtn.addEventListener('click', () => {
        sfx.click();
        openMode('endless');
      });
    }

    const doneArchiveBtn = document.getElementById('done-archive-btn');
    if (doneArchiveBtn) {
      doneArchiveBtn.addEventListener('click', () => {
        sfx.click();
        openModal('archive-backdrop');
      });
    }

    const doneExpBtn = document.getElementById('done-expeditions-btn');
    if (doneExpBtn) {
      doneExpBtn.addEventListener('click', () => {
        sfx.click();
        openModal('expeditions-backdrop');
      });
    }

    const replayBtn = document.getElementById('done-replay-btn');
    if (replayBtn) {
      replayBtn.addEventListener('click', () => {
        sfx.click();
        const arg = session.mode === 'expedition' ? session.expeditionId : session.diveNumber;
        openMode(session.mode, arg);
        startNextRound();
      });
    }

    document.querySelectorAll('.ds-catch-item').forEach((item) => {
      const btn = item.querySelector('.ds-catch-btn');
      const drawer = item.querySelector('.ds-catch-drawer');
      const plus = item.querySelector('.ds-catch-plus');
      const idx = Number(item.dataset.roundIdx);
      const res = session.results[idx];

      btn.addEventListener('click', () => {
        sfx.click();
        const expanded = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', String(!expanded));
        drawer.hidden = expanded;
        plus.textContent = expanded ? '+' : '−';
        if (!expanded && !drawer.dataset.populated) {
          drawer.dataset.populated = '1';
          renderCatchDrawerContent(drawer, res.promptId, res.answer);
        }
      });
    });

    document.querySelectorAll('.ds-rate-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        sfx.click();
        const val = Number(btn.dataset.rate);
        const ratingKey = session.mode === 'expedition'
          ? `exp:${session.expeditionId}`
          : String(session.diveNumber);
        appState.ratings[ratingKey] = val;
        saveState();
        document.querySelectorAll('.ds-rate-btn').forEach((b) => {
          b.setAttribute('aria-checked', String(Number(b.dataset.rate) === val));
        });
      });
    });

    const suggestForm = document.getElementById('suggest-form');
    const suggestInput = document.getElementById('suggest-input');
    suggestForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = suggestInput.value.trim();
      if (!val) return;
      sfx.suggest();
      appState.suggestions.push({ text: val, at: new Date().toISOString() });
      saveState();
      suggestInput.value = '';
      suggestInput.placeholder = 'спасибо! откроем отправку…';
      openBugReportModal({
        category: 'suggestion',
        promptText: '',
        answerText: '',
        descText: val
      });
    });

    document.getElementById('done-daily-link').addEventListener('click', () => {
      sfx.click();
      openMode('daily');
    });
    document.getElementById('done-settings-link').addEventListener('click', () => {
      sfx.click();
      openModal('settings-backdrop');
    });
    document.getElementById('done-faq-link').addEventListener('click', () => {
      sfx.click();
      openModal('faq-backdrop');
    });
    const doneBugLink = document.getElementById('done-bug-link');
    if (doneBugLink) {
      doneBugLink.addEventListener('click', () => {
        sfx.click();
        openBugReportModal();
      });
    }
  }

  let countdownInterval = null;
  function startMidnightCountdown() {
    if (countdownInterval) clearInterval(countdownInterval);
    const update = () => {
      const el = document.getElementById('next-dive-countdown');
      if (!el) {
        clearInterval(countdownInterval);
        return;
      }
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
      const sec = Math.max(0, Math.floor((next - now) / 1000));
      const hh = String(Math.floor(sec / 3600)).padStart(2, '0');
      const mm = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
      const ss = String(sec % 60).padStart(2, '0');
      el.textContent = `${hh}:${mm}:${ss}`;
    };
    update();
    countdownInterval = setInterval(update, 1000);
  }

  // ---------------- Modals (Menu, Settings, Wardrobe, Archive, Expeditions, FAQ, BugReport) ----------------
  function setBugCategory(catValue) {
    const catEl = document.getElementById('bug-category');
    if (catEl) catEl.value = catValue;
    document.querySelectorAll('.ds-bug-cat').forEach((btn) => {
      btn.setAttribute('aria-checked', String(btn.dataset.cat === catValue));
    });
  }

  function openBugReportModal(prefill) {
    const promptEl = document.getElementById('bug-prompt');
    const ansEl = document.getElementById('bug-answer');
    const descEl = document.getElementById('bug-desc');

    let defaultPrompt = '';
    let defaultAns = '';
    const curPrompt = getCurrentPrompt();
    if (session.phase === 'answering' || session.phase === 'preview' || session.phase === 'feedback') {
      if (curPrompt) {
        defaultPrompt = `${curPrompt.text} [${curPrompt.id}]`;
      }
      if (answerInput && answerInput.value.trim()) {
        defaultAns = answerInput.value.trim();
      } else if (session.results.length) {
        const lastRes = session.results[session.results.length - 1];
        if (lastRes && lastRes.answer) defaultAns = lastRes.answer;
      }
    } else if (session.phase === 'done' && session.results.length) {
      const lastRes = session.results[session.results.length - 1];
      if (lastRes) {
        defaultPrompt = `${lastRes.promptText} [${lastRes.promptId}]`;
      }
    }

    setBugCategory((prefill && prefill.category) || 'missing-answer');
    if (promptEl) promptEl.value = prefill && prefill.promptText !== undefined ? prefill.promptText : defaultPrompt;
    if (ansEl) ansEl.value = prefill && prefill.answerText !== undefined ? prefill.answerText : defaultAns;
    if (descEl) descEl.value = (prefill && prefill.descText) || '';

    openModal('bugreport-backdrop');
  }

  function buildBugReportPayload() {
    const catEl = document.getElementById('bug-category');
    const promptEl = document.getElementById('bug-prompt');
    const ansEl = document.getElementById('bug-answer');
    const descEl = document.getElementById('bug-desc');

    const category = catEl ? catEl.value : 'missing-answer';
    const categoryLabels = {
      'missing-answer': 'Не засчитался ответ',
      'wrong-tier': 'Неверная редкость / вопрос',
      'ui-bug': 'Технический баг',
      'suggestion': 'Предложение / идея'
    };
    const catLabel = categoryLabels[category] || 'Обратная связь';
    const promptVal = (promptEl ? promptEl.value.trim() : '') || 'Не указан';
    const ansVal = (ansEl ? ansEl.value.trim() : '') || '—';
    const descVal = (descEl ? descEl.value.trim() : '') || '—';
    const modeInfo = `${session.mode} (dive #${session.diveNumber || '—'}, phase: ${session.phase})`;

    const titleParts = [`[${catLabel}]`];
    if (ansVal !== '—') titleParts.push(`«${ansVal}»`);
    if (promptVal !== 'Не указан') titleParts.push(`— ${promptVal.slice(0, 60)}`);
    else if (descVal !== '—') titleParts.push(`— ${descVal.slice(0, 60)}`);
    const title = titleParts.join(' ');

    const body = [
      `### Тип обращения`,
      catLabel,
      ``,
      `### Вопрос / Тема`,
      promptVal,
      ``,
      `### Введённый ответ`,
      ansVal,
      ``,
      `### Комментарий`,
      descVal,
      ``,
      `---`,
      `*Контекст: режим \`${modeInfo}\` · экран \`${window.innerWidth}x${window.innerHeight}\`*`
    ].join('\n');

    return { title, body, category };
  }

  function openModal(id) {
    closeAllModals();
    if (id === 'wardrobe-backdrop') renderWardrobe();
    if (id === 'archive-backdrop') renderArchive();
    if (id === 'expeditions-backdrop') renderExpeditions();
    const el = document.getElementById(id);
    if (el) {
      el.hidden = false;
      el.classList.add('open');
    }
  }

  function closeAllModals() {
    document.querySelectorAll('.ds-modal-backdrop').forEach((el) => {
      el.classList.remove('open');
      el.hidden = true;
    });
  }

  function renderWardrobe() {
    const grid = document.getElementById('wardrobe-grid');
    const expStats = getExpeditionStats();

    grid.innerHTML = DATA.BUDDIES.map((b) => {
      const unlocked = isBuddyUnlocked(b, false);
      const active = appState.buddyId === b.id;
      let reqText = 'Открыт';
      if (b.expeditionGoldReq) {
        reqText = unlocked
          ? `Золото (${expStats.goldCount}/${b.expeditionGoldReq})`
          : `${b.expeditionGoldReq} золота (${expStats.goldCount}/${b.expeditionGoldReq})`;
      } else if (b.expeditionReq) {
        reqText = unlocked
          ? `Экспедиции (${expStats.completedCount}/${b.expeditionReq})`
          : `${b.expeditionReq} экспед. (${expStats.completedCount}/${b.expeditionReq})`;
      } else if (b.streak > 0) {
        reqText = unlocked ? `Открыт (${b.streak} дн.)` : `Серия ${b.streak} дн.`;
      }
      return `
        <button
          type="button"
          class="ds-buddy-card ds-px-sm${unlocked ? '' : ' locked'}"
          data-buddy="${b.id}"
          aria-pressed="${active ? 'true' : 'false'}"
          ${unlocked ? '' : 'disabled'}
        >
          <img src="${b.sprite}" alt="">
          <span class="ds-buddy-name">${b.name}</span>
          <span class="ds-buddy-req">${reqText}</span>
        </button>
      `;
    }).join('');

    grid.querySelectorAll('[data-buddy]').forEach((btn) => {
      btn.addEventListener('click', () => {
        sfx.mascot();
        appState.buddyId = btn.dataset.buddy;
        saveState();
        mascot.applyBuddy();
        renderWardrobe();
      });
    });
  }

  function renderExpeditions() {
    const summaryEl = document.getElementById('expeditions-summary');
    const grid = document.getElementById('expeditions-grid');
    if (!summaryEl || !grid) return;

    const list = DATA.EXPEDITIONS || [];
    const expMap = appState.expeditions || {};
    const stats = getExpeditionStats();
    const pct = stats.totalCount > 0 ? Math.round((stats.completedCount / stats.totalCount) * 100) : 0;

    const rewardBuddies = DATA.BUDDIES.filter((b) => b.expeditionReq || b.expeditionGoldReq);
    const rewardHtml = rewardBuddies.map((b) => {
      const unlocked = isBuddyUnlocked(b, true);
      const reqLabel = b.expeditionGoldReq
        ? `Золото 16/16 (${stats.goldCount}/16)`
        : `${b.expeditionReq} уровн. (${Math.min(stats.completedCount, b.expeditionReq)}/${b.expeditionReq})`;
      return `
        <div class="ds-exp-reward-chip${unlocked ? ' unlocked' : ''}">
          <img src="${b.sprite}" alt="">
          <div>
            <span class="ds-exp-reward-title">${escapeHtml(b.name)}</span>
            <span class="ds-exp-reward-req">${unlocked ? '✓ Открыт в гардеробе' : reqLabel}</span>
          </div>
        </div>
      `;
    }).join('');

    summaryEl.innerHTML = `
      <div class="ds-exp-stats-row">
        <span>Пройдено уровней: <b>${stats.completedCount} / ${stats.totalCount}</b></span>
        <span>Золото (450+): <b>${stats.goldCount} / ${stats.totalCount}</b></span>
        <span>Общая глубина: <b>-${stats.totalBestDepth.toLocaleString('ru-RU')}м</b></span>
      </div>
      <div class="ds-exp-bar" role="progressbar" aria-valuenow="${stats.completedCount}" aria-valuemin="0" aria-valuemax="${stats.totalCount}">
        <div class="ds-exp-bar-fill" style="width:${pct}%;"></div>
      </div>
      <div class="ds-exp-rewards">${rewardHtml}</div>
    `;

    grid.innerHTML = list.map((exp) => {
      const rec = expMap[exp.id];
      const stars = rec ? (rec.stars || getExpeditionStars(rec.bestScore || 0)) : 0;
      const starsHtml = [1, 2, 3].map((i) => `<span class="${i <= stars ? 'on' : ''}">★</span>`).join('');
      return `
        <button type="button" class="ds-exp-card${rec ? ' completed' : ''}" data-exp-id="${exp.id}" style="--theme-accent:${exp.accent};">
          <div class="ds-exp-card-top">
            <span class="ds-exp-num">УРОВЕНЬ #${String(exp.num).padStart(2, '0')}</span>
            <span class="ds-exp-stars" aria-label="${stars} из 3 звёзд">${starsHtml}</span>
          </div>
          <div class="ds-exp-title"><span>${escapeHtml(exp.icon)}</span><span>${escapeHtml(exp.title)}</span></div>
          <div class="ds-exp-desc">${escapeHtml(exp.desc)}</div>
          <div class="ds-exp-foot">
            ${rec
              ? `<span class="ds-exp-score">${rec.bestScore} очк · -${rec.bestDepth}м</span><span class="ds-exp-cta">улучшить →</span>`
              : '<span style="color:var(--color-drift);">7 вопросов</span><span class="ds-exp-cta">нырнуть →</span>'}
          </div>
        </button>
      `;
    }).join('');

    grid.querySelectorAll('[data-exp-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        sfx.click();
        const expId = btn.dataset.expId;
        closeAllModals();
        openMode('expedition', expId);
      });
    });
  }

  function renderArchive() {
    const grid = document.getElementById('archive-grid');
    const todayNum = DATA.getTodayDiveNumber();
    const minNum = Math.max(1, todayNum - 13);
    const items = [];
    for (let n = todayNum; n >= minNum; n--) {
      const saved = appState.completedDives[String(n)];
      const dateStr = DATA.getDiveDateLabel(n);
      const theme = DATA.getDiveTheme ? DATA.getDiveTheme(n) : null;
      const themeHtml = theme
        ? `<span class="ds-archive-theme" style="--theme-accent:${theme.accent};"><span>${escapeHtml(theme.icon)}</span><span>${escapeHtml(theme.short)}</span></span>`
        : '';
      items.push(`
        <button type="button" class="ds-archive-item${saved ? ' completed' : ''}" data-dive-num="${n}">
          <span class="ds-archive-num">#${n}${n === todayNum ? ' · сегодня' : ''}</span>
          <span class="ds-archive-date">${dateStr}</span>
          ${themeHtml}
          ${saved ? `<span class="ds-archive-score">${saved.score} очк · -${saved.depth}м</span>` : '<span class="ds-archive-date" style="color:var(--color-foam);">сыграть →</span>'}
        </button>
      `);
    }
    grid.innerHTML = items.join('');

    grid.querySelectorAll('[data-dive-num]').forEach((btn) => {
      btn.addEventListener('click', () => {
        sfx.click();
        const num = Number(btn.dataset.diveNum);
        closeAllModals();
        if (num === todayNum) {
          openMode('daily', num);
        } else {
          openMode('archive', num);
        }
      });
    });
  }

  // ---------------- Global Event Wiring ----------------
  beginBtn.addEventListener('click', startDiveOrShowResults);

  document.getElementById('intro-meta').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    sfx.click();
    const act = btn.dataset.action;
    if (act === 'expeditions') openModal('expeditions-backdrop');
    else if (act === 'archive') openModal('archive-backdrop');
    else if (act === 'endless') openMode('endless');
    else if (act === 'daily') openMode('daily');
  });

  menuBtn.addEventListener('click', () => {
    sfx.click();
    openModal('menu-backdrop');
  });

  settingsBtn.addEventListener('click', () => {
    sfx.click();
    openModal('settings-backdrop');
  });

  wardrobeBtn.addEventListener('click', () => {
    sfx.click();
    openModal('wardrobe-backdrop');
  });

  muteBtn.addEventListener('click', () => {
    appState.settings.muted = !appState.settings.muted;
    saveState();
    applySettingsToDom();
    if (!appState.settings.muted) sfx.click();
  });

  document.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      sfx.click();
      closeAllModals();
    });
  });

  document.querySelectorAll('.ds-modal-backdrop').forEach((bd) => {
    bd.addEventListener('click', (e) => {
      if (e.target === bd) {
        closeAllModals();
      }
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAllModals();
    } else if (
      e.key === 'Enter' &&
      !e.repeat &&
      session.phase === 'feedback' &&
      nextWrapEl.classList.contains('visible') &&
      !document.querySelector('.ds-modal-backdrop.open')
    ) {
      e.preventDefault();
      nextBtn.click();
    }
  });

  document.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => {
      sfx.click();
      const target = btn.dataset.nav;
      closeAllModals();
      if (target === 'daily') openMode('daily');
      else if (target === 'expeditions') openModal('expeditions-backdrop');
      else if (target === 'endless') openMode('endless');
      else if (target === 'menu') openModal('menu-backdrop');
      else if (target === 'archive') openModal('archive-backdrop');
      else if (target === 'wardrobe') openModal('wardrobe-backdrop');
      else if (target === 'settings') openModal('settings-backdrop');
      else if (target === 'faq') openModal('faq-backdrop');
      else if (target === 'bugreport') openBugReportModal();
    });
  });

  document.querySelectorAll('.ds-bug-cat').forEach((btn) => {
    btn.addEventListener('click', () => {
      sfx.click();
      setBugCategory(btn.dataset.cat);
    });
  });

  const bugForm = document.getElementById('bugreport-form');
  if (bugForm) {
    bugForm.addEventListener('submit', (e) => {
      e.preventDefault();
      sfx.click();
      const { title, body } = buildBugReportPayload();
      const url = `https://github.com/gogaport/krillion-ru/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
      window.open(url, '_blank', 'noopener');
    });
  }

  const bugCopyBtn = document.getElementById('bug-copy-btn');
  if (bugCopyBtn) {
    bugCopyBtn.addEventListener('click', () => {
      sfx.click();
      const { title, body } = buildBugReportPayload();
      const fullText = `${title}\n\n${body}`;
      navigator.clipboard?.writeText(fullText).catch(() => {});
      bugCopyBtn.textContent = 'СКОПИРОВАНО ✓';
      bugCopyBtn.classList.add('copied');
      setTimeout(() => {
        bugCopyBtn.textContent = 'СКОПИРОВАТЬ ТЕКСТ';
        bugCopyBtn.classList.remove('copied');
      }, 2200);
    });
  }

  const bugDiscordLink = document.getElementById('bug-discord-link');
  if (bugDiscordLink) {
    bugDiscordLink.addEventListener('click', () => {
      const { title, body } = buildBugReportPayload();
      navigator.clipboard?.writeText(`${title}\n\n${body}`).catch(() => {});
    });
  }

  const settingBindings = [
    ['opt-lowpower', 'lowPower'],
    ['opt-colorblind', 'colorblind'],
    ['opt-corrections', 'answerCorrections'],
    ['opt-clear-rejected', 'clearRejected'],
    ['opt-share-link', 'shareLink'],
    ['opt-unlock-buddies', 'unlockAllBuddies']
  ];

  settingBindings.forEach(([id, key]) => {
    document.getElementById(id).addEventListener('change', (e) => {
      sfx.click();
      appState.settings[key] = e.target.checked;
      saveState();
      applySettingsToDom();
      if (key === 'unlockAllBuddies') renderWardrobe();
    });
  });

  let maxViewportH = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  let prevViewportW = window.visualViewport ? window.visualViewport.width : window.innerWidth;

  function syncViewportLayout() {
    const vv = window.visualViewport;
    const w = vv ? vv.width : window.innerWidth;
    const h = vv ? vv.height : window.innerHeight;

    if (Math.abs(w - prevViewportW) > 30) {
      prevViewportW = w;
      maxViewportH = h;
    } else if (h > maxViewportH) {
      maxViewportH = h;
    }

    document.documentElement.style.setProperty('--vvh', `${Math.round(h)}px`);
    const isTouchWidth = w <= 900 || 'ontouchstart' in window;
    const isKbOpen = session.phase === 'answering' && isTouchWidth && (h < maxViewportH * 0.78);
    document.documentElement.classList.toggle('kb-open', isKbOpen);

    if (isKbOpen && (window.scrollY !== 0 || (vv && vv.offsetTop !== 0))) {
      window.scrollTo(0, 0);
    }

    ocean.resize();
    if (session.phase === 'intro') {
      ocean.setCameraDepthPx(0, 0.54);
    } else if (session.phase === 'done') {
      ocean.setCameraDepthPx(0, 0.42);
    } else {
      ocean.setCameraDepthPx(session.totalDepthM * PX_PER_METER, isKbOpen ? 0.46 : 0.38);
    }
  }

  window.addEventListener('resize', syncViewportLayout);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', syncViewportLayout);
    window.visualViewport.addEventListener('scroll', syncViewportLayout);
  }
  answerInput.addEventListener('focus', () => {
    setTimeout(syncViewportLayout, 60);
    setTimeout(syncViewportLayout, 280);
  });
  answerInput.addEventListener('blur', () => {
    setTimeout(syncViewportLayout, 80);
  });

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ---------------- Boot ----------------
  initStaticDecor();
  applySettingsToDom();
  openMode('daily');

  function loop(ts) {
    ocean.render(ts);
    mascot.update(ts, session.phase);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
