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
  function mergeProvinceGeometry(provinces, groupLabel){
    let flatPath = null, globeGeometry = null;

    try {
      const pixelRings = [];
      provinces.forEach(function(p){ p.pixelRings.forEach(function(r){ pixelRings.push(r); }); });
      const mergedPixel = dissolveRings(pixelRings, 2);
      if (mergedPixel.length) flatPath = multiPolygonToSvgPath(mergedPixel);
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
      if (simplified.length){
        const polygons = groupRingsForGlobe(simplified, GLOBE_EXTERIOR_SIGN);
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
    Array.from(globeSvg.querySelectorAll('.nation-border')).forEach(function(el){
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
    // Unclaimed land is now one solid shape per continent/island with no
    // visible province seams, so naming the specific province on hover
    // would be telling the visitor something the map itself no longer
    // shows them. Clicking still opens that exact province's info panel
    // (econ/climate) - this only trims the passive hover tooltip.
    if (!props.nationName){
      tooltip.innerHTML = 'Unclaimed';
    } else {
      tooltip.innerHTML = escapeHtml(props.label) + '<div class="sub">Claimed by ' + escapeHtml(props.nationName) + '</div>';
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

    // Unclaimed land: one solid shape per continent/island (see
    // buildUnclaimedGeometry()), internal province borders dissolved away
    // - purely visual, not interactive, so it can't shadow the per-
    // province hit targets drawn right after it.
    const gContinents = document.createElementNS(NS, 'g');
    Object.keys(continentFlatPathById).forEach(function(continentId){
      const el = document.createElementNS(NS, 'path');
      el.setAttribute('d', continentFlatPathById[continentId]);
      el.setAttribute('class', 'nation-province');
      el.setAttribute('fill', tintForContinent(continentId));
      el.style.pointerEvents = 'none';
      gContinents.appendChild(el);
    });
    flatSvg.appendChild(gContinents);

    // Falls back to drawing that continent's unclaimed provinces
    // individually (visually, with a fill instead of transparent) only if
    // its merge failed for some reason, so land never just disappears.
    const failedContinents = {};
    (typeof CONTINENTS !== 'undefined' ? CONTINENTS : []).forEach(function(c){
      if (!continentFlatPathById[c.id]) failedContinents[c.id] = true;
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
    } catch (e){
      handleGlobeFailure(e);
    }
  }

  let globeSphereEl, globeGraticuleEl, globeProvincesGroup, globeLimbEl;
  let globeZoomG = null;
  let globeZoomFactor = 1;

  // Zoom is a CSS/SVG transform on globeZoomG, NOT a bigger
  // projection.scale(). It used to be projection.scale() directly (so
  // "zoom" meant literally inflating every projected path's coordinate
  // values) - that made zooming in on the relief appearance blow the
  // terrain filter's raster region up along with it, and past some point
  // (depends on the browser's own texture-size cap, which scales with the
  // actual on-screen pixel size - so it took a wide window plus a fair
  // amount of zoom to hit) the filter's output just got clipped to a hard
  // rectangle instead of covering the whole sphere. Scaling a wrapping
  // group post-render keeps every path's own coordinates - and so the
  // filter's region - fixed to the sphere's un-zoomed size, no matter how
  // far in the visitor zooms or how big their window is.
  function applyGlobeZoom(){
    if (!globeZoomG) return;
    const c = GLOBE_VB_SIZE / 2;
    globeZoomG.setAttribute('transform',
      'translate(' + c + ',' + c + ') scale(' + globeZoomFactor + ') translate(' + (-c) + ',' + (-c) + ')');
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
        .scale(baseGlobeScale * 1.3) // default zoom: 130%
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
      globeLimbEl = null;

      // Everything actually drawn (as opposed to <defs>) goes inside this
      // one group instead of straight onto globeSvg, so "zoom" (below) can
      // be a CSS/SVG transform on this group rather than a bigger
      // projection.scale(). See applyGlobeZoom() for why that distinction
      // matters - it's not just style, it avoids a real rendering bug.
      globeZoomG = svgEl('g', { id: 'globe-zoom-g' });
      globeSvg.appendChild(globeZoomG);

      const landFeatures = features.filter(function(f){ return !!f.geometry; });

      if (mode === 'relief'){
        buildGlobeReliefLayer(landFeatures, globeZoomG);
      } else {
        buildGlobeClassicLayer(landFeatures, globeZoomG);
      }

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
    });
    defs.appendChild(biasfieldG);
    defs.appendChild(elevfieldG);

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

    const elevContrast = svgEl('feComponentTransfer', { in: 'elevGray', result: 'elevContrast' });
    elevContrast.appendChild(svgEl('feFuncR', { type: 'linear', slope: '2.4', intercept: '-0.7' }));
    elevContrast.appendChild(svgEl('feFuncG', { type: 'linear', slope: '2.4', intercept: '-0.7' }));
    elevContrast.appendChild(svgEl('feFuncB', { type: 'linear', slope: '2.4', intercept: '-0.7' }));
    terrain.appendChild(elevContrast);

    const greyMask = svgEl('feComponentTransfer', { in: 'elevContrast', result: 'greyMask' });
    greyMask.appendChild(svgEl('feFuncR', { type: 'gamma', amplitude: '1', exponent: '4.5', offset: '0' }));
    greyMask.appendChild(svgEl('feFuncG', { type: 'gamma', amplitude: '1', exponent: '4.5', offset: '0' }));
    greyMask.appendChild(svgEl('feFuncB', { type: 'gamma', amplitude: '1', exponent: '4.5', offset: '0' }));
    terrain.appendChild(greyMask);
    terrain.appendChild(svgEl('feColorMatrix', { in: 'greyMask', type: 'matrix', values: '0 0 0 0 0.56  0 0 0 0 0.57  0 0 0 0 0.58  1 0 0 0 0', result: 'greyLayer' }));
    terrain.appendChild(svgEl('feComposite', { in: 'greyLayer', in2: 'shadedTerrain', operator: 'over', result: 'withGrey' }));

    const whiteMask = svgEl('feComponentTransfer', { in: 'elevContrast', result: 'whiteMask' });
    whiteMask.appendChild(svgEl('feFuncR', { type: 'gamma', amplitude: '1', exponent: '9', offset: '0' }));
    whiteMask.appendChild(svgEl('feFuncG', { type: 'gamma', amplitude: '1', exponent: '9', offset: '0' }));
    whiteMask.appendChild(svgEl('feFuncB', { type: 'gamma', amplitude: '1', exponent: '9', offset: '0' }));
    terrain.appendChild(whiteMask);
    terrain.appendChild(svgEl('feColorMatrix', { in: 'whiteMask', type: 'matrix', values: '0 0 0 0 0.97  0 0 0 0 0.97  0 0 0 0 0.95  1 0 0 0 0', result: 'whiteLayer' }));
    terrain.appendChild(svgEl('feComposite', { in: 'whiteLayer', in2: 'withGrey', operator: 'over', result: 'withCaps' }));

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

    // Ownership: a colored border traced around each nation's merged
    // territory (nationGlobeGeometryByName), drawn on top of the terrain,
    // instead of a solid per-province fill color. A nation whose merge
    // failed simply has no border drawn (its land still renders as
    // terrain and is still clickable via the hitbox layer above) - logged
    // the same way mergeProvinceGeometry() already logs a failed merge
    // elsewhere in this file.
    const borderG = svgEl('g');
    Object.keys(claimsByName).forEach(function(nationName){
      const geometry = nationGlobeGeometryByName[nationName];
      if (!geometry){
        console.warn('[Map] No merged globe geometry for ' + nationName + ' - skipping its border overlay');
        return;
      }
      const p = svgEl('path', {
        class: 'nation-border', fill: 'none',
        stroke: nationColor[nationName] || NEUTRAL_HEX, 'stroke-width': '2.4',
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
    globeSphereEl = svgEl('path', { class: 'globe-sphere', fill: WATER });
    container.appendChild(globeSphereEl);

    globeGraticuleEl = svgEl('path', { class: 'globe-graticule' });
    container.appendChild(globeGraticuleEl);

    const globeProvincesGroup = svgEl('g');

    // Unclaimed land: one solid, non-interactive shape per continent/
    // island (see buildUnclaimedGeometry()), drawn first (bottom of the
    // stack) - exactly like the flat map.
    const continentShapeFeatures = [];
    Object.keys(continentGlobeGeometryById).forEach(function(continentId){
      continentShapeFeatures.push({
        id: 'continent:' + continentId, label: continentId,
        color: tintForContinent(continentId), geometry: continentGlobeGeometryById[continentId],
      });
    });
    const failedContinents = {};
    (typeof CONTINENTS !== 'undefined' ? CONTINENTS : []).forEach(function(c){
      if (!continentGlobeGeometryById[c.id]) failedContinents[c.id] = true;
    });
    continentShapeFeatures.forEach(function(f){
      const p = svgEl('path', { class: 'nation-province continent-shape', fill: f.color });
      p.dataset.id = f.id;
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
    globeZoomFactor = Math.max(0.5, Math.min(5, globeZoomFactor * factor));
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

  // theme.js calls this after switching the Appearance theme (same
  // convention as map.js's window.refreshMapTheme) - only "Relief" needs
  // a real rebuild here, since it's the only theme that changes how the
  // globe is actually constructed (terrain filter vs. flat fills); the
  // other themes reskin via CSS variables the existing DOM already reads
  // from, no rebuild required.
  window.refreshGlobeTheme = function(){
    if (!globeBuilt) return; // first build (if any) will already pick up the current theme
    const mode = currentGlobeMode();
    if (mode === globeBuiltMode) return;
    globeBuilt = false;
    buildGlobeView();
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

    const sortedNames = Object.keys(claimsByName).sort();
    nationColor = {};
    sortedNames.forEach(function(name, i){ nationColor[name] = colorForIndex(i); });

    landBioByName = landBio.rows;
    landBioConfigured = landBio.configured;
    landBioError = landBio.error;

    buildFeatures();
    buildNationGeometry();
    buildUnclaimedGeometry();
    buildFlatMap();
    buildNationLegend();

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
