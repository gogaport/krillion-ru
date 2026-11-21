(function () {
  function svgUri(svg) {
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg.trim());
  }

  function pxGrid(rects, w = 24, h = 24) {
    const body = rects
      .map(([x, y, rw, rh, fill]) => `<rect x="${x}" y="${y}" width="${rw}" height="${rh}" fill="${fill}"/>`)
      .join('');
    return svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${body}</svg>`);
  }

  const SPRITES = {
    // 24x24 Shaded Blue Bubble Cluster (Plankton)
    plankton: pxGrid([
      // Main top-left translucent ocean bubble
      [6, 3, 6, 1, '#5897c4'], [4, 4, 2, 1, '#5897c4'], [12, 4, 1, 2, '#5897c4'],
      [3, 5, 1, 5, '#3b739c'], [13, 6, 1, 4, '#5897c4'],
      [4, 10, 2, 2, '#2a5678'], [11, 10, 2, 2, '#3b739c'], [6, 12, 5, 1, '#2a5678'],
      [5, 4, 7, 7, '#214866'], [4, 5, 9, 5, '#2b5d82'],
      [6, 5, 4, 2, '#9ce0ff'], [5, 6, 2, 2, '#d8f4ff'], [6, 6, 1, 1, '#ffffff'],
      [10, 9, 2, 2, '#62b3de'],
      // Mid-right smaller bubble
      [15, 13, 4, 1, '#6ec4eb'], [14, 14, 1, 3, '#3b739c'], [19, 14, 1, 3, '#5897c4'],
      [15, 14, 4, 3, '#255073'], [15, 17, 4, 1, '#2a5678'],
      [16, 15, 1, 1, '#d8f4ff'], [18, 16, 1, 1, '#62b3de'],
      // Bottom center-left bubble
      [9, 17, 4, 1, '#6ec4eb'], [8, 18, 1, 2, '#3b739c'], [13, 18, 1, 2, '#5897c4'],
      [9, 18, 4, 2, '#214866'], [9, 20, 4, 1, '#2a5678'],
      [10, 18, 1, 1, '#d8f4ff']
    ]),
    // 24x24 Worm coiled on Brass Fishhook (Too Clever)
    tooclever: pxGrid([
      // Brass hook shaft & curve
      [11, 1, 2, 1, '#ffd166'], [10, 2, 1, 2, '#d97706'], [13, 2, 1, 2, '#ffd166'],
      [11, 4, 2, 1, '#d97706'],
      [11, 5, 2, 11, '#f59e0b'], [12, 5, 1, 10, '#ffd166'],
      [9, 16, 3, 2, '#d97706'], [7, 15, 3, 2, '#f59e0b'], [6, 12, 2, 4, '#ffd166'],
      [5, 10, 2, 2, '#ffd166'], [7, 11, 1, 1, '#d97706'],
      // Orange segmented bait worm
      [10, 8, 5, 2, '#ff8c24'], [11, 9, 4, 2, '#ff6b1a'], [14, 10, 3, 4, '#ff8c24'],
      [15, 11, 2, 3, '#e04e0b'], [13, 13, 3, 3, '#ff6b1a'], [10, 14, 4, 2, '#b83200'],
      [8, 14, 3, 2, '#ff8c24'], [13, 17, 2, 3, '#ff6b1a'], [10, 19, 4, 2, '#ff8c24'],
      [9, 18, 2, 2, '#e04e0b'],
      // Worm shine pixels
      [11, 8, 2, 1, '#ffb86b'], [15, 10, 1, 2, '#ffb86b'], [11, 19, 2, 1, '#ffb86b']
    ]),
    // 24x24 Shaded Neon Cyan Pixel Fish (Schooler)
    schooler: pxGrid([
      // Dorsal & ventral fins
      [10, 4, 4, 2, '#149bb8'], [11, 5, 3, 1, '#4de3ff'],
      [11, 17, 3, 2, '#0c7894'], [10, 16, 3, 1, '#149bb8'],
      // Main fusiform fish body
      [7, 6, 9, 2, '#1cbcd6'], [5, 8, 12, 2, '#4de3ff'],
      [3, 10, 15, 3, '#72eeff'], [4, 13, 13, 2, '#4de3ff'],
      [7, 15, 8, 2, '#149bb8'],
      // Belly & crest highlights
      [8, 8, 6, 2, '#aaf7ff'], [7, 13, 6, 1, '#25c9e0'],
      // Gill & tail peduncle
      [16, 10, 2, 3, '#149bb8'], [18, 9, 2, 5, '#0f8aa8'],
      [20, 7, 2, 3, '#1cbcd6'], [21, 6, 2, 2, '#4de3ff'],
      [20, 13, 2, 3, '#1cbcd6'], [21, 15, 2, 2, '#0c7894'],
      // Crisp bright eye & pupil
      [5, 9, 2, 2, '#e8f1ff'], [5, 10, 1, 1, '#050a14'],
      [10, 10, 1, 2, '#149bb8']
    ]),
    // 24x24 Shaded Scarlet Giant Squid (Rare)
    rare: pxGrid([
      // Fins + mantle arrow top
      [11, 2, 2, 2, '#ff7688'], [10, 4, 4, 2, '#ff384c'],
      [8, 6, 8, 2, '#e01e37'], [9, 8, 6, 6, '#ff384c'],
      [10, 6, 3, 7, '#ff6b7d'], [14, 8, 2, 5, '#9e0b22'],
      // Head & side eyes
      [9, 14, 6, 2, '#b80f28'], [8, 14, 2, 2, '#ffd166'], [14, 14, 2, 2, '#ffd166'],
      [9, 14, 1, 1, '#050a14'], [14, 14, 1, 1, '#050a14'],
      // Tentacles streaming down
      [7, 16, 2, 4, '#ff384c'], [6, 19, 2, 3, '#b80f28'],
      [10, 16, 1, 6, '#ff6b7d'], [11, 16, 1, 7, '#e01e37'],
      [13, 16, 1, 6, '#ff384c'], [15, 16, 2, 4, '#ff384c'],
      [16, 19, 2, 3, '#9e0b22']
    ]),
    // 24x24 Abyssal Anglerfish with Glowing Esca Lure (Deep Cut)
    deepcut: pxGrid([
      // Fishing rod stalk & glowing white/cyan lure
      [10, 3, 5, 1, '#4f6d99'], [8, 4, 2, 1, '#6889b8'], [6, 5, 2, 2, '#8faee0'],
      [14, 4, 2, 3, '#3c567d'],
      [4, 7, 3, 3, '#a8e6ff'], [5, 8, 2, 2, '#ffffff'],
      // Armored dark slate body
      [9, 7, 8, 3, '#263d5e'], [7, 10, 12, 6, '#1a2d47'], [9, 16, 8, 3, '#101d33'],
      [10, 8, 5, 2, '#3b5882'], [13, 5, 3, 2, '#3c567d'],
      // Pectoral & tail fins
      [19, 10, 3, 5, '#263d5e'], [21, 9, 2, 2, '#4f6d99'], [21, 14, 2, 2, '#16263d'],
      [14, 14, 3, 2, '#4f6d99'],
      // Piercing eye & toothy gaping maw
      [10, 10, 2, 2, '#7ceeff'], [10, 10, 1, 1, '#ffffff'],
      [7, 12, 5, 4, '#050a14'],
      [7, 12, 1, 2, '#e2e8f0'], [9, 12, 1, 2, '#e2e8f0'], [11, 12, 1, 1, '#e2e8f0'],
      [8, 15, 1, 2, '#e2e8f0'], [10, 15, 1, 2, '#e2e8f0']
    ]),
    // 24x24 Neon Coral-Pink Krill Shrimp (Krillion)
    krillion: pxGrid([
      // Long sweeping antennae
      [6, 3, 5, 1, '#ff7aa2'], [11, 2, 5, 1, '#ff5d8f'], [16, 3, 3, 1, '#ff9ebb'],
      [6, 5, 6, 1, '#ff4d82'], [12, 4, 5, 1, '#ff85ab'],
      // Head & arched segmented carapace
      [6, 7, 6, 3, '#ff4077'], [5, 9, 4, 3, '#ff2663'], [3, 10, 2, 1, '#ff85ab'],
      [11, 7, 5, 3, '#ff6b98'], [14, 9, 4, 4, '#ff4077'], [16, 12, 3, 4, '#d91c53'],
      [14, 15, 4, 3, '#ff5d8f'], [10, 17, 5, 2, '#ff4077'], [8, 17, 3, 2, '#ff85ab'],
      // Tail fan & spine highlights
      [12, 8, 3, 2, '#ffb3c9'], [15, 10, 2, 2, '#ff85ab'],
      [6, 16, 3, 2, '#ff85ab'], [5, 18, 3, 1, '#ffc2d4'],
      // Glowing eye & delicate pleopods
      [6, 8, 2, 2, '#fff0f5'], [6, 8, 1, 1, '#050a14'],
      [8, 12, 1, 2, '#ff85ab'], [10, 12, 1, 2, '#ff85ab'], [12, 12, 1, 2, '#ff85ab']
    ]),
    miss: pxGrid([
      [6, 6, 3, 3, '#5d739c'], [15, 6, 3, 3, '#5d739c'],
      [9, 9, 6, 6, '#3d4f6e'],
      [6, 15, 3, 3, '#5d739c'], [15, 15, 3, 3, '#5d739c']
    ]),
    // Albino / Red-Eyed Krill Buddy (Evil Krill)
    evilKrill: pxGrid([
      [6, 3, 5, 1, '#e2e8f0'], [11, 2, 6, 1, '#f8fafc'],
      [6, 5, 6, 1, '#cbd5e1'], [12, 4, 5, 1, '#e2e8f0'],
      [6, 7, 6, 3, '#f1f5f9'], [5, 9, 4, 3, '#cbd5e1'], [3, 10, 2, 1, '#ffffff'],
      [11, 7, 5, 3, '#f8fafc'], [14, 9, 4, 4, '#cbd5e1'], [16, 12, 3, 4, '#94a3b8'],
      [14, 15, 4, 3, '#e2e8f0'], [10, 17, 5, 2, '#cbd5e1'], [8, 17, 3, 2, '#f1f5f9'],
      [6, 16, 3, 2, '#f8fafc'], [5, 18, 3, 1, '#ffffff'],
      [6, 8, 2, 2, '#ff2644'], [6, 8, 1, 1, '#ff8093'],
      [8, 12, 1, 2, '#94a3b8'], [10, 12, 1, 2, '#94a3b8'], [12, 12, 1, 2, '#94a3b8']
    ]),
    // Iridescent Violet Pearl Crystal Krill (Hackmanite)
    hackmanite: pxGrid([
      [6, 3, 5, 1, '#d8b4fe'], [11, 2, 6, 1, '#f3e8ff'],
      [6, 5, 6, 1, '#c084fc'], [12, 4, 5, 1, '#e9d5ff'],
      [6, 7, 6, 3, '#c084fc'], [5, 9, 4, 3, '#9333ea'],
      [11, 7, 5, 3, '#e9d5ff'], [14, 9, 4, 4, '#a855f7'], [16, 12, 3, 4, '#7e22ce'],
      [14, 15, 4, 3, '#c084fc'], [10, 17, 5, 2, '#9333ea'], [8, 17, 3, 2, '#d8b4fe'],
      [6, 16, 3, 2, '#e9d5ff'], [6, 8, 2, 2, '#ffffff'], [6, 8, 1, 1, '#050a14'],
      [8, 12, 1, 2, '#d8b4fe'], [10, 12, 1, 2, '#d8b4fe'], [12, 12, 1, 2, '#d8b4fe']
    ]),
    // Skeletal Bone Fossil Krill (Fossil Krill)
    fossilKrill: pxGrid([
      [6, 3, 5, 1, '#d6ccb2'], [11, 2, 6, 1, '#e8e0cc'],
      [6, 5, 6, 1, '#b8ab8e'],
      [6, 7, 6, 3, '#e3dac3'], [5, 9, 4, 3, '#c4b697'],
      [11, 7, 4, 3, '#e8e0cc'], [15, 8, 1, 2, '#5c513e'], [16, 9, 2, 3, '#d6ccb2'],
      [17, 13, 2, 2, '#c4b697'], [14, 15, 3, 2, '#e3dac3'], [10, 17, 4, 2, '#c4b697'],
      [6, 16, 3, 2, '#e8e0cc'], [6, 8, 2, 2, '#1f1a14'],
      [8, 12, 1, 2, '#b8ab8e'], [10, 12, 1, 2, '#b8ab8e'], [12, 12, 1, 2, '#b8ab8e']
    ]),
    // Striped Tiger Mantis Shrimp
    mantis: pxGrid([
      [6, 3, 5, 1, '#ff7b3b'], [11, 2, 6, 1, '#ff9f43'],
      [6, 7, 5, 3, '#ff5f2e'], [11, 7, 3, 4, '#242b38'], [14, 8, 3, 4, '#ff7b3b'],
      [16, 11, 3, 3, '#242b38'], [15, 14, 3, 3, '#ff5f2e'], [11, 16, 4, 2, '#ff9f43'],
      [7, 11, 4, 4, '#14b8a6'], [8, 12, 3, 3, '#2dd4bf'],
      [6, 5, 2, 2, '#050a14'], [9, 5, 2, 2, '#050a14'],
      [6, 5, 1, 1, '#fef08a'], [9, 5, 1, 1, '#fef08a'],
      [6, 16, 3, 2, '#fef08a'], [9, 13, 1, 2, '#ff7b3b']
    ]),
    // Spiked Deep-Teal Leviathan Krill (Leviathan)
    leviathan: pxGrid([
      [6, 3, 5, 1, '#4dd0c8'], [11, 2, 6, 1, '#80e5de'],
      [6, 5, 6, 1, '#2a9d8f'], [13, 6, 1, 1, '#e8f1ff'], [16, 8, 1, 1, '#e8f1ff'],
      [6, 7, 6, 3, '#218380'], [5, 9, 4, 3, '#13575c'],
      [11, 7, 5, 3, '#2a9d8f'], [14, 9, 4, 4, '#218380'], [16, 12, 3, 4, '#0f444c'],
      [14, 15, 4, 3, '#2a9d8f'], [10, 17, 5, 2, '#218380'], [8, 17, 3, 2, '#4dd0c8'],
      [6, 16, 3, 2, '#80e5de'], [6, 8, 2, 2, '#ffd166'], [6, 8, 1, 1, '#050a14'],
      [8, 12, 1, 2, '#4dd0c8'], [10, 12, 1, 2, '#4dd0c8'], [12, 12, 1, 2, '#4dd0c8']
    ]),
    // 24x24 Golden Chambered Nautilus (5 Expeditions Reward)
    nautilusGold: pxGrid([
      [8, 4, 7, 2, '#d97706'], [6, 6, 11, 2, '#f59e0b'], [5, 8, 13, 5, '#fbbf24'],
      [6, 13, 11, 4, '#f59e0b'], [8, 17, 7, 2, '#b45309'],
      [9, 6, 5, 2, '#fde68a'], [12, 8, 4, 3, '#fef3c7'],
      [10, 10, 2, 3, '#92400e'], [12, 12, 2, 2, '#b45309'], [10, 11, 1, 1, '#ffffff'],
      [7, 9, 2, 4, '#d97706'], [9, 14, 4, 2, '#d97706'],
      [4, 13, 3, 2, '#ff85a1'], [3, 15, 2, 3, '#ff5d8f'], [5, 16, 2, 3, '#ff85a1'],
      [7, 17, 2, 3, '#e11d48'], [5, 11, 2, 2, '#fffbeb'], [5, 11, 1, 1, '#050a14']
    ]),
    // 24x24 Nebula Cosmic Krill (16 Expeditions Reward)
    cosmicKrill: pxGrid([
      [6, 3, 5, 1, '#67e8f9'], [11, 2, 6, 1, '#c084fc'], [17, 3, 2, 1, '#fef08a'],
      [6, 5, 6, 1, '#a855f7'], [12, 4, 5, 1, '#38bdf8'],
      [3, 4, 1, 1, '#fef08a'], [20, 7, 1, 1, '#67e8f9'], [4, 19, 1, 1, '#fef08a'],
      [6, 7, 6, 3, '#6366f1'], [5, 9, 4, 3, '#4f46e5'], [3, 10, 2, 1, '#67e8f9'],
      [11, 7, 5, 3, '#8b5cf6'], [14, 9, 4, 4, '#6d28d9'], [16, 12, 3, 4, '#4c1d95'],
      [14, 15, 4, 3, '#7c3aed'], [10, 17, 5, 2, '#4338ca'], [8, 17, 3, 2, '#38bdf8'],
      [12, 8, 3, 2, '#e0f2fe'], [15, 10, 2, 2, '#f0abfc'],
      [6, 16, 3, 2, '#a78bfa'], [5, 18, 3, 1, '#67e8f9'],
      [6, 8, 2, 2, '#fef08a'], [6, 8, 1, 1, '#050a14'],
      [8, 12, 1, 2, '#67e8f9'], [10, 12, 1, 2, '#f0abfc'], [12, 12, 1, 2, '#67e8f9']
    ]),
    // 24x24 Crowned King Kraken (16 Gold Expeditions Reward)
    kingKraken: pxGrid([
      [8, 1, 2, 2, '#ffd166'], [11, 1, 2, 2, '#ffd166'], [14, 1, 2, 2, '#ffd166'],
      [8, 3, 8, 2, '#f59e0b'], [11, 3, 2, 1, '#ff384c'],
      [8, 5, 8, 2, '#9d4edd'], [7, 7, 10, 5, '#7b2cbf'], [9, 6, 4, 4, '#c77dff'],
      [15, 7, 2, 5, '#5a189a'], [8, 12, 8, 3, '#5a189a'],
      [8, 12, 2, 2, '#ffd166'], [14, 12, 2, 2, '#ffd166'],
      [9, 12, 1, 1, '#050a14'], [14, 12, 1, 1, '#050a14'],
      [5, 15, 2, 4, '#9d4edd'], [4, 18, 2, 3, '#7b2cbf'],
      [8, 15, 2, 5, '#c77dff'], [9, 19, 1, 3, '#ffd166'],
      [11, 15, 2, 6, '#7b2cbf'], [14, 15, 2, 5, '#c77dff'],
      [17, 15, 2, 4, '#9d4edd'], [18, 18, 2, 3, '#5a189a']
    ])
  };

  const TIERS = {
    plankton: {
      id: 'plankton',
      name: 'ПЛАНКТОН',
      short: 'Планктон',
      pts: 10,
      depth: 100,
      color: 'var(--tier-plankton)',
      hex: '#8fa3c4',
      emoji: '⬜',
      sprite: SPRITES.plankton,
      desc: 'Ответ, который первым приходит в голову каждому.'
    },
    tooclever: {
      id: 'tooclever',
      name: 'СЛИШКОМ УМНО',
      short: 'Слишком умно',
      pts: 15,
      depth: 150,
      color: 'var(--tier-tooclever)',
      hex: '#ff9f43',
      emoji: '🟧',
      sprite: SPRITES.tooclever,
      desc: 'Классический «редкий» вариант, который выбирают все хитрецы.'
    },
    schooler: {
      id: 'schooler',
      name: 'КОСЯК',
      short: 'Косяк',
      pts: 30,
      depth: 300,
      color: 'var(--tier-schooler)',
      hex: '#4de3ff',
      emoji: '🟦',
      sprite: SPRITES.schooler,
      desc: 'Уверенно — плывёте вместе со стаей.'
    },
    rare: {
      id: 'rare',
      name: 'РЕДКИЙ',
      short: 'Редкий',
      pts: 60,
      depth: 600,
      color: 'var(--tier-rare)',
      hex: '#ff5252',
      emoji: '🟥',
      sprite: SPRITES.rare,
      desc: 'Ниже термоклина. Отличная находка.'
    },
    deepcut: {
      id: 'deepcut',
      name: 'ГЛУБОКОВОДНЫЙ',
      short: 'Глубоководный',
      pts: 85,
      depth: 850,
      color: 'var(--tier-deepcut)',
      hex: '#9d7bff',
      emoji: '🟪',
      sprite: SPRITES.deepcut,
      desc: 'Серьёзная глубина. Сюда ныряют немногие.'
    },
    krillion: {
      id: 'krillion',
      name: 'ОДИН НА КРИЛЛИОН',
      short: 'Криллион',
      pts: 100,
      depth: 1000,
      color: 'var(--tier-krillion)',
      hex: '#ffd166',
      emoji: '🟨',
      sprite: SPRITES.krillion,
      desc: 'Жемчужина бездны. Попасть в такое — чудо.'
    },
    miss: {
      id: 'miss',
      name: 'ПРОМАХ',
      short: 'Промах',
      pts: 0,
      depth: 0,
      color: 'var(--tier-miss)',
      hex: '#3d4f6e',
      emoji: '⬛',
      sprite: SPRITES.miss,
      desc: 'Время вышло — глубина не изменилась.'
    }
  };

  const TIER_ORDER = ['krillion', 'deepcut', 'rare', 'schooler', 'tooclever', 'plankton'];

  const BUDDIES = [
    { id: 'krillion', name: 'Крилль', streak: 0, sprite: SPRITES.krillion, color: '#ff5d8f', gold: true },
    { id: 'schooler', name: 'Косяк', streak: 5, sprite: SPRITES.schooler, color: '#4de3ff' },
    { id: 'rare', name: 'Редкий кальмар', streak: 14, sprite: SPRITES.rare, color: '#ff5252' },
    { id: 'deepcut', name: 'Удильщик', streak: 30, sprite: SPRITES.deepcut, color: '#9d7bff' },
    { id: 'evil-krill', name: 'Злой крилль', streak: 45, sprite: SPRITES.evilKrill, color: '#ff5252' },
    { id: 'hackmanite', name: 'Хакманит', streak: 60, sprite: SPRITES.hackmanite, color: '#c77dff' },
    { id: 'fossil-krill', name: 'Ископаемый крилль', streak: 75, sprite: SPRITES.fossilKrill, color: '#dfd3a8' },
    { id: 'tiger-mantis', name: 'Рак-богомол', streak: 100, sprite: SPRITES.mantis, color: '#38d399' },
    { id: 'leviathan', name: 'Левиафан', streak: 150, sprite: SPRITES.leviathan, color: '#4dd0c8', gold: true },
    { id: 'nautilus-gold', name: 'Золотой наутилус', streak: 9999, expeditionReq: 5, sprite: SPRITES.nautilusGold, color: '#fbbf24' },
    { id: 'cosmic-krill', name: 'Космический крилль', streak: 9999, expeditionReq: 16, sprite: SPRITES.cosmicKrill, color: '#a78bfa', gold: true },
    { id: 'king-kraken', name: 'Король Кракен', streak: 9999, expeditionGoldReq: 16, sprite: SPRITES.kingKraken, color: '#ffd166', gold: true }
  ];

  const AMBIENT_MARKERS = [
    { top: 111, side: 'L', text: 'свет начинает угасать' },
    { top: 391, side: 'R', text: 'сюда почти не доходит солнце' },
    { top: 655, side: 'R', text: 'рекорд погружения с аквалангом — 332 м' },
    { top: 761, side: 'L', text: 'ниже охотятся кашалоты' },
    { top: 1061, side: 'R', text: 'досюда ныряют императорские пингвины' },
    { top: 1311, side: 'L', text: 'давление: в 67 раз выше поверхностного' },
    { top: 1591, side: 'R', text: 'зона дрейфа сифонофор' },
    { top: 2071, side: 'L', major: true, text: 'ПОЛУНОЧНАЯ ЗОНА' },
    { top: 2471, side: 'R', text: 'территория глубоководных удильщиков' },
    { top: 3091, side: 'L', text: 'здесь кашалоты сражаются с гигантскими кальмарами' },
    { top: 3691, side: 'R', text: 'владения гигантского кальмара' },
    { top: 4291, side: 'L', text: 'глаза колоссального кальмара — с футбольный мяч' },
    { top: 4991, side: 'R', text: 'вода +2°C и кромешная тьма' },
    { top: 5991, side: 'L', major: true, text: 'АБИССАЛЬНАЯ ЗОНА' },
    { top: 7591, side: 'R', text: 'здесь покоится «Титаник» — 3 800 м' },
    { top: 8791, side: 'L', text: 'ошибни патрулируют равнину' },
    { top: 9791, side: 'R', text: 'простирается абиссальная равнина' },
    { top: 10991, side: 'L', text: 'глубже, чем выдерживают подлодки' },
    { top: 11991, side: 'R', major: true, text: 'ХАДАЛЬНАЯ ЗОНА (ЖЕЛОБ)' },
    { top: 12991, side: 'L', text: 'названа в честь Аида. заслуженно.' },
    { top: 13991, side: 'R', major: true, text: 'дно впадины — здесь заканчивается идеальное погружение' }
  ];

  const TIER_CODES = {
    p: 'plankton',
    t: 'tooclever',
    s: 'schooler',
    r: 'rare',
    d: 'deepcut',
    k: 'krillion'
  };

  function buildAnswers(raw) {
    return raw.map((item) => {
      const [name, tierCode, players, aliases, note] = item;
      return {
        name,
        tier: TIER_CODES[tierCode] || tierCode,
        players,
        aliases: aliases || [],
        note: note || ''
      };
    });
  }

  const PROMPTS = [
  {
    "id": "talking-animal-movie",
    "text": "Назови фильм или мультфильм, где главный герой — говорящее животное",
    "count": 227,
    "strictShape": false
  },
  {
    "id": "food-ends-o",
    "text": "Назови еду или напиток из одного слова, заканчивающееся на букву О",
    "count": 233,
    "strictShape": true
  },
  {
    "id": "animal-8plus",
    "text": "Назови животное из одного слова, в названии которого 8 или более букв",
    "count": 737,
    "strictShape": true
  },
  {
    "id": "cities-suffix",
    "text": "Назови город мира, заканчивающийся на -бург (-берг), -виль (-вилл), -дорф или -штадт",
    "count": 315,
    "strictShape": true
  },
  {
    "id": "white-inside",
    "text": "Назови фрукт или овощ, который белый внутри",
    "count": 155,
    "strictShape": false
  },
  {
    "id": "europe-country",
    "text": "Назови страну Европы",
    "count": 62,
    "strictShape": false
  },
  {
    "id": "chemical-element",
    "text": "Назови химический элемент таблицы Менделеева",
    "count": 118,
    "strictShape": false
  },
  {
    "id": "open-world-game",
    "text": "Назови видеоигру с открытым миром",
    "count": 546,
    "strictShape": false
  },
  {
    "id": "musical-instrument",
    "text": "Назови музыкальный инструмент",
    "count": 474,
    "strictShape": false
  },
  {
    "id": "space-object",
    "text": "Назови космический объект (планету, спутник, звезду или созвездие)",
    "count": 451,
    "strictShape": false
  },
  {
    "id": "cheese-type",
    "text": "Назови сорт или вид сыра",
    "count": 310,
    "strictShape": false
  },
  {
    "id": "russian-literature",
    "text": "Назови произведение русской классической литературы",
    "count": 707,
    "strictShape": false
  },
  {
    "id": "kitchen-item",
    "text": "Назови предмет на кухне из одного слова",
    "count": 325,
    "strictShape": false
  },
  {
    "id": "dog-breed",
    "text": "Назови породу собаки",
    "count": 435,
    "strictShape": false
  },
  {
    "id": "sea-or-ocean",
    "text": "Назови море или океан",
    "count": 162,
    "strictShape": false
  },
  {
    "id": "programming-lang",
    "text": "Назови язык программирования",
    "count": 508,
    "strictShape": false
  },
  {
    "id": "board-game",
    "text": "Назови настольную или карточную игру",
    "count": 315,
    "strictShape": false
  },
  {
    "id": "car-brand",
    "text": "Назови марку автомобиля",
    "count": 501,
    "strictShape": false
  },
  {
    "id": "bird-name",
    "text": "Назови птицу",
    "count": 348,
    "strictShape": false
  },
  {
    "id": "tree-shrub",
    "text": "Назови дерево или кустарник",
    "count": 466,
    "strictShape": false
  },
  {
    "id": "gemstone",
    "text": "Назови драгоценный или поделочный камень",
    "count": 492,
    "strictShape": false
  },
  {
    "id": "pasta-shape",
    "text": "Назови вид пасты (макаронных изделий)",
    "count": 168,
    "strictShape": false
  },
  {
    "id": "mythology-greek-norse",
    "text": "Назови древнегреческого или скандинавского бога / мифическое существо",
    "count": 373,
    "strictShape": false
  },
  {
    "id": "profession-oneword",
    "text": "Назови профессию из одного слова",
    "count": 1105,
    "strictShape": false
  },
  {
    "id": "color-shade",
    "text": "Назови цвет или оттенок",
    "count": 239,
    "strictShape": false
  },
  {
    "id": "comic-hero-villain",
    "text": "Назови супергероя или суперзлодея из комиксов",
    "count": 580,
    "strictShape": false
  },
  {
    "id": "moba-hero-shooter",
    "text": "Назови персонажа игры Dota 2, League of Legends, Valorant или Overwatch",
    "count": 433,
    "strictShape": false
  },
  {
    "id": "vowel-country",
    "text": "Назови страну, название которой начинается на гласную букву",
    "count": 58,
    "strictShape": true
  },
  {
    "id": "russia-city-million",
    "text": "Назови крупный город России (кроме Москвы и Санкт-Петербурга)",
    "count": 202,
    "strictShape": false
  },
  {
    "id": "world-capital",
    "text": "Назови столицу любого государства мира",
    "count": 200,
    "strictShape": false
  },
  {
    "id": "island-world",
    "text": "Назови остров или архипелаг в любой точке мира",
    "count": 686,
    "strictShape": false
  },
  {
    "id": "world-river",
    "text": "Назови реку в России или мире",
    "count": 656,
    "strictShape": false
  },
  {
    "id": "mountain-range",
    "text": "Назови гору, вулкан или горный хребет",
    "count": 867,
    "strictShape": false
  },
  {
    "id": "moscow-spb-metro",
    "text": "Назови станцию метро Москвы или Санкт-Петербурга",
    "count": 286,
    "strictShape": false
  },
  {
    "id": "berry-fruit",
    "text": "Назови ягоду (настоящую или ту, что все считают ягодой)",
    "count": 201,
    "strictShape": false
  },
  {
    "id": "mushroom-name",
    "text": "Назови съедобный или ядовитый гриб",
    "count": 518,
    "strictShape": false
  },
  {
    "id": "flower-plant",
    "text": "Назови цветок (садовый, полевой или комнатный)",
    "count": 465,
    "strictShape": false
  },
  {
    "id": "sea-creature",
    "text": "Назови морского обитателя (кроме кита и акулы)",
    "count": 707,
    "strictShape": false
  },
  {
    "id": "dinosaur-prehistoric",
    "text": "Назови динозавра или доисторическое животное",
    "count": 780,
    "strictShape": false
  },
  {
    "id": "spice-herb",
    "text": "Назови специю, пряность или приправу",
    "count": 391,
    "strictShape": false
  },
  {
    "id": "soup-dish",
    "text": "Назови суп или первое блюдо любой кухни мира",
    "count": 260,
    "strictShape": false
  },
  {
    "id": "dessert-sweet",
    "text": "Назови десерт или сладость",
    "count": 341,
    "strictShape": false
  },
  {
    "id": "sauce-condiment",
    "text": "Назови соус или заправку к блюду",
    "count": 226,
    "strictShape": false
  },
  {
    "id": "cocktail-drink",
    "text": "Назови коктейль или популярный напиток из кофейни / бара",
    "count": 378,
    "strictShape": false
  },
  {
    "id": "cat-breed",
    "text": "Назови породу кошки",
    "count": 132,
    "strictShape": false
  },
  {
    "id": "insect-bug",
    "text": "Назови насекомое или паукообразное",
    "count": 557,
    "strictShape": false
  },
  {
    "id": "scientist-inventor",
    "text": "Назови известного учёного или изобретателя",
    "count": 489,
    "strictShape": false
  },
  {
    "id": "historical-ruler",
    "text": "Назови исторического правителя, царя или полководца",
    "count": 1146,
    "strictShape": false
  },
  {
    "id": "currency-world",
    "text": "Назови валюту любой страны мира (современную или историческую)",
    "count": 124,
    "strictShape": false
  },
  {
    "id": "physical-unit",
    "text": "Назови физическую величину или единицу измерения",
    "count": 669,
    "strictShape": false
  },
  {
    "id": "body-organ-bone",
    "text": "Назови орган, кость или мышцу человека",
    "count": 617,
    "strictShape": false
  },
  {
    "id": "weather-phenomenon",
    "text": "Назови погодное или атмосферное явление",
    "count": 284,
    "strictShape": false
  },
  {
    "id": "building-landmark",
    "text": "Назови известное здание, памятник или чудо света",
    "count": 858,
    "strictShape": false
  },
  {
    "id": "fabric-material",
    "text": "Назови ткань или материал для одежды",
    "count": 304,
    "strictShape": false
  },
  {
    "id": "dance-style",
    "text": "Назови танец или танцевальное направление",
    "count": 303,
    "strictShape": false
  },
  {
    "id": "sport-no-ball",
    "text": "Назови вид спорта, в котором НЕ используется мяч или шайба",
    "count": 836,
    "strictShape": false
  },
  {
    "id": "martial-art",
    "text": "Назови боевое искусство или вид единоборств",
    "count": 277,
    "strictShape": false
  },
  {
    "id": "greek-letter-symbol",
    "text": "Назови букву греческого алфавита или математический термин",
    "count": 749,
    "strictShape": false
  },
  {
    "id": "snake-reptile",
    "text": "Назови змею, ящерицу, черепаху или амфибию",
    "count": 573,
    "strictShape": false
  },
  {
    "id": "anime-title",
    "text": "Назови аниме-сериал или полнометражное аниме",
    "count": 1665,
    "strictShape": false
  },
  {
    "id": "anime-character",
    "text": "Назови персонажа из аниме",
    "count": 2248,
    "strictShape": false
  },
  {
    "id": "pixar-disney-char",
    "text": "Назови персонажа мультфильма Disney, Pixar или DreamWorks",
    "count": 420,
    "strictShape": false
  },
  {
    "id": "harry-potter",
    "text": "Назови персонажа, заклинание или место из «Гарри Поттера»",
    "count": 589,
    "strictShape": false
  },
  {
    "id": "lord-of-rings",
    "text": "Назови персонажа, место или расу из «Властелина колец» и «Хоббита»",
    "count": 285,
    "strictShape": false
  },
  {
    "id": "star-wars",
    "text": "Назови персонажа, планету или корабль из «Звёздных войн»",
    "count": 235,
    "strictShape": false
  },
  {
    "id": "sci-fi-fantasy-movie",
    "text": "Назови культовый фантастический или киберпанк-фильм",
    "count": 771,
    "strictShape": false
  },
  {
    "id": "horror-movie",
    "text": "Назови фильм ужасов или мистический триллер",
    "count": 609,
    "strictShape": false
  },
  {
    "id": "tv-series-hit",
    "text": "Назови популярный сериал (зарубежный или российский)",
    "count": 522,
    "strictShape": false
  },
  {
    "id": "indie-game",
    "text": "Назови инди-игру или пиксельный/рогалик-хит",
    "count": 1308,
    "strictShape": false
  },
  {
    "id": "retro-console-game",
    "text": "Назови культовую игру до 2010 года (Dendy, Sega, PS1/PS2 или старый ПК)",
    "count": 1164,
    "strictShape": false
  },
  {
    "id": "minecraft-mob-item",
    "text": "Назови моба, биом, блок или предмет из Minecraft",
    "count": 1840,
    "strictShape": false
  },
  {
    "id": "pokemon-creature",
    "text": "Назови покемона",
    "count": 1075,
    "strictShape": false
  },
  {
    "id": "music-genre",
    "text": "Назови музыкальный жанр или поджанр",
    "count": 722,
    "strictShape": false
  },
  {
    "id": "rock-pop-band",
    "text": "Назови зарубежную музыкальную группу или исполнителя",
    "count": 1160,
    "strictShape": false
  },
  {
    "id": "cis-music-artist",
    "text": "Назови русскоязычную группу или исполнителя (Россия и СНГ)",
    "count": 661,
    "strictShape": false
  },
  {
    "id": "soviet-cartoon",
    "text": "Назови советский или российский мультфильм",
    "count": 741,
    "strictShape": false
  },
  {
    "id": "soviet-comedy",
    "text": "Назови культовый советский или российский фильм",
    "count": 842,
    "strictShape": false
  },
  {
    "id": "fairy-tale-folk",
    "text": "Назови сказку или фольклорного персонажа",
    "count": 496,
    "strictShape": false
  },
  {
    "id": "tech-brand",
    "text": "Назови бренд электроники, смартфонов, ПК-железа или техники",
    "count": 323,
    "strictShape": false
  },
  {
    "id": "social-app-site",
    "text": "Назови известный сайт, соцсеть, мессенджер или приложение",
    "count": 505,
    "strictShape": false
  },
  {
    "id": "clothing-item",
    "text": "Назови предмет одежды, обуви или головной убор из одного слова",
    "count": 876,
    "strictShape": false
  },
  {
    "id": "school-subject",
    "text": "Назови школьный предмет или университетскую дисциплину",
    "count": 543,
    "strictShape": false
  },
  {
    "id": "phobia-fear",
    "text": "Назови человеческий страх или фобию",
    "count": 195,
    "strictShape": false
  },
  {
    "id": "holiday-tradition",
    "text": "Назови праздник в России или мире",
    "count": 274,
    "strictShape": false
  },
  {
    "id": "tool-hardware",
    "text": "Назови строительный или слесарный инструмент из одного слова",
    "count": 637,
    "strictShape": false
  },
  {
    "id": "rare-letter-start",
    "text": "Назови существительное, начинающееся на букву Й, Ф, Щ, Э или Ю",
    "count": 5260,
    "strictShape": true
  },
  {
    "id": "word-double-letter",
    "text": "Назови слово с удвоенной согласной внутри (например: класс, ванна, теннис)",
    "count": 4207,
    "strictShape": true
  },
  {
    "id": "word-4-letters",
    "text": "Назови существительное ровно из 4 букв",
    "count": 2103,
    "strictShape": true
  },
  {
    "id": "one-syllable-noun",
    "text": "Назови существительное из одного слога (только одна гласная буква)",
    "count": 2103,
    "strictShape": true
  },
  {
    "id": "hotel-forgotten",
    "text": "Назови вещь, которую люди чаще всего забывают в отеле, поезде или самолёте",
    "count": 198,
    "strictShape": false
  },
  {
    "id": "childhood-toy-game",
    "text": "Назови детскую игрушку или дворовую игру",
    "count": 209,
    "strictShape": false
  },
  {
    "id": "bread-pastry",
    "text": "Назови вид хлеба, пирога или несладкой выпечки",
    "count": 526,
    "strictShape": false
  },
  {
    "id": "nut-seed",
    "text": "Назови орех, семечко или бобовую культуру",
    "count": 326,
    "strictShape": false
  },
  {
    "id": "famous-salad",
    "text": "Назови салат (любой кухни мира)",
    "count": 179,
    "strictShape": false
  },
  {
    "id": "meat-charcuterie",
    "text": "Назови вид колбасы, сосисок или мясного деликатеса",
    "count": 149,
    "strictShape": false
  },
  {
    "id": "vegetable-green",
    "text": "Назови овощ или салатную зелень",
    "count": 372,
    "strictShape": false
  },
  {
    "id": "tropical-fruit",
    "text": "Назови фрукт или цитрус (кроме ягод)",
    "count": 355,
    "strictShape": false
  },
  {
    "id": "video-game-char",
    "text": "Назови культового персонажа видеоигр (не из Dota 2 / LoL / Overwatch / Valorant)",
    "count": 383,
    "strictShape": false
  },
  {
    "id": "world-literature",
    "text": "Назови произведение зарубежной литературы (книгу, роман или пьесу)",
    "count": 621,
    "strictShape": false
  },
  {
    "id": "film-director",
    "text": "Назови известного кинорежиссёра",
    "count": 1083,
    "strictShape": false
  },
  {
    "id": "movie-actor",
    "text": "Назови известного актёра или актрису кино",
    "count": 1919,
    "strictShape": false
  },
  {
    "id": "classical-composer",
    "text": "Назови известного классического композитора",
    "count": 1053,
    "strictShape": false
  },
  {
    "id": "painter-artist",
    "text": "Назови известного художника или скульптора",
    "count": 631,
    "strictShape": false
  },
  {
    "id": "world-language",
    "text": "Назови язык народов мира (живой, мёртвый или вымышленный — не язык программирования)",
    "count": 255,
    "strictShape": false
  },
  {
    "id": "ancient-state",
    "text": "Назови древнюю цивилизацию, империю или исчезнувшее государство",
    "count": 143,
    "strictShape": false
  },
  {
    "id": "transport-vehicle",
    "text": "Назови вид транспорта (наземного, водного или воздушного)",
    "count": 690,
    "strictShape": false
  },
  {
    "id": "world-lake-strait",
    "text": "Назови озеро, водопад или морской пролив",
    "count": 677,
    "strictShape": false
  },
  {
    "id": "furniture-interior",
    "text": "Назови предмет мебели или домашнего интерьера",
    "count": 135,
    "strictShape": false
  },
  {
    "id": "sports-gear",
    "text": "Назови спортивный инвентарь или снаряд",
    "count": 174,
    "strictShape": false
  },
  {
    "id": "electronic-gadget",
    "text": "Назови электронное устройство, гаджет или бытовую технику",
    "count": 474,
    "strictShape": false
  },
  {
    "id": "weapon-armor",
    "text": "Назови холодное оружие, доспех или элемент старинной экипировки",
    "count": 633,
    "strictShape": false
  },
  {
    "id": "geometric-shape",
    "text": "Назови геометрическую фигуру, объёмное тело или кривую",
    "count": 289,
    "strictShape": false
  },
  {
    "id": "cosmetics-hygiene",
    "text": "Назови средство или предмет косметики, парфюмерии или личной гигиены",
    "count": 319,
    "strictShape": false
  },
  {
    "id": "word-same-edge",
    "text": "Назови существительное от 4 букв, начинающееся и заканчивающееся на одну и ту же букву",
    "count": 1857,
    "strictShape": true
  },
  {
    "id": "fashion-brand",
    "text": "Назови бренд одежды, обуви или модный дом",
    "count": 236,
    "strictShape": false
  },
  {
    "id": "fastfood-chain",
    "text": "Назови сеть фастфуда, кафе или ресторанов",
    "count": 196,
    "strictShape": false
  },
  {
    "id": "historic-event",
    "text": "Назови крупное историческое событие, битву или эпоху",
    "count": 995,
    "strictShape": false
  },
  {
    "id": "football-club",
    "text": "Назови футбольный клуб (российский или зарубежный)",
    "count": 862,
    "strictShape": false
  },
  {
    "id": "animated-series",
    "text": "Назови зарубежный или российский мультсериал (не аниме)",
    "count": 358,
    "strictShape": false
  },
  {
    "id": "stationery-item",
    "text": "Назови канцелярский или офисный предмет",
    "count": 134,
    "strictShape": false
  },
  {
    "id": "game-genre",
    "text": "Назови жанр или поджанр видеоигр",
    "count": 135,
    "strictShape": false
  },
  {
    "id": "human-emotion",
    "text": "Назови эмоцию, чувство или черту характера человека",
    "count": 262,
    "strictShape": false
  },
  {
    "id": "jewelry-accessory",
    "text": "Назови ювелирное украшение или аксессуар",
    "count": 359,
    "strictShape": false
  },
  {
    "id": "us-state",
    "text": "Назови штат США",
    "count": 50,
    "strictShape": false
  },
  {
    "id": "constellation",
    "text": "Назови созвездие звёздного неба",
    "count": 88,
    "strictShape": false
  },
  {
    "id": "grain-porridge",
    "text": "Назови крупу, кашу или злак",
    "count": 104,
    "strictShape": false
  },
  {
    "id": "car-trunk-glovebox",
    "text": "Назови вещь, которую часто возят в багажнике или бардачке машины",
    "count": 164,
    "strictShape": false
  },
  {
    "id": "philosopher",
    "text": "Назови известного философа или мыслителя",
    "count": 169,
    "strictShape": false
  },
  {
    "id": "ball-sport",
    "text": "Назови вид спорта с мячом или шайбой",
    "count": 112,
    "strictShape": false
  },
  {
    "id": "movie-villain",
    "text": "Назови известного злодея из фильмов, сериалов или мультфильмов",
    "count": 227,
    "strictShape": false
  },
  {
    "id": "africa-country",
    "text": "Назови страну Африки",
    "count": 58,
    "strictShape": false
  },
  {
    "id": "freshwater-fish",
    "text": "Назови пресноводную (речную или озёрную) рыбу",
    "count": 152,
    "strictShape": false
  },
  {
    "id": "asian-dish",
    "text": "Назови блюдо японской, китайской, корейской или тайской кухни",
    "count": 162,
    "strictShape": false
  },
  {
    "id": "dacha-garden-item",
    "text": "Назови предмет, постройку или атрибут дачи и огорода",
    "count": 156,
    "strictShape": false
  },
  {
    "id": "art-arch-style",
    "text": "Назови архитектурный стиль или направление в искусстве",
    "count": 139,
    "strictShape": false
  },
  {
    "id": "game-console",
    "text": "Назови игровую приставку или консоль (любого поколения)",
    "count": 116,
    "strictShape": false
  },
  {
    "id": "round-object",
    "text": "Назови предмет или объект круглой / шарообразной формы",
    "count": 168,
    "strictShape": false
  },
  {
    "id": "russia-region",
    "text": "Назови республику, край или область России",
    "count": 85,
    "strictShape": false
  },
  {
    "id": "vitamin-hormone",
    "text": "Назови витамин, гормон или биологически активное вещество в организме",
    "count": 122,
    "strictShape": false
  },
  {
    "id": "tea-infusion",
    "text": "Назови сорт чая или травяного напитка",
    "count": 110,
    "strictShape": false
  },
  {
    "id": "camping-picnic-item",
    "text": "Назови вещь, которую берут с собой в поход или на пикник",
    "count": 160,
    "strictShape": false
  },
  {
    "id": "myth-egypt-slavic",
    "text": "Назови бога или существо из славянской, египетской или восточной мифологии",
    "count": 162,
    "strictShape": false
  },
  {
    "id": "game-studio",
    "text": "Назови известную студию разработки или издателя видеоигр",
    "count": 180,
    "strictShape": false
  },
  {
    "id": "hairstyle",
    "text": "Назови вид причёски или стрижки",
    "count": 120,
    "strictShape": false
  },
  {
    "id": "asia-country",
    "text": "Назови страну Азии",
    "count": 52,
    "strictShape": false
  },
  {
    "id": "horse-breed",
    "text": "Назови породу лошади",
    "count": 120,
    "strictShape": false
  },
  {
    "id": "caucasus-oriental-dish",
    "text": "Назови блюдо кавказской, турецкой или среднеазиатской кухни",
    "count": 157,
    "strictShape": false
  },
  {
    "id": "pharmacy-item",
    "text": "Назови предмет или популярное средство из домашней аптечки",
    "count": 164,
    "strictShape": false
  },
  {
    "id": "rank-title",
    "text": "Назови дворянский титул, воинское звание или исторический чин",
    "count": 154,
    "strictShape": false
  },
  {
    "id": "movie-genre",
    "text": "Назови жанр или поджанр кино",
    "count": 113,
    "strictShape": false
  },
  {
    "id": "superstition-omen",
    "text": "Назови популярную примету или суеверие",
    "count": 114,
    "strictShape": false
  },
  {
    "id": "landlocked-country",
    "text": "Назови страну, у которой нет выхода к Мировому океану",
    "count": 47,
    "strictShape": false
  },
  {
    "id": "file-extension",
    "text": "Назови формат файла или компьютерное расширение (например: PDF, MP3)",
    "count": 182,
    "strictShape": false
  },
  {
    "id": "alcohol-style",
    "text": "Назови вид алкогольного напитка, вина или пива (сорт, не бренд)",
    "count": 160,
    "strictShape": false
  },
  {
    "id": "beach-item",
    "text": "Назови вещь или объект, который можно увидеть на пляже",
    "count": 145,
    "strictShape": false
  },
  {
    "id": "music-term",
    "text": "Назови музыкальный термин или нотное обозначение (не жанр и не инструмент)",
    "count": 145,
    "strictShape": false
  },
  {
    "id": "ru-cartoon-char",
    "text": "Назови персонажа советского или российского мультфильма",
    "count": 193,
    "strictShape": false
  },
  {
    "id": "animal-nature-sound",
    "text": "Назови звук, который издаёт животное или природа (одним словом)",
    "count": 122,
    "strictShape": true
  },
  {
    "id": "americas-country",
    "text": "Назови страну Северной, Центральной или Южной Америки",
    "count": 45,
    "strictShape": false
  },
  {
    "id": "medical-specialty",
    "text": "Назови врачебную специальность",
    "count": 114,
    "strictShape": false
  },
  {
    "id": "pizza-topping",
    "text": "Назови популярную начинку или ингредиент для пиццы",
    "count": 126,
    "strictShape": false
  },
  {
    "id": "airport-plane-item",
    "text": "Назови предмет, место или явление в аэропорту и самолёте",
    "count": 145,
    "strictShape": false
  },
  {
    "id": "space-mission-phenom",
    "text": "Назови космическую миссию, телескоп, аппарат или астрономическое явление",
    "count": 144,
    "strictShape": false
  },
  {
    "id": "cs-term-map",
    "text": "Назови карту, оружие или термин из Counter-Strike (CS:GO / CS2)",
    "count": 160,
    "strictShape": false
  },
  {
    "id": "paired-thing",
    "text": "Назови вещь, которая обычно бывает парной (используется или носится парой)",
    "count": 117,
    "strictShape": false
  },
  {
    "id": "peninsula-cape",
    "text": "Назови полуостров или известный мыс на карте мира",
    "count": 134,
    "strictShape": false
  },
  {
    "id": "rock-mineral",
    "text": "Назови горную породу, минерал или полезное ископаемое (не драгоценный камень)",
    "count": 162,
    "strictShape": false
  },
  {
    "id": "cooking-method",
    "text": "Назови способ приготовления еды или кулинарный термин",
    "count": 136,
    "strictShape": false
  },
  {
    "id": "car-part",
    "text": "Назови деталь, узел или часть автомобиля",
    "count": 172,
    "strictShape": false
  },
  {
    "id": "literary-term",
    "text": "Назови литературный термин, троп или жанр",
    "count": 142,
    "strictShape": false
  },
  {
    "id": "internet-meme",
    "text": "Назови известный интернет-мем или мемного персонажа",
    "count": 174,
    "strictShape": false
  },
  {
    "id": "lateness-excuse",
    "text": "Назови типичную причину или отмазку, почему человек опоздал",
    "count": 110,
    "strictShape": false
  },
  {
    "id": "desert-plain",
    "text": "Назови пустыню, степь, долину или известный природный регион мира",
    "count": 135,
    "strictShape": false
  },
  {
    "id": "venomous-toxic",
    "text": "Назови ядовитое животное или растение",
    "count": 158,
    "strictShape": false
  },
  {
    "id": "breakfast-egg-dish",
    "text": "Назови популярное блюдо на завтрак или блюдо из яиц",
    "count": 120,
    "strictShape": false
  },
  {
    "id": "popular-gift",
    "text": "Назови популярный подарок на день рождения или Новый год",
    "count": 158,
    "strictShape": false
  },
  {
    "id": "symbol-key",
    "text": "Назови знак препинания, типографский символ или клавишу на клавиатуре",
    "count": 123,
    "strictShape": false
  },
  {
    "id": "witcher-skyrim",
    "text": "Назови персонажа, существо или место из «Ведьмака» или Skyrim (TES)",
    "count": 188,
    "strictShape": false
  },
  {
    "id": "light-source",
    "text": "Назови природный или искусственный источник света",
    "count": 128,
    "strictShape": false
  },
  {
    "id": "us-city",
    "text": "Назови город США (кроме Нью-Йорка и Лос-Анджелеса)",
    "count": 189,
    "strictShape": false
  },
  {
    "id": "chemical-compound",
    "text": "Назови известное химическое вещество, кислоту или соединение (не элемент)",
    "count": 176,
    "strictShape": false
  },
  {
    "id": "food-drink-brand",
    "text": "Назови известный бренд продуктов, сладостей или напитков из супермаркета",
    "count": 196,
    "strictShape": false
  },
  {
    "id": "building-type",
    "text": "Назови тип жилья, здания или постройки",
    "count": 142,
    "strictShape": false
  },
  {
    "id": "religion-belief",
    "text": "Назови религию, конфессию или духовное учение",
    "count": 108,
    "strictShape": false
  },
  {
    "id": "hockey-nba-f1-team",
    "text": "Назови команду НХЛ, КХЛ, НБА или Формулы-1",
    "count": 167,
    "strictShape": false
  },
  {
    "id": "workout-exercise",
    "text": "Назови физическое упражнение из спорта или тренажёрного зала",
    "count": 140,
    "strictShape": false
  },
  {
    "id": "europe-noncapital",
    "text": "Назови крупный город Европы (не столицу и не город РФ)",
    "count": 200,
    "strictShape": false
  },
  {
    "id": "primate-monkey",
    "text": "Назови вид обезьяны или другого примата",
    "count": 100,
    "strictShape": false
  },
  {
    "id": "it-network-term",
    "text": "Назови термин из IT, сетей или кибербезопасности (не язык программирования)",
    "count": 192,
    "strictShape": false
  },
  {
    "id": "hobby-activity",
    "text": "Назови популярное хобби или увлечение",
    "count": 165,
    "strictShape": false
  },
  {
    "id": "film-studio-award",
    "text": "Назови известную киностудию, кинопремию или кинофестиваль",
    "count": 141,
    "strictShape": false
  },
  {
    "id": "gamer-internet-slang",
    "text": "Назови популярное геймерское или интернет-сленговое слово",
    "count": 188,
    "strictShape": false
  },
  {
    "id": "palindrome-word",
    "text": "Назови русское слово-палиндром от 3 букв (читается одинаково в обе стороны)",
    "count": 110,
    "strictShape": true
  },
  {
    "id": "physics-law-particle",
    "text": "Назови закон физики, элементарную частицу или научный эффект",
    "count": 200,
    "strictShape": false
  },
  {
    "id": "gta-rdr-entity",
    "text": "Назови персонажа, город, место или банду из GTA или Red Dead Redemption",
    "count": 204,
    "strictShape": false
  },
  {
    "id": "ancient-wonder-ruin",
    "text": "Назови древний город, археологический памятник или утраченную цивилизацию",
    "count": 198,
    "strictShape": false
  },
  {
    "id": "great-invention",
    "text": "Назови великое изобретение или открытие в истории человечества",
    "count": 201,
    "strictShape": false
  },
  {
    "id": "historical-dynasty-order",
    "text": "Назови историческую династию, рыцарский орден или древний народ",
    "count": 199,
    "strictShape": false
  },
  {
    "id": "explorer-traveler",
    "text": "Назови известного мореплавателя, первооткрывателя или космонавта",
    "count": 198,
    "strictShape": false
  },
  {
    "id": "wild-cat-predator",
    "text": "Назови хищное млекопитающее (кошачьи, псовые, медведи, куньи и др.)",
    "count": 178,
    "strictShape": false
  },
  {
    "id": "cinema-term-role",
    "text": "Назови кинопрофессию, термин со съёмочной площадки или приём кино",
    "count": 192,
    "strictShape": false
  },
  {
    "id": "movie-franchise",
    "text": "Назови известную кинофраншизу или серию фильмов",
    "count": 202,
    "strictShape": false
  },
  {
    "id": "tv-series-char",
    "text": "Назови культового персонажа зарубежного или российского сериала",
    "count": 274,
    "strictShape": false
  },
  {
    "id": "famous-singer-solo",
    "text": "Назови легендарного сольного певца или певицу мира",
    "count": 259,
    "strictShape": false
  },
  {
    "id": "music-album-classic",
    "text": "Назови культовый музыкальный альбом (российский или зарубежный)",
    "count": 202,
    "strictShape": false
  },
  {
    "id": "soundtrack-composer-ost",
    "text": "Назови композитора, фильм или игру, известную легендарным саундтреком",
    "count": 199,
    "strictShape": false
  },
  {
    "id": "concert-audio-gear",
    "text": "Назови музыкальное/звуковое оборудование, носитель или элемент концерта",
    "count": 183,
    "strictShape": false
  },
  {
    "id": "famous-song-title",
    "text": "Назови всемирно известную песню или культовый русскоязычный хит",
    "count": 238,
    "strictShape": false
  },
  {
    "id": "music-fest-award",
    "text": "Назови музыкальный фестиваль, музыкальную премию или культовый лейбл",
    "count": 168,
    "strictShape": false
  },
  {
    "id": "fantasy-creature-race",
    "text": "Назови фэнтезийную расу или сказочное существо",
    "count": 190,
    "strictShape": false
  },
  {
    "id": "scifi-universe-ship",
    "text": "Назови культовую фантастическую вселенную, планету или космический корабль",
    "count": 195,
    "strictShape": false
  },
  {
    "id": "superpower-ability",
    "text": "Назови суперспособность или магическую силу",
    "count": 178,
    "strictShape": false
  },
  {
    "id": "rpg-tabletop-term",
    "text": "Назови класс персонажа, термин или механику из RPG и D&D",
    "count": 188,
    "strictShape": false
  },
  {
    "id": "finance-econ-term",
    "text": "Назови термин из экономики, финансов или бизнеса",
    "count": 198,
    "strictShape": false
  },
  {
    "id": "retail-marketplace-bank",
    "text": "Назови известный банк, маркетплейс или торговую сеть",
    "count": 198,
    "strictShape": false
  },
  {
    "id": "airline-delivery-brand",
    "text": "Назови авиакомпанию, сервис доставки, такси или оператора связи",
    "count": 182,
    "strictShape": false
  },
  {
    "id": "crypto-tech-company",
    "text": "Назови крупную IT-корпорацию, платёжную систему или криптовалюту",
    "count": 188,
    "strictShape": false
  },
  {
    "id": "luxury-watch-perfume",
    "text": "Назови бренд часов, парфюмерии, косметики или люксовой моды",
    "count": 195,
    "strictShape": false
  },
  {
    "id": "business-job-role",
    "text": "Назови офисную, IT или бизнес-должность / специальность",
    "count": 182,
    "strictShape": false
  },
  {
    "id": "foreign-greeting-phrase",
    "text": "Назови приветствие, «спасибо» или известную фразу на иностранном языке",
    "count": 172,
    "strictShape": false
  },
  {
    "id": "national-costume-item",
    "text": "Назови предмет национальной одежды, головной убор или атрибут культуры мира",
    "count": 160,
    "strictShape": false
  },
  {
    "id": "world-folk-festival",
    "text": "Назови известный мировой фестиваль, народный праздник, карнавал или культурный обряд",
    "count": 169,
    "strictShape": false
  },
  {
    "id": "proverb-idiom-ru",
    "text": "Назови известную русскую пословицу, поговорку или фразеологизм",
    "count": 209,
    "strictShape": false
  },
  {
    "id": "math-term-theorem",
    "text": "Назови математический термин, теорему или понятие",
    "count": 198,
    "strictShape": false
  },
  {
    "id": "famous-author",
    "text": "Назови известного русского или зарубежного писателя / поэта",
    "count": 259,
    "strictShape": false
  },
  {
    "id": "biology-cell-term",
    "text": "Назови термин из биологии, генетики или эволюции",
    "count": 201,
    "strictShape": false
  },
  {
    "id": "grammar-ru-term",
    "text": "Назови термин из русского языка, грамматики или лингвистики",
    "count": 187,
    "strictShape": false
  },
  {
    "id": "retro-gadget-90s",
    "text": "Назови ретро-гаджет, носитель или культовую вещь из 80-х–2000-х",
    "count": 172,
    "strictShape": false
  },
  {
    "id": "tv-show-90s-2000s",
    "text": "Назови культовую телепередачу или телешоу 90-х и 2000-х",
    "count": 181,
    "strictShape": false
  },
  {
    "id": "nostalgia-snack-90s",
    "text": "Назови культовую сладость, жвачку, еду или напиток из детства 90-х–2000-х",
    "count": 189,
    "strictShape": false
  },
  {
    "id": "old-internet-2000s",
    "text": "Назови культовый сайт, программу или явление старого интернета 90-х–2000-х",
    "count": 181,
    "strictShape": false
  },
  {
    "id": "ussr-everyday-item",
    "text": "Назови культовую вещь из советской квартиры или быта",
    "count": 172,
    "strictShape": false
  },
  {
    "id": "school-90s-childhood",
    "text": "Назови атрибут школьной жизни или дворового детства",
    "count": 174,
    "strictShape": false
  },
  {
    "id": "nostalgia-cartoon-series-90s",
    "text": "Назови культовый мультсериал или сериал из детства 90-х и 2000-х",
    "count": 214,
    "strictShape": false
  },
  {
    "id": "famous-athlete",
    "text": "Назови легендарного спортсмена (футбол, бокс, ММА, теннис, Ф1, баскетбол, хоккей и др.)",
    "count": 257,
    "strictShape": false
  }
].map((p) => Object.assign(p, { answers: null }));

  const pendingLoads = Object.create(null);

  function isPromptLoaded(p) {
    return Boolean(p && Array.isArray(p.answers) && p.answers.length > 0);
  }

  function fetchChunkWithRetry(promptId, attempt = 0) {
    const opts = attempt > 0 ? { cache: 'reload' } : undefined;
    return fetch(`./db/${encodeURIComponent(promptId)}.json?v=20261120c`, opts)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${promptId}`);
        return res.json();
      })
      .catch((err) => {
        if (attempt < 2) {
          return new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)))
            .then(() => fetchChunkWithRetry(promptId, attempt + 1));
        }
        throw err;
      });
  }

  async function loadPromptAnswers(promptId) {
    const prompt = PROMPTS.find((p) => p.id === promptId);
    if (!prompt) return [];
    if (isPromptLoaded(prompt)) return prompt.answers;
    if (pendingLoads[promptId]) return pendingLoads[promptId];

    pendingLoads[promptId] = fetchChunkWithRetry(promptId, 0)
      .then((raw) => {
        const built = buildAnswers(raw);
        if (!built.length) throw new Error(`Empty dataset for ${promptId}`);
        prompt.answers = built;
        prompt.count = built.length;
        delete prompt._index;
        delete pendingLoads[promptId];
        return built;
      })
      .catch((err) => {
        console.error('[krillion] Failed loading chunk:', promptId, err);
        delete pendingLoads[promptId];
        if (!isPromptLoaded(prompt)) prompt.answers = null;
        return prompt.answers || [];
      });
    return pendingLoads[promptId];
  }

  const preloadQueue = [];
  let activePreloads = 0;

  function pumpPreloadQueue() {
    while (activePreloads < 2 && preloadQueue.length > 0) {
      const id = preloadQueue.shift();
      const p = PROMPTS.find((x) => x.id === id);
      if (!p || isPromptLoaded(p) || pendingLoads[id]) continue;
      activePreloads += 1;
      Promise.resolve(loadPromptAnswers(id)).finally(() => {
        activePreloads -= 1;
        pumpPreloadQueue();
      });
    }
  }

  function preloadPrompts(promptList) {
    if (!Array.isArray(promptList)) return;
    promptList.forEach((item) => {
      const id = typeof item === 'string' ? item : (item && item.id);
      if (id && !preloadQueue.includes(id)) preloadQueue.push(id);
    });
    pumpPreloadQueue();
  }

  const EPOCH_UTC = Date.UTC(2026, 10, 6);

  function getTodayDiveNumber() {
    const now = new Date();
    const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const diffDays = Math.round((todayUtc - EPOCH_UTC) / 86400000);
    return Math.max(1, diffDays + 1);
  }

  function getDiveDateLabel(diveNumber) {
    const d = new Date(2026, 10, 6 + (diveNumber - 1));
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function seededRandom(seed) {
    let s = (seed * 1664525 + 1013904223) >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function shuffleWithSeed(arr, seed) {
    const rng = seededRandom(seed);
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }

  const PROMPT_BY_ID = Object.create(null);
  PROMPTS.forEach((p) => { PROMPT_BY_ID[p.id] = p; });

  // Fixed daily schedule for the first 15 days (#1-#15 remain untouched in archive)
  const LOCKED_DAILY_SCHEDULE = [
    /* #01 */ ["mythology-greek-norse","minecraft-mob-item","classical-composer","vegetable-green","programming-lang","tree-shrub","snake-reptile"],
    /* #02 */ ["childhood-toy-game","phobia-fear","cities-suffix","clothing-item","cosmetics-hygiene","cat-breed","cheese-type"],
    /* #03 */ ["martial-art","sea-or-ocean","world-language","space-object","ancient-state","bird-name","furniture-interior"],
    /* #04 */ ["hotel-forgotten","white-inside","weapon-armor","soviet-cartoon","social-app-site","vowel-country","mushroom-name"],
    /* #05 */ ["tech-brand","harry-potter","anime-title","bread-pastry","world-capital","insect-bug","soup-dish"],
    /* #06 */ ["tool-hardware","comic-hero-villain","fairy-tale-folk","geometric-shape","talking-animal-movie","dance-style","dessert-sweet"],
    /* #07 */ ["pasta-shape","word-double-letter","horror-movie","building-landmark","famous-salad","chemical-element","world-lake-strait"],
    /* #08 */ ["food-ends-o","pokemon-creature","currency-world","football-club","word-same-edge","lord-of-rings","rock-pop-band"],
    /* #09 */ ["kitchen-item","sea-creature","physical-unit","color-shade","retro-console-game","word-4-letters","sports-gear"],
    /* #10 */ ["dog-breed","school-subject","game-genre","holiday-tradition","jewelry-accessory","sport-no-ball","stationery-item"],
    /* #11 */ ["greek-letter-symbol","mountain-range","transport-vehicle","berry-fruit","painter-artist","pixar-disney-char","dinosaur-prehistoric"],
    /* #12 */ ["weather-phenomenon","animal-8plus","moscow-spb-metro","fabric-material","meat-charcuterie","star-wars","open-world-game"],
    /* #13 */ ["island-world","music-genre","anime-character","animated-series","scientist-inventor","video-game-char","historical-ruler"],
    /* #14 */ ["one-syllable-noun","human-emotion","body-organ-bone","electronic-gadget","fastfood-chain","russian-literature","sci-fi-fantasy-movie"],
    /* #15 */ ["musical-instrument","europe-country","spice-herb","moba-hero-shooter","car-brand","tv-series-hit","russia-city-million"]
  ];

  // 16 themed Expedition campaign levels (7 questions each = 112 new topics)
  const EXPEDITIONS = [
    {
      id: 'geo-countries', num: 1, title: 'География и страны', short: 'География',
      icon: '🌍', accent: '#4de3ff', desc: 'Штаты США, страны мира, регионы России, полуострова и мысы',
      promptIds: ['us-state', 'africa-country', 'asia-country', 'americas-country', 'landlocked-country', 'russia-region', 'peninsula-cape']
    },
    {
      id: 'science-space', num: 2, title: 'Наука и космос', short: 'Наука и космос',
      icon: '🔬', accent: '#a78bfa', desc: 'Созвездия, миссии, химия, минералы, витамины, свет и законы физики',
      promptIds: ['constellation', 'space-mission-phenom', 'chemical-compound', 'rock-mineral', 'vitamin-hormone', 'light-source', 'physics-law-particle']
    },
    {
      id: 'food-cuisine', num: 3, title: 'Еда и кухня мира', short: 'Еда и кухня',
      icon: '🍜', accent: '#ffb347', desc: 'Крупы, кухни Азии и Кавказа, чай, пицца, готовка и завтраки',
      promptIds: ['grain-porridge', 'asian-dish', 'caucasus-oriental-dish', 'tea-infusion', 'pizza-topping', 'cooking-method', 'breakfast-egg-dish']
    },
    {
      id: 'games-it', num: 4, title: 'Игры и IT', short: 'Игры и IT',
      icon: '🎮', accent: '#34d399', desc: 'Консоли, студии, CS, GTA/RDR, форматы файлов, сети и игровой сленг',
      promptIds: ['game-console', 'game-studio', 'cs-term-map', 'gta-rdr-entity', 'file-extension', 'it-network-term', 'gamer-internet-slang']
    },
    {
      id: 'history-civs', num: 5, title: 'История и цивилизации', short: 'История',
      icon: '🏛️', accent: '#f5c451', desc: 'Философы, титулы, стили искусства, древние руины, изобретения и династии',
      promptIds: ['philosopher', 'rank-title', 'art-arch-style', 'ancient-wonder-ruin', 'great-invention', 'historical-dynasty-order', 'explorer-traveler']
    },
    {
      id: 'nature-wildlife', num: 6, title: 'Природа и живой мир', short: 'Природа',
      icon: '🌿', accent: '#4ade80', desc: 'Пресноводные рыбы, лошади, приматы, ядовитые виды, пустыни и хищники',
      promptIds: ['freshwater-fish', 'horse-breed', 'primate-monkey', 'venomous-toxic', 'animal-nature-sound', 'desert-plain', 'wild-cat-predator']
    },
    {
      id: 'travel-road', num: 7, title: 'Дорога и путешествия', short: 'Путешествия',
      icon: '✈️', accent: '#38bdf8', desc: 'Бардачок и детали авто, самолёт, пляж, поход, города США и Европы',
      promptIds: ['car-trunk-glovebox', 'car-part', 'airport-plane-item', 'beach-item', 'camping-picnic-item', 'us-city', 'europe-noncapital']
    },
    {
      id: 'cinema-tv', num: 8, title: 'Кино и сериалы', short: 'Кино и сериалы',
      icon: '🎬', accent: '#fb7185', desc: 'Злодеи, жанры, наши мультфильмы, студии, кинотермины, франшизы и герои',
      promptIds: ['movie-villain', 'movie-genre', 'ru-cartoon-char', 'film-studio-award', 'cinema-term-role', 'movie-franchise', 'tv-series-char']
    },
    {
      id: 'music-world', num: 9, title: 'Мир музыки', short: 'Музыка',
      icon: '🎵', accent: '#f472b6', desc: 'Термины, певцы, культовые альбомы, саундтреки, звук, хиты и фестивали',
      promptIds: ['music-term', 'famous-singer-solo', 'music-album-classic', 'soundtrack-composer-ost', 'concert-audio-gear', 'famous-song-title', 'music-fest-award']
    },
    {
      id: 'fantasy-geek', num: 10, title: 'Фэнтези и гик-культура', short: 'Фэнтези и гик',
      icon: '🐉', accent: '#c084fc', desc: 'Ведьмак и Skyrim, мифы, мемы, расы фэнтези, sci-fi, суперсилы и RPG',
      promptIds: ['witcher-skyrim', 'myth-egypt-slavic', 'internet-meme', 'fantasy-creature-race', 'scifi-universe-ship', 'superpower-ability', 'rpg-tabletop-term']
    },
    {
      id: 'economy-brands', num: 11, title: 'Экономика и бренды', short: 'Экономика и бренды',
      icon: '💼', accent: '#fbbf24', desc: 'Супермаркет, финансы, банки и маркетплейсы, доставка, IT-гиганты и люкс',
      promptIds: ['food-drink-brand', 'finance-econ-term', 'retail-marketplace-bank', 'airline-delivery-brand', 'crypto-tech-company', 'luxury-watch-perfume', 'business-job-role']
    },
    {
      id: 'languages-traditions', num: 12, title: 'Языки и традиции мира', short: 'Языки и традиции',
      icon: '🏮', accent: '#2dd4bf', desc: 'Религии, приметы, напитки, иностранные фразы, костюмы, праздники и пословицы',
      promptIds: ['religion-belief', 'superstition-omen', 'alcohol-style', 'foreign-greeting-phrase', 'national-costume-item', 'world-folk-festival', 'proverb-idiom-ru']
    },
    {
      id: 'school-facts', num: 13, title: 'Школа и эрудиция', short: 'Школа и эрудиция',
      icon: '📚', accent: '#60a5fa', desc: 'Литература, палиндромы, символы, математика, писатели, биология и грамматика',
      promptIds: ['literary-term', 'palindrome-word', 'symbol-key', 'math-term-theorem', 'famous-author', 'biology-cell-term', 'grammar-ru-term']
    },
    {
      id: 'nostalgia-90s', num: 14, title: 'Ностальгия 90-х и 2000-х', short: 'Ностальгия 90-х',
      icon: '📼', accent: '#fb923c', desc: 'Тамагочи и пейджеры, телешоу, вкусняшки, старый рунет, СССР, двор и мультики',
      promptIds: ['retro-gadget-90s', 'tv-show-90s-2000s', 'nostalgia-snack-90s', 'old-internet-2000s', 'ussr-everyday-item', 'school-90s-childhood', 'nostalgia-cartoon-series-90s']
    },
    {
      id: 'sport-health', num: 15, title: 'Спорт, здоровье и хобби', short: 'Спорт и здоровье',
      icon: '🏅', accent: '#a3e635', desc: 'Спорт с мячом, клубы НХЛ/НБА/Ф1, упражнения, врачи, аптечка, хобби и легенды',
      promptIds: ['ball-sport', 'hockey-nba-f1-team', 'workout-exercise', 'medical-specialty', 'pharmacy-item', 'hobby-activity', 'famous-athlete']
    },
    {
      id: 'home-life', num: 16, title: 'Дом, быт и ассоциации', short: 'Быт и ассоциации',
      icon: '🏠', accent: '#67e8f9', desc: 'Дача, типы жилья, круглое и парное, отмазки, подарки и причёски',
      promptIds: ['dacha-garden-item', 'building-type', 'round-object', 'paired-thing', 'lateness-excuse', 'popular-gift', 'hairstyle']
    }
  ];

  const EXPEDITION_BY_ID = Object.create(null);
  const PROMPT_EXPEDITION_GROUP = Object.create(null);
  EXPEDITIONS.forEach((exp) => {
    EXPEDITION_BY_ID[exp.id] = exp;
    exp.promptIds.forEach((pid) => { PROMPT_EXPEDITION_GROUP[pid] = exp.id; });
  });

  function getExpedition(id) {
    return EXPEDITION_BY_ID[id] || null;
  }

  function getExpeditionPrompts(id) {
    const exp = getExpedition(id);
    if (!exp) return [];
    return exp.promptIds.map((pid) => PROMPT_BY_ID[pid]).filter(Boolean);
  }

  // Daily dives stay classic balanced mixes (no theme lock on daily/archive)
  function getDiveTheme() {
    return null;
  }

  // Build deterministic mixed deck for Days #16-#33 from all 130 unplayed topics (112 new + 18 remaining original)
  // Interleaved across categories so every day has a varied mix with zero same-expedition clustering.
  let FIRST_MIXED_DECK = null;
  function getFirstMixedDeck() {
    if (FIRST_MIXED_DECK) return FIRST_MIXED_DECK;
    const lockedSet = new Set(LOCKED_DAILY_SCHEDULE.flat());
    const unplayed = PROMPTS.filter((p) => !lockedSet.has(p.id));
    const shuffled = shuffleWithSeed(unplayed, 20261121);

    // Greedy anti-clustering: pick next prompt whose expedition group is not yet in the current 7-question day
    const remaining = shuffled.slice();
    const ordered = [];
    while (remaining.length > 0) {
      const dayGroups = new Set();
      for (let slot = 0; slot < 7 && remaining.length > 0; slot++) {
        let pickIdx = remaining.findIndex((p) => {
          const g = PROMPT_EXPEDITION_GROUP[p.id];
          return !g || !dayGroups.has(g);
        });
        if (pickIdx === -1) pickIdx = 0;
        const picked = remaining.splice(pickIdx, 1)[0];
        if (PROMPT_EXPEDITION_GROUP[picked.id]) dayGroups.add(PROMPT_EXPEDITION_GROUP[picked.id]);
        ordered.push(picked);
      }
    }
    FIRST_MIXED_DECK = ordered;
    return FIRST_MIXED_DECK;
  }

  const EPOCH_CACHE = Object.create(null);

  function getEpochDeck(epoch) {
    if (EPOCH_CACHE[epoch]) return EPOCH_CACHE[epoch];
    const deck = shuffleWithSeed(PROMPTS, (epoch + 1) * 7919 + 424242);
    const deckSize = Math.floor(PROMPTS.length / 7);
    const usableLen = deckSize * 7;
    const span = Math.min(70, Math.floor(usableLen / 2));

    let cooldownIds;
    if (epoch === 0) {
      // Avoid repeating the last 10 days of the initial #16-#33 mixed run
      const firstMixed = getFirstMixedDeck();
      cooldownIds = new Set(firstMixed.slice(Math.max(0, 18 * 7 - 70), 18 * 7).map((p) => p.id));
    } else {
      const prevDeck = getEpochDeck(epoch - 1);
      cooldownIds = new Set(prevDeck.slice(Math.max(0, usableLen - span), usableLen).map((p) => p.id));
    }

    let swapIdx = span;
    for (let i = 0; i < span; i++) {
      if (!cooldownIds.has(deck[i].id)) continue;
      while (swapIdx < usableLen && cooldownIds.has(deck[swapIdx].id)) swapIdx += 1;
      if (swapIdx >= usableLen) break;
      const tmp = deck[i];
      deck[i] = deck[swapIdx];
      deck[swapIdx] = tmp;
      swapIdx += 1;
    }

    if (epoch === 0) {
      // Surface the remaining 4 leftover topics from the 130-topic unplayed pool at the start of Day #34
      const leftover = getFirstMixedDeck().slice(18 * 7);
      let frontIdx = 0;
      for (const p of leftover) {
        const pos = deck.findIndex((x) => x.id === p.id);
        if (pos > frontIdx) {
          const tmp = deck[frontIdx];
          deck[frontIdx] = deck[pos];
          deck[pos] = tmp;
        }
        if (pos !== -1) frontIdx += 1;
      }
    }

    EPOCH_CACHE[epoch] = deck;
    return deck;
  }

  function getDailyPrompts(diveNumber) {
    if (diveNumber >= 1 && diveNumber <= LOCKED_DAILY_SCHEDULE.length) {
      const ids = LOCKED_DAILY_SCHEDULE[diveNumber - 1];
      const resolved = ids.map((id) => PROMPT_BY_ID[id]).filter(Boolean);
      if (resolved.length === 7) return resolved;
    }
    const postIdx = Math.max(0, diveNumber - 1 - LOCKED_DAILY_SCHEDULE.length);
    const firstDays = 18; // #16..#33 = 18 fresh mixed days (126 topics)
    if (postIdx < firstDays) {
      return getFirstMixedDeck().slice(postIdx * 7, postIdx * 7 + 7);
    }
    const cycleIdx = postIdx - firstDays;
    const deckSize = Math.floor(PROMPTS.length / 7);
    const epoch = Math.floor(cycleIdx / deckSize);
    const dayInEpoch = cycleIdx % deckSize;
    return getEpochDeck(epoch).slice(dayInEpoch * 7, dayInEpoch * 7 + 7);
  }

  window.KRILLION_DATA = {
    TIERS,
    TIER_ORDER,
    BUDDIES,
    AMBIENT_MARKERS,
    PROMPTS,
    EXPEDITIONS,
    loadPromptAnswers,
    preloadPrompts,
    getTodayDiveNumber,
    getDiveDateLabel,
    getDailyPrompts,
    getDiveTheme,
    getExpedition,
    getExpeditionPrompts
  };
})();
