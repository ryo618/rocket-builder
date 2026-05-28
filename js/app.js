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

    const data = simResult.flightData;
    if (!data.length) { this._showResults(simResult, rocketParts, site, targetAlt, targetInc); return; }

    const maxSimTime = data[data.length - 1].t;
    let lastFrameTime = null, simTimeCursor = 0;
    let camX = 0, camY = 0, zoom = H / 3000, targetZoom = zoom, userZoom = false;
    const debris = [], trail = [];
    let prevStage = 0, fairingSepDone = false, payloadSepDone = false, statusLock = 0;
    const statusEl = document.getElementById('launch-status');
    const speedSlider = document.getElementById('speed-slider');
    const stars = Array.from({ length: 200 }, () => ({ x: Math.random(), y: Math.random(), s: Math.random() * 2 + 0.5 }));

    const toWorld = (dr, alt) => {
      const th = dr / R, r = R + alt;
      return { x: r * Math.sin(th), y: r * Math.cos(th) - R };
    };
    const toScr = (wx, wy) => ({ x: (wx - camX) * zoom + W / 2, y: H / 2 - (wy - camY) * zoom });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      targetZoom *= e.deltaY > 0 ? 0.82 : 1.22;
      targetZoom = Math.max(H / 30000000, Math.min(H / 400, targetZoom));
      userZoom = true;
    }, { passive: false });
    let pinchDist = 0;
    canvas.addEventListener('touchstart', (e) => { if (e.touches.length === 2) { const dx = e.touches[0].clientX - e.touches[1].clientX, dy = e.touches[0].clientY - e.touches[1].clientY; pinchDist = Math.sqrt(dx*dx+dy*dy); }});
    canvas.addEventListener('touchmove', (e) => { if (e.touches.length === 2) { e.preventDefault(); const dx = e.touches[0].clientX - e.touches[1].clientX, dy = e.touches[0].clientY - e.touches[1].clientY, d2 = Math.sqrt(dx*dx+dy*dy); if (pinchDist > 0) { targetZoom *= d2/pinchDist; targetZoom = Math.max(H/30000000, Math.min(H/400, targetZoom)); userZoom = true; } pinchDist = d2; }}, { passive: false });

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

    const animate = (now) => {
      if (!lastFrameTime) lastFrameTime = now;
      const speed = speedSlider ? parseInt(speedSlider.value) || 1 : 1;
      const dtR = (now - lastFrameTime) / 1000;
      lastFrameTime = now;
      simTimeCursor += dtR * speed;
      if (simTimeCursor >= maxSimTime) {
        cancelAnimationFrame(this.launchAnimFrame);
        setTimeout(() => this._showResults(simResult, rocketParts, site, targetAlt, targetInc), 1200);
        return;
      }
      const d = interpData(simTimeCursor);
      const rw = toWorld(d.downrange, d.alt);
      const fpaRad = (d.fpa || 90) * Math.PI / 180;

      // Trail (add point if moved enough)
      const lt = trail.length ? trail[trail.length-1] : null;
      if (!lt || Math.abs(rw.x-lt.x)+Math.abs(rw.y-lt.y) > 10) trail.push({ x: rw.x, y: rw.y });

      // --- Separation events ---
      if (d.stage !== prevStage) {
        const perpX = -Math.sin(fpaRad), perpY = Math.cos(fpaRad);
        debris.push({ type:'stage', x:rw.x, y:rw.y, dx: -perpY*15, dy: perpX*15, a: Math.PI/2-fpaRad, av:0.3, age:0, sz:14 });
        setStatus((prevStage+1)+'/'+(d.stage+1)+'段 分離', 2000);
        setTimeout(() => setStatus((d.stage+1)+'段目 点火！', 1500), Math.max(100, 800/speed));
        prevStage = d.stage;
      }
      if (!fairingSepDone && d.alt > 80000) {
        fairingSepDone = true;
        const perpX = -Math.sin(fpaRad), perpY = Math.cos(fpaRad);
        debris.push({ type:'fairing', x:rw.x, y:rw.y, dx: perpX*20+perpY*5, dy: perpY*20-perpX*5, a:0, av:0.8, age:0, sz:7 });
        debris.push({ type:'fairing', x:rw.x, y:rw.y, dx:-perpX*20+perpY*5, dy:-perpY*20-perpX*5, a:0, av:-0.8, age:0, sz:7 });
        setStatus('フェアリング分離', 2000);
      }
      if (!payloadSepDone && simResult.success && simTimeCursor >= maxSimTime - 6) {
        payloadSepDone = true;
        const fwdX = Math.cos(fpaRad), fwdY = Math.sin(fpaRad);
        debris.push({ type:'payload', x:rw.x+fwdX*30, y:rw.y+fwdY*30, dx:fwdX*3, dy:fwdY*3, a:0, av:0.02, age:0, sz:6 });
        setStatus('衛星分離！', 3000);
      }

      // --- Camera ---
      const camLerp = Math.min(0.15, 0.06 + speed * 0.005);
      camX += (rw.x - camX) * camLerp;
      camY += (rw.y - camY) * camLerp;
      if (!userZoom) {
        const span = Math.max(3000, d.alt * 1.8, Math.abs(d.downrange) * 0.4);
        targetZoom = H * 0.4 / span;
        targetZoom = Math.max(H / 30000000, Math.min(H / 400, targetZoom));
      }
      zoom += (targetZoom - zoom) * 0.06;

      // --- Debris update ---
      for (const db of debris) {
        db.x += db.dx * dtR * speed;
        db.y += db.dy * dtR * speed;
        db.a += db.av * dtR * speed;
        db.age += dtR * speed;
      }
      if (statusLock > 0) statusLock -= dtR * speed * 1000;

      // === DRAW ===
      const skyDk = Math.min(1, d.alt / 80000);
      ctx.fillStyle = `rgb(${Math.round(5+(1-skyDk)*15)},${Math.round(5+(1-skyDk)*10)},${Math.round(25+(1-skyDk)*15)})`;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#fff';
      for (const s of stars) { ctx.globalAlpha = (0.2+skyDk*0.8)*(0.5+Math.random()*0.5); ctx.fillRect(s.x*W, s.y*H, s.s, s.s); }
      ctx.globalAlpha = 1;

      // Orbit prediction
      if (d.alt > 50000 && d.v > 2000) {
        const orb = computeOrbit(d.alt, d.downrange, d.vr, d.vt);
        if (orb && orb.pts.length > 2) {
          ctx.strokeStyle = orb.peri > 0 ? 'rgba(0,255,120,0.5)' : 'rgba(255,80,80,0.5)';
          ctx.lineWidth = 2; ctx.setLineDash([8,5]); ctx.beginPath();
          for (let i = 0; i < orb.pts.length; i++) { const sp = toScr(orb.pts[i].x, orb.pts[i].y); i===0 ? ctx.moveTo(sp.x, sp.y) : ctx.lineTo(sp.x, sp.y); }
          ctx.stroke(); ctx.setLineDash([]);
        }
      }

      // Earth
      const ecS = toScr(0, -R);
      const eRP = R * zoom;
      const earthGrad = ctx.createRadialGradient(ecS.x, ecS.y - eRP * 0.3, eRP * 0.1, ecS.x, ecS.y, eRP);
      earthGrad.addColorStop(0, '#1a4a2a'); earthGrad.addColorStop(0.7, '#0f3518'); earthGrad.addColorStop(1, '#0a2510');
      ctx.fillStyle = earthGrad; ctx.beginPath(); ctx.arc(ecS.x, ecS.y, eRP, 0, Math.PI*2); ctx.fill();
      // Atmosphere glow
      const atmoP = 100000 * zoom;
      if (atmoP > 1) {
        const ag = ctx.createRadialGradient(ecS.x, ecS.y, eRP, ecS.x, ecS.y, eRP+atmoP);
        ag.addColorStop(0, 'rgba(80,160,255,0.25)'); ag.addColorStop(0.5, 'rgba(40,100,200,0.1)'); ag.addColorStop(1, 'rgba(20,50,120,0)');
        ctx.fillStyle = ag; ctx.beginPath(); ctx.arc(ecS.x, ecS.y, eRP+atmoP, 0, Math.PI*2); ctx.fill();
      }
      ctx.strokeStyle = '#4db8ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(ecS.x, ecS.y, eRP, 0, Math.PI*2); ctx.stroke();

      // Trail
      if (trail.length > 1) {
        ctx.strokeStyle = 'rgba(255,140,0,0.5)'; ctx.lineWidth = 2; ctx.beginPath();
        for (let i = 0; i < trail.length; i++) { const sp = toScr(trail[i].x, trail[i].y); i===0?ctx.moveTo(sp.x,sp.y):ctx.lineTo(sp.x,sp.y); }
        ctx.stroke();
      }

      // Debris
      for (const db of debris) {
        if (db.age > 20) continue;
        const dp = toScr(db.x, db.y); const al = Math.max(0, 1 - db.age / 12);
        ctx.save(); ctx.translate(dp.x, dp.y); ctx.rotate(db.a); ctx.globalAlpha = al;
        if (db.type === 'stage') { ctx.fillStyle='#888'; ctx.fillRect(-3,-db.sz/2,6,db.sz); }
        else if (db.type === 'fairing') { ctx.fillStyle='#aaa'; ctx.beginPath(); ctx.arc(0,0,db.sz/2,0,Math.PI); ctx.fill(); }
        else if (db.type === 'payload') { ctx.fillStyle='#ffcc00'; ctx.fillRect(-4,-3,8,6); ctx.fillStyle='#3366ff'; ctx.fillRect(-12,-2,7,4); ctx.fillRect(5,-2,7,4); }
        ctx.globalAlpha = 1; ctx.restore();
      }

      // Rocket
      const rp = toScr(rw.x, rw.y);
      const rW2 = 10, rH2 = 26;
      // Glow indicator (always visible even at extreme zoom-out)
      ctx.save();
      const glowR = Math.max(8, 16 / Math.max(0.0001, zoom * 500));
      const glow = ctx.createRadialGradient(rp.x, rp.y, 0, rp.x, rp.y, glowR);
      glow.addColorStop(0, d.burning ? 'rgba(255,120,0,0.6)' : 'rgba(200,200,255,0.4)');
      glow.addColorStop(1, 'rgba(255,120,0,0)');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(rp.x, rp.y, glowR, 0, Math.PI*2); ctx.fill();
      ctx.restore();
      ctx.save(); ctx.translate(rp.x, rp.y); ctx.rotate(Math.PI/2 - fpaRad);
      ctx.fillStyle = '#e0e0e0'; ctx.beginPath();
      ctx.moveTo(0,-rH2/2); ctx.lineTo(-rW2/3,-rH2/4); ctx.lineTo(-rW2/3,rH2/3); ctx.lineTo(rW2/3,rH2/3); ctx.lineTo(rW2/3,-rH2/4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#aaa'; ctx.beginPath(); ctx.moveTo(0,-rH2/2); ctx.lineTo(-rW2/2.5,-rH2/5); ctx.lineTo(rW2/2.5,-rH2/5); ctx.closePath(); ctx.fill();
      if (d.burning) {
        const fl = 14+Math.random()*10;
        const fg = ctx.createLinearGradient(0,rH2/3,0,rH2/3+fl);
        fg.addColorStop(0,'#ffaa00'); fg.addColorStop(0.4,'#ff6600'); fg.addColorStop(0.7,'#ff3300'); fg.addColorStop(1,'rgba(255,80,0,0)');
        ctx.fillStyle = fg; ctx.beginPath(); ctx.moveTo(-rW2/3.5,rH2/3); ctx.lineTo(rW2/3.5,rH2/3); ctx.lineTo(Math.random()*4-2,rH2/3+fl); ctx.closePath(); ctx.fill();
      }
      ctx.restore();

      // Telemetry
      const el = (id) => document.getElementById(id);
      const s = (id,v) => { const e2 = el(id); if(e2) e2.textContent = v; };
      s('tl-time', Math.round(d.t)+'s'); s('tl-alt', (d.alt/1000).toFixed(1)+' km');
      s('tl-dr', (d.downrange/1000).toFixed(1)+' km'); s('tl-vel', Math.round(d.v).toLocaleString()+' m/s');
      s('tl-q', Math.round(d.q).toLocaleString()+' Pa'); s('tl-acc', (Math.round(d.accel*100)/100)+' G');
      s('tl-pitch', (Math.round(d.fpa*10)/10)+'°'); s('tl-stage', (d.stage+1)+'/'+simResult.stageCount);
      const fuel0 = data[0].fuel;
      s('tl-fuel', fuel0>0 ? Math.round((d.fuel/fuel0)*100)+'%' : '0%');

      // Status (only if not locked by event)
      if (statusLock <= 0) {
        if (d.alt > 100000) setStatus('大気圏離脱');
        else if (d.alt > 50000) setStatus('上層大気通過中');
        else if (d.alt > 10000) setStatus('Max-Q通過');
        else if (d.t > 2) setStatus('上昇中');
      }

      this.launchAnimFrame = requestAnimationFrame(animate);
    };

    setTimeout(() => { setStatus('リフトオフ！', 2000); this.launchAnimFrame = requestAnimationFrame(animate); }, 1500);
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
