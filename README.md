# Rylet Province Builder

An interactive toolkit for the Rylet Region roleplay community on
NationStates. Players claim up to 20 provinces on the world map, generate a
land bio from their selection, and then complete a National Specialization
application for review. A companion globe page shows every nation's current
holdings.

## Pages

| Page | What it does |
|---|---|
| `index.html` | **Claim Your Lands** — the main map. Select provinces, switch between Provinces / Economic Output / Climate / Terrain layers, generate the land bio, and copy or load a Claim Code. Provinces already claimed on the community sheet are greyed out and locked. |
| `specialization.html` | **National Specialization** — the multi-step application opened from the land bio. Export slots tied to the World Exports ranking, military doctrine and focus points, National Identity, live Market Saturation badges, and BBC output (Citizen Card and Full Application) for forum submission. |
| `globe.html` | **Nations of Rylet** — read-only view of who holds what, as a spinnable globe or a flat map. |
| `admin.html` | **Admin** — checks a claim code against every existing claim for conflicts before it's added to the sheet. |

## Files

| File | Purpose |
|---|---|
| `index.html` | Main map page structure |
| `style.css` | Shared styling for all pages, including the color themes |
| `theme.js` | Appearance dropdown — switches and persists the color theme on every page |
| `data.js` | Province geometry plus economic, climate and terrain data for every province |
| `map.js` | Map rendering, selection, zoom/pan, layer switching, and the hand-off to the specialization page |
| `landbio.js` | Land bio generation — terrain/climate weighting, economy types, energy resources, collapsible descriptions. Edit this to change wording or logic |
| `claims.js` | `ClaimsStore` — loads existing claims live from the community Google Sheet; shared by the map, globe and admin pages |
| `specialization.html` / `specialization.css` | Specialization application page and styling |
| `specialization.js` | Step flow, requirement gating, population adjustments, small-claim export slots, and BBC generators |
| `specialization-data.js` | Specialization pools, military list, the `IMPORTS_BY_SPECIALIZATION` table, and the Market Saturation feed URL |
| `globe.html` / `globe.css` / `globe.js` | Nations of Rylet globe and flat map viewer |
| `admin.html` / `admin.css` / `admin.js` | The Admin page |
| `vendor/d3-geo.min.js` | d3-geo v3.1.1 bundle used by the globe (ISC — see `vendor/LICENSE-d3-geo.txt`) |
| `claims.json` | Legacy claims file from before claims moved to the Google Sheet. No page reads it any more |

## Where the data comes from

The site is static (GitHub Pages, no server or build step). Live data is
read in the browser from the community's Google Sheet:

- **Claims** — the *Admin Post* tab, via its "Publish to the web" CSV link
  (set in `claims.js` and `globe.js`). Nation names are on row 2 and claim
  codes on row 20, one nation per column. A trailing `*` on a province in
  the claim code marks the capital.
- **Market Saturation** — the *ST* tab (URL set in `specialization-data.js`).

To add or change a claim, update the sheet. Once Google refreshes the
published feed (usually a few minutes), the provinces lock on the map for
everyone. No commit is needed.

If claims ever stop appearing, open the browser console on the map page:
`ClaimsStore` always logs either how many claims it loaded or why it
failed, and `console.log(ClaimsStore.VERSION)` shows which copy of
`claims.js` is running.

### Admin page

Enter a claimant's name and claim code (the same format as the map's
**Copy Claim Code**, e.g. `S9, S12*, N4`) and **Record Claim** checks it
against every existing claim. The page keeps a working copy in your browser
as a safety net against losing edits. Its **Export claims.json** button
still produces the old file format, but that file is no longer used —
the sheet is the source of truth.

**No login:** anyone with the URL can open `admin.html`. Keep the link
private. Real access control would need a backend, which a static GitHub
Pages site doesn't have.

## Running locally

No build step — serve the folder (e.g. `python3 -m http.server`) and open
`index.html`. Pages opened directly via `file://` can't fetch the sheet, so
serve over `http://` to test claim locking and Market Saturation.

## License

This project uses split licensing:

- **Code** (all `.html`, `.css` and `.js` files, and the general structure
  of `data.js` and `specialization-data.js`) is MIT licensed — see
  [LICENSE](LICENSE).
- **World content** (the specific province data in `data.js`, the
  specialization and import tables in `specialization-data.js`, the source
  map files, and any related lore) is all rights reserved — see
  [NOTICE](NOTICE).
- **Third-party code** in `vendor/` keeps its own license.

If you're building a similar tool for your own setting, keep the code and
swap in your own `data.js`, `specialization-data.js` and map files.
