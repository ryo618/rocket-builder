var G = window.G || {};
window.G = G;

G.Physics = {
  GAME_ISP_SCALE: 3.5,
  GAME_THRUST_SCALE: 2.0,

  simulate(rocketParts, site, targetAlt, targetInc, pitchRate) {
    const P = G.PHYSICS;
    const stages = rocketParts.stages;
    const stageCount = rocketParts.stageCount;
    const structures = rocketParts.structures || [];
    const fairing = rocketParts.fairing;
    const payload = rocketParts.payload;
    const obc = rocketParts.obc;

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

    const hasAero = site.level >= 2;
    const stageInitialFuel = stageData.map((_, i) => stages[i].tank.propellantCapacity);

    let fixedMass = fairing.dryMass + payload.mass + (obc ? obc.dryMass : 0);
    for (const st of structures) fixedMass += st.dryMass;
    let totalMass0 = fixedMass;
    for (const sd of stageData) totalMass0 += sd.dryMass + sd.fuelLeft;
    const totalFuel0 = stageData.reduce((s, sd) => s + sd.fuelLeft, 0);

    const dt = 0.25;
    // 高高度目標はアポジまでのコースト時間が長いため上限時間をスケールさせる
    const maxTime = 1200 + targetAlt * 0.8;
    const targetAltM = targetAlt * 1000;
    const vOrbit = Math.sqrt(P.MU / (P.R_EARTH + targetAltM));
    // 自転ブースト: 軌道面への射点速度の投影。直接投入では sin(方位角) = cos(i)/cos(lat)
    // なので軌道進行方向成分は Ω·R·cos(i)。逆行軌道 (i > 90°, SSO等) ではペナルティになる。
    let rotBoost = P.EARTH_ROTATION * Math.cos(site.lat * Math.PI / 180);
    if (site.level >= 2 && typeof targetInc === 'number') {
      const effInc = Math.max(Math.abs(site.lat), targetInc);
      rotBoost = P.EARTH_ROTATION * Math.cos(effInc * Math.PI / 180);
    }

    let h = 0;
    let vr = 0;
    let vt = rotBoost;
    let mass = totalMass0;
    let t = 0;
    let pitchAngle = 90;
    // 平面3DOF回転状態（並進2自由度 + ピッチ回転1自由度）
    let theta = Math.PI / 2;  // body pitch angle (rad), pi/2 = vertical
    let omega = 0;             // angular velocity (rad/s)
    let gimbalAngle = 0;       // TVC gimbal deflection (rad)
    let prevDesiredPitch = Math.PI / 2; // guidance rate limiter state
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
    let allBurnedOut = false;
    let burnoutTime = 0;
    const altToleranceM = (site.altTolerance || 100) * 1000;
    const COAST_TIMEOUT = 120;

    const stagingEvents = [];
    const flightData = [];
    const recordInterval = 2;
    let lastRecord = -recordInterval;
    let orbitInserted = false;
    // 終端誘導: 遠地点が目標帯域に達したら投入フェーズへ移行し、
    // アポジ調整 → コースト → 円形化燃焼で近地点を引き上げる（実機の二段燃焼投入の簡略版）
    let insertionPhase = false;
    let circMode = false;

    // 現在の状態ベクトルから軌道要素（近地点・遠地点高度）を計算
    const orbitElements = () => {
      const rNow = P.R_EARTH + h;
      const vSq = vr * vr + vt * vt;
      const eps = vSq / 2 - P.MU / rNow;
      if (eps >= 0) return null; // 双曲線軌道（脱出）
      const a = -P.MU / (2 * eps);
      const hAng = rNow * vt;
      const ecc = Math.sqrt(Math.max(0, 1 - hAng * hAng / (P.MU * a)));
      return { periAlt: a * (1 - ecc) - P.R_EARTH, apoAlt: a * (1 + ecc) - P.R_EARTH };
    };

    const tw0 = stageData[0].gameSLThrust / (totalMass0 * P.g0);
    const twFactor = Math.max(0, Math.min(1, (tw0 - 1.0) / 2.0));
    const kickoverAlt = 2000 + 4000 * (1 - twFactor);
    const pitchEndAlt = Math.min(targetAltM * 0.7, 250000);
    const tangentC = (1.0 + targetAltM / 600000) * (1 + twFactor * 0.2);
    const useManualPitch = pitchRate && pitchRate > 0;

    // 平面3DOF回転力学の定数
    const rocketLenBase = 40;
    const gimbalMaxRad = 5 * Math.PI / 180;
    const Kp_tvc = 2.0;
    const Kd_tvc = 1.5;
    const Cn_alpha6 = 2.0;
    const staticMarginFrac6 = 0.08;
    const dampCoeff6 = 0.3;

    // Phase-dependent failure pre-rolls
    const baseFailChecks = [];
    const reliabilityBonus = obc ? (obc.reliabilityBonus || 0) : 0;
    const stageEngineFailFrac = [];
    const stageTankFailFrac = [];
    const sepFails = [];
    let fairingSepFail = false;
    let obcFailTime = null;
    {
      // Per-stage engine & tank (fail during that stage's burn)
      for (let i = 0; i < stageCount; i++) {
        const eP = G.RARITY[stages[i].engine.rarity].baseFail * (1 - reliabilityBonus);
        const eR = Math.random(); const eF = eR < eP;
        baseFailChecks.push({ name: `${i+1}段目エンジン`, rarity: stages[i].engine.rarity, prob: eP, roll: eR, failed: eF });
        stageEngineFailFrac[i] = eF ? 0.1 + Math.random() * 0.8 : null;

        const tP = G.RARITY[stages[i].tank.rarity].baseFail * (1 - reliabilityBonus);
        const tR = Math.random(); const tF = tR < tP;
        baseFailChecks.push({ name: `${i+1}段目タンク`, rarity: stages[i].tank.rarity, prob: tP, roll: tR, failed: tF });
        stageTankFailFrac[i] = tF ? 0.1 + Math.random() * 0.8 : null;
      }
      // Interstage separation failures
      for (let i = 0; i < structures.length; i++) {
        const sP = G.RARITY[structures[i].rarity].baseFail * (1 - reliabilityBonus);
        const sR = Math.random(); const sF = sR < sP;
        const sL = structures.length === 1 ? '段間分離' : `段間${i+1}分離`;
        baseFailChecks.push({ name: sL, rarity: structures[i].rarity, prob: sP, roll: sR, failed: sF });
        sepFails[i] = sF;
      }
      // Fairing separation failure
      {
        const fP = G.RARITY[fairing.rarity].baseFail * (1 - reliabilityBonus);
        const fR = Math.random(); const fF = fR < fP;
        baseFailChecks.push({ name: 'フェアリング分離', rarity: fairing.rarity, prob: fP, roll: fR, failed: fF });
        fairingSepFail = fF;
      }
      // OBC (any time, own rarity baseFail, NOT reduced by own bonus)
      {
        const oP = obc ? G.RARITY[obc.rarity].baseFail : 0;
        const oR = Math.random(); const oF = oR < oP;
        baseFailChecks.push({ name: '衛星アダプタ', rarity: obc ? obc.rarity : 1, prob: oP, roll: oR, failed: oF });
        obcFailTime = oF ? Math.random() * 600 : null;
      }
      // Payload (satellite) separation failure — checked after orbit achieved
      {
        const pP = G.RARITY[payload.rarity].baseFail * (1 - reliabilityBonus);
        const pR = Math.random(); const pF = pR < pP;
        baseFailChecks.push({ name: '衛星分離', rarity: payload.rarity, prob: pP, roll: pR, failed: pF });
      }
    }

    while (t < maxTime && !failed) {
      const alt = h;
      if (alt > peakAltitude) peakAltitude = alt;

      const rho = alt < 100000 ? P.RHO_0 * Math.exp(-alt / P.H_SCALE) : 0;
      const v = Math.sqrt(vr * vr + vt * vt);
      // 大気は全高度で地球と共回転する（高度による減衰はない — 密度減衰が実質の減衰）
      const relVr = vr;
      const relVt = vt - rotBoost;
      const relV = Math.sqrt(relVr * relVr + relVt * relVt);
      const q = 0.5 * rho * relV * relV;

      const currentFairingCd = fairingJettisoned ? fairing.dragCoefficient * 0.15 : fairing.dragCoefficient;
      const dragForce = hasAero ? q * currentFairingCd * fairing.referenceArea : 0;

      const r = P.R_EARTH + alt;
      const gLocal = P.MU / (r * r);

      let thrustForce = 0;
      let isBurning = false;

      if (currentStage < stageCount) {
        const sd = stageData[currentStage];
        if (stagingState === 'meco_coast') {
          stagingTimer += dt;
          if (stagingTimer >= MECO_COAST) {
            if (currentStage < sepFails.length && sepFails[currentStage]) {
              failed = true;
              failReason = structures.length === 1 ? '段間分離失敗' : `段間${currentStage+1}分離失敗`;
              failPart = 'structure'; failTime = t; break;
            }
            // 下段と一緒に段間構造も投棄する
            mass -= sd.dryMass;
            if (currentStage < structures.length) mass -= structures[currentStage].dryMass;
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
          // 推力 T = T_vac − p_a·A_e: 気圧は指数減衰するので線形ではなく圧力比で補間
          const pFrac = Math.exp(-alt / P.H_SCALE);
          const maxThrust = sd.gameVacThrust - (sd.gameVacThrust - sd.gameSLThrust) * pFrac;

          const oeNow = orbitElements();
          if (!insertionPhase && oeNow && oeNow.apoAlt >= targetAltM - Math.max(altToleranceM, 30000)) {
            insertionPhase = true;
          }
          let throttle = 1;
          circMode = false;
          if (insertionPhase && oeNow) {
            const accelNow = maxThrust / mass;
            const periGap = (targetAltM - altToleranceM * 0.5) - oeNow.periAlt;
            const apoErr = targetAltM - oeNow.apoAlt;
            // アポジ近傍の判定は許容幅に依存させない（早すぎる円形化はアポジを押し上げてしまう）
            const nearApo = (oeNow.apoAlt - alt) < 20000 || vr < 50;
            if (periGap <= 0) {
              throttle = 0; // 近地点が帯域内 → 投入完了（successチェックが拾う）
            } else if (!nearApo) {
              // (1) アポジ調整: 遠地点を目標のやや下に載せ、載ったらコーストで上昇
              //     （円形化燃焼でアポジは少し上がるため下側に余裕を残す。
              //       dApo/dv ≈ 2km per m/s @LEO なのでギャップに応じて絞る）
              const apoAim = apoErr - altToleranceM * 0.25;
              throttle = apoAim <= 0 ? 0
                : Math.min(1, Math.max(0.02, apoAim / 2000 / (accelNow * dt)));
            } else {
              // (2) 円形化: アポジ近傍で高度を保ちつつ水平加速して近地点を引き上げる。
              //     残りギャップに応じて絞り、遠地点が帯域上限に近づいたらさらに絞る
              circMode = true;
              const apoMargin = (targetAltM + altToleranceM * 0.5) - oeNow.apoAlt;
              const periThr = periGap / 3500 / (accelNow * dt) / 4;
              const apoCap = apoMargin > 0
                ? Math.max(0.08, apoMargin / 1000 / (accelNow * dt))
                : 0.08;
              throttle = Math.min(1, Math.max(0.02, Math.min(periThr, apoCap)));
            }
          }
          if (throttle > 0) {
            const fuelUsed = Math.min(sd.gameMassFlow * dt * throttle, sd.fuelLeft);
            sd.fuelLeft -= fuelUsed;
            mass -= fuelUsed;
            thrustForce = maxThrust * throttle;
            isBurning = true;
            sd.burnTime += dt * throttle;
            totalBurnTime += dt * throttle;
          }
        } else if (currentStage < stageCount - 1) {
          stagingEvents.push({ time: t, type: 'meco', stage: currentStage, alt: alt });
          stagingState = 'meco_coast';
          stagingTimer = 0;
        }
      }

      // 誘導則: 目標ピッチ角を計算
      let desiredPitchRad = theta;
      if (useManualPitch) {
        if (alt > kickoverAlt) {
          desiredPitchRad = Math.max(2, 90 - pitchRate * t) * Math.PI / 180;
        }
      } else {
        if (!gravityTurnActive && alt > kickoverAlt) {
          gravityTurnActive = true;
        }
        if (gravityTurnActive && relV > 10) {
          const relFpa = Math.atan2(relVr, relVt);
          if (currentStage === 0) {
            const altFracP = Math.min(0.999, alt / pitchEndAlt);
            const schedulePitchRad = Math.atan(tangentC * (1 - altFracP));
            const maxAoARad = (alt < 30000 ? 3 : 20) * Math.PI / 180;
            const targetPitchRad = Math.max(relFpa, Math.min(schedulePitchRad, relFpa + maxAoARad));
            desiredPitchRad = Math.max(0, targetPitchRad);
          } else {
            // Upper stage: velocity-aware guidance for optimal orbit insertion
            const vtRatio = Math.min(1, vt / vOrbit);
            const altFrac = Math.min(1, alt / targetAltM);
            // Altitude component: pitch up if below target, zero at/above target
            const altPitchDeg = Math.max(0, (1 - altFrac)) * 20;
            // Velocity component: as vt approaches vOrbit, pitch toward horizontal
            const velPitchDeg = (1 - vtRatio * vtRatio) * 15;
            // Combine: altitude need dominates when far below target, velocity need takes over near orbit
            const schedPitchDeg = Math.min(30, altPitchDeg * (1 - vtRatio) + velPitchDeg);
            const schedPitchRad = schedPitchDeg * Math.PI / 180;
            const maxAoARad = (alt > 80000 ? 20 : 10) * Math.PI / 180;
            desiredPitchRad = Math.max(0, Math.min(schedPitchRad, relFpa + maxAoARad));
          }
        }
        // 投入フェーズの燃焼方向: アポジ調整中はプログレード（エネルギー効率最良）、
        // 円形化中は高度維持ピッチ（重力と遠心力の差を推力の垂直成分で相殺しつつ水平加速）
        if (insertionPhase && relV > 10 && isBurning) {
          if (circMode && thrustForce > 0) {
            const needAr = (gLocal - vt * vt / r) - 0.3 * vr;
            const sinP = Math.max(-0.35, Math.min(0.7, needAr / (thrustForce / mass)));
            desiredPitchRad = Math.asin(sinP);
          } else {
            desiredPitchRad = Math.max(0, Math.atan2(vr, vt));
          }
        }
      }

      // Adaptive guidance rate limit — tuned per flight phase for optimal trajectory
      {
        let maxPitchRateDeg;
        if (alt < 10000) {
          // Low altitude / high-Q: very gentle kickover, minimize AoA loads
          maxPitchRateDeg = 0.8;
        } else if (alt < 50000) {
          // Mid atmosphere: follow gravity turn — ramp rate as Q drops
          const frac = (alt - 10000) / 40000;
          maxPitchRateDeg = 0.8 + frac * 1.2;
        } else if (alt < 80000) {
          // Upper atmosphere transition
          maxPitchRateDeg = 2.0;
        } else {
          // Vacuum: pitch for efficient orbit insertion
          maxPitchRateDeg = 3.5;
        }
        const maxDelta = maxPitchRateDeg * Math.PI / 180 * dt;
        if (desiredPitchRad < prevDesiredPitch - maxDelta) {
          desiredPitchRad = prevDesiredPitch - maxDelta;
        } else if (desiredPitchRad > prevDesiredPitch + maxDelta) {
          desiredPitchRad = prevDesiredPitch + maxDelta;
        }
        prevDesiredPitch = desiredPitchRad;
        // During coast (no TVC), track actual theta to avoid jump at re-ignition
        if (!isBurning) prevDesiredPitch = theta;
      }

      // TVC attitude controller (PD)
      const pitchError = desiredPitchRad - theta;
      gimbalAngle = Kp_tvc * pitchError - Kd_tvc * omega;
      gimbalAngle = Math.max(-gimbalMaxRad, Math.min(gimbalMaxRad, gimbalAngle));
      if (!isBurning) gimbalAngle = 0;

      // 推力方向 = 機体軸 + ジンバル
      const thrustDir = theta + gimbalAngle;
      const thrustR = thrustForce * Math.sin(thrustDir) / mass;
      const thrustT = thrustForce * Math.cos(thrustDir) / mass;

      const dragR = relV > 0 ? -dragForce * (relVr / relV) / mass : 0;
      const dragT = relV > 0 ? -dragForce * (relVt / relV) / mass : 0;

      const ar = thrustR - gLocal + dragR + (vt * vt) / r;
      const at = thrustT + dragT - (vr * vt) / r;

      vr += ar * dt;
      vt += at * dt;
      h += vr * dt;
      downrange += ((vt * P.R_EARTH / r - rotBoost) * dt);

      // ピッチ回転力学
      {
        const rocketLen = rocketLenBase * Math.pow(mass / totalMass0, 0.3);
        const MOI = mass * rocketLen * rocketLen / 12;
        const tvcTorque = thrustForce * Math.sin(gimbalAngle) * rocketLen * 0.4;
        const alphaAoA6 = v > 10 ? theta - Math.atan2(vr, vt) : 0;
        const aeroRestoring = hasAero ? -q * fairing.referenceArea * Cn_alpha6 * staticMarginFrac6 * rocketLen * alphaAoA6 : 0;
        const aeroDamping = hasAero ? -dampCoeff6 * q * fairing.referenceArea * rocketLen * rocketLen * omega / (2 * Math.max(v, 1)) : 0;
        const omegaDot = (tvcTorque + aeroRestoring + aeroDamping) / MOI;
        omega += omegaDot * dt;
        theta += omega * dt;
        if (theta < 0) { theta = 0; omega = Math.max(0, omega); }
        if (theta > Math.PI) { theta = Math.PI; omega = Math.min(0, omega); }
        pitchAngle = theta * 180 / Math.PI;
      }

      // Ground collision: rocket cannot go below h=0
      if (h < 0) {
        h = 0;
        vr = Math.max(0, vr);
        // If rocket was in flight and came back down, end simulation
        if (peakAltitude > 100 && t > 10) {
          break;
        }
      }

      // Phase-dependent failure checks
      if (obcFailTime !== null && t >= obcFailTime) {
        failed = true; failReason = '衛星アダプタOBC故障'; failPart = 'obc'; failTime = t;
        obcFailTime = null; break;
      }
      if (isBurning && currentStage < stageCount) {
        const fuelFrac = 1 - stageData[currentStage].fuelLeft / stageInitialFuel[currentStage];
        if (stageEngineFailFrac[currentStage] !== null && fuelFrac >= stageEngineFailFrac[currentStage]) {
          failed = true; failReason = `${currentStage+1}段目エンジン故障`; failPart = 'engine'; failTime = t;
          stageEngineFailFrac[currentStage] = null; break;
        }
        if (stageTankFailFrac[currentStage] !== null && fuelFrac >= stageTankFailFrac[currentStage]) {
          failed = true; failReason = `${currentStage+1}段目タンク故障`; failPart = 'tank'; failTime = t;
          stageTankFailFrac[currentStage] = null; break;
        }
      }

      // 構造荷重 = プロパー加速度（推力+空力の比力）。重力・遠心項は自由落下なので荷重にならない
      const accelG = Math.sqrt((thrustR + dragR) * (thrustR + dragR) + (thrustT + dragT) * (thrustT + dragT)) / P.g0;
      const alpha = v > 0 ? Math.abs(theta - Math.atan2(vr, vt)) : 0;
      const qAlpha = q * alpha;

      if (q > maxQ) maxQ = q;
      if (accelG > maxAccelG) maxAccelG = accelG;
      if (qAlpha > maxQAlpha) maxQAlpha = qAlpha;

      if (!fairingJettisoned && alt > 80000) {
        if (fairingSepFail) {
          failed = true; failReason = 'フェアリング分離失敗'; failPart = 'fairing'; failTime = t; break;
        }
        fairingJettisoned = true;
        mass -= fairing.dryMass;
        stagingEvents.push({ time: t, type: 'fairing', alt: alt });
      }

      if (site.limitsEnabled && isBurning && currentStage < stageCount) {
        const sd = stageData[currentStage];
        const checks = [
          { part: 'fairing', limit: fairing.maxDynamicPressure, actual: q, name: 'フェアリング動圧超過' },
          { part: 'tank', limit: sd.tank.maxQAlpha, actual: qAlpha, name: 'タンクQα超過' },
          { part: 'structure', limit: structures.length > 0 ? Math.min(...structures.map(s => s.maxQAlpha)) : 50000, actual: qAlpha, name: '構造材Qα超過' },
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
          bodyAngle: Math.round(theta * 180 / Math.PI * 10) / 10,
          fpa: Math.round(fpa * 10) / 10,
          mass: Math.round(mass),
          fuel: Math.round(totalFuel),
          downrange: Math.round(downrange),
          stage: currentStage,
          burning: isBurning,
        });
        lastRecord = t;
      }

      // Detect all-stage burnout
      if (!allBurnedOut && stagingState === 'idle') {
        const lastSD = stageData[stageCount - 1];
        if (currentStage >= stageCount - 1 && lastSD.fuelLeft <= 0) {
          allBurnedOut = true;
          burnoutTime = t;
        }
      }

      // Altitude tolerance check after burnout
      if (allBurnedOut) {
        if (alt > targetAltM + altToleranceM) {
          failed = true;
          failReason = '目標高度超過（+' + Math.round((alt - targetAltM) / 1000) + 'km）';
          failTime = t;
          failPart = 'orbit';
          break;
        }
        if (vr < 0 && alt < targetAltM - altToleranceM) {
          failed = true;
          failReason = '目標高度未達（-' + Math.round((targetAltM - alt) / 1000) + 'km）';
          failTime = t;
          failPart = 'orbit';
          break;
        }
        if (t - burnoutTime > COAST_TIMEOUT) {
          break;
        }
      }

      // 成功判定: 近地点・遠地点がともに目標帯域内 = 真の軌道投入
      // （速度だけの判定では近地点が大気圏内の弾道飛行でも成功になってしまう。
      //   peri ≤ 高度 ≤ apo なので、この条件は現在高度が帯域内であることも含意する）
      {
        const oe = orbitElements();
        if (oe && oe.periAlt >= targetAltM - altToleranceM && oe.apoAlt <= targetAltM + altToleranceM) {
          orbitInserted = true;
          break;
        }
      }

      t += dt;
    }

    const peakAltKm = peakAltitude / 1000;
    const finalAlt = h / 1000;
    const finalV = Math.sqrt(vr * vr + vt * vt);
    const displayAlt = orbitInserted ? finalAlt : Math.max(finalAlt, peakAltKm);
    const finalOE = orbitElements();
    let achievedOrbit = !failed && orbitInserted;

    // Payload separation failure — only applies if orbit was achieved
    const payloadFailCheck = baseFailChecks.find(c => c.name === '衛星分離');
    if (achievedOrbit && payloadFailCheck && payloadFailCheck.failed) {
      failed = true;
      failReason = '衛星分離失敗';
      failPart = 'payload';
      failTime = t;
      achievedOrbit = false;
    }

    let totalDryMass = fixedMass;
    for (const sd of stageData) totalDryMass += sd.dryMass;

    // 理想ΔV: 段間構造 i は下段 i と一緒に投棄されるので、その段の乾燥質量側に含める
    const coreFixed = fairing.dryMass + payload.mass + (obc ? obc.dryMass : 0);
    let gameDeltaV = 0;
    for (let i = stageCount - 1; i >= 0; i--) {
      let upperMass = coreFixed;
      for (let j = i + 1; j < stageCount; j++) {
        upperMass += stageData[j].dryMass + stages[j].tank.propellantCapacity;
        if (j < structures.length) upperMass += structures[j].dryMass;
      }
      const stageOwnDry = stageData[i].dryMass + (i < structures.length ? structures[i].dryMass : 0);
      const stageWet = upperMass + stageOwnDry + stages[i].tank.propellantCapacity;
      const stageDry = upperMass + stageOwnDry;
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
      perigee: finalOE ? Math.round(finalOE.periAlt / 100) / 10 : null,
      apogee: finalOE ? Math.round(finalOE.apoAlt / 100) / 10 : null,
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
