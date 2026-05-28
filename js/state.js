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
        structure: old.structure || 's1',
        fairing: old.fairing || 'f1',
        payload: old.payload || 'p1',
        stageCount: 2
      };
      ['e1b', 't1b'].forEach(id => {
        if (!this._data.inventory.includes(id)) this._data.inventory.push(id);
      });
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
      } else if (last !== null) {
        this._data.loginStreak = 1;
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

  setRocketPart(category, partId, stageIdx) {
    if (stageIdx !== undefined && (category === 'engine' || category === 'tank')) {
      this._data.rocket.stages[stageIdx][category] = partId;
    } else {
      this._data.rocket[category] = partId;
    }
    this.save();
  },

  setStageCount(count) {
    const c = Math.max(1, Math.min(G.MAX_STAGES, count));
    while (this._data.rocket.stages.length < c) {
      this._data.rocket.stages.push({ engine: 'e1a', tank: 't1a' });
    }
    this._data.rocket.stageCount = c;
    this.save();
  },

  getRocketParts() {
    const r = this._data.rocket;
    return {
      stages: r.stages.slice(0, r.stageCount).map(s => ({
        engine: G.getPartById(s.engine),
        tank: G.getPartById(s.tank),
      })),
      structure: G.getPartById(r.structure),
      fairing: G.getPartById(r.fairing),
      payload: G.getPartById(r.payload),
      stageCount: r.stageCount,
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
