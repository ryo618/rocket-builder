var G = window.G || {};
window.G = G;

G.State = {
  _data: null,

  _defaults() {
    return {
      playerName: 'パイロット',
      coins: 0,
      tickets: 0,
      loginStreak: 0,
      lastLoginDate: null,
      dailyGachaUsed: false,
      totalGachaPulls: 0,
      pityCounter: 0,
      inventory: [...G.DEFAULT_INVENTORY],
      rocket: JSON.parse(JSON.stringify(G.DEFAULT_ROCKET)),
      targetAltitude: 300,
      targetInclination: 0,
      targetOrbitType: 'leo',
      selectedSite: 'lv1',
      highScore: 0,
      totalScore: 0,
      totalLaunches: 0,
      successfulLaunches: 0,
      unlockedSites: ['lv1'],
      flights: [],
      workspaceLayout: null,
      createdAt: Date.now(),
    };
  },

  init() {
    const saved = localStorage.getItem('rocketGame');
    if (saved) {
      try {
        this._data = { ...this._defaults(), ...JSON.parse(saved) };
      } catch {
        this._data = this._defaults();
      }
    } else {
      this._data = this._defaults();
    }

    if (this._data.rocket && !this._data.rocket.stages) {
      const old = this._data.rocket;
      this._data.rocket = {
        stages: [
          { engine: old.engine || 'e1a', tank: old.tank || 't1a' },
          { engine: 'e1b', tank: 't1b' }
        ],
        structures: [old.structure || 's1'],
        fairing: old.fairing || 'f1',
        payload: old.payload || 'p1',
        obc: 'obc1',
        stageCount: 2
      };
      ['e1b', 't1b', 'obc1'].forEach(id => {
        if (!this._data.inventory.includes(id)) this._data.inventory.push(id);
      });
    }

    // Migrate structure → structures array and add obc
    if (this._data.rocket && this._data.rocket.structure && !this._data.rocket.structures) {
      const sc = this._data.rocket.stageCount || 2;
      this._data.rocket.structures = [];
      for (let i = 0; i < sc - 1; i++) {
        this._data.rocket.structures.push(this._data.rocket.structure);
      }
      delete this._data.rocket.structure;
    }
    if (this._data.rocket && !this._data.rocket.obc) {
      this._data.rocket.obc = 'obc1';
      if (!this._data.inventory.includes('obc1')) this._data.inventory.push('obc1');
    }

    this._checkDailyLogin();
    this.save();
  },

  save() {
    localStorage.setItem('rocketGame', JSON.stringify(this._data));
  },

  get(key) {
    return this._data[key];
  },

  set(key, value) {
    this._data[key] = value;
    this.save();
  },

  _checkDailyLogin() {
    const today = new Date().toDateString();
    const last = this._data.lastLoginDate;
    if (last !== today) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      if (last === yesterday.toDateString()) {
        this._data.loginStreak++;
      } else {
        this._data.loginStreak = 1;
      }
      this._data.lastLoginDate = today;
      this._data.dailyGachaUsed = false;

      if (this._data.loginStreak % G.GACHA_WEEKLY_TICKET_DAYS === 0) {
        this._data.tickets += 1;
      }
      if (this._data.loginStreak % G.GACHA_MONTHLY_TICKET_DAYS === 0) {
        this._data.tickets += 1;
      }
    }
  },

  canDailyGacha() {
    return !this._data.dailyGachaUsed;
  },

  useDailyGacha() {
    this._data.dailyGachaUsed = true;
    this.save();
  },

  addToInventory(partId) {
    if (!this._data.inventory.includes(partId)) {
      this._data.inventory.push(partId);
      this.save();
    }
  },

  hasInInventory(partId) {
    return this._data.inventory.includes(partId);
  },

  getInventoryParts(category) {
    return this._data.inventory
      .map(id => G.getPartById(id))
      .filter(p => p && p.category === category);
  },

  getRocket() {
    return this._data.rocket;
  },

  // ガレージで「設計完了」した承認済み設計をID形式で保存する
  setApprovedRocket(rocketIds) {
    this._data.rocket = rocketIds;
    this.save();
  },

  getRocketParts() {
    // 常に承認済み設計（_data.rocket）から構築する。
    // ガレージの編集途中レイアウトは「設計完了」を押すまで打ち上げに使わない
    const r = this._data.rocket;
    const sc = r.stageCount;
    const structCount = Math.max(0, sc - 1);
    const structs = (r.structures || ['s1']).slice(0, structCount);
    while (structs.length < structCount) structs.push('s1');
    return {
      stages: r.stages.slice(0, sc).map(s => ({
        engine: G.getPartById(s.engine),
        tank: G.getPartById(s.tank),
      })),
      structures: structs.map(id => G.getPartById(id)),
      fairing: G.getPartById(r.fairing),
      payload: G.getPartById(r.payload),
      obc: G.getPartById(r.obc || 'obc1'),
      stageCount: sc,
    };
  },

  addFlight(flight) {
    this._data.flights.unshift(flight);
    if (this._data.flights.length > 50) this._data.flights.pop();
    this._data.totalLaunches++;
    if (flight.success) this._data.successfulLaunches++;
    this._data.totalScore += flight.score;
    if (flight.score > this._data.highScore) this._data.highScore = flight.score;
    this._checkSiteUnlocks();
    this.save();
  },

  _checkSiteUnlocks() {
    for (const site of G.SITES) {
      if (!this._data.unlockedSites.includes(site.id) && this._data.totalScore >= site.unlockScore) {
        this._data.unlockedSites.push(site.id);
      }
    }
  },

  isSiteUnlocked(siteId) {
    return this._data.unlockedSites.includes(siteId);
  },

  resetAll() {
    localStorage.removeItem('rocketGame');
    this._data = this._defaults();
    this.save();
  },
};
