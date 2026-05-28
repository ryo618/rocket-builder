var G = window.G || {};
window.G = G;

G.Screens = {
  renderHome() {
    const s = G.State;
    const canGacha = s.canDailyGacha();
    return `
      <div class="home-screen">
        <div class="home-header">
          <div class="player-info">
            <div class="player-name">${s.get('playerName')}</div>
            <div class="player-stats">
              <span class="stat-item">🪙 ${s.get('coins')}</span>
              <span class="stat-item">🎫 ${s.get('tickets')}</span>
              <span class="stat-item">🔥 ${s.get('loginStreak')}日</span>
            </div>
          </div>
          <div class="score-display">
            <div class="score-label">累計スコア</div>
            <div class="score-value">${s.get('totalScore').toLocaleString()}</div>
            <div class="score-sub">最高: ${s.get('highScore').toLocaleString()} | 打上: ${s.get('totalLaunches')}回</div>
          </div>
        </div>
        <div class="home-gacha-area ${canGacha ? 'available' : 'used'}">
          ${canGacha ? `
            <button class="gacha-btn pulse" onclick="G.App.showGacha()">
              <div class="gacha-btn-icon">🚀</div>
              <div class="gacha-btn-text">本日のガチャ</div>
              <div class="gacha-btn-sub">タップして引く</div>
            </button>
          ` : `
            <div class="gacha-done">
              <div class="gacha-done-icon">✓</div>
              <div>本日のガチャ済み</div>
            </div>
          `}
          ${s.get('tickets') > 0 ? `
            <button class="ticket-btn" onclick="G.App.useTicket()">
              🎫 チケットガチャ (★3以上確定)
            </button>
          ` : ''}
        </div>
        <div class="home-quick-actions">
          <button class="quick-btn" onclick="G.App.navigate('garage')">
            <span class="quick-icon">🔧</span>
            <span>ガレージ</span>
          </button>
          <button class="quick-btn" onclick="G.App.navigate('launch')">
            <span class="quick-icon">🚀</span>
            <span>打ち上げ</span>
          </button>
        </div>
        <div class="home-next-unlock">
          ${this._renderNextUnlock()}
        </div>
      </div>
    `;
  },

  _renderNextUnlock() {
    const total = G.State.get('totalScore');
    const next = G.SITES.find(s => !G.State.isSiteUnlocked(s.id));
    if (!next) return '<div class="unlock-info">全射点解放済み！</div>';
    const pct = Math.min(100, (total / next.unlockScore) * 100);
    return `
      <div class="unlock-info">
        <div class="unlock-label">次の射点: ${next.name} (スコア ${next.unlockScore.toLocaleString()})</div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
        <div class="unlock-sub">${total.toLocaleString()} / ${next.unlockScore.toLocaleString()}</div>
      </div>
    `;
  },

  renderGarage() {
    const rocket = G.State.getRocketParts();
    const stats = this._calcRocketStats(rocket);
    const sc = rocket.stageCount;
    const stageLabels = { 1: '1段目', 2: '上段', 3: '上段' };
    const bottomLabel = { 1: '', 2: '下段', 3: '下段' };

    let stagesHtml = '';
    for (let i = sc - 1; i >= 0; i--) {
      const s = rocket.stages[i];
      let label;
      if (sc === 1) label = '';
      else if (i === sc - 1) label = sc === 2 ? '2段目 (上段)' : (i + 1) + '段目 (上段)';
      else if (i === 0) label = '1段目 (下段)';
      else label = (i + 1) + '段目 (中段)';

      stagesHtml += `<div class="stage-group">`;
      if (label) stagesHtml += `<div class="stage-label">${label}</div>`;
      stagesHtml += this._renderPartSlot('tank', s.tank, 'タンク', i);
      stagesHtml += this._renderPartSlot('engine', s.engine, 'エンジン', i);
      stagesHtml += `</div>`;
      if (i > 0 && rocket.structures[i - 1]) {
        const si = i - 1;
        const gapLabel = sc === 2 ? '段間構造' : `段間構造 (${si+1}段-${si+2}段)`;
        stagesHtml += this._renderPartSlot('structure', rocket.structures[si], gapLabel, si);
      }
    }

    return `
      <div class="garage-screen">
        <div class="garage-header">
          <h2>ガレージ</h2>
          <div class="rocket-stats-bar">
            <span>総質量: ${stats.totalMass.toLocaleString()}kg</span>
            <span>ΔV: ${stats.deltaV.toLocaleString()}m/s</span>
            <span>T/W: ${stats.tw.toFixed(2)}</span>
          </div>
        </div>
        <div class="stage-count-selector">
          <span class="stage-count-label">段数:</span>
          ${[1,2,3].map(n => `
            <button class="stage-count-btn ${sc === n ? 'active' : ''}"
              onclick="G.App.setStageCount(${n})">${n}段</button>
          `).join('')}
        </div>
        <div class="rocket-builder">
          ${this._renderPartSlot('fairing', rocket.fairing, 'フェアリング')}
          ${this._renderPartSlot('payload', rocket.payload, 'ペイロード')}
          ${rocket.obc ? this._renderPartSlot('obc', rocket.obc, 'OBC') : ''}
          ${stagesHtml}
        </div>
        <div class="rocket-visual">
          ${this._renderRocketSVG(rocket)}
        </div>
      </div>
    `;
  },

  _calcRocketStats(r) {
    const P = G.PHYSICS;
    const Ph = G.Physics;

    let structMass = 0;
    for (const st of (r.structures || [])) structMass += st.dryMass;
    let totalDryMass = structMass + r.fairing.dryMass + r.payload.mass + (r.obc ? r.obc.dryMass : 0);
    let totalWetMass = totalDryMass;
    for (const stage of r.stages) {
      totalDryMass += stage.engine.dryMass + stage.tank.dryMass;
      totalWetMass += stage.engine.dryMass + stage.tank.dryMass + stage.tank.propellantCapacity;
    }

    let totalDeltaV = 0;
    const fixedMass = structMass + r.fairing.dryMass + r.payload.mass + (r.obc ? r.obc.dryMass : 0);
    for (let i = r.stageCount - 1; i >= 0; i--) {
      let upperMass = fixedMass;
      for (let j = i + 1; j < r.stageCount; j++) {
        upperMass += r.stages[j].engine.dryMass + r.stages[j].tank.dryMass + r.stages[j].tank.propellantCapacity;
      }
      const stageWet = upperMass + r.stages[i].engine.dryMass + r.stages[i].tank.dryMass + r.stages[i].tank.propellantCapacity;
      const stageDry = upperMass + r.stages[i].engine.dryMass + r.stages[i].tank.dryMass;
      totalDeltaV += r.stages[i].engine.isp * Ph.GAME_ISP_SCALE * P.g0 * Math.log(stageWet / stageDry);
    }

    const tw = (r.stages[0].engine.seaLevelThrust * 1000 * Ph.GAME_THRUST_SCALE) / (totalWetMass * P.g0);

    return {
      totalMass: totalWetMass,
      dryMass: totalDryMass,
      deltaV: Math.round(totalDeltaV),
      tw: Math.round(tw * 100) / 100,
    };
  },

  _renderPartSlot(category, part, label, stageIdx) {
    const rCol = G.RARITY[part.rarity].color;
    const clickArg = stageIdx !== undefined
      ? `'${category}',${stageIdx}`
      : `'${category}'`;
    return `
      <div class="part-slot" onclick="G.App.openPartSelect(${clickArg})">
        <div class="part-slot-label">${label}</div>
        <div class="part-slot-card" style="border-color:${rCol}">
          <div class="part-rarity" style="color:${rCol}">${G.STAR(part.rarity)}</div>
          <div class="part-name">${part.name}</div>
          <div class="part-brief">${this._partBrief(part)}</div>
        </div>
        <div class="part-slot-change">タップで変更</div>
      </div>
    `;
  },

  _partBrief(p) {
    const failPct = Math.round(G.RARITY[p.rarity].baseFail * 100);
    const failStr = `<span style="color:#ff6666">故障率${failPct}%</span>`;
    switch (p.category) {
      case 'engine': return `推力${p.vacuumThrust}kN / Isp${p.isp}s / ${p.dryMass}kg / ${failStr}`;
      case 'tank': return `容量${p.propellantCapacity}kg / ${p.dryMass}kg / ${failStr}`;
      case 'structure': return `${p.dryMass}kg / ${failStr}`;
      case 'fairing': return `Cd${p.dragCoefficient} / ${p.dryMass}kg / ${failStr}`;
      case 'payload': return `${p.mass}kg / x${p.scoreMultiplier} / ${failStr}`;
      case 'obc': return `${p.dryMass}kg / 信頼性+${Math.round((p.reliabilityBonus||0)*100)}% / ${failStr}`;
      default: return '';
    }
  },

  _renderRocketSVG(r) {
    const sc = r.stageCount;
    const bw = 14; // body width
    const cx = 50; // center x
    const fairH = 35;
    const nozH = 12;
    const interH = 6;
    const exH = 18;
    // Stage heights (bottom stages taller)
    const stgH = [];
    let swTot = 0;
    for (let i = 0; i < sc; i++) { const w = 1 + (sc - 1 - i) * 0.6; stgH.push(w); swTot += w; }
    const bodyZone = bw * 10 - fairH - nozH; // L/D≈10
    for (let i = 0; i < sc; i++) stgH[i] = Math.round(bodyZone * stgH[i] / swTot);
    const totalH = fairH + stgH.reduce((a,b)=>a+b,0) + Math.max(0,sc-1)*interH + nozH + exH + 10;

    let y = 5;
    const fCol = G.RARITY[r.fairing.rarity].color;
    const pCol = G.RARITY[r.payload.rarity].color;
    let svg = `<svg viewBox="0 0 100 ${totalH}" class="rocket-svg" style="height:${Math.min(totalH, 400)}px">
      <defs>
        <linearGradient id="metalG" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#999"/><stop offset="35%" stop-color="#ddd"/>
          <stop offset="50%" stop-color="#eee"/><stop offset="65%" stop-color="#ddd"/>
          <stop offset="100%" stop-color="#999"/>
        </linearGradient>
      </defs>`;

    // Ogive fairing
    const fl = cx - bw/2, fr = cx + bw/2;
    svg += `<path d="M${cx} ${y} C${cx-1} ${y+fairH*0.25},${fl+1} ${y+fairH*0.55},${fl} ${y+fairH} L${fr} ${y+fairH} C${fr-1} ${y+fairH*0.55},${cx+1} ${y+fairH*0.25},${cx} ${y}" fill="url(#metalG)" stroke="${fCol}" stroke-width="1.2"/>`;
    svg += `<line x1="${cx}" y1="${y}" x2="${cx}" y2="${y+fairH}" stroke="#aaa" stroke-width="0.4"/>`;
    // Payload inside fairing
    svg += `<rect x="${cx-bw*0.3}" y="${y+fairH-12}" width="${bw*0.6}" height="8" fill="#2a2a4a" stroke="${pCol}" stroke-width="0.8" rx="1"/>`;
    svg += `<text x="${cx}" y="${y+fairH-5}" text-anchor="middle" fill="${pCol}" font-size="5">SAT</text>`;
    y += fairH;

    // Stages (top to bottom)
    for (let si = sc - 1; si >= 0; si--) {
      const s = r.stages[si];
      const tCol = G.RARITY[s.tank.rarity].color;
      const eCol = G.RARITY[s.engine.rarity].color;
      const h = stgH[si];
      const wMult = 1.0 + (sc - 1 - si) * 0.02;
      const sw = bw * wMult / 2;

      // Stage body
      svg += `<rect x="${cx-sw}" y="${y}" width="${sw*2}" height="${h}" fill="url(#metalG)" stroke="${tCol}" stroke-width="1" rx="1"/>`;
      // Tank section lines
      if (h > 20) {
        for (let ln = 1; ln < 3; ln++) {
          const ly = y + (h/3)*ln;
          svg += `<line x1="${cx-sw}" y1="${ly}" x2="${cx+sw}" y2="${ly}" stroke="#999" stroke-width="0.3"/>`;
        }
      }
      // Engine label
      svg += `<rect x="${cx-sw+0.5}" y="${y+h-6}" width="${sw*2-1}" height="5" fill="#555" stroke="${eCol}" stroke-width="0.6" rx="0.5"/>`;
      y += h;

      // Interstage joint
      if (si > 0) {
        const structP = r.structures && r.structures[si-1] ? r.structures[si-1] : null;
        const sCol = structP ? G.RARITY[structP.rarity].color : '#666';
        const jw = sw * 1.1;
        svg += `<rect x="${cx-jw}" y="${y}" width="${jw*2}" height="${interH}" fill="#555" stroke="${sCol}" stroke-width="0.8" rx="0.5"/>`;
        y += interH;
      }
    }

    // Engine nozzle
    const ntw = bw * 0.35, nbw = bw * 0.5;
    const eCol = G.RARITY[r.stages[0].engine.rarity].color;
    svg += `<path d="M${cx-ntw} ${y} L${cx-nbw} ${y+nozH} L${cx+nbw} ${y+nozH} L${cx+ntw} ${y} Z" fill="#555" stroke="${eCol}" stroke-width="0.8"/>`;
    y += nozH;

    // Exhaust glow
    svg += `<ellipse cx="${cx}" cy="${y+exH/2}" rx="${nbw*0.7}" ry="${exH/2}" fill="${eCol}" opacity="0.25"/>`;

    svg += '</svg>';
    return svg;
  },

  renderPartSelectModal(category, stageIdx) {
    const parts = G.State.getInventoryParts(category);
    const rocket = G.State.getRocket();
    let current;
    if (category === 'structure' && stageIdx !== undefined) {
      current = (rocket.structures || [])[stageIdx];
    } else if (stageIdx !== undefined) {
      current = rocket.stages[stageIdx][category];
    } else {
      current = rocket[category];
    }
    const labels = { engine: 'エンジン', tank: 'タンク', structure: '段間構造', fairing: 'フェアリング', payload: 'ペイロード', obc: 'OBC' };
    let stageLabel = '';
    if (stageIdx !== undefined) {
      stageLabel = category === 'structure' ? ` (${stageIdx+1}段-${stageIdx+2}段)` : ` (${stageIdx + 1}段目)`;
    }
    const selectArg = stageIdx !== undefined ? `,'${category}',${stageIdx}` : `,'${category}'`;

    return `
      <div class="modal-overlay" onclick="G.App.closeModal()">
        <div class="modal-content" onclick="event.stopPropagation()">
          <div class="modal-header">
            <h3>${labels[category]}選択${stageLabel}</h3>
            <button class="modal-close" onclick="G.App.closeModal()">✕</button>
          </div>
          <div class="part-list">
            ${parts.sort((a, b) => b.rarity - a.rarity).map(p => `
              <div class="part-list-item ${p.id === current ? 'selected' : ''}" onclick="G.App.selectPart('${p.id}'${selectArg})" style="border-left: 3px solid ${G.RARITY[p.rarity].color}">
                <div class="part-list-rarity" style="color:${G.RARITY[p.rarity].color}">${G.STAR(p.rarity)}</div>
                <div class="part-list-name">${p.name}</div>
                <div class="part-list-stats">${this._partDetail(p)}</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  },

  _partDetail(p) {
    const failPct = Math.round(G.RARITY[p.rarity].baseFail * 100);
    const failStr = `<span style="color:#ff6666">故障率: ${failPct}%</span>`;
    switch (p.category) {
      case 'engine': return `真空推力: ${p.vacuumThrust}kN | 海面推力: ${p.seaLevelThrust}kN | Isp: ${p.isp}s | 質量: ${p.dryMass}kg | 流量: ${p.massFlowRate}kg/s | ${failStr}`;
      case 'tank': return `容量: ${p.propellantCapacity}kg | 乾燥質量: ${p.dryMass}kg | 推進剤: ${p.propellantType} | ${failStr}`;
      case 'structure': return `乾燥質量: ${p.dryMass}kg | 接続強度: ${p.connectionStrength} | ${failStr}`;
      case 'fairing': return `Cd: ${p.dragCoefficient} | 面積: ${p.referenceArea}m² | 質量: ${p.dryMass}kg | ${failStr}`;
      case 'payload': return `質量: ${p.mass}kg | スコア倍率: x${p.scoreMultiplier} | 耐加速度: ${p.maxAccel}G | ${failStr}`;
      case 'obc': return `質量: ${p.dryMass}kg | 誘導精度: +${Math.round((p.guidanceBonus||0)*100)}% | 信頼性: +${Math.round((p.reliabilityBonus||0)*100)}% | ${failStr}`;
      default: return '';
    }
  },

  renderLaunch() {
    const s = G.State;
    const siteId = s.get('selectedSite');
    const site = G.SITES.find(st => st.id === siteId);
    const rocket = s.getRocketParts();
    const stats = this._calcRocketStats(rocket);

    return `
      <div class="launch-screen">
        <div class="launch-header">
          <h2>打ち上げ</h2>
        </div>
        <div class="launch-config">
          <div class="config-section">
            <div class="config-label">射点選択</div>
            <div class="site-list">
              ${G.SITES.map(st => `
                <button class="site-btn ${st.id === siteId ? 'active' : ''} ${G.State.isSiteUnlocked(st.id) ? '' : 'locked'}"
                  onclick="G.App.selectSite('${st.id}')"
                  ${G.State.isSiteUnlocked(st.id) ? '' : 'disabled'}>
                  <div class="site-name">Lv${st.level} ${st.name}</div>
                  <div class="site-mult">x${st.multiplier}</div>
                  ${!G.State.isSiteUnlocked(st.id) ? `<div class="site-lock">🔒 ${st.unlockScore.toLocaleString()}pt</div>` : ''}
                </button>
              `).join('')}
            </div>
          </div>
          <div class="config-section">
            <div class="config-label">目標高度: <span id="alt-val">${s.get('targetAltitude')}</span> km</div>
            <input type="range" min="150" max="2000" step="10" value="${s.get('targetAltitude')}"
              oninput="G.App.setAltitude(this.value)">
          </div>
          ${site.level >= 2 ? (() => {
            const isSSO = s.get('targetOrbitType') === 'sso' && site.level >= 3;
            const ssoInc = G.ssoInclination(s.get('targetAltitude'));
            return `
          <div class="config-section">
            <div class="config-label">目標傾斜角: <span id="inc-val">${isSSO ? ssoInc : s.get('targetInclination')}</span>°${isSSO ? ' (SSO自動)' : ''}</div>
            <input type="range" min="0" max="90" step="1" value="${isSSO ? ssoInc : s.get('targetInclination')}"
              oninput="G.App.setInclination(this.value)" ${isSSO ? 'disabled' : ''}>
          </div>`;
          })() : ''}
          ${site.level >= 3 ? `
          <div class="config-section">
            <div class="config-label">軌道種別</div>
            <div class="orbit-btns">
              ${G.ORBIT_TYPES.filter(o => o.id !== 'ballistic' && (!o.minLevel || site.level >= o.minLevel)).map(o => `
                <button class="orbit-btn ${s.get('targetOrbitType') === o.id ? 'active' : ''}"
                  onclick="G.App.setOrbitType('${o.id}')">
                  ${o.name} (x${o.multiplier})
                </button>
              `).join('')}
            </div>
          </div>` : ''}
          <div class="launch-summary">
            <div>${rocket.stageCount}段式 | ${stats.totalMass.toLocaleString()}kg | ΔV: ${stats.deltaV.toLocaleString()}m/s | T/W: ${stats.tw}</div>
            <div>射点倍率: x${site.multiplier} | 投入精度: ±${site.altTolerance}km ${site.limitsEnabled ? '| ⚠️ 運用限界有効' : ''}</div>
          </div>
        </div>
        <button class="launch-btn" onclick="G.App.launch()">
          <div class="launch-btn-text">打ち上げ</div>
          <div class="launch-btn-sub">3... 2... 1... LAUNCH!</div>
        </button>
      </div>
    `;
  },

  renderLaunchAnimation() {
    return `
      <div class="launch-anim-screen">
        <canvas id="launch-canvas"></canvas>
        <div class="telemetry-overlay" id="telemetry">
          <div class="telem-row"><span class="telem-label">T+</span><span id="tl-time">0.0s</span></div>
          <div class="telem-row"><span class="telem-label">高度</span><span id="tl-alt">0 km</span></div>
          <div class="telem-row"><span class="telem-label">距離</span><span id="tl-dr">0 km</span></div>
          <div class="telem-row"><span class="telem-label">速度</span><span id="tl-vel">0 m/s</span></div>
          <div class="telem-row"><span class="telem-label">動圧Q</span><span id="tl-q">0 Pa</span></div>
          <div class="telem-row"><span class="telem-label">加速度</span><span id="tl-acc">0 G</span></div>
          <div class="telem-row"><span class="telem-label">経路角</span><span id="tl-pitch">90°</span></div>
          <div class="telem-row"><span class="telem-label">段</span><span id="tl-stage">1</span></div>
          <div class="telem-row"><span class="telem-label">残燃料</span><span id="tl-fuel">100%</span></div>
          <div class="telem-row"><span class="telem-label">Ap</span><span id="tl-ap">-- km</span></div>
          <div class="telem-row"><span class="telem-label">Pe</span><span id="tl-pe">-- km</span></div>
        </div>
        <div class="speed-control" id="speed-control">
          <span class="speed-label">x<span id="speed-val">1</span></span>
          <input type="range" id="speed-slider" min="1" max="20" value="1" step="1"
            oninput="document.getElementById('speed-val').textContent=this.value">
        </div>
        <button class="liftoff-btn" id="liftoff-btn">LIFTOFF</button>
        <div class="launch-status" id="launch-status">打ち上げ準備完了</div>
      </div>
    `;
  },

  renderResults(simResult, scoreResult, rocketParts, site) {
    const success = simResult.success;
    return `
      <div class="results-screen">
        <div class="results-header ${success ? 'success' : 'failure'}">
          <div class="results-icon">${success ? '🎉' : '💥'}</div>
          <div class="results-title">${success ? 'ミッション成功！' : 'ミッション失敗'}</div>
          ${!success && simResult.failReason ? `<div class="results-fail-reason">${simResult.failReason} (T+${simResult.failTime}s)</div>` : ''}
        </div>
        <div class="results-score">
          <div class="score-big">${scoreResult.total.toLocaleString()} pt</div>
        </div>
        <div class="results-breakdown">
          <div class="breakdown-row"><span>基礎スコア</span><span>${scoreResult.base.toLocaleString()}</span></div>
          <div class="breakdown-row"><span>軌道倍率</span><span>x${scoreResult.orbitMult}</span></div>
          <div class="breakdown-row"><span>傾斜角倍率</span><span>x${scoreResult.incMult}</span></div>
          <div class="breakdown-row"><span>射点倍率</span><span>x${scoreResult.siteMult}</span></div>
          <div class="breakdown-row"><span>成功ボーナス</span><span>x${scoreResult.successBonus}</span></div>
          <div class="breakdown-row"><span>軽量ボーナス</span><span>x${scoreResult.lightBonus}</span></div>
          <div class="breakdown-row"><span>衛星倍率</span><span>x${scoreResult.scoreMult}</span></div>
        </div>
        <div class="results-flight">
          <h3>フライトデータ</h3>
          <div class="flight-stats">
            <div class="fstat"><span>最終高度</span><span>${simResult.finalAltitude} km</span></div>
            <div class="fstat"><span>最終速度</span><span>${simResult.finalVelocity.toLocaleString()} m/s</span></div>
            <div class="fstat"><span>軌道速度</span><span>${simResult.orbitalVelocity.toLocaleString()} m/s</span></div>
            <div class="fstat"><span>最大動圧</span><span>${simResult.maxQ.toLocaleString()} Pa</span></div>
            <div class="fstat"><span>最大加速度</span><span>${simResult.maxAccelG} G</span></div>
            <div class="fstat"><span>燃焼時間</span><span>${simResult.burnTime} s</span></div>
            <div class="fstat"><span>総飛行時間</span><span>${simResult.totalTime} s</span></div>
            <div class="fstat"><span>ΔV</span><span>${simResult.deltaV.toLocaleString()} m/s</span></div>
          </div>
          ${simResult.flightData.length > 0 ? `
          <div class="flight-chart-area">
            <canvas id="flight-chart" width="350" height="200"></canvas>
          </div>` : ''}
        </div>
        <div class="results-actions">
          <button class="btn-primary" onclick="G.App.navigate('garage')">ガレージへ</button>
          <button class="btn-secondary" onclick="G.App.navigate('launch')">再打ち上げ</button>
          <button class="btn-secondary" onclick="G.App.navigate('home')">ホームへ</button>
        </div>
      </div>
    `;
  },

  renderRecords() {
    const flights = G.State.get('flights');
    return `
      <div class="records-screen">
        <div class="records-header">
          <h2>記録</h2>
          <div class="records-summary">
            成功: ${G.State.get('successfulLaunches')} / ${G.State.get('totalLaunches')} 回
          </div>
        </div>
        <div class="flight-list">
          ${flights.length === 0 ? '<div class="empty-msg">まだフライト記録がありません</div>' : ''}
          ${flights.map((f, i) => `
            <div class="flight-card ${f.success ? 'success' : 'failure'}">
              <div class="flight-card-header">
                <span class="flight-num">#${G.State.get('totalLaunches') - i}</span>
                <span class="flight-status">${f.success ? '✓ 成功' : '✗ 失敗'}</span>
                <span class="flight-score">${f.score.toLocaleString()} pt</span>
              </div>
              <div class="flight-card-body">
                <span>高度: ${f.altitude}km</span>
                <span>射点: ${f.siteName}</span>
                <span>${f.date}</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  },

  renderCollection() {
    const inv = G.State.get('inventory');
    return `
      <div class="collection-screen">
        <div class="collection-header">
          <h2>コレクション</h2>
          <div class="collection-count">${inv.length} / ${G.ALL_PARTS.length}</div>
        </div>
        <div class="collection-tabs">
          ${G.CATEGORIES.map(c => `
            <button class="col-tab" onclick="G.App.showCollectionTab('${c}')"
              data-cat="${c}">
              ${{engine:'エンジン',tank:'タンク',structure:'構造',fairing:'フェアリング',payload:'衛星',obc:'OBC'}[c]}
            </button>
          `).join('')}
        </div>
        <div id="collection-grid" class="collection-grid">
          ${this._renderCollectionGrid('engine')}
        </div>
      </div>
    `;
  },

  _renderCollectionGrid(category) {
    const inv = G.State.get('inventory');
    const parts = G.PARTS[category];
    return parts.map(p => {
      const owned = inv.includes(p.id);
      const rCol = G.RARITY[p.rarity].color;
      return `
        <div class="col-card ${owned ? 'owned' : 'locked'}" style="border-color:${owned ? rCol : '#333'}">
          <div class="col-rarity" style="color:${owned ? rCol : '#555'}">${G.STAR(p.rarity)}</div>
          <div class="col-name">${owned ? p.name : '???'}</div>
          ${owned ? `<div class="col-stats">${this._partBrief(p)}</div>` : '<div class="col-locked">未入手</div>'}
        </div>
      `;
    }).join('');
  },

  renderGachaResult(result) {
    const p = result.part;
    const rCol = G.RARITY[p.rarity].color;
    const rBg = G.RARITY[p.rarity].bg;
    return `
      <div class="gacha-result-overlay" onclick="G.App.closeGachaResult()">
        <div class="gacha-result-card" style="border-color:${rCol};background:${rBg}" onclick="event.stopPropagation()">
          <div class="gacha-rarity" style="color:${rCol}">${G.STAR(p.rarity)} ${G.RARITY[p.rarity].name}</div>
          <div class="gacha-part-name">${p.name}</div>
          <div class="gacha-category">${{engine:'エンジン',tank:'タンク',structure:'段間構造',fairing:'フェアリング',payload:'ペイロード',obc:'OBC'}[p.category]}</div>
          <div class="gacha-stats">${this._partDetail(p)}</div>
          ${result.isNew ? '<div class="gacha-new">NEW!</div>' : ''}
          ${result.isDupe ? `<div class="gacha-dupe">所持済み → +${result.coins}コイン</div>` : ''}
          <button class="btn-primary" onclick="G.App.closeGachaResult()">OK</button>
        </div>
      </div>
    `;
  },

  drawFlightChart(canvas, flightData) {
    if (!canvas || flightData.length < 2) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const maxAlt = Math.max(...flightData.map(d => d.alt)) || 1;
    const maxV = Math.max(...flightData.map(d => d.v)) || 1;
    const maxT = flightData[flightData.length - 1].t || 1;

    ctx.strokeStyle = '#2196f3';
    ctx.lineWidth = 2;
    ctx.beginPath();
    flightData.forEach((d, i) => {
      const x = (d.t / maxT) * w;
      const y = h - (d.alt / maxAlt) * (h - 20) - 10;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.strokeStyle = '#ff5722';
    ctx.lineWidth = 2;
    ctx.beginPath();
    flightData.forEach((d, i) => {
      const x = (d.t / maxT) * w;
      const y = h - (d.v / maxV) * (h - 20) - 10;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.fillStyle = '#2196f3';
    ctx.font = '10px monospace';
    ctx.fillText(`高度 (max ${(maxAlt / 1000).toFixed(0)}km)`, 5, 12);
    ctx.fillStyle = '#ff5722';
    ctx.fillText(`速度 (max ${(maxV).toFixed(0)}m/s)`, w / 2, 12);
  },
};
