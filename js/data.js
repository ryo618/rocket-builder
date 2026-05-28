var G = window.G || {};
window.G = G;

G.RARITY = {
  1: { name: 'Common', color: '#9e9e9e', bg: '#3a3a3a', rate: 0.60, baseFail: 0.15 },
  2: { name: 'Uncommon', color: '#4caf50', bg: '#1b3a1b', rate: 0.25, baseFail: 0.08 },
  3: { name: 'Rare', color: '#2196f3', bg: '#0d2a4a', rate: 0.10, baseFail: 0.03 },
  4: { name: 'Epic', color: '#9c27b0', bg: '#2a0d3a', rate: 0.04, baseFail: 0.01 },
  5: { name: 'Legendary', color: '#ff9800', bg: '#3a2a0d', rate: 0.01, baseFail: 0.003 },
};

G.STAR = (n) => '★'.repeat(n);

G.CATEGORIES = ['engine', 'tank', 'structure', 'fairing', 'payload'];

G.PARTS = {
  engine: [
    { id: 'e1a', name: 'KR-1 ベーシック', rarity: 1, vacuumThrust: 55, seaLevelThrust: 42, isp: 245, massFlowRate: 22.9, dryMass: 220, maxBurnTime: 180, maxAccel: 8 },
    { id: 'e1b', name: 'KR-1S スラスター', rarity: 1, vacuumThrust: 40, seaLevelThrust: 30, isp: 265, massFlowRate: 15.4, dryMass: 180, maxBurnTime: 240, maxAccel: 6 },
    { id: 'e2a', name: 'MV-20 ブースト', rarity: 2, vacuumThrust: 90, seaLevelThrust: 72, isp: 275, massFlowRate: 33.4, dryMass: 190, maxBurnTime: 200, maxAccel: 10 },
    { id: 'e2b', name: 'MV-20E エコノミー', rarity: 2, vacuumThrust: 65, seaLevelThrust: 50, isp: 295, massFlowRate: 22.5, dryMass: 160, maxBurnTime: 280, maxAccel: 8 },
    { id: 'e3a', name: 'HX-300 パワー', rarity: 3, vacuumThrust: 135, seaLevelThrust: 110, isp: 305, massFlowRate: 45.2, dryMass: 155, maxBurnTime: 220, maxAccel: 12 },
    { id: 'e3b', name: 'HX-300V バキューム', rarity: 3, vacuumThrust: 100, seaLevelThrust: 70, isp: 330, massFlowRate: 30.9, dryMass: 130, maxBurnTime: 300, maxAccel: 10 },
    { id: 'e4a', name: 'RG-X リジェネ', rarity: 4, vacuumThrust: 195, seaLevelThrust: 170, isp: 330, massFlowRate: 60.3, dryMass: 125, maxBurnTime: 260, maxAccel: 15 },
    { id: 'e4b', name: 'RG-X ハイIsp', rarity: 4, vacuumThrust: 150, seaLevelThrust: 120, isp: 355, massFlowRate: 43.1, dryMass: 100, maxBurnTime: 350, maxAccel: 12 },
    { id: 'e5a', name: 'NOVA-9 ラプター', rarity: 5, vacuumThrust: 270, seaLevelThrust: 240, isp: 355, massFlowRate: 77.6, dryMass: 85, maxBurnTime: 300, maxAccel: 20 },
    { id: 'e5b', name: 'NOVA-9V イオン', rarity: 5, vacuumThrust: 200, seaLevelThrust: 150, isp: 380, massFlowRate: 53.7, dryMass: 65, maxBurnTime: 400, maxAccel: 15 },
  ],
  tank: [
    { id: 't1a', name: 'FT-S 標準タンク', rarity: 1, propellantCapacity: 2200, dryMass: 320, propellantType: 'RP-1/LOX', maxQAlpha: 30000, maxAxialAccel: 8 },
    { id: 't1b', name: 'FT-S 軽量タンク', rarity: 1, propellantCapacity: 1600, dryMass: 240, propellantType: 'RP-1/LOX', maxQAlpha: 25000, maxAxialAccel: 7 },
    { id: 't2a', name: 'FT-M 中型タンク', rarity: 2, propellantCapacity: 3200, dryMass: 360, propellantType: 'RP-1/LOX', maxQAlpha: 40000, maxAxialAccel: 10 },
    { id: 't2b', name: 'FT-M コンパクト', rarity: 2, propellantCapacity: 2400, dryMass: 260, propellantType: 'LH2/LOX', maxQAlpha: 35000, maxAxialAccel: 9 },
    { id: 't3a', name: 'FT-L 大型タンク', rarity: 3, propellantCapacity: 4800, dryMass: 420, propellantType: 'RP-1/LOX', maxQAlpha: 55000, maxAxialAccel: 12 },
    { id: 't3b', name: 'FT-L 効率タンク', rarity: 3, propellantCapacity: 3800, dryMass: 300, propellantType: 'LH2/LOX', maxQAlpha: 50000, maxAxialAccel: 11 },
    { id: 't4a', name: 'FT-XL メガタンク', rarity: 4, propellantCapacity: 6500, dryMass: 420, propellantType: 'CH4/LOX', maxQAlpha: 70000, maxAxialAccel: 15 },
    { id: 't4b', name: 'FT-XL ウルトラライト', rarity: 4, propellantCapacity: 5000, dryMass: 300, propellantType: 'LH2/LOX', maxQAlpha: 65000, maxAxialAccel: 14 },
    { id: 't5a', name: 'FT-Z アブソリュート', rarity: 5, propellantCapacity: 8500, dryMass: 380, propellantType: 'CH4/LOX', maxQAlpha: 90000, maxAxialAccel: 20 },
    { id: 't5b', name: 'FT-Z フェザー', rarity: 5, propellantCapacity: 6500, dryMass: 250, propellantType: 'LH2/LOX', maxQAlpha: 85000, maxAxialAccel: 18 },
  ],
  structure: [
    { id: 's1', name: 'IS-1 鉄骨フレーム', rarity: 1, dryMass: 110, connectionStrength: 100, maxQAlpha: 25000, maxAxialAccel: 7 },
    { id: 's2', name: 'IS-2 アルミフレーム', rarity: 2, dryMass: 85, connectionStrength: 150, maxQAlpha: 35000, maxAxialAccel: 9 },
    { id: 's3', name: 'IS-3 合金フレーム', rarity: 3, dryMass: 62, connectionStrength: 220, maxQAlpha: 50000, maxAxialAccel: 12 },
    { id: 's4', name: 'IS-4 CFRP フレーム', rarity: 4, dryMass: 42, connectionStrength: 300, maxQAlpha: 70000, maxAxialAccel: 16 },
    { id: 's5', name: 'IS-5 ナノカーボン', rarity: 5, dryMass: 22, connectionStrength: 450, maxQAlpha: 95000, maxAxialAccel: 22 },
  ],
  fairing: [
    { id: 'f1', name: 'NF-1 標準フェアリング', rarity: 1, dryMass: 160, dragCoefficient: 0.50, referenceArea: 2.2, maxDynamicPressure: 25000 },
    { id: 'f2', name: 'NF-2 流線型', rarity: 2, dryMass: 125, dragCoefficient: 0.43, referenceArea: 2.0, maxDynamicPressure: 35000 },
    { id: 'f3', name: 'NF-3 空力最適化', rarity: 3, dryMass: 92, dragCoefficient: 0.37, referenceArea: 1.8, maxDynamicPressure: 50000 },
    { id: 'f4', name: 'NF-4 超軽量', rarity: 4, dryMass: 58, dragCoefficient: 0.32, referenceArea: 1.6, maxDynamicPressure: 70000 },
    { id: 'f5', name: 'NF-5 ステルス', rarity: 5, dryMass: 30, dragCoefficient: 0.26, referenceArea: 1.4, maxDynamicPressure: 95000 },
  ],
  payload: [
    { id: 'p1', name: 'SAT-1 キューブサット', rarity: 1, mass: 50, scoreMultiplier: 1.0, maxAccel: 8 },
    { id: 'p2', name: 'SAT-2 小型観測衛星', rarity: 2, mass: 120, scoreMultiplier: 1.2, maxAccel: 10 },
    { id: 'p3', name: 'SAT-3 通信衛星', rarity: 3, mass: 250, scoreMultiplier: 1.5, maxAccel: 13 },
    { id: 'p4', name: 'SAT-4 地球観測衛星', rarity: 4, mass: 400, scoreMultiplier: 2.0, maxAccel: 16 },
    { id: 'p5', name: 'SAT-5 宇宙望遠鏡', rarity: 5, mass: 600, scoreMultiplier: 3.0, maxAccel: 22 },
  ],
};

G.ALL_PARTS = [];
for (const cat of G.CATEGORIES) {
  for (const p of G.PARTS[cat]) {
    p.category = cat;
    G.ALL_PARTS.push(p);
  }
}

G.getPartById = (id) => G.ALL_PARTS.find(p => p.id === id);

G.SITES = [
  { id: 'lv1', level: 1, name: '赤道直下射点', lat: 0, desc: '赤道直下の仮想射点。最も有利な地球自転速度。', multiplier: 1.0, unlockScore: 0, features: ['目標高度', '衛星選択'], limitsEnabled: false },
  { id: 'lv2', level: 2, name: '低緯度射点', lat: 10, desc: '低緯度の発射場。傾斜角の設定が可能。', multiplier: 1.2, unlockScore: 500, features: ['+ 目標傾斜角'], limitsEnabled: false },
  { id: 'lv3', level: 3, name: '中緯度射点', lat: 30, desc: '中緯度の発射場。軌道種別の選択が可能。', multiplier: 1.5, unlockScore: 2000, features: ['+ 軌道種別選択'], limitsEnabled: false },
  { id: 'lv35', level: 3.5, name: '訓練射点（高負荷）', lat: 30, desc: '運用限界が有効化。パーツの破損が発生。', multiplier: 1.8, unlockScore: 5000, features: ['+ 運用限界有効'], limitsEnabled: true },
  { id: 'lv4', level: 4, name: '高緯度射点', lat: 50, desc: 'ピッチレートの手動調整が可能。', multiplier: 2.2, unlockScore: 12000, features: ['+ ピッチレート調整'], limitsEnabled: true },
  { id: 'lv5', level: 5, name: '種子島宇宙センター', lat: 30.4, desc: '実在射点。落下域制約あり。', multiplier: 3.0, unlockScore: 30000, features: ['+ 落下域制約'], limitsEnabled: true },
];

G.ORBIT_TYPES = [
  { id: 'ballistic', name: '弾道飛行', minAlt: 0, maxAlt: 199, multiplier: 0.1 },
  { id: 'leo', name: 'LEO', minAlt: 200, maxAlt: 500, multiplier: 1.0 },
  { id: 'meo', name: 'MEO', minAlt: 501, maxAlt: 2000, multiplier: 1.5 },
  { id: 'sso', name: 'SSO (太陽同期)', minAlt: 600, maxAlt: 800, multiplier: 2.0 },
  { id: 'gto', name: 'GTO (静止遷移)', minAlt: 250, maxAlt: 35786, multiplier: 3.0 },
];

G.PHYSICS = {
  G: 6.674e-11,
  M_EARTH: 5.972e24,
  R_EARTH: 6.371e6,
  MU: 3.986e14,
  g0: 9.80665,
  RHO_0: 1.225,
  H_SCALE: 8500,
  EARTH_ROTATION: 465.1,
};

G.DEFAULT_PARTS = ['e1a', 't1a', 'e1b', 't1b', 's1', 'f1', 'p1'];

G.DEFAULT_ROCKET = {
  stages: [
    { engine: 'e1a', tank: 't1a' },
    { engine: 'e1b', tank: 't1b' }
  ],
  structure: 's1',
  fairing: 'f1',
  payload: 'p1',
  stageCount: 2
};

G.DEFAULT_INVENTORY = ['e1a', 't1a', 'e1b', 't1b', 's1', 'f1', 'p1'];
G.MAX_STAGES = 3;

G.GACHA_PITY = 100;
G.GACHA_WEEKLY_TICKET_DAYS = 7;
G.GACHA_MONTHLY_TICKET_DAYS = 30;
