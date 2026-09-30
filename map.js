(function(){
  const MAX_SELECT = 20;
  const svg = document.getElementById('mapSvg');
  const tooltip = document.getElementById('tooltip');
  const mapFrame = document.getElementById('mapFrame');
  const countNum = document.getElementById('countNum');
  const selectedList = document.getElementById('selectedList');
  const emptyState = document.getElementById('emptyState');
  const limitMsg = document.getElementById('limitMsg');
  const clearBtn = document.getElementById('clearBtn');
  const generateBtn = document.getElementById('generateBtn');

  const NS = 'http://www.w3.org/2000/svg';
  // Sea and lakes share one water colour: the shallow-water blue of the topography map.
  // (WATER_COLOR in data.js can override it.)
  const WATER = (typeof WATER_COLOR !== 'undefined') ? WATER_COLOR : '#bae3ff';
  if (mapFrame) mapFrame.style.background = WATER;
  if (svg) svg.style.background = WATER;

  // ---- Layers ----
  function getNeutralFill(){
    // Reads the current theme's neutral land color live, so switching
    // themes updates the map immediately without map.js needing to know
    // anything about themes itself. Read off <body> since that's where
    // theme.js applies the theme-* class.
    return getComputedStyle(document.body).getPropertyValue('--neutral-fill').trim() || '#c9b98c';
  }
  const LAYERS = [
    { id: 'provinces', label: 'Provinces', type: 'neutral' },
    { id: 'economic',  label: 'Economic Output', type: 'data' },
    { id: 'climate',   label: 'Climate', type: 'climate' },
    // Terrain shows the topography image (TERRAIN_IMAGE in data.js) under the
    // province borders; without an image it falls back to the placeholder hatch.
    { id: 'terrain',   label: 'Terrain', type: (typeof TERRAIN_IMAGE !== 'undefined') ? 'image' : 'placeholder' }
  ];
  let activeLayer = LAYERS[0];

  // hatch pattern def for placeholder layers
  const defs = document.createElementNS(NS, 'defs');
  const pattern = document.createElementNS(NS, 'pattern');
  pattern.setAttribute('id', 'noDataHatch');
  pattern.setAttribute('width', '6');
  pattern.setAttribute('height', '6');
  pattern.setAttribute('patternTransform', 'rotate(45)');
  pattern.setAttribute('patternUnits', 'userSpaceOnUse');
  const hatchBg = document.createElementNS(NS, 'rect');
  hatchBg.setAttribute('width','6'); hatchBg.setAttribute('height','6');
  hatchBg.setAttribute('fill', '#cabf9e');
  const hatchLine = document.createElementNS(NS, 'line');
  hatchLine.setAttribute('x1','0'); hatchLine.setAttribute('y1','0');
  hatchLine.setAttribute('x2','0'); hatchLine.setAttribute('y2','6');
  hatchLine.setAttribute('stroke', '#a99a6d');
  hatchLine.setAttribute('stroke-width', '2');
  pattern.appendChild(hatchBg);
  pattern.appendChild(hatchLine);
  defs.appendChild(pattern);
  svg.appendChild(defs);

  // ---- Continents ----
  // data.js lists its continents in CONTINENTS = [{ id, label, transform }].
  // Older data files only had NORTH_TRANSFORM / SOUTH_TRANSFORM, so fall back
  // to those when CONTINENTS isn't defined.
  const CONTINENT_LIST = (typeof CONTINENTS !== 'undefined') ? CONTINENTS : [
    { id: 'north', label: 'Northern Continent', transform: (typeof NORTH_TRANSFORM !== 'undefined') ? NORTH_TRANSFORM : '' },
    { id: 'south', label: 'Southern Continent', transform: (typeof SOUTH_TRANSFORM !== 'undefined') ? SOUTH_TRANSFORM : '' },
    { id: 'southcentral', label: 'South Central Continent', transform: (typeof SOUTHCENTRAL_TRANSFORM !== 'undefined') ? SOUTHCENTRAL_TRANSFORM : '' }
  ];

  // Land that has no provinces yet (whole continents still to be divided):
  // drawn underneath everything, greyed out, visible on every layer, never clickable.
  const gPending = document.createElementNS(NS, 'g');
  svg.appendChild(gPending);

  // Topography backdrop for the Terrain layer (hidden on the other layers).
  let terrainImageFailed = false;
  const gTerrain = document.createElementNS(NS, 'g');
  gTerrain.style.display = 'none';
  if(typeof TERRAIN_IMAGE !== 'undefined'){
    const im = document.createElementNS(NS, 'image');
    im.setAttribute('href', TERRAIN_IMAGE.href);
    im.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', TERRAIN_IMAGE.href);
    im.setAttribute('x', TERRAIN_IMAGE.x); im.setAttribute('y', TERRAIN_IMAGE.y);
    im.setAttribute('width', TERRAIN_IMAGE.width); im.setAttribute('height', TERRAIN_IMAGE.height);
    im.setAttribute('preserveAspectRatio', 'none');
    im.style.pointerEvents = 'none';
    // if the image can't be loaded, say so on the Terrain layer instead of failing silently
    im.addEventListener('error', function(){
      terrainImageFailed = true;
      console.warn('Terrain image failed to load:', String(TERRAIN_IMAGE.href).slice(0, 80));
      if(activeLayer && activeLayer.type === 'image'){ setLayer(activeLayer); }
    });
    gTerrain.appendChild(im);
  }
  svg.appendChild(gTerrain);

  // One <g> per continent, each carrying that continent's own transform.
  const CONTINENT_GROUPS = {}, CONTINENT_TRANSFORMS = {}, CONTINENT_LABELS = {};
  const CONTINENT_ORDER = [];
  CONTINENT_LIST.forEach(function(c){
    const cg = document.createElementNS(NS, 'g');
    if(c.transform){ cg.setAttribute('transform', c.transform); }
    svg.appendChild(cg);
    CONTINENT_GROUPS[c.id] = cg;
    CONTINENT_TRANSFORMS[c.id] = c.transform || '';
    CONTINENT_LABELS[c.id] = c.label || c.id;
    CONTINENT_ORDER.push(c.id);
  });
  const g = CONTINENT_GROUPS[CONTINENT_ORDER[0]];
  const LAKE_LIST = (typeof LAKES !== 'undefined') ? LAKES : [];
  // Claim seals are sized in map units; SEAL_SIZE (data.js) scales them to suit
  // how big provinces are in this map's coordinate space.
  const SEAL_SCALE = (typeof SEAL_SIZE !== 'undefined') ? SEAL_SIZE : 1;

  function groupFor(p){ return CONTINENT_GROUPS[p.continent] || g; }

  // Extra non-clickable, greyed land: small islands (shown on the Provinces
  // layer only) and pending continents (always shown, in gPending).
  const gExtra = document.createElementNS(NS, 'g');
  svg.appendChild(gExtra);
  EXTRA_ISLANDS.forEach(function(isl){
    const el = document.createElementNS(NS, 'path');
    el.setAttribute('d', isl.d);
    if(isl.transform){ el.setAttribute('transform', isl.transform); }
    el.setAttribute('class', 'extra-island' + (isl.pending ? ' pending-land' : ''));
    (isl.pending ? gPending : gExtra).appendChild(el);
  });

  // selection order: array of province ids, in click order
  let selected = [];

  // Render provinces (interactive)
  const provinceEls = {};
  PROVINCES.forEach(function(p){
    const el = document.createElementNS(NS, 'path');
    el.setAttribute('d', p.d);
    el.setAttribute('class', 'province');
    el.setAttribute('fill', p.fill);
    el.dataset.id = p.id;
    el.addEventListener('click', function(){ toggleProvince(p.id); });
    el.addEventListener('mousemove', function(e){ showTooltip(e, p); });
    el.addEventListener('mouseleave', hideTooltip);
    groupFor(p).appendChild(el);
    provinceEls[p.id] = el;
  });

  // Lakes sit on top of the provinces (which already have matching holes cut
  // in them) purely as water colour - they're not clickable.
  LAKE_LIST.forEach(function(l){
    const el = document.createElementNS(NS, 'path');
    el.setAttribute('d', l.d);
    el.setAttribute('class', 'lake');
    el.style.fill = WATER;
    el.style.pointerEvents = 'none';
    (CONTINENT_GROUPS[l.continent] || g).appendChild(el);
  });

  const byId = {};
  PROVINCES.forEach(function(p){ byId[p.id] = p; });

  const byLabel = {};
  PROVINCES.forEach(function(p){ byLabel[p.label.toUpperCase()] = p; });

  // ---- Already-claimed provinces (live from the community's claims sheet) ----
  // takenIndex maps a province's uppercase label -> the claim record that
  // owns it. Loaded async on startup; the map renders normally until this
  // resolves, then locks whichever provinces turn out to be taken.
  //
  // claimsEnabled is a separate on/off switch (the "Existing Claims" toggle
  // in the top-right corner) for previewing the map as if no claims were
  // recorded yet, without touching the underlying sheet. Defaults to on and
  // persists per-browser via localStorage, same pattern as the theme choice.
  const CLAIMS_TOGGLE_KEY = 'landClaimClaimsEnabled';
  let takenIndex = {};
  let claimsEnabled = true;
  try {
    const saved = localStorage.getItem(CLAIMS_TOGGLE_KEY);
    if(saved !== null) claimsEnabled = saved === 'true';
  } catch(e) { /* localStorage unavailable - default stands */ }

  if (window.ClaimsStore) {
    try {
      window.ClaimsStore.loadClaims().then(function(claims){
        takenIndex = window.ClaimsStore.buildProvinceIndex(claims);
        // Drop anything already taken out of the current in-progress selection
        // (covers the rare case where someone had a now-claimed province
        // selected before this finished loading).
        selected = selected.filter(function(id){
          const p = byId[id];
          return !(p && isTaken(p));
        });
        applyTakenStyling();
        render();
      }).catch(function(e){
        console.warn('Claims lookup failed, continuing without it:', e.message);
      });
    } catch(e) {
      console.warn('Claims lookup failed, continuing without it:', e.message);
    }
  }

  function isTaken(p){
    return claimsEnabled && !!takenIndex[p.label.toUpperCase()];
  }

  // Re-applies the "taken" look to every province's element regardless of
  // which layer is active - knowing land is unavailable matters more than
  // seeing its econ/climate color while you're trying to claim new land.
  function applyTakenStyling(){
    PROVINCES.forEach(function(p){
      const el = provinceEls[p.id];
      if(!el) return;
      el.classList.toggle('taken', isTaken(p));
    });
  }

  // ---- Existing Claims toggle ----
  const claimsToggle = document.getElementById('claimsToggle');
  const claimsToggleState = document.getElementById('claimsToggleState');
  if(claimsToggle){
    updateClaimsToggleUI();
    claimsToggle.addEventListener('click', function(){
      claimsEnabled = !claimsEnabled;
      try { localStorage.setItem(CLAIMS_TOGGLE_KEY, String(claimsEnabled)); } catch(e){ /* non-fatal */ }
      updateClaimsToggleUI();
      if(claimsEnabled){
        // Drop any selections that turn out to conflict with a recorded
        // claim now that locking is back on.
        selected = selected.filter(function(id){
          const p = byId[id];
          return !(p && isTaken(p));
        });
      }
      applyTakenStyling();
      render();
    });
  }
  function updateClaimsToggleUI(){
    if(!claimsToggle) return;
    claimsToggle.setAttribute('aria-pressed', String(claimsEnabled));
    claimsToggleState.textContent = claimsEnabled ? 'On' : 'Off';
  }

  // ---- Layer tab bar ----
  const layerTabs = document.getElementById('layerTabs');
  const noDataBanner = document.getElementById('noDataBanner');
  LAYERS.forEach(function(layer){
    const btn = document.createElement('button');
    btn.className = 'layer-tab' + (layer.id === activeLayer.id ? ' active' : '');
    btn.textContent = layer.label;
    btn.addEventListener('click', function(){ setLayer(layer); });
    layerTabs.appendChild(btn);
  });

  function setLayer(layer){
    activeLayer = layer;
    Array.from(layerTabs.children).forEach(function(btn, i){
      btn.classList.toggle('active', LAYERS[i].id === layer.id);
    });
    PROVINCES.forEach(function(p){
      const el = provinceEls[p.id];
      let fill;
      if(layer.type === 'data'){ fill = p.fill; }
      else if(layer.type === 'neutral'){ fill = getNeutralFill(); }
      else if(layer.type === 'climate'){
        fill = p.climate ? CLIMATE_COLOR[p.climate.display || p.climate.dominant] : '#cabf9e';
      }
      // see-through (but still clickable) so the topography shows beneath the borders
      else if(layer.type === 'image'){ fill = 'rgba(0,0,0,0)'; }
      else { fill = 'url(#noDataHatch)'; }
      el.setAttribute('fill', fill);
    });
    applyTakenStyling();
    const imageMissing = layer.type === 'image' && terrainImageFailed;
    noDataBanner.classList.toggle('show', layer.type === 'placeholder' || imageMissing);
    if(layer.type === 'placeholder'){
      noDataBanner.textContent = 'No ' + layer.label.toLowerCase() + ' data yet \u2014 this layer is a placeholder. Provinces are still selectable.';
    } else if(imageMissing){
      noDataBanner.textContent = 'The terrain image could not be loaded. Provinces are still selectable.';
    }
    const terrainLegend = (typeof TERRAIN_LEGEND !== 'undefined') ? TERRAIN_LEGEND : null;
    legend.classList.toggle('show', layer.type === 'data' || layer.type === 'climate' || (layer.type === 'image' && !!terrainLegend));
    legend.innerHTML = '';
    const activeLegendData = layer.type === 'climate' ? CLIMATE_LEGEND
      : (layer.type === 'data' ? ECON_LEGEND : (layer.type === 'image' ? terrainLegend : null));
    if(activeLegendData){ buildLegend(activeLegendData, layer.type); }
    gExtra.style.display = (layer.id === 'provinces') ? '' : 'none';
    // the topography image already shows all land, so the greyed placeholder land is hidden there
    gTerrain.style.display = (layer.type === 'image') ? '' : 'none';
    gPending.style.display = (layer.type === 'image') ? 'none' : '';
  }

  // ---- Legends ----
  const legend = document.getElementById('legend');
  const CLIMATE_COLOR = {};
  CLIMATE_LEGEND.forEach(function(item){ CLIMATE_COLOR[item.climate] = item.color; });

  function buildLegend(items, type){
    items.forEach(function(item){
      const key = type === 'climate' ? item.climate : (type === 'image' ? item.terrain : item.econ);
      const row = document.createElement('div');
      row.className = 'legend-row';
      const present = type === 'image' ? true : (type === 'climate'
        ? PROVINCES.some(function(p){ return p.climate && (p.climate.display || p.climate.dominant) === key; })
        : PROVINCES.some(function(p){ return p.econ === key; }));
      row.innerHTML =
        '<span class="legend-swatch" style="background:'+item.color+'"></span>' +
        '<span class="legend-label">'+key+'</span>' +
        (present ? '' : '<span class="legend-none">none yet</span>');
      legend.appendChild(row);
    });
  }

  function showTooltip(e, p){
    const rect = mapFrame.getBoundingClientRect();
    let sub;
    if(isTaken(p)){
      sub = 'Claimed by ' + takenIndex[p.label.toUpperCase()].name;
    } else if(activeLayer.id === 'economic'){
      sub = p.econ;
    } else if(activeLayer.id === 'climate'){
      if(p.climate){
        const parts = Object.entries(p.climate.breakdown)
          .sort(function(a,b){ return b[1]-a[1]; })
          .map(function(kv){ return kv[0]+' '+kv[1]+'%'; });
        sub = parts.join(', ');
      } else {
        sub = 'No climate data';
      }
    } else if(activeLayer.id === 'terrain' && p.geo && p.geo.elevation){
      sub = Object.entries(p.geo.elevation)
        .sort(function(a,b){ return b[1]-a[1]; })
        .map(function(kv){ return kv[0]+' '+kv[1]+'%'; }).join(', ');
    } else {
      sub = selected.indexOf(p.id) !== -1 ? 'Claimed \u2014 click to release' : 'Click to claim';
    }
    tooltip.innerHTML = p.label + '<div class="sub">' + sub + '</div>';
    tooltip.style.left = (e.clientX - rect.left) + 'px';
    tooltip.style.top = (e.clientY - rect.top) + 'px';
    tooltip.classList.add('show');
  }
  function hideTooltip(){ tooltip.classList.remove('show'); }

  function flashLimit(){
    limitMsg.classList.add('show');
    setTimeout(function(){ limitMsg.classList.remove('show'); }, 1600);
  }

  let capitalId = null;

  function toggleProvince(id){
    const p = byId[id];
    if(p && isTaken(p)) return; // already claimed by someone else - not selectable
    const idx = selected.indexOf(id);
    if(idx !== -1){
      selected.splice(idx, 1);
      if(capitalId === id) capitalId = null;
    } else {
      if(selected.length >= MAX_SELECT){
        flashLimit();
        return;
      }
      selected.push(id);
    }
    render();
  }

  function removeProvince(id){
    const idx = selected.indexOf(id);
    if(idx !== -1){
      selected.splice(idx,1);
      if(capitalId === id) capitalId = null;
      render();
    }
  }

  function toggleCapital(id){
    capitalId = (capitalId === id) ? null : id;
    render();
  }

  function render(){
    // update map highlighting
    Object.keys(provinceEls).forEach(function(id){
      provinceEls[id].classList.toggle('selected', selected.indexOf(id) !== -1);
    });

    // seals (order badges, or a star for the capital) - remove old, redraw
    Object.keys(CONTINENT_GROUPS).forEach(function(k){
      Array.from(CONTINENT_GROUPS[k].querySelectorAll('.seal')).forEach(function(n){ n.remove(); });
    });
    selected.forEach(function(id, i){
      const p = byId[id];
      const c = centroid(p.d);
      if(!c) return;
      const isCapital = id === capitalId;
      const seal = document.createElementNS(NS, 'g');
      seal.setAttribute('class', 'seal' + (isCapital ? ' seal-capital' : ''));
      const r = (isCapital ? 6.4 : 5.2) * SEAL_SCALE;
      const circle = document.createElementNS(NS, 'circle');
      circle.setAttribute('cx', c.x); circle.setAttribute('cy', c.y); circle.setAttribute('r', r);
      const text = document.createElementNS(NS, 'text');
      text.setAttribute('x', c.x); text.setAttribute('y', c.y);
      text.setAttribute('font-size', String((isCapital ? 7.5 : 6.5) * SEAL_SCALE));
      text.textContent = isCapital ? '\u2605' : (i+1);
      seal.appendChild(circle);
      seal.appendChild(text);
      groupFor(p).appendChild(seal);
    });

    // counter
    countNum.textContent = selected.length;

    // list
    selectedList.innerHTML = '';
    if(selected.length === 0){
      selectedList.appendChild(emptyState);
    } else {
      selected.forEach(function(id, i){
        const p = byId[id];
        const isCapital = id === capitalId;
        const item = document.createElement('div');
        item.className = 'item' + (isCapital ? ' item-capital' : '');
        item.innerHTML =
          '<div class="order">'+(i+1)+'</div>' +
          '<div class="swatch" style="background:'+p.fill+'"></div>' +
          '<div class="name">'+p.label+(isCapital ? ' <span class="capital-badge">Capital</span>' : '')+'</div>' +
          '<button class="capital-star'+(isCapital ? ' active' : '')+'" title="'+(isCapital ? 'Unset as capital' : 'Set as capital')+'">'+(isCapital ? '\u2605' : '\u2606')+'</button>' +
          '<button class="remove" title="Release province">\u2715</button>';
        item.querySelector('.capital-star').addEventListener('click', function(){ toggleCapital(id); });
        item.querySelector('.remove').addEventListener('click', function(){ removeProvince(id); });
        selectedList.appendChild(item);
      });
    }

    generateBtn.disabled = selected.length === 0;
  }

  clearBtn.addEventListener('click', function(){
    selected = [];
    capitalId = null;
    render();
  });

  // ---- Load a Claim Code ----
  // Lets someone paste a previously-copied list of province labels
  // (e.g. "S9, S12, N4") and instantly restore that selection.
  const claimCodeInput = document.getElementById('claimCodeInput');
  const claimCodeMsg = document.getElementById('claimCodeMsg');
  const loadClaimBtn = document.getElementById('loadClaimBtn');

  function loadClaimCode(raw){
    const tokens = raw.split(/[,\s]+/).map(function(t){ return t.trim().toUpperCase(); }).filter(Boolean);
    if(tokens.length === 0){
      setClaimMsg('Paste a claim code first.', true);
      return;
    }
    const found = [];
    const unknown = [];
    const taken = [];
    const seen = {};
    let loadedCapitalId = null;
    tokens.forEach(function(tok){
      // A trailing "*" marks the capital, e.g. "S9*" - strip it before lookup.
      const isCapitalTok = tok.charAt(tok.length - 1) === '*';
      const label = isCapitalTok ? tok.slice(0, -1) : tok;
      const p = byLabel[label];
      if(!p){ unknown.push(label); return; }
      if(isTaken(p)){ taken.push(label); return; }
      if(seen[p.id]) return; // skip duplicates
      seen[p.id] = true;
      found.push(p.id);
      if(isCapitalTok) loadedCapitalId = p.id;
    });

    const truncated = found.length > MAX_SELECT;
    selected = found.slice(0, MAX_SELECT);
    capitalId = (loadedCapitalId && selected.indexOf(loadedCapitalId) !== -1) ? loadedCapitalId : null;
    render();

    const parts = [];
    parts.push(selected.length + ' province' + (selected.length === 1 ? '' : 's') + ' loaded.');
    if(truncated) parts.push('Only the first ' + MAX_SELECT + ' were used.');
    if(capitalId) parts.push(byId[capitalId].label + ' set as capital.');
    if(taken.length) parts.push('Already claimed by someone else: ' + taken.join(', ') + '.');
    if(unknown.length) parts.push('Not found: ' + unknown.join(', ') + '.');
    setClaimMsg(parts.join(' '), unknown.length > 0);
  }

  function setClaimMsg(text, isWarning){
    claimCodeMsg.textContent = text;
    claimCodeMsg.classList.toggle('warning', !!isWarning);
    claimCodeMsg.classList.add('show');
  }

  loadClaimBtn.addEventListener('click', function(){
    loadClaimCode(claimCodeInput.value);
  });
  claimCodeInput.addEventListener('keydown', function(e){
    if(e.key === 'Enter'){ loadClaimCode(claimCodeInput.value); }
  });

  // Wraps buildClaimSnapshotSVG into the HTML block placed near the top of
  // the bio page — one snapshot per continent the claim touches, side by
  // side if it spans both.
  function buildClaimMapHtml(provinces){
    if(!provinces.length) return '';
    const byContinent = {};
    CONTINENT_ORDER.forEach(function(c){ byContinent[c] = []; });
    provinces.forEach(function(p){
      (byContinent[p.continent] || byContinent[CONTINENT_ORDER[0]]).push(p.id);
    });

    const shots = [];
    CONTINENT_ORDER.forEach(function(continentName){
      const ids = byContinent[continentName];
      if(!ids || !ids.length) return;
      const svg = buildClaimSnapshotSVG(continentName, ids);
      if(!svg) return;
      const label = CONTINENT_LABELS[continentName] || continentName;
      shots.push('<div class="map-shot">' + svg + '<div class="map-shot-label">' + label + '</div></div>');
    });

    if(!shots.length) return '';
    return '    <div class="claim-map"><div class="map-row">' + shots.join('') + '</div></div>\n';
  }

  // Same idea as buildClaimMapHtml above, but for the SEPARATE snapshot
  // handed off to the specialization page (see the "claimMapHandoffData"
  // JSON script tag in writeBioPage) - tighter-cropped, claimed provinces
  // filled in, capital star included. Kept as its own function rather
  // than folded into buildClaimMapHtml/buildClaimSnapshotSVG so the bio
  // page's own visible map stays exactly as it always has, and only the
  // specialization identity page's copy gets the enhanced treatment.
  function buildClaimHandoffMapHtml(provinces){
    if(!provinces.length) return '';
    const byContinent = {};
    const capitalByContinent = {};
    CONTINENT_ORDER.forEach(function(c){ byContinent[c] = []; });
    provinces.forEach(function(p){
      const continentKey = byContinent[p.continent] ? p.continent : CONTINENT_ORDER[0];
      byContinent[continentKey].push(p.id);
      if(p.isCapital) capitalByContinent[continentKey] = p.id;
    });

    const shots = [];
    CONTINENT_ORDER.forEach(function(continentName){
      const ids = byContinent[continentName];
      if(!ids || !ids.length) return;
      const svg = buildClaimHandoffSnapshotSVG(continentName, ids, capitalByContinent[continentName] || null);
      if(!svg) return;
      const label = CONTINENT_LABELS[continentName] || continentName;
      shots.push('<div class="map-shot">' + svg + '<div class="map-shot-label">' + label + '</div></div>');
    });

    if(!shots.length) return '';
    return shots.join('');
  }

  generateBtn.addEventListener('click', function(){
    // The actual bio-writing logic lives in landbio.js so it can be edited
    // independently of the map. It receives the full province objects
    // (with id, label, econ, climate, fill, etc.) for everything claimed,
    // in the order they were claimed. Each is a shallow copy (never mutate
    // the shared byId/PROVINCES objects) with isCapital set so landbio.js
    // and the bio page both know which one, if any, is the capital.
    const claimedProvinces = selected.map(function(id){
      const p = byId[id];
      return Object.assign({}, p, { isCapital: id === capitalId });
    });

    // Open the tab synchronously, in direct response to the click, so
    // browsers don't treat it as a popup and block it. We fill it in
    // once the bio text is ready (works whether generateLandBio returns
    // a plain string or a Promise<string>).
    const bioWindow = window.open('', '_blank');
    if (bioWindow) {
      writeBioPage(bioWindow, claimedProvinces, null, true);
    }

    Promise.resolve(window.generateLandBio(claimedProvinces)).then(function(result){
      if (bioWindow && !bioWindow.closed) {
        writeBioPage(bioWindow, claimedProvinces, result, false);
      } else {
        // Pop-up was blocked or the tab got closed before generation finished.
        alert('Your browser blocked the new tab. Here\'s the bio instead:\n\n' + result.text);
      }
    }).catch(function(err){
      if (bioWindow && !bioWindow.closed) {
        writeBioPage(bioWindow, claimedProvinces, { text: 'Something went wrong generating this bio: ' + err.message, bbcCode: '' }, false);
      }
    });
  });

  function escapeHtml(str){
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function writeBioPage(targetWindow, provinces, result, loading){
    const themeClass = Array.from(document.body.classList).find(function(c){ return c.indexOf('theme-') === 0; }) || '';
    const provinceList = provinces.map(function(p){ return p.label + (p.isCapital ? ' \u2605' : ''); }).join(', ');
    // A trailing "*" marks the capital in the claim code, e.g. "S9*, S12, N4" -
    // "Load a Claim Code" on the main map knows to parse it back out.
    const claimCode = provinces.map(function(p){ return p.label + (p.isCapital ? '*' : ''); }).join(', ');
    const bbcCode = (result && result.bbcCode) || '';
    const bodyHtml = loading
      ? '<p class="bio-loading">Writing your land bio&hellip;</p>'
      : result.text.split(/\n\n+/).map(function(para){
          // "## Heading" -> section heading, matching the BBC code's own
          // [b]Section[/b] labels so the two read as the same document.
          if(para.indexOf('## ') === 0){
            return '<h2 class="bio-section">' + escapeHtml(para.slice(3)) + '</h2>';
          }
          // "*(placeholder note)*" -> a visually distinct not-filled-in-yet note.
          const placeholderMatch = para.match(/^\*\((.*)\)\*$/);
          if(placeholderMatch){
            return '<p class="bio-placeholder">' + escapeHtml(placeholderMatch[1]) + '</p>';
          }
          // "%%FIELD%%Label|Value" -> a labeled field, matching the BBC
          // code's "[u]Label[/u]: value" lines (e.g. "Economy Type:").
          // Values that are plain URLs (the External Link field) render as
          // an actual clickable link instead of plain text.
          if(para.indexOf('%%FIELD%%') === 0){
            const parts = para.slice(9).split('|');
            const value = parts.slice(1).join('|');
            const isUrl = /^https?:\/\/\S+$/.test(value.trim());
            const valueHtml = isUrl
              ? '<a href="' + escapeHtml(value.trim()) + '" target="_blank" rel="noopener">' + escapeHtml(value.trim()) + '</a>'
              : escapeHtml(value);
            return '<p class="bio-field"><span class="bio-field-label">' + escapeHtml(parts[0]) + ':</span> ' +
              '<span class="bio-field-value">' + valueHtml + '</span></p>';
          }
          // "%%COLLAPSE%%Label|paragraph text" -> a closed-by-default
          // <details> block (native, no JS needed) so long descriptive
          // prose (climate/economy write-ups) doesn't eat page space by
          // default - the label is the always-visible toggle text.
          if(para.indexOf('%%COLLAPSE%%') === 0){
            const collapseParts = para.slice(12).split('|');
            const collapseLabel = collapseParts[0];
            const collapseBody = collapseParts.slice(1).join('|');
            return '<details class="bio-collapse"><summary>' + escapeHtml(collapseLabel) + '</summary>' +
              '<p>' + escapeHtml(collapseBody) + '</p></details>';
          }
          // "%%TABLE%%Heading|Label1:Val1|Label2:Val2|..." -> a labeled
          // small table (any number of columns), matching the BBC code's
          // own tables (World Exports, the sector percentage row).
          if(para.indexOf('%%TABLE%%') === 0){
            const segments = para.slice(9).split('|');
            const heading = segments[0];
            const cells = segments.slice(1).map(function(c){
              const i = c.indexOf(':');
              return { label: c.slice(0, i), value: c.slice(i+1) };
            });
            var headerRow = cells.map(function(c){ return '<th>' + escapeHtml(c.label) + '</th>'; }).join('');
            var dataRow = cells.map(function(c){ return '<td>' + escapeHtml(c.value || '\u2014') + '</td>'; }).join('');
            return '<div class="bio-field-label">' + escapeHtml(heading) + ':</div>' +
              '<table class="bio-export-table"><thead><tr>' + headerRow + '</tr></thead>' +
              '<tbody><tr>' + dataRow + '</tr></tbody></table>';
          }
          return '<p>' + escapeHtml(para).replace(/\n/g, '<br>') + '</p>';
        }).join('\n');

    const mapHtml = loading ? '' : buildClaimMapHtml(provinces);
    // Enhanced (tighter-cropped, filled, capital-starred) copy - never
    // shown on this page, only embedded as hidden data below for the
    // specialization identity step to pick up. See buildClaimHandoffMapHtml.
    const claimMapHandoffHtml = loading ? '' : buildClaimHandoffMapHtml(provinces);

    const html = '<!DOCTYPE html>\n<html>\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
      '<title>Land Bio' + (provinces.length ? ' \u2014 ' + escapeHtml(provinces[0].label) + (provinces.length > 1 ? ' +' + (provinces.length - 1) : '') : '') + '</title>\n' +
      '<link rel="stylesheet" href="style.css">\n' +
      '<style>\n' +
      '  body.bio-page{ overflow:auto; padding:48px 24px; box-sizing:border-box; background: var(--parchment); }\n' +
      '  .bio-card{ max-width:680px; margin:0 auto; background: var(--panel-bg); border:1px solid var(--line); border-radius:6px; padding:36px 40px; box-shadow:0 8px 28px rgba(0,0,0,0.2); }\n' +
      '  .bio-card h1{ font-family:var(--font-display); color:var(--ink); margin:0 0 4px; font-size:24px; }\n' +
      '  .bio-card .meta{ font-family:var(--font-body); font-size:12.5px; font-style:italic; color:var(--ink-soft); margin-bottom:22px; padding-bottom:16px; border-bottom:1px solid var(--line); }\n' +
      '  .bio-card p{ font-family:var(--font-body); font-size:16px; line-height:1.7; color:var(--ink); margin:0 0 14px; }\n' +
      '  .bio-loading{ font-style:italic; color:var(--ink-soft); }\n' +
      '  .bio-section{ font-family:var(--font-display); font-size:15px; letter-spacing:0.5px; color:var(--gold); margin:30px 0 12px; padding-top:18px; border-top:2px solid var(--gold); text-transform:uppercase; }\n' +
      '  .bio-section:first-of-type{ margin-top:20px; }\n' +
      '  .bio-placeholder{ font-family:var(--font-body); font-style:italic; font-size:14px; color:var(--ink-soft); background:rgba(0,0,0,0.03); border:1px dashed var(--line); border-radius:4px; padding:10px 12px; margin:0 0 14px; }\n' +
      '  .bio-collapse{ margin:0 0 16px; }\n' +
      '  .bio-collapse summary{ font-family:var(--font-display); font-size:12.5px; letter-spacing:0.4px; text-transform:uppercase; color:var(--gold); cursor:pointer; user-select:none; padding:2px 0; }\n' +
      '  .bio-collapse summary:hover{ text-decoration:underline; }\n' +
      '  .bio-collapse[open] summary{ margin-bottom:6px; }\n' +
      '  .bio-collapse p{ font-family:var(--font-body); font-size:16px; line-height:1.7; color:var(--ink); margin:0; }\n' +
      '  .bio-field{ font-family:var(--font-body); font-size:16px; line-height:1.65; color:var(--ink); margin:0 0 10px; }\n' +
      '  .bio-field-label{ font-family:var(--font-display); font-size:12.5px; letter-spacing:0.4px; text-transform:uppercase; color:var(--ink-soft); margin-right:2px; }\n' +
      '  .bio-field-value{ font-style:italic; font-weight:600; }\n' +
      '  .bio-field-value a{ color:var(--gold); word-break:break-all; }\n' +
      '  .bio-export-table{ width:100%; border-collapse:collapse; margin:8px 0 18px; font-family:var(--font-body); font-size:13.5px; }\n' +
      '  .bio-export-table th{ font-family:var(--font-display); font-size:11px; letter-spacing:0.3px; text-transform:uppercase; color:var(--ink-soft); text-align:left; padding:7px 10px; border-bottom:1px solid var(--line); }\n' +
      '  .bio-export-table td{ padding:9px 10px; color:var(--ink); border-bottom:1px solid var(--line); vertical-align:top; }\n' +
      '  .bio-export-table tr:last-child td{ border-bottom:none; }\n' +
      '  .claim-map{ margin-bottom:22px; }\n' +
      '  .claim-map .map-row{ display:flex; gap:12px; flex-wrap:wrap; }\n' +
      '  .claim-map .map-shot{ flex:1 1 260px; min-width:0; background: var(--parchment); border:1px solid var(--line); border-radius:5px; padding:8px; }\n' +
      '  .claim-map .map-shot svg{ width:100%; height:auto; display:block; }\n' +
      '  .claim-map .map-shot-label{ font-family:var(--font-display); font-size:11px; letter-spacing:0.4px; color:var(--ink-soft); text-align:center; margin-top:6px; }\n' +
      '  .bio-actions{ margin-top:24px; display:flex; gap:10px; flex-wrap:wrap; align-items:center; }\n' +
      '  .bio-actions button{ font-family:var(--font-display); font-size:13px; letter-spacing:0.4px; padding:9px 16px; border-radius:4px; border:1px solid var(--line); cursor:pointer; background:var(--panel-bg); color:var(--ink); }\n' +
      '  .bio-actions button.copied{ background:var(--gold); color:#fff; border-color:var(--gold); }\n' +
      '  .bio-actions button.btn-primary{ font-weight:600; padding:11px 20px; border-color:var(--gold); background:linear-gradient(180deg, var(--gold-bright), var(--gold)); color:#fff; box-shadow:0 2px 8px rgba(0,0,0,0.15); }\n' +
      '  .bio-actions button.btn-primary.copied{ background:var(--gold); color:#fff; }\n' +
      '  .claim-code-block{ margin-top:28px; padding-top:18px; border-top:1px solid var(--line); }\n' +
      '  .claim-code-block .cc-title{ font-family:var(--font-display); font-size:12.5px; letter-spacing:0.5px; color:var(--ink-soft); margin-bottom:8px; }\n' +
      '  .claim-code-value{ font-family:var(--font-body); font-size:14px; color:var(--ink); background:rgba(0,0,0,0.04); border:1px solid var(--line); border-radius:4px; padding:10px 12px; word-break:break-word; }\n' +
      '  .copy-btn{ font-family:var(--font-display); font-size:12.5px; letter-spacing:0.4px; padding:8px 14px; border-radius:4px; border:1px solid var(--line); cursor:pointer; background:var(--panel-bg); color:var(--ink); margin-top:9px; }\n' +
      '  .copy-btn.copied{ background:var(--gold); color:#fff; border-color:var(--gold); }\n' +
      '  #bbcSource{ position:absolute; left:-9999px; top:-9999px; }\n' +
      '  .site-credit{ position:fixed; top:14px; right:18px; font-family:var(--font-body); font-size:11.5px; color:var(--ink-soft); text-align:right; max-width:230px; line-height:1.4; z-index:10; }\n' +
      '  .site-credit a{ color:var(--gold); text-decoration:none; }\n' +
      '  .site-credit a:hover{ text-decoration:underline; }\n' +
      '  @media (max-width:480px){\n' +
      '    body.bio-page{ padding:20px 12px; }\n' +
      '    .bio-card{ padding:22px 18px; }\n' +
      '    .bio-card h1{ font-size:20px; }\n' +
      '    .claim-map .map-row{ flex-direction:column; }\n' +
      '    .site-credit{ position:static; max-width:none; text-align:center; margin-bottom:14px; }\n' +
      '  }\n' +
      '</style>\n</head>\n' +
      '<body class="bio-page ' + themeClass + '">\n' +
      '  <div class="site-credit">Originally built for the <a href="https://www.nationstates.net/region=rylet" target="_blank" rel="noopener">Rylet Region</a> of NationStates</div>\n' +
      '  <div class="bio-card">\n' +
      '    <h1>Land Bio</h1>\n' +
      '    <div class="meta">' + escapeHtml(provinceList) + ' &middot; generated ' + escapeHtml(new Date().toLocaleString()) + '</div>\n' +
      mapHtml +
      '    <div class="bio-body">' + bodyHtml + '</div>\n' +
      (loading ? '' : '    <div class="bio-actions"><button id="continueToSpecBtn" class="btn-primary">Continue to National Specialization &rarr;</button>' +
                       '<button id="copyBbcBtn">Copy BBC Code</button></div>\n' +
                       '    <textarea id="bbcSource" readonly>' + escapeHtml(bbcCode) + '</textarea>\n' +
                       '    <script type="application/json" id="perProvinceEnergyData">' + JSON.stringify((result && result.perProvinceEnergy) || []) + '</script>\n' +
                       '    <script type="application/json" id="claimMapHandoffData">' + JSON.stringify(claimMapHandoffHtml) + '</script>\n') +
      '    <div class="claim-code-block">\n' +
      '      <div class="cc-title">Claim Code &mdash; paste this into "Load a Claim Code" on the map to recreate this exact selection</div>\n' +
      '      <div class="claim-code-value" id="claimCodeValue">' + escapeHtml(claimCode) + '</div>\n' +
      '      <button class="copy-btn" id="copyClaimBtn">Copy Claim Code</button>\n' +
      '    </div>\n' +
      '  </div>\n' +
      '  <script>\n' +
      '    function bindCopyButton(btnId, getText, label){\n' +
      '      var btn = document.getElementById(btnId);\n' +
      '      if(!btn) return;\n' +
      '      btn.addEventListener("click", function(){\n' +
      '        var text = getText();\n' +
      '        function done(ok){\n' +
      '          btn.textContent = ok ? "Copied!" : "Copy failed \u2014 select the text manually";\n' +
      '          btn.classList.toggle("copied", ok);\n' +
      '          setTimeout(function(){ btn.textContent = label; btn.classList.remove("copied"); }, 1800);\n' +
      '        }\n' +
      '        if(navigator.clipboard && navigator.clipboard.writeText){\n' +
      '          navigator.clipboard.writeText(text).then(function(){ done(true); }, function(){ done(false); });\n' +
      '        } else {\n' +
      '          try {\n' +
      '            var ta = document.createElement("textarea");\n' +
      '            ta.value = text; document.body.appendChild(ta); ta.select();\n' +
      '            document.execCommand("copy"); document.body.removeChild(ta);\n' +
      '            done(true);\n' +
      '          } catch(e){ done(false); }\n' +
      '        }\n' +
      '      });\n' +
      '    }\n' +
      '    bindCopyButton("copyClaimBtn", function(){ return document.getElementById("claimCodeValue").textContent; }, "Copy Claim Code");\n' +
      '    bindCopyButton("copyBbcBtn", function(){\n' +
      '      return document.getElementById("bbcSource").value;\n' +
      '    }, "Copy BBC Code");\n' +
      '    var continueBtn = document.getElementById("continueToSpecBtn");\n' +
      '    if(continueBtn){\n' +
      '      continueBtn.addEventListener("click", function(){\n' +
      '        function fieldValue(label){\n' +
      '          var fields = document.querySelectorAll(".bio-field");\n' +
      '          for(var i=0;i<fields.length;i++){\n' +
      '            var labelEl = fields[i].querySelector(".bio-field-label");\n' +
      '            var valueEl = fields[i].querySelector(".bio-field-value");\n' +
      '            if(labelEl && valueEl && labelEl.textContent.replace(/:$/,"") === label) return valueEl.textContent;\n' +
      '          }\n' +
      '          return "";\n' +
      '        }\n' +
      '        function worldExportsRanking(){\n' +
      '          var tables = document.querySelectorAll(".bio-export-table");\n' +
      '          for(var i=0;i<tables.length;i++){\n' +
      '            var labelDiv = tables[i].previousElementSibling;\n' +
      '            if(labelDiv && labelDiv.textContent.replace(/:$/,"") === "World Exports"){\n' +
      '              var cells = tables[i].querySelectorAll("tbody td");\n' +
      '              var ranks = [];\n' +
      '              for(var j=0;j<cells.length;j++){ ranks.push(cells[j].textContent); }\n' +
      '              return ranks;\n' +
      '            }\n' +
      '          }\n' +
      '          return [];\n' +
      '        }\n' +
      '        var snapshot = {\n' +
      '          economyType: fieldValue("Economy Type"),\n' +
      '          population: fieldValue("Population"),\n' +
      '          gdp: fieldValue("Total GDP"),\n' +
      '          energyProduction: fieldValue("Energy Production"),\n' +
      '          foodProduction: fieldValue("Food Production"),\n' +
      '          worldExports: worldExportsRanking(),\n' +
      '          claimCode: (function(){ var el = document.getElementById("claimCodeValue"); return el ? el.textContent.trim() : ""; })(),\n' +
      '          perProvinceEnergy: (function(){ var el = document.getElementById("perProvinceEnergyData"); try { return el ? JSON.parse(el.textContent) : []; } catch(e){ return []; } })(),\n' +
      '          claimMapHtml: (function(){ var el = document.getElementById("claimMapHandoffData"); try { return el ? JSON.parse(el.textContent) : ""; } catch(e){ return ""; } })(),\n' +
      '        };\n' +
      '        try {\n' +
      '          localStorage.setItem("landClaimSpecializationSnapshot", JSON.stringify(snapshot));\n' +
      '        } catch(e){}\n' +
      '        window.open("specialization.html", "_blank");\n' +
      '      });\n' +
      '    }\n' +
      '  <\/script>\n' +
      '</body>\n</html>';

    targetWindow.document.open();
    targetWindow.document.write(html);
    targetWindow.document.close();
  }

  // crude centroid approximation from path 'd' — averages all coordinate points
  // Shared low-level path-data walker: turns an SVG path 'd' string into
  // a flat list of [x,y] points it passes through. Used both for the
  // claim-seal centroid placement and for computing bounding boxes when
  // building the claim snapshot image on the bio page.
  function getPathPoints(d){
    const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?\d*\.?\d+(?:e-?\d+)?/g);
    if(!tokens) return [];
    let i=0, cmd=null, cx=0, cy=0, sx=0, sy=0;
    const pts = [];
    function num(){ return parseFloat(tokens[i++]); }
    while(i < tokens.length){
      const t = tokens[i];
      if(/[MmLlHhVvCcSsQqTtAaZz]/.test(t)){ cmd = t; i++; }
      switch(cmd){
        case 'M': cx=num(); cy=num(); sx=cx; sy=cy; pts.push([cx,cy]); cmd='L'; break;
        case 'm': cx+=num(); cy+=num(); sx=cx; sy=cy; pts.push([cx,cy]); cmd='l'; break;
        case 'L': cx=num(); cy=num(); pts.push([cx,cy]); break;
        case 'l': cx+=num(); cy+=num(); pts.push([cx,cy]); break;
        case 'H': cx=num(); pts.push([cx,cy]); break;
        case 'h': cx+=num(); pts.push([cx,cy]); break;
        case 'V': cy=num(); pts.push([cx,cy]); break;
        case 'v': cy+=num(); pts.push([cx,cy]); break;
        case 'C': num();num();num();num(); cx=num(); cy=num(); pts.push([cx,cy]); break;
        case 'c': num();num();num();num(); cx+=num(); cy+=num(); pts.push([cx,cy]); break;
        case 'S': num();num(); cx=num(); cy=num(); pts.push([cx,cy]); break;
        case 's': num();num(); cx+=num(); cy+=num(); pts.push([cx,cy]); break;
        case 'Q': num();num(); cx=num(); cy=num(); pts.push([cx,cy]); break;
        case 'q': num();num(); cx+=num(); cy+=num(); pts.push([cx,cy]); break;
        case 'T': cx=num(); cy=num(); pts.push([cx,cy]); break;
        case 't': cx+=num(); cy+=num(); pts.push([cx,cy]); break;
        case 'A': num();num();num();num();num(); cx=num(); cy=num(); pts.push([cx,cy]); break;
        case 'a': num();num();num();num();num(); cx+=num(); cy+=num(); pts.push([cx,cy]); break;
        case 'Z': case 'z': cx=sx; cy=sy; break;
        default: i++;
      }
    }
    return pts;
  }

  function centroid(d){
    const pts = getPathPoints(d);
    if(pts.length===0) return null;
    let sxs=0, sys=0;
    pts.forEach(function(pt){ sxs+=pt[0]; sys+=pt[1]; });
    return { x: sxs/pts.length, y: sys/pts.length };
  }

  function pathBBox(d){
    const pts = getPathPoints(d);
    if(pts.length===0) return null;
    let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
    pts.forEach(function(pt){
      if(pt[0]<minX) minX=pt[0];
      if(pt[0]>maxX) maxX=pt[0];
      if(pt[1]<minY) minY=pt[1];
      if(pt[1]>maxY) maxY=pt[1];
    });
    return { minX, minY, maxX, maxY };
  }

  // Bounding box (in shared page coordinates, i.e. after applying that
  // continent's transform) of every province belonging to one continent.
  // Computed once per continent and cached, since it only depends on the
  // static province geometry.
  const continentBBoxCache = {};
  function getContinentBBox(continentName){
    if(continentBBoxCache[continentName]) return continentBBoxCache[continentName];
    const tfStr = CONTINENT_TRANSFORMS[continentName];
    const m = tfStr && tfStr.match(/translate\(([-\d.]+),([-\d.]+)\)/);
    const tx = m ? parseFloat(m[1]) : 0;
    const ty = m ? parseFloat(m[2]) : 0;

    let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
    PROVINCES.forEach(function(p){
      if(p.continent !== continentName) return;
      const bb = pathBBox(p.d);
      if(!bb) return;
      minX = Math.min(minX, bb.minX+tx);
      minY = Math.min(minY, bb.minY+ty);
      maxX = Math.max(maxX, bb.maxX+tx);
      maxY = Math.max(maxY, bb.maxY+ty);
    });
    const result = { minX, minY, maxX, maxY, tx, ty };
    continentBBoxCache[continentName] = result;
    return result;
  }

  // Builds a small self-contained inline SVG showing one continent, with
  // its claimed provinces highlighted the same way they are on the main
  // map (gold outline). Used to embed a "map of your claim" image on the
  // generated bio page.
  function buildClaimSnapshotSVG(continentName, claimedIds){
    const bb = getContinentBBox(continentName);
    if(!isFinite(bb.minX)) return '';
    const pad = (bb.maxX-bb.minX) * 0.06;
    const x = bb.minX-pad, y = bb.minY-pad;
    const w = (bb.maxX-bb.minX)+pad*2, h = (bb.maxY-bb.minY)+pad*2;

    const claimedSet = {};
    claimedIds.forEach(function(id){ claimedSet[id]=true; });

    // Blank "Provinces" look for every shape (same neutral fill claimed or
    // not) - claimed provinces are distinguished only by the gold outline,
    // matching how selection reads on the live map's Provinces tab.
    const neutralFill = getNeutralFill();
    let paths = '';
    PROVINCES.forEach(function(p){
      if(p.continent !== continentName) return;
      const isClaimed = !!claimedSet[p.id];
      const strokeCls = isClaimed
        ? 'stroke="#e0a83e" stroke-width="1.6"'
        : 'stroke="#2c2417" stroke-width="0.5"';
      paths += `<path d="${p.d}" fill="${neutralFill}" ${strokeCls}/>`;
    });
    LAKE_LIST.forEach(function(l){
      if(l.continent === continentName) paths += `<path d="${l.d}" fill="${WATER}"/>`;
    });

    return `<svg viewBox="${bb.minX-pad} ${bb.minY-pad} ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="background:${WATER}">` +
      `<g transform="translate(${bb.tx},${bb.ty})">${paths}</g></svg>`;
  }

  // ---- Specialization-page-only claim snapshot (handoff copy) ----
  //
  // Everything below builds the ENHANCED version of the claim snapshot -
  // tightly cropped to the claim itself, claimed provinces filled in
  // (not just outlined), and a capital star - used ONLY for the copy
  // handed off to the specialization identity page (see
  // "claimMapHandoffData" in writeBioPage). The bio page's own visible
  // map above (buildClaimSnapshotSVG) is untouched by any of this.

  // Reads the current theme's highlight color live, same pattern as
  // getNeutralFill().
  function getClaimFill(){
    return getComputedStyle(document.body).getPropertyValue('--gold-bright').trim() || '#e0a83e';
  }

  function bboxesOverlap(a, b){
    return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
  }

  // Bounding box (in shared page coordinates, i.e. after applying that
  // continent's transform) of just the CLAIMED provinces - not the whole
  // continent. A claim is usually a small cluster in one corner of a
  // continent that can have hundreds of provinces, so cropping to the
  // claim itself (plus padding) is what keeps this version of the
  // snapshot from being mostly blank space.
  function getClaimBBox(continentName, claimedIds){
    const tfStr = CONTINENT_TRANSFORMS[continentName];
    const m = tfStr && tfStr.match(/translate\(([-\d.]+),([-\d.]+)\)/);
    const tx = m ? parseFloat(m[1]) : 0;
    const ty = m ? parseFloat(m[2]) : 0;

    let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
    claimedIds.forEach(function(id){
      const p = byId[id];
      if(!p || p.continent !== continentName) return;
      const bb = pathBBox(p.d);
      if(!bb) return;
      minX = Math.min(minX, bb.minX+tx);
      minY = Math.min(minY, bb.minY+ty);
      maxX = Math.max(maxX, bb.maxX+tx);
      maxY = Math.max(maxY, bb.maxY+ty);
    });
    return { minX, minY, maxX, maxY, tx, ty };
  }

  // Builds a small self-contained inline SVG showing just the claimed
  // provinces (plus their immediate neighbors for context), highlighted
  // the same way they are on the main map (gold outline) and also
  // gold-filled for visibility, with a star seal on the capital if one
  // was marked. Used only for the specialization page's identity step.
  function buildClaimHandoffSnapshotSVG(continentName, claimedIds, capitalId){
    const bb = getClaimBBox(continentName, claimedIds);
    if(!isFinite(bb.minX)) return '';
    const rawW = bb.maxX-bb.minX, rawH = bb.maxY-bb.minY;
    // Padding scales with the claim's own size, plus a fixed floor so a
    // one- or two-province claim doesn't crop in so tight the shape reads
    // as an abstract blob with no surrounding context.
    const pad = Math.max(rawW, rawH) * 0.18 + 14;
    const x = bb.minX-pad, y = bb.minY-pad;
    const w = rawW+pad*2, h = rawH+pad*2;
    const cropRect = { minX:x, minY:y, maxX:x+w, maxY:y+h };

    const claimedSet = {};
    claimedIds.forEach(function(id){ claimedSet[id]=true; });

    const neutralFill = getNeutralFill();
    const claimFill = getClaimFill();
    let paths = '';
    PROVINCES.forEach(function(p){
      if(p.continent !== continentName) return;
      const isClaimed = !!claimedSet[p.id];
      // Neighboring, unclaimed provinces are only drawn if they actually
      // fall within the cropped view - no point carrying the rest of the
      // continent's geometry into an SVG that will never show it.
      if(!isClaimed){
        const pbb = pathBBox(p.d);
        if(!pbb) return;
        const translated = { minX: pbb.minX+bb.tx, minY: pbb.minY+bb.ty, maxX: pbb.maxX+bb.tx, maxY: pbb.maxY+bb.ty };
        if(!bboxesOverlap(translated, cropRect)) return;
      }
      // claim-fill/claim-context classes are hooks, not styling - the
      // specialization page's color picker finds claimed provinces (and
      // the capital seal below) by these class names to recolor them
      // client-side after this markup has already been baked in and
      // handed off, without needing to know anything about how the SVG
      // was built.
      const cls = isClaimed ? 'claim-fill' : 'claim-context';
      const strokeCls = isClaimed
        ? 'stroke="#e0a83e" stroke-width="1.6"'
        : 'stroke="#2c2417" stroke-width="0.5"';
      const fill = isClaimed ? claimFill : neutralFill;
      paths += `<path class="${cls}" d="${p.d}" fill="${fill}" ${strokeCls}/>`;
    });
    LAKE_LIST.forEach(function(l){
      if(l.continent === continentName) paths += `<path d="${l.d}" fill="${WATER}"/>`;
    });

    // Capital star - same circle+star-glyph seal used on the live map
    // (render()'s seal-capital), just drawn as static inline SVG here
    // rather than through CSS classes, so it survives being lifted out of
    // this page and rasterized to PNG. The circle carries claim-fill too
    // (same recolor hook as the provinces above) so the picker on the
    // specialization page keeps the seal matching the claim's color.
    let sealMarkup = '';
    const capitalProvince = capitalId && byId[capitalId];
    const capitalCenter = capitalProvince && centroid(capitalProvince.d);
    if(capitalCenter){
      sealMarkup = `<g class="claim-capital-seal">` +
        `<circle class="claim-fill" cx="${capitalCenter.x}" cy="${capitalCenter.y}" r="6.4" fill="${claimFill}" stroke="#f4ead7" stroke-width="0.6"/>` +
        `<text x="${capitalCenter.x}" y="${capitalCenter.y}" font-size="7.5" fill="#f4ead7" font-weight="700" ` +
        `text-anchor="middle" dominant-baseline="central">★</text></g>`;
    }

    return `<svg viewBox="${x} ${y} ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="background:${WATER}">` +
      `<g transform="translate(${bb.tx},${bb.ty})">${paths}${sealMarkup}</g></svg>`;
  }

  render();
  setLayer(activeLayer);

  // ---- Zoom & Pan ----
  const BASE_VB = VIEWBOX.split(' ').map(Number); // [x, y, w, h]
  let vb = BASE_VB.slice();
  const MIN_SCALE = 0.35; // lowest magnification allowed - how far OUT you can zoom
  const MAX_SCALE = 60;   // highest magnification allowed - how far IN you can zoom.
                          // Raised from 6 so individual small provinces (and the
                          // tiny islet clusters) are actually easy to target -
                          // at 6, max zoom-in still showed almost an entire
                          // continent at once.

  function applyViewBox(){
    svg.setAttribute('viewBox', vb.join(' '));
  }

  function clampViewBox(){
    // clamp width/height to scale bounds
    const minW = BASE_VB[2] / MAX_SCALE;
    const maxW = BASE_VB[2] * MIN_SCALE_INV();
    vb[2] = Math.max(minW, Math.min(vb[2], BASE_VB[2] * (1/MIN_SCALE)));
    vb[3] = Math.max(BASE_VB[3] / MAX_SCALE, Math.min(vb[3], BASE_VB[3] * (1/MIN_SCALE)));
  }
  function MIN_SCALE_INV(){ return 1/MIN_SCALE; }

  function zoomAt(clientX, clientY, factor){
    const rect = mapFrame.getBoundingClientRect();
    const px = (clientX - rect.left) / rect.width;
    const py = (clientY - rect.top) / rect.height;
    const mx = vb[0] + px * vb[2];
    const my = vb[1] + py * vb[3];

    let newW = vb[2] * factor;
    let newH = vb[3] * factor;
    const maxW = BASE_VB[2] / MIN_SCALE;
    const minW = BASE_VB[2] / MAX_SCALE;
    newW = Math.max(minW, Math.min(newW, maxW));
    newH = Math.max(BASE_VB[3] / MAX_SCALE, Math.min(newH, BASE_VB[3] / MIN_SCALE));

    vb[0] = mx - px * newW;
    vb[1] = my - py * newH;
    vb[2] = newW;
    vb[3] = newH;
    applyViewBox();
    updateZoomCursor();
  }

  function resetView(){
    vb = BASE_VB.slice();
    applyViewBox();
    updateZoomCursor();
  }

  function updateZoomCursor(){
    const zoomedIn = vb[2] < BASE_VB[2] - 0.01;
    svg.classList.toggle('pannable', zoomedIn);
  }

  // wheel zoom, centered on cursor
  mapFrame.addEventListener('wheel', function(e){
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.15 : 1/1.15;
    zoomAt(e.clientX, e.clientY, factor);
  }, { passive: false });

  // drag to pan
  let dragging = false;
  let dragMoved = false;
  let lastX = 0, lastY = 0;

  svg.addEventListener('mousedown', function(e){
    dragging = true;
    dragMoved = false;
    lastX = e.clientX;
    lastY = e.clientY;
    svg.classList.add('panning');
  });
  window.addEventListener('mousemove', function(e){
    if(!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    if(Math.abs(dx) > 2 || Math.abs(dy) > 2) dragMoved = true;
    if(!dragMoved) return;
    const rect = mapFrame.getBoundingClientRect();
    vb[0] -= dx * (vb[2] / rect.width);
    vb[1] -= dy * (vb[3] / rect.height);
    lastX = e.clientX;
    lastY = e.clientY;
    applyViewBox();
    hideTooltip();
  });
  window.addEventListener('mouseup', function(){
    dragging = false;
    svg.classList.remove('panning');
  });

  // ---- touch support (one finger pans, two fingers pinch-zoom) ----
  // Mirrors the mouse pan/zoom logic above. Simple taps still work for
  // province selection without any extra code here, since a touch that
  // never moves still lets the browser's normal synthesized "click" fire.
  let touchMode = null; // 'pan' | 'pinch' | null
  let touchMoved = false;
  let touchLastX = 0, touchLastY = 0;
  let pinchStartDist = 0, pinchStartVb = null;

  function touchDist(touches){
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx*dx + dy*dy);
  }
  function touchMidpoint(touches){
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2,
    };
  }

  svg.addEventListener('touchstart', function(e){
    if(e.touches.length === 1){
      touchMode = 'pan';
      touchMoved = false;
      touchLastX = e.touches[0].clientX;
      touchLastY = e.touches[0].clientY;
    } else if(e.touches.length === 2){
      touchMode = 'pinch';
      touchMoved = true; // a pinch is never a tap-to-select
      pinchStartDist = touchDist(e.touches);
      pinchStartVb = vb.slice();
    }
  }, { passive: true });

  svg.addEventListener('touchmove', function(e){
    if(touchMode === 'pan' && e.touches.length === 1){
      const t = e.touches[0];
      const dx = t.clientX - touchLastX;
      const dy = t.clientY - touchLastY;
      if(Math.abs(dx) > 2 || Math.abs(dy) > 2) touchMoved = true;
      if(!touchMoved) return;
      e.preventDefault();
      const rect = mapFrame.getBoundingClientRect();
      vb[0] -= dx * (vb[2] / rect.width);
      vb[1] -= dy * (vb[3] / rect.height);
      touchLastX = t.clientX;
      touchLastY = t.clientY;
      applyViewBox();
      hideTooltip();
    } else if(touchMode === 'pinch' && e.touches.length === 2){
      e.preventDefault();
      const dist = touchDist(e.touches);
      const mid = touchMidpoint(e.touches);
      // Recompute from the pinch's starting viewBox each move (rather than
      // compounding factors frame to frame) so there's no drift.
      vb = pinchStartVb.slice();
      zoomAt(mid.x, mid.y, pinchStartDist / dist);
    }
  }, { passive: false });

  svg.addEventListener('touchend', function(e){
    if(e.touches.length === 0){
      touchMode = null;
    } else if(e.touches.length === 1){
      // lifted one finger out of a pinch - resume as a pan with the other
      touchMode = 'pan';
      touchMoved = true; // already a multi-touch gesture, not a tap
      touchLastX = e.touches[0].clientX;
      touchLastY = e.touches[0].clientY;
    }
  });

  // suppress click-to-select if the mousedown/up (or touch) was actually a drag
  svg.addEventListener('click', function(e){
    if(dragMoved || touchMoved){
      e.stopPropagation();
      e.preventDefault();
      touchMoved = false;
    }
  }, true);

  // double-click to zoom in on a spot
  svg.addEventListener('dblclick', function(e){
    zoomAt(e.clientX, e.clientY, 0.6);
  });

  document.getElementById('zoomIn').addEventListener('click', function(){
    const rect = mapFrame.getBoundingClientRect();
    zoomAt(rect.left + rect.width/2, rect.top + rect.height/2, 0.65);
  });
  document.getElementById('zoomOut').addEventListener('click', function(){
    const rect = mapFrame.getBoundingClientRect();
    zoomAt(rect.left + rect.width/2, rect.top + rect.height/2, 1/0.65);
  });
  document.getElementById('zoomReset').addEventListener('click', resetView);

  applyViewBox();

  // Called by theme.js after switching themes, so the currently-visible
  // layer (most importantly the neutral "Provinces" fill) repaints with
  // the new theme's colors right away.
  window.refreshMapTheme = function(){
    setLayer(activeLayer);
  };
})();
