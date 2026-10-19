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
  // ---- Map images (files listed in maps-config.js) ----
  // A map is either an image laid over the province borders (placed by its
  // own x/y/width/height in map units - see maps-config.js), a province-
  // colored data map, or a placeholder when no image has been supplied.
  const MAP_IMG = (typeof MAP_IMAGES !== 'undefined' && MAP_IMAGES) ? MAP_IMAGES : {};
  const TERRAIN_BASE = (typeof TERRAIN_IMAGE !== 'undefined') ? TERRAIN_IMAGE : null;
  // imageKey -> { href, x, y, width, height, legend, legendImg, caption }
  const IMAGE_SOURCES = {};
  function registerImage(key, entry){
    if(!entry || !entry.href) return false;
    const base = TERRAIN_BASE || { x: 0, y: 0, width: 0, height: 0 };
    IMAGE_SOURCES[key] = {
      href: entry.href,
      x: (entry.x != null ? entry.x : base.x), y: (entry.y != null ? entry.y : base.y),
      width: (entry.width != null ? entry.width : base.width), height: (entry.height != null ? entry.height : base.height),
      legend: entry.legend || null, legendImg: entry.legendImg || null, caption: entry.caption || null,
    };
    return true;
  }
  // id doubles as the config key. Placeholder when the config has no image for it.
  function imageMap(id, label){
    return registerImage(id, MAP_IMG[id]) ? { id: id, label: label, type: 'image', imageKey: id }
                                         : { id: id, label: label, type: 'placeholder' };
  }
  // A map with several views (e.g. Hazards): shown in the menu as a heading
  // with its views listed beneath.
  function variantMap(label, views){
    return { label: label, variants: views.map(function(v){ return imageMap(v[0], v[1]); }) };
  }

  // Each tab is a group with a dropdown of maps. Clicking the tab itself
  // opens the FIRST map in its list (the current/default one); the caret
  // opens the full list.
  const LAYER_GROUPS = [
    { id: 'provinces', label: 'Provinces', maps: [
      { id: 'provinces', label: 'Provinces', type: 'neutral' } ] },
    { id: 'economic', label: 'Economic Output', maps: [
      { id: 'economic', label: 'Sector Map', type: 'data' },
      imageMap('fisheries', 'Fisheries') ] },
    { id: 'bioclimate', label: 'Bioclimate', maps: [
      // the existing province-colored climate map stays the default
      { id: 'climate', label: 'Province climate', type: 'climate' },
      imageMap('koppen', 'K\u00f6ppen climate'),
      imageMap('trewartha', 'Trewartha'),
      imageMap('biomes', 'Biomes'),
      variantMap('Temperature', [
        ['temp_annual', 'Annual mean temperature'],
        ['temp_jan', 'January temperature'],
        ['temp_jul', 'July temperature'],
        ['temp_range', 'Seasonal temperature range'] ]) ] },
    { id: 'terrain', label: 'Terrain', maps: [
      // Terrain's id stays 'terrain' - the tooltip's elevation breakdown keys off it.
      (registerImage('topography', MAP_IMG.topography) || registerImage('topography', TERRAIN_BASE))
        ? { id: 'terrain', label: 'Topography', type: 'image', imageKey: 'topography' }
        : { id: 'terrain', label: 'Topography', type: 'placeholder' },
      variantMap('Currents', [
        ['currents_warmcold', 'Warm & cold currents'],
        ['currents_annual', 'Annual mean flow'],
        ['currents_jan', 'January currents'],
        ['currents_jul', 'July currents'] ]),
      variantMap('Hazards', [
        ['haz_earthquakes', 'Earthquakes'],
        ['haz_volcanoes', 'Volcanoes'],
        ['haz_tsunamis', 'Tsunamis'],
        ['haz_floods', 'Floods'],
        ['haz_drought', 'Drought'],
        ['haz_wildfire', 'Wildfire'],
        ['haz_tornadoes', 'Tornadoes'],
        ['haz_cyclone_genesis', 'Tropical cyclone formation'],
        ['haz_cyclone_tracks', 'Tropical cyclone tracks'],
        ['haz_cyclone_risk', 'Hurricane / typhoon risk'],
        ['haz_floes', 'Drifting sea ice'],
        ['haz_icebergs', 'Icebergs'],
        ['haz_polarlows', 'Polar lows'],
        ['haz_seafog', 'Sea fog'] ]) ] },
  ];
  // flat list of selectable maps per group (variants flattened), tagged with their group
  LAYER_GROUPS.forEach(function(grp){
    grp.leaves = [];
    grp.maps.forEach(function(m){
      if(m.variants){ m.variants.forEach(function(v){ v.group = grp.id; v.parentLabel = m.label; grp.leaves.push(v); }); }
      else { m.group = grp.id; grp.leaves.push(m); }
    });
  });
  let activeLayer = LAYER_GROUPS[0].leaves[0];

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

  // Image backdrops for the image-type maps (hidden on the other layers):
  // one <image> per registered source, created up front but only given its
  // file the first time its map is shown, so the page doesn't download every
  // map just to load.
  const imageFailed = {};
  const imageEls = {};
  const gTerrain = document.createElementNS(NS, 'g');
  gTerrain.style.display = 'none';
  Object.keys(IMAGE_SOURCES).forEach(function(key){
    const src = IMAGE_SOURCES[key];
    const im = document.createElementNS(NS, 'image');
    im.setAttribute('x', src.x); im.setAttribute('y', src.y);
    im.setAttribute('width', src.width); im.setAttribute('height', src.height);
    im.setAttribute('preserveAspectRatio', 'none');
    im.style.pointerEvents = 'none';
    im.style.display = 'none';
    // if the image can't be loaded, say so on its layer instead of failing silently
    im.addEventListener('error', function(){
      imageFailed[key] = true;
      console.warn('Map image failed to load (' + key + '):', String(src.href).slice(0, 80));
      if(activeLayer && activeLayer.imageKey === key){ setLayer(activeLayer); }
    });
    imageEls[key] = im;
    gTerrain.appendChild(im);
  });
  function ensureImageLoaded(key){
    const im = imageEls[key];
    if(!im || im.getAttribute('href')) return;
    const href = IMAGE_SOURCES[key].href;
    im.setAttribute('href', href);
    im.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', href);
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


  // ---- Agriculture Land Use (icons per province; data in agland-data.js) ----
  // AGLAND[label] = scores 0-100 in AGLAND_OUTPUTS order; an output counts as
  // viable in a province when its score reaches AGLAND_THRESHOLDS[i].
  const AG_DEFS = [
    { key: 'cropland',   label: 'Cropland',    color: '#c9951a' },
    { key: 'plantation', label: 'Plantations', color: '#d2691e' },
    { key: 'forestry',   label: 'Forestry',    color: '#2e7d32' },
    { key: 'rubber',     label: 'Rubber',      color: '#7b4a2e' },
    { key: 'pasture',    label: 'Pastures',    color: '#6a9a1f' },
    { key: 'fishing',    label: 'Fishing',     color: '#1f78b4' },
  ];
  const AG_OK = (typeof AGLAND !== 'undefined' && typeof AGLAND_OUTPUTS !== 'undefined');
  // glyphs drawn in a 24x24 box (inside a white badge so they read on any tint)
  const AG_GLYPHS = {
    cropland:
      '<path d="M12 22V8" stroke="C" stroke-width="1.6" fill="none" stroke-linecap="round"/>' +
      '<ellipse cx="12" cy="5.2" rx="1.7" ry="3" fill="C"/>' +
      '<ellipse cx="8.6" cy="10.2" rx="1.6" ry="3" fill="C" transform="rotate(-38 8.6 10.2)"/>' +
      '<ellipse cx="15.4" cy="10.2" rx="1.6" ry="3" fill="C" transform="rotate(38 15.4 10.2)"/>' +
      '<ellipse cx="8.6" cy="15.4" rx="1.6" ry="3" fill="C" transform="rotate(-38 8.6 15.4)"/>' +
      '<ellipse cx="15.4" cy="15.4" rx="1.6" ry="3" fill="C" transform="rotate(38 15.4 15.4)"/>',
    plantation:
      '<path d="M12.6 22C12.4 17 12.8 12 14 8.5" stroke="C" stroke-width="1.8" fill="none" stroke-linecap="round"/>' +
      '<path d="M14 8.5C11 5.2 7 5.4 4.2 8.2M14 8.5C12.6 4.8 9.4 3 6 3.6M14 8.5C15.8 4.6 19 3.4 22 4.8M14 8.5C17.4 6.4 20.8 8.2 21.8 11.4" stroke="C" stroke-width="1.7" fill="none" stroke-linecap="round"/>' +
      '<circle cx="12.6" cy="10.2" r="1.3" fill="C"/>',
    forestry:
      '<path d="M12 2.5L6.2 10h3.2L4.6 16h5.2L12 15.4 14.2 16h5.2l-4.8-6h3.2z" fill="C"/>' +
      '<rect x="11" y="15.5" width="2" height="6" fill="C"/>',
    rubber:
      '<path d="M12 2.4C12 2.4 5.4 10 5.4 14.6a6.6 6.6 0 0 0 13.2 0C18.6 10 12 2.4 12 2.4z" fill="C"/>' +
      '<path d="M8.6 14.8a3.4 3.4 0 0 0 2.6 3.2" stroke="#fff" stroke-width="1.4" fill="none" stroke-linecap="round"/>',
    pasture:
      '<circle cx="7.6" cy="11.6" r="3.2" fill="C"/><circle cx="12" cy="9.8" r="3.6" fill="C"/><circle cx="16.2" cy="11.6" r="3.2" fill="C"/>' +
      '<ellipse cx="12" cy="13.2" rx="6.6" ry="3.6" fill="C"/>' +
      '<circle cx="19.8" cy="10.2" r="2.2" fill="C"/>' +
      '<path d="M8.4 16.4V21M15.6 16.4V21" stroke="C" stroke-width="1.7" stroke-linecap="round"/>',
    fishing:
      '<path d="M2.4 12C5.4 6.8 11 5.6 15 8c1.4.8 2.4 2.4 2.4 4s-1 3.2-2.4 4c-4 2.4-9.6 1.2-12.6-4z" fill="C"/>' +
      '<path d="M16.6 12l5-4.2v8.4z" fill="C"/>' +
      '<circle cx="7.2" cy="11.2" r="1.1" fill="#fff"/>',
  };
  function agViable(label){
    const row = AG_OK ? AGLAND[label] : null;
    if(!row) return [];
    const out = [];
    AGLAND_OUTPUTS.forEach(function(k, i){
      if(row[i] >= AGLAND_THRESHOLDS[i]) out.push({ key: k, score: row[i] });
    });
    out.sort(function(a, b){ return b.score - a.score; });
    return out;
  }
  function agDef(key){ for(let i = 0; i < AG_DEFS.length; i++){ if(AG_DEFS[i].key === key) return AG_DEFS[i]; } return null; }
  function agTint(label){
    const v = agViable(label);
    if(!v.length) return null;
    return agDef(v[0].key).color;
  }
  const gAgByContinent = {};
  const overlayOn = {};                       // icon overlay id -> shown?
  let refreshOverlays = function(){};         // set up with the overlay bar below
  let agIconsBuilt = false;
  function ensureAgIcons(){
    if(agIconsBuilt || !AG_OK) return;
    agIconsBuilt = true;
    const defs = document.createElementNS(NS, 'defs');
    AG_DEFS.forEach(function(d){
      const sym = document.createElementNS(NS, 'symbol');
      sym.setAttribute('id', 'ag-' + d.key);
      sym.setAttribute('viewBox', '0 0 24 24');
      sym.innerHTML = '<circle cx="12" cy="12" r="11.4" fill="#fff" fill-opacity="0.92" stroke="' + d.color + '" stroke-width="1.1"/>' +
        '<g transform="translate(5 5) scale(0.583)">' + AG_GLYPHS[d.key].replace(/"C"/g, '"' + d.color + '"') + '</g>';
      defs.appendChild(sym);
    });
    svg.insertBefore(defs, svg.firstChild);
    CONTINENT_ORDER.forEach(function(cid){
      const gg = document.createElementNS(NS, 'g');
      gg.setAttribute('class', 'ag-icons');
      gg.style.pointerEvents = 'none';
      gg.style.display = 'none';
      CONTINENT_GROUPS[cid].appendChild(gg);
      gAgByContinent[cid] = gg;
    });
    PROVINCES.forEach(function(p){
      const v = agViable(p.label);
      if(!v.length) return;
      const c = centroid(p.d);
      if(!c) return;
      const area = (p.geo && p.geo.area) ? p.geo.area : 80;
      const box = Math.max(3, Math.sqrt(area) * 0.78);
      // icons that fit: 1, up to 4 (2x2), or up to 6 (3x2)
      const n = Math.min(v.length, 6);
      const cols = n <= 1 ? 1 : (n <= 4 ? 2 : 3);
      const rows = Math.ceil(n / cols);
      const cell = box / Math.max(cols, rows);
      const size = Math.min(cell * 0.94, 9);
      const gg = gAgByContinent[p.continent] || gAgByContinent[CONTINENT_ORDER[0]];
      for(let i = 0; i < n; i++){
        const r = Math.floor(i / cols), col = i % cols;
        const inRow = (r === rows - 1) ? (n - r * cols) : cols;   // centre a short last row
        const x = c.x + (col - (inRow - 1) / 2) * cell - size / 2;
        const y = c.y + (r - (rows - 1) / 2) * cell - size / 2;
        const u = document.createElementNS(NS, 'use');
        u.setAttribute('href', '#ag-' + v[i].key);
        u.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', '#ag-' + v[i].key);
        u.setAttribute('x', x.toFixed(2)); u.setAttribute('y', y.toFixed(2));
        u.setAttribute('width', size.toFixed(2)); u.setAttribute('height', size.toFixed(2));
        gg.appendChild(u);
      }
    });
  }
  function buildAgLegend(){
    const note = document.createElement('div');
    note.className = 'legend-caption';
    note.textContent = 'Which farming and fishing outputs are economically viable in each province (from its biomes, climate, terrain and coastal waters). Zoom in to see every icon; the colour shows the strongest output.';
    legend.appendChild(note);
    AG_DEFS.forEach(function(d){
      let n = 0;
      PROVINCES.forEach(function(p){ if(agViable(p.label).some(function(o){ return o.key === d.key; })) n++; });
      const row = document.createElement('div');
      row.className = 'legend-row';
      row.innerHTML =
        '<svg class="legend-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><use href="#ag-' + d.key + '"></use></svg>' +
        '<span class="legend-label">' + d.label + '</span>';
      legend.appendChild(row);
    });
  }

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

  // ---- Layer tab bar (tabs with dropdown menus) ----
  const layerTabs = document.getElementById('layerTabs');
  const noDataBanner = document.getElementById('noDataBanner');
  const tabEls = {};
  let openMenuGroup = null;

  const layerMenu = document.createElement('div');
  layerMenu.className = 'layer-menu';
  layerMenu.setAttribute('role', 'menu');
  layerMenu.hidden = true;
  document.body.appendChild(layerMenu);

  function closeLayerMenu(){
    layerMenu.hidden = true;
    if(openMenuGroup && tabEls[openMenuGroup]){ tabEls[openMenuGroup].caret.setAttribute('aria-expanded', 'false'); }
    openMenuGroup = null;
  }
  function openLayerMenu(grp){
    if(openMenuGroup === grp.id){ closeLayerMenu(); return; }
    closeLayerMenu();
    layerMenu.innerHTML = '';
    function addItem(m, indent){
      const item = document.createElement('button');
      item.type = 'button';
      item.setAttribute('role', 'menuitem');
      item.className = 'layer-menu-item' + (indent ? ' layer-menu-sub' : '') + (activeLayer === m ? ' active' : '');
      item.textContent = m.label + (m.type === 'placeholder' ? ' (coming soon)' : '');
      item.addEventListener('click', function(){ closeLayerMenu(); setLayer(m); });
      layerMenu.appendChild(item);
    }
    grp.maps.forEach(function(m){
      if(m.variants){
        const head = document.createElement('div');
        head.className = 'layer-menu-head';
        head.textContent = m.label;
        layerMenu.appendChild(head);
        m.variants.forEach(function(v){ addItem(v, true); });
      } else {
        addItem(m, false);
      }
    });
    const tab = tabEls[grp.id];
    const r = tab.wrap.getBoundingClientRect();
    layerMenu.hidden = false;
    // fixed-position so the tab strip's own scrolling (small screens) can't clip it
    layerMenu.style.maxHeight = '';
    const mw = layerMenu.offsetWidth;
    const below = window.innerHeight - r.bottom - 12, above = r.top - 12;
    const natural = layerMenu.scrollHeight;
    // open downward if it fits (or there's more room below); otherwise upward
    // (the strip sits at the bottom on small screens), capped to the room available
    const goDown = natural <= below || below >= above;
    const room = Math.max(120, goDown ? below : above);
    layerMenu.style.maxHeight = Math.min(room, natural) + 'px';
    const mh = layerMenu.offsetHeight;
    const left = Math.min(Math.max(8, r.left), window.innerWidth - mw - 8);
    const top = goDown ? r.bottom + 4 : Math.max(8, r.top - mh - 4);
    layerMenu.style.left = left + 'px';
    layerMenu.style.top = top + 'px';
    openMenuGroup = grp.id;
    tab.caret.setAttribute('aria-expanded', 'true');
  }
  document.addEventListener('click', function(e){
    if(openMenuGroup && !layerMenu.contains(e.target) && !(tabEls[openMenuGroup] && tabEls[openMenuGroup].wrap.contains(e.target))) closeLayerMenu();
  });
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape') closeLayerMenu(); });
  window.addEventListener('resize', closeLayerMenu);
  layerTabs.addEventListener('scroll', closeLayerMenu);

  LAYER_GROUPS.forEach(function(grp){
    const wrap = document.createElement('div');
    wrap.className = 'layer-tab-wrap';
    const btn = document.createElement('button');
    btn.className = 'layer-tab';
    btn.textContent = grp.label;
    // Clicking the tab itself always opens the group's default (first) map.
    btn.addEventListener('click', function(){ closeLayerMenu(); setLayer(grp.leaves[0]); });
    wrap.appendChild(btn);
    let caret = null;
    if(grp.leaves.length > 1){
      caret = document.createElement('button');
      caret.className = 'layer-tab layer-tab-caret';
      caret.type = 'button';
      caret.textContent = '\u25be';
      caret.setAttribute('aria-label', grp.label + ' maps');
      caret.setAttribute('aria-haspopup', 'menu');
      caret.setAttribute('aria-expanded', 'false');
      caret.addEventListener('click', function(e){ e.stopPropagation(); openLayerMenu(grp); });
      wrap.appendChild(caret);
    }
    layerTabs.appendChild(wrap);
    tabEls[grp.id] = { wrap: wrap, btn: btn, caret: caret || { setAttribute: function(){} }, grp: grp };
  });

  function mixColor(a, b, t){
    function p(h){ h = String(h).trim(); if(h[0] === '#'){ if(h.length === 4){ h = '#' + h[1]+h[1]+h[2]+h[2]+h[3]+h[3]; } return [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)]; }
      const m = h.match(/\d+/g); return m ? [+m[0], +m[1], +m[2]] : [201,185,140]; }
    const x = p(a), y = p(b);
    return 'rgb(' + [0,1,2].map(function(i){ return Math.round(x[i] + (y[i]-x[i]) * t); }).join(',') + ')';
  }

  function setLayer(layer){
    activeLayer = layer;
    if(layer.type === 'agland'){ ensureAgIcons(); }
    LAYER_GROUPS.forEach(function(grp){
      const t = tabEls[grp.id];
      const on = grp.id === layer.group;
      t.wrap.classList.toggle('active', on);
      // Show the chosen map beside the tab name when it isn't the group's default.
      t.btn.textContent = (on && grp.leaves.length > 1 && grp.leaves[0] !== layer) ? grp.label + ' \u00b7 ' + layer.label : grp.label;
    });
    PROVINCES.forEach(function(p){
      const el = provinceEls[p.id];
      let fill;
      if(layer.type === 'data'){ fill = p.fill; }
      else if(layer.type === 'neutral'){ fill = getNeutralFill(); }
      else if(layer.type === 'climate'){
        fill = p.climate ? CLIMATE_COLOR[p.climate.display || p.climate.dominant] : '#cabf9e';
      }
      // see-through (but still clickable) so the map image shows beneath the borders
      else if(layer.type === 'agland'){
        const tint = agTint(p.label);
        // pale wash of the strongest output's colour over the neutral land
        fill = tint ? mixColor(getNeutralFill(), tint, 0.38) : getNeutralFill();
      }
      else if(layer.type === 'image'){ fill = 'rgba(0,0,0,0)'; }
      else { fill = 'url(#noDataHatch)'; }
      el.setAttribute('fill', fill);
    });
    applyTakenStyling();
    const imageMissing = layer.type === 'image' && !!imageFailed[layer.imageKey];
    noDataBanner.classList.toggle('show', layer.type === 'placeholder' || imageMissing);
    if(layer.type === 'placeholder'){
      noDataBanner.textContent = 'No ' + layer.label + ' map yet \u2014 this is a placeholder. Provinces are still selectable.';
    } else if(imageMissing){
      noDataBanner.textContent = 'The ' + layer.label + ' image could not be loaded. Provinces are still selectable.';
    }
    const imgSrc = layer.type === 'image' ? IMAGE_SOURCES[layer.imageKey] : null;
    if(imgSrc && !imageFailed[layer.imageKey]) ensureImageLoaded(layer.imageKey);
    const imgLegend = imgSrc ? imgSrc.legend : null;
    legend.innerHTML = '';
    const hasLegendImg = !!(imgSrc && imgSrc.legendImg);
    const hasCaption = !!(imgSrc && imgSrc.caption);
    legend.classList.toggle('show', layer.type === 'data' || layer.type === 'climate' || layer.type === 'agland' || !!imgLegend || hasLegendImg || hasCaption);
    legend.classList.toggle('legend-wide', hasLegendImg || hasCaption || layer.type === 'agland');
    if(hasCaption){
      const cap = document.createElement('div');
      cap.className = 'legend-caption';
      cap.textContent = imgSrc.caption;
      legend.appendChild(cap);
    }
    if(layer.type === 'agland'){ buildAgLegend(); }
    const activeLegendData = layer.type === 'climate' ? CLIMATE_LEGEND
      : (layer.type === 'data' ? ECON_LEGEND : (layer.type === 'image' ? imgLegend : null));
    if(activeLegendData){ buildLegend(activeLegendData, layer.type); }
    if(hasLegendImg){
      const li = document.createElement('img');
      li.className = 'legend-img';
      li.alt = layer.label + ' legend';
      li.src = imgSrc.legendImg;
      legend.appendChild(li);
    }
    gExtra.style.display = (layer.id === 'provinces') ? '' : 'none';
    // an image map already shows all land, so the greyed placeholder land is hidden there
    Object.keys(imageEls).forEach(function(k){ imageEls[k].style.display = (layer.imageKey === k) ? '' : 'none'; });
    gTerrain.style.display = (layer.type === 'image') ? '' : 'none';
    gPending.style.display = (layer.type === 'image') ? 'none' : '';
    refreshOverlays(layer);
  }

  // ---- Legends ----
  const legend = document.getElementById('legend');
  const CLIMATE_COLOR = {};
  CLIMATE_LEGEND.forEach(function(item){ CLIMATE_COLOR[item.climate] = item.color; });

  function buildLegend(items, type){
    items.forEach(function(item){
      const key = type === 'climate' ? item.climate : (type === 'image' ? (item.terrain || item.label) : item.econ);
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
      const claim = takenIndex[p.label.toUpperCase()];
      sub = 'Claimed by ' + claim.name + (claim.isNpc ? ' - NPC' : '');
    } else if(activeLayer.id === 'economic'){
      // the province's sector profile, largest first (e.g. "Agriculture 58% \u00b7 Services 22% \u00b7 Manufacturing 12%")
      if(p.sectors){
        sub = Object.keys(p.sectors)
          .filter(function(k){ return p.sectors[k] > 0; })
          .sort(function(a, b){ return p.sectors[b] - p.sectors[a]; })
          .slice(0, 3)
          .map(function(k){ return k + ' ' + p.sectors[k] + '%'; }).join(' \u00b7 ');
      } else {
        sub = p.econ;
      }
      if(p.hub) sub = '\u2605 ' + p.hub + ' hub \u00b7 ' + sub;
      if(overlayOn.agland && AG_OK){
        const v = agViable(p.label);
        sub += ' \u00b7 Ag: ' + (v.length ? v.map(function(o){ return agDef(o.key).label; }).join(', ') : 'none');
      }
    } else if(activeLayer.type === 'agland'){
      const v = agViable(p.label);
      sub = v.length ? v.map(function(o){ return agDef(o.key).label; }).join(', ') : 'No viable agriculture';
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

  // Per-claim Agriculture Land Use summary, handed to the specialization page's
  // Land Use step: for each output, how many claimed provinces can viably do it
  // and the average viability score (0-100) across the claim. "plantation"
  // counts rubber too (rubber is a plantation crop); "rubber" is also kept
  // separately, along with fishing, for display.
  function agLandUseSummary(provinces){
    if(!AG_OK) return null;
    const keys = ['cropland', 'plantation', 'forestry', 'pasture', 'rubber', 'fishing'];
    const out = {};
    keys.forEach(function(k){ out[k] = { viable: 0, avg: 0 }; });
    provinces.forEach(function(p){
      const row = AGLAND[p.label];
      if(!row) return;
      const sc = {}, ok = {};
      AGLAND_OUTPUTS.forEach(function(k, i){ sc[k] = row[i]; ok[k] = row[i] >= AGLAND_THRESHOLDS[i]; });
      sc.plantationAll = Math.max(sc.plantation, sc.rubber);
      ok.plantationAll = ok.plantation || ok.rubber;
      keys.forEach(function(k){
        const kk = k === 'plantation' ? 'plantationAll' : k;
        if(ok[kk]) out[k].viable++;
        out[k].avg += sc[kk];
      });
    });
    keys.forEach(function(k){ out[k].avg = provinces.length ? Math.round(out[k].avg / provinces.length) : 0; });
    return { count: provinces.length, outputs: out };
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
                       '    <script type="application/json" id="claimMapHandoffData">' + JSON.stringify(claimMapHandoffHtml) + '</script>\n' +
                       '    <script type="application/json" id="agLandUseData">' + JSON.stringify(agLandUseSummary(provinces)).replace(/</g, '\\u003c') + '</script>\n') +
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
      '          agLandUse: (function(){ var el = document.getElementById("agLandUseData"); try { return el ? JSON.parse(el.textContent) : null; } catch(e){ return null; } })(),\n' +
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
  // ---- Energy deposit icons ----
  // Oil, gas and coal deposits for the Energy provinces (the resource each one
  // rolled in landbio-rolls.js). Drawn as free-standing deposit markers - set
  // off-centre inside the province rather than filling it - and sized by how
  // rich the province's energy roll is. Shown with the other icon overlays.
  const EN_ROLLS = (typeof PROVINCE_LAND_BIO_ROLLS !== 'undefined') ? PROVINCE_LAND_BIO_ROLLS : null;
  const EN_OK = !!EN_ROLLS;
  const EN_DEFS = [
    { key: 'Oil',         id: 'oil',  label: 'Oil',         color: '#2b2622' },
    { key: 'Natural Gas', id: 'gas',  label: 'Natural gas', color: '#2f8fd6' },
    { key: 'Coal',        id: 'coal', label: 'Coal',        color: '#5a5a5e' },
  ];
  const EN_GLYPHS = {
    oil:  '<path d="M12 2.6C12 2.6 5.4 10.2 5.4 14.8a6.6 6.6 0 0 0 13.2 0C18.6 10.2 12 2.6 12 2.6z" fill="C" stroke="#111" stroke-width="1.3"/>' +
          '<path d="M8.8 15a3.4 3.4 0 0 0 2.6 3.2" stroke="#fff" stroke-opacity=".75" stroke-width="1.4" fill="none" stroke-linecap="round"/>',
    gas:  '<path d="M12 2.4c1 3.6 5.8 5.6 5.8 11a5.8 5.8 0 0 1-11.6 0c0-2.4 1-3.8 2.2-5 .2 1.6.9 2.6 1.9 3C10 8.2 10.6 5 12 2.4z" fill="C" stroke="#0b2a44" stroke-width="1.3" stroke-linejoin="round"/>' +
          '<path d="M12 19.6a2.6 2.6 0 0 1-2.6-2.6c0-1.6 1.4-2.4 2.6-4 1.2 1.6 2.6 2.4 2.6 4a2.6 2.6 0 0 1-2.6 2.6z" fill="#cfe9fb"/>',
    coal: '<path d="M12 2.8l7.6 4.2v8.4L12 19.6 4.4 15.4V7z" fill="C" stroke="#111" stroke-width="1.3" stroke-linejoin="round"/>' +
          '<path d="M4.4 7L12 11.2 19.6 7M12 11.2v8.4" stroke="#fff" stroke-opacity=".55" stroke-width="1" fill="none"/>',
  };
  const gEnByContinent = {};
  let enIconsBuilt = false;
  function ensureEnIcons(){
    if(enIconsBuilt || !EN_OK) return;
    enIconsBuilt = true;
    const defs = document.createElementNS(NS, 'defs');
    EN_DEFS.forEach(function(d){
      const sym = document.createElementNS(NS, 'symbol');
      sym.setAttribute('id', 'en-' + d.id);
      sym.setAttribute('viewBox', '0 0 24 24');
      sym.innerHTML = EN_GLYPHS[d.id].replace(/"C"/g, '"' + d.color + '"');
      defs.appendChild(sym);
    });
    svg.insertBefore(defs, svg.firstChild);
    CONTINENT_ORDER.forEach(function(cid){
      const gg = document.createElementNS(NS, 'g');
      gg.setAttribute('class', 'en-icons');
      gg.style.pointerEvents = 'none';
      gg.style.display = 'none';
      CONTINENT_GROUPS[cid].appendChild(gg);
      gEnByContinent[cid] = gg;
    });
    const eps = PROVINCES.filter(function(p){ return p.econ === 'Energy' && EN_ROLLS[p.label] && EN_ROLLS[p.label].resource; });
    const rolls = eps.map(function(p){ return EN_ROLLS[p.label].energyRoll; }).sort(function(a, b){ return a - b; });
    function tier(v){ const r = rolls.indexOf(v) / Math.max(1, rolls.length - 1); return r > 0.66 ? 2 : (r > 0.33 ? 1 : 0); }
    function hash(str){ let h = 2166136261; for(let i = 0; i < str.length; i++){ h = Math.imul(h ^ str.charCodeAt(i), 16777619) >>> 0; } return h; }
    eps.forEach(function(p){
      const c = centroid(p.d), bb = pathBBox(p.d);
      if(!c || !bb) return;
      const def = EN_DEFS.filter(function(d){ return d.key === EN_ROLLS[p.label].resource; })[0];
      if(!def) return;
      const h = hash(p.label + 'en');
      const jx = (((h & 255) / 255) - 0.5) * 0.5 * (bb.maxX - bb.minX);
      const jy = ((((h >>> 8) & 255) / 255) - 0.5) * 0.5 * (bb.maxY - bb.minY);
      const size = [8, 11, 14][tier(EN_ROLLS[p.label].energyRoll)];
      const u = document.createElementNS(NS, 'use');
      u.setAttribute('href', '#en-' + def.id);
      u.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', '#en-' + def.id);
      u.setAttribute('x', (c.x + jx - size / 2).toFixed(2)); u.setAttribute('y', (c.y + jy - size / 2).toFixed(2));
      u.setAttribute('width', size); u.setAttribute('height', size);
      (gEnByContinent[p.continent] || gEnByContinent[CONTINENT_ORDER[0]]).appendChild(u);
    });
  }

  // ---- Icon overlays (togglable) ----
  // Resource maps drawn as icons only. Each has its own on/off switch, shown
  // under the Economic Output tab, and sits above the map that is showing:
  //   - Metal deposits / Rare minerals & gems: transparent images (OVERLAYS in maps-config.js)
  //   - Agriculture land use: the per-province output icons (agland-data.js)
  (function(){
    // OVERLAYS lives in maps-config.js; these defaults keep the toggles working if that file is older
    const DEFAULT_OVERLAYS = [
      { id: 'metals', label: 'Metal deposits', href: 'maps/icons_metals.webp', x: 2.753, y: 28.917, width: 1912.193, height: 874.246,
        legendImg: 'maps/icons_metals-legend.png', caption: 'Precious and base metals, iron and the alloy metals. Bigger icon = bigger deposit.' },
      { id: 'rare', label: 'Rare minerals & gems', href: 'maps/icons_rare.webp', x: 2.753, y: 28.917, width: 1912.193, height: 874.246,
        legendImg: 'maps/icons_rare-legend.png', caption: 'Rare earths, gems, industrial minerals and uranium. Bigger icon = bigger deposit.' } ];
    const defs = ((typeof OVERLAYS !== 'undefined' && OVERLAYS && OVERLAYS.length) ? OVERLAYS : DEFAULT_OVERLAYS).map(function(o){ return Object.assign({ kind: 'image' }, o); });
    if(EN_OK){ defs.push({ kind: 'energy', id: 'energy', label: 'Energy deposits',
      caption: 'Oil, gas and coal deposits. Bigger icon = richer deposit.' }); }
    if(AG_OK){ defs.push({ kind: 'agland', id: 'agland', label: 'Agriculture land use',
      caption: 'Which farming and fishing outputs are viable in each province. Zoom in to see every icon.' }); }
    if(!defs.length) return;
    const gOverlays = document.createElementNS(NS, 'g');
    gOverlays.style.pointerEvents = 'none';
    svg.appendChild(gOverlays);
    const bar = document.createElement('div');
    bar.className = 'overlay-bar';
    bar.hidden = true;
    bar.innerHTML = '<span class="overlay-bar-title">Icons</span>';
    const legends = document.createElement('div');
    legends.className = 'overlay-legends';
    mapFrame.appendChild(bar);
    mapFrame.appendChild(legends);
    const items = [];
    defs.forEach(function(o){
      const it = { o: o, im: null, lg: document.createElement('div') };
      if(o.kind === 'image'){
        const im = document.createElementNS(NS, 'image');
        im.setAttribute('x', o.x); im.setAttribute('y', o.y);
        im.setAttribute('width', o.width); im.setAttribute('height', o.height);
        im.setAttribute('preserveAspectRatio', 'none');
        im.style.display = 'none';
        im.addEventListener('error', function(){
          console.warn('Icon overlay image failed to load:', o.href);
          it.btn.classList.add('overlay-missing');
          it.btn.title = 'Image not found (' + o.href + ') - upload it to the maps folder';
        });
        gOverlays.appendChild(im);
        it.im = im;
      }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'overlay-btn';
      btn.setAttribute('aria-pressed', 'false');
      btn.title = o.caption || o.label;
      btn.innerHTML = '<span class="overlay-btn-box"></span><span>' + o.label + '</span>';
      bar.appendChild(btn);
      it.btn = btn;
      it.lg.className = 'overlay-legend' + (o.kind === 'agland' ? ' overlay-legend-ag' : '');
      it.lg.hidden = true;
      if(o.kind === 'image' && o.legendImg){
        const li = document.createElement('img');
        li.alt = o.label + ' legend';
        li.src = o.legendImg;
        it.lg.appendChild(li);
      } else if(o.kind === 'energy'){
        it.lg.classList.add('overlay-legend-ag');
        EN_DEFS.forEach(function(d){
          const row = document.createElement('div');
          row.className = 'legend-row';
          row.innerHTML =
            '<svg class="legend-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><use href="#en-' + d.id + '"></use></svg>' +
            '<span class="legend-label">' + d.label + '</span>';
          it.lg.appendChild(row);
        });
        const note = document.createElement('div');
        note.className = 'legend-caption';
        note.textContent = 'Bigger icon = richer deposit';
        it.lg.appendChild(note);
      } else if(o.kind === 'agland'){
        AG_DEFS.forEach(function(d){
          const row = document.createElement('div');
          row.className = 'legend-row';
          row.innerHTML =
            '<svg class="legend-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><use href="#ag-' + d.key + '"></use></svg>' +
            '<span class="legend-label">' + d.label + '</span>';
          it.lg.appendChild(row);
        });
      }
      legends.appendChild(it.lg);
      items.push(it);
      btn.addEventListener('click', function(){
        overlayOn[o.id] = !overlayOn[o.id];
        refreshOverlays(activeLayer);
      });
    });
    // legend swatches reference the icon symbols, so define them up front
    if(EN_OK){ ensureEnIcons(); }
    if(AG_OK){ ensureAgIcons(); }
    refreshOverlays = function(layer){
      const here = !!layer && layer.group === 'economic';
      bar.hidden = !here;
      items.forEach(function(it){
        const on = !!overlayOn[it.o.id];
        it.btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        const show = on && here;
        it.lg.hidden = !show;
        if(it.im){
          if(show && !it.im.getAttribute('href')){
            it.im.setAttribute('href', it.o.href);
            it.im.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', it.o.href);
          }
          it.im.style.display = show ? '' : 'none';
        }
      });
      const enOn = !!overlayOn.energy && here;
      if(enOn){ ensureEnIcons(); }
      Object.keys(gEnByContinent).forEach(function(k){ gEnByContinent[k].style.display = enOn ? '' : 'none'; });
      const agOn = (layer && layer.type === 'agland') || (!!overlayOn.agland && here);
      if(agOn){ ensureAgIcons(); }
      Object.keys(gAgByContinent).forEach(function(k){ gAgByContinent[k].style.display = agOn ? '' : 'none'; });
    };
  })();

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
