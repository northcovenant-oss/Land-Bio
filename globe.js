/*
 * NATIONS OF RYLET — globe + flat map viewer
 * -------------------------------------------
 * Read-only companion to index.html: instead of claiming provinces, this
 * page shows who already holds what, in two projections of the exact same
 * data:
 *
 *   - "Globe": a spinnable orthographic globe, built with d3-geo (d3's
 *     geoOrthographic projection + geoPath, both pure 2D SVG math - no
 *     3D scene, no WebGL, no polygon triangulation library). Earlier
 *     versions of this page used globe.gl/three-globe for a "real" 3D
 *     sphere; that pulled in a much larger, harder-to-verify rendering
 *     pipeline (triangulating every province into an extruded 3D solid)
 *     and repeated bugs there (wrong colors, provinces missing) were
 *     never fully pinned down. d3-geo's orthographic projection is a
 *     much smaller, far more battle-tested piece of code doing the exact
 *     same "spinnable globe" job as an SVG projection instead - the same
 *     technique behind most of the globe choropleths on the web.
 *   - "Flat Map": the same province paths drawn in their native pixel
 *     space. Because that space is already equirectangular, this is
 *     literally just index.html's map with a different fill rule (by
 *     nation instead of by econ/climate) - no coordinate conversion
 *     needed at all.
 *
 * Ownership comes from window.ClaimsStore (claims.js), the same live feed
 * index.html already uses to grey out taken provinces. The richer
 * per-nation info in the info popup (classification, GDP, specializations,
 * military, etc.) comes from a second sheet - see LAND_BIO_SHEET_CSV_URL
 * below, which needs to be filled in with that sheet's own "Publish to
 * web" CSV link before that part goes live. Until then, the popup still
 * works fine with just name/capital/claimed provinces from ClaimsStore.
 */
(function(){
  const NS = 'http://www.w3.org/2000/svg';
  const WATER = (typeof WATER_COLOR !== 'undefined') ? WATER_COLOR : '#bae3ff';
  const NEUTRAL_HEX = '#9c9484'; // fixed (not theme-driven) neutral fill for unclaimed land

  // ---- DOM ----
  const mapFrame = document.getElementById('mapFrame');
  const tooltip = document.getElementById('tooltip');
  const noDataBanner = document.getElementById('noDataBanner');
  const nationLegend = document.getElementById('nationLegend');
  const globeStage = document.getElementById('globeStage');
  const globeSvg = document.getElementById('globeSvg');
  const flatStage = document.getElementById('flatStage');
  const flatSvg = document.getElementById('flatSvg');
  const nationCard = document.getElementById('nationCard');
  const panelTitle = document.getElementById('panelTitle');
  const panelHint = document.getElementById('panelHint');
  const infoPopup = document.getElementById('infoPopup');
  const popupClose = document.getElementById('popupClose');

  function showPopup(){ if (infoPopup) infoPopup.hidden = false; }
  function hidePopup(){ if (infoPopup) infoPopup.hidden = true; }
  if (popupClose){
    popupClose.addEventListener('click', function(){
      hidePopup();
      selectedNationName = null;
      applySelectionHighlight();
    });
  }

  if (mapFrame) mapFrame.style.background = WATER;

  // =========================================================================
  // 1. Geometry: parse each province's path 'd' into points, in both its
  //    native pixel space (for the flat map) and lon/lat (for the globe).
  // =========================================================================

  const [VB_X, VB_Y, VB_W, VB_H] = VIEWBOX.split(' ').map(Number);

  // Returns an ARRAY OF RINGS (one per M...Z subpath), not one flat point
  // list. Some province paths are archipelago-style - a mainland plus
  // several separate island subpaths in the same 'd' string (one province
  // has as many as 30 'M' commands). Flattening every subpath into a
  // single ring (an earlier bug here) draws a phantom straight edge from
  // the end of one island to the start of the next, producing a huge,
  // self-intersecting "bowtie" polygon spanning tens of degrees instead
  // of the province's real, small footprint. On the flat map that's
  // harmless (SVG just fills each subpath of the native 'd' independently),
  // but for the globe every subpath needs to become its own polygon ring
  // (a GeoJSON MultiPolygon), or the geometry is wrong.
  function getPathSubrings(d){
    const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?\d*\.?\d+(?:e-?\d+)?/g);
    if(!tokens) return [];
    let i=0, cmd=null, cx=0, cy=0, sx=0, sy=0;
    const rings = [];
    let pts = null;
    function num(){ return parseFloat(tokens[i++]); }
    function startRing(){ if (pts && pts.length) rings.push(pts); pts = []; }
    while(i < tokens.length){
      const t = tokens[i];
      if(/[MmLlHhVvCcSsQqTtAaZz]/.test(t)){ cmd = t; i++; }
      switch(cmd){
        case 'M': startRing(); cx=num(); cy=num(); sx=cx; sy=cy; pts.push([cx,cy]); cmd='L'; break;
        case 'm': startRing(); cx+=num(); cy+=num(); sx=cx; sy=cy; pts.push([cx,cy]); cmd='l'; break;
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
        // Explicitly close the ring on Z/z (map.js's own parser doesn't need
        // to - it only wants a centroid/bbox - but a GeoJSON polygon ring
        // must repeat its first point as its last).
        case 'Z': case 'z': cx=sx; cy=sy; pts.push([cx,cy]); break;
        default: i++;
      }
    }
    if (pts && pts.length) rings.push(pts);
    return rings;
  }

  function toLonLat(x, y){
    return [ (x / VB_W) * 360 - 180, 90 - (y / VB_H) * 180 ];
  }

  // Ramer-Douglas-Peucker line simplification. Used ONLY for the globe's
  // polygon geometry, never for the flat map (which reuses the original
  // 'd' path directly, at full detail, exactly like index.html). This
  // world's 1200 provinces have ~105,000 boundary points between them
  // (one province alone has 2849) - invisible detail at globe zoom, but
  // it all still has to be re-projected and turned into an SVG path
  // string on every drag frame. Simplifying first cuts that to ~14,500
  // points (~7x less) with no visible difference on a sphere.
  function perpDist(pt, a, b){
    const dx = b[0]-a[0], dy = b[1]-a[1];
    const len2 = dx*dx + dy*dy;
    if (len2 === 0) return Math.hypot(pt[0]-a[0], pt[1]-a[1]);
    let t = ((pt[0]-a[0])*dx + (pt[1]-a[1])*dy) / len2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(pt[0] - (a[0]+t*dx), pt[1] - (a[1]+t*dy));
  }
  function simplifyRing(points, eps){
    if (points.length < 4) return points.slice();
    function rdp(pts){
      if (pts.length < 3) return pts;
      let maxD = 0, idx = 0;
      for (let i = 1; i < pts.length - 1; i++){
        const d = perpDist(pts[i], pts[0], pts[pts.length-1]);
        if (d > maxD){ maxD = d; idx = i; }
      }
      if (maxD > eps){
        const left = rdp(pts.slice(0, idx+1));
        const right = rdp(pts.slice(idx));
        return left.slice(0, -1).concat(right);
      }
      return [pts[0], pts[pts.length-1]];
    }
    const simplified = rdp(points);
    return simplified.length >= 3 ? simplified : points;
  }

  // A ring is only usable as a GeoJSON polygon ring if it has at least 4
  // points (3 distinct corners + the closing repeat) and every coordinate
  // is a finite number.
  function isUsableRing(ring){
    if (!ring || ring.length < 4) return false;
    for (let i = 0; i < ring.length; i++){
      const pt = ring[i];
      if (!pt || !Number.isFinite(pt[0]) || !Number.isFinite(pt[1])) return false;
    }
    return true;
  }
  // In lon/lat degrees. Tuned against the real data: cuts ~105k points to
  // ~14.5k (avg ~12/province, worst case ~140) while keeping province
  // shapes clearly recognizable at any globe zoom level.
  const GLOBE_SIMPLIFY_TOLERANCE = 0.2;

  // Base geometry, independent of who's claimed what - built once.
  // "rings" holds one ring per subpath in the source 'd' (almost always
  // just one; archipelago-style provinces have several). "globeRings" is
  // the same, each independently simplified for the globe and filtered
  // down to only the rings that are actually usable polygon geometry.
  const baseProvinces = PROVINCES.map(function(p){
    const subpaths = getPathSubrings(p.d);
    const rings = subpaths.map(function(pts){
      return pts.map(function(pt){ return toLonLat(pt[0], pt[1]); });
    });
    const globeRings = rings
      .map(function(ring){ return simplifyRing(ring, GLOBE_SIMPLIFY_TOLERANCE); })
      .filter(isUsableRing);
    return {
      id: p.id,
      label: p.label,
      econ: p.econ,
      climate: p.climate ? (p.climate.display || p.climate.dominant) : null,
      d: p.d,
      continent: p.continent,
      rings: rings,
      globeRings: globeRings,
    };
  });
  const baseById = {};
  baseProvinces.forEach(function(p){ baseById[p.id] = p; });

  // =========================================================================
  // 2. Ownership + nation color assignment (golden-angle hue spacing, so
  //    N nations always look visually distinct regardless of naming).
  // =========================================================================

  const GOLDEN_ANGLE = 137.508;
  function colorForIndex(i){
    const hue = (i * GOLDEN_ANGLE) % 360;
    return 'hsl(' + hue.toFixed(1) + ', 60%, 45%)';
  }

  // Unclaimed land gets a subtle per-continent tint (same hue-spacing
  // trick, just muted) rather than one flat neutral color everywhere, so
  // continents read as distinct landmasses even where nobody's claimed
  // anything yet. Claimed provinces always use their nation's full-color
  // instead of this.
  //
  // Offset the starting hue away from 0: with the golden-angle spacing
  // alone, the very first continent in CONTINENTS always lands on hue 0,
  // which at this low saturation/high lightness renders as a visibly pink
  // tone rather than a neutral one.
  const CONTINENT_HUE_OFFSET = 200;
  const continentTint = {};
  (typeof CONTINENTS !== 'undefined' ? CONTINENTS : []).forEach(function(c, i){
    continentTint[c.id] = 'hsl(' + ((CONTINENT_HUE_OFFSET + i * GOLDEN_ANGLE) % 360).toFixed(1) + ', 22%, 68%)';
  });
  function tintForContinent(continentId){
    return continentTint[continentId] || NEUTRAL_HEX;
  }

  let takenIndex = {};       // provinceLabel(upper) -> claim record
  let claimsByName = {};     // nationName -> claim record
  let nationColor = {};      // nationName -> color string
  let landBioByName = {};    // NATIONNAME(upper) -> sheet row, once loaded
  let landBioConfigured = false;
  let landBioError = null;
  let features = [];         // colored per-province info, rebuilt once claims resolve

  function buildFeatures(){
    features = baseProvinces.map(function(p){
      const claim = takenIndex[p.label.toUpperCase()] || null;
      const nationName = claim ? claim.name : null;
      const color = nationName ? (nationColor[nationName] || NEUTRAL_HEX) : tintForContinent(p.continent);
      const isCapital = !!(claim && claim.capital && claim.capital.toUpperCase() === p.label.toUpperCase());
      // Multiple usable rings (an archipelago-style province) -> a real
      // GeoJSON MultiPolygon, one polygon per island/subpath, for the
      // globe. A province with no usable ring at all (vanishingly rare -
      // every subpath in its source data would have to be degenerate)
      // gets geometry: null and is simply skipped when the globe is
      // built; the flat map is unaffected either way, since it always
      // draws straight from the native 'd' path regardless of this.
      const geometry = !p.globeRings.length ? null
        : p.globeRings.length > 1
          ? { type: 'MultiPolygon', coordinates: p.globeRings.map(function(r){ return [r]; }) }
          : { type: 'Polygon', coordinates: [ p.globeRings[0] ] };
      return {
        id: p.id, label: p.label, econ: p.econ, climate: p.climate,
        nationName: nationName, isCapital: isCapital, color: color,
        geometry: geometry,
      };
    });
  }

  // =========================================================================
  // 3. Land Bio Data sheet (richer per-nation fields for the info panel)
  // =========================================================================

  // TODO: fill this in with the "Rylet Land Bio Data" sheet's own tab
  // (the one row-per-nation tab with Timestamp/Nation/Classification/...)
  // "Publish to web" CSV link - File > Share > Publish to web > select
  // that tab > CSV. Same requirement as CLAIMS_SHEET_CSV_URL in claims.js:
  // the plain /export?format=csv route is unreliable (CORS) once actually
  // deployed, so use the published-CSV feed instead. Left blank, the
  // nation panel still works - it just skips the Overview/Specializations/
  // Military sections and shows claim data only.
  const LAND_BIO_SHEET_CSV_URL = '';

  function parseCsvLine(line){
    const result = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++){
      const c = line[i];
      if (inQuotes){
        if (c === '"'){
          if (line[i+1] === '"'){ cur += '"'; i++; }
          else { inQuotes = false; }
        } else { cur += c; }
      } else {
        if (c === '"') inQuotes = true;
        else if (c === ',') { result.push(cur); cur = ''; }
        else cur += c;
      }
    }
    result.push(cur);
    return result;
  }

  function normalizeHeader(s){
    return String(s || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  // Matched by normalized header name rather than column index, so this
  // survives the sheet's columns being reordered or having fields inserted
  // - the exact bug class documented in claims.js (Claim Code's row shifting
  // when Classification/Capital/Government Type were added ahead of it).
  const FIELD_ALIASES = {
    nation: ['nation'],
    classification: ['classification'],
    capital: ['capital'],
    governmentType: ['governmenttype'],
    economy: ['landbioeconomy', 'economy', 'economytype'],
    gdp: ['gdp', 'totalgdp'],
    foodProduction: ['foodproduction'],
    energyProduction: ['energyproduction'],
    population: ['population'],
    spec1: ['1stspecialization'],
    spec2: ['2ndspecialization'],
    spec3: ['3rdspecialization'],
    spec4: ['4thspecialization'],
    spec5: ['5thspecialization'],
    militaryPriority: ['militarypriority'],
    nationalStance: ['nationalstance'],
    navy: ['navy'],
    army: ['army'],
    airforce: ['airforce'],
    expeditionary: ['expeditionaryforces'],
    paramilitary: ['paramilitarymilitiagendarmes'],
  };

  function buildHeaderIndex(headerRow){
    const normalized = headerRow.map(normalizeHeader);
    const index = {};
    Object.keys(FIELD_ALIASES).forEach(function(key){
      const aliases = FIELD_ALIASES[key];
      for (let i = 0; i < normalized.length; i++){
        if (aliases.indexOf(normalized[i]) !== -1){ index[key] = i; break; }
      }
    });
    return index;
  }

  function fetchLandBioSheet(){
    if (!LAND_BIO_SHEET_CSV_URL){
      return Promise.resolve({ rows: {}, configured: false, error: null });
    }
    return fetch(LAND_BIO_SHEET_CSV_URL, { cache: 'no-store' })
      .then(function(res){ if(!res.ok) throw new Error('HTTP ' + res.status); return res.text(); })
      .then(function(csvText){
        const rows = csvText.split(/\r?\n/).map(parseCsvLine).filter(function(r){ return r.length > 1; });
        if (rows.length < 2){
          console.warn('[Map] Land Bio Data sheet loaded but had no data rows.');
          return { rows: {}, configured: true, error: null };
        }
        const idx = buildHeaderIndex(rows[0]);
        const byNation = {};
        for (let r = 1; r < rows.length; r++){
          const row = rows[r];
          function get(key){ return idx[key] !== undefined ? (row[idx[key]] || '').trim() : ''; }
          const nationName = get('nation');
          if (!nationName) continue;
          byNation[nationName.toUpperCase()] = {
            nation: nationName,
            classification: get('classification'),
            capital: get('capital'),
            governmentType: get('governmentType'),
            economy: get('economy'),
            gdp: get('gdp'),
            foodProduction: get('foodProduction'),
            energyProduction: get('energyProduction'),
            population: get('population'),
            specializations: [get('spec1'), get('spec2'), get('spec3'), get('spec4'), get('spec5')].filter(Boolean),
            militaryPriority: get('militaryPriority'),
            nationalStance: get('nationalStance'),
            navy: get('navy'), army: get('army'), airforce: get('airforce'),
            expeditionary: get('expeditionary'), paramilitary: get('paramilitary'),
          };
        }
        console.log('[Map] Loaded land bio data for ' + Object.keys(byNation).length + ' nation(s).');
        return { rows: byNation, configured: true, error: null };
      })
      .catch(function(e){
        console.warn('[Map] Could not load the Land Bio Data sheet:', e.message);
        return { rows: {}, configured: true, error: e.message };
      });
  }

  // =========================================================================
  // 4. Nation info panel
  // =========================================================================

  function escapeHtml(str){
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function fieldRow(label, value){
    if (!value) return '';
    return '<p class="nc-field"><span class="nc-field-label">' + escapeHtml(label) + ':</span> ' +
      '<span class="nc-field-value">' + escapeHtml(value) + '</span></p>';
  }

  function renderUnclaimedPanel(p){
    panelTitle.textContent = p.label;
    panelHint.textContent = 'This province has not been claimed by a nation yet.';
    let html = '<div class="nc-unclaimed">';
    html += 'Unclaimed territory.';
    if (p.econ) html += '<br>Economic output: ' + escapeHtml(p.econ);
    if (p.climate) html += '<br>Climate: ' + escapeHtml(p.climate);
    html += '</div>';
    nationCard.innerHTML = html;
    showPopup();
  }

  function renderNationPanel(nationName){
    const claim = claimsByName[nationName];
    const sheet = landBioByName[nationName.toUpperCase()];
    panelTitle.textContent = nationName;
    panelHint.textContent = 'Territory and land bio data for this nation.';

    const provinces = (claim && claim.provinces) || [];
    const capital = claim && claim.capital;

    let html = '<h3 class="nc-name">' + escapeHtml(nationName) + '</h3>';
    html += '<div class="nc-sub">' + provinces.length + ' province' + (provinces.length === 1 ? '' : 's') +
      ' claimed' + (capital ? ' &middot; Capital: ' + escapeHtml(capital) : '') + '</div>';

    if (sheet){
      html += '<div class="nc-section">Overview</div>';
      html += fieldRow('Classification', sheet.classification);
      html += fieldRow('Government Type', sheet.governmentType);
      html += fieldRow('Economy Type', sheet.economy);
      html += fieldRow('Total GDP', sheet.gdp);
      html += fieldRow('Population', sheet.population);
      html += fieldRow('Food Production', sheet.foodProduction);
      html += fieldRow('Energy Production', sheet.energyProduction);

      if (sheet.specializations && sheet.specializations.length){
        html += '<div class="nc-section">Specializations</div>';
        html += '<div class="nc-provinces">' + sheet.specializations.map(function(s){
          return '<span class="nc-province-chip">' + escapeHtml(s) + '</span>';
        }).join('') + '</div>';
      }

      const hasMilitary = sheet.militaryPriority || sheet.nationalStance || sheet.navy || sheet.army || sheet.airforce || sheet.expeditionary || sheet.paramilitary;
      if (hasMilitary){
        html += '<div class="nc-section">Military</div>';
        html += fieldRow('Priority', sheet.militaryPriority);
        html += fieldRow('National Stance', sheet.nationalStance);
        html += fieldRow('Navy', sheet.navy);
        html += fieldRow('Army', sheet.army);
        html += fieldRow('Airforce', sheet.airforce);
        html += fieldRow('Expeditionary Forces', sheet.expeditionary);
        html += fieldRow('Paramilitary / Militia / Gendarmes', sheet.paramilitary);
      }
    } else if (landBioConfigured) {
      html += '<div class="nc-sheet-missing">No land bio data sheet entry found for this nation yet.</div>';
    } else {
      html += '<div class="nc-sheet-missing">This site’s Land Bio Data sheet isn’t connected yet, so only claim/territory info is shown here.</div>';
    }

    if (provinces.length){
      html += '<div class="nc-section">Territory</div>';
      html += '<div class="nc-provinces">' + provinces.map(function(label){
        const isCap = capital && capital.toUpperCase() === label.toUpperCase();
        return '<span class="nc-province-chip' + (isCap ? ' capital' : '') + '">' + escapeHtml(label) + (isCap ? ' ★' : '') + '</span>';
      }).join('') + '</div>';
    }

    nationCard.innerHTML = html;
    showPopup();
  }

  let selectedNationName = null;

  function selectProvince(props){
    if (props.nationName){
      selectedNationName = props.nationName;
      renderNationPanel(props.nationName);
    } else {
      selectedNationName = null;
      renderUnclaimedPanel(baseById[props.id] || props);
    }
    applySelectionHighlight();
  }

  function applySelectionHighlight(){
    // Cheap either way - just a CSS class swap on existing elements, no
    // geometry work - so both views can be kept in sync on every
    // selection instead of only the currently-visible one.
    Array.from(flatSvg.querySelectorAll('.nation-province')).forEach(function(el){
      el.classList.toggle('picked', !!selectedNationName && el.dataset.nation === selectedNationName);
    });
    Array.from(globeSvg.querySelectorAll('.nation-province')).forEach(function(el){
      el.classList.toggle('picked', !!selectedNationName && el.dataset.nation === selectedNationName);
    });
  }

  // =========================================================================
  // 5. Nation legend
  // =========================================================================

  function buildNationLegend(){
    const names = Object.keys(claimsByName).sort();
    nationLegend.innerHTML = '';
    if (!names.length){
      nationLegend.classList.remove('show');
      return;
    }
    names.forEach(function(name){
      const row = document.createElement('div');
      row.className = 'legend-row';
      row.innerHTML = '<span class="legend-swatch" style="background:' + nationColor[name] + '"></span>' +
        '<span class="legend-label">' + escapeHtml(name) + '</span>';
      row.style.cursor = 'pointer';
      row.addEventListener('click', function(){ selectedNationName = name; renderNationPanel(name); applySelectionHighlight(); });
      nationLegend.appendChild(row);
    });
    nationLegend.classList.add('show');
  }

  function showMapTooltip(e, props){
    const rect = mapFrame.getBoundingClientRect();
    const sub = props.nationName ? ('Claimed by ' + props.nationName) : 'Unclaimed';
    tooltip.innerHTML = escapeHtml(props.label) + '<div class="sub">' + escapeHtml(sub) + '</div>';
    tooltip.style.left = (e.clientX - rect.left) + 'px';
    tooltip.style.top = (e.clientY - rect.top) + 'px';
    tooltip.classList.add('show');
  }
  function hideTooltip(){ tooltip.classList.remove('show'); }

  // =========================================================================
  // 6. Flat map renderer (native pixel space = already equirectangular)
  // =========================================================================

  const LAKE_LIST = (typeof LAKES !== 'undefined') ? LAKES : [];
  const ISLAND_LIST = (typeof EXTRA_ISLANDS !== 'undefined') ? EXTRA_ISLANDS : [];

  function buildFlatMap(){
    flatSvg.setAttribute('viewBox', VIEWBOX);
    flatSvg.innerHTML = '';

    const gIslands = document.createElementNS(NS, 'g');
    ISLAND_LIST.forEach(function(isl){
      const el = document.createElementNS(NS, 'path');
      el.setAttribute('d', isl.d);
      if (isl.transform) el.setAttribute('transform', isl.transform);
      el.setAttribute('fill', tintForContinent(isl.continent));
      el.style.pointerEvents = 'none';
      el.style.opacity = '0.85';
      gIslands.appendChild(el);
    });
    flatSvg.appendChild(gIslands);

    const gProvinces = document.createElementNS(NS, 'g');
    features.forEach(function(props){
      const base = baseById[props.id];
      const el = document.createElementNS(NS, 'path');
      el.setAttribute('d', base.d);
      el.setAttribute('class', 'nation-province');
      el.setAttribute('fill', props.color);
      el.dataset.id = props.id;
      el.dataset.nation = props.nationName || '';
      el.addEventListener('click', function(){ selectProvince(props); });
      el.addEventListener('mousemove', function(e){ showMapTooltip(e, props); });
      el.addEventListener('mouseleave', hideTooltip);
      gProvinces.appendChild(el);
    });
    flatSvg.appendChild(gProvinces);

    const gLakes = document.createElementNS(NS, 'g');
    LAKE_LIST.forEach(function(l){
      const el = document.createElementNS(NS, 'path');
      el.setAttribute('d', l.d);
      el.style.fill = WATER;
      el.style.pointerEvents = 'none';
      gLakes.appendChild(el);
    });
    flatSvg.appendChild(gLakes);
  }

  // ---- Flat map zoom & pan (same pattern as map.js) ----
  const BASE_VB = VIEWBOX.split(' ').map(Number);
  let vb = BASE_VB.slice();
  const MIN_SCALE = 0.35, MAX_SCALE = 60;

  function applyViewBox(){ flatSvg.setAttribute('viewBox', vb.join(' ')); }

  function zoomAt(clientX, clientY, factor){
    const rect = flatStage.getBoundingClientRect();
    const px = (clientX - rect.left) / rect.width;
    const py = (clientY - rect.top) / rect.height;
    const mx = vb[0] + px * vb[2];
    const my = vb[1] + py * vb[3];
    let newW = vb[2] * factor, newH = vb[3] * factor;
    const maxW = BASE_VB[2] / MIN_SCALE, minW = BASE_VB[2] / MAX_SCALE;
    newW = Math.max(minW, Math.min(newW, maxW));
    newH = Math.max(BASE_VB[3] / MAX_SCALE, Math.min(newH, BASE_VB[3] / MIN_SCALE));
    vb[0] = mx - px * newW; vb[1] = my - py * newH; vb[2] = newW; vb[3] = newH;
    applyViewBox();
  }
  function resetView(){ vb = BASE_VB.slice(); applyViewBox(); }

  flatStage.addEventListener('wheel', function(e){
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, e.deltaY > 0 ? 1.15 : 1/1.15);
  }, { passive: false });

  let dragging = false, dragMoved = false, lastX = 0, lastY = 0;
  flatSvg.addEventListener('mousedown', function(e){ dragging = true; dragMoved = false; lastX = e.clientX; lastY = e.clientY; flatSvg.classList.add('panning'); });
  window.addEventListener('mousemove', function(e){
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragMoved = true;
    if (!dragMoved) return;
    const rect = flatStage.getBoundingClientRect();
    vb[0] -= dx * (vb[2] / rect.width); vb[1] -= dy * (vb[3] / rect.height);
    lastX = e.clientX; lastY = e.clientY;
    applyViewBox(); hideTooltip();
  });
  window.addEventListener('mouseup', function(){ dragging = false; flatSvg.classList.remove('panning'); });
  flatSvg.addEventListener('click', function(e){ if (dragMoved){ e.stopPropagation(); e.preventDefault(); } }, true);

  const zoomInBtn = document.getElementById('zoomIn');
  const zoomOutBtn = document.getElementById('zoomOut');
  const zoomResetBtn = document.getElementById('zoomReset');
  if (zoomInBtn) zoomInBtn.addEventListener('click', function(){ const r = flatStage.getBoundingClientRect(); zoomAt(r.left+r.width/2, r.top+r.height/2, 0.65); });
  if (zoomOutBtn) zoomOutBtn.addEventListener('click', function(){ const r = flatStage.getBoundingClientRect(); zoomAt(r.left+r.width/2, r.top+r.height/2, 1/0.65); });
  if (zoomResetBtn) zoomResetBtn.addEventListener('click', resetView);

  // =========================================================================
  // 7. Globe renderer (d3-geo orthographic projection)
  //
  // This is plain 2D SVG: d3.geoOrthographic() projects each lon/lat point
  // onto a circle the way a photo of a real globe would look, d3.geoPath()
  // turns a GeoJSON geometry into an SVG path string (correctly clipping
  // anything on the far side of the sphere - that clipping is exactly
  // what d3-geo is for and it's extremely well-tested), and dragging just
  // changes the projection's .rotate() before re-computing those path
  // strings. No 3D scene, no triangulation, no library that has to build
  // an extruded solid mesh per province - which is what made the earlier
  // three.js-based globe both slow and prone to silent rendering bugs.
  // =========================================================================

  const GLOBE_VB_SIZE = 800; // internal SVG coordinate space; scales via viewBox+CSS
  let globeBuilt = false;
  let globeReady = false; // false if d3 failed to load or init threw
  let projection = null;
  let pathGen = null;
  let baseGlobeScale = GLOBE_VB_SIZE * 0.46;
  let globeFeatures = []; // features that actually have usable geometry
  const globeEls = {}; // id -> <path> element, kept across renders

  function averageLonLat(){
    let sLon = 0, sLat = 0, n = 0;
    baseProvinces.forEach(function(p){
      p.rings.forEach(function(ring){
        ring.forEach(function(pt){ sLon += pt[0]; sLat += pt[1]; n++; });
      });
    });
    return n ? { lon: sLon/n, lat: sLat/n } : { lon: 0, lat: 0 };
  }

  let renderScheduled = false;
  function scheduleGlobeRender(){
    if (renderScheduled) return;
    renderScheduled = true;
    requestAnimationFrame(function(){
      renderScheduled = false;
      renderGlobe();
    });
  }

  function renderGlobe(){
    if (!globeReady) return;
    try {
      globeSphereEl.setAttribute('d', pathGen({ type: 'Sphere' }) || '');
      globeGraticuleEl.setAttribute('d', pathGen(d3.geoGraticule()()) || '');
      globeFeatures.forEach(function(f){
        const el = globeEls[f.id];
        if (!el) return;
        el.setAttribute('d', pathGen(f.geometry) || '');
      });
    } catch (e){
      handleGlobeFailure(e);
    }
  }

  let globeSphereEl, globeGraticuleEl, globeProvincesGroup;

  // Separate from globeReady on purpose: globeReady starts out false and
  // ONLY ever becomes true after a successful build, so a guard of
  // "if (!globeReady) return" here would silently swallow every failure
  // that happens before the globe ever finishes initializing (which is
  // exactly when this fires: d3 missing, or an error partway through
  // buildGlobeView) - no console warning, no fallback, no banner, just a
  // permanently blank globe stage. This flag tracks "have we already
  // reported a failure" instead, independent of whether init ever
  // succeeded.
  let globeFailureHandled = false;

  function handleGlobeFailure(e){
    if (globeFailureHandled) return; // already reported once, don't spam
    globeFailureHandled = true;
    globeReady = false;
    console.warn('[Map] Globe rendering failed, switching to the flat map:', e && e.message);
    showFlatView();
    noDataBanner.textContent = 'The globe view hit a rendering error and has been switched to the flat map instead. Error: ' +
      (e && e.message ? e.message : 'unknown error');
    noDataBanner.classList.add('show');
  }

  function buildGlobeView(){
    if (globeBuilt) return;
    globeBuilt = true;

    if (typeof d3 === 'undefined' || !d3.geoOrthographic){
      handleGlobeFailure(new Error('d3-geo did not load (check your connection / ad blocker)'));
      return;
    }

    try {
      globeSvg.setAttribute('viewBox', '0 0 ' + GLOBE_VB_SIZE + ' ' + GLOBE_VB_SIZE);
      globeSvg.innerHTML = '';

      const avg = averageLonLat();
      projection = d3.geoOrthographic()
        .scale(baseGlobeScale)
        .translate([GLOBE_VB_SIZE / 2, GLOBE_VB_SIZE / 2])
        .rotate([-avg.lon, -avg.lat])
        .clipAngle(90)
        .precision(0.3);
      pathGen = d3.geoPath(projection);

      globeSphereEl = document.createElementNS(NS, 'path');
      globeSphereEl.setAttribute('class', 'globe-sphere');
      globeSphereEl.setAttribute('fill', WATER); // ocean color, same as the flat map's background
      globeSvg.appendChild(globeSphereEl);

      globeGraticuleEl = document.createElementNS(NS, 'path');
      globeGraticuleEl.setAttribute('class', 'globe-graticule');
      globeSvg.appendChild(globeGraticuleEl);

      globeProvincesGroup = document.createElementNS(NS, 'g');
      globeFeatures = features.filter(function(f){ return !!f.geometry; });
      globeFeatures.forEach(function(f){
        const el = document.createElementNS(NS, 'path');
        el.setAttribute('class', 'nation-province');
        el.setAttribute('fill', f.color);
        el.dataset.id = f.id;
        el.dataset.nation = f.nationName || '';
        el.addEventListener('click', function(){ if (!globeDragMoved) selectProvince(f); });
        el.addEventListener('mousemove', function(e){ showMapTooltip(e, f); });
        el.addEventListener('mouseleave', hideTooltip);
        globeEls[f.id] = el;
        globeProvincesGroup.appendChild(el);
      });
      globeSvg.appendChild(globeProvincesGroup);

      globeReady = true;
      renderGlobe();
    } catch (e){
      handleGlobeFailure(e);
    }
  }

  // ---- Globe drag-to-rotate & scroll-to-zoom ----
  let globeDragging = false, globeDragMoved = false, globeLastX = 0, globeLastY = 0;
  const ROTATE_SENSITIVITY = 75; // matches the common d3 orthographic-drag convention

  globeStage.addEventListener('mousedown', function(e){
    if (!globeReady) return;
    globeDragging = true; globeDragMoved = false;
    globeLastX = e.clientX; globeLastY = e.clientY;
    globeStage.classList.add('dragging');
  });
  window.addEventListener('mousemove', function(e){
    if (!globeDragging || !globeReady) return;
    const dx = e.clientX - globeLastX, dy = e.clientY - globeLastY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) globeDragMoved = true;
    if (!globeDragMoved) return;
    const k = ROTATE_SENSITIVITY / projection.scale();
    const r = projection.rotate();
    let nextPhi = r[1] - dy * k;
    nextPhi = Math.max(-90, Math.min(90, nextPhi));
    projection.rotate([r[0] + dx * k, nextPhi]);
    globeLastX = e.clientX; globeLastY = e.clientY;
    hideTooltip();
    scheduleGlobeRender();
  });
  window.addEventListener('mouseup', function(){
    globeDragging = false;
    globeStage.classList.remove('dragging');
  });

  globeStage.addEventListener('wheel', function(e){
    if (!globeReady) return;
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1/1.15 : 1.15;
    const next = Math.max(baseGlobeScale * 0.5, Math.min(baseGlobeScale * 5, projection.scale() * factor));
    projection.scale(next);
    scheduleGlobeRender();
  }, { passive: false });

  if (typeof ResizeObserver !== 'undefined'){
    // The globe's own SVG scales purely via viewBox + CSS, so no JS
    // resize handling is needed for it - only the flat map's zoom/pan
    // math cares about the container's pixel size, and that's already
    // read fresh on every zoom/pan interaction.
  }

  // =========================================================================
  // 8. Projection toggle
  // =========================================================================

  const projGlobeBtn = document.getElementById('projGlobeBtn');
  const projFlatBtn = document.getElementById('projFlatBtn');
  let globeHasFailedOnce = false;

  function showGlobeView(){
    if (globeHasFailedOnce){ showFlatView(); return; }
    globeStage.hidden = false;
    flatStage.hidden = true;
    projGlobeBtn.classList.add('active');
    projFlatBtn.classList.remove('active');
    buildGlobeView();
    if (!globeReady) globeHasFailedOnce = true;
  }
  function showFlatView(){
    globeStage.hidden = true;
    flatStage.hidden = false;
    projFlatBtn.classList.add('active');
    projGlobeBtn.classList.remove('active');
  }
  projGlobeBtn.addEventListener('click', showGlobeView);
  projFlatBtn.addEventListener('click', showFlatView);

  // =========================================================================
  // 9. Boot: load ownership + land bio data, then render both views
  // =========================================================================

  const claimsPromise = (window.ClaimsStore ? window.ClaimsStore.loadClaims() : Promise.resolve([]))
    .catch(function(e){ console.warn('[Map] Claims lookup failed:', e.message); return []; });

  Promise.all([claimsPromise, fetchLandBioSheet()]).then(function(results){
    const claims = results[0];
    const landBio = results[1];

    takenIndex = window.ClaimsStore ? window.ClaimsStore.buildProvinceIndex(claims) : {};
    claimsByName = {};
    claims.forEach(function(c){ claimsByName[c.name] = c; });

    const sortedNames = Object.keys(claimsByName).sort();
    nationColor = {};
    sortedNames.forEach(function(name, i){ nationColor[name] = colorForIndex(i); });

    landBioByName = landBio.rows;
    landBioConfigured = landBio.configured;
    landBioError = landBio.error;

    buildFeatures();
    buildFlatMap();
    buildNationLegend();

    if (!claims.length){
      noDataBanner.textContent = 'No claims found yet - every province is shown as unclaimed.';
      noDataBanner.classList.add('show');
    } else if (landBioError) {
      noDataBanner.textContent = 'Claims loaded, but the Land Bio Data sheet could not be reached - nation panels show territory only.';
      noDataBanner.classList.add('show');
    }

    // Default view is the flat map - it has no third-party rendering
    // dependency at all, so it's the safe first thing to show; the globe
    // is one click away via the toggle above.
    showFlatView();
  });

  applyViewBox();
})();
