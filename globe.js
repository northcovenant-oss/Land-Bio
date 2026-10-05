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

  // ---- Appearance theme awareness ----
  // theme.js puts a 'theme-<name>' class on <body> (no class at all means
  // Parchment, the default). Read straight from that instead of keeping a
  // second copy of "which theme is active" in this file.
  function currentThemeName(){
    const cl = document.body.classList;
    if (cl.contains('theme-modern')) return 'modern';
    if (cl.contains('theme-relief')) return 'relief';
    if (cl.contains('theme-dark')) return 'dark';
    return 'parchment';
  }

  // Ocean/lake fill: read straight from the theme's own --water custom
  // property (style.css) instead of a fixed constant, so switching themes
  // recolors the water immediately, everywhere it's used, without this
  // file needing to know each theme's color itself.
  // A single-ink, monochrome-sepia look: water and unclaimed land both
  // brown, distinguished only by tone (land a shade darker/richer, water a
  // lighter wash) the way a hand-tinted or single-color-ink antique chart
  // reads - not two different hues.
  const PARCHMENT_LAND_BROWN = '#b89a6e';
  const PARCHMENT_WATER_BROWN = '#c9b58a';
  // Relief's claim border: a neutral warm grey rather than a per-nation
  // color, so ownership reads as "outlined territory over the terrain"
  // consistently across every nation - the fill (a translucent wash of
  // the nation's own palette color, see THEME_NATION_PALETTES.relief
  // above) is what carries the per-nation distinction instead.
  const RELIEF_BORDER_GREY = '#4a4a42';
  const RELIEF_CLAIM_FILL_OPACITY = '0.5';

  function currentWaterColor(){
    const theme = currentThemeName();
    if (theme === 'parchment') return PARCHMENT_WATER_BROWN;
    // Relief keeps the original map's fixed ocean/lake color (the same
    // WATER every other page on the site uses - see map.js's own copy of
    // this constant) rather than pulling from --water. Relief's theme
    // block in style.css deliberately copies Modern's chrome variables
    // wholesale (buttons, panels, accent color - see that block's own
    // comment), which includes --water; left unhandled here, that made
    // Relief's flat map ocean render in the exact same blue as Modern's,
    // so its flat map read as just Modern under a different name instead
    // of its own look. Only Modern (whose whole point is "blue water,
    // white continents") and Dark Mode (whose --water is deliberately a
    // darker, near-black-compatible tone, not a copy of anything)
    // actually need their own --water value here.
    if (theme === 'modern' || theme === 'dark'){
      try {
        const v = getComputedStyle(document.body).getPropertyValue('--water').trim();
        if (v) return v;
      } catch (e){ /* getComputedStyle unavailable - fall through to the fixed default */ }
    }
    return WATER;
  }

  // Modern is the only theme with real per-nation data behind it (the Land
  // Bio Data sheet's own "color" column, once configured - see
  // FIELD_ALIASES/fetchLandBioSheet below), so it keeps the old
  // infinite-hue golden-angle scheme as a fallback for any nation that
  // hasn't set one. The other three themes have no such data source, so
  // instead of an unbounded rainbow they each cycle through a small, fixed
  // set of colors hand-picked to sit well on that theme's own palette.
  const THEME_NATION_PALETTES = {
    // All-sepia set: four shades of brown (dark chestnut, ochre/mustard,
    // near-black espresso, caramel), spread across lightness/saturation
    // rather than hue so nations still read apart from each other and
    // from the lighter land/water browns around them, without breaking
    // the single-ink antique-chart look.
    parchment: ['#5c3620', '#8a6a2e', '#3f2e22', '#a5763f'],
    // Muted, not-too-harsh set - these now fill each claim as a
    // semi-transparent wash over the terrain (see RELIEF_BORDER_GREY and
    // buildFlatReliefContent/buildGlobeReliefLayer below), not a bare
    // outline, so a fully saturated color would fight the terrain under
    // it. Softened rose/slate/ochre/mauve read clearly apart from each
    // other and from the green/brown terrain without shouting.
    relief: ['#b5675a', '#5b7fa6', '#c2954f', '#8a6a9e'],
    // Four shades of gold, spread across lightness/saturation the same way
    // Parchment's all-sepia set is - bronze, antique gold, bright gold,
    // pale champagne - so neighboring nations still read apart from each
    // other against the black ocean/continent interior, without breaking
    // the single-metal "gold on black" look Dark Mode is going for.
    dark: ['#8a6a1e', '#c9a54a', '#e6c169', '#f0dfa0'],
  };

  // ---- DOM ----
  const mapFrame = document.getElementById('mapFrame');
  const tooltip = document.getElementById('tooltip');
  const noDataBanner = document.getElementById('noDataBanner');
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

  // Best-effort initial paint - theme.js (which sets the theme class on
  // <body>) hasn't run yet at this point (it's the next <script> tag after
  // this file), so currentWaterColor() can't read the real saved theme
  // here. Boot's Promise.all handler and repaintOwnershipColors() below
  // both repaint this correctly once the theme class (and, for boot, the
  // actual data) is in place.
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

  // Capital-marker placement: a crude "average every point in the ring"
  // centroid (same approximation map.js's own centroid() already uses for
  // claim-seal placement) is good enough for parking a marker somewhere
  // inside a province, without pulling in real polygon-centroid math. Used
  // on both the province's pixel-space ring (flat map marker) and its
  // lon/lat ring (globe marker, reprojected every frame - see
  // updateCapitalMarker()/renderGlobe()). For an archipelago-style
  // province, picking the ring with the most points (a rough proxy for
  // "the mainland, not a tiny offshore islet") keeps the marker off of a
  // stray speck.
  function largestRing(rings){
    let best = null;
    (rings || []).forEach(function(r){ if (r && (!best || r.length > best.length)) best = r; });
    return best;
  }
  function ringCentroid(ring){
    if (!ring || !ring.length) return null;
    let sx = 0, sy = 0;
    ring.forEach(function(pt){ sx += pt[0]; sy += pt[1]; });
    return [sx / ring.length, sy / ring.length];
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
  // d3-geo's spherical polygons are NOT winding-agnostic the way flat SVG
  // fills are: a ring has to be wound counter-clockwise (as seen from
  // outside the sphere) for d3-geo to treat its INSIDE as the small
  // intended area; wound the other way, it treats the polygon's interior
  // as "the entire rest of the sphere except this shape" instead.
  // Converting from SVG's y-down pixel space to lon/lat's y-up
  // (north-is-positive-lat) space flips the effective winding of every
  // ring, and confirmed against the real d3-geo library, this data's
  // original winding came out backwards for the globe as a result: every
  // ring reported d3.geoArea() of ~4*PI steradians (the whole sphere)
  // instead of the small fraction a several-degree-wide province should
  // have.
  //
  // A single blanket reversal fixes most provinces, but not all of them:
  // archipelago-style provinces have several independent subpaths (one
  // per island) in the source 'd', and those subpaths turn out to NOT all
  // share the same winding direction in the original data - so after one
  // global reversal, some of a province's rings end up correctly wound
  // and others still backwards (confirmed via d3.geoArea() on real
  // multi-ring provinces: e.g. one 5-ring province still measured ~4x a
  // full sphere, implying 4 of its 5 rings were still inverted). The fix
  // has to be per-ring: reverse only the specific rings that measure as
  // "backwards" on their own, using d3.geoArea() with a 2*PI (half-sphere)
  // threshold - any legitimately small province ring will be far below
  // that, while an inverted one will read close to 4*PI.
  function fixRingWinding(ring){
    if (typeof d3 === 'undefined' || !d3.geoArea || ring.length < 4) return ring;
    const area = d3.geoArea({ type: 'Polygon', coordinates: [ring] });
    return area > 2 * Math.PI ? ring.slice().reverse() : ring;
  }

  const baseProvinces = PROVINCES.map(function(p){
    const subpaths = getPathSubrings(p.d);
    const rings = subpaths.map(function(pts){
      const ring = pts.map(function(pt){ return toLonLat(pt[0], pt[1]); });
      ring.reverse();
      return fixRingWinding(ring);
    });
    const globeRings = rings
      .map(function(ring){ return fixRingWinding(simplifyRing(ring, GLOBE_SIMPLIFY_TOLERANCE)); })
      .filter(isUsableRing);
    // Raw pixel-space rings (native SVG coordinates, full detail, no
    // lon/lat conversion) - used only for unioning same-nation provinces
    // together into one merged shape on the flat map. Closed already by
    // getPathSubrings (it repeats the start point on Z/z).
    const pixelRings = subpaths.filter(isUsableRing);
    return {
      id: p.id,
      label: p.label,
      econ: p.econ,
      climate: p.climate ? (p.climate.display || p.climate.dominant) : null,
      d: p.d,
      continent: p.continent,
      rings: rings,
      globeRings: globeRings,
      pixelRings: pixelRings,
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
    // Modern's whole point is "white continents, blue ocean" - unclaimed
    // land there is flat white rather than the muted per-continent tint
    // the other themes use.
    const theme = currentThemeName();
    if (theme === 'modern') return '#ffffff';
    // Parchment's whole sheet reads as one ink color - every continent
    // (and island - see buildFlatMap()'s gIslands, which also calls this)
    // gets the exact same brown rather than a different muted hue apiece,
    // so land only ever separates from land by an ownership color, never
    // by which landmass it happens to be.
    if (theme === 'parchment') return PARCHMENT_LAND_BROWN;
    // Dark Mode: a solid black continent interior (unclaimed land reads as
    // a void, distinguished from the equally-black ocean only by the white
    // coastline outline - see the body.theme-dark [data-continent] rule in
    // globe.css) rather than the muted per-continent hues the default/
    // relief look uses.
    if (theme === 'dark') return '#000000';
    return continentTint[continentId] || NEUTRAL_HEX;
  }

  // Nation fill/border colors, recomputed whenever the active theme could
  // change what a nation should look like (boot, and every Appearance
  // switch via window.refreshGlobeTheme below). Only Modern draws on the
  // Land Bio Data sheet's per-nation "color" field; everything else cycles
  // through that theme's fixed 4-color palette.
  function computeNationColors(sortedNames){
    const theme = currentThemeName();
    const palette = THEME_NATION_PALETTES[theme];
    const colors = {};
    sortedNames.forEach(function(name, i){
      if (theme === 'modern'){
        const sheetRow = landBioByName[name.toUpperCase()];
        colors[name] = (sheetRow && sheetRow.color) ? sheetRow.color : colorForIndex(i);
      } else if (palette && palette.length){
        colors[name] = palette[i % palette.length];
      } else {
        colors[name] = colorForIndex(i);
      }
    });
    return colors;
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

  // Real-world territory size, purely for flavor in the nation panel: this
  // world has no stated physical scale of its own (the viewBox is just
  // however many SVG units the source map happens to use), so there's no
  // "real" km2 to report without picking SOME reference scale. Assuming
  // the whole map is one Earth-sized sphere - the same assumption the
  // globe view already makes by treating VIEWBOX's 360x180 span as a full
  // equirectangular world - gives a concrete, defensible number instead of
  // an arbitrary one. d3.geoArea() returns a geometry's area in steradians
  // on a UNIT sphere; multiplying by Earth's mean radius squared converts
  // that to km2 (the same relationship that makes 4*PI*EARTH_RADIUS_KM^2
  // work out to Earth's real ~510.1 million km2 surface area) - this is
  // NOT a naive pixel-area conversion, which would badly overstate
  // territory near the poles (an equirectangular map stretches high
  // latitudes horizontally without shrinking them vertically to match).
  const EARTH_RADIUS_KM = 6371;
  function nationAreaKm2(nationName){
    if (typeof d3 === 'undefined' || !d3.geoArea) return null; // vendor/d3-geo.min.js missing/failed - see handleGlobeFailure
    let steradians = 0;
    features.forEach(function(f){
      if (f.nationName === nationName && f.geometry) steradians += d3.geoArea(f.geometry);
    });
    return steradians * EARTH_RADIUS_KM * EARTH_RADIUS_KM;
  }
  function formatAreaKm2(km2){
    if (km2 == null || !isFinite(km2)) return null;
    return Math.round(km2).toLocaleString('en-US') + ' km²';
  }

  // =========================================================================
  // 2b. Nation shapes: merge every nation's claimed provinces into ONE
  //     outline apiece (internal province borders dissolved away), so the
  //     map reads as "who owns this land", not "here are 1200 province
  //     cells that happen to share colors". Unclaimed provinces are left
  //     exactly as they were - drawn individually, since there's no nation
  //     to merge them into.
  //
  //     No external geometry library for this: checked the actual source
  //     data first (counting how often each boundary edge - the segment
  //     between two consecutive points in a province's path - occurs
  //     across a cluster of adjacent provinces), and confirmed two
  //     neighboring provinces' shared border is authored as the exact
  //     same coordinates on both sides, every time, across all 1200
  //     provinces. That means "merge" can just be "cancel out every edge
  //     that appears on two different provinces (an internal border,
  //     shared both ways), and stitch whatever edges are left (each
  //     province's own outer boundary) back into closed loops" - no
  //     floating-point polygon intersection math needed, just counting
  //     and chaining. See dissolveRings() below.
  // =========================================================================

  let nationFlatPathByName = {};      // nationName -> SVG 'd' string (pixel space)
  let nationGlobeGeometryByName = {}; // nationName -> GeoJSON Polygon/MultiPolygon (lon/lat)

  // Cancels every edge shared by exactly two rings (an internal border
  // between two provinces of the same nation - it's walked once by each
  // side, in opposite directions, so it appears twice total) and stitches
  // what's left - each province's stretch of true outer boundary - back
  // into closed loops. On clean, exactly-matching data (verified above)
  // this always fully closes: every surviving edge's end point is some
  // other surviving edge's start point, all the way back around.
  //
  // Returns a FLAT list of rings - it doesn't try to figure out which
  // rings are "exterior" boundary vs. a hole (an unclaimed enclave fully
  // surrounded by this nation's territory) or which hole belongs to which
  // disjoint piece of the nation's territory - see groupRingsForGlobe()
  // for why the globe needs that and the flat map doesn't.
  function dissolveRings(ringsList, precision){
    function ptKey(pt){ return pt[0].toFixed(precision) + ',' + pt[1].toFixed(precision); }
    function edgeKey(ka, kb){ return ka < kb ? ka + '|' + kb : kb + '|' + ka; }

    const edgeCount = {};
    ringsList.forEach(function(ring){
      for (let i = 0; i < ring.length - 1; i++){
        const ka = ptKey(ring[i]), kb = ptKey(ring[i + 1]);
        if (ka === kb) continue;
        edgeCount[edgeKey(ka, kb)] = (edgeCount[edgeKey(ka, kb)] || 0) + 1;
      }
    });

    // Keep only edges that occur exactly once (a province's true outer
    // boundary); an edge occurring twice is an internal border and
    // cancels out. Kept as DIRECTED adjacency (in whichever direction the
    // source data happens to have walked it) so re-chaining preserves
    // each edge's original winding - see the comment on groupRingsForGlobe
    // for why that matters.
    const pointByKey = {};
    const adjacency = {}; // ptKey -> [ptKey, ...] (almost always exactly one)
    ringsList.forEach(function(ring){
      for (let i = 0; i < ring.length - 1; i++){
        const a = ring[i], b = ring[i + 1];
        const ka = ptKey(a), kb = ptKey(b);
        if (ka === kb) continue;
        if (edgeCount[edgeKey(ka, kb)] !== 1) continue;
        pointByKey[ka] = a; pointByKey[kb] = b;
        (adjacency[ka] = adjacency[ka] || []).push(kb);
      }
    });

    const edgeUsed = {};
    const outRings = [];
    Object.keys(adjacency).forEach(function(startKey){
      adjacency[startKey].forEach(function(firstNext){
        if (edgeUsed[startKey + '=>' + firstNext]) return;
        const ringKeys = [startKey];
        let cur = startKey, next = firstNext;
        let guard = 0;
        while (true){
          edgeUsed[cur + '=>' + next] = true;
          ringKeys.push(next);
          if (next === startKey) break; // closed the loop
          const options = adjacency[next];
          if (!options || !options.length) break; // dangling - shouldn't happen on clean data
          let picked = null;
          for (let i = 0; i < options.length; i++){
            if (!edgeUsed[next + '=>' + options[i]]){ picked = options[i]; break; }
          }
          if (picked == null) break;
          cur = next; next = picked;
          if (++guard > 500000) break; // safety valve against a malformed chain
        }
        if (ringKeys.length >= 4 && ringKeys[0] === ringKeys[ringKeys.length - 1]){
          outRings.push(ringKeys.map(function(k){ return pointByKey[k]; }));
        }
        // An unclosed chain is silently dropped rather than drawn wrong -
        // it would mean this specific nation's claim has a genuinely
        // mismatched border somewhere, which real geographic/hand-edited
        // data occasionally does even when the vast bulk of it lines up
        // exactly. Dropping it can only make that one province's sliver
        // of edge vanish from an otherwise-correct merged shape, never
        // corrupt the shape itself.
      });
    });
    return outRings;
  }

  // The globe's GeoJSON needs each hole nested inside the specific
  // exterior ring it belongs to - unlike the flat SVG path (plain fill
  // only cares about each ring's own winding, not this grouping), d3-geo
  // clips each MultiPolygon "polygon" entry as its own connected shape,
  // so a hole listed as an unrelated top-level entry instead of nested
  // with its exterior renders as extra, wrong geometry instead of a hole
  // (confirmed against the real library with a synthetic "ring of
  // provinces around an unclaimed enclave" test).
  //
  // Every ring here still has its ORIGINAL winding, inherited untouched
  // from the source province edges it's built from (dissolveRings() never
  // reverses anything) - and since every province in this dataset is
  // wound the same consistent way to begin with, that means a merged
  // shape's outer boundary comes out wound the same way individual
  // provinces already were, while a hole's boundary automatically comes
  // out wound the OPPOSITE way (walking the inside edge of a ring of
  // provinces around a gap necessarily runs the opposite rotational
  // direction from walking any one province's own boundary) - a general
  // fact about consistently-oriented planar regions, not a coincidence,
  // and confirmed against the real d3-geo library on a synthetic donut
  // test: exterior/hole classified this way, nested together, needed NO
  // extra winding fix at all - unlike the polygon-clipping-based version
  // this replaced, which normalized winding on its own terms and did.
  function ringSignedArea(ring){
    let sum = 0;
    for (let i = 0; i < ring.length - 1; i++) sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    return sum / 2;
  }
  function ringBBox(ring){
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    ring.forEach(function(pt){
      if (pt[0] < minX) minX = pt[0]; if (pt[0] > maxX) maxX = pt[0];
      if (pt[1] < minY) minY = pt[1]; if (pt[1] > maxY) maxY = pt[1];
    });
    return [minX, minY, maxX, maxY];
  }
  function pointInRing(pt, ring){
    let inside = false;
    for (let i = 0, j = ring.length - 2; i < ring.length - 1; j = i++){
      const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      const crosses = ((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi);
      if (crosses) inside = !inside;
    }
    return inside;
  }
  function groupRingsForGlobe(ringsList, exteriorSign){
    const exteriors = [];
    const holes = [];
    ringsList.forEach(function(ring){
      const sign = ringSignedArea(ring) >= 0 ? 1 : -1;
      if (sign === exteriorSign) exteriors.push({ ring: ring, bbox: ringBBox(ring), holes: [] });
      else holes.push(ring);
    });
    holes.forEach(function(hole){
      const pt = hole[0];
      for (let i = 0; i < exteriors.length; i++){
        const ext = exteriors[i];
        if (pt[0] < ext.bbox[0] || pt[0] > ext.bbox[2] || pt[1] < ext.bbox[1] || pt[1] > ext.bbox[3]) continue;
        if (pointInRing(pt, ext.ring)){ ext.holes.push(hole); return; }
      }
      // An orphan hole (no exterior contains it) shouldn't happen on
      // clean data - drop it rather than render it as a wrong top-level
      // shape.
    });
    return exteriors.map(function(e){ return [e.ring].concat(e.holes); });
  }
  // Computed once: any single ordinary province ring is a pure exterior
  // (individual provinces have no holes of their own), so its winding
  // sign IS the dataset's "exterior" convention in lon/lat space.
  const GLOBE_EXTERIOR_SIGN = (function(){
    const ref = baseProvinces.filter(function(p){ return p.rings.length; })[0];
    return ringSignedArea(ref.rings[0]) >= 0 ? 1 : -1;
  })();

  function multiPolygonToSvgPath(ringsList){
    let d = '';
    ringsList.forEach(function(ring){
      if (!ring || ring.length < 4) return;
      d += 'M' + ring.map(function(pt){ return pt[0].toFixed(2) + ',' + pt[1].toFixed(2); }).join('L') + 'Z';
    });
    return d;
  }

  // Shared by both nation merging (above) and continent/island merging
  // (below, for unclaimed land) - dissolves one group of provinces into
  // its flat SVG path and globe GeoJSON geometry. Returns {flatPath,
  // globeGeometry}, either of which can be null if that group had no
  // usable geometry at all.
  // True if the dissolved rings still cover (roughly) the same net area as
  // the source rings they were built from. Net signed area on both sides, so
  // holes/lakes subtract consistently; 0.8 leaves room for the small,
  // legitimate loss from the odd unclosable border sliver.
  function dissolveKeptEnoughArea(mergedRings, sourceRings){
    function net(list){ let sum = 0; list.forEach(function(r){ sum += ringSignedArea(r); }); return Math.abs(sum); }
    const expected = net(sourceRings);
    if (!(expected > 0)) return true;
    return net(mergedRings) / expected >= 0.8;
  }

  function mergeProvinceGeometry(provinces, groupLabel){
    let flatPath = null, globeGeometry = null;

    try {
      const pixelRings = [];
      provinces.forEach(function(p){ p.pixelRings.forEach(function(r){ pixelRings.push(r); }); });
      const mergedPixel = dissolveRings(pixelRings, 2);
      // Sanity check: a dissolve whose border vertices don't line up
      // exactly (e.g. a continent whose provinces were cut with slightly
      // mismatched shared edges) silently drops the chains it can't close,
      // which can leave only a sliver of the real land - confirmed on the
      // Central continent, which kept ~6% of its area. If the merged shape
      // lost a large share of the provinces' own combined area, draw the
      // provinces' own rings as-is instead (seam-prone, but never missing).
      if (mergedPixel.length && dissolveKeptEnoughArea(mergedPixel, pixelRings)) flatPath = multiPolygonToSvgPath(mergedPixel);
      else if (pixelRings.length) flatPath = multiPolygonToSvgPath(pixelRings);
    } catch (e){
      console.warn('[Map] Could not merge flat-map geometry for ' + groupLabel + ':', e.message);
    }

    try {
      // Full, UNsimplified lon/lat rings ("rings", not "globeRings") -
      // each province's globeRings is independently simplified for
      // rendering performance, which can nudge two neighboring provinces'
      // shared border to no longer match exactly on both sides
      // (confirmed: it does, on this real data - simplifying before
      // merging left the vast majority of internal borders uncancelled).
      // Dissolving on the full-detail coordinates first and simplifying
      // the much-shorter merged result afterward avoids that entirely.
      const globeRingsFull = [];
      provinces.forEach(function(p){ p.rings.forEach(function(r){ globeRingsFull.push(r); }); });
      const mergedGlobe = dissolveRings(globeRingsFull, 7);
      const simplified = mergedGlobe
        .map(function(ring){ return simplifyRing(ring, GLOBE_SIMPLIFY_TOLERANCE); })
        .filter(isUsableRing);
      if (simplified.length && dissolveKeptEnoughArea(mergedGlobe, globeRingsFull)){
        const polygons = groupRingsForGlobe(simplified, GLOBE_EXTERIOR_SIGN);
        if (polygons.length) globeGeometry = { type: 'MultiPolygon', coordinates: polygons };
      } else {
        // Same fallback as the flat map above: the dissolve lost too much
        // area, so use each province's own (already winding-fixed,
        // simplified) ring as its own polygon.
        const polygons = [];
        provinces.forEach(function(p){ (p.globeRings || []).forEach(function(r){ polygons.push([r]); }); });
        if (polygons.length) globeGeometry = { type: 'MultiPolygon', coordinates: polygons };
      }
    } catch (e){
      console.warn('[Map] Could not merge globe geometry for ' + groupLabel + ':', e.message);
    }

    return { flatPath: flatPath, globeGeometry: globeGeometry };
  }

  function buildNationGeometry(){
    nationFlatPathByName = {};
    nationGlobeGeometryByName = {};

    const provincesByNation = {};
    baseProvinces.forEach(function(p){
      const claim = takenIndex[p.label.toUpperCase()] || null;
      if (!claim) return;
      (provincesByNation[claim.name] = provincesByNation[claim.name] || []).push(p);
    });

    Object.keys(provincesByNation).forEach(function(nationName){
      const merged = mergeProvinceGeometry(provincesByNation[nationName], nationName);
      if (merged.flatPath) nationFlatPathByName[nationName] = merged.flatPath;
      if (merged.globeGeometry) nationGlobeGeometryByName[nationName] = merged.globeGeometry;
    });
  }

  // =========================================================================
  // 2c. Unclaimed land: same dissolve, grouped by continent instead of by
  //     nation, so open land reads as solid continents/islands - "here is
  //     the land" - rather than a patchwork of 1200 individually-outlined
  //     province cells. Grouping by continent (not one dissolve for the
  //     whole world) keeps each continent's own tint color and keeps the
  //     merge cheap; provinces on different continents never share a
  //     border anyway, so this produces the exact same shapes a single
  //     world-wide dissolve would, just with the color bookkeeping done
  //     for free by the grouping itself. A continent made up of several
  //     separate islands still comes out right - dissolveRings() already
  //     returns one closed ring per disconnected landmass, same as it did
  //     for a nation with non-contiguous claims.
  //
  //     Provinces that ARE claimed are excluded from their continent's
  //     group, same as they're excluded from being drawn individually -
  //     since only one side of their boundary is present, those edges
  //     don't cancel out, so the continent shape's own boundary correctly
  //     traces around claimed territory as a hole (or a bite out of the
  //     edge), the same way it already traces around a lake.
  // =========================================================================

  let continentFlatPathById = {};      // continentId -> SVG 'd' string (pixel space)
  let continentGlobeGeometryById = {}; // continentId -> GeoJSON Polygon/MultiPolygon (lon/lat)

  function buildUnclaimedGeometry(){
    continentFlatPathById = {};
    continentGlobeGeometryById = {};

    const provincesByContinent = {};
    baseProvinces.forEach(function(p){
      const claim = takenIndex[p.label.toUpperCase()] || null;
      if (claim) return;
      (provincesByContinent[p.continent] = provincesByContinent[p.continent] || []).push(p);
    });

    Object.keys(provincesByContinent).forEach(function(continentId){
      const merged = mergeProvinceGeometry(provincesByContinent[continentId], 'continent ' + continentId);
      if (merged.flatPath) continentFlatPathById[continentId] = merged.flatPath;
      if (merged.globeGeometry) continentGlobeGeometryById[continentId] = merged.globeGeometry;
    });
  }

  // =========================================================================
  // 2d. Full continent base layer (claims INCLUDED, unlike 2c above) - used
  //     only as the solid ground the Modern appearance's nation-colored
  //     claim shapes get painted on top of (globe classic layer + flat
  //     map), never as a click/hover target of its own.
  //
  //     2c's continent shape deliberately traces a hole around each claim
  //     so the claim's own shape is what's visible there - but that shape
  //     and the claim's independently-dissolved-and-simplified shape can
  //     come out not quite matching at their shared edge (the same
  //     per-province-simplification mismatch mergeProvinceGeometry()'s own
  //     comment describes), leaving a hairline gap down to the ocean/page
  //     background right along a claim's border. A full continent shape
  //     with no hole there at all means a claim's shape only ever needs to
  //     be painted OVER solid land, not fitted exactly into a hole cut to
  //     its size - so the same hairline mismatch, if it still happens, is
  //     just a sliver of continent tint peeking out along the border
  //     instead of a gap down to open ocean.
  // =========================================================================

  let continentFullFlatPathById = {};      // continentId -> SVG 'd' string (pixel space)
  let continentFullGlobeGeometryById = {}; // continentId -> GeoJSON Polygon/MultiPolygon (lon/lat)

  function buildFullContinentGeometry(){
    continentFullFlatPathById = {};
    continentFullGlobeGeometryById = {};

    const provincesByContinent = {};
    baseProvinces.forEach(function(p){
      (provincesByContinent[p.continent] = provincesByContinent[p.continent] || []).push(p);
    });

    Object.keys(provincesByContinent).forEach(function(continentId){
      const merged = mergeProvinceGeometry(provincesByContinent[continentId], 'full continent ' + continentId);
      if (merged.flatPath) continentFullFlatPathById[continentId] = merged.flatPath;
      if (merged.globeGeometry) continentFullGlobeGeometryById[continentId] = merged.globeGeometry;
    });
  }

  // =========================================================================
  // 3. Land Bio Data sheet (richer per-nation fields for the info panel)
  // =========================================================================

  // Same "Admin Post" tab/sheet claims.js reads (its CLAIMS_SHEET_CSV_URL),
  // and the same sideways layout: one column per nation, one row per field.
  // Column A is a row label, real data starts at column B (FIRST_DATA_COLUMN).
  // "Publish to web" CSV link - File > Share > Publish to web > select that
  // tab > CSV. Confirmed live via direct fetch on 2026-09-29:
  //   Row 1  Timestamp
  //   Row 2  Nation                    <- NATION_ROW
  //   Row 3  Classification            <- CLASSIFICATION_ROW
  //   Row 4  Capital                   <- CAPITAL_ROW
  //   Row 5  Government Type           <- GOVERNMENT_TYPE_ROW
  //   Row 6  Landbio Economy           <- ECONOMY_ROW
  //   Row 7  GDP                       <- GDP_ROW
  //   Row 8  Food Production           <- FOOD_PRODUCTION_ROW
  //   Row 9  Energy Production         <- ENERGY_PRODUCTION_ROW
  //   Row 10 Population                <- POPULATION_ROW
  //   Rows 11-22  Specializations/Military (not wired yet - starting with
  //               rows 2-10 and 25-26 per initial request; add ROW indices
  //               below once these are ready to surface)
  //   Row 23 Claim Code (claims.js's own CLAIM_CODE_ROW_INDEX = 22)
  //   Row 24 Hex Color                 <- COLOR_ROW (Modern theme nation fill)
  //   Row 25 Factbook                  <- FACTBOOK_ROW
  //   Row 26 Application               <- APPLICATION_ROW
  //   Row 27 NPC ("yes"/blank)         <- NPC_ROW (appends " - NPC" to the
  //               nation's displayed name - see nationDisplayName() below)
  const LAND_BIO_SHEET_CSV_URL =
    'https://docs.google.com/spreadsheets/d/e/2PACX-1vR7W_8C-QWQO6AmHUYrvI4FdlyTMRV3qe65QIF-abGoH_YZRexNYMvCQQfLyJPWM_vQn_x26rVS_xmF/pub?gid=1336017158&single=true&output=csv';

  const FIRST_DATA_COLUMN = 1; // column B (0-indexed) - column A is a row label, not data

  const LAND_BIO_ROWS = {
    nation: 1,
    classification: 2,
    capital: 3,
    governmentType: 4,
    economy: 5,
    gdp: 6,
    foodProduction: 7,
    energyProduction: 8,
    population: 9,
    color: 23,
    factbook: 24,
    application: 25,
    npc: 26,
  };

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

  function fetchLandBioSheet(){
    if (!LAND_BIO_SHEET_CSV_URL){
      return Promise.resolve({ rows: {}, configured: false, error: null });
    }
    return fetch(LAND_BIO_SHEET_CSV_URL, { cache: 'no-store' })
      .then(function(res){ if(!res.ok) throw new Error('HTTP ' + res.status); return res.text(); })
      .then(function(csvText){
        const rows = csvText.split(/\r?\n/).map(parseCsvLine);
        const nameRow = rows[LAND_BIO_ROWS.nation] || [];
        const byNation = {};
        function cell(rowIndex, col){
          const row = rows[rowIndex];
          return row ? (row[col] || '').trim() : '';
        }
        for (let col = FIRST_DATA_COLUMN; col < nameRow.length; col++){
          const nationName = (nameRow[col] || '').trim();
          if (!nationName) continue;
          byNation[nationName.toUpperCase()] = {
            nation: nationName,
            classification: cell(LAND_BIO_ROWS.classification, col),
            capital: cell(LAND_BIO_ROWS.capital, col),
            governmentType: cell(LAND_BIO_ROWS.governmentType, col),
            economy: cell(LAND_BIO_ROWS.economy, col),
            gdp: cell(LAND_BIO_ROWS.gdp, col),
            foodProduction: cell(LAND_BIO_ROWS.foodProduction, col),
            energyProduction: cell(LAND_BIO_ROWS.energyProduction, col),
            population: cell(LAND_BIO_ROWS.population, col),
            specializations: [],
            militaryPriority: '', nationalStance: '',
            navy: '', army: '', airforce: '', expeditionary: '', paramilitary: '',
            // Modern theme's nation coloring (computeNationColors above) -
            // any CSS color the sheet owner enters (a hex code like
            // "#3a6b8f", or a named color like "steelblue") is passed
            // straight through as an SVG fill/stroke value.
            color: cell(LAND_BIO_ROWS.color, col),
            factbook: cell(LAND_BIO_ROWS.factbook, col),
            application: cell(LAND_BIO_ROWS.application, col),
            npc: /^yes$/i.test(cell(LAND_BIO_ROWS.npc, col)),
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

  // Appends " - NPC" to a nation's name wherever it's displayed (nation
  // panel header, hover tooltip) when the Land Bio Data sheet's row 27
  // ("NPC") is "yes" for that nation - see LAND_BIO_ROWS.npc above.
  function nationDisplayName(nationName){
    const sheet = landBioByName[nationName.toUpperCase()];
    return nationName + (sheet && sheet.npc ? ' - NPC' : '');
  }

  function fieldRow(label, value){
    if (!value) return '';
    return '<p class="nc-field"><span class="nc-field-label">' + escapeHtml(label) + ':</span> ' +
      '<span class="nc-field-value">' + escapeHtml(value) + '</span></p>';
  }

  // Used for the sheet's Factbook/Application URL fields (rows 25-26): the
  // label itself is the clickable link text, not the raw address - e.g.
  // "Factbook" links out to the URL rather than printing it on the page.
  function linkRow(label, url){
    if (!url) return '';
    return '<a class="nc-link" href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(label) + '</a>';
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
    panelTitle.textContent = '';
    panelHint.textContent = '';

    // The actual capital city name (sheet.capital, e.g. "Test City") - not
    // claim.capital, which is a province label (e.g. "S9") and belongs on
    // the map/claim side, not here.
    const capitalName = sheet && sheet.capital;
    const areaLabel = formatAreaKm2(nationAreaKm2(nationName));

    let html = '';
    if (sheet && sheet.classification) html += '<div class="nc-classification">' + escapeHtml(sheet.classification) + '</div>';
    html += '<h3 class="nc-name">' + escapeHtml(nationDisplayName(nationName)) + '</h3>';
    const subLines = [];
    if (capitalName) subLines.push('Capital: ' + escapeHtml(capitalName));
    if (areaLabel) subLines.push('Area: ' + escapeHtml(areaLabel));
    if (subLines.length) html += '<div class="nc-sub">' + subLines.join('<br>') + '</div>';

    if (sheet){
      if (sheet.factbook || sheet.application){
        html += '<div class="nc-links">' +
          linkRow('Factbook', sheet.factbook) +
          linkRow('Application', sheet.application) +
          '</div>';
      }

      html += '<div class="nc-section">Overview</div>';
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

    nationCard.innerHTML = html;
    showPopup();
  }

  let selectedNationName = null;

  // Capital-province marker (both views): a small star badge parked at the
  // selected nation's capital, on top of the existing whole-nation
  // brightness/border highlight - see buildCapitalMarker()/
  // updateCapitalMarker() below, and the renderGlobe() hook that keeps the
  // globe's copy reprojected as it rotates.
  let flatCapitalMarkerG = null;
  let globeCapitalMarkerG = null;
  let globeCapitalLonLat = null; // [lon, lat] of the current capital, or null when none/unselected

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
    Array.from(flatSvg.querySelectorAll('.relief-claim')).forEach(function(el){
      el.classList.toggle('picked', !!selectedNationName && el.dataset.nation === selectedNationName);
    });
    Array.from(globeSvg.querySelectorAll('.relief-claim')).forEach(function(el){
      el.classList.toggle('picked', !!selectedNationName && el.dataset.nation === selectedNationName);
    });
    updateCapitalMarker();
  }

  // A small white-and-gold star badge (built from the same starPath()
  // helper the rhumb-line compass roses use), centered on its own <g> at
  // the origin so placing it is just a translate() - see updateCapitalMarker().
  // Deliberately NOT colored from theme variables: it has to stay legible
  // over every theme's own palette (parchment sepia, dark near-black gold
  // nations, relief terrain, modern flat colors alike), the same reasoning
  // a map pin icon stays white+black regardless of the map style under it.
  function buildCapitalMarker(scale){
    const g = svgEl('g', { class: 'capital-marker' });
    g.style.pointerEvents = 'none';
    g.style.display = 'none';
    const haloR = 15 * scale;
    g.appendChild(svgEl('circle', {
      cx: '0', cy: '0', r: haloR.toFixed(1),
      fill: '#1a1a1a', opacity: '0.28',
    }));
    g.appendChild(svgEl('circle', {
      cx: '0', cy: '0', r: (haloR * 0.78).toFixed(1),
      fill: '#fffdf5', stroke: '#20180a', 'stroke-width': (1.4 * scale).toFixed(2),
    }));
    g.appendChild(svgEl('path', {
      d: starPath(0, 0, 5, 10 * scale, 4.2 * scale),
      fill: '#c9a227', stroke: '#6b4f10', 'stroke-width': (0.9 * scale).toFixed(2), 'stroke-linejoin': 'round',
    }));
    return g;
  }

  // Repositions (or hides) the capital marker on both views for whatever
  // selectedNationName currently is - called from applySelectionHighlight()
  // above, so it stays correct through every selection change, theme
  // switch's rebuild, and view toggle.
  function updateCapitalMarker(){
    let base = null;
    if (selectedNationName){
      const capFeature = features.find(function(f){ return f.nationName === selectedNationName && f.isCapital; });
      if (capFeature) base = baseById[capFeature.id];
    }
    if (flatCapitalMarkerG){
      const c = base ? ringCentroid(largestRing(base.pixelRings)) : null;
      if (c){
        flatCapitalMarkerG.setAttribute('transform', 'translate(' + c[0].toFixed(1) + ',' + c[1].toFixed(1) + ')');
        flatCapitalMarkerG.style.display = '';
      } else {
        flatCapitalMarkerG.style.display = 'none';
      }
    }
    globeCapitalLonLat = base ? ringCentroid(largestRing(base.rings)) : null;
    if (globeCapitalMarkerG && !globeCapitalLonLat) globeCapitalMarkerG.style.display = 'none';
    scheduleGlobeRender(); // positions (or hides) the globe copy - see renderGlobe()
  }

  function showMapTooltip(e, props){
    const rect = mapFrame.getBoundingClientRect();
    // Unclaimed land is now one solid shape per continent/island with no
    // visible province seams, so naming the specific province on hover
    // would be telling the visitor something the map itself no longer
    // shows them. Clicking still opens that exact province's info panel
    // (econ/climate) - this only trims the passive hover tooltip.
    if (!props.nationName){
      tooltip.innerHTML = 'Unclaimed';
    } else {
      const sheet = landBioByName[props.nationName.toUpperCase()];
      const classification = sheet && sheet.classification;
      tooltip.innerHTML = (classification ? '<div class="sub">' + escapeHtml(classification) + '</div>' : '') +
        escapeHtml(nationDisplayName(props.nationName));
    }
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

  // ---- Parchment-only chart dressing: rhumb lines + aged-paper overlay ----
  // Portolan-chart flourishes, built once and simply hidden/shown on theme
  // switch (see repaintOwnershipColors below) rather than rebuilt, since
  // they don't depend on ownership data at all.
  let rhumbLinesGroup = null;
  let paperTextureGroup = null;
  // Modern-only flat-map dressing: a plain lon/lat grid (the globe's
  // classic layer already draws one via globeGraticuleEl/.globe-graticule -
  // this is that same idea, but for the flat map, which had nothing at all
  // before). Built once, shown/hidden on theme switch exactly like the
  // rhumb-lines/paper-texture pair above.
  let graticuleGroup = null;
  // Parchment-only globe dressing: the flat map's rhumb-line/compass-rose
  // network, reprojected into the globe's own GLOBE_VB_SIZE screen space
  // and clipped to the sphere's disc - built alongside globeGraticuleEl in
  // buildGlobeClassicLayer() and toggled against it the same way
  // rhumbLinesGroup/graticuleGroup are toggled against each other on the
  // flat map (see repaintOwnershipColors()).
  let globeRhumbLinesGroup = null;
  const INK = '#5a2a1e'; // faded iron-gall-ink brown, not flat black
  const GRID_INK = '#39506b'; // muted slate-blue, reads as "reference grid" not "ink"

  // A handful of compass roses scattered across the sheet, each spraying
  // straight rhumb lines the way a 15th/16th-century portolan chart does -
  // navigators laid their course against the nearest rose's lines rather
  // than a lat/lon grid. Drawn as the very first thing in the SVG so every
  // landmass paints over it; only the open water ends up showing lines,
  // same as on a real one.
  // A k-point star outline (alternating outer/inner vertices, first point
  // aimed due north) as an SVG path 'd' string - the actual compass-rose
  // ornament drawn at a focal point, not just a ring.
  function starPath(cx, cy, points, outerR, innerR){
    const step = Math.PI / points; // half the angle between two outer points
    let d = '';
    for (let i = 0; i < points * 2; i++){
      const r = (i % 2 === 0) ? outerR : innerR;
      const angle = -Math.PI / 2 + i * step;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      d += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1) + ' ';
    }
    return d + 'Z';
  }

  // One real compass rose: 32 rhumb lines fanning out to the edge of the
  // sheet (weighted in three tiers - 8 main/16 half/32 quarter points, the
  // way an actual rose network is drawn), an 8-point star ornament sized
  // to the rose, and a couple of rings marking its center.
  function buildCompassRose(g, fp, reach, opts){
    const scale = (opts && opts.scale) || 1;
    const weight = (opts && opts.weight) || 1;
    for (let deg = 0; deg < 360; deg += 11.25){
      const rad = deg * Math.PI / 180;
      const onMain = Math.abs((deg / 45) - Math.round(deg / 45)) < 1e-6;
      const onHalf = !onMain && Math.abs((deg / 22.5) - Math.round(deg / 22.5)) < 1e-6;
      const tier = onMain ? 'main' : (onHalf ? 'half' : 'quarter');
      const line = svgEl('line', {
        x1: fp.x.toFixed(1), y1: fp.y.toFixed(1),
        x2: (fp.x + Math.cos(rad) * reach).toFixed(1),
        y2: (fp.y + Math.sin(rad) * reach).toFixed(1),
        stroke: INK,
        'stroke-width': ((tier === 'main' ? 1.2 : tier === 'half' ? 0.7 : 0.35) * weight).toFixed(2),
        opacity: ((tier === 'main' ? 0.32 : tier === 'half' ? 0.20 : 0.11) * weight).toFixed(2),
      });
      g.appendChild(line);
    }
    const starOuter = 26 * scale, starInner = 10 * scale;
    g.appendChild(svgEl('path', {
      d: starPath(fp.x, fp.y, 8, starOuter, starInner),
      fill: 'none', stroke: INK, 'stroke-width': (1 * scale).toFixed(2), opacity: (0.4 * weight).toFixed(2),
    }));
    g.appendChild(svgEl('circle', {
      cx: fp.x.toFixed(1), cy: fp.y.toFixed(1), r: (starOuter * 1.15).toFixed(1),
      fill: 'none', stroke: INK, 'stroke-width': (0.6 * scale).toFixed(2), opacity: (0.28 * weight).toFixed(2),
    }));
    g.appendChild(svgEl('circle', {
      cx: fp.x.toFixed(1), cy: fp.y.toFixed(1), r: (3 * scale).toFixed(1),
      fill: INK, opacity: (0.45 * weight).toFixed(2),
    }));
  }

  // Classic portolan layout: one large, fully-dressed rose anchoring the
  // center of the sheet, plus four smaller secondary roses out at the
  // cardinal edges - fewer, more deliberate focal points than a scatter of
  // identical roses, with the center one doing the most work visually.
  function buildRhumbLines(){
    const g = svgEl('g', { class: 'rhumb-lines' });
    g.style.pointerEvents = 'none';
    const reach = Math.max(VB_W, VB_H) * 1.5; // long enough to run off any edge from any focal point
    const center = { x: VB_X + VB_W * 0.5, y: VB_Y + VB_H * 0.5 };
    const edgeRoses = [
      { x: VB_X + VB_W * 0.5, y: VB_Y + VB_H * 0.08 },
      { x: VB_X + VB_W * 0.5, y: VB_Y + VB_H * 0.92 },
      { x: VB_X + VB_W * 0.08, y: VB_Y + VB_H * 0.5 },
      { x: VB_X + VB_W * 0.92, y: VB_Y + VB_H * 0.5 },
    ];
    edgeRoses.forEach(function(fp){ buildCompassRose(g, fp, reach, { scale: 0.6, weight: 0.7 }); });
    buildCompassRose(g, center, reach, { scale: 1.6, weight: 1 });
    return g;
  }

  // Same idea, projected onto the globe's own screen space instead of the
  // flat map's - but anchored to fixed [lon, lat] points on the sphere
  // (rather than fixed screen positions) so the roses stay put over their
  // patch of geography and swing around with the globe as it's dragged,
  // the same way globeGraticuleEl's lat/lon grid already does. One rose
  // near the "center" of the default view plus four spread around it;
  // exact coordinates are arbitrary (this is decorative dressing, not real
  // navigation data), just spaced apart. Positions are recomputed every
  // frame by updateGlobeRhumbLines() (called from renderGlobe()); this
  // only builds the static clip circle the roses draw into. The clip
  // circle itself is still fine to build once - it's sized from
  // baseGlobeScale (the projection's un-zoomed .scale()), and that plus
  // the group's own centered translate stay fixed across drag-to-rotate
  // (only .rotate() changes) and zoom (a CSS transform on the whole <svg>,
  // not a projection change).
  const GLOBE_ROSE_GEO = [
    { lon: 0, lat: 0, scale: 1.4, weight: 1 },      // center rose
    { lon: 0, lat: 58, scale: 0.55, weight: 0.7 },  // north
    { lon: 0, lat: -58, scale: 0.55, weight: 0.7 }, // south
    { lon: -85, lat: 0, scale: 0.55, weight: 0.7 }, // west
    { lon: 85, lat: 0, scale: 0.55, weight: 0.7 },  // east
  ];

  function buildGlobeRhumbLines(){
    const g = svgEl('g', { class: 'rhumb-lines' });
    g.style.pointerEvents = 'none';
    const cx = GLOBE_VB_SIZE / 2, cy = GLOBE_VB_SIZE / 2;
    const clipId = 'globe-rhumb-clip';
    const defs = svgEl('defs');
    const clip = svgEl('clipPath', { id: clipId });
    clip.appendChild(svgEl('circle', { cx: String(cx), cy: String(cy), r: String(baseGlobeScale) }));
    defs.appendChild(clip);
    g.appendChild(defs);
    g.setAttribute('clip-path', 'url(#' + clipId + ')');
    // Rose network itself lives in its own child <g>, rebuilt every frame
    // by updateGlobeRhumbLines() - keeping defs/clip-path on the outer <g>
    // means that part never needs touching again after this initial build.
    g.appendChild(svgEl('g', { class: 'rhumb-roses' }));
    return g;
  }

  // Rebuilds the rose network from GLOBE_ROSE_GEO against the projection's
  // current rotation, called every render frame (see renderGlobe()) - same
  // visibility test the capital marker uses (angularDistance from the
  // view's center point < 90 degrees) so a rose rotated onto the far side
  // of the globe is skipped instead of drawing through the sphere.
  function updateGlobeRhumbLines(){
    if (!globeRhumbLinesGroup) return;
    const rosesG = globeRhumbLinesGroup.querySelector('.rhumb-roses');
    if (!rosesG) return;
    rosesG.innerHTML = '';
    const rotate = projection.rotate();
    const viewLon = -rotate[0], viewLat = -rotate[1];
    const reach = baseGlobeScale * 1.6;
    GLOBE_ROSE_GEO.forEach(function(rose){
      if (angularDistance(rose.lon, rose.lat, viewLon, viewLat) >= Math.PI / 2) return;
      const xy = projection([rose.lon, rose.lat]);
      if (!xy) return;
      buildCompassRose(rosesG, { x: xy[0], y: xy[1] }, reach, { scale: rose.scale, weight: rose.weight });
    });
  }

  // Modern-only flat-map dressing: a plain equirectangular lon/lat grid -
  // straightforward here (unlike the globe) because the flat map already
  // IS an equirectangular projection (see toLonLat()/VB_W/VB_H above), so a
  // meridian/parallel is just a straight vertical/horizontal line at a
  // fixed fraction of the viewBox. Every 20 degrees, drawn UNDER the land
  // (same stacking as the rhumb lines - see buildFlatMap()) so it only
  // shows over open water, not crossing over every continent and claim.
  function buildFlatGraticule(){
    const g = svgEl('g', { class: 'flat-graticule' });
    g.style.pointerEvents = 'none';
    const STEP = 20;
    for (let lon = -180; lon <= 180; lon += STEP){
      const x = VB_X + ((lon + 180) / 360) * VB_W;
      const onPrimeOrAntimeridian = (lon === 0 || lon === -180 || lon === 180);
      g.appendChild(svgEl('line', {
        x1: x.toFixed(1), y1: String(VB_Y), x2: x.toFixed(1), y2: String(VB_Y + VB_H),
        stroke: GRID_INK, 'stroke-width': onPrimeOrAntimeridian ? '0.9' : '0.5',
        opacity: onPrimeOrAntimeridian ? '0.32' : '0.18',
      }));
    }
    for (let lat = -80; lat <= 80; lat += STEP){
      const y = VB_Y + ((90 - lat) / 180) * VB_H;
      const onEquator = (lat === 0);
      g.appendChild(svgEl('line', {
        x1: String(VB_X), y1: y.toFixed(1), x2: String(VB_X + VB_W), y2: y.toFixed(1),
        stroke: GRID_INK, 'stroke-width': onEquator ? '0.9' : '0.5',
        opacity: onEquator ? '0.32' : '0.18',
      }));
    }
    return g;
  }

  // A soft vignette + a scatter of foxing stains + a fine fiber grain,
  // stacked with a multiply blend over the finished map so land and sea
  // alike pick up the same aged-sheet tint - drawn last (on top of
  // everything) rather than as a background, since a background tint
  // would only ever show through gaps.
  function buildPaperTexture(){
    const g = svgEl('g', { class: 'paper-texture' });
    g.style.pointerEvents = 'none';
    g.style.mixBlendMode = 'multiply';

    const defs = svgEl('defs');
    const vignette = svgEl('radialGradient', {
      id: 'paperVignette', cx: '50%', cy: '46%', r: '75%',
    });
    vignette.appendChild(svgEl('stop', { offset: '55%', 'stop-color': '#fff', 'stop-opacity': '0' }));
    vignette.appendChild(svgEl('stop', { offset: '100%', 'stop-color': '#8a6a3a', 'stop-opacity': '0.55' }));
    defs.appendChild(vignette);

    const grain = svgEl('pattern', {
      id: 'paperGrain', width: '9', height: '9', patternUnits: 'userSpaceOnUse',
      patternTransform: 'rotate(19)',
    });
    // A few off-white/tan flecks per tile, at slightly different spots so
    // the repeat doesn't read as an obvious grid at normal zoom.
    [[1.2, 2.1, 0.55], [5.8, 1.4, 0.4], [3.1, 6.4, 0.5], [7.6, 7.1, 0.35], [0.4, 5.0, 0.4]]
      .forEach(function(spot){
        grain.appendChild(svgEl('circle', {
          cx: String(spot[0]), cy: String(spot[1]), r: String(spot[2]),
          fill: '#7a5a35', opacity: '0.18',
        }));
      });
    defs.appendChild(grain);
    g.appendChild(defs);

    g.appendChild(svgEl('rect', {
      x: String(VB_X), y: String(VB_Y), width: String(VB_W), height: String(VB_H),
      fill: 'url(#paperGrain)',
    }));
    g.appendChild(svgEl('rect', {
      x: String(VB_X), y: String(VB_Y), width: String(VB_W), height: String(VB_H),
      fill: 'url(#paperVignette)',
    }));

    // Foxing: a handful of soft, irregular sepia blotches, positioned and
    // sized deterministically from elevationBias() (already used to seed
    // the globe's relief) so this stays fixed across rebuilds instead of
    // reshuffling every time the map is redrawn.
    for (let i = 0; i < 9; i++){
      const bx = elevationBias('fox-x:' + i), by = elevationBias('fox-y:' + i), br = elevationBias('fox-r:' + i);
      const cx = VB_X + VB_W * (0.08 + bx * 0.84);
      const cy = VB_Y + VB_H * (0.08 + by * 0.84);
      const r = 28 + br * 70;
      const stain = svgEl('ellipse', {
        cx: cx.toFixed(1), cy: cy.toFixed(1), rx: r.toFixed(1), ry: (r * (0.6 + br * 0.5)).toFixed(1),
        fill: '#7a5a35', opacity: (0.05 + br * 0.07).toFixed(2),
      });
      g.appendChild(stain);
    }

    return g;
  }

  // ---- Classic appearance: flat per-nation/continent fill colors (the
  // flat map's original look, still used for Modern/Parchment/Dark -
  // only Relief gets the procedural terrain in buildFlatReliefContent()
  // below, mirroring the same split the globe already has) ----
  function buildFlatClassicContent(){
    const gIslands = document.createElementNS(NS, 'g');
    ISLAND_LIST.forEach(function(isl){
      const el = document.createElementNS(NS, 'path');
      el.setAttribute('d', isl.d);
      if (isl.transform) el.setAttribute('transform', isl.transform);
      el.setAttribute('fill', tintForContinent(isl.continent));
      el.dataset.continent = isl.continent;
      el.style.pointerEvents = 'none';
      el.style.opacity = '0.85';
      gIslands.appendChild(el);
    });
    flatSvg.appendChild(gIslands);

    // Solid ground for the whole continent - claimed territory included,
    // not just unclaimed land (see buildFullContinentGeometry()) - so the
    // claim shapes drawn later paint over solid land instead of needing to
    // fit exactly into a hole cut to their size. Purely visual, not
    // interactive, so it can't shadow the per-province hit targets drawn
    // right after it.
    const gContinents = document.createElementNS(NS, 'g');
    Object.keys(continentFullFlatPathById).forEach(function(continentId){
      const el = document.createElementNS(NS, 'path');
      el.setAttribute('d', continentFullFlatPathById[continentId]);
      el.setAttribute('class', 'nation-province');
      el.setAttribute('fill', tintForContinent(continentId));
      el.dataset.continent = continentId;
      el.style.pointerEvents = 'none';
      gContinents.appendChild(el);
    });
    flatSvg.appendChild(gContinents);

    // Falls back to drawing that continent's unclaimed provinces
    // individually (visually, with a fill instead of transparent) only if
    // its merge failed for some reason, so land never just disappears.
    const failedContinents = {};
    (typeof CONTINENTS !== 'undefined' ? CONTINENTS : []).forEach(function(c){
      if (!continentFullFlatPathById[c.id]) failedContinents[c.id] = true;
    });

    // Invisible per-province click/hover targets, drawn on top of the
    // solid continent fill - keeps "click empty land to see that
    // province's name/econ/climate" working exactly as before, without
    // showing its outline. fill="transparent" (not "none") so it still
    // captures pointer events despite being invisible.
    const gProvinceHitboxes = document.createElementNS(NS, 'g');
    features.forEach(function(props){
      if (props.nationName) return; // claimed - handled by the nation shape below instead
      const base = baseById[props.id];
      const el = document.createElementNS(NS, 'path');
      el.setAttribute('d', base.d);
      el.setAttribute('class', 'unclaimed-hitbox');
      el.setAttribute('fill', failedContinents[base.continent] ? props.color : 'transparent');
      el.dataset.id = props.id;
      el.dataset.nation = '';
      el.addEventListener('click', function(){ selectProvince(props); });
      el.addEventListener('mousemove', function(e){ showMapTooltip(e, props); });
      el.addEventListener('mouseleave', hideTooltip);
      gProvinceHitboxes.appendChild(el);
    });
    flatSvg.appendChild(gProvinceHitboxes);

    // Claimed provinces: one merged shape per nation, internal province
    // borders dissolved away (see buildNationGeometry()). Falls back to
    // drawing that nation's provinces individually (old behavior) only if
    // the merge itself failed for some reason, so a claim never just
    // disappears from the map.
    const gNations = document.createElementNS(NS, 'g');
    Object.keys(claimsByName).forEach(function(nationName){
      const path = nationFlatPathByName[nationName];
      const nationProps = { label: nationName, nationName: nationName };
      if (path){
        const el = document.createElementNS(NS, 'path');
        el.setAttribute('d', path);
        el.setAttribute('class', 'nation-province');
        el.setAttribute('fill', nationColor[nationName] || NEUTRAL_HEX);
        el.dataset.nation = nationName;
        el.addEventListener('click', function(){ selectProvince(nationProps); });
        el.addEventListener('mousemove', function(e){ showMapTooltip(e, nationProps); });
        el.addEventListener('mouseleave', hideTooltip);
        gNations.appendChild(el);
      } else {
        features.filter(function(f){ return f.nationName === nationName; }).forEach(function(props){
          const base = baseById[props.id];
          const el = document.createElementNS(NS, 'path');
          el.setAttribute('d', base.d);
          el.setAttribute('class', 'nation-province');
          el.setAttribute('fill', props.color);
          el.dataset.id = props.id;
          el.dataset.nation = props.nationName;
          el.addEventListener('click', function(){ selectProvince(props); });
          el.addEventListener('mousemove', function(e){ showMapTooltip(e, props); });
          el.addEventListener('mouseleave', hideTooltip);
          gNations.appendChild(el);
        });
      }
    });
    flatSvg.appendChild(gNations);
  }

  // ---- Relief appearance: the same procedural terrain filter the globe
  // uses (buildGlobeReliefLayer above), applied directly in the flat
  // map's native pixel space instead of through a d3-geo reprojection -
  // the flat map never rotates, so the elevation/climate/speckle fields
  // can be sampled once, in place, with no per-frame reprojection needed
  // at all. Claims render the same grey-bordered, semi-transparent way
  // here as on the globe (see path.relief-claim in globe.css) so both
  // projections read as one consistent appearance. ----
  function buildFlatReliefContent(){
    const defs = document.createElementNS(NS, 'defs');

    // Hidden per-province (and per-island) grayscale fields, sampled by
    // the terrain filter below via feImage - see buildGlobeReliefLayer's
    // own copy of this comment for why each is hashed per-feature-id
    // rather than screen-space noise. No reprojection step needed here
    // (unlike the globe's biasfield/elevfield/speckfield groups), so
    // these are populated once, directly from each feature's native flat
    // 'd' path, and never touched again.
    const biasfieldG = svgEl('g', { id: 'flat-biasfield' });
    const elevfieldG = svgEl('g', { id: 'flat-elevfield' });
    const speckfieldG = svgEl('g', { id: 'flat-speckfield' });
    const landG = svgEl('g'); // solid black silhouette the terrain filter clips itself to
    features.forEach(function(f){
      const base = baseById[f.id];
      if (!base) return;
      const climGray = Math.round(climateBias(f.climate) * 255);
      biasfieldG.appendChild(svgEl('path', { d: base.d, fill: 'rgb(' + climGray + ',' + climGray + ',' + climGray + ')' }));
      const elevGrayVal = Math.round(elevationBias(f.id) * 255);
      elevfieldG.appendChild(svgEl('path', { d: base.d, fill: 'rgb(' + elevGrayVal + ',' + elevGrayVal + ',' + elevGrayVal + ')' }));
      const speckGrayVal = Math.round(speckleBias(f.id) * 255);
      speckfieldG.appendChild(svgEl('path', { d: base.d, fill: 'rgb(' + speckGrayVal + ',' + speckGrayVal + ',' + speckGrayVal + ')' }));
    });
    ISLAND_LIST.forEach(function(isl){
      const attrs = isl.transform ? { d: isl.d, transform: isl.transform } : { d: isl.d };
      const elevGrayVal = Math.round(elevationBias(isl.id) * 255);
      const speckGrayVal = Math.round(speckleBias(isl.id) * 255);
      biasfieldG.appendChild(svgEl('path', Object.assign({ fill: 'rgb(128,128,128)' }, attrs))); // no climate data for islands - neutral mid-tone
      elevfieldG.appendChild(svgEl('path', Object.assign({ fill: 'rgb(' + elevGrayVal + ',' + elevGrayVal + ',' + elevGrayVal + ')' }, attrs)));
      speckfieldG.appendChild(svgEl('path', Object.assign({ fill: 'rgb(' + speckGrayVal + ',' + speckGrayVal + ',' + speckGrayVal + ')' }, attrs)));
    });
    defs.appendChild(biasfieldG);
    defs.appendChild(elevfieldG);
    defs.appendChild(speckfieldG);

    // The landmask silhouette itself (what the terrain filter's final
    // feComposite operator="in" clips SourceGraphic against) is built from
    // ALREADY-MERGED continent/nation flat paths (continentFullFlatPathById/
    // nationFlatPathByName - the same dissolved geometry buildFlatClassicContent
    // uses for its solid fills), concatenated into ONE <path>'s 'd' string
    // rather than drawn as ~1200 individual per-province <path> elements.
    // That single-path, single-fill-operation approach mirrors exactly what
    // buildGlobeReliefLayer() does for the globe's own landmask (see its
    // "ALREADY-DISSOLVED continent/nation shapes" comment) and for the same
    // reason: ~1200 independently-anti-aliased adjacent <path> elements each
    // show a faint seam of partial coverage along every shared province
    // border, which - because the terrain filter's final step keys its own
    // alpha off this exact silhouette - showed up as every single province
    // outline being faintly traced onto the finished terrain instead of it
    // reading as one continuous landmass. A continent or nation whose merge
    // itself failed falls back to its own provinces' individual (still
    // seam-prone, but never simply missing) geometry, same fallback used
    // elsewhere in this file. Islands are kept as their own small, separate
    // <path> elements (each needs its own transform, which a single 'd'
    // string can't carry) - fine because islands are isolated landmasses
    // that never share a border with the mainland or each other, so there's
    // no seam for a separate element to introduce.
    const landDParts = [];
    const failedLandContinents = {};
    (typeof CONTINENTS !== 'undefined' ? CONTINENTS : []).forEach(function(c){
      if (continentFullFlatPathById[c.id]){
        landDParts.push(continentFullFlatPathById[c.id]);
      } else {
        failedLandContinents[c.id] = true;
      }
    });
    features.forEach(function(f){
      if (f.nationName) return; // claimed - handled by the nation merge below
      const base = baseById[f.id];
      if (base && failedLandContinents[base.continent]) landDParts.push(base.d);
    });
    Object.keys(claimsByName).forEach(function(nationName){
      const path = nationFlatPathByName[nationName];
      if (path){
        landDParts.push(path);
      } else {
        features.filter(function(f){ return f.nationName === nationName; }).forEach(function(f){
          const base = baseById[f.id];
          if (base) landDParts.push(base.d);
        });
      }
    });
    landG.appendChild(svgEl('path', { d: landDParts.join(' '), fill: '#000000', 'fill-rule': 'nonzero' }));
    ISLAND_LIST.forEach(function(isl){
      const attrs = isl.transform ? { d: isl.d, transform: isl.transform, fill: '#000000' } : { d: isl.d, fill: '#000000' };
      landG.appendChild(svgEl('path', attrs));
    });

    // Same procedural terrain recipe as buildGlobeReliefLayer's
    // 'globe-terrain' filter, just re-targeted at the flat map's own
    // viewBox (VB_W/VB_H) and field ids - see that function for what each
    // step is doing; kept in lockstep with it rather than factored into a
    // shared helper, since the globe's version threads GLOBE_VB_SIZE
    // through several dozen attributes and a shared helper would need
    // nearly as many parameters as the filter has steps.
    const terrain = svgEl('filter', { id: 'flat-terrain', x: '-10%', y: '-10%', width: '120%', height: '120%' });
    terrain.appendChild(svgEl('feImage', { href: '#flat-elevfield', x: String(VB_X), y: String(VB_Y), width: String(VB_W), height: String(VB_H), result: 'elevFieldImg' }));
    terrain.appendChild(svgEl('feColorMatrix', { in: 'elevFieldImg', type: 'matrix', values: '0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0 0 0 0 1', result: 'elevFieldGray' }));
    terrain.appendChild(svgEl('feGaussianBlur', { in: 'elevFieldGray', stdDeviation: '20', result: 'elevGray' }));
    terrain.appendChild(svgEl('feGaussianBlur', { in: 'elevFieldGray', stdDeviation: '8', result: 'elevNoise' }));
    terrain.appendChild(svgEl('feImage', { href: '#flat-biasfield', x: String(VB_X), y: String(VB_Y), width: String(VB_W), height: String(VB_H), result: 'climateBiasImg' }));
    terrain.appendChild(svgEl('feColorMatrix', { in: 'climateBiasImg', type: 'matrix', values: '0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0 0 0 0 1', result: 'climateBiasGray' }));
    terrain.appendChild(svgEl('feGaussianBlur', { in: 'climateBiasGray', stdDeviation: '18', result: 'climateBiasSoft' }));
    terrain.appendChild(svgEl('feComposite', { in: 'elevGray', in2: 'climateBiasSoft', operator: 'arithmetic', k1: '0', k2: '0.35', k3: '0.65', k4: '0', result: 'biasedElev' }));
    const ramp = svgEl('feComponentTransfer', { in: 'biasedElev', result: 'elevRamp' });
    ramp.appendChild(svgEl('feFuncR', { type: 'table', tableValues: '0.16 0.50 0.70 0.62' }));
    ramp.appendChild(svgEl('feFuncG', { type: 'table', tableValues: '0.42 0.58 0.58 0.46' }));
    ramp.appendChild(svgEl('feFuncB', { type: 'table', tableValues: '0.22 0.30 0.38 0.30' }));
    terrain.appendChild(ramp);
    terrain.appendChild(svgEl('feColorMatrix', { in: 'elevRamp', type: 'saturate', values: '1.25', result: 'elevRampVivid' }));
    terrain.appendChild(svgEl('feGaussianBlur', { in: 'elevRampVivid', stdDeviation: '0.6', result: 'elevRampSoft' }));
    const lighting = svgEl('feDiffuseLighting', { in: 'elevNoise', surfaceScale: '18', diffuseConstant: '1', 'lighting-color': '#ffffff', result: 'reliefRaw' });
    lighting.appendChild(svgEl('feDistantLight', { azimuth: '235', elevation: '45' }));
    terrain.appendChild(lighting);
    const reliefSoft = svgEl('feComponentTransfer', { in: 'reliefRaw', result: 'reliefSoft' });
    reliefSoft.appendChild(svgEl('feFuncR', { type: 'linear', slope: '0.95', intercept: '0.10' }));
    reliefSoft.appendChild(svgEl('feFuncG', { type: 'linear', slope: '0.95', intercept: '0.10' }));
    reliefSoft.appendChild(svgEl('feFuncB', { type: 'linear', slope: '0.95', intercept: '0.10' }));
    terrain.appendChild(reliefSoft);
    terrain.appendChild(svgEl('feBlend', { in: 'elevRampSoft', in2: 'reliefSoft', mode: 'multiply', result: 'shadedTerrain' }));
    const elevContrast = svgEl('feComponentTransfer', { in: 'elevNoise', result: 'elevContrast' });
    elevContrast.appendChild(svgEl('feFuncR', { type: 'linear', slope: '2.0', intercept: '-0.6' }));
    elevContrast.appendChild(svgEl('feFuncG', { type: 'linear', slope: '2.0', intercept: '-0.6' }));
    elevContrast.appendChild(svgEl('feFuncB', { type: 'linear', slope: '2.0', intercept: '-0.6' }));
    terrain.appendChild(elevContrast);
    terrain.appendChild(svgEl('feImage', { href: '#flat-speckfield', x: String(VB_X), y: String(VB_Y), width: String(VB_W), height: String(VB_H), result: 'speckFieldImg' }));
    terrain.appendChild(svgEl('feColorMatrix', { in: 'speckFieldImg', type: 'matrix', values: '0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0 0 0 0 1', result: 'speckFieldGray' }));
    terrain.appendChild(svgEl('feGaussianBlur', { in: 'speckFieldGray', stdDeviation: '2.5', result: 'elevSpeckle' }));
    const speckleContrast = svgEl('feComponentTransfer', { in: 'elevSpeckle', result: 'speckleContrast' });
    speckleContrast.appendChild(svgEl('feFuncR', { type: 'linear', slope: '2.6', intercept: '-0.8' }));
    speckleContrast.appendChild(svgEl('feFuncG', { type: 'linear', slope: '2.6', intercept: '-0.8' }));
    speckleContrast.appendChild(svgEl('feFuncB', { type: 'linear', slope: '2.6', intercept: '-0.8' }));
    terrain.appendChild(speckleContrast);
    terrain.appendChild(svgEl('feComposite', { in: 'elevContrast', in2: 'speckleContrast', operator: 'arithmetic', k1: '1', k2: '0', k3: '0', k4: '0', result: 'elevSpeckled' }));
    const capTexture = svgEl('feComponentTransfer', { in: 'elevNoise', result: 'capTexture' });
    capTexture.appendChild(svgEl('feFuncR', { type: 'linear', slope: '0.7', intercept: '0.35' }));
    capTexture.appendChild(svgEl('feFuncG', { type: 'linear', slope: '0.7', intercept: '0.35' }));
    capTexture.appendChild(svgEl('feFuncB', { type: 'linear', slope: '0.7', intercept: '0.35' }));
    terrain.appendChild(capTexture);
    const highMaskRaw = svgEl('feComponentTransfer', { in: 'elevSpeckled', result: 'highMaskRaw' });
    highMaskRaw.appendChild(svgEl('feFuncR', { type: 'gamma', amplitude: '1', exponent: '4.5', offset: '0' }));
    highMaskRaw.appendChild(svgEl('feFuncG', { type: 'gamma', amplitude: '1', exponent: '4.5', offset: '0' }));
    highMaskRaw.appendChild(svgEl('feFuncB', { type: 'gamma', amplitude: '1', exponent: '4.5', offset: '0' }));
    terrain.appendChild(highMaskRaw);
    const highMaskLinear = svgEl('feComponentTransfer', { in: 'highMaskRaw', result: 'highMaskLinear' });
    highMaskLinear.appendChild(svgEl('feFuncR', { type: 'linear', slope: '0.4', intercept: '0' }));
    highMaskLinear.appendChild(svgEl('feFuncG', { type: 'linear', slope: '0.4', intercept: '0' }));
    highMaskLinear.appendChild(svgEl('feFuncB', { type: 'linear', slope: '0.4', intercept: '0' }));
    terrain.appendChild(highMaskLinear);
    terrain.appendChild(svgEl('feComposite', { in: 'highMaskLinear', in2: 'capTexture', operator: 'arithmetic', k1: '1', k2: '0', k3: '0', k4: '0', result: 'highMask' }));
    terrain.appendChild(svgEl('feColorMatrix', { in: 'highMask', type: 'matrix', values: '0 0 0 0 0.62  0 0 0 0 0.80  0 0 0 0 0.32  1 0 0 0 0', result: 'highLayer' }));
    terrain.appendChild(svgEl('feComposite', { in: 'highLayer', in2: 'shadedTerrain', operator: 'over', result: 'withCaps' }));
    terrain.appendChild(svgEl('feComposite', { in: 'withCaps', in2: 'SourceGraphic', operator: 'in' }));
    defs.appendChild(terrain);
    flatSvg.appendChild(defs);

    landG.setAttribute('filter', 'url(#flat-terrain)');
    landG.style.pointerEvents = 'none';
    flatSvg.appendChild(landG);

    // Invisible click/hover targets on top of the terrain - unclaimed
    // provinces individually, claimed nations as one merged region apiece
    // (falls back to per-province for a nation whose merge failed), same
    // split buildGlobeReliefLayer uses.
    const hitboxG = svgEl('g');
    features.forEach(function(props){
      if (props.nationName) return;
      const base = baseById[props.id];
      const el = svgEl('path', { d: base.d, class: 'unclaimed-hitbox', fill: 'transparent' });
      el.dataset.id = props.id;
      el.dataset.nation = '';
      el.addEventListener('click', function(){ selectProvince(props); });
      el.addEventListener('mousemove', function(e){ showMapTooltip(e, props); });
      el.addEventListener('mouseleave', hideTooltip);
      hitboxG.appendChild(el);
    });
    Object.keys(claimsByName).forEach(function(nationName){
      const path = nationFlatPathByName[nationName];
      const nationProps = { label: nationName, nationName: nationName };
      if (path){
        const el = svgEl('path', { d: path, class: 'unclaimed-hitbox', fill: 'transparent' });
        el.dataset.nation = nationName;
        el.addEventListener('click', function(){ selectProvince(nationProps); });
        el.addEventListener('mousemove', function(e){ showMapTooltip(e, nationProps); });
        el.addEventListener('mouseleave', hideTooltip);
        hitboxG.appendChild(el);
      } else {
        features.filter(function(f){ return f.nationName === nationName; }).forEach(function(props){
          const base = baseById[props.id];
          const el = svgEl('path', { d: base.d, class: 'unclaimed-hitbox', fill: 'transparent' });
          el.dataset.id = props.id;
          el.dataset.nation = nationName;
          el.addEventListener('click', function(){ selectProvince(props); });
          el.addEventListener('mousemove', function(e){ showMapTooltip(e, props); });
          el.addEventListener('mouseleave', hideTooltip);
          hitboxG.appendChild(el);
        });
      }
    });
    flatSvg.appendChild(hitboxG);

    // Ownership: grey-bordered, semi-transparent wash of the nation's own
    // palette color over the terrain - see path.relief-claim in
    // globe.css and buildGlobeReliefLayer's matching overlay.
    const claimsG = svgEl('g');
    Object.keys(claimsByName).forEach(function(nationName){
      const path = nationFlatPathByName[nationName];
      const fillColor = nationColor[nationName] || NEUTRAL_HEX;
      if (path){
        const el = svgEl('path', {
          class: 'relief-claim', d: path,
          fill: fillColor, 'fill-opacity': RELIEF_CLAIM_FILL_OPACITY, stroke: RELIEF_BORDER_GREY,
        });
        el.dataset.nation = nationName;
        claimsG.appendChild(el);
      } else {
        features.filter(function(f){ return f.nationName === nationName; }).forEach(function(props){
          const base = baseById[props.id];
          const el = svgEl('path', {
            class: 'relief-claim', d: base.d,
            fill: fillColor, 'fill-opacity': RELIEF_CLAIM_FILL_OPACITY, stroke: RELIEF_BORDER_GREY,
          });
          el.dataset.id = props.id;
          el.dataset.nation = nationName;
          claimsG.appendChild(el);
        });
      }
    });
    flatSvg.appendChild(claimsG);
  }

  function buildFlatMap(){
    flatSvg.setAttribute('viewBox', VIEWBOX);
    flatSvg.innerHTML = '';
    flatBuiltMode = currentGlobeMode();

    // Chart dressing first, so every landmass drawn afterward paints over
    // it and only the ocean shows the lines underneath - built
    // unconditionally (cheap: a few dozen lines/shapes, no filters) and
    // just hidden outside its own theme, see repaintOwnershipColors()'s
    // theme check below. Modern's reference grid sits here now (it used to
    // be drawn on top of everything, which meant it crossed straight over
    // every continent and claim instead of reading as a background
    // graticule under the water only, the way the rhumb lines already do
    // for Parchment) - see buildFlatGraticule()'s own comment.
    rhumbLinesGroup = buildRhumbLines();
    rhumbLinesGroup.style.display = (currentThemeName() === 'parchment') ? '' : 'none';
    flatSvg.appendChild(rhumbLinesGroup);

    graticuleGroup = buildFlatGraticule();
    graticuleGroup.style.display = (currentThemeName() === 'modern') ? '' : 'none';
    flatSvg.appendChild(graticuleGroup);

    if (flatBuiltMode === 'relief'){
      buildFlatReliefContent();
    } else {
      buildFlatClassicContent();
    }

    const gLakes = document.createElementNS(NS, 'g');
    LAKE_LIST.forEach(function(l){
      const el = document.createElementNS(NS, 'path');
      el.setAttribute('d', l.d);
      el.style.fill = currentWaterColor();
      el.style.pointerEvents = 'none';
      el.dataset.water = 'lake'; // repainted on theme switch, see repaintOwnershipColors()
      gLakes.appendChild(el);
    });
    flatSvg.appendChild(gLakes);

    paperTextureGroup = buildPaperTexture();
    paperTextureGroup.style.display = (currentThemeName() === 'parchment') ? '' : 'none';
    flatSvg.appendChild(paperTextureGroup);

    // Capital marker last (topmost) - a fresh, still-unpositioned copy
    // every rebuild, so a theme switch that rebuilds this SVG while a
    // nation is already selected needs its position/visibility restored;
    // see the updateCapitalMarker() call this function's caller chain
    // already goes through (buildFlatMap() itself is only ever called from
    // boot() and refreshGlobeTheme(), both of which call
    // repaintOwnershipColors() -> applySelectionHighlight() -> that
    // function afterward), so nothing further is needed here beyond
    // creating the element.
    flatCapitalMarkerG = buildCapitalMarker(1);
    flatSvg.appendChild(flatCapitalMarkerG);
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
  // 6b. Globe terrain: a procedural, climate-biased relief render (ported
  //     from the "satellite physical map" appearance study). This is NOT
  //     the climate legend recolored - elevation is fractal noise, and
  //     climate only nudges where a province sits on a shared green ->
  //     tan -> grey -> white ramp (wet = greener, arid = browner), via a
  //     whole SVG filter chain (feTurbulence/feDiffuseLighting/etc.) that
  //     runs once across the ENTIRE globe, not per-province - see
  //     buildGlobeView() below for why that matters.
  //     The ramp runs low-input -> green, high-input -> tan/white, so this
  //     bias table must run the SAME direction: low = wet/green climate,
  //     high = dry/mountainous climate. Keyed to this dataset's exact
  //     CLIMATE_LEGEND names, not guessed keywords.
  // =========================================================================

  const CLIMATE_BIAS_MAP = {
    'tropical rainforest': 0.05,
    'tropical monsoon': 0.18,
    'humid sub-tropical': 0.22,
    'oceanic': 0.26,
    'humid continental': 0.32,
    'tropical wet dry': 0.38,
    'mediterranean': 0.40,
    'sub arctic': 0.76,
    'polar': 0.80,
    'semi-arid': 0.83,
    'highlands': 0.86,
    'arid': 0.95,
  };
  function climateBias(climateName){
    const key = (climateName || '').toLowerCase();
    return CLIMATE_BIAS_MAP.hasOwnProperty(key) ? CLIMATE_BIAS_MAP[key] : 0.5;
  }

  // Deterministic pseudo-random elevation per province (FNV-1a hash of its
  // id, normalized to [0,1)) - NOT random noise generated in screen space.
  // Earlier versions of the terrain got their "elevation" from
  // feTurbulence, which is evaluated in the filter's own (screen/viewBox)
  // coordinate space - as the globe rotates, province paths move but that
  // noise field doesn't move with them, so mountains/highlands visibly
  // slide independently of the coastlines instead of being part of the
  // map. Hashing off each province's own id ties elevation to the actual
  // geography instead: it's re-sampled through the same feImage +
  // reprojection technique as the climate bias field below, so it rotates
  // and zooms together with the provinces it belongs to, like a real
  // heightmap baked onto the world rather than a texture floating over it.
  function elevationBias(provinceId){
    let h = 2166136261;
    const s = 'elev:' + provinceId;
    for (let i = 0; i < s.length; i++){
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ((h >>> 8) % 16777216) / 16777216;
  }
  // A second hash, statistically independent of elevationBias() above
  // (different salt, so a province with a high elevationBias has no
  // tendency toward a high speckleBias too). Used to gate the highland/
  // peak masks: multiplying it into a broad blurred elevation field only
  // lets a scattered subset of an otherwise-uniform "high" region through,
  // instead of the whole region lighting up as one solid shape.
  function speckleBias(provinceId){
    let h = 2166136261;
    const s = 'speck:' + provinceId;
    for (let i = 0; i < s.length; i++){
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ((h >>> 8) % 16777216) / 16777216;
  }
  function svgEl(tag, attrs){
    const node = document.createElementNS(NS, tag);
    if (attrs) Object.keys(attrs).forEach(function(k){ node.setAttribute(k, attrs[k]); });
    return node;
  }

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
  let globeBuiltMode = null; // 'relief' | 'classic' - which appearance the current DOM was built for
  let flatBuiltMode = null; // 'relief' | 'classic' - which appearance the current flat-map DOM was built for (mirrors globeBuiltMode)
  function currentGlobeMode(){
    return document.body.classList.contains('theme-relief') ? 'relief' : 'classic';
  }
  let globeReady = false; // false if d3 failed to load or init threw
  let projection = null;
  let pathGen = null;
  let baseGlobeScale = GLOBE_VB_SIZE * 0.46;
  let globeFeatures = []; // features that actually have usable geometry
  let globeEls = {}; // id -> <path> element, kept across renders

  function averageLonLat(){
    let sLon = 0, sLat = 0, n = 0;
    baseProvinces.forEach(function(p){
      p.rings.forEach(function(ring){
        ring.forEach(function(pt){ sLon += pt[0]; sLat += pt[1]; n++; });
      });
    });
    return n ? { lon: sLon/n, lat: sLat/n } : { lon: 0, lat: 0 };
  }

  // Great-circle angular distance (radians) between two lon/lat points -
  // used only to decide whether the capital marker's point currently sits
  // within the visible hemisphere (dist < PI/2, matching the projection's
  // own .clipAngle(90) below) before placing it, since projection([lon,lat])
  // happily returns a mirrored on-screen position for a point on the far
  // side too rather than clipping it the way pathGen() clips a real path.
  function angularDistance(lon1, lat1, lon2, lat2){
    const toRad = Math.PI / 180;
    const p1 = lat1 * toRad, p2 = lat2 * toRad;
    const dLat = (lat2 - lat1) * toRad, dLon = (lon2 - lon1) * toRad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dLon / 2) ** 2;
    return 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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
      if (globeGraticuleEl) globeGraticuleEl.setAttribute('d', pathGen(d3.geoGraticule()()) || '');
      if (globeRhumbLinesGroup && globeRhumbLinesGroup.style.display !== 'none') updateGlobeRhumbLines();
      if (globeLandEl){
        let d = '';
        globeLandFeatures.forEach(function(f){
          const seg = pathGen(f.geometry);
          if (seg) d += seg + ' ';
        });
        globeLandEl.setAttribute('d', d);
      }
      globeFeatures.forEach(function(f){
        const el = globeEls[f.id];
        if (!el) return;
        el.setAttribute('d', pathGen(f.geometry) || '');
      });
      if (globeLimbEl){
        const t = projection.translate(), s = projection.scale();
        globeLimbEl.setAttribute('cx', t[0]);
        globeLimbEl.setAttribute('cy', t[1]);
        globeLimbEl.setAttribute('r', s);
      }
      if (globeCapitalMarkerG){
        if (globeCapitalLonLat){
          const rotate = projection.rotate();
          const visible = angularDistance(globeCapitalLonLat[0], globeCapitalLonLat[1], -rotate[0], -rotate[1]) < Math.PI / 2;
          const xy = visible ? projection(globeCapitalLonLat) : null;
          if (xy){
            globeCapitalMarkerG.setAttribute('transform', 'translate(' + xy[0].toFixed(1) + ',' + xy[1].toFixed(1) + ')');
            globeCapitalMarkerG.style.display = '';
          } else {
            globeCapitalMarkerG.style.display = 'none';
          }
        } else {
          globeCapitalMarkerG.style.display = 'none';
        }
      }
    } catch (e){
      handleGlobeFailure(e);
    }
  }

  let globeSphereEl, globeGraticuleEl, globeProvincesGroup, globeLimbEl;
  let globeZoomG = null;
  let globeZoomFactor = 1.3; // default view is 130% zoomed in

  // Zoom is a CSS transform on the <svg> element itself (see below), NOT
  // a bigger projection.scale() and NOT an SVG transform attribute on a
  // group inside the SVG. It used to be projection.scale() directly (so
  // "zoom" meant literally inflating every projected path's coordinate
  // values), which blew the terrain filter's raster region up along with
  // it; moving that to an inner <g>'s SVG transform attribute instead
  // *looked* like a fix but wasn't a full one - the filter still got
  // rasterized at the final on-screen zoomed-in size either way, and on
  // a wide, high-DPI window a few zoom-in steps was enough to exceed the
  // browser's raster cap and clip the terrain to a rectangle (or, past
  // that, drop the filter entirely and show flat unfiltered fill).
  function applyGlobeZoom(){
    if (!globeSvg) return;
    // A CSS transform on the <svg> element itself, NOT an SVG transform
    // attribute on a group inside it. Those look equivalent but aren't:
    // scaling an inner <g> still leaves the filtered content and the
    // browser's on-screen size for it in the same paint/raster pass, so
    // the terrain filter gets asked to rasterize at the final zoomed-in
    // pixel size - on a wide, high-DPI window this can still exceed the
    // raster cap this whole zoom scheme exists to avoid (confirmed by
    // reproducing it at 1920x1080 @2x + a few zoom-in scroll steps).
    // Scaling the <svg> element via CSS instead makes it an ordinary
    // compositor layer: the browser rasterizes the SVG (filter included)
    // once at its un-zoomed, laid-out size, then the GPU just stretches
    // that bitmap for display, the same cheap way it would scale an
    // <img> or <canvas> - so filter cost and raster size never depend on
    // zoom level or window size at all.
    globeSvg.style.transformOrigin = 'center center';
    globeSvg.style.transform = globeZoomFactor === 1 ? '' : 'scale(' + globeZoomFactor + ')';
  }
  let globeLandEl = null, globeLandFeatures = [];

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

  // d3-geo used to be loaded from a CDN (first a single jsdelivr <script>
  // tag, then a fallback chain across three different CDN providers after
  // that turned out to be unreachable for at least one real visitor). Even
  // the fallback chain hit a case where a <script> tag fired 'onload'
  // (reported success) without actually defining d3.geoOrthographic - which
  // points to something (most likely a content-blocking browser extension)
  // intercepting the request and returning an empty "success" response
  // specifically to defeat onerror-based fallback logic like that. So
  // d3-geo is now vendored locally instead (vendor/d3-geo.min.js, loaded by
  // a plain <script> tag in globe.html, same origin as the page itself) -
  // no CDN, no network request to anything that could plausibly be
  // targeted by a blocklist. This check just confirms that file actually
  // loaded and defined what it should.
  function buildGlobeView(){
    const mode = currentGlobeMode();
    if (globeBuilt && globeBuiltMode === mode) return;
    globeBuilt = true;
    globeBuiltMode = mode;

    if (typeof d3 === 'undefined' || !d3.geoOrthographic){
      handleGlobeFailure(new Error('vendor/d3-geo.min.js did not define d3.geoOrthographic - the file may be ' +
        'missing, failed to load, or a browser extension is interfering with it even though it\'s hosted on ' +
        'this same site now'));
      return;
    }

    try {
      globeSvg.setAttribute('viewBox', '0 0 ' + GLOBE_VB_SIZE + ' ' + GLOBE_VB_SIZE);
      globeSvg.innerHTML = '';

      const avg = averageLonLat();
      projection = d3.geoOrthographic()
        .scale(baseGlobeScale) // default 130% zoom is applied via applyGlobeZoom()/globeZoomFactor
                                // instead of inflating this - see applyGlobeZoom() for why.
        .translate([GLOBE_VB_SIZE / 2, GLOBE_VB_SIZE / 2])
        .rotate([-avg.lon, -avg.lat])
        .clipAngle(90)
        .precision(0.3);
      pathGen = d3.geoPath(projection);

      globeEls = {};
      globeFeatures = [];

      globeLandEl = null;
      globeLandFeatures = [];
      globeGraticuleEl = null;
      globeRhumbLinesGroup = null;
      globeLimbEl = null;

      // Everything actually drawn (as opposed to <defs>) goes inside this
      // one group instead of straight onto globeSvg. Zoom itself is a CSS
      // transform on globeSvg, not on this group - see applyGlobeZoom().
      globeZoomG = svgEl('g', { id: 'globe-zoom-g' });
      globeSvg.appendChild(globeZoomG);

      const landFeatures = features.filter(function(f){ return !!f.geometry; });

      if (mode === 'relief'){
        buildGlobeReliefLayer(landFeatures, globeZoomG);
      } else {
        buildGlobeClassicLayer(landFeatures, globeZoomG);
      }

      // Capital marker, common to both appearances (unlike the graticule/
      // rhumb-lines pair, which are classic-only) - built fresh every
      // rebuild, so its position is restored via the renderGlobe() call
      // just below whenever globeCapitalLonLat is already set (e.g. a
      // Relief<->classic switch while a nation is selected).
      globeCapitalMarkerG = buildCapitalMarker(0.45);
      globeZoomG.appendChild(globeCapitalMarkerG);

      applyGlobeZoom();
      globeReady = true;
      renderGlobe();
    } catch (e){
      handleGlobeFailure(e);
    }
  }

  // ---- Relief appearance: the procedural satellite/terrain render ----
  function buildGlobeReliefLayer(landFeatures, container){
    const defs = svgEl('defs');

    // Deep, saturated satellite-photo ocean blue.
    const oceanGrad = svgEl('radialGradient', { id: 'globe-ocean', cx: '38%', cy: '32%', r: '80%' });
    oceanGrad.appendChild(svgEl('stop', { offset: '0%', 'stop-color': '#2f7fae' }));
    oceanGrad.appendChild(svgEl('stop', { offset: '55%', 'stop-color': '#1c5c86' }));
    oceanGrad.appendChild(svgEl('stop', { offset: '100%', 'stop-color': '#0d3a5c' }));
    defs.appendChild(oceanGrad);

    // Faint limb-darkening vignette so the sphere reads like a photo.
    const limbGrad = svgEl('radialGradient', { id: 'globe-limb', cx: '38%', cy: '32%', r: '75%' });
    limbGrad.appendChild(svgEl('stop', { offset: '0%', 'stop-color': '#000000', 'stop-opacity': '0' }));
    limbGrad.appendChild(svgEl('stop', { offset: '72%', 'stop-color': '#000000', 'stop-opacity': '0' }));
    limbGrad.appendChild(svgEl('stop', { offset: '100%', 'stop-color': '#01111f', 'stop-opacity': '0.35' }));
    defs.appendChild(limbGrad);

    // Hidden per-province grayscale fields, sampled by the terrain filter
    // below via feImage - one for climate (nudges a province's spot on the
    // green<->tan<->white ramp) and one for elevation (see elevationBias()
    // above for why this is hashed per-province rather than screen-space
    // noise). Both live in <defs> (never rendered directly), but their
    // paths still get re-projected every frame like visible land, so they
    // stay aligned with the coastlines - and with each other - as the
    // globe rotates/zooms, instead of sliding independently of it.
    const biasfieldG = svgEl('g', { id: 'globe-biasfield' });
    const elevfieldG = svgEl('g', { id: 'globe-elevfield' });
    const speckfieldG = svgEl('g', { id: 'globe-speckfield' });
    landFeatures.forEach(function(f){
      const climGray = Math.round(climateBias(f.climate) * 255);
      const climP = svgEl('path', { fill: 'rgb(' + climGray + ',' + climGray + ',' + climGray + ')' });
      biasfieldG.appendChild(climP);
      globeEls['bias:' + f.id] = climP;
      globeFeatures.push({ id: 'bias:' + f.id, geometry: f.geometry });

      const elevGrayVal = Math.round(elevationBias(f.id) * 255);
      const elevP = svgEl('path', { fill: 'rgb(' + elevGrayVal + ',' + elevGrayVal + ',' + elevGrayVal + ')' });
      elevfieldG.appendChild(elevP);
      globeEls['elev:' + f.id] = elevP;
      globeFeatures.push({ id: 'elev:' + f.id, geometry: f.geometry });

      const speckGrayVal = Math.round(speckleBias(f.id) * 255);
      const speckP = svgEl('path', { fill: 'rgb(' + speckGrayVal + ',' + speckGrayVal + ',' + speckGrayVal + ')' });
      speckfieldG.appendChild(speckP);
      globeEls['speck:' + f.id] = speckP;
      globeFeatures.push({ id: 'speck:' + f.id, geometry: f.geometry });
    });
    defs.appendChild(biasfieldG);
    defs.appendChild(elevfieldG);
    defs.appendChild(speckfieldG);

    // Procedural terrain filter (ported from the "satellite physical map"
    // appearance study, then reworked to sample elevation from the
    // per-province elevfield above instead of feTurbulence - a field
    // that's tied to the actual provinces reads as one continuous world
    // that rotates and zooms together, rather than a fixed noise texture
    // continents happen to slide across). Colorized via a
    // feComponentTransfer ramp that climate only nudges (never supplies
    // its own colors), plus grey highland / white peak-cap bands driven
    // purely by elevation. Applied ONCE to a single <g> holding the whole
    // landmask (below) - never per-province - so it's evaluated once per
    // frame instead of ~1200 times.
    const terrain = svgEl('filter', { id: 'globe-terrain', x: '-20%', y: '-20%', width: '140%', height: '140%' });
    terrain.appendChild(svgEl('feImage', { href: '#globe-elevfield', x: '0', y: '0', width: String(GLOBE_VB_SIZE), height: String(GLOBE_VB_SIZE), result: 'elevFieldImg' }));
    terrain.appendChild(svgEl('feColorMatrix', { in: 'elevFieldImg', type: 'matrix', values: '0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0 0 0 0 1', result: 'elevFieldGray' }));
    // Two blur passes off the same source: a heavier one for the color
    // ramp and highland/cap masks (broad, smooth landforms), a lighter
    // one for the hillshade bump map (keeps enough fine variation for
    // the lighting to read as texture rather than a flat gradient).
    terrain.appendChild(svgEl('feGaussianBlur', { in: 'elevFieldGray', stdDeviation: '20', result: 'elevGray' }));
    terrain.appendChild(svgEl('feGaussianBlur', { in: 'elevFieldGray', stdDeviation: '8', result: 'elevNoise' }));
    terrain.appendChild(svgEl('feImage', { href: '#globe-biasfield', x: '0', y: '0', width: String(GLOBE_VB_SIZE), height: String(GLOBE_VB_SIZE), result: 'climateBiasImg' }));
    terrain.appendChild(svgEl('feColorMatrix', { in: 'climateBiasImg', type: 'matrix', values: '0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0 0 0 0 1', result: 'climateBiasGray' }));
    terrain.appendChild(svgEl('feGaussianBlur', { in: 'climateBiasGray', stdDeviation: '18', result: 'climateBiasSoft' }));
    terrain.appendChild(svgEl('feComposite', { in: 'elevGray', in2: 'climateBiasSoft', operator: 'arithmetic', k1: '0', k2: '0.35', k3: '0.65', k4: '0', result: 'biasedElev' }));
    const ramp = svgEl('feComponentTransfer', { in: 'biasedElev', result: 'elevRamp' });
    ramp.appendChild(svgEl('feFuncR', { type: 'table', tableValues: '0.16 0.50 0.70 0.62' }));
    ramp.appendChild(svgEl('feFuncG', { type: 'table', tableValues: '0.42 0.58 0.58 0.46' }));
    ramp.appendChild(svgEl('feFuncB', { type: 'table', tableValues: '0.22 0.30 0.38 0.30' }));
    terrain.appendChild(ramp);
    terrain.appendChild(svgEl('feColorMatrix', { in: 'elevRamp', type: 'saturate', values: '1.25', result: 'elevRampVivid' }));
    terrain.appendChild(svgEl('feGaussianBlur', { in: 'elevRampVivid', stdDeviation: '0.6', result: 'elevRampSoft' }));
    const lighting = svgEl('feDiffuseLighting', { in: 'elevNoise', surfaceScale: '18', diffuseConstant: '1', 'lighting-color': '#ffffff', result: 'reliefRaw' });
    lighting.appendChild(svgEl('feDistantLight', { azimuth: '235', elevation: '45' }));
    terrain.appendChild(lighting);
    const reliefSoft = svgEl('feComponentTransfer', { in: 'reliefRaw', result: 'reliefSoft' });
    reliefSoft.appendChild(svgEl('feFuncR', { type: 'linear', slope: '0.95', intercept: '0.10' }));
    reliefSoft.appendChild(svgEl('feFuncG', { type: 'linear', slope: '0.95', intercept: '0.10' }));
    reliefSoft.appendChild(svgEl('feFuncB', { type: 'linear', slope: '0.95', intercept: '0.10' }));
    terrain.appendChild(reliefSoft);
    terrain.appendChild(svgEl('feBlend', { in: 'elevRampSoft', in2: 'reliefSoft', mode: 'multiply', result: 'shadedTerrain' }));

    // Highland/peak masks below read 'elevNoise' (the FINER of the two
    // blurred elevation passes, stdDeviation 8), not the broader 'elevGray'
    // (stdDeviation 20) the color ramp uses. The wide blur that makes a
    // good smooth base color ramp also means a few provinces hashing high
    // next to each other produces one broad, smoothly-domed peak - and a
    // steep gamma curve turns the whole flat top of that dome solid white
    // at once, showing up as a stark, oversized white blob rather than a
    // scattered mountain range. Reading the less-blurred field instead
    // keeps the same peaks rarer and smaller/more textured.
    const elevContrast = svgEl('feComponentTransfer', { in: 'elevNoise', result: 'elevContrast' });
    elevContrast.appendChild(svgEl('feFuncR', { type: 'linear', slope: '2.0', intercept: '-0.6' }));
    elevContrast.appendChild(svgEl('feFuncG', { type: 'linear', slope: '2.0', intercept: '-0.6' }));
    elevContrast.appendChild(svgEl('feFuncB', { type: 'linear', slope: '2.0', intercept: '-0.6' }));
    terrain.appendChild(elevContrast);

    // A second hashed field (speckleBias() above), independent of the
    // elevation hash, lightly blurred so it stays fine-grained instead of
    // settling into the same broad shapes elevation does. Multiplying it
    // into the highland/cap masks below breaks a wide "high on average"
    // elevation region up into a scatter of small peaks instead of
    // letting the whole region light up as one solid shape.
    terrain.appendChild(svgEl('feImage', { href: '#globe-speckfield', x: '0', y: '0', width: String(GLOBE_VB_SIZE), height: String(GLOBE_VB_SIZE), result: 'speckFieldImg' }));
    terrain.appendChild(svgEl('feColorMatrix', { in: 'speckFieldImg', type: 'matrix', values: '0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0 0 0 0 1', result: 'speckFieldGray' }));
    terrain.appendChild(svgEl('feGaussianBlur', { in: 'speckFieldGray', stdDeviation: '2.5', result: 'elevSpeckle' }));
    const speckleContrast = svgEl('feComponentTransfer', { in: 'elevSpeckle', result: 'speckleContrast' });
    speckleContrast.appendChild(svgEl('feFuncR', { type: 'linear', slope: '2.6', intercept: '-0.8' }));
    speckleContrast.appendChild(svgEl('feFuncG', { type: 'linear', slope: '2.6', intercept: '-0.8' }));
    speckleContrast.appendChild(svgEl('feFuncB', { type: 'linear', slope: '2.6', intercept: '-0.8' }));
    terrain.appendChild(speckleContrast);

    terrain.appendChild(svgEl('feComposite', { in: 'elevContrast', in2: 'speckleContrast', operator: 'arithmetic', k1: '1', k2: '0', k3: '0', k4: '0', result: 'elevSpeckled' }));

    // A texture multiplier built from 'elevNoise' (the finer of the two
    // blurred elevation passes) - without this, the highland/cap masks
    // below are smooth gradients from smooth blurred fields, so even a
    // softened, partially-transparent one still reads as a flat painted
    // patch rather than real terrain. Multiplying it into each mask's
    // alpha carves faint ridges/fissures into the cap itself, matching
    // the same texture already visible in the hillshading underneath.
    const capTexture = svgEl('feComponentTransfer', { in: 'elevNoise', result: 'capTexture' });
    capTexture.appendChild(svgEl('feFuncR', { type: 'linear', slope: '0.7', intercept: '0.35' }));
    capTexture.appendChild(svgEl('feFuncG', { type: 'linear', slope: '0.7', intercept: '0.35' }));
    capTexture.appendChild(svgEl('feFuncB', { type: 'linear', slope: '0.7', intercept: '0.35' }));
    terrain.appendChild(capTexture);

    // A single soft highland highlight, in a lime green rather than the
    // grey/white "highland band + snow cap" this used to be. Those read as
    // mountain peaks, which these high-elevation-hash spots were never
    // meant to represent (there's no separate "this province is a real
    // mountain" data - it's just the hashed elevation field running high
    // there) - grey and especially white made that misleading, and even
    // after several rounds of tuning to shrink/soften/texture them, still
    // stood out as flatly wrong rather than blending in as terrain. Lime
    // reads as "brighter patch of the same green", not a different kind of
    // terrain, so it never needs to be as heavily suppressed as the white
    // cap did.
    const highMaskRaw = svgEl('feComponentTransfer', { in: 'elevSpeckled', result: 'highMaskRaw' });
    highMaskRaw.appendChild(svgEl('feFuncR', { type: 'gamma', amplitude: '1', exponent: '4.5', offset: '0' }));
    highMaskRaw.appendChild(svgEl('feFuncG', { type: 'gamma', amplitude: '1', exponent: '4.5', offset: '0' }));
    highMaskRaw.appendChild(svgEl('feFuncB', { type: 'gamma', amplitude: '1', exponent: '4.5', offset: '0' }));
    terrain.appendChild(highMaskRaw);
    // Capped well below full opacity, same reasoning as the old grey/white
    // masks - left uncapped, this could reach solid opaque alpha across a
    // whole blurred-high region and read as a flat painted patch instead
    // of a soft highlight blended into the shaded terrain underneath.
    const highMaskLinear = svgEl('feComponentTransfer', { in: 'highMaskRaw', result: 'highMaskLinear' });
    highMaskLinear.appendChild(svgEl('feFuncR', { type: 'linear', slope: '0.4', intercept: '0' }));
    highMaskLinear.appendChild(svgEl('feFuncG', { type: 'linear', slope: '0.4', intercept: '0' }));
    highMaskLinear.appendChild(svgEl('feFuncB', { type: 'linear', slope: '0.4', intercept: '0' }));
    terrain.appendChild(highMaskLinear);
    terrain.appendChild(svgEl('feComposite', { in: 'highMaskLinear', in2: 'capTexture', operator: 'arithmetic', k1: '1', k2: '0', k3: '0', k4: '0', result: 'highMask' }));
    terrain.appendChild(svgEl('feColorMatrix', { in: 'highMask', type: 'matrix', values: '0 0 0 0 0.62  0 0 0 0 0.80  0 0 0 0 0.32  1 0 0 0 0', result: 'highLayer' }));
    terrain.appendChild(svgEl('feComposite', { in: 'highLayer', in2: 'shadedTerrain', operator: 'over', result: 'withCaps' }));

    terrain.appendChild(svgEl('feComposite', { in: 'withCaps', in2: 'SourceGraphic', operator: 'in' }));
    defs.appendChild(terrain);

    globeSvg.appendChild(defs);

    // Ocean sphere. Set via inline style, not the fill attribute alone -
    // '#globeSvg .globe-sphere{ fill: var(--panel-bg) }' in globe.css
    // would otherwise win the cascade over a plain presentation
    // attribute, since both have equal specificity but the stylesheet
    // rule is declared later.
    globeSphereEl = svgEl('path', { class: 'globe-sphere' });
    globeSphereEl.style.fill = 'url(#globe-ocean)';
    container.appendChild(globeSphereEl);
    // globeGraticuleEl left null - lat/lon lines don't read well over terrain

    // Single continuous landmask, drawn as ONE solid black silhouette (a
    // mask only - all real color comes from the terrain filter applied to
    // this <g>), clipped to the actual coastlines by the filter's final
    // feComposite operator="in" against SourceGraphic.
    //
    // Built from the ALREADY-DISSOLVED continent/nation shapes
    // (continentGlobeGeometryById / nationGlobeGeometryByName) - the same
    // ones the border overlay and classic appearance use - NOT from each
    // individual province's own f.geometry. Those are independently
    // simplified per province (see mergeProvinceGeometry()'s comment
    // above for why that's confirmed to leave two neighboring provinces'
    // shared border not quite matching on both sides), so unioning ~1200
    // of them let water show through at internal borders that should have
    // been invisible. The dissolve step here cancels each shared internal
    // border using the full-detail coordinates BEFORE any simplification,
    // so what's left has no such gaps to begin with. A continent or
    // nation whose dissolve itself failed falls back to its own
    // provinces' individual (still gap-prone, but better than missing)
    // geometry, same fallback used elsewhere in this file.
    const landmaskFeatures = [];
    const failedLandmaskContinents = {};
    (typeof CONTINENTS !== 'undefined' ? CONTINENTS : []).forEach(function(c){
      if (continentGlobeGeometryById[c.id]){
        landmaskFeatures.push({ id: 'continent:' + c.id, geometry: continentGlobeGeometryById[c.id] });
      } else {
        failedLandmaskContinents[c.id] = true;
      }
    });
    landFeatures.filter(function(f){ return !f.nationName; }).forEach(function(f){
      const base = baseById[f.id];
      if (failedLandmaskContinents[base.continent]){
        landmaskFeatures.push({ id: 'land:' + f.id, geometry: f.geometry });
      }
    });
    Object.keys(claimsByName).forEach(function(nationName){
      const geometry = nationGlobeGeometryByName[nationName];
      if (geometry){
        landmaskFeatures.push({ id: 'nation:' + nationName, geometry: geometry });
      } else {
        features.filter(function(f){ return f.nationName === nationName && !!f.geometry; }).forEach(function(f){
          landmaskFeatures.push({ id: 'land:' + f.id, geometry: f.geometry });
        });
      }
    });
    globeLandFeatures = landmaskFeatures;
    const landMaskG = svgEl('g', { id: 'globe-landmask', filter: 'url(#globe-terrain)' });
    landMaskG.style.pointerEvents = 'none';
    globeLandEl = svgEl('path', { fill: '#000000', 'fill-rule': 'nonzero' });
    landMaskG.appendChild(globeLandEl);
    container.appendChild(landMaskG);

    // Invisible click/hover targets on top of the terrain.
    //
    // Unclaimed land: one hitbox per province, same as before - there's
    // no nation to group it into, so "click this patch of open land to
    // see that specific province" still makes sense at province
    // granularity.
    //
    // Claimed land: one hitbox per NATION (using the same merged
    // territory geometry as its border overlay below), not one per
    // province - a nation should act as a single clickable region, not
    // a patchwork of its individual provinces, so hovering/clicking
    // anywhere inside its borders reads as "this nation", the same way
    // the flat map's gNations layer already works. Falls back to
    // per-province hitboxes only for a nation whose merge failed (rare;
    // logged elsewhere), so a claim never becomes unclickable.
    const hitboxG = svgEl('g');
    landFeatures.filter(function(f){ return !f.nationName; }).forEach(function(f){
      const p = svgEl('path', { class: 'unclaimed-hitbox', fill: 'transparent' });
      p.dataset.id = f.id;
      p.dataset.nation = '';
      p.addEventListener('click', function(){ if (!globeDragMoved) selectProvince(f); });
      p.addEventListener('mousemove', function(e){ showMapTooltip(e, f); });
      p.addEventListener('mouseleave', hideTooltip);
      hitboxG.appendChild(p);
      globeEls[f.id] = p;
      globeFeatures.push({ id: f.id, geometry: f.geometry });
    });
    Object.keys(claimsByName).forEach(function(nationName){
      const geometry = nationGlobeGeometryByName[nationName];
      const nationProps = { label: nationName, nationName: nationName };
      if (geometry){
        const p = svgEl('path', { class: 'unclaimed-hitbox', fill: 'transparent' });
        p.dataset.nation = nationName;
        p.addEventListener('click', function(){ if (!globeDragMoved) selectProvince(nationProps); });
        p.addEventListener('mousemove', function(e){ showMapTooltip(e, nationProps); });
        p.addEventListener('mouseleave', hideTooltip);
        hitboxG.appendChild(p);
        globeEls['nationhit:' + nationName] = p;
        globeFeatures.push({ id: 'nationhit:' + nationName, geometry: geometry });
      } else {
        features.filter(function(f){ return f.nationName === nationName && !!f.geometry; }).forEach(function(f){
          const p = svgEl('path', { class: 'unclaimed-hitbox', fill: 'transparent' });
          p.dataset.id = f.id;
          p.dataset.nation = nationName;
          p.addEventListener('click', function(){ if (!globeDragMoved) selectProvince(f); });
          p.addEventListener('mousemove', function(e){ showMapTooltip(e, f); });
          p.addEventListener('mouseleave', hideTooltip);
          hitboxG.appendChild(p);
          globeEls[f.id] = p;
          globeFeatures.push({ id: f.id, geometry: f.geometry });
        });
      }
    });
    container.appendChild(hitboxG);

    // Ownership: a grey-bordered, semi-transparent wash of the nation's
    // own palette color traced over its merged territory (see
    // path.relief-claim in globe.css and RELIEF_BORDER_GREY/
    // THEME_NATION_PALETTES.relief above), drawn on top of the terrain,
    // instead of a solid per-province fill color that would hide it. A
    // nation whose merge failed simply has no overlay drawn (its land
    // still renders as terrain and is still clickable via the hitbox
    // layer above) - logged the same way mergeProvinceGeometry() already
    // logs a failed merge elsewhere in this file.
    const borderG = svgEl('g');
    Object.keys(claimsByName).forEach(function(nationName){
      const geometry = nationGlobeGeometryByName[nationName];
      if (!geometry){
        console.warn('[Map] No merged globe geometry for ' + nationName + ' - skipping its border overlay');
        return;
      }
      const p = svgEl('path', {
        class: 'relief-claim',
        fill: nationColor[nationName] || NEUTRAL_HEX, 'fill-opacity': RELIEF_CLAIM_FILL_OPACITY,
        stroke: RELIEF_BORDER_GREY,
      });
      p.dataset.nation = nationName;
      borderG.appendChild(p);
      globeEls['border:' + nationName] = p;
      globeFeatures.push({ id: 'border:' + nationName, geometry: geometry });
    });
    container.appendChild(borderG);

    globeLimbEl = svgEl('circle', { fill: 'url(#globe-limb)' });
    globeLimbEl.style.pointerEvents = 'none';
    container.appendChild(globeLimbEl);
  }

  // ---- Classic appearance: flat per-nation/continent fill colors (the
  // globe's original look, still used for the Modern/Parchment/Dark
  // themes - only "Relief" gets the procedural terrain above) ----
  function buildGlobeClassicLayer(landFeatures, container){
    globeSphereEl = svgEl('path', { class: 'globe-sphere' });
    globeSphereEl.style.fill = currentWaterColor();
    container.appendChild(globeSphereEl);

    globeGraticuleEl = svgEl('path', { class: 'globe-graticule' });
    container.appendChild(globeGraticuleEl);

    // Parchment's rhumb-line network, built here too (not just on the flat
    // map) and toggled against globeGraticuleEl above by theme - see
    // buildGlobeRhumbLines()'s own comment for how it's kept aligned with
    // the sphere without needing per-frame reprojection.
    globeRhumbLinesGroup = buildGlobeRhumbLines();
    container.appendChild(globeRhumbLinesGroup);
    const isParchmentNow = currentThemeName() === 'parchment';
    globeGraticuleEl.style.display = isParchmentNow ? 'none' : '';
    globeRhumbLinesGroup.style.display = isParchmentNow ? '' : 'none';

    const globeProvincesGroup = svgEl('g');

    // Solid ground for the whole continent - claimed territory included,
    // not just unclaimed land (see buildFullContinentGeometry()), drawn
    // first (bottom of the stack) - exactly like the flat map. This means
    // the claim shapes drawn below paint over solid land instead of
    // needing to fit exactly into a hole cut to their size.
    const continentShapeFeatures = [];
    Object.keys(continentFullGlobeGeometryById).forEach(function(continentId){
      continentShapeFeatures.push({
        id: 'continent:' + continentId, label: continentId,
        color: tintForContinent(continentId), geometry: continentFullGlobeGeometryById[continentId],
      });
    });
    const failedContinents = {};
    (typeof CONTINENTS !== 'undefined' ? CONTINENTS : []).forEach(function(c){
      if (!continentFullGlobeGeometryById[c.id]) failedContinents[c.id] = true;
    });
    continentShapeFeatures.forEach(function(f){
      const p = svgEl('path', { class: 'nation-province continent-shape', fill: f.color });
      p.dataset.id = f.id;
      p.dataset.continent = f.label;
      globeEls[f.id] = p;
      globeFeatures.push(f);
      globeProvincesGroup.appendChild(p);
    });

    // Invisible per-province click/hover targets on top of that solid
    // fill, same reasoning as the flat map's gProvinceHitboxes - keeps
    // "click empty land to see that province" working without showing
    // province outlines. Falls back to a visible fill (instead of
    // transparent) only for a continent whose merge failed, so land
    // never just disappears.
    landFeatures.filter(function(f){ return !f.nationName; }).forEach(function(f){
      const base = baseById[f.id];
      const p = svgEl('path', { class: 'unclaimed-hitbox', fill: failedContinents[base.continent] ? f.color : 'transparent' });
      p.dataset.id = f.id;
      p.dataset.nation = '';
      p.addEventListener('click', function(){ if (!globeDragMoved) selectProvince(f); });
      p.addEventListener('mousemove', function(e){ showMapTooltip(e, f); });
      p.addEventListener('mouseleave', hideTooltip);
      globeEls[f.id] = p;
      globeFeatures.push({ id: f.id, geometry: f.geometry });
      globeProvincesGroup.appendChild(p);
    });

    // Claimed nations: one merged shape apiece - a nation is a single
    // clickable entity, not a patchwork of its provinces (falls back to
    // drawing that nation's provinces individually only if the merge
    // itself failed, so a claim never just disappears).
    Object.keys(claimsByName).forEach(function(nationName){
      const geometry = nationGlobeGeometryByName[nationName];
      if (geometry){
        const f = { id: 'nation:' + nationName, nationName: nationName, label: nationName,
          color: nationColor[nationName] || NEUTRAL_HEX, geometry: geometry };
        const p = svgEl('path', { class: 'nation-province', fill: f.color });
        p.dataset.id = f.id;
        p.dataset.nation = nationName;
        p.addEventListener('click', function(){ if (!globeDragMoved) selectProvince(f); });
        p.addEventListener('mousemove', function(e){ showMapTooltip(e, f); });
        p.addEventListener('mouseleave', hideTooltip);
        globeEls[f.id] = p;
        globeFeatures.push(f);
        globeProvincesGroup.appendChild(p);
      } else {
        features.filter(function(f){ return f.nationName === nationName && !!f.geometry; }).forEach(function(f){
          const p = svgEl('path', { class: 'nation-province', fill: f.color });
          p.dataset.id = f.id;
          p.dataset.nation = f.nationName || '';
          p.addEventListener('click', function(){ if (!globeDragMoved) selectProvince(f); });
          p.addEventListener('mousemove', function(e){ showMapTooltip(e, f); });
          p.addEventListener('mouseleave', hideTooltip);
          globeEls[f.id] = p;
          globeFeatures.push(f);
          globeProvincesGroup.appendChild(p);
        });
      }
    });

    container.appendChild(globeProvincesGroup);
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
    const k = ROTATE_SENSITIVITY / (projection.scale() * globeZoomFactor);
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
    // Capped at 4x (was 5x): on a large, high-DPI display the relief
    // appearance's terrain filter can still hit the browser's raster-size
    // cap right at the old ceiling - see applyGlobeZoom() above. 4x tested
    // clean up to a 1920x1080 window at 2x device pixel ratio (a
    // 3840x2160 render, i.e. a 4K display); 5x didn't.
    globeZoomFactor = Math.max(0.5, Math.min(4, globeZoomFactor * factor));
    applyGlobeZoom();
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

  // Repaints every already-drawn nation/continent/water fill in place, on
  // both the flat map and whichever globe layer is currently built,
  // without rebuilding any geometry - so an Appearance switch updates
  // colors immediately without losing the globe's current rotation/zoom.
  // Needed because Modern draws nation color from the Land Bio Data sheet
  // while the other three themes cycle a fixed 4-color palette (see
  // computeNationColors/THEME_NATION_PALETTES above) - switching themes
  // has to re-run that logic and re-apply its result, not just let CSS
  // variables cascade.
  function repaintOwnershipColors(){
    nationColor = computeNationColors(Object.keys(claimsByName).sort());
    buildFeatures(); // refreshes features[].color (unclaimed + merge-fallback fills) from the new nationColor/tintForContinent
    const water = currentWaterColor();
    if (mapFrame) mapFrame.style.background = water;

    const themeNow = currentThemeName();
    const isParchment = themeNow === 'parchment';
    const isModern = themeNow === 'modern';
    if (rhumbLinesGroup) rhumbLinesGroup.style.display = isParchment ? '' : 'none';
    if (paperTextureGroup) paperTextureGroup.style.display = isParchment ? '' : 'none';
    if (graticuleGroup) graticuleGroup.style.display = isModern ? '' : 'none';
    // Globe: same rhumb-lines-vs-graticule swap as the flat map above, but
    // only exists while the globe is in its classic layer - both are null
    // in Relief mode (see buildGlobeView()'s reset), so guard on that too.
    if (globeGraticuleEl) globeGraticuleEl.style.display = isParchment ? 'none' : '';
    if (globeRhumbLinesGroup) globeRhumbLinesGroup.style.display = isParchment ? '' : 'none';

    // Lakes are set via inline style rather than the 'fill' attribute (see
    // buildFlatMap()), so update that same property here - otherwise they'd
    // stay frozen at whatever color they were built with, out of step with
    // the ocean/mapFrame around them.
    if (flatSvg){
      Array.prototype.forEach.call(flatSvg.querySelectorAll('[data-water="lake"]'), function(el){
        el.style.fill = water;
      });
    }

    // Dataset-driven repaint, applied the same way to both SVGs: every
    // element that shows ownership/land color carries data-nation or
    // data-continent regardless of which code path drew it (merged-shape
    // or per-province-fallback), so this stays correct even for the rare
    // nation/continent whose geometry merge failed and fell back to
    // per-province fills.
    [flatSvg, globeSvg].forEach(function(svg){
      if (!svg) return;
      Array.prototype.forEach.call(svg.querySelectorAll('.nation-province[data-nation]'), function(el){
        const name = el.dataset.nation;
        if (name) el.setAttribute('fill', nationColor[name] || NEUTRAL_HEX);
      });
      // Relief's claim overlay: only the fill (a wash of the nation's own
      // color) tracks nationColor - the border stays a fixed grey
      // (RELIEF_BORDER_GREY) regardless of theme/nation, so there's
      // nothing to repaint on it.
      Array.prototype.forEach.call(svg.querySelectorAll('.relief-claim[data-nation]'), function(el){
        const name = el.dataset.nation;
        if (name) el.setAttribute('fill', nationColor[name] || NEUTRAL_HEX);
      });
      Array.prototype.forEach.call(svg.querySelectorAll('[data-continent]'), function(el){
        el.setAttribute('fill', tintForContinent(el.dataset.continent));
      });
    });
    if (globeSphereEl && currentGlobeMode() === 'classic'){
      globeSphereEl.style.fill = water;
    }
    // A Relief<->classic switch rebuilds one or both SVGs from scratch
    // (buildFlatMap()/buildGlobeView() above), which discards any .picked
    // class and the capital marker along with everything else - restore
    // both for whatever's still selected. A same-mode theme switch (the
    // common case) doesn't rebuild anything, so this is just a harmless
    // no-op re-application then.
    applySelectionHighlight();
  }

  // theme.js calls this after switching the Appearance theme (same
  // convention as map.js's window.refreshMapTheme). "Relief" still needs a
  // real rebuild since it's the only theme that changes how the globe (and,
  // now, the flat map) is actually constructed (terrain filter vs. flat
  // fills); the other Modern/Parchment/Dark switches just repaint colors
  // in place.
  window.refreshGlobeTheme = function(){
    const mode = currentGlobeMode();
    if (globeBuilt && mode !== globeBuiltMode){
      globeBuilt = false;
      buildGlobeView();
    }
    if (flatBuiltMode !== null && mode !== flatBuiltMode){
      buildFlatMap();
    }
    repaintOwnershipColors();
  };

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

    landBioByName = landBio.rows;
    landBioConfigured = landBio.configured;
    landBioError = landBio.error;

    // Needs landBioByName already in place - Modern's nation colors read
    // the sheet's "color" field from it.
    nationColor = computeNationColors(Object.keys(claimsByName).sort());
    if (mapFrame) mapFrame.style.background = currentWaterColor();

    buildFeatures();
    buildNationGeometry();
    buildUnclaimedGeometry();
    buildFullContinentGeometry();
    buildFlatMap();

    if (!claims.length){
      noDataBanner.textContent = 'No claims found yet - every province is shown as unclaimed.';
      noDataBanner.classList.add('show');
    } else if (landBioError) {
      noDataBanner.textContent = 'Claims loaded, but the Land Bio Data sheet could not be reached - nation panels show territory only.';
      noDataBanner.classList.add('show');
    }

    // Default view is the globe. showGlobeView() already falls back to
    // the flat map automatically if d3-geo failed to load or the globe
    // build throws (see globeHasFailedOnce / handleGlobeFailure), so this
    // stays safe even though the globe has a third-party rendering
    // dependency the flat map doesn't.
    showGlobeView();
  });

  applyViewBox();
})();
