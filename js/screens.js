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
          ${this._renderPartSlot('structure', rocket.structure, '段間構造')}
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

    let totalDryMass = r.structure.dryMass + r.fairing.dryMass + r.payload.mass;
    let totalWetMass = totalDryMass;
    for (const stage of r.stages) {
      totalDryMass += stage.engine.dryMass + stage.tank.dryMass;
      totalWetMass += stage.engine.dryMass + stage.tank.dryMass + stage.tank.propellantCapacity;
    }

    let totalDeltaV = 0;
    const fixedMass = r.structure.dryMass + r.fairing.dryMass + r.payload.mass;
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
      default: return '';
    }
  },

  _renderRocketSVG(r) {
    const sc = r.stageCount;
    const stageH = 60;
    const interH = 12;
    const noseH = 50;
    const payloadH = 25;
    const engineH = 35;
    const exhaustH = 20;
    const totalH = noseH + payloadH + sc * (stageH + interH) + engineH + exhaustH;

    let y = 10;
    let svg = `<svg viewBox="0 0 100 ${totalH + 20}" class="rocket-svg" style="height:${Math.min(totalH + 20, 350)}px">
      <defs>
        <linearGradient id="bodyGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#ccc"/>
          <stop offset="50%" stop-color="#fff"/>
          <stop offset="100%" stop-color="#aaa"/>
        </linearGradient>
      </defs>`;

    svg += `<path d="M50 ${y} L35 ${y + noseH} L65 ${y + noseH} Z" fill="url(#bodyGrad)" stroke="${G.RARITY[r.fairing.rarity].color}" stroke-width="1.5"/>`;
    y += noseH;

    svg += `<rect x="35" y="${y}" width="30" height="${payloadH}" fill="#2a2a4a" stroke="${G.RARITY[r.payload.rarity].color}" stroke-width="1.5" rx="2"/>`;
    svg += `<text x="50" y="${y + 16}" text-anchor="middle" fill="${G.RARITY[r.payload.rarity].color}" font-size="7">SAT</text>`;
    y += payloadH;

    for (let i = sc - 1; i >= 0; i--) {
      const s = r.stages[i];
      const tCol = G.RARITY[s.tank.rarity].color;
      const eCol = G.RARITY[s.engine.rarity].color;

      svg += `<rect x="36" y="${y}" width="28" height="${interH}" fill="#444" stroke="${G.RARITY[r.structure.rarity].color}" stroke-width="1" rx="1"/>`;
      y += interH;

      const tankH = stageH - 15;
      svg += `<rect x="33" y="${y}" width="34" height="${tankH}" fill="url(#bodyGrad)" stroke="${tCol}" stroke-width="1.5" rx="3"/>`;
      for (let ln = 1; ln < 3; ln++) {
        const ly = y + (tankH / 3) * ln;
        svg += `<line x1="33" y1="${ly}" x2="67" y2="${ly}" stroke="#999" stroke-width="0.5"/>`;
      }
      y += tankH;

      if (i > 0) {
        svg += `<path d="M38 ${y} L30 ${y + 15} L40 ${y + 12} L50 ${y + 17} L60 ${y + 12} L70 ${y + 15} L62 ${y} Z" fill="#555" stroke="${eCol}" stroke-width="1"/>`;
        y += 15;
      } else {
        svg += `<path d="M38 ${y} L30 ${y + engineH} L40 ${y + engineH - 5} L50 ${y + engineH + 5} L60 ${y + engineH - 5} L70 ${y + engineH} L62 ${y} Z" fill="#555" stroke="${eCol}" stroke-width="1.5"/>`;
        svg += `<ellipse cx="50" cy="${y + engineH + 5}" rx="12" ry="5" fill="#333" stroke="${eCol}" stroke-width="1"/>`;
        svg += `<ellipse cx="50" cy="${y + engineH + 15}" rx="8" ry="12" fill="${eCol}" opacity="0.3"/>`;
        y += engineH + exhaustH;
      }
    }

    svg += '</svg>';
    return svg;
  },

  renderPartSelectModal(category, stageIdx) {
    const parts = G.State.getInventoryParts(category);
    const rocket = G.State.getRocket();
    const current = (stageIdx !== undefined) ? rocket.stages[stageIdx][category] : rocket[category];
    const labels = { engine: 'エンジン', tank: 'タンク', structure: '段間構造', fairing: 'フェアリング', payload: 'ペイロード' };
    const stageLabel = stageIdx !== undefined ? ` (${stageIdx + 1}段目)` : '';
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
          ${site.level >= 2 ? `
          <div class="config-section">
            <div class="config-label">目標傾斜角: <span id="inc-val">${s.get('targetInclination')}</span>°</div>
            <input type="range" min="0" max="90" step="1" value="${s.get('targetInclination')}"
              oninput="G.App.setInclination(this.value)">
          </div>` : ''}
          ${site.level >= 3 ? `
          <div class="config-section">
            <div class="config-label">軌道種別</div>
            <div class="orbit-btns">
              ${G.ORBIT_TYPES.filter(o => o.id !== 'ballistic').map(o => `
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
        </div>
        <div class="speed-control">
          <span class="speed-label">x<span id="speed-val">1</span></span>
          <input type="range" id="speed-slider" min="1" max="20" value="1" step="1"
            oninput="document.getElementById('speed-val').textContent=this.value">
        </div>
        <div class="launch-status" id="launch-status">点火シーケンス開始</div>
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
              ${{engine:'エンジン',tank:'タンク',structure:'構造',fairing:'フェアリング',payload:'衛星'}[c]}
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
          <div class="gacha-category">${{engine:'エンジン',tank:'タンク',structure:'段間構造',fairing:'フェアリング',payload:'ペイロード'}[p.category]}</div>
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
