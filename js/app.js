var G = window.G || {};
window.G = G;

G.App = {
  currentScreen: 'home',
  launchAnimFrame: null,
  _animToken: 0,

  init() {
    G.State.init();
    this.navigate('home');
    this._updateNav();
  },

  // 打ち上げアニメーションを無効化する（画面遷移時の孤児ループ・結果二重表示を防ぐ）
  _cancelLaunchAnim() {
    this._animToken++;
    if (this.launchAnimFrame) {
      cancelAnimationFrame(this.launchAnimFrame);
      this.launchAnimFrame = null;
    }
  },

  navigate(screen) {
    this._cancelLaunchAnim();
    // ガレージを離れる時も、ガレージ内で再タップされた時も一旦破棄する
    // （destroyせずにinitし直すとdocumentレベルのリスナーが解除不能なまま蓄積する）
    if (this.currentScreen === 'garage') {
      G.Garage.destroy();
    }
    this.currentScreen = screen;
    const main = document.getElementById('main');
    switch (screen) {
      case 'home': main.innerHTML = G.Screens.renderHome(); break;
      case 'garage':
        main.innerHTML = G.Screens.renderGarage();
        G.Garage.init(document.getElementById('garage-container'));
        break;
      case 'launch': main.innerHTML = G.Screens.renderLaunch(); break;
      case 'records': main.innerHTML = G.Screens.renderRecords(); break;
      case 'collection':
        main.innerHTML = G.Screens.renderCollection();
        this._activateColTab('engine');
        break;
    }
    this._updateNav();
    main.scrollTop = 0;
  },

  _updateNav() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.screen === this.currentScreen);
    });
  },

  showGacha() {
    if (!G.State.canDailyGacha()) return;
    // 抽選が成功してから消費する（先に消費すると例外時にガチャ権だけ失われる）
    const result = G.Gacha.pull();
    G.State.useDailyGacha();
    this._showGachaAnimation(result);
  },

  useTicket() {
    const tickets = G.State.get('tickets');
    if (tickets <= 0) return;
    G.State.set('tickets', tickets - 1);
    const result = G.Gacha.pullWithTicket(3);
    this._showGachaAnimation(result);
  },

  _showGachaAnimation(result) {
    const overlay = document.createElement('div');
    overlay.id = 'gacha-overlay';
    overlay.innerHTML = `
      <div class="gacha-animation">
        <div class="gacha-rocket-anim">
          <div class="gacha-rocket">🚀</div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    setTimeout(() => {
      overlay.remove();
      const resultDiv = document.createElement('div');
      resultDiv.id = 'gacha-result';
      resultDiv.innerHTML = G.Screens.renderGachaResult(result);
      document.body.appendChild(resultDiv);
      requestAnimationFrame(() => {
        resultDiv.querySelector('.gacha-result-card')?.classList.add('show');
      });
    }, 1500);
  },

  closeGachaResult() {
    document.getElementById('gacha-result')?.remove();
    this.navigate('home');
  },

  selectSite(siteId) {
    if (!G.State.isSiteUnlocked(siteId)) return;
    G.State.set('selectedSite', siteId);
    this.navigate('launch');
  },

  setAltitude(val) {
    const alt = parseInt(val);
    G.State.set('targetAltitude', alt);
    const el = document.getElementById('alt-val');
    if (el) el.textContent = val;
    // SSO auto-inclination
    if (G.State.get('targetOrbitType') === 'sso') {
      const ssoInc = G.ssoInclination(alt);
      G.State.set('targetInclination', ssoInc);
      const incEl = document.getElementById('inc-val');
      if (incEl) incEl.textContent = ssoInc;
    }
  },

  setInclination(val) {
    G.State.set('targetInclination', parseInt(val));
    const el = document.getElementById('inc-val');
    if (el) el.textContent = val;
  },

  setOrbitType(type) {
    G.State.set('targetOrbitType', type);
    if (type === 'sso') {
      const ssoInc = G.ssoInclination(G.State.get('targetAltitude'));
      G.State.set('targetInclination', ssoInc);
    }
    this.navigate('launch');
  },

  launch() {
    const rocketParts = G.State.getRocketParts();
    const siteId = G.State.get('selectedSite');
    const site = G.SITES.find(s => s.id === siteId);
    const targetAlt = G.State.get('targetAltitude');
    const targetInc = G.State.get('targetInclination');

    const main = document.getElementById('main');
    main.innerHTML = G.Screens.renderLaunchAnimation();

    const simResult = G.Physics.simulate(rocketParts, site, targetAlt, targetInc);

    this._playLaunchAnimation(simResult, rocketParts, site, targetAlt, targetInc);
  },

  _playLaunchAnimation(simResult, rocketParts, site, targetAlt, targetInc) {
    const canvas = document.getElementById('launch-canvas');
    if (!canvas) return;
    // このアニメーション実行を識別するトークン。navigate等で_animTokenが進んだら停止する
    const animToken = ++this._animToken;
    const ctx = canvas.getContext('2d');
    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.scale(dpr, dpr);
    const W = rect.width, H = rect.height;
    const P = G.PHYSICS, R = P.R_EARTH, MU = P.MU;
    // Rocket size based on stage count (proportion to 85-unit mast: 50%/70%/90%)
    const sc_ = Math.min(G.MAX_STAGES, simResult.stageCount);
    // Per-stage part arrays for data-driven rendering
    const _stageTanks = [], _stageEngines = [];
    for (let i = 0; i < sc_; i++) {
      _stageTanks.push(rocketParts.stages[i].tank);
      _stageEngines.push(rocketParts.stages[i].engine);
    }
    const _totalCap = _stageTanks.reduce((s, t) => s + (t.propellantCapacity || 2200), 0);
    const _baseCap = 2200 * sc_;
    const _capScale = Math.pow(_totalCap / _baseCap, 0.35);
    const rH2 = Math.round([0, 70, 110, 140][sc_] * _capScale);
    const _maxTankCap = Math.max(..._stageTanks.map(t => t.propellantCapacity || 2200));
    const _widthScale = Math.pow(_maxTankCap / 2200, 0.15);
    const rW2 = [0, 3.5, 5, 6][sc_] * _widthScale;

    const data = simResult.flightData;
    // アニメーション終了 → 結果画面。トークンが進んでいたら（別画面へ遷移済み）何もしない
    const finish = (delay) => {
      if (this.launchAnimFrame) { cancelAnimationFrame(this.launchAnimFrame); this.launchAnimFrame = null; }
      setTimeout(() => {
        if (animToken === this._animToken) this._showResults(simResult, rocketParts, site, targetAlt, targetInc);
      }, delay);
    };
    if (!data.length) { finish(0); return; }
    // Ensure flight data starts at ground level (t=0, alt=0)
    if (data[0].t > 0 || data[0].alt > 0.5) {
      const d0 = data[0];
      data.unshift({ t: 0, alt: 0, vr: 0, vt: 0, v: 0, q: 0, accel: 0, fpa: 90, bodyAngle: 90,
        mass: d0.mass, fuel: d0.fuel, downrange: 0, stage: d0.stage, burning: d0.burning });
    }

    const maxSimTime = data[data.length - 1].t;
    let lastFrameTime = null, simTimeCursor = 0;
    const initialZoom = H / 500;
    let camX = 0, camY = 30, zoom = initialZoom, targetZoom = zoom, userZoom = false;
    const PAD_BASE_SCALE = 1.2; // pad structure scale at initial zoom (world-fixed size)
    const debris = [], trail = [];
    let prevStage = 0, fairingSepDone = false, payloadSepDone = false, statusLock = 0;
    let explosionParticles = [], explosionStart = 0, explosionCenter = null, cmdDestructStart = 0;
    const statusEl = document.getElementById('launch-status');
    const speedSlider = document.getElementById('speed-slider');
    const speedControl = document.getElementById('speed-control');
    const liftoffBtn = document.getElementById('liftoff-btn');
    const stars = Array.from({ length: 200 }, () => ({ x: Math.random(), y: Math.random(), s: Math.random() * 2 + 0.5 }));

    let phase = 'pad';
    if (speedControl) speedControl.style.display = 'none';

    const toWorld = (dr, alt) => {
      const th = dr / R, r = R + alt;
      return { x: r * Math.sin(th), y: r * Math.cos(th) - R };
    };
    const toScr = (wx, wy) => ({ x: (wx - camX) * zoom + W / 2, y: H / 2 - (wy - camY) * zoom });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      targetZoom *= e.deltaY > 0 ? 0.82 : 1.22;
      targetZoom = Math.max(H / 30000000, Math.min(H / 200, targetZoom));
      userZoom = true;
    }, { passive: false });
    let pinchDist = 0;
    canvas.addEventListener('touchstart', (e) => { if (e.touches.length === 2) { const dx = e.touches[0].clientX - e.touches[1].clientX, dy = e.touches[0].clientY - e.touches[1].clientY; pinchDist = Math.sqrt(dx*dx+dy*dy); }});
    canvas.addEventListener('touchmove', (e) => { if (e.touches.length === 2) { e.preventDefault(); const dx = e.touches[0].clientX - e.touches[1].clientX, dy = e.touches[0].clientY - e.touches[1].clientY, d2 = Math.sqrt(dx*dx+dy*dy); if (pinchDist > 0) { targetZoom *= d2/pinchDist; targetZoom = Math.max(H/30000000, Math.min(H/200, targetZoom)); userZoom = true; } pinchDist = d2; }}, { passive: false });

    const lerpV = (a, b, f) => a + (b - a) * f;
    const interpData = (st) => {
      if (st <= data[0].t) return data[0];
      for (let i = 1; i < data.length; i++) {
        if (data[i].t >= st) {
          const d0 = data[i-1], d1 = data[i], f = (st - d0.t) / (d1.t - d0.t);
          return { t: lerpV(d0.t,d1.t,f), alt: lerpV(d0.alt,d1.alt,f), vr: lerpV(d0.vr,d1.vr,f),
            vt: lerpV(d0.vt,d1.vt,f), v: lerpV(d0.v,d1.v,f), q: lerpV(d0.q,d1.q,f),
            accel: lerpV(d0.accel,d1.accel,f), fpa: lerpV(d0.fpa,d1.fpa,f),
            bodyAngle: lerpV(d0.bodyAngle ?? d0.fpa, d1.bodyAngle ?? d1.fpa, f),
            mass: lerpV(d0.mass,d1.mass,f), fuel: lerpV(d0.fuel,d1.fuel,f),
            downrange: lerpV(d0.downrange,d1.downrange,f),
            stage: f<0.5?d0.stage:d1.stage, burning: f<0.5?d0.burning:d1.burning };
        }
      }
      return data[data.length - 1];
    };

    const computeOrbit = (alt, dr, vr, vt) => {
      const r = R + alt, v2 = vr*vr + vt*vt, eps = v2/2 - MU/r;
      if (eps >= 0) return null;
      const hAM = r * vt, a = -MU / (2*eps), p = hAM*hAM / MU;
      const ecc = Math.sqrt(Math.max(0, 1 - p/a));
      if (ecc >= 1 || ecc < 0.0001) return null;
      const sinNu = vr * hAM / (MU * ecc), cosNu = (vt * hAM / MU - 1) / ecc;
      const nu = Math.atan2(sinNu, cosNu), omega = dr / R - nu;
      const pts = [];
      for (let i = 0; i <= 360; i += 2) {
        const nuP = i * Math.PI / 180, rP = p / (1 + ecc * Math.cos(nuP));
        if (rP <= R) continue;
        const ang = omega + nuP;
        pts.push({ x: rP * Math.sin(ang), y: rP * Math.cos(ang) - R });
      }
      return { pts, peri: a*(1-ecc)-R, apo: a*(1+ecc)-R };
    };

    const setStatus = (txt, lockMs) => {
      if (statusEl) statusEl.textContent = txt;
      statusLock = lockMs || 0;
    };

    // Draw launch pad structures at screen position
    const drawPadStructures = (sx, sy, sc, showArm, armH) => {
      if (sc < 0.03) return;
      // Concrete pad
      ctx.fillStyle = '#444'; ctx.fillRect(sx-45*sc, sy, 90*sc, 6*sc);
      ctx.fillStyle = '#555'; ctx.fillRect(sx-38*sc, sy-5*sc, 76*sc, 6*sc);
      // Flame trench
      ctx.fillStyle = '#333'; ctx.fillRect(sx-12*sc, sy+6*sc, 24*sc, 10*sc);
      // Tower (scales with rocket height)
      const tx = sx+28*sc, tw = 7*sc, th = (rH2 + 20) * sc;
      ctx.fillStyle = '#555'; ctx.fillRect(tx, sy-th, tw, th+6*sc);
      // Trusses
      if (sc > 0.2) {
        ctx.strokeStyle = '#666'; ctx.lineWidth = Math.max(0.5, sc*0.7);
        for (let i = 0; i < 7; i++) {
          const y1=sy-th+i*th/7, y2=sy-th+(i+1)*th/7;
          ctx.beginPath(); ctx.moveTo(tx,y1); ctx.lineTo(tx+tw,y2); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(tx+tw,y1); ctx.lineTo(tx,y2); ctx.stroke();
        }
      }
      // Tower top
      ctx.fillStyle = '#666'; ctx.fillRect(tx-3*sc, sy-th-5*sc, tw+6*sc, 7*sc);
      // Lightning rod
      if (sc > 0.3) {
        ctx.strokeStyle = '#888'; ctx.lineWidth = Math.max(0.5, sc*0.4);
        ctx.beginPath(); ctx.moveTo(tx+tw/2, sy-th-5*sc); ctx.lineTo(tx+tw/2, sy-th-22*sc); ctx.stroke();
      }
      // Service arm + umbilical (only pre-launch, position based on rocket height)
      if (showArm && sc > 0.2) {
        const armY = sy - (armH || 18*sc);
        ctx.fillStyle = '#777'; ctx.fillRect(sx+4*sc, armY, (tx-sx-2*sc), 3*sc);
        ctx.strokeStyle = '#aa7733'; ctx.lineWidth = Math.max(0.5, sc);
        ctx.beginPath(); ctx.moveTo(sx+3*sc, armY+3*sc);
        ctx.quadraticCurveTo(sx+14*sc, armY+12*sc, tx, armY+8*sc); ctx.stroke();
      }
    };

    // Liftoff button
    if (liftoffBtn) {
      liftoffBtn.onclick = () => {
        liftoffBtn.style.display = 'none';
        phase = 'flight';
        simTimeCursor = 0;
        lastFrameTime = null;
        // Don't change targetZoom here — altitude-based zoom below handles smooth transition
        if (speedControl) speedControl.style.display = '';
        setStatus('リフトオフ！', 2500);
      };
    }

    // === Unified animation loop ===
    const mainLoop = (now) => {
      if (animToken !== this._animToken) return; // 画面遷移済み — このループは終了
      if (!lastFrameTime) lastFrameTime = now;
      const dtR = Math.min(0.1, (now - lastFrameTime) / 1000);
      lastFrameTime = now;
      const speed = (phase === 'flight' && speedSlider) ? parseInt(speedSlider.value) || 1 : 1;

      // --- Phase logic: compute d, rw, fpaRad ---
      let d, rw, fpaRad, bodyRad, flameFactor = 0;

      if (phase === 'pad') {
        d = { t:0, alt:0, vr:0, vt:0, v:0, q:0, accel:0, fpa:90, bodyAngle:90, mass:data[0].mass, fuel:data[0].fuel, downrange:0, stage:0, burning:false };
        rw = toWorld(0, 0);
        fpaRad = Math.PI / 2;
        bodyRad = Math.PI / 2;
      } else if (phase === 'cmd_destruct') {
        // Command destruct sequence: show failure reason → "指令破壊します！" → 1s → explosion
        d = data[data.length - 1];
        rw = toWorld(d.downrange, d.alt);
        fpaRad = (d.fpa != null ? d.fpa : 90) * Math.PI / 180;
        bodyRad = (d.bodyAngle != null ? d.bodyAngle : (d.fpa != null ? d.fpa : 90)) * Math.PI / 180;
        flameFactor = 0;
        const elapsedCmd = (now - cmdDestructStart) / 1000;
        if (elapsedCmd >= 1.5 && elapsedCmd < 2.5) {
          setStatus('指令破壊します！', 5000);
        }
        if (elapsedCmd >= 2.5) {
          // Trigger explosion
          phase = 'explosion';
          explosionStart = now;
          explosionCenter = { x: rw.x, y: rw.y };
          for (let ei = 0; ei < 30; ei++) {
            const ang = Math.random() * Math.PI * 2;
            const spd = 20 + Math.random() * 80;
            explosionParticles.push({ x: rw.x, y: rw.y, dx: Math.cos(ang)*spd, dy: Math.sin(ang)*spd, r: 2+Math.random()*5, age: 0, col: ['#ff4400','#ff8800','#ffcc00','#ff6600','#aa2200'][Math.floor(Math.random()*5)] });
          }
          setStatus('指令破壊', 5000);
        }
      } else if (phase === 'explosion') {
        d = data[data.length - 1];
        rw = explosionCenter || toWorld(0, 0);
        fpaRad = (d.fpa != null ? d.fpa : 90) * Math.PI / 180;
        bodyRad = (d.bodyAngle != null ? d.bodyAngle : (d.fpa != null ? d.fpa : 90)) * Math.PI / 180;
        flameFactor = 0;
        const elapsedExp = (now - explosionStart) / 1000;
        for (const ep of explosionParticles) {
          ep.x += ep.dx * dtR; ep.y += (ep.dy - 50) * dtR; ep.age += dtR;
        }
        if (elapsedExp > 3) {
          finish(500);
          return;
        }
      } else {
        // Flight phase
        simTimeCursor += dtR * speed;
        if (simTimeCursor > maxSimTime) simTimeCursor = maxSimTime;
        d = interpData(simTimeCursor);
        rw = toWorld(d.downrange, d.alt);
        fpaRad = (d.fpa != null ? d.fpa : 90) * Math.PI / 180;
        bodyRad = (d.bodyAngle != null ? d.bodyAngle : (d.fpa != null ? d.fpa : 90)) * Math.PI / 180;
        flameFactor = d.burning ? 1 : 0;

        if (simTimeCursor >= maxSimTime && phase === 'flight') {
          const fp = simResult.failPart;
          const isExplosion = !simResult.success && (fp === 'engine' || fp === 'tank' || fp === 'obc' || d.alt < 5000);
          const isCommandDestruct = !simResult.success && (fp === 'fairing' || fp === 'structure');
          const isPayloadFail = !simResult.success && fp === 'payload';

          if (isExplosion) {
            // Engine/tank/OBC failure or crash → immediate explosion
            phase = 'explosion';
            explosionStart = now;
            explosionCenter = { x: rw.x, y: rw.y };
            for (let ei = 0; ei < 30; ei++) {
              const ang = Math.random() * Math.PI * 2;
              const spd = 20 + Math.random() * 80;
              explosionParticles.push({ x: rw.x, y: rw.y, dx: Math.cos(ang)*spd, dy: Math.sin(ang)*spd, r: 2+Math.random()*5, age: 0, col: ['#ff4400','#ff8800','#ffcc00','#ff6600','#aa2200'][Math.floor(Math.random()*5)] });
            }
            setStatus(simResult.failReason || '墜落！', 5000);
          } else if (isCommandDestruct) {
            // Fairing/structure separation failure → show failure → command destruct → explosion
            phase = 'cmd_destruct';
            setStatus(simResult.failReason, 5000);
            cmdDestructStart = now;
          } else if (isPayloadFail) {
            // Satellite separation failure → message → end (no explosion)
            setStatus('衛星分離できません', 5000);
            finish(2500);
            return;
          } else {
            // Success or orbit failure (no crash) → results
            finish(1200);
            return;
          }
        }

        // Trail
        const lt = trail.length ? trail[trail.length-1] : null;
        if (!lt || Math.abs(rw.x-lt.x)+Math.abs(rw.y-lt.y) > 10) trail.push({ x: rw.x, y: rw.y });

        // Separation events
        if (d.stage !== prevStage) {
          const perpX = -Math.sin(fpaRad), perpY = Math.cos(fpaRad);
          debris.push({ type:'stage', x:rw.x, y:rw.y, dx:-perpY*15, dy:perpX*15, a:Math.PI/2-fpaRad, av:0.3, age:0, sz:14 });
          setStatus((prevStage+1)+'/'+(d.stage+1)+'段 分離', 2000);
          setTimeout(() => setStatus((d.stage+1)+'段目 点火！', 1500), Math.max(100,800/speed));
          prevStage = d.stage;
        }
        if (!fairingSepDone && d.alt > 80000) {
          fairingSepDone = true;
          const perpX = -Math.sin(fpaRad), perpY = Math.cos(fpaRad);
          debris.push({ type:'fairing', x:rw.x, y:rw.y, dx:perpX*20+perpY*5, dy:perpY*20-perpX*5, a:0, av:0.8, age:0, sz:7 });
          debris.push({ type:'fairing', x:rw.x, y:rw.y, dx:-perpX*20+perpY*5, dy:-perpY*20-perpX*5, a:0, av:-0.8, age:0, sz:7 });
          setStatus('フェアリング分離', 2000);
        }
        if (!payloadSepDone && simResult.success && simTimeCursor >= maxSimTime - 6) {
          payloadSepDone = true;
          const fwdX = Math.cos(fpaRad), fwdY = Math.sin(fpaRad);
          debris.push({ type:'payload', x:rw.x+fwdX*30, y:rw.y+fwdY*30, dx:fwdX*3, dy:fwdY*3, a:0, av:0.02, age:0, sz:6 });
          setStatus('衛星分離！', 3000);
        }
      }

      // --- Camera ---
      // Always track rocket position (center on rocket)
      const camLerp = Math.min(0.15, 0.06 + speed * 0.005);
      camX += (rw.x - camX) * camLerp;
      camY += (rw.y - camY) * camLerp;
      // No auto-zoom — keep pad-level zoom. User can zoom manually via wheel/pinch.
      zoom += (targetZoom - zoom) * 0.06;

      // --- Debris update ---
      for (const db of debris) {
        db.x += db.dx * dtR * speed; db.y += db.dy * dtR * speed;
        db.a += db.av * dtR * speed; db.age += dtR * speed;
      }
      if (statusLock > 0) statusLock -= dtR * speed * 1000;

      // === DRAW ===
      const skyDk = Math.min(1, d.alt / 80000);
      ctx.fillStyle = `rgb(${Math.round(5+(1-skyDk)*15)},${Math.round(5+(1-skyDk)*10)},${Math.round(25+(1-skyDk)*15)})`;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#fff';
      for (const s of stars) { ctx.globalAlpha = (0.2+skyDk*0.8)*(0.5+Math.random()*0.5); ctx.fillRect(s.x*W, s.y*H, s.s, s.s); }
      ctx.globalAlpha = 1;

      // Orbit prediction (flight only)
      if (phase === 'flight' && d.alt > 50000 && d.v > 2000) {
        const orb = computeOrbit(d.alt, d.downrange, d.vr, d.vt);
        if (orb && orb.pts.length > 2) {
          ctx.strokeStyle = orb.peri > 0 ? 'rgba(0,255,120,0.5)' : 'rgba(255,80,80,0.5)';
          ctx.lineWidth = 2; ctx.setLineDash([8,5]); ctx.beginPath();
          for (let i = 0; i < orb.pts.length; i++) { const sp = toScr(orb.pts[i].x, orb.pts[i].y); i===0?ctx.moveTo(sp.x,sp.y):ctx.lineTo(sp.x,sp.y); }
          ctx.stroke(); ctx.setLineDash([]);
        }
      }

      // Earth
      const ecS = toScr(0, -R);
      const eRP = R * zoom;
      const earthGrad = ctx.createRadialGradient(ecS.x, ecS.y - eRP*0.3, eRP*0.1, ecS.x, ecS.y, eRP);
      earthGrad.addColorStop(0, '#1a4a2a'); earthGrad.addColorStop(0.7, '#0f3518'); earthGrad.addColorStop(1, '#0a2510');
      ctx.fillStyle = earthGrad; ctx.beginPath(); ctx.arc(ecS.x, ecS.y, eRP, 0, Math.PI*2); ctx.fill();
      const atmoP = 100000 * zoom;
      if (atmoP > 1) {
        const ag = ctx.createRadialGradient(ecS.x, ecS.y, eRP, ecS.x, ecS.y, eRP+atmoP);
        ag.addColorStop(0, 'rgba(80,160,255,0.25)'); ag.addColorStop(0.5, 'rgba(40,100,200,0.1)'); ag.addColorStop(1, 'rgba(20,50,120,0)');
        ctx.fillStyle = ag; ctx.beginPath(); ctx.arc(ecS.x, ecS.y, eRP+atmoP, 0, Math.PI*2); ctx.fill();
      }
      ctx.strokeStyle = '#4db8ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(ecS.x, ecS.y, eRP, 0, Math.PI*2); ctx.stroke();

      // Launch pad structures (at world 0,0) — world-fixed size (scales with zoom)
      const padScr = toScr(0, 0);
      const padScale = PAD_BASE_SCALE * (zoom / initialZoom);
      const rocketH = rH2 * 5/6; // visible rocket height (nose to bottom)
      const armH = rocketH * 0.55 * padScale; // arm at ~55% of rocket height
      if (padScr.y > -100 && padScr.y < H+100) {
        drawPadStructures(padScr.x, padScr.y, padScale, phase === 'pad', armH);
      }

      // Trail
      if (trail.length > 1) {
        ctx.strokeStyle = 'rgba(255,140,0,0.5)'; ctx.lineWidth = 2; ctx.beginPath();
        for (let i = 0; i < trail.length; i++) { const sp = toScr(trail[i].x, trail[i].y); i===0?ctx.moveTo(sp.x,sp.y):ctx.lineTo(sp.x,sp.y); }
        ctx.stroke();
      }

      // Debris
      for (const db of debris) {
        if (db.age > 20) continue;
        const dp = toScr(db.x, db.y); const al = Math.max(0, 1 - db.age/12);
        ctx.save(); ctx.translate(dp.x, dp.y); ctx.rotate(db.a); ctx.globalAlpha = al;
        if (db.type === 'stage') { ctx.fillStyle='#888'; ctx.fillRect(-3,-db.sz/2,6,db.sz); }
        else if (db.type === 'fairing') { ctx.fillStyle='#aaa'; ctx.beginPath(); ctx.arc(0,0,db.sz/2,0,Math.PI); ctx.fill(); }
        else if (db.type === 'payload') { ctx.fillStyle='#ffcc00'; ctx.fillRect(-4,-3,8,6); ctx.fillStyle='#3366ff'; ctx.fillRect(-12,-2,7,4); ctx.fillRect(5,-2,7,4); }
        ctx.globalAlpha = 1; ctx.restore();
      }

      // Rocket (hidden during explosion)
      const rp = toScr(rw.x, rw.y);
      if (phase !== 'explosion') {
        // Remaining stages and dynamic rocket height (compute FIRST for rYOff)
        const nRem = sc_ - d.stage;
        let _remCap = 0;
        for (let si = d.stage; si < sc_; si++) _remCap += _stageTanks[si].propellantCapacity || 2200;
        const remainFrac = _totalCap > 0 ? _remCap / _totalCap : 1;
        const drawH = rH2 * (0.30 + 0.70 * remainFrac);
        const drawW = rW2;

        // Altitude-based scale/offset transition
        // - At alt=0 (on pad): padScale, bottom-anchored (nozzle at ground)
        // - At alt≥200m: rScale=1, centered at world position
        // - Smooth ease-out based on altitude, not time
        const transAlt = 200;
        const altFrac = Math.min(1, Math.max(0, d.alt) / transAlt);
        const eased = altFrac * (2 - altFrac);
        let rScale = padScale + (1 - padScale) * eased;
        // Cap rocket scale — prevent it from appearing too large when zoomed out
        // sqrt for gentle falloff; min 0.4 keeps rocket visible
        const maxRocketScale = Math.max(0.4, Math.sqrt(zoom / initialZoom) * 1.2);
        rScale = Math.min(rScale, maxRocketScale);
        // drawH/2 = offset to place nozzle at ground; eases to 0 (centered) in flight
        const rYOff = drawH / 2 * rScale * (1 - eased);

        ctx.save();
        ctx.translate(rp.x, rp.y - rYOff);
        ctx.rotate(Math.PI / 2 - bodyRad);
        ctx.scale(rScale, rScale);

        // === Draw pre-rendered SVG rocket ===
        const _compKey = `stg${d.stage}_fair${fairingSepDone ? 0 : 1}`;
        const _comp = _rocketImgs[_compKey];
        if (_comp && _comp.img.complete) {
          const fitH = drawH;
          const fitW = fitH * _comp.width / _comp.height;
          ctx.drawImage(_comp.img, -fitW / 2, -drawH / 2, fitW, fitH);
        }
        const _btmEng = _stageEngines[d.stage];
        const _thrust = _btmEng ? (_btmEng.vacuumThrust || 55) : 55;
        const _thrScale = Math.pow(_thrust / 55, 0.25);
        const nbW = drawW * 0.75 * _thrScale;
        let yC = drawH / 2;

        // === Exhaust flame ===
        if (d.burning && flameFactor > 0) {
          const fl = (14 + Math.random() * 10) * flameFactor;
          const fg = ctx.createLinearGradient(0, yC - 2, 0, yC + fl);
          fg.addColorStop(0, '#ffcc00'); fg.addColorStop(0.2, '#ffaa00');
          fg.addColorStop(0.5, '#ff6600'); fg.addColorStop(0.8, '#ff3300');
          fg.addColorStop(1, 'rgba(255,80,0,0)');
          ctx.fillStyle = fg;
          ctx.beginPath();
          ctx.moveTo(-nbW * 0.85, yC - 1); ctx.lineTo(nbW * 0.85, yC - 1);
          ctx.lineTo(Math.random() * 4 - 2, yC + fl);
          ctx.closePath(); ctx.fill();
          // Bright core
          const cW = nbW * 0.35, cL = fl * 0.55;
          const cg = ctx.createLinearGradient(0, yC, 0, yC + cL);
          cg.addColorStop(0, 'rgba(255,255,255,0.7)'); cg.addColorStop(0.5, 'rgba(255,255,200,0.3)');
          cg.addColorStop(1, 'rgba(255,200,100,0)');
          ctx.fillStyle = cg;
          ctx.beginPath(); ctx.moveTo(-cW, yC); ctx.lineTo(cW, yC);
          ctx.lineTo(0, yC + cL); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
      }

      // Explosion effect
      if (phase === 'explosion' && explosionCenter) {
        const elExp = (now - explosionStart) / 1000;
        const fireR = 30 + elExp * 80;
        const alp = Math.max(0, 1 - elExp / 2.5);
        const expGrad = ctx.createRadialGradient(rp.x, rp.y, 0, rp.x, rp.y, fireR);
        expGrad.addColorStop(0, `rgba(255,255,200,${alp})`);
        expGrad.addColorStop(0.3, `rgba(255,150,0,${alp*0.8})`);
        expGrad.addColorStop(0.7, `rgba(255,50,0,${alp*0.4})`);
        expGrad.addColorStop(1, 'rgba(100,0,0,0)');
        ctx.fillStyle = expGrad; ctx.beginPath(); ctx.arc(rp.x, rp.y, fireR, 0, Math.PI*2); ctx.fill();
        for (const ep of explosionParticles) {
          if (ep.age > 4) continue;
          const pp = toScr(ep.x, ep.y);
          const pa = Math.max(0, 1 - ep.age / 3);
          ctx.globalAlpha = pa; ctx.fillStyle = ep.col;
          ctx.beginPath(); ctx.arc(pp.x, pp.y, ep.r, 0, Math.PI*2); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      // Exhaust smoke (early ascent near pad)
      if (phase === 'flight' && d.burning && d.alt < 500) {
        const smokeFrac = Math.max(0, 1 - d.alt / 500);
        for (let i = 0; i < Math.round(4 * smokeFrac); i++) {
          const smX = padScr.x + (Math.random()-0.5)*50*padScale;
          const smY = padScr.y + Math.random()*15*padScale;
          const smR = (4+Math.random()*8) * padScale;
          ctx.fillStyle = `rgba(200,200,200,${(0.08+Math.random()*0.1)*smokeFrac})`;
          ctx.beginPath(); ctx.arc(smX, smY, smR, 0, Math.PI*2); ctx.fill();
        }
      }

      // Telemetry
      const el2 = (id) => document.getElementById(id);
      const sv = (id,v) => { const e = el2(id); if(e) e.textContent = v; };
      sv('tl-time', Math.round(d.t)+'s'); sv('tl-alt', (d.alt/1000).toFixed(1)+' km');
      sv('tl-dr', (d.downrange/1000).toFixed(1)+' km'); sv('tl-vel', Math.round(d.v).toLocaleString()+' m/s');
      sv('tl-q', Math.round(d.q).toLocaleString()+' Pa'); sv('tl-acc', (Math.round(d.accel*100)/100)+' G');
      sv('tl-pitch', (Math.round(d.fpa*10)/10)+'°'); sv('tl-stage', (d.stage+1)+'/'+simResult.stageCount);
      const fuel0 = data[0].fuel;
      sv('tl-fuel', fuel0>0 ? Math.round((d.fuel/fuel0)*100)+'%' : '0%');
      // Ap/Pe from orbit calculation
      if (d.alt > 10000 && d.v > 500) {
        const orb2 = computeOrbit(d.alt, d.downrange, d.vr, d.vt);
        if (orb2) {
          sv('tl-ap', (orb2.apo/1000).toFixed(1)+' km');
          sv('tl-pe', (orb2.peri/1000).toFixed(1)+' km');
        } else {
          sv('tl-ap', '-- km'); sv('tl-pe', '-- km');
        }
      } else {
        sv('tl-ap', '-- km'); sv('tl-pe', '-- km');
      }

      // Status (flight only, not locked)
      if (phase === 'flight' && statusLock <= 0) {
        if (d.alt > 100000) setStatus('大気圏離脱');
        else if (d.alt > 50000) setStatus('上層大気通過中');
        else if (d.alt > 10000) setStatus('Max-Q通過');
        else if (d.t > 2) setStatus('上昇中');
      }

      this.launchAnimFrame = requestAnimationFrame(mainLoop);
    };

    // Pre-build SVG composite images, then start animation
    const _rocketImgs = {};
    this._buildRocketComposites(rocketParts, sc_, _rocketImgs);
    setStatus('打ち上げ準備完了');
    this.launchAnimFrame = requestAnimationFrame(mainLoop);
  },

  _buildRocketComposites(rocketParts, stageCount, out) {
    const CS = 28;
    for (let fromStage = 0; fromStage < stageCount; fromStage++) {
      for (const fairOn of [true, false]) {
        const key = `stg${fromStage}_fair${fairOn ? 1 : 0}`;
        const parts = [];
        if (fairOn) parts.push({ cat: 'fairing', part: rocketParts.fairing });
        parts.push({ cat: 'payload', part: rocketParts.payload });
        if (rocketParts.obc) parts.push({ cat: 'obc', part: rocketParts.obc });
        for (let i = stageCount - 1; i >= fromStage; i--) {
          parts.push({ cat: 'tank', part: rocketParts.stages[i].tank });
          parts.push({ cat: 'engine', part: rocketParts.stages[i].engine });
          if (i > fromStage && rocketParts.structures && rocketParts.structures[i - 1])
            parts.push({ cat: 'structure', part: rocketParts.structures[i - 1] });
        }
        const items = parts.map((p, idx) => {
          const g = G.PART_GRID[p.cat];
          let renderH = g.h;
          if (p.cat === 'tank') {
            renderH = Math.max(g.h, Math.min(8, Math.round(3 * Math.pow((p.part.propellantCapacity || 2200) / 2200, 0.8))));
          }
          if (p.cat === 'fairing') {
            let ext = 0;
            for (let j = idx + 1; j < parts.length; j++) {
              if (parts[j].cat === 'payload' || parts[j].cat === 'obc') ext += G.PART_GRID[parts[j].cat].h;
              else break;
            }
            if (ext > 0) renderH = g.h + ext;
          }
          const above = idx > 0 ? parts[idx - 1].cat : null;
          const below = idx < parts.length - 1 ? parts[idx + 1].cat : null;
          return { ...p, renderH, adj: { above, below }, g };
        });
        let flowY = 0;
        for (const it of items) {
          it.h = it.renderH * CS; it.w = it.g.w * CS;
          if (it.cat === 'fairing') { it.y = flowY; flowY += it.g.h * CS; }
          else if (it.cat === 'structure') { it.y = flowY - 24; flowY = it.y + it.h; }
          else { it.y = flowY; flowY += it.h; }
        }
        const totalH = flowY, maxW = G.PART_GRID.tank.w * CS;
        const ordered = items.map((item, idx) => ({ item, idx,
          z: item.cat === 'fairing' ? 10 : item.cat === 'structure' ? 5 :
             (item.cat === 'payload' || item.cat === 'obc') ? -1 : 0
        })).sort((a, b) => a.z - b.z);
        let svgInner = '';
        for (const { item, idx } of ordered) {
          const pid = `${key}_${idx}`, rc = G.RARITY[item.part.rarity].color;
          let svg;
          if (item.cat === 'tank') svg = G.Garage._svgTank(pid, rc, item.part, item.adj, item.renderH);
          else if (item.cat === 'fairing') svg = G.Garage._svgFairing(pid, rc, item.part, item.adj, item.renderH);
          else if (item.cat === 'structure') {
            let tT = null, bT = null;
            for (let j = idx - 1; j >= 0; j--) { if (items[j].cat === 'tank') { tT = items[j].part; break; } }
            for (let j = idx + 1; j < items.length; j++) { if (items[j].cat === 'tank') { bT = items[j].part; break; } }
            svg = G.Garage._svgStructure(pid, rc, item.part, item.adj, G.Garage._tankBw(tT), G.Garage._tankBw(bT));
          } else svg = G.Garage._partSVG(item.cat, pid, rc, item.part, item.adj);
          const xOff = (maxW - item.w) / 2;
          svgInner += `<svg x="${xOff}" y="${item.y}" width="${item.w}" height="${item.h}" overflow="visible">${svg}</svg>`;
        }
        const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="${maxW}" height="${totalH}">${svgInner}</svg>`;
        const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); out[key] = { img, width: maxW, height: totalH }; };
        img.onerror = () => URL.revokeObjectURL(url);
        img.src = url;
      }
    }
  },

  _showResults(simResult, rocketParts, site, targetAlt, targetInc) {
    const targetOrbitType = G.State.get('targetOrbitType');
    const scoreResult = G.Score.calculate(simResult, rocketParts, site, targetAlt, targetInc, targetOrbitType);

    G.State.addFlight({
      success: simResult.success,
      score: scoreResult.total,
      altitude: simResult.finalAltitude,
      velocity: simResult.finalVelocity,
      siteName: site.name,
      date: new Date().toLocaleDateString('ja-JP'),
      failReason: simResult.failReason || null,
    });

    const main = document.getElementById('main');
    main.innerHTML = G.Screens.renderResults(simResult, scoreResult, rocketParts, site);

    requestAnimationFrame(() => {
      const chartCanvas = document.getElementById('flight-chart');
      if (chartCanvas) {
        G.Screens.drawFlightChart(chartCanvas, simResult.flightData);
      }
    });
  },

  showCollectionTab(category) {
    this._activateColTab(category);
    const grid = document.getElementById('collection-grid');
    if (grid) grid.innerHTML = G.Screens._renderCollectionGrid(category);
  },

  _activateColTab(category) {
    document.querySelectorAll('.col-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.cat === category);
    });
  },
};

document.addEventListener('DOMContentLoaded', () => {
  G.App.init();
});
