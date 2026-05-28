var G = window.G || {};
window.G = G;

G.Physics = {
  GAME_ISP_SCALE: 3.5,
  GAME_THRUST_SCALE: 2.0,

  simulate(rocketParts, site, targetAlt, targetInc, pitchRate) {
    const P = G.PHYSICS;
    const stages = rocketParts.stages;
    const stageCount = rocketParts.stageCount;
    const structure = rocketParts.structure;
    const fairing = rocketParts.fairing;
    const payload = rocketParts.payload;

    const stageData = stages.map(s => ({
      engine: s.engine,
      tank: s.tank,
      gameIsp: s.engine.isp * this.GAME_ISP_SCALE,
      gameMassFlow: s.engine.massFlowRate * this.GAME_THRUST_SCALE / this.GAME_ISP_SCALE,
      gameVacThrust: s.engine.vacuumThrust * 1000 * this.GAME_THRUST_SCALE,
      gameSLThrust: s.engine.seaLevelThrust * 1000 * this.GAME_THRUST_SCALE,
      fuelLeft: s.tank.propellantCapacity,
      dryMass: s.engine.dryMass + s.tank.dryMass,
      burnTime: 0,
    }));

    const fixedMass = structure.dryMass + fairing.dryMass + payload.mass;
    let totalMass0 = fixedMass;
    for (const sd of stageData) totalMass0 += sd.dryMass + sd.fuelLeft;
    const totalFuel0 = stageData.reduce((s, sd) => s + sd.fuelLeft, 0);

    const dt = 0.5;
    const maxTime = 900;
    const targetAltM = targetAlt * 1000;
    const vOrbit = Math.sqrt(P.MU / (P.R_EARTH + targetAltM));
    const rotBoost = P.EARTH_ROTATION * Math.cos(site.lat * Math.PI / 180);

    let h = 0;
    let vr = 0;
    let vt = rotBoost;
    let mass = totalMass0;
    let t = 0;
    let pitchAngle = 90;
    let fairingJettisoned = false;
    let maxQ = 0;
    let maxAccelG = 0;
    let maxQAlpha = 0;
    let peakAltitude = 0;
    let totalBurnTime = 0;
    let failed = false;
    let failReason = '';
    let failTime = 0;
    let failPart = '';
    let downrange = 0;
    let currentStage = 0;
    let gravityTurnActive = false;
    let stagingState = 'idle';
    let stagingTimer = 0;
    const MECO_COAST = 1.0;
    const SEP_COAST = 1.5;

    const stagingEvents = [];
    const flightData = [];
    const recordInterval = 2;
    let lastRecord = -recordInterval;

    const tw0 = stageData[0].gameSLThrust / (totalMass0 * P.g0);
    const twFactor = Math.max(0, Math.min(1, (tw0 - 1.0) / 2.0));
    const kickoverAlt = 2000 + 4000 * (1 - twFactor);
    const pitchEndAlt = Math.min(targetAltM * 0.7, 250000);
    const tangentC = (1.2 + targetAltM / 500000) * (1 + twFactor * 0.3);
    const useManualPitch = pitchRate && pitchRate > 0;

    // Pre-roll base failures with random times
    const baseFailChecks = [];
    let scheduledFail = null;
    {
      const allParts = [];
      for (let i = 0; i < stageCount; i++) {
        allParts.push({ part: stages[i].engine, name: (i + 1) + '段目エンジン基礎故障' });
        allParts.push({ part: stages[i].tank, name: (i + 1) + '段目タンク基礎故障' });
      }
      allParts.push({ part: structure, name: '構造材基礎故障' });
      allParts.push({ part: fairing, name: 'フェアリング基礎故障' });
      allParts.push({ part: payload, name: 'ペイロード基礎故障' });

      for (const { part, name } of allParts) {
        const pBase = G.RARITY[part.rarity].baseFail;
        const roll = Math.random();
        const didFail = roll < pBase;
        baseFailChecks.push({ name, rarity: part.rarity, prob: pBase, roll, failed: didFail });
        if (didFail) {
          const ft = Math.random() * 600;
          if (!scheduledFail || ft < scheduledFail.time) {
            scheduledFail = { time: ft, reason: name, part: part.category || 'unknown' };
          }
        }
      }
    }

    while (t < maxTime && !failed) {
      const alt = h;
      if (alt > peakAltitude) peakAltitude = alt;

      const rho = alt < 100000 ? P.RHO_0 * Math.exp(-alt / P.H_SCALE) : 0;
      const v = Math.sqrt(vr * vr + vt * vt);
      const atmoVt = rotBoost * Math.max(0, 1 - alt / 100000);
      const relVr = vr;
      const relVt = vt - atmoVt;
      const relV = Math.sqrt(relVr * relVr + relVt * relVt);
      const q = 0.5 * rho * relV * relV;

      const currentFairingCd = fairingJettisoned ? fairing.dragCoefficient * 0.15 : fairing.dragCoefficient;
      const dragForce = q * currentFairingCd * fairing.referenceArea;

      const r = P.R_EARTH + alt;
      const gLocal = P.MU / (r * r);

      let thrustForce = 0;
      let isBurning = false;

      if (currentStage < stageCount) {
        const sd = stageData[currentStage];
        if (stagingState === 'meco_coast') {
          stagingTimer += dt;
          if (stagingTimer >= MECO_COAST) {
            mass -= sd.dryMass;
            stagingEvents.push({ time: t, type: 'separation', stage: currentStage, alt: alt });
            stagingState = 'sep_coast';
            stagingTimer = 0;
          }
        } else if (stagingState === 'sep_coast') {
          stagingTimer += dt;
          if (stagingTimer >= SEP_COAST) {
            currentStage++;
            stagingEvents.push({ time: t, type: 'ignition', stage: currentStage, alt: alt });
            stagingState = 'idle';
            stagingTimer = 0;
          }
        } else if (sd.fuelLeft > 0) {
          const atmoFactor = Math.min(1, alt / 40000);
          const thrust = sd.gameSLThrust * (1 - atmoFactor) + sd.gameVacThrust * atmoFactor;
          const fuelUsed = Math.min(sd.gameMassFlow * dt, sd.fuelLeft);
          sd.fuelLeft -= fuelUsed;
          mass -= fuelUsed;
          thrustForce = thrust;
          isBurning = true;
          sd.burnTime += dt;
          totalBurnTime += dt;
        } else if (currentStage < stageCount - 1) {
          stagingEvents.push({ time: t, type: 'meco', stage: currentStage, alt: alt });
          stagingState = 'meco_coast';
          stagingTimer = 0;
        }
      }

      if (useManualPitch) {
        if (alt > kickoverAlt && pitchAngle > 2) {
          pitchAngle -= pitchRate * dt;
          if (pitchAngle < 2) pitchAngle = 2;
        }
      } else {
        if (!gravityTurnActive && alt > kickoverAlt) {
          gravityTurnActive = true;
        }
        if (gravityTurnActive && relV > 10) {
          const relFpa = Math.atan2(relVr, relVt) * 180 / Math.PI;
          const altFracP = Math.min(0.999, alt / pitchEndAlt);
          const schedulePitch = Math.atan(tangentC * (1 - altFracP)) * 180 / Math.PI;
          const maxAoA = alt < 30000 ? 3 : 20;
          const targetPitch = Math.max(relFpa, Math.min(schedulePitch, relFpa + maxAoA));
          pitchAngle = Math.min(pitchAngle, Math.max(0, targetPitch));
        }
      }

      const pitchRad = pitchAngle * Math.PI / 180;
      const thrustR = thrustForce * Math.sin(pitchRad) / mass;
      const thrustT = thrustForce * Math.cos(pitchRad) / mass;

      const dragR = relV > 0 ? -dragForce * (relVr / relV) / mass : 0;
      const dragT = relV > 0 ? -dragForce * (relVt / relV) / mass : 0;

      const ar = thrustR - gLocal + dragR + (vt * vt) / r;
      const at = thrustT + dragT - (vr * vt) / r;

      vr += ar * dt;
      vt += at * dt;
      h += vr * dt;
      downrange += ((vt * P.R_EARTH / r - rotBoost) * dt);

      if (h < 0 && t > 10) {
        h = 0;
        break;
      }

      // Base failure check (pre-rolled)
      if (scheduledFail && t >= scheduledFail.time) {
        failed = true;
        failReason = scheduledFail.reason;
        failPart = scheduledFail.part;
        failTime = t;
        break;
      }

      const accelG = Math.sqrt(ar * ar + at * at) / P.g0;
      const alpha = v > 0 ? Math.abs(Math.atan2(vr, vt) - pitchRad) : 0;
      const qAlpha = q * alpha;

      if (q > maxQ) maxQ = q;
      if (accelG > maxAccelG) maxAccelG = accelG;
      if (qAlpha > maxQAlpha) maxQAlpha = qAlpha;

      if (!fairingJettisoned && alt > 80000) {
        fairingJettisoned = true;
        mass -= fairing.dryMass * 0.7;
        stagingEvents.push({ time: t, type: 'fairing', alt: alt });
      }

      if (site.limitsEnabled && isBurning && currentStage < stageCount) {
        const sd = stageData[currentStage];
        const checks = [
          { part: 'fairing', limit: fairing.maxDynamicPressure, actual: q, name: 'フェアリング動圧超過' },
          { part: 'tank', limit: sd.tank.maxQAlpha * P.g0, actual: qAlpha * P.g0, name: 'タンクQα超過' },
          { part: 'structure', limit: structure.maxQAlpha * P.g0, actual: qAlpha * P.g0, name: '構造材Qα超過' },
          { part: 'tank', limit: sd.tank.maxAxialAccel, actual: accelG, name: 'タンク加速度超過' },
          { part: 'engine', limit: sd.engine.maxAccel, actual: accelG, name: 'エンジン加速度超過' },
          { part: 'payload', limit: payload.maxAccel, actual: accelG, name: 'ペイロード加速度超過' },
        ];
        for (const chk of checks) {
          const ratio = chk.actual / chk.limit;
          const pDyn = this._dynamicFailProb(ratio);
          if (pDyn > 0 && Math.random() < pDyn * dt / 10) {
            failed = true;
            failReason = chk.name;
            failTime = t;
            failPart = chk.part;
            break;
          }
        }
        if (isBurning && sd.burnTime > sd.engine.maxBurnTime) {
          const overRatio = sd.burnTime / sd.engine.maxBurnTime;
          if (Math.random() < this._dynamicFailProb(overRatio) * dt / 10) {
            failed = true;
            failReason = (currentStage + 1) + '段目エンジン燃焼時間超過';
            failTime = t;
            failPart = 'engine';
          }
        }
      }

      const vtGround = vt - rotBoost;
      const vGround = Math.sqrt(vr * vr + vtGround * vtGround);
      const fpa = vGround > 5 ? Math.atan2(vr, vtGround) * 180 / Math.PI : 90;

      if (t - lastRecord >= recordInterval) {
        const totalFuel = stageData.reduce((s, sd) => s + sd.fuelLeft, 0);
        flightData.push({
          t: Math.round(t * 10) / 10,
          alt: Math.round(h),
          vr: Math.round(vr * 10) / 10,
          vt: Math.round(vt * 10) / 10,
          v: Math.round(v * 10) / 10,
          q: Math.round(q),
          accel: Math.round(accelG * 100) / 100,
          pitch: Math.round(pitchAngle * 10) / 10,
          fpa: Math.round(fpa * 10) / 10,
          mass: Math.round(mass),
          fuel: Math.round(totalFuel),
          downrange: Math.round(downrange),
          stage: currentStage,
          burning: isBurning,
        });
        lastRecord = t;
      }

      if (alt > targetAltM * 0.8 && vt >= vOrbit * 0.95) {
        break;
      }

      t += dt;
    }

    const peakAltKm = peakAltitude / 1000;
    const finalAlt = h / 1000;
    const finalV = Math.sqrt(vr * vr + vt * vt);
    const displayAlt = Math.max(finalAlt, peakAltKm);
    const achievedOrbit = !failed && displayAlt >= targetAlt * 0.8 && finalV >= vOrbit * 0.85;

    let totalDryMass = fixedMass;
    for (const sd of stageData) totalDryMass += sd.dryMass;

    let gameDeltaV = 0;
    for (let i = stageCount - 1; i >= 0; i--) {
      let upperMass = fixedMass;
      for (let j = i + 1; j < stageCount; j++) {
        upperMass += stageData[j].dryMass + stages[j].tank.propellantCapacity;
      }
      const stageWet = upperMass + stageData[i].dryMass + stages[i].tank.propellantCapacity;
      const stageDry = upperMass + stageData[i].dryMass;
      gameDeltaV += Math.round(stages[i].engine.isp * this.GAME_ISP_SCALE * P.g0 * Math.log(stageWet / stageDry));
    }

    let incError = 0;
    if (site.level >= 2) {
      incError = Math.abs(site.lat - targetInc) * (1 + Math.random() * 0.3);
    }

    return {
      success: achievedOrbit,
      failed,
      failReason,
      failTime: Math.round(failTime * 10) / 10,
      failPart,
      finalAltitude: Math.round(displayAlt * 10) / 10,
      peakAltitude: Math.round(peakAltKm * 10) / 10,
      finalVelocity: Math.round(finalV),
      orbitalVelocity: Math.round(vOrbit),
      maxQ: Math.round(maxQ),
      maxAccelG: Math.round(maxAccelG * 100) / 100,
      maxQAlpha: Math.round(maxQAlpha),
      burnTime: Math.round(totalBurnTime * 10) / 10,
      totalTime: Math.round(t * 10) / 10,
      totalDryMass,
      totalMass0,
      propellantUsed: Math.round(totalFuel0 - stageData.reduce((s, sd) => s + sd.fuelLeft, 0)),
      deltaV: gameDeltaV,
      inclinationError: Math.round(incError * 10) / 10,
      flightData,
      baseFailChecks,
      stagingEvents,
      stageCount,
    };
  },

  _dynamicFailProb(r) {
    if (r <= 0.8) return 0;
    if (r <= 1.0) return (r - 0.8) / 0.2 * 0.5;
    return 1 - Math.exp(-3 * (r - 1.0));
  },
};
