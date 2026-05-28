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
    const W = canvas.width;
    const H = canvas.height;

    const data = simResult.flightData;
    if (data.length === 0) {
      this._showResults(simResult, rocketParts, site, targetAlt, targetInc);
      return;
    }

    const maxSimTime = data[data.length - 1].t;
    let lastFrameTime = null;
    let simTimeCursor = 0;
    let lastDataIdx = 0;

    const maxAlt = Math.max(...data.map(d => d.alt), 10000);
    const maxDR = Math.max(...data.map(d => d.downrange), 5000);

    const stars = Array.from({ length: 100 }, () => ({
      x: Math.random() * W, y: Math.random() * H, s: Math.random() * 2 + 0.5
    }));

    const trail = [];
    let prevStage = 0;
    let stagingEffect = null;

    const margin = 30;
    const plotW = W - margin * 2;
    const plotH = H - margin - 10;

    const statusEl = document.getElementById('launch-status');
    const speedSlider = document.getElementById('speed-slider');

    const findDataIndex = (simTime) => {
      for (let i = 0; i < data.length; i++) {
        if (data[i].t >= simTime) return i;
      }
      return data.length - 1;
    };

    const animate = (now) => {
      if (!lastFrameTime) lastFrameTime = now;
      const speed = speedSlider ? parseInt(speedSlider.value) || 1 : 1;
      const dtReal = (now - lastFrameTime) / 1000;
      lastFrameTime = now;
      simTimeCursor += dtReal * speed;

      const idx = findDataIndex(simTimeCursor);
      lastDataIdx = idx;

      if (simTimeCursor >= maxSimTime) {
        cancelAnimationFrame(this.launchAnimFrame);
        setTimeout(() => {
          this._showResults(simResult, rocketParts, site, targetAlt, targetInc);
        }, 1200);
        return;
      }

      const d = data[idx];
      const lastTrailPt = trail.length > 0 ? trail[trail.length - 1] : null;
      if (!lastTrailPt || lastTrailPt.x !== d.downrange || lastTrailPt.y !== d.alt) {
        trail.push({ x: d.downrange, y: d.alt });
      }

      const viewAlt = Math.max(15000, d.alt * 1.5, maxAlt * (idx / data.length) * 1.2);
      const viewDR = Math.max(10000, d.downrange * 1.8, maxDR * (idx / data.length) * 1.2);

      const toX = (dr) => margin + (dr / viewDR) * plotW;
      const toY = (alt) => H - margin - (alt / viewAlt) * plotH;

      const skyDark = Math.min(1, d.alt / 80000);
      const bgR = Math.round(5 + (1 - skyDark) * 15);
      const bgG = Math.round(5 + (1 - skyDark) * 10);
      const bgB = Math.round(25 + (1 - skyDark) * 15);
      ctx.fillStyle = `rgb(${bgR},${bgG},${bgB})`;
      ctx.fillRect(0, 0, W, H);

      ctx.fillStyle = '#fff';
      for (const star of stars) {
        ctx.globalAlpha = (0.2 + skyDark * 0.8) * (0.5 + Math.random() * 0.5);
        ctx.fillRect(star.x, star.y, star.s, star.s);
      }
      ctx.globalAlpha = 1;

      const groundY = toY(0);
      if (groundY < H) {
        ctx.fillStyle = '#0d2a15';
        ctx.fillRect(0, groundY, W, H - groundY);
        ctx.strokeStyle = '#2196f3';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, groundY);
        ctx.lineTo(W, groundY);
        ctx.stroke();
      }

      const atmoTopAlt = 80000;
      const atmoTopY = toY(atmoTopAlt);
      if (atmoTopY < groundY) {
        const grad = ctx.createLinearGradient(0, atmoTopY, 0, groundY);
        grad.addColorStop(0, 'rgba(30,60,120,0)');
        grad.addColorStop(0.6, 'rgba(40,80,160,0.12)');
        grad.addColorStop(1, 'rgba(60,130,200,0.25)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, Math.max(0, atmoTopY), W, groundY - Math.max(0, atmoTopY));
      }

      if (trail.length > 1) {
        ctx.strokeStyle = 'rgba(255,140,0,0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < trail.length; i++) {
          const sx = toX(trail[i].x);
          const sy = toY(trail[i].y);
          if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
        }
        ctx.stroke();
      }

      if (d.stage !== prevStage) {
        stagingEffect = { x: d.downrange, y: d.alt, frame: 0 };
        if (statusEl) statusEl.textContent = (d.stage + 1) + '段目 点火！';
        prevStage = d.stage;
      }

      if (stagingEffect && stagingEffect.frame < 20) {
        const progress = stagingEffect.frame / 20;
        const sx = toX(stagingEffect.x);
        const sy = toY(stagingEffect.y);
        const radius = 5 + progress * 35;
        ctx.beginPath();
        ctx.arc(sx, sy, radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,200,50,${0.8 * (1 - progress)})`;
        ctx.fill();
        stagingEffect.frame++;
      }

      const rocketX = toX(d.downrange);
      const rocketY = toY(d.alt);
      const fpaRad = (d.fpa || 90) * Math.PI / 180;

      const rW = 8;
      const rH = 22;

      ctx.save();
      ctx.translate(rocketX, rocketY);
      ctx.rotate(Math.PI / 2 - fpaRad);

      ctx.fillStyle = '#ddd';
      ctx.beginPath();
      ctx.moveTo(0, -rH / 2);
      ctx.lineTo(-rW / 3, -rH / 4);
      ctx.lineTo(-rW / 3, rH / 3);
      ctx.lineTo(rW / 3, rH / 3);
      ctx.lineTo(rW / 3, -rH / 4);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#999';
      ctx.beginPath();
      ctx.moveTo(0, -rH / 2);
      ctx.lineTo(-rW / 2.5, -rH / 5);
      ctx.lineTo(rW / 2.5, -rH / 5);
      ctx.closePath();
      ctx.fill();

      if (d.fuel > 0) {
        const flameLen = 10 + Math.random() * 8;
        const grad = ctx.createLinearGradient(0, rH / 3, 0, rH / 3 + flameLen);
        grad.addColorStop(0, '#ff6600');
        grad.addColorStop(0.5, '#ff3300');
        grad.addColorStop(1, 'rgba(255,100,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(-rW / 4, rH / 3);
        ctx.lineTo(rW / 4, rH / 3);
        ctx.lineTo(Math.random() * 3 - 1.5, rH / 3 + flameLen);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      const el = (id) => document.getElementById(id);
      const tlTime = el('tl-time');
      if (tlTime) tlTime.textContent = d.t + 's';
      const tlAlt = el('tl-alt');
      if (tlAlt) tlAlt.textContent = (d.alt / 1000).toFixed(1) + ' km';
      const tlDr = el('tl-dr');
      if (tlDr) tlDr.textContent = (d.downrange / 1000).toFixed(1) + ' km';
      const tlVel = el('tl-vel');
      if (tlVel) tlVel.textContent = d.v.toLocaleString() + ' m/s';
      const tlQ = el('tl-q');
      if (tlQ) tlQ.textContent = d.q.toLocaleString() + ' Pa';
      const tlAcc = el('tl-acc');
      if (tlAcc) tlAcc.textContent = d.accel + ' G';
      const tlPitch = el('tl-pitch');
      if (tlPitch) tlPitch.textContent = d.fpa + '°';
      const tlStage = el('tl-stage');
      if (tlStage) tlStage.textContent = (d.stage + 1) + '/' + simResult.stageCount;
      const tlFuel = el('tl-fuel');
      if (tlFuel) {
        const fuel0 = data[0].fuel;
        tlFuel.textContent = fuel0 > 0 ? Math.round((d.fuel / fuel0) * 100) + '%' : '0%';
      }

      if (!stagingEffect || stagingEffect.frame >= 20) {
        if (d.alt > 100000 && statusEl) statusEl.textContent = '大気圏離脱';
        else if (d.alt > 50000 && statusEl) statusEl.textContent = '上層大気通過中';
        else if (d.alt > 10000 && statusEl) statusEl.textContent = 'Max-Q通過';
        else if (d.t > 2 && statusEl) statusEl.textContent = '上昇中';
      }

      this.launchAnimFrame = requestAnimationFrame(animate);
    };

    setTimeout(() => {
      if (statusEl) statusEl.textContent = 'リフトオフ！';
      this.launchAnimFrame = requestAnimationFrame(animate);
    }, 1500);
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
