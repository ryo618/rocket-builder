var G = window.G || {};
window.G = G;

G.Gacha = {
  pull() {
    const state = G.State;
    state.set('totalGachaPulls', state.get('totalGachaPulls') + 1);
    const pity = state.get('pityCounter') + 1;

    let rarity;
    if (pity >= G.GACHA_PITY) {
      rarity = Math.random() < 0.2 ? 5 : 4;
      state.set('pityCounter', 0);
    } else {
      rarity = this._rollRarity();
      if (rarity >= 4) {
        state.set('pityCounter', 0);
      } else {
        state.set('pityCounter', pity);
      }
    }

    const category = G.CATEGORIES[Math.floor(Math.random() * G.CATEGORIES.length)];
    const candidates = G.PARTS[category].filter(p => p.rarity === rarity);

    if (candidates.length === 0) {
      const fallback = G.PARTS[category];
      const part = fallback[Math.floor(Math.random() * fallback.length)];
      return this._processResult(part);
    }

    const part = candidates[Math.floor(Math.random() * candidates.length)];
    return this._processResult(part);
  },

  pullWithTicket(minRarity) {
    const category = G.CATEGORIES[Math.floor(Math.random() * G.CATEGORIES.length)];
    const candidates = G.PARTS[category].filter(p => p.rarity >= minRarity);
    if (candidates.length === 0) return this.pull();
    const part = candidates[Math.floor(Math.random() * candidates.length)];
    return this._processResult(part);
  },

  _rollRarity() {
    const r = Math.random();
    let cum = 0;
    for (let i = 1; i <= 5; i++) {
      cum += G.RARITY[i].rate;
      if (r < cum) return i;
    }
    return 1;
  },

  _processResult(part) {
    const isNew = !G.State.hasInInventory(part.id);
    G.State.addToInventory(part.id);
    const isDupe = !isNew;
    if (isDupe) {
      G.State.set('coins', G.State.get('coins') + part.rarity * 10);
    }
    return { part, isNew, isDupe, coins: isDupe ? part.rarity * 10 : 0 };
  },
};
