var G = window.G || {};
window.G = G;

G.Score = {
  calculate(simResult, rocketParts, site, targetAlt, targetInc, targetOrbitType) {
    if (simResult.failed && !simResult.success) {
      const ballisticScore = Math.max(0, simResult.finalAltitude) * 0.1;
      return {
        total: Math.round(ballisticScore),
        base: Math.round(ballisticScore),
        orbitMult: 0.1,
        incMult: 1,
        siteMult: site.multiplier,
        successBonus: 0,
        lightBonus: 1,
        scoreMult: rocketParts.payload.scoreMultiplier,
        breakdown: '失敗 — 弾道飛行スコアのみ',
      };
    }

    const payloadMass = rocketParts.payload.mass;
    const achievedAlt = simResult.finalAltitude;
    const deltaV = simResult.deltaV;

    const baseScore = (payloadMass * deltaV) / 1000;

    let orbitMult = 0.1;
    for (const orb of G.ORBIT_TYPES) {
      if (achievedAlt >= orb.minAlt && achievedAlt <= orb.maxAlt) {
        orbitMult = orb.multiplier;
        break;
      }
    }
    if (targetOrbitType === 'sso' && achievedAlt >= 600 && achievedAlt <= 800) {
      orbitMult = Math.max(orbitMult, 2.0);
    }
    if (targetOrbitType === 'gto' && achievedAlt >= 250) {
      orbitMult = Math.max(orbitMult, 3.0 * Math.min(1, achievedAlt / 35786));
    }

    let incMult = 1.0;
    if (site.level >= 2) {
      const err = simResult.inclinationError;
      incMult = Math.max(0.1, 1.0 - err / 30);
    }

    const siteMult = site.multiplier;

    let successBonus = 0;
    if (simResult.success) {
      const altError = Math.abs(achievedAlt - targetAlt) / targetAlt;
      if (altError < 0.05) {
        successBonus = 1.0;
      } else if (altError < 0.15) {
        successBonus = 0.7;
      } else {
        successBonus = 0.5;
      }
    }

    let lightBonus = 1.0;
    if (payloadMass < 200) {
      lightBonus = 1.0 + (200 - payloadMass) / 400;
    }

    const scoreMult = rocketParts.payload.scoreMultiplier;
    const total = baseScore * orbitMult * incMult * siteMult * successBonus * lightBonus * scoreMult;

    return {
      total: Math.round(total),
      base: Math.round(baseScore),
      orbitMult,
      incMult: Math.round(incMult * 100) / 100,
      siteMult,
      successBonus,
      lightBonus: Math.round(lightBonus * 100) / 100,
      scoreMult,
      breakdown: simResult.success ? '軌道投入成功' : '部分成功',
    };
  },
};
