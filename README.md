# Land Claim Map

An interactive map that lets community members claim up to 20 provinces
and generate a land bio based on their selection. Includes toggleable
Provinces / Economic Output / Climate / Terrain layers, and an Admin Page
for locking in accepted claims so they can't be selected again.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page structure |
| `style.css` | All styling, including the three themes |
| `data.js` | Province geometry, economic and climate data |
| `map.js` | Map rendering, selection, zoom/pan, layer switching |
| `landbio.js` | Land bio generation — edit this to change wording/logic |
| `theme.js` | Appearance dropdown — switches and persists the color theme |
| `claims.js` | Shared loader for `claims.json`, used by both pages below |
| `claims.json` | The list of accepted claims — see "Managing claims" below |
| `admin.html` / `admin.css` / `admin.js` | The Admin Page |

## Managing claims

`admin.html` is where accepted claims get recorded. Important: **this is a
static site with no server or database**, so there's no way for a claim
entered on the Admin Page to instantly appear for other visitors. The
actual workflow is:

1. Open `admin.html`, enter the claimant's name and their claim code
   (the same format the main map's "Copy Claim Code" / "Load a Claim
   Code" features use, e.g. `S9, S12, N4`), and click **Record Claim**.
   The page checks for conflicts against every other recorded claim.
2. Once you've recorded everything you want to add, click **Export
   claims.json** to download the updated file.
3. Commit that file to the repo, replacing the existing `claims.json`.
   Once GitHub Pages redeploys (usually under a minute), those provinces
   show up greyed out and unselectable on the map for everyone.

The Admin Page keeps a local working copy in your browser (as a safety
net against losing unsaved edits), but `claims.json` — the file you fetch
fresh, edit, and export — is always the real source of truth. Use
**Import claims.json** if you need to load an existing file back in to
keep editing it.

**No login:** `admin.html` has no authentication. Anyone with the URL can
open it. Keep the link private, or link to it only from somewhere your
admins already trust. Real access control would require a backend, which
is out of scope for a static GitHub Pages site.

## Running locally

No build step — just serve the folder (e.g. `python3 -m http.server`) and
open `index.html`. Note: `claims.json` loads via `fetch()`, which most
browsers block for pages opened directly via `file://` — serve over
`http://` locally (as above) to test claim-locking; GitHub Pages always
serves over `https://`, so this isn't an issue once deployed.

## License

This project uses split licensing:

- **Code** (`index.html`, `style.css`, `map.js`, `landbio.js`, `theme.js`,
  `claims.js`, `admin.html`, `admin.css`, `admin.js`, and the general
  structure of `data.js`) is MIT licensed — see [LICENSE](LICENSE).
- **World content** (the specific province data in `data.js`, the source
  map/climate files, and any related lore) is all rights reserved — see
  [NOTICE](NOTICE).

If you're building a similar tool for your own setting, keep the code and
swap in your own `data.js` and source map files.
