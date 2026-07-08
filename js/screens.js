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

  _renderWorldMap(siteId) {
    // viewBox 1000x500, equirectangular: x=(lon+180)*1000/360, y=(90-lat)*500/180
    const VW = 1000, VH = 500;
    const lonToX = lon => (lon + 180) * VW / 360;
    const latToY = lat => (90 - lat) * VH / 180;

    const pinDefs = [
      { id: 'lv1', lon: 0, label: 'Lv1 赤道' },
      { id: 'lv2', lon: -80, label: 'Lv2 低緯度' },
      { id: 'lv3', lon: 30, label: 'Lv3 中緯度' },
      { id: 'lv35', lon: 100, label: 'Lv3.5 訓練' },
      { id: 'lv4', lon: -50, label: 'Lv4 高緯度' },
      { id: 'lv5', lon: 131, label: 'Lv5 種子島' },
    ];
    const pins = pinDefs.map(pd => {
      const st = G.SITES.find(s => s.id === pd.id);
      const x = lonToX(pd.lon);
      const y = latToY(st.lat);
      const unlocked = G.State.isSiteUnlocked(st.id);
      const active = st.id === siteId;
      return { ...pd, st, x, y, unlocked, active };
    });

    const selectedPin = pins.find(p => p.active);
    const selectedSite = selectedPin ? selectedPin.st : null;

    // Pre-computed continent SVG paths (equirectangular, viewBox 0 0 1000 500)
    // Generated from real lat/lon: x=(lon+180)*1000/360, y=(90-lat)*500/180
    const CF = '#1e2a4a';
    const continents = [
      // North America (Alaska, Arctic, Hudson Bay, Labrador, East coast, Florida, Gulf, Mexico, Baja, Pacific)
      'M33.3,94.4 L61.1,88.9 L83.3,83.3 L91.7,80.6 L91.7,72.2 L69.4,63.9 L63.9,52.8 L88.9,52.8 L108.3,55.6 L122.2,58.3 L138.9,55.6 L166.7,58.3 L186.1,63.9 L233.3,72.2 L238.9,75.0 L244.4,80.6 L252.8,86.1 L261.1,91.7 L272.2,97.2 L277.8,97.2 L280.6,91.7 L283.3,83.3 L286.1,75.0 L300.0,80.6 L322.2,86.1 L333.3,94.4 L341.7,102.8 L347.2,113.9 L352.8,119.4 L333.3,122.2 L316.7,127.8 L305.6,130.6 L300.0,136.1 L294.4,138.9 L291.7,144.4 L288.9,150.0 L286.1,155.6 L277.8,161.1 L275.0,166.7 L277.8,172.2 L277.8,180.6 L272.2,180.6 L269.4,175.0 L263.9,169.4 L261.1,166.7 L252.8,166.7 L247.2,169.4 L238.9,169.4 L230.6,175.0 L230.6,180.6 L230.6,188.9 L230.6,194.4 L236.1,200.0 L247.2,197.2 L258.3,191.7 L255.6,200.0 L255.6,205.6 L255.6,211.1 L266.7,216.7 L277.8,222.2 L280.6,225.0 L266.7,225.0 L261.1,219.4 L250.0,211.1 L233.3,205.6 L219.4,200.0 L208.3,194.4 L194.4,186.1 L188.9,177.8 L183.3,172.2 L177.8,166.7 L175.0,161.1 L172.2,155.6 L161.1,150.0 L158.3,144.4 L155.6,133.3 L155.6,122.2 L155.6,113.9 L144.4,105.6 L133.3,97.2 L122.2,91.7 L111.1,86.1 L94.4,83.3 L77.8,86.1 L63.9,91.7 L47.2,94.4 L33.3,94.4Z',
      // Greenland
      'M402.8,19.4 L444.4,22.2 L450.0,33.3 L444.4,44.4 L433.3,55.6 L397.2,66.7 L380.6,77.8 L375.0,83.3 L366.7,80.6 L355.6,72.2 L347.2,61.1 L341.7,50.0 L311.1,38.9 L305.6,30.6 L347.2,22.2 L402.8,19.4Z',
      // South America
      'M300.0,216.7 L311.1,219.4 L325.0,222.2 L333.3,227.8 L352.8,236.1 L361.1,244.4 L363.9,250.0 L377.8,255.6 L402.8,263.9 L402.8,272.2 L391.7,286.1 L388.9,300.0 L386.1,311.1 L366.7,319.4 L358.3,333.3 L341.7,347.2 L327.8,361.1 L313.9,377.8 L308.3,388.9 L305.6,397.2 L311.1,402.8 L313.9,400.0 L305.6,394.4 L291.7,383.3 L294.4,369.4 L297.2,355.6 L300.0,341.7 L302.8,325.0 L305.6,311.1 L302.8,300.0 L288.9,288.9 L277.8,269.4 L277.8,258.3 L280.6,250.0 L286.1,241.7 L286.1,230.6 L286.1,225.0 L288.9,222.2 L294.4,219.4 L300.0,216.7Z',
      // Eurasia mainland (Europe + Scandinavia + Russia + Asia as one connected path)
      // Iberia→Atlantic coast→Scandinavia→Russia Arctic→Siberia→Kamchatka→Pacific→China→SE Asia→India→Middle East→Turkey→Mediterranean→Iberia
      'M475.0,150.0 L477.8,147.2 L480.6,144.4 L488.9,138.9 L491.7,133.3 L500.0,130.6 L497.2,127.8 L494.4,119.4 L486.1,116.7 L497.2,113.9 L505.6,108.3 L511.1,105.6 L522.2,100.0 L527.8,97.2 L522.2,91.7 L513.9,83.3 L519.4,75.0 L536.1,66.7 L544.4,61.1 L555.6,55.6 L572.2,52.8 L583.3,55.6 L591.7,58.3 L583.3,66.7 L583.3,75.0 L586.1,80.6 L594.4,77.8 L608.3,75.0 L622.2,77.8 L636.1,80.6 L647.2,80.6 L658.3,83.3 L683.3,77.8 L708.3,69.4 L700.0,55.6 L722.2,47.2 L766.7,38.9 L791.7,44.4 L813.9,50.0 L847.2,47.2 L875.0,50.0 L888.9,52.8 L944.4,58.3 L972.2,69.4 L958.3,77.8 L952.8,83.3 L952.8,94.4 L938.9,105.6 L930.6,100.0 L894.4,97.2 L891.7,105.6 L888.9,113.9 L883.3,122.2 L869.4,130.6 L863.9,133.3 L855.6,141.7 L861.1,147.2 L858.3,152.8 L850.0,152.8 L852.8,147.2 L850.0,141.7 L866.7,130.6 L836.1,138.9 L838.9,147.2 L833.3,152.8 L838.9,163.9 L836.1,175.0 L825.0,186.1 L805.6,191.7 L800.0,188.9 L794.4,194.4 L800.0,205.6 L802.8,216.7 L791.7,227.8 L788.9,222.2 L780.6,213.9 L777.8,227.8 L777.8,230.6 L772.2,222.2 L769.4,205.6 L758.3,197.2 L755.6,188.9 L744.4,188.9 L733.3,200.0 L722.2,213.9 L713.9,227.8 L711.1,219.4 L705.6,208.3 L702.8,194.4 L688.9,186.1 L683.3,180.6 L672.2,180.6 L658.3,175.0 L655.6,177.8 L641.7,183.3 L638.9,175.0 L633.3,166.7 L622.2,158.3 L600.0,147.2 L597.2,155.6 L594.4,163.9 L591.7,172.2 L588.9,163.9 L588.9,155.6 L583.3,150.0 L577.8,147.2 L572.2,138.9 L566.7,144.4 L566.7,147.2 L561.1,150.0 L555.6,144.4 L552.8,138.9 L544.4,133.3 L536.1,127.8 L538.9,122.2 L536.1,100.0 L527.8,119.4 L516.7,122.2 L513.9,127.8 L508.3,130.6 L508.3,133.3 L500.0,138.9 L497.2,144.4 L494.4,147.2 L486.1,150.0 L475.0,150.0Z',
      // Great Britain
      'M486.1,111.1 L502.8,108.3 L500.0,102.8 L494.4,97.2 L494.4,91.7 L486.1,88.9 L483.3,91.7 L486.1,94.4 L486.1,97.2 L491.7,100.0 L488.9,102.8 L488.9,105.6 L491.7,108.3 L486.1,111.1Z',
      // Ireland
      'M472.2,105.6 L483.3,102.8 L483.3,100.0 L477.8,97.2 L472.2,100.0 L472.2,105.6Z',
      // Italy (boot shape)
      'M522.2,127.8 L530.6,122.2 L533.3,125.0 L533.3,127.8 L538.9,130.6 L544.4,133.3 L550.0,138.9 L544.4,138.9 L544.4,144.4 L541.7,144.4 L547.2,141.7 L536.1,144.4 L538.9,138.9 L536.1,136.1 L530.6,133.3 L522.2,127.8Z',
      // Sicily
      'M536.1,144.4 L538.9,147.2 L541.7,147.2 L541.7,144.4 L536.1,144.4Z',
      // Africa
      'M486.1,150.0 L494.4,155.6 L527.8,147.2 L533.3,158.3 L569.4,163.9 L588.9,163.9 L594.4,172.2 L602.8,188.9 L616.7,208.3 L622.2,216.7 L625.0,222.2 L636.1,236.1 L625.0,244.4 L616.7,252.8 L611.1,266.7 L611.1,280.6 L613.9,291.7 L597.2,311.1 L591.7,322.2 L586.1,333.3 L572.2,344.4 L550.0,344.4 L547.2,336.1 L541.7,327.8 L538.9,311.1 L533.3,297.2 L538.9,283.3 L533.3,266.7 L525.0,250.0 L525.0,238.9 L519.4,238.9 L508.3,233.3 L497.2,236.1 L486.1,236.1 L477.8,227.8 L463.9,227.8 L455.6,219.4 L452.8,208.3 L452.8,191.7 L463.9,172.2 L475.0,161.1 L486.1,150.0Z',
      // Madagascar
      'M636.1,283.3 L638.9,294.4 L625.0,305.6 L630.6,319.4 L622.2,316.7 L622.2,300.0 L633.3,288.9 L636.1,283.3Z',
      // (Asia removed — merged into Eurasia above)
      // Arabian Peninsula
      'M597.2,172.2 L602.8,188.9 L616.7,205.6 L625.0,213.9 L636.1,211.1 L650.0,202.8 L666.7,188.9 L655.6,177.8 L641.7,183.3 L638.9,175.0 L633.3,166.7 L630.6,163.9 L616.7,169.4 L597.2,172.2Z',
      // Sri Lanka
      'M722.2,225.0 L727.8,227.8 L725.0,233.3 L722.2,230.6 L722.2,225.0Z',
      // Japan Honshu
      'M869.4,152.8 L875.0,155.6 L880.6,155.6 L888.9,152.8 L891.7,144.4 L888.9,136.1 L888.9,138.9 L883.3,141.7 L880.6,147.2 L877.8,150.0 L869.4,152.8Z',
      // Hokkaido
      'M888.9,133.3 L891.7,130.6 L894.4,125.0 L902.8,125.0 L902.8,130.6 L897.2,133.3 L888.9,133.3Z',
      // Kyushu
      'M861.1,158.3 L866.7,158.3 L863.9,163.9 L861.1,161.1 L861.1,158.3Z',
      // Taiwan
      'M836.1,180.6 L836.1,186.1 L836.1,188.9 L833.3,186.1 L836.1,180.6Z',
      // Philippines
      'M836.1,200.0 L833.3,208.3 L838.9,213.9 L844.4,222.2 L850.0,230.6 L850.0,233.3 L844.4,227.8 L844.4,219.4 L836.1,211.1 L836.1,200.0Z',
      // Borneo
      'M825.0,230.6 L827.8,233.3 L827.8,244.4 L827.8,252.8 L822.2,258.3 L805.6,252.8 L802.8,250.0 L805.6,244.4 L819.4,236.1 L825.0,230.6Z',
      // Sumatra
      'M772.2,236.1 L775.0,241.7 L780.6,250.0 L788.9,255.6 L791.7,263.9 L791.7,266.7 L786.1,263.9 L780.6,255.6 L775.0,247.2 L769.4,241.7 L772.2,236.1Z',
      // Java
      'M794.4,266.7 L797.2,269.4 L805.6,272.2 L813.9,272.2 L816.7,269.4 L811.1,266.7 L805.6,266.7 L794.4,266.7Z',
      // Sulawesi
      'M833.3,252.8 L838.9,250.0 L844.4,252.8 L838.9,255.6 L833.3,263.9 L833.3,258.3 L833.3,252.8Z',
      // New Guinea
      'M866.7,252.8 L880.6,255.6 L883.3,261.1 L891.7,266.7 L902.8,269.4 L911.1,272.2 L911.1,266.7 L902.8,263.9 L894.4,261.1 L891.7,255.6 L880.6,250.0 L866.7,252.8Z',
      // Malay Peninsula
      'M777.8,230.6 L777.8,236.1 L783.3,241.7 L786.1,244.4 L788.9,247.2 L788.9,244.4 L783.3,238.9 L780.6,233.3 L777.8,230.6Z',
      // Australia
      'M866.7,280.6 L877.8,283.3 L877.8,288.9 L888.9,297.2 L891.7,291.7 L894.4,280.6 L894.4,277.8 L900.0,286.1 L905.6,294.4 L908.3,302.8 L916.7,313.9 L925.0,325.0 L922.2,341.7 L916.7,352.8 L902.8,355.6 L888.9,352.8 L880.6,347.2 L872.2,341.7 L861.1,344.4 L850.0,344.4 L836.1,338.9 L822.2,344.4 L819.4,336.1 L816.7,327.8 L813.9,316.7 L827.8,305.6 L838.9,297.2 L852.8,288.9 L863.9,283.3 L866.7,280.6Z',
      // Tasmania
      'M902.8,363.9 L905.6,366.7 L908.3,369.4 L905.6,369.4 L902.8,366.7 L902.8,363.9Z',
      // NZ North Island
      'M983.3,347.2 L986.1,352.8 L994.4,358.3 L986.1,363.9 L983.3,358.3 L983.3,352.8 L983.3,347.2Z',
      // NZ South Island
      'M977.8,363.9 L972.2,369.4 L963.9,377.8 L972.2,377.8 L977.8,372.2 L980.6,366.7 L977.8,363.9Z',
      // Iceland
      'M436.1,66.7 L450.0,69.4 L461.1,72.2 L461.1,69.4 L450.0,66.7 L436.1,66.7Z',
    ].map(d => `<path d="${d}" fill="${CF}"/>`).join('\n      ')
      + '\n      <path d="M0,478 L30,474 60,472 90,470 120,468 150,470 180,472 210,470 240,468 270,466 300,468 330,470 360,468 390,466 420,468 450,470 480,468 510,466 540,468 570,470 600,472 630,470 660,468 690,470 720,472 750,474 780,472 810,474 840,476 870,478 900,476 930,474 960,476 1000,478 L1000,500 L0,500Z" fill="#161f38"/>';
    const pinsSvg = pins.map(p => {
      const cls = p.active ? 'map-pin active' : (p.unlocked ? 'map-pin' : 'map-pin locked');
      const onclick = p.unlocked ? `onclick="G.App.selectSite('${p.id}')"` : '';
      return `
        <g class="${cls}" data-site="${p.id}" ${onclick} style="cursor:${p.unlocked ? 'pointer' : 'not-allowed'}">
          ${p.unlocked ? `
            <circle cx="${p.x}" cy="${p.y}" r="8" class="pin-dot"/>
            <circle cx="${p.x}" cy="${p.y}" r="14" class="pin-ring"/>
          ` : `
            <circle cx="${p.x}" cy="${p.y}" r="8" class="pin-dot"/>
            <text x="${p.x}" y="${p.y + 5}" class="pin-lock" text-anchor="middle" font-size="12">&#x1F512;</text>
          `}
          <text x="${p.x}" y="${p.y - 18}" class="pin-label" text-anchor="middle" font-size="13">${p.label}</text>
        </g>
      `;
    }).join('');

    // Grid lines (latitude and longitude)
    let gridLines = '';
    // Latitude lines
    for (const lat of [-60, -30, 0, 30, 60]) {
      const gy = latToY(lat);
      const isEq = lat === 0;
      gridLines += `<line x1="0" y1="${gy}" x2="${VW}" y2="${gy}" stroke="${isEq ? '#2a2a4a' : '#141428'}" stroke-width="${isEq ? 1 : 0.6}" stroke-dasharray="${isEq ? '8,4' : '4,6'}"/>`;
    }
    // Longitude lines
    for (let lon = -150; lon <= 180; lon += 30) {
      const gx = lonToX(lon);
      gridLines += `<line x1="${gx}" y1="0" x2="${gx}" y2="${VH}" stroke="#141428" stroke-width="0.5" stroke-dasharray="4,6"/>`;
    }

    const popup = selectedSite ? `
      <div class="map-site-popup">
        <div class="map-popup-header">
          <span class="map-popup-name">${selectedSite.name}</span>
          <span class="map-popup-mult">x${selectedSite.multiplier}</span>
        </div>
        <div class="map-popup-desc">${selectedSite.desc}</div>
        <div class="map-popup-stats">
          <span>緯度: ${selectedSite.lat}°</span>
          <span>精度: ±${selectedSite.altTolerance}km</span>
        </div>
        <div class="map-popup-features">${selectedSite.features.join(' / ')}</div>
      </div>
    ` : '';

    return `
      <div class="world-map-container">
        <svg class="world-map-svg" viewBox="0 0 ${VW} ${VH}">
          ${gridLines}
          ${continents}
          ${pinsSvg}
        </svg>
        ${popup}
      </div>
    `;
  },

  renderGarage() {
    // New SFS-style garage — returns a container; G.Garage.init() populates it
    return '<div id="garage-container"></div>';
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
            ${this._renderWorldMap(siteId)}
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
              ${{engine:'エンジン',tank:'タンク',structure:'構造',fairing:'フェアリング',payload:'衛星',obc:'衛星アダプタ'}[c]}
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
      const svg = G.Garage._partSVG(category, 'col_' + p.id, owned ? rCol : '#444');
      return `
        <div class="col-card ${owned ? 'owned' : 'locked'}" style="border-color:${owned ? rCol : '#333'}">
          <div class="col-svg ${owned ? '' : 'locked-svg'}">${svg}</div>
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
    const svg = G.Garage._partSVG(p.category, 'gacha_' + p.id, rCol);
    return `
      <div class="gacha-result-overlay" onclick="G.App.closeGachaResult()">
        <div class="gacha-result-card" style="border-color:${rCol};background:${rBg}" onclick="event.stopPropagation()">
          <div class="gacha-part-svg">${svg}</div>
          <div class="gacha-rarity" style="color:${rCol}">${G.STAR(p.rarity)} ${G.RARITY[p.rarity].name}</div>
          <div class="gacha-part-name">${p.name}</div>
          <div class="gacha-category">${{engine:'エンジン',tank:'タンク',structure:'段間構造',fairing:'フェアリング',payload:'ペイロード',obc:'衛星アダプタ'}[p.category]}</div>
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
    // HiDPI対応: 実ピクセルはdpr倍で確保し、描画座標はCSSピクセルのまま扱う
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || canvas.width;
    const h = canvas.clientHeight || canvas.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
