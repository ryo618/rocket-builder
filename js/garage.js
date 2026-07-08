var G = window.G || {};
window.G = G;

G.Garage = {
  // Grid constants
  GRID_COLS: 10,
  GRID_ROWS: 20,
  CELL_SIZE: 36,

  // State
  placedParts: [],
  selectedUid: null,
  activeTab: 'engine',
  connections: [],
  uidCounter: 0,

  // Drag state
  dragging: null,
  // Zoom/Pan state
  zoom: 1,
  panX: 0,
  panY: 0,
  panning: null,

  // DOM refs
  _el: null,
  _gridEl: null,
  _bound: {},

  // ---------- Lifecycle ----------
  init(container) {
    this._el = container;
    this._loadLayout();
    this._render();
    this._bindEvents();
    this._updateStats();
  },

  destroy() {
    this._unbindEvents();
    this._bound = {};
    this._el = null;
    this._gridEl = null;
  },

  // ---------- UID ----------
  _uid() {
    return 'p_' + (++this.uidCounter);
  },

  // ---------- Layout persistence ----------
  _saveLayout() {
    const data = this.placedParts.map(p => ({ uid: p.uid, partId: p.partId, category: p.category, col: p.col, row: p.row }));
    G.State.set('workspaceLayout', data);
  },

  _loadLayout() {
    const saved = G.State.get('workspaceLayout');
    if (saved && saved.length > 0) {
      this.placedParts = saved.map(p => ({
        ...p,
        ...G.PART_GRID[p.category],
      }));
      this.uidCounter = Math.max(0, ...saved.map(p => parseInt(p.uid.split('_')[1]) || 0));
    } else {
      this._createDefaultLayout();
    }
    this.selectedUid = null;
    this.connections = this._computeConnections();
  },

  _createDefaultLayout() {
    this.placedParts = [];
    const cx = 4; // center column for 2-wide parts in 10-col grid
    let row = 16; // start from bottom
    // Engine 1 (bottom)
    this._addPart('e1a', 'engine', cx, row); row -= G.PART_GRID.tank.h;
    this._addPart('t1a', 'tank', cx, row); row -= G.PART_GRID.structure.h;
    this._addPart('s1', 'structure', cx, row); row -= G.PART_GRID.engine.h;
    this._addPart('e1b', 'engine', cx, row); row -= G.PART_GRID.tank.h;
    this._addPart('t1b', 'tank', cx, row); row -= G.PART_GRID.obc.h;
    this._addPart('obc1', 'obc', cx, row); row -= G.PART_GRID.payload.h;
    this._addPart('p1', 'payload', cx, row); row -= G.PART_GRID.fairing.h;
    this._addPart('f1', 'fairing', cx, row);
    this._saveLayout();
  },

  _addPart(partId, category, col, row) {
    const g = G.PART_GRID[category];
    const p = { uid: this._uid(), partId, category, col, row, w: g.w, h: g.h, connectTop: g.connectTop, connectBottom: g.connectBottom };
    this.placedParts.push(p);
    return p;
  },

  // ---------- Rendering ----------
  _render() {
    const CS = this.CELL_SIZE;
    const GC = this.GRID_COLS;
    const GR = this.GRID_ROWS;

    this._el.innerHTML = `
      <div class="garage-screen-new">
        <div class="garage-tabs" id="garage-tabs"></div>
        <div class="garage-palette" id="garage-palette"></div>
        <div class="garage-workspace-wrap">
          <div class="garage-workspace" id="garage-workspace"
               style="width:${GC*CS}px;height:${GR*CS}px;background-size:${CS}px ${CS}px">
          </div>
          <div class="garage-actions" id="garage-actions">
            <button class="gact-btn gact-delete" id="gact-delete" title="削除">🗑️</button>
          </div>
        </div>
        <div class="garage-info" id="garage-info"></div>
        <div class="garage-stats" id="garage-stats"></div>
        <button class="garage-complete-btn" id="garage-complete-btn">設計完了</button>
      </div>
    `;
    this._gridEl = document.getElementById('garage-workspace');
    this._renderTabs();
    this._renderPalette();
    this._renderGrid();
    this._updateActions();
    // Center workspace initially
    requestAnimationFrame(() => {
      const wr = this._gridEl?.parentElement;
      if (wr && this._gridEl) {
        const ww = wr.clientWidth, wh = wr.clientHeight;
        const gw = this._gridEl.offsetWidth, gh = this._gridEl.offsetHeight;
        this.zoom = Math.min(ww / gw, wh / gh) * 0.85;
        this.panX = (ww - gw * this.zoom) / 2;
        this.panY = (wh - gh * this.zoom) / 2;
        this._applyTransform();
      }
    });
  },

  _renderTabs() {
    const el = document.getElementById('garage-tabs');
    const cats = ['engine','tank','structure','fairing','payload','obc'];
    const labels = { engine:'エンジン', tank:'タンク', structure:'段間', fairing:'フェアリング', payload:'衛星', obc:'アダプタ' };
    el.innerHTML = cats.map(c => {
      const rep = G.PARTS[c] && G.PARTS[c][0];
      const svg = this._partSVG(c, 'tab_'+c, '#aaa', rep, null);
      return `<button class="gtab ${c === this.activeTab ? 'active' : ''}" data-cat="${c}">
        <span class="gtab-icon">${svg}</span><span class="gtab-label">${labels[c]}</span>
      </button>`;
    }).join('');
  },

  _renderPalette() {
    const el = document.getElementById('garage-palette');
    const inv = G.State.get('inventory') || [];
    const placedIds = this.placedParts.map(p => p.partId);

    // Count available: inventory count minus placed count per ID
    const invCount = {};
    for (const id of inv) invCount[id] = (invCount[id] || 0) + 1;
    const plCount = {};
    for (const id of placedIds) plCount[id] = (plCount[id] || 0) + 1;

    const available = [];
    for (const id of Object.keys(invCount)) {
      const remain = invCount[id] - (plCount[id] || 0);
      if (remain <= 0) continue;
      const p = G.getPartById(id);
      if (p && p.category === this.activeTab) available.push(p);
    }

    if (available.length === 0) {
      el.innerHTML = '<div class="palette-empty">パーツなし</div>';
      return;
    }
    el.innerHTML = available.sort((a,b) => b.rarity - a.rarity).map(p => {
      const rc = G.RARITY[p.rarity].color;
      const svg = this._partSVG(p.category, 'pal_'+p.id, rc, p, null);
      return `<div class="palette-part" data-part-id="${p.id}" data-cat="${p.category}" style="border-color:${rc}" draggable="false">
        <div class="palette-svg">${svg}</div>
        <span class="palette-star" style="color:${rc}">${G.STAR(p.rarity)}</span>
        <span class="palette-name">${p.name}</span>
      </div>`;
    }).join('');
  },

  _renderGrid() {
    if (!this._gridEl) return;
    const CS = this.CELL_SIZE;
    this._gridEl.querySelectorAll('.grid-part,.conn-indicator').forEach(e => e.remove());

    // Render normal parts first, then structure/fairing on top
    const normal = [];
    const shells = [];
    for (const p of this.placedParts) {
      (p.category === 'structure' || p.category === 'fairing' ? shells : normal).push(p);
    }
    for (const p of [...normal, ...shells]) {
      const div = document.createElement('div');
      div.className = 'grid-part' + (p.uid === this.selectedUid ? ' selected' : '');
      div.dataset.uid = p.uid;
      const part = G.getPartById(p.partId);
      const rc = part ? G.RARITY[part.rarity].color : '#666';
      const g = G.PART_GRID[p.category];
      const isOL = (p.category === 'structure' || p.category === 'fairing') && this._isOverlapping(p.uid);
      const adj = this._getAdjacency(p.uid);

      let renderH = g.h;
      let fairingExt = false;
      let tankExt = false;

      // Fairing auto-extension: extend visually to nearest tank below
      if (p.category === 'fairing') {
        const tankBelow = this.placedParts
          .filter(q => q.category === 'tank' && q.col === p.col && q.row >= p.row + g.h)
          .sort((a, b) => a.row - b.row)[0];
        if (tankBelow) {
          const extH = tankBelow.row - p.row;
          if (extH > g.h) { renderH = extH; fairingExt = true; }
        }
      }

      // Tank size scaling by capacity (base: t1a = 2200)
      if (p.category === 'tank' && part) {
        const cap = part.propellantCapacity || 2200;
        const ratio = cap / 2200;
        const sh = Math.pow(ratio, 0.8);
        renderH = Math.max(g.h, Math.min(8, Math.round(3 * sh)));
        if (renderH !== g.h) tankExt = true;
      }

      const zStyle = (isOL || fairingExt) ? 'z-index:10; opacity:0.45;'
                   : tankExt ? 'z-index:0;' : 'z-index:1;';
      // Bottom-anchor tanks so engine connection stays aligned
      const topPx = (p.category === 'tank') ? (p.row + g.h - renderH) * CS : p.row * CS;
      div.style.cssText = `
        left:${p.col * CS}px; top:${topPx}px;
        width:${g.w * CS}px; height:${renderH * CS}px;
        ${zStyle}
      `;

      if (p.category === 'fairing') {
        div.innerHTML = this._svgFairing(p.uid, rc, part, adj, renderH);
      } else if (p.category === 'tank') {
        div.innerHTML = this._svgTank(p.uid, rc, part, adj, renderH);
      } else if (p.category === 'structure') {
        const tw = this._getStructureTankWidths(p);
        div.innerHTML = this._svgStructure(p.uid, rc, part, adj, tw.topBw, tw.botBw);
      } else {
        div.innerHTML = this._partSVG(p.category, p.uid, rc, part, adj);
      }
      this._gridEl.appendChild(div);
    }
  },

  _updateActions() {
    const actEl = document.getElementById('garage-actions');
    if (actEl) actEl.style.display = this.selectedUid ? '' : 'none';
  },

  _updateInfo() {
    const infoEl = document.getElementById('garage-info');
    if (!infoEl) return;
    if (!this.selectedUid) { infoEl.innerHTML = ''; return; }
    const placed = this.placedParts.find(p => p.uid === this.selectedUid);
    if (!placed) { infoEl.innerHTML = ''; return; }
    const part = G.getPartById(placed.partId);
    if (!part) { infoEl.innerHTML = ''; return; }
    const rc = G.RARITY[part.rarity].color;
    infoEl.innerHTML = `
      <div class="info-header" style="border-left:3px solid ${rc}">
        <span style="color:${rc}">${G.STAR(part.rarity)}</span> ${part.name}
      </div>
      <div class="info-detail">${G.Screens._partDetail(part)}</div>
    `;
  },

  _updateStats() {
    const el = document.getElementById('garage-stats');
    if (!el) return;
    try {
      const config = this.toRocketConfig();
      if (config) {
        const stats = G.Screens._calcRocketStats(config);
        el.innerHTML = `総質量: ${stats.totalMass.toLocaleString()}kg | ΔV: ${stats.deltaV.toLocaleString()}m/s | T/W: ${stats.tw}`;
        return;
      }
    } catch(e) { /* config not valid yet */ }
    // Fallback: just total mass
    let mass = 0;
    for (const pp of this.placedParts) {
      const part = G.getPartById(pp.partId);
      if (!part) continue;
      mass += part.dryMass || part.mass || 0;
      if (part.propellantCapacity) mass += part.propellantCapacity;
    }
    el.innerHTML = `総質量: ${mass.toLocaleString()}kg | ΔV: -- | T/W: --`;
  },

  // ---------- Adjacency ----------
  _getAdjacency(uid) {
    const part = this.placedParts.find(p => p.uid === uid);
    if (!part) return { above: null, below: null };
    const g = G.PART_GRID[part.category];
    const others = this.placedParts.filter(p => p.uid !== uid);

    // 1) Edge-adjacent check
    let above = others.find(p => {
      const pg = G.PART_GRID[p.category];
      return p.col === part.col && (p.row + pg.h) === part.row && pg.w === g.w;
    });
    let below = others.find(p => {
      return p.col === part.col && p.row === (part.row + g.h) && G.PART_GRID[p.category].w === g.w;
    });

    // 2) Fallback: overlapping structure/fairing covering top/bottom edge
    if (!above) {
      above = others.find(p => {
        if (p.category !== 'structure' && p.category !== 'fairing') return false;
        const pg = G.PART_GRID[p.category];
        return p.col === part.col && pg.w === g.w && p.row < part.row && (p.row + pg.h) > part.row;
      });
    }
    if (!below) {
      below = others.find(p => {
        if (p.category !== 'structure' && p.category !== 'fairing') return false;
        const pg = G.PART_GRID[p.category];
        const partBot = part.row + g.h;
        return p.col === part.col && pg.w === g.w && p.row < partBot && (p.row + pg.h) > partBot;
      });
    }

    return { above: above ? above.category : null, below: below ? below.category : null };
  },

  // ---------- Part SVG Illustrations ----------
  _partSVG(category, uid, color, partData, adj) {
    const c = color || '#888';
    const id = uid || 'x';
    switch (category) {
      case 'engine': return this._svgEngine(id, c, partData, adj);
      case 'tank': return this._svgTank(id, c, partData, adj);
      case 'structure': return this._svgStructure(id, c, partData, adj);
      case 'fairing': return this._svgFairing(id, c, partData, adj);
      case 'payload': return this._svgPayload(id, c, partData, adj);
      case 'obc': return this._svgOBC(id, c, partData, adj);
      default: return '';
    }
  },

  _svgEngine(id, c, part, adj) {
    const thrust = part ? (part.vacuumThrust || 55) : 55;
    // Piecewise nozzle sizing: 10kN→7, 30kN→11, 55kN→26(=tank width), 270kN→30
    let neHW;
    if (thrust <= 30) neHW = Math.round(7 + (thrust - 10) * 0.2);
    else if (thrust <= 55) neHW = Math.round(11 + (thrust - 30) * 0.6);
    else neHW = Math.round(26 + (thrust - 55) * 0.019);
    const chHW = Math.max(5, Math.round(neHW * 0.55));
    const mount = adj && adj.above;
    const y0 = mount ? 8 : 0;
    let s = `<svg viewBox="0 0 72 72" preserveAspectRatio="xMidYMid meet" class="part-svg">
      <defs>
        <linearGradient id="em_${id}" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#555"/><stop offset="35%" stop-color="#999"/>
          <stop offset="50%" stop-color="#aaa"/><stop offset="65%" stop-color="#999"/>
          <stop offset="100%" stop-color="#555"/>
        </linearGradient>
        <linearGradient id="en_${id}" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#444"/><stop offset="30%" stop-color="#777"/>
          <stop offset="50%" stop-color="#888"/><stop offset="70%" stop-color="#777"/>
          <stop offset="100%" stop-color="#444"/>
        </linearGradient>
      </defs>`;
    if (mount) {
      s += `<rect x="10" y="0" width="52" height="3" fill="url(#em_${id})" stroke="#777" stroke-width="0.4"/>`;
      s += `<path d="M10 3 L${36-chHW-4} ${y0} L${36+chHW+4} ${y0} L62 3 Z" fill="url(#em_${id})" stroke="#777" stroke-width="0.3"/>`;
    }
    s += `<rect x="${36-chHW-3}" y="${y0}" width="${(chHW+3)*2}" height="9" rx="2" fill="url(#em_${id})" stroke="#777" stroke-width="0.6"/>
      <circle cx="${36-chHW/2}" cy="${y0+4.5}" r="3" fill="#4a4a5a" stroke="#888" stroke-width="0.4"/>
      <circle cx="${36-chHW/2}" cy="${y0+4.5}" r="1.2" fill="#333"/>
      <circle cx="${36+chHW/2}" cy="${y0+4.5}" r="3" fill="#4a4a5a" stroke="#888" stroke-width="0.4"/>
      <circle cx="${36+chHW/2}" cy="${y0+4.5}" r="1.2" fill="#333"/>
      <path d="M${36-chHW-3} ${y0+2} L${36-chHW-9} ${y0} L${36-chHW-9} ${y0+5} L${36-chHW-3} ${y0+4}" fill="#555" stroke="#777" stroke-width="0.4"/>
      <path d="M${36+chHW+3} ${y0+2} L${36+chHW+9} ${y0} L${36+chHW+9} ${y0+5} L${36+chHW+3} ${y0+4}" fill="#555" stroke="#777" stroke-width="0.4"/>
      <rect x="${36-chHW}" y="${y0+9}" width="${chHW*2}" height="8" rx="1.5" fill="url(#em_${id})" stroke="${c}" stroke-width="0.8"/>
      <line x1="${36-chHW}" y1="${y0+10}" x2="${36+chHW}" y2="${y0+10}" stroke="${c}" stroke-width="0.8"/>
      <ellipse cx="36" cy="${y0+17}" rx="${chHW+2}" ry="2" fill="#666" stroke="#888" stroke-width="0.5"/>
      <path d="M${36-chHW} ${y0+19} L${36-neHW*0.4} ${y0+23} L${36+neHW*0.4} ${y0+23} L${36+chHW} ${y0+19} Z" fill="url(#em_${id})" stroke="#777" stroke-width="0.4"/>
      <path d="M${36-neHW*0.4} ${y0+23} C${36-neHW*0.5} ${y0+31} ${36-neHW-2} ${y0+45} ${36-neHW} 69 L${36+neHW} 69 C${36+neHW+2} ${y0+45} ${36+neHW*0.5} ${y0+31} ${36+neHW*0.4} ${y0+23} Z" fill="url(#en_${id})" stroke="${c}" stroke-width="0.8"/>
      <path d="M${36-neHW*0.4+2} ${y0+24} C${36-neHW*0.4} ${y0+32} ${36-neHW} ${y0+46} ${36-neHW+2} 67 L${36+neHW-2} 67 C${36+neHW} ${y0+46} ${36+neHW*0.4} ${y0+32} ${36+neHW*0.4-2} ${y0+24} Z" fill="#0d0d1e"/>
      <line x1="36" y1="${y0+25}" x2="36" y2="67" stroke="#666" stroke-width="0.3" opacity="0.3"/>
      <line x1="${36-3}" y1="${y0+27}" x2="${36-neHW+3}" y2="67" stroke="#666" stroke-width="0.3" opacity="0.4"/>
      <line x1="${36+3}" y1="${y0+27}" x2="${36+neHW-3}" y2="67" stroke="#666" stroke-width="0.3" opacity="0.4"/>
      <line x1="${36-neHW}" y1="69" x2="${36+neHW}" y2="69" stroke="${c}" stroke-width="1.2" stroke-linecap="round"/>
      <ellipse cx="36" cy="70" rx="${neHW}" ry="2" fill="${c}" opacity="0.12"/>
    </svg>`;
    return s;
  },

  _svgTank(id, c, part, adj, cellH) {
    const cap = part ? (part.propellantCapacity || 2200) : 2200;
    const ratio = cap / 2200;
    const sw = Math.pow(ratio, 0.2);
    const bw = Math.max(40, Math.min(64, Math.round(52 * sw)));
    const bx = Math.round(36 - bw / 2);
    const h = (cellH || 3) * 36;
    const domeH = 12;
    // Draw top dome if visual doesn't match grid allocation (bottom-anchored gap)
    const gridH = 3;
    const domeTop = !adj || !adj.above || (cellH != null && cellH !== gridH);
    const domeBot = !adj || !adj.below;
    const by = domeTop ? domeH : 0;
    const bend = domeBot ? (h - domeH) : h;
    const bh = bend - by;
    const fillFrac = Math.min(1, Math.max(0.3, cap / 8500));
    const fillH = bh * fillFrac * 0.45;
    let s = `<svg viewBox="0 0 72 ${h}" preserveAspectRatio="xMidYMid meet" class="part-svg">
      <defs>
        <linearGradient id="tm_${id}" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#777"/><stop offset="30%" stop-color="#bbb"/>
          <stop offset="50%" stop-color="#ccc"/><stop offset="70%" stop-color="#bbb"/>
          <stop offset="100%" stop-color="#777"/>
        </linearGradient>
      </defs>
      <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="url(#tm_${id})" stroke="${c}" stroke-width="0.8"/>`;
    if (domeTop) s += `<path d="M${bx} ${by} Q${bx} 0 36 0 Q${bx+bw} 0 ${bx+bw} ${by} Z" fill="url(#tm_${id})" stroke="${c}" stroke-width="0.8"/>`;
    if (domeBot) s += `<path d="M${bx} ${bend} Q${bx} ${h} 36 ${h} Q${bx+bw} ${h} ${bx+bw} ${bend} Z" fill="url(#tm_${id})" stroke="${c}" stroke-width="0.8"/>`;
    const y1 = by + bh * 0.35, y2 = by + bh * 0.7;
    s += `<line x1="${bx}" y1="${y1}" x2="${bx+bw}" y2="${y1}" stroke="#999" stroke-width="0.5" stroke-dasharray="2,2"/>
      <line x1="${bx}" y1="${y2}" x2="${bx+bw}" y2="${y2}" stroke="#999" stroke-width="0.5" stroke-dasharray="2,2"/>
      <line x1="36" y1="${domeTop?2:by}" x2="36" y2="${domeBot?(h-2):bend}" stroke="#aaa" stroke-width="0.3" opacity="0.4"/>
      <line x1="${bx+Math.round(bw*0.23)}" y1="${domeTop?4:by}" x2="${bx+Math.round(bw*0.23)}" y2="${domeBot?(h-4):bend}" stroke="#aaa" stroke-width="0.2" opacity="0.25"/>
      <line x1="${bx+bw-Math.round(bw*0.23)}" y1="${domeTop?4:by}" x2="${bx+bw-Math.round(bw*0.23)}" y2="${domeBot?(h-4):bend}" stroke="#aaa" stroke-width="0.2" opacity="0.25"/>
      <rect x="${36-8}" y="${by+4}" width="16" height="8" rx="1" fill="#444" stroke="#666" stroke-width="0.5" opacity="0.6"/>
      <circle cx="36" cy="${by+8}" r="2" fill="#555" stroke="#888" stroke-width="0.4"/>
      <rect x="${bx+2}" y="${bend-fillH}" width="${bw-4}" height="${fillH}" fill="${c}" opacity="0.06" rx="1"/>
    </svg>`;
    return s;
  },

  _tankBw(partOrCap) {
    const cap = (typeof partOrCap === 'number') ? partOrCap
              : partOrCap ? (partOrCap.propellantCapacity || 2200) : 2200;
    return Math.max(40, Math.min(64, Math.round(52 * Math.pow(cap / 2200, 0.2))));
  },

  _getStructureTankWidths(structPart) {
    const col = structPart.col;
    const topRow = structPart.row;
    const botRow = structPart.row + G.PART_GRID.structure.h;
    const bwOf = (p) => { const pd = G.getPartById(p.partId); return this._tankBw(pd); };
    const tankAbove = this.placedParts.find(p =>
      p.category === 'tank' && p.col === col && (p.row + G.PART_GRID.tank.h) >= topRow && p.row < topRow);
    const tankBelow = this.placedParts.find(p =>
      p.category === 'tank' && p.col === col && p.row >= topRow && p.row <= botRow);
    return { topBw: tankAbove ? bwOf(tankAbove) : 52, botBw: tankBelow ? bwOf(tankBelow) : 52 };
  },

  _svgStructure(id, c, part, adj, topBw, botBw) {
    topBw = topBw || 52; botBw = botBw || 52;
    const tx1 = Math.round(36 - topBw / 2), tx2 = Math.round(36 + topBw / 2);
    const bx1 = Math.round(36 - botBw / 2), bx2 = Math.round(36 + botBw / 2);
    return `<svg viewBox="0 0 72 72" preserveAspectRatio="xMidYMid meet" class="part-svg">
      <defs>
        <linearGradient id="sm_${id}" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#777"/><stop offset="30%" stop-color="#bbb"/>
          <stop offset="50%" stop-color="#ccc"/><stop offset="70%" stop-color="#bbb"/>
          <stop offset="100%" stop-color="#777"/>
        </linearGradient>
      </defs>
      <path d="M${tx1} 0 L${bx1} 72 L${bx2} 72 L${tx2} 0 Z" fill="url(#sm_${id})" stroke="#999" stroke-width="0.6"/>
      <line x1="${tx1+Math.round(topBw*0.25)}" y1="0" x2="${bx1+Math.round(botBw*0.25)}" y2="72" stroke="#aaa" stroke-width="0.3" opacity="0.4"/>
      <line x1="36" y1="0" x2="36" y2="72" stroke="#aaa" stroke-width="0.3" opacity="0.4"/>
      <line x1="${tx1+Math.round(topBw*0.75)}" y1="0" x2="${bx1+Math.round(botBw*0.75)}" y2="72" stroke="#aaa" stroke-width="0.3" opacity="0.4"/>
      <line x1="${tx1}" y1="3" x2="${tx2}" y2="3" stroke="#888" stroke-width="0.7"/>
      <line x1="${bx1}" y1="69" x2="${bx2}" y2="69" stroke="#888" stroke-width="0.7"/>
      <line x1="${Math.round((tx1+bx1)/2)}" y1="36" x2="${Math.round((tx2+bx2)/2)}" y2="36" stroke="#aaa" stroke-width="0.4" opacity="0.3"/>
      <circle cx="${tx1+6}" cy="3" r="1.2" fill="#999"/><circle cx="${tx1+Math.round(topBw*0.35)}" cy="3" r="1.2" fill="#999"/>
      <circle cx="${tx2-Math.round(topBw*0.35)}" cy="3" r="1.2" fill="#999"/><circle cx="${tx2-6}" cy="3" r="1.2" fill="#999"/>
      <circle cx="${bx1+6}" cy="69" r="1.2" fill="#999"/><circle cx="${bx1+Math.round(botBw*0.35)}" cy="69" r="1.2" fill="#999"/>
      <circle cx="${bx2-Math.round(botBw*0.35)}" cy="69" r="1.2" fill="#999"/><circle cx="${bx2-6}" cy="69" r="1.2" fill="#999"/>
    </svg>`;
  },

  _svgFairing(id, c, part, adj, cellH) {
    const h = (cellH || 2) * 36;
    const cd = part ? (part.dragCoefficient || 0.5) : 0.5;
    const isCone = cd >= 0.45; // standard=cone, streamlined=ogive
    const pl1 = Math.round(42 + (h - 42) * 0.33);
    const pl2 = Math.round(42 + (h - 42) * 0.67);
    let nosePath, hlL, hlR;
    if (isCone) {
      // Epsilon-style straight cone
      nosePath = `M36 3 L10 42 L10 ${h} L62 ${h} L62 42 L36 3 Z`;
      hlL = `M36 3 L10 42`;
      hlR = `M36 3 L62 42`;
    } else {
      // KAIROS-style ogive curve
      nosePath = `M36 3 C35 10 26 18 14 32 Q10 38 10 42 L10 ${h} L62 ${h} L62 42 Q62 38 58 32 C46 18 37 10 36 3 Z`;
      hlL = `M36 3 C35 10 26 18 14 32 Q10 38 10 42`;
      hlR = `M36 3 C37 10 46 18 58 32 Q62 38 62 42`;
    }
    return `<svg viewBox="0 0 72 ${h}" preserveAspectRatio="none" class="part-svg">
      <defs>
        <linearGradient id="fm_${id}" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#777"/><stop offset="30%" stop-color="#bbb"/>
          <stop offset="50%" stop-color="#ccc"/><stop offset="70%" stop-color="#bbb"/>
          <stop offset="100%" stop-color="#777"/>
        </linearGradient>
      </defs>
      <path d="${nosePath}" fill="url(#fm_${id})" stroke="#999" stroke-width="0.6"/>
      <line x1="36" y1="3" x2="36" y2="${h}" stroke="#aaa" stroke-width="0.5" opacity="0.3"/>
      <path d="${hlL}" fill="none" stroke="#bbb" stroke-width="0.3" opacity="0.4"/>
      <path d="${hlR}" fill="none" stroke="#999" stroke-width="0.3" opacity="0.3"/>
      <line x1="10" y1="${pl1}" x2="62" y2="${pl1}" stroke="#aaa" stroke-width="0.4" opacity="0.3"/>
      <line x1="10" y1="${pl2}" x2="62" y2="${pl2}" stroke="#aaa" stroke-width="0.4" opacity="0.3"/>
      <rect x="10" y="${h-4}" width="52" height="4" fill="#888" stroke="#999" stroke-width="0.5" rx="0.5"/>
      <circle cx="36" cy="5" r="1.5" fill="#aaa" opacity="0.4"/>
    </svg>`;
  },

  _svgPayload(id, c, part, adj) {
    return `<svg viewBox="0 0 72 36" preserveAspectRatio="xMidYMid meet" class="part-svg">
      <defs>
        <linearGradient id="pm_${id}" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#3a3a5a"/><stop offset="50%" stop-color="#4a4a6a"/>
          <stop offset="100%" stop-color="#3a3a5a"/>
        </linearGradient>
      </defs>
      <!-- CubeSat body -->
      <rect x="24" y="6" width="24" height="24" rx="2" fill="url(#pm_${id})" stroke="${c}" stroke-width="1"/>
      <!-- Instrument panel -->
      <rect x="26" y="8" width="8" height="6" rx="1" fill="#555" stroke="#777" stroke-width="0.4"/>
      <!-- Camera/sensor -->
      <circle cx="42" cy="14" r="3" fill="#333" stroke="${c}" stroke-width="0.5"/>
      <circle cx="42" cy="14" r="1.2" fill="${c}" opacity="0.4"/>
      <!-- Folded solar panels on sides (stowed, not deployed) -->
      <rect x="21" y="8" width="3" height="20" rx="0.5" fill="#2a3a5a" stroke="#4a6a8a" stroke-width="0.5"/>
      <line x1="22" y1="12" x2="22" y2="24" stroke="#4a6a8a" stroke-width="0.3"/>
      <rect x="48" y="8" width="3" height="20" rx="0.5" fill="#2a3a5a" stroke="#4a6a8a" stroke-width="0.5"/>
      <line x1="50" y1="12" x2="50" y2="24" stroke="#4a6a8a" stroke-width="0.3"/>
      <!-- Status LEDs -->
      <circle cx="28" cy="26" r="1" fill="${c}" opacity="0.6"/>
      <circle cx="32" cy="26" r="1" fill="#4a4" opacity="0.5"/>
      <!-- Antenna stub -->
      <line x1="36" y1="3" x2="36" y2="6" stroke="#888" stroke-width="1"/>
      <circle cx="36" cy="2" r="1.5" fill="#666" stroke="#888" stroke-width="0.4"/>
    </svg>`;
  },

  _svgOBC(id, c, part, adj) {
    return `<svg viewBox="0 0 72 36" preserveAspectRatio="xMidYMid meet" class="part-svg">
      <defs>
        <linearGradient id="om_${id}" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#555"/><stop offset="35%" stop-color="#888"/>
          <stop offset="50%" stop-color="#999"/><stop offset="65%" stop-color="#888"/>
          <stop offset="100%" stop-color="#555"/>
        </linearGradient>
      </defs>
      <path d="M18 0 L10 36 L62 36 L54 0 Z" fill="url(#om_${id})" stroke="#aaa" stroke-width="0.6"/>
      <rect x="16" y="0" width="40" height="3" rx="0.5" fill="#777" stroke="#aaa" stroke-width="0.4"/>
      <rect x="10" y="33" width="52" height="3" rx="0.5" fill="#777" stroke="#aaa" stroke-width="0.4"/>
      <rect x="27" y="10" width="18" height="10" rx="2" fill="#1a2a1a" stroke="#4a5a4a" stroke-width="0.5"/>
      <line x1="30" y1="12" x2="40" y2="12" stroke="#4a6a4a" stroke-width="0.3" opacity="0.6"/>
      <line x1="29" y1="14.5" x2="38" y2="14.5" stroke="#4a6a4a" stroke-width="0.3" opacity="0.6"/>
      <line x1="30" y1="17" x2="42" y2="17" stroke="#4a6a4a" stroke-width="0.3" opacity="0.6"/>
      <circle cx="30" cy="18.5" r="1" fill="${c}" opacity="0.8"/>
      <circle cx="34" cy="18.5" r="1" fill="#4a4" opacity="0.6"/>
      <circle cx="14" cy="34.5" r="1.2" fill="#999"/><circle cx="36" cy="34.5" r="1.2" fill="#999"/>
      <circle cx="58" cy="34.5" r="1.2" fill="#999"/>
    </svg>`;
  },

  // ---------- Events ----------
  _bindEvents() {
    const b = this._bound;
    b.tabClick = (e) => {
      const btn = e.target.closest('.gtab');
      if (!btn) return;
      this.activeTab = btn.dataset.cat;
      this._renderTabs();
      this._renderPalette();
    };
    b.pointerDown = (e) => this._onPointerDown(e);
    b.pointerMove = (e) => this._onPointerMove(e);
    b.pointerUp = (e) => this._onPointerUp(e);
    b.wheel = (e) => this._onWheel(e);
    b.deleteClick = () => this._deletePart();
    b.completeClick = () => this._onComplete();

    document.getElementById('garage-tabs')?.addEventListener('click', b.tabClick);
    document.getElementById('garage-palette')?.addEventListener('pointerdown', b.pointerDown);
    this._gridEl?.addEventListener('pointerdown', b.pointerDown);
    document.addEventListener('pointermove', b.pointerMove);
    document.addEventListener('pointerup', b.pointerUp);
    this._gridEl?.parentElement?.addEventListener('wheel', b.wheel, { passive: false });
    document.getElementById('gact-delete')?.addEventListener('click', b.deleteClick);
    document.getElementById('garage-complete-btn')?.addEventListener('click', b.completeClick);
  },

  _unbindEvents() {
    const b = this._bound;
    document.removeEventListener('pointermove', b.pointerMove);
    document.removeEventListener('pointerup', b.pointerUp);
    this._gridEl?.parentElement?.removeEventListener('wheel', b.wheel);
  },

  _onPointerDown(e) {
    // From palette?
    const palPart = e.target.closest('.palette-part');
    if (palPart) {
      e.preventDefault();
      const partId = palPart.dataset.partId;
      const cat = palPart.dataset.cat;
      this._startDrag(e, { partId, category: cat, fromGrid: false });
      return;
    }
    // From grid?
    const gridPart = e.target.closest('.grid-part');
    if (gridPart) {
      e.preventDefault();
      const uid = gridPart.dataset.uid;
      const placed = this.placedParts.find(p => p.uid === uid);
      if (!placed) return;

      // Select it
      this.selectedUid = uid;
      this._renderGrid();
      this._updateActions();
      this._updateInfo();

      // Start drag
      this._startDrag(e, { uid, partId: placed.partId, category: placed.category, fromGrid: true, origCol: placed.col, origRow: placed.row });
      return;
    }
    // Empty workspace area -> deselect + start pan
    if (e.target.closest('.garage-workspace')) {
      this.selectedUid = null;
      this._renderGrid();
      this._updateActions();
      this._updateInfo();
      this.panning = { startX: e.clientX, startY: e.clientY, startPanX: this.panX, startPanY: this.panY };
      e.preventDefault();
    }
  },

  _startDrag(e, info) {
    const g = G.PART_GRID[info.category];
    const CS = this.CELL_SIZE * this.zoom; // 画面座標はズーム倍率込みで扱う
    const part = G.getPartById(info.partId);
    const rc = part ? G.RARITY[part.rarity].color : '#666';

    // Create ghost
    const ghost = document.createElement('div');
    ghost.className = 'drag-ghost';
    ghost.style.cssText = `width:${g.w*CS}px;height:${g.h*CS}px;border-color:${rc};position:fixed;pointer-events:none;z-index:9999;opacity:0.7;`;
    ghost.innerHTML = this._partSVG(info.category, 'ghost', rc);
    document.body.appendChild(ghost);

    const rect = this._gridEl.getBoundingClientRect();
    this.dragging = {
      ...info,
      ghostEl: ghost,
      w: g.w, h: g.h,
      gridRect: rect,
      startX: e.clientX, startY: e.clientY,
      moved: false,
    };

    // Position ghost at pointer
    ghost.style.left = (e.clientX - g.w*CS/2) + 'px';
    ghost.style.top = (e.clientY - g.h*CS/2) + 'px';

    // If from grid, temporarily hide the original
    if (info.fromGrid) {
      const origEl = this._gridEl.querySelector(`[data-uid="${info.uid}"]`);
      if (origEl) origEl.style.opacity = '0.3';
    }
  },

  _onPointerMove(e) {
    // Pan
    if (this.panning && !this.dragging) {
      const dx = e.clientX - this.panning.startX;
      const dy = e.clientY - this.panning.startY;
      this.panX = this.panning.startPanX + dx;
      this.panY = this.panning.startPanY + dy;
      this._applyTransform();
      e.preventDefault();
      return;
    }
    if (!this.dragging) return;
    e.preventDefault();
    const d = this.dragging;
    d.moved = true;
    const CS = this.CELL_SIZE;
    const gs = CS * this.zoom;

    // Move ghost (screen space, scaled)
    d.ghostEl.style.left = (e.clientX - d.w*gs/2) + 'px';
    d.ghostEl.style.top = (e.clientY - d.h*gs/2) + 'px';
    d.ghostEl.style.width = (d.w * gs) + 'px';
    d.ghostEl.style.height = (d.h * gs) + 'px';

    // Convert to workspace coords
    const ws = this._screenToWorkspace(e.clientX, e.clientY);
    const col = Math.round((ws.x - d.w*CS/2) / CS);
    const row = Math.round((ws.y - d.h*CS/2) / CS);
    d.snapCol = col;
    d.snapRow = row;

    // Snap indicator (workspace space)
    let existingSnap = this._gridEl.querySelector('.snap-preview');
    if (!existingSnap) {
      existingSnap = document.createElement('div');
      existingSnap.className = 'snap-preview';
      this._gridEl.appendChild(existingSnap);
    }
    const valid = this._canPlace(col, row, d.w, d.h, d.fromGrid ? d.uid : null, d.category);
    existingSnap.className = 'snap-preview ' + (valid ? 'valid' : 'invalid');
    existingSnap.style.cssText = `left:${col*CS}px;top:${row*CS}px;width:${d.w*CS}px;height:${d.h*CS}px;`;
  },

  _onPointerUp(e) {
    if (this.panning) { this.panning = null; }
    if (!this.dragging) return;
    const d = this.dragging;

    d.ghostEl.remove();
    this._gridEl?.querySelector('.snap-preview')?.remove();

    if (!d.moved) {
      if (d.fromGrid) {
        const origEl = this._gridEl?.querySelector(`[data-uid="${d.uid}"]`);
        if (origEl) origEl.style.opacity = '';
      }
      this.dragging = null;
      return;
    }

    const CS = this.CELL_SIZE;
    const ws = this._screenToWorkspace(e.clientX, e.clientY);
    const col = d.snapCol ?? Math.round((ws.x - d.w*CS/2) / CS);
    const row = d.snapRow ?? Math.round((ws.y - d.h*CS/2) / CS);
    const valid = this._canPlace(col, row, d.w, d.h, d.fromGrid ? d.uid : null, d.category);

    if (valid) {
      if (d.fromGrid) {
        const pp = this.placedParts.find(p => p.uid === d.uid);
        if (pp) { pp.col = col; pp.row = row; }
      } else {
        this._addPart(d.partId, d.category, col, row);
      }
      this.connections = this._computeConnections();
      this._saveLayout();
      this._renderGrid();
      this._renderPalette();
      this._updateStats();
    } else {
      if (d.fromGrid) {
        const origEl = this._gridEl?.querySelector(`[data-uid="${d.uid}"]`);
        if (origEl) origEl.style.opacity = '';
      }
    }

    this.dragging = null;
  },

  // ---------- Actions ----------
  _deletePart() {
    if (!this.selectedUid) return;
    this.placedParts = this.placedParts.filter(p => p.uid !== this.selectedUid);
    this.selectedUid = null;
    this.connections = this._computeConnections();
    this._saveLayout();
    this._renderGrid();
    this._renderPalette();
    this._updateActions();
    this._updateInfo();
    this._updateStats();
  },

  // ---------- Zoom / Pan ----------
  _screenToWorkspace(clientX, clientY) {
    const gr = this._gridEl.getBoundingClientRect();
    return {
      x: (clientX - gr.left) / this.zoom,
      y: (clientY - gr.top) / this.zoom,
    };
  },

  _applyTransform() {
    if (this._gridEl) {
      this._gridEl.style.transform = `translate(${this.panX}px,${this.panY}px) scale(${this.zoom})`;
      this._gridEl.style.transformOrigin = '0 0';
    }
  },

  _onWheel(e) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    const newZoom = Math.max(0.3, Math.min(3, this.zoom * factor));
    const wr = this._gridEl.parentElement.getBoundingClientRect();
    const mx = e.clientX - wr.left;
    const my = e.clientY - wr.top;
    const ratio = newZoom / this.zoom;
    this.panX = mx - ratio * (mx - this.panX);
    this.panY = my - ratio * (my - this.panY);
    this.zoom = newZoom;
    this._applyTransform();
  },

  // ---------- Placement ----------
  _canPlace(col, row, w, h, excludeUid, category) {
    if (col < 0 || row < 0 || col + w > this.GRID_COLS || row + h > this.GRID_ROWS) return false;
    const allowOverlap = (category === 'fairing');
    for (const p of this.placedParts) {
      if (p.uid === excludeUid) continue;
      const pg = G.PART_GRID[p.category];
      if (!(col + w <= p.col || p.col + pg.w <= col || row + h <= p.row || p.row + pg.h <= row)) {
        if (!allowOverlap) return false;
      }
    }
    return true;
  },

  _isOverlapping(uid) {
    const part = this.placedParts.find(p => p.uid === uid);
    if (!part) return false;
    const g = G.PART_GRID[part.category];
    for (const p of this.placedParts) {
      if (p.uid === uid) continue;
      const pg = G.PART_GRID[p.category];
      if (!(part.col + g.w <= p.col || p.col + pg.w <= part.col ||
            part.row + g.h <= p.row || p.row + pg.h <= part.row)) {
        return true;
      }
    }
    return false;
  },

  // ---------- Auto-compact ----------
  _compactLayout() {
    // Group parts by column
    const cols = {};
    for (const p of this.placedParts) {
      const key = p.col;
      if (!cols[key]) cols[key] = [];
      cols[key].push(p);
    }
    let changed = false;
    for (const key of Object.keys(cols)) {
      const parts = cols[key].sort((a, b) => a.row - b.row);
      for (let i = 1; i < parts.length; i++) {
        const prev = parts[i - 1];
        const curr = parts[i];
        const prevG = G.PART_GRID[prev.category];
        const currG = G.PART_GRID[curr.category];
        if (prevG.w !== currG.w) continue;
        const prevBot = prev.row + prevG.h;
        const gap = curr.row - prevBot;
        if (gap > 0) {
          for (let j = i; j < parts.length; j++) parts[j].row -= gap;
          changed = true;
        }
      }
    }
    if (changed) { this._saveLayout(); this._render(); this._unbindEvents(); this._bindEvents(); this._updateStats(); }
    return changed;
  },

  // ---------- Connections ----------
  _computeConnections() {
    const conns = [];
    const seen = new Set();
    for (const pA of this.placedParts) {
      const gA = G.PART_GRID[pA.category];
      const topA = pA.row, botA = pA.row + gA.h;
      for (const pB of this.placedParts) {
        if (pB === pA) continue;
        const gB = G.PART_GRID[pB.category];
        if (pB.col !== pA.col || gA.w !== gB.w) continue;
        const pair = pA.uid < pB.uid ? pA.uid + ':' + pB.uid : pB.uid + ':' + pA.uid;
        if (seen.has(pair)) continue;
        const topB = pB.row, botB = pB.row + gB.h;
        // 1) Edge adjacency (bottom of A touches top of B)
        if (topB === botA && gA.connectBottom && gB.connectTop) {
          conns.push([pA.uid, pB.uid]); seen.add(pair); continue;
        }
        // 2) Overlap — only fairing+payload/obc connections
        if (topA < botB && topB < botA) {
          const cats = [pA.category, pB.category].sort().join('+');
          if (cats === 'fairing+obc' || cats === 'fairing+payload') {
            conns.push([pA.uid, pB.uid]); seen.add(pair);
          }
        }
      }
    }
    return conns;
  },

  // ---------- Validation ----------
  _validate() {
    const parts = this.placedParts;
    if (parts.length === 0) return { valid: false, error: '部品がありません' };

    // Check required parts
    const cats = {};
    for (const p of parts) {
      cats[p.category] = (cats[p.category] || 0) + 1;
    }
    if (!cats.engine) return { valid: false, error: 'エンジンが必要です' };
    if (!cats.tank) return { valid: false, error: 'タンクが必要です' };
    if (!cats.fairing) return { valid: false, error: 'フェアリングが必要です' };
    if (!cats.payload) return { valid: false, error: 'ペイロードが必要です' };

    // Overlap check: non-fairing parts must not overlap
    for (let i = 0; i < parts.length; i++) {
      const a = parts[i], gA = G.PART_GRID[a.category];
      for (let j = i + 1; j < parts.length; j++) {
        const b = parts[j], gB = G.PART_GRID[b.category];
        const overlapX = !(a.col + gA.w <= b.col || b.col + gB.w <= a.col);
        const overlapY = !(a.row + gA.h <= b.row || b.row + gB.h <= a.row);
        if (overlapX && overlapY) {
          // Allow fairing overlapping with payload/obc
          const pair = [a.category, b.category].sort().join('+');
          if (pair === 'fairing+obc' || pair === 'fairing+payload') continue;
          return { valid: false, error: '部品が重なっています（' + gA.label + ' / ' + gB.label + '）' };
        }
      }
    }

    // Connected component check
    const conns = this.connections;
    const adj = {};
    for (const p of parts) adj[p.uid] = new Set();
    for (const [a, b] of conns) {
      adj[a].add(b);
      adj[b].add(a);
    }
    const visited = new Set();
    const queue = [parts[0].uid];
    visited.add(parts[0].uid);
    while (queue.length > 0) {
      const cur = queue.shift();
      for (const nb of adj[cur]) {
        if (!visited.has(nb)) { visited.add(nb); queue.push(nb); }
      }
    }
    if (visited.size !== parts.length) return { valid: false, error: '部品が結合されていません' };

    // Engine-tank connectivity check
    const engines = parts.filter(p => p.category === 'engine');
    for (const eng of engines) {
      if (!this._reachesCategory(eng.uid, 'tank', adj)) {
        return { valid: false, error: 'エンジンに燃料が供給されません' };
      }
    }

    return { valid: true };
  },

  _reachesCategory(startUid, targetCat, adj) {
    const visited = new Set();
    const queue = [startUid];
    visited.add(startUid);
    while (queue.length > 0) {
      const cur = queue.shift();
      const pp = this.placedParts.find(p => p.uid === cur);
      if (pp && pp.category === targetCat) return true;
      for (const nb of (adj[cur] || [])) {
        if (!visited.has(nb)) { visited.add(nb); queue.push(nb); }
      }
    }
    return false;
  },

  _onComplete() {
    // Auto-close vertical gaps before validation
    this._compactLayout();
    this.connections = this._computeConnections();
    const result = this._validate();
    if (!result.valid) {
      this._showToast(result.error, 'error');
      return;
    }
    // Convert to rocket config and save
    const config = this.toRocketConfig();
    if (!config) { this._showToast('ロケット構成を解析できません', 'error'); return; }
    if (config.stageCount > G.MAX_STAGES) {
      this._showToast(`段数は最大${G.MAX_STAGES}段です（現在${config.stageCount}段）`, 'error');
      return;
    }
    // 承認済み設計としてID形式で永続化 — 打ち上げはこの設計を使う
    G.State.setApprovedRocket({
      stages: config.stages.map(s => ({ engine: s.engine.id, tank: s.tank.id })),
      structures: config.structures.map(s => s.id),
      fairing: config.fairing.id,
      payload: config.payload.id,
      obc: config.obc.id,
      stageCount: config.stageCount,
    });
    this._showToast('承認されました', 'success');
  },

  _showToast(msg, type) {
    // Remove existing toast
    document.querySelector('.garage-toast')?.remove();
    const toast = document.createElement('div');
    toast.className = 'garage-toast ' + (type || '');
    toast.textContent = msg;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 2500);
  },

  // ---------- Layout -> Rocket Config ----------
  toRocketConfig() {
    const parts = this.placedParts.slice();
    if (parts.length === 0) return null;

    // Sort by row descending (bottom = high row number = bottom of rocket)
    parts.sort((a, b) => {
      const botA = a.row + G.PART_GRID[a.category].h;
      const botB = b.row + G.PART_GRID[b.category].h;
      return botB - botA;
    });

    let fairing = null, payload = null, obc = null;
    const bodyParts = [];

    for (const p of parts) {
      const part = G.getPartById(p.partId);
      if (!part) continue;
      if (p.category === 'fairing') fairing = part;
      else if (p.category === 'payload') payload = part;
      else if (p.category === 'obc') obc = part;
      else bodyParts.push({ placed: p, part });
    }

    if (!fairing || !payload) return null;
    if (!obc) obc = G.getPartById('obc1'); // fallback

    // Scan body parts (bottom to top) to derive stages
    const stages = [];
    const structures = [];
    let curEngine = null, curTank = null;

    for (const bp of bodyParts) {
      if (bp.placed.category === 'structure') {
        if (curEngine && curTank) {
          stages.push({ engine: curEngine, tank: curTank });
          curEngine = null; curTank = null;
        }
        structures.push(bp.part);
      } else if (bp.placed.category === 'engine') {
        if (curEngine && curTank) {
          // Previous stage complete, push it
          stages.push({ engine: curEngine, tank: curTank });
          curTank = null;
        }
        curEngine = bp.part;
      } else if (bp.placed.category === 'tank') {
        curTank = bp.part;
      }
    }
    // Last group
    if (curEngine && curTank) {
      stages.push({ engine: curEngine, tank: curTank });
    }

    if (stages.length === 0) return null;

    return {
      stages,
      structures,
      fairing,
      payload,
      obc,
      stageCount: stages.length,
    };
  },
};
