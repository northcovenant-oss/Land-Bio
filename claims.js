/*
 * CLAIMS LOADER
 * -------------
 * Used by index.html to grey out/lock already-claimed provinces on the map.
 *
 * Reads live from the community's "Admin Post" Google Sheet tab via its
 * "Publish to the web" CSV feed - reversed from a typical spreadsheet
 * layout: instead of one row per nation with a column per field, this
 * sheet runs sideways. Row 2 holds every nation's name, one per column;
 * row 20 holds the matching claim code, in the SAME column position
 * (column C's name pairs with column C's claim code, and so on). Column A
 * is assumed to be a row label ("Nation" / "Claim Code"), not actual
 * data - real entries start at column B. Flag if that's wrong.
 *
 * Each claim record returned:
 *   { id: "col-2", name: "Testlandia", provinces: ["S9","S12"], capital: "S9", dateAdded: null }
 *
 * `capital` is the label of one of the entries in `provinces`, or null if
 * no capital was marked - a trailing "*" on a label in the claim code
 * marks it, the same convention the bio page's own Claim Code box uses.
 *
 * DIAGNOSTICS: unlike the previous version, this one always logs to the
 * console - a success line with how many claims it found, or a warning
 * with the specific failure reason - so checking whether this is working
 * doesn't require manually calling anything in DevTools. Also exposes
 * window.ClaimsStore.VERSION so a stale cached copy can be spotted at a
 * glance (console.log(window.ClaimsStore.VERSION)).
 *
 * NOTE: this fetches a public URL from the browser at page-load time. The
 * plain /export?format=csv endpoint threw a NetworkError once actually
 * deployed (a CORS issue, near-certainly), so this now uses the sheet's
 * "Publish to the web" CSV feed instead - Google's own purpose-built
 * mechanism for exactly this kind of external consumption. I still can't
 * verify the live fetch or the sheet's exact layout myself (no external
 * network access in the environment I work in), so please confirm the
 * live page picks this up correctly.
 */

(function () {
  // "Publish to the web" URL for the Admin Post tab (File > Share >
  // Publish to web > select this tab > CSV). This is Google's own
  // purpose-built mechanism for exactly this kind of public, external
  // consumption, and has the most reliable CORS support of the three
  // approaches tried here - the plain /export?format=csv endpoint threw a
  // NetworkError when actually deployed (a CORS issue, near-certainly),
  // and while gviz/tq was tried as a fallback, this published URL should
  // supersede both.
  const CLAIMS_SHEET_CSV_URL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vR7W_8C-QWQO6AmHUYrvI4FdlyTMRV3qe65QIF-abGoH_YZRexNYMvCQQfLyJPWM_vQn_x26rVS_xmF/pub?gid=1336017158&single=true&output=csv";
  const NATION_ROW_INDEX = 1;       // row 2 (0-indexed)
  const CLAIM_CODE_ROW_INDEX = 19;  // row 20 (0-indexed)
  const FIRST_DATA_COLUMN = 1;      // column B (0-indexed) - column A assumed to be a row label

  // Minimal CSV row parser (handles quoted fields, escaped quotes) - no
  // external library, same approach used for the Market Saturation sheet.
  function parseCsvLine(line) {
    const result = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQuotes) {
        if (c === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; }
          else { inQuotes = false; }
        } else { cur += c; }
      } else {
        if (c === '"') inQuotes = true;
        else if (c === ",") { result.push(cur); cur = ""; }
        else cur += c;
      }
    }
    result.push(cur);
    return result;
  }

  // Turns a claim code string (e.g. "S9*, S12, N4") into { provinces, capital }.
  // Unrecognized labels are silently skipped rather than rejecting the
  // whole row - a live, player-editable sheet will have the occasional
  // typo, and one bad label shouldn't hide an otherwise-valid claim.
  function parseClaimCode(raw, byLabel) {
    const tokens = raw.split(/[,\s]+/).map(function (t) { return t.trim().toUpperCase(); }).filter(Boolean);
    const provinces = [];
    const seen = {};
    let capital = null;
    tokens.forEach(function (tok) {
      const isCapitalTok = tok.charAt(tok.length - 1) === "*";
      const label = isCapitalTok ? tok.slice(0, -1) : tok;
      const p = byLabel[label];
      if (!p) return;
      if (seen[p.label]) return;
      seen[p.label] = true;
      provinces.push(p.label);
      if (isCapitalTok) capital = p.label;
    });
    return { provinces: provinces, capital: capital };
  }

  function loadClaims() {
    // Guard against fetch() itself being unavailable, and against any
    // other synchronous throw - an uncaught error here would abort
    // map.js entirely, breaking far more than just claim-locking.
    try {
      if (typeof fetch !== "function") {
        console.warn("[ClaimsStore] fetch() is not available - skipping the claims sheet.");
        return Promise.resolve([]);
      }
      const byLabel = {};
      // data.js declares `const PROVINCES = [...]`. Top-level const/let
      // across separate <script> tags share the page's lexical scope, but
      // do NOT become window properties (unlike var) - so window.PROVINCES
      // is genuinely undefined even though the bare identifier works fine.
      // This was the actual bug behind "Loaded 0 claim(s)" with otherwise
      // valid data: window.PROVINCES silently evaluated to undefined,
      // byLabel ended up empty, and every single province label lookup
      // failed. Checking the bare identifier first fixes it; window.PROVINCES
      // stays as a defensive fallback in case that declaration ever changes
      // to var.
      const allProvinces = (typeof PROVINCES !== "undefined") ? PROVINCES : (window.PROVINCES || []);
      allProvinces.forEach(function (p) { byLabel[p.label] = p; });

      return fetch(CLAIMS_SHEET_CSV_URL, { cache: "no-store" })
        .then(function (res) {
          if (!res.ok) throw new Error("HTTP " + res.status);
          return res.text();
        })
        .then(function (csvText) {
          const rows = csvText.split(/\r?\n/).map(parseCsvLine);
          const nameRow = rows[NATION_ROW_INDEX] || [];
          const claimCodeRow = rows[CLAIM_CODE_ROW_INDEX] || [];
          const claims = [];
          const lastCol = Math.max(nameRow.length, claimCodeRow.length);
          for (let col = FIRST_DATA_COLUMN; col < lastCol; col++) {
            const name = (nameRow[col] || "").trim();
            const claimCodeRaw = (claimCodeRow[col] || "").trim();
            if (!name || !claimCodeRaw) continue;
            const parsed = parseClaimCode(claimCodeRaw, byLabel);
            if (parsed.provinces.length === 0) continue;
            claims.push({
              id: "col-" + col,
              name: name,
              provinces: parsed.provinces,
              capital: parsed.capital,
              dateAdded: null,
            });
          }
          console.log("[ClaimsStore] Loaded " + claims.length + " claim(s): " +
            claims.map(function (c) { return c.name; }).join(", "));
          return claims;
        })
        .catch(function (e) {
          // Network error, sheet moved/became private, or unexpected
          // format - fail quietly to an empty list rather than breaking
          // the page, but always log why.
          console.warn("[ClaimsStore] Could not load claims from the sheet:", e.message);
          return [];
        });
    } catch (e) {
      console.warn("[ClaimsStore] Could not load claims from the sheet:", e.message);
      return Promise.resolve([]);
    }
  }

  // Builds a lookup of provinceId -> claim record, for every province
  // across every claim. Two claims should never contain the same
  // province, but if the sheet ever has an overlap, the later column wins.
  function buildProvinceIndex(claims) {
    const index = {};
    claims.forEach(function (claim) {
      (claim.provinces || []).forEach(function (label) {
        index[label.toUpperCase()] = claim;
      });
    });
    return index;
  }

  // Diagnostic helper - fetches the sheet and dumps exactly what row 2 and
  // row 20 (plus a few neighbors) actually contain, so a layout mismatch
  // can be spotted directly instead of guessed at. Run in the console:
  //   window.ClaimsStore.debugDump()
  function debugDump() {
    if (typeof fetch !== "function") {
      console.warn("[ClaimsStore] fetch() is not available.");
      return;
    }
    fetch(CLAIMS_SHEET_CSV_URL, { cache: "no-store" })
      .then(function (res) {
        console.log("[ClaimsStore debug] HTTP status:", res.status, res.ok ? "(ok)" : "(NOT ok)");
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.text();
      })
      .then(function (csvText) {
        const rows = csvText.split(/\r?\n/).map(parseCsvLine);
        console.log("[ClaimsStore debug] Total rows in sheet:", rows.length);
        console.log("[ClaimsStore debug] First 400 chars of raw response:", csvText.slice(0, 400));
        console.log("[ClaimsStore debug] Row 1 (index 0):", rows[0]);
        console.log("[ClaimsStore debug] Row 2 (index 1) - expected nation names:", rows[1]);
        console.log("[ClaimsStore debug] Row 3 (index 2):", rows[2]);
        console.log("[ClaimsStore debug] Row 19 (index 18):", rows[18]);
        console.log("[ClaimsStore debug] Row 20 (index 19) - expected claim codes:", rows[19]);
        console.log("[ClaimsStore debug] Row 21 (index 20):", rows[20]);
      })
      .catch(function (e) {
        console.warn("[ClaimsStore debug] Fetch/parse failed:", e.message);
      });
  }

  window.ClaimsStore = {
    loadClaims: loadClaims,
    buildProvinceIndex: buildProvinceIndex,
    debugDump: debugDump,
    VERSION: "2026-09-07-row-based-rebuild",
  };
})();
