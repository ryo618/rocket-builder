var G = window.G || {};
window.G = G;

G.App = {
  currentScreen: 'home',
  launchAnimFrame: null,

  init() {
    G.State.init();
    this.navigate('home');
    this._updateNav();
  },

  navigate(screen) {
    this.currentScreen = screen;
    const main = document.getElementById('main');
    switch (screen) {
      case 'home': main.innerHTML = G.Screens.renderHome(); break;
      case 'garage': main.innerHTML = G.Screens.renderGarage(); break;
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
    G.State.useDailyGacha();
    const result = G.Gacha.pull();
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

  openPartSelect(category, stageIdx) {
    const modal = document.createElement('div');
    modal.id = 'part-modal';
    modal.innerHTML = G.Screens.renderPartSelectModal(category, stageIdx);
    document.body.appendChild(modal);
    requestAnimationFrame(() => {
      modal.querySelector('.modal-content')?.classList.add('show');
    });
  },

  closeModal() {
    document.getElementById('part-modal')?.remove();
  },

  selectPart(partId, category, stageIdx) {
    G.State.setRocketPart(category, partId, stageIdx);
    this.closeModal();
    this.navigate('garage');
  },

  setStageCount(count) {
    G.State.setStageCount(count);
    this.navigate('garage');
  },

  selectSite(siteId) {
    if (!G.State.isSiteUnlocked(siteId)) return;
    G.State.set('selectedSite', siteId);
    this.navigate('launch');
  },

  setAltitude(val) {
    G.State.set('targetAltitude', parseInt(val));
    const el = document.getElementById('alt-val');
    if (el) el.textContent = val;
  },

  setInclination(val) {
    G.State.set('targetInclination', parseInt(val));
    const el = document.getElementById('inc-val');
    if (el) el.textContent = val;
  },

  setOrbitType(type) {
    G.State.set('targetOrbitType', type);
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
    const ctx = canvas.getContext('2d');
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    const W = canvas.width, H = canvas.height;
    const P = G.PHYSICS, R = P.R_EARTH, MU = P.MU;
    const rW2 = 10, rH2 = 26;

    const data = simResult.flightData;
    if (!data.length) { this._showResults(simResult, rocketParts, site, targetAlt, targetInc); return; }

    const maxSimTime = data[data.length - 1].t;
    let lastFrameTime = null, simTimeCursor = 0;
    let camX = 0, camY = 30, zoom = H / 500, targetZoom = zoom, userZoom = false;
    const debris = [], trail = [];
    let prevStage = 0, fairingSepDone = false, payloadSepDone = false, statusLock = 0;
    const statusEl = document.getElementById('launch-status');
    const speedSlider = document.getElementById('speed-slider');
    const speedControl = document.getElementById('speed-control');
    const liftoffBtn = document.getElementById('liftoff-btn');
    const stars = Array.from({ length: 200 }, () => ({ x: Math.random(), y: Math.random(), s: Math.random() * 2 + 0.5 }));

    let phase = 'pad';
    let ignitionStart = 0;
    const IGNITION_DURATION = 2.5;
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
    const drawPadStructures = (sx, sy, sc, showArm) => {
      if (sc < 0.03) return;
      // Concrete pad
      ctx.fillStyle = '#444'; ctx.fillRect(sx-45*sc, sy, 90*sc, 6*sc);
      ctx.fillStyle = '#555'; ctx.fillRect(sx-38*sc, sy-5*sc, 76*sc, 6*sc);
      // Flame trench
      ctx.fillStyle = '#333'; ctx.fillRect(sx-12*sc, sy+6*sc, 24*sc, 10*sc);
      // Tower
      const tx = sx+28*sc, tw = 7*sc, th = 85*sc;
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
      // Service arm + umbilical (only pre-launch)
      if (showArm && sc > 0.2) {
        const armY = sy-18*sc;
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
        phase = 'ignition';
        ignitionStart = performance.now();
        lastFrameTime = null;
        setStatus('メインエンジン点火！', 3000);
      };
    }

    // === Unified animation loop ===
    const mainLoop = (now) => {
      if (!lastFrameTime) lastFrameTime = now;
      const dtR = Math.min(0.1, (now - lastFrameTime) / 1000);
      lastFrameTime = now;
      const speed = (phase === 'flight' && speedSlider) ? parseInt(speedSlider.value) || 1 : 1;

      // --- Phase logic: compute d, rw, fpaRad ---
      let d, rw, fpaRad, flameFactor = 0;

      if (phase === 'pad') {
        d = { t:0, alt:0, vr:0, vt:0, v:0, q:0, accel:0, fpa:90, mass:data[0].mass, fuel:data[0].fuel, downrange:0, stage:0, burning:false };
        rw = toWorld(0, 0);
        fpaRad = Math.PI / 2;
      } else if (phase === 'ignition') {
        const elapsed = (now - ignitionStart) / 1000;
        flameFactor = Math.min(1, elapsed / 1.0);
        d = { t:0, alt:0, vr:0, vt:0, v:0, q:0, accel:0, fpa:90, mass:data[0].mass, fuel:data[0].fuel, downrange:0, stage:0, burning:flameFactor>0.3 };
        rw = toWorld(0, 0);
        fpaRad = Math.PI / 2;
        if (elapsed >= IGNITION_DURATION) {
          phase = 'flight';
          if (!userZoom) targetZoom = H / 3000;
          if (speedControl) speedControl.style.display = '';
          setStatus('リフトオフ！', 2500);
          lastFrameTime = null;
          this.launchAnimFrame = requestAnimationFrame(mainLoop);
          return;
        }
      } else {
        // Flight phase
        simTimeCursor += dtR * speed;
        if (simTimeCursor >= maxSimTime) {
          cancelAnimationFrame(this.launchAnimFrame);
          setTimeout(() => this._showResults(simResult, rocketParts, site, targetAlt, targetInc), 1200);
          return;
        }
        d = interpData(simTimeCursor);
        rw = toWorld(d.downrange, d.alt);
        fpaRad = (d.fpa || 90) * Math.PI / 180;
        flameFactor = 1;

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
      const camLerp = Math.min(0.15, 0.06 + speed * 0.005);
      camX += (rw.x - camX) * camLerp;
      camY += (rw.y - camY) * camLerp;
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

      // Launch pad structures (at world 0,0)
      const padScr = toScr(0, 0);
      const padScale = Math.min(1.2, zoom * 60);
      if (padScr.y > -100 && padScr.y < H+100) {
        drawPadStructures(padScr.x, padScr.y, padScale, phase === 'pad');
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

      // Rocket
      const rp = toScr(rw.x, rw.y);
      ctx.save(); ctx.translate(rp.x, rp.y); ctx.rotate(Math.PI/2 - fpaRad);
      ctx.fillStyle = '#e0e0e0'; ctx.beginPath();
      ctx.moveTo(0,-rH2/2); ctx.lineTo(-rW2/3,-rH2/4); ctx.lineTo(-rW2/3,rH2/3); ctx.lineTo(rW2/3,rH2/3); ctx.lineTo(rW2/3,-rH2/4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#aaa'; ctx.beginPath(); ctx.moveTo(0,-rH2/2); ctx.lineTo(-rW2/2.5,-rH2/5); ctx.lineTo(rW2/2.5,-rH2/5); ctx.closePath(); ctx.fill();
      if (d.burning && flameFactor > 0) {
        const fl = (14+Math.random()*10) * flameFactor;
        const fg = ctx.createLinearGradient(0,rH2/3,0,rH2/3+fl);
        fg.addColorStop(0,'#ffaa00'); fg.addColorStop(0.4,'#ff6600'); fg.addColorStop(0.7,'#ff3300'); fg.addColorStop(1,'rgba(255,80,0,0)');
        ctx.fillStyle = fg; ctx.beginPath(); ctx.moveTo(-rW2/3.5,rH2/3); ctx.lineTo(rW2/3.5,rH2/3); ctx.lineTo(Math.random()*4-2,rH2/3+fl); ctx.closePath(); ctx.fill();
      }
      ctx.restore();

      // Exhaust smoke (ignition phase)
      if (phase === 'ignition' && flameFactor > 0.3) {
        for (let i = 0; i < 4; i++) {
          const smX = padScr.x + (Math.random()-0.5)*50*padScale;
          const smY = padScr.y + Math.random()*15*padScale;
          const smR = (4+Math.random()*8) * flameFactor * padScale;
          ctx.fillStyle = `rgba(200,200,200,${0.08+Math.random()*0.1})`;
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

      // Status (flight only, not locked)
      if (phase === 'flight' && statusLock <= 0) {
        if (d.alt > 100000) setStatus('大気圏離脱');
        else if (d.alt > 50000) setStatus('上層大気通過中');
        else if (d.alt > 10000) setStatus('Max-Q通過');
        else if (d.t > 2) setStatus('上昇中');
      }

      this.launchAnimFrame = requestAnimationFrame(mainLoop);
    };

    setStatus('打ち上げ準備完了');
    this.launchAnimFrame = requestAnimationFrame(mainLoop);
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
