/*
 * LAND BIO GENERATOR
 * -------------------
 * This is the only file you need to touch to change how land bios are
 * written. map.js calls window.generateLandBio(provinces) when someone
 * hits "Generate Land Bio".
 *
 * `provinces` is an array of the claimed province objects, in the order
 * they were claimed. Each one looks like:
 *
 *   {
 *     id: "path123",
 *     label: "S42",              // display name (rename these in data.js
 *                                 // once real province names exist)
 *     continent: "south",        // "north" or "south"
 *     fill: "#78b464",
 *     econ: "Agriculture Oriented",
 *     climate: {
 *       dominant: "Oceanic",
 *       breakdown: { "Oceanic": 87.4, "Semi-Arid": 12.6 }
 *     },
 *     isCapital: false           // true for at most one province - set on
 *                                 // the map by clicking the star next to a
 *                                 // claimed province in the sidebar list
 *   }
 *
 * generateLandBio returns (or resolves to, if you make it async — see the
 * note at the bottom) an object: { text, bbcCode }
 *   - text: the prose paragraph shown on the bio page
 *   - bbcCode: a forum-ready BBC-code version of the same claim, shown as
 *     the "Copy BBC Code" button's clipboard content
 *
 * Both are built from one shared computeEconomics() pass so the numbers
 * in the prose and the numbers in the BBC code always match — if you add
 * more output formats later, feed them from that same object rather than
 * recomputing sector splits again (each computation re-rolls the dice).
 *
 * Also included below: ECON_SECTOR_CONFIG and computeSectorSplit(), which
 * randomize a Services / Manufacturing / Extraction breakdown for each
 * province based on its econ category, per-generation. See the comment
 * above ECON_SECTOR_CONFIG for how to hard-code these instead later.
 */

function generateLandBio(provinces) {
  if (!provinces || provinces.length === 0) {
    return { text: "No provinces claimed yet.", bbcCode: "", perProvinceEnergy: [] };
  }

  const economics = computeEconomics(provinces);
  // Per-province energy value, rolled resource type (Coal/Natural Gas/Oil/
  // Uranium), and climate - used on the specialization page to gate/apply
  // both Fuel specialization multipliers (resource-based) and climate-
  // gated specializations like Forestry's wood types, keyed to whichever
  // provinces actually qualify rather than the claim as a whole.
  const resourceByLabel = {};
  Object.entries(economics.resourcesByType).forEach(([type, labels]) => {
    labels.forEach(label => { resourceByLabel[label] = type; });
  });
  const climateByLabel = {};
  provinces.forEach(p => { climateByLabel[p.label] = (p.climate && p.climate.dominant) || null; });
  const perProvinceEnergy = economics.energyProduction.perProvince.map(p => ({
    label: p.label,
    energy: p.value,
    resource: resourceByLabel[p.label] || null,
    climate: climateByLabel[p.label] || null,
    econ: p.econ || null,
  }));

  return {
    text: buildBioText(provinces, economics),
    bbcCode: buildBBCCode(provinces, economics),
    perProvinceEnergy,
  };
}


// One shared pass over the claimed provinces — climates, econ categories,
// and a randomized sector-percentage roll — that both output formats
// below are built from.
function computeEconomics(provinces) {
  const continents = uniq(provinces.map(p => p.continent));
  const climates = countBy(provinces, p => (p.climate ? p.climate.dominant : "Unknown"));
  const econs = countBy(provinces, p => p.econ);
  const topClimate = topEntry(climates);
  const topEcon = topEntry(econs);

  // Climates covering more than MAJOR_CLIMATE_THRESHOLD_PCT of the claim
  // each get their own full write-up (in both the prose text and the BBC
  // code); everything else is a "minor" climate, mentioned only in
  // passing. Computed once here so buildClimateParagraphs (text) and
  // buildBBCCode never disagree about which climates are "major."
  const total = provinces.length;
  const climateEntries = Object.entries(climates)
    .map(([name, count]) => ({ name, pct: (count / total) * 100 }))
    .sort((a, b) => b.pct - a.pct);
  const majorClimates = climateEntries.filter(e => e.pct > MAJOR_CLIMATE_THRESHOLD_PCT);
  const minorClimates = climateEntries.filter(e => e.pct <= MAJOR_CLIMATE_THRESHOLD_PCT);

  // Keep each province's own roll paired with its label/econ (not just the
  // blended total) - buildBioText uses this for the per-province testing
  // breakdown so the underlying per-province math can actually be checked,
  // not just trusted from the aggregate.
  const perProvinceSectors = provinces
    .map(p => ({ label: p.label, econ: p.econ, split: computeSectorSplit(p.econ) }))
    .filter(entry => entry.split);
  const sectorSplits = perProvinceSectors.map(entry => entry.split);
  const sectorTotals = sectorSplits.length > 0 ? computeSectorTotals(sectorSplits) : null;
  const classification = sectorTotals ? classifyEconomy(sectorTotals) : null;

  // Population: each province rolled independently (base 400,000-3 million x
  // its own econ modifier x its own climate modifier), then summed.
  const perProvincePopulation = provinces.map(p => ({ label: p.label, population: computeProvincePopulation(p) }));
  const totalPopulation = perProvincePopulation.reduce((sum, e) => sum + e.population, 0);

  const energyProduction = computeEnergyProduction(provinces);
  const foodProduction = computeFoodProduction(provinces);
  // Rolled once here (not separately in buildBioText/buildBBCCode) for the
  // same reason majorClimates/minorClimates are computed once above - so
  // the on-page text and the copied BBC code always show the same result
  // instead of two independent Math.random() rolls disagreeing.
  const resourcesByType = rollProvinceResources(provinces);

  // GDP - built from each province's OWN food/energy/population values
  // (already computed above, same order as `provinces`), not the claim
  // totals. Reuses those exact numbers rather than re-rolling anything,
  // so GDP can never drift from what's actually shown for Food/Energy/
  // Population elsewhere on the page.
  const gdp = computeGDP(provinces, foodProduction.perProvince, energyProduction.perProvince, perProvincePopulation);

  return { continents, climates, econs, topClimate, topEcon, majorClimates, minorClimates, sectorTotals, perProvinceSectors, classification, perProvincePopulation, totalPopulation, energyProduction, foodProduction, resourcesByType, gdp };
}

// Section headers in the returned text are marked with a leading "## " -
// map.js looks for that prefix and renders those lines as headings instead
// of paragraphs. The section names themselves (Climate, Economy, Resources
// & Production, Stable Population) intentionally match the BBC template's
// [b]Section[/b] headers one-for-one, so the on-page bio and the copied
// BBC code read as the same document in two formats rather than two
// different pieces of writing.
function buildBioText(provinces, econ) {
  const provinceList = provinces.map(p => p.label).join(", ");
  const capital = provinces.find(p => p.isCapital);

  let bio = "";
  bio += `This territory spans ${provinces.length} province${provinces.length === 1 ? "" : "s"} `;
  bio += econ.continents.length > 1
    ? `across both the northern and southern continents.`
    : `on the ${econ.continents[0]} continent.`;
  bio += capital ? ` Its capital is ${capital.label}.\n\n` : `\n\n`;

  bio += `## Climate\n\n`;
  bio += buildClimateParagraphs(provinces, econ);

  bio += `## Economy\n\n`;
  if (econ.sectorTotals) {
    const t = econ.sectorTotals;

    // From here down, mirrors the BBC code's own "Economy Type" / "World
    // Exports" fields - map.js recognizes the %%FIELD%% and %%TABLE%%
    // prefixes and renders them as a labeled field and a small table
    // respectively, instead of plain paragraphs, so the visible page and
    // the copied BBC code read as the same layout in two formats.
    bio += `%%TABLE%%Sector Breakdown|Services:${t.Services}%|Light Industry:${t.LightIndustry}%|` +
      `Heavy Industry:${t.HeavyIndustry}%|Extraction:${t.Extraction}%\n\n`;

    const classification = econ.classification;
    bio += `%%FIELD%%Economy Type|${classification.name}\n\n`;
    const desc = ECONOMY_DESCRIPTIONS[classification.name];
    if (desc) bio += `%%COLLAPSE%%Economy Description|${desc}\n\n`;

    const exports = buildWorldExports(classification.name, t);
    if (exports.some(Boolean)) {
      bio += `%%TABLE%%World Exports|1st:${exports[0]}|2nd:${exports[1]}|3rd:${exports[2]}|4th:${exports[3]}|5th:${exports[4]}\n\n`;
    }

    bio += `%%FIELD%%Total GDP|${formatCurrency(econ.gdp.total)}\n\n`;
  }

  bio += `## Resources & Production\n\n`;
  bio += `%%FIELD%%Energy Production|${formatEnergyProduction(econ.energyProduction.total)}\n\n`;
  const resourceEntries = Object.entries(econ.resourcesByType);
  if (resourceEntries.length > 0) {
    const resourceCells = resourceEntries.map(([type, labels]) => `${type}:${labels.join(', ')}`).join('|');
    bio += `%%TABLE%%Resources|${resourceCells}\n\n`;
  }
  bio += `%%FIELD%%Food Production|${formatFoodProduction(econ.foodProduction.total)}\n\n`;

  bio += `## Stable Population\n\n`;
  bio += `%%FIELD%%Population|${formatNumber(econ.totalPopulation)}\n\n`;

  bio += `Claimed provinces: ${provinceList}.`;

  return bio;
}

// Climates covering more than this share of the claim (by province count)
// each get their own full write-up; anything at or below the threshold
// gets folded into one brief "small pockets of..." mention, so a claim
// spanning many climate zones doesn't turn into a wall of text.
const MAJOR_CLIMATE_THRESHOLD_PCT = 10;

function buildClimateParagraphs(provinces, econ) {
  let out = "";

  // Mirrors the BBC code's own per-climate layout - [i]Name[/i] followed
  // by labeled Season(s)/Features/Agriculture/Examples/External Link
  // fields - so the two read as the same document. Features/Agriculture
  // stay as normal prose paragraphs (they're long-form writing); the
  // shorter fields use the %%FIELD%% marker map.js renders as a labeled
  // row, same as the Economy section's fields.
  econ.majorClimates.forEach(e => {
    const detail = CLIMATE_DETAILS[e.name];
    if (!detail) {
      out += `%%FIELD%%Climate|${e.name} (${Math.round(e.pct)}% of claim)\n\n`;
      out += `%%COLLAPSE%%Climate Description|${describeClimate(e.name)}.\n\n`;
      return;
    }
    const displayName = extractBBCLabel(detail.bbc) || e.name;
    out += `%%FIELD%%Climate|${displayName} (${Math.round(e.pct)}% of claim)\n\n`;
    out += `%%COLLAPSE%%Climate Description|${detail.features} ${detail.agriculture}\n\n`;

    const seasons = extractBBCField(detail.bbc, "Season\\(s\\):");
    if (seasons) out += `%%FIELD%%Season(s)|${seasons}\n\n`;
    const examples = extractBBCField(detail.bbc, "Examples:");
    if (examples) out += `%%FIELD%%Examples|${examples}\n\n`;
    const link = extractBBCField(detail.bbc, "External Link:");
    if (link) out += `%%FIELD%%External Link|${link}\n\n`;
  });

  if (econ.minorClimates.length > 0) {
    out += `Small pockets of ${joinWithAnd(econ.minorClimates.map(e => e.name))} round out the remaining terrain.\n\n`;
  }

  return out;
}

function joinWithAnd(items) {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

// Pulls a labeled sub-field (Season(s), Examples, External Link, etc.) out
// of a climate's verbatim BBC block, and the climate's own display name
// (the text inside the leading [i]...[/i]). Parsing these out of the
// single verbatim `bbc` string - rather than re-typing them as separate
// fields - means there's only one place that text can ever drift from the
// BBC code's own wording.
function extractBBCLabel(bbcStr) {
  const m = bbcStr.match(/^\[i\]([^\[]*)\[\/i\]/);
  return m ? m[1].trim() : "";
}
function extractBBCField(bbcStr, labelPattern) {
  const re = new RegExp("\\[u\\]" + labelPattern + "\\[/u\\]\\[list\\]([\\s\\S]*?)\\[/list\\]");
  const m = bbcStr.match(re);
  return m ? m[1].trim() : "";
}

// ---- BBC code output ----
//
// Fills in the community's forum application template with whatever we
// can confidently derive from the claim (dominant climate, top economy
// type, and the three sector percentages, ranked highest to lowest to
// match the template's generic "Primary / Secondary / Tertiary" columns).
// Everything else in the template (exports, resources, population, links)
// is intentionally left blank for manual completion, since we don't have
// that data yet.
//
// A few things in the template as given look like they may be typos or
// left incomplete (a duplicated "Energy Production" line, and two [url=]
// tags with no target) — those were left exactly as provided rather than
// guessed at. Worth double-checking against your forum before heavy use.

const BBC_TEMPLATE = `[spoiler=Land Bio] Land Bio: [nation][/nation]

[list][b]Climate[/b]: {{CLIMATE_BLOCK}}[/list]

[b]Economy[/b][list]| Primary: {{PRIMARY_PCT}}% | Secondary: {{SECONDARY_PCT}}% | Tertiary: {{TERTIARY_PCT}}% |
[*][u]Economy Type[/u]: 
 [i]{{ECON_TYPE}}[/i][list][*]{{ECON_TYPE_DESC}}
[/list][*][u]World Exports[/u]: 
 [list]| 1[sup]st[/sup] : {{EXPORT_1}} | 2[sup]nd[/sup] : {{EXPORT_2}} | 3[sup]rd[/sup] : {{EXPORT_3}} | 4[sup]th[/sup] : {{EXPORT_4}} | 5[sup]th[/sup] : {{EXPORT_5}} |[/list] 
 [*][i]Please look over the [url=https://www.nationstates.net/page=dispatch/id=2811225]Economic Guide[/url] to understand how your economy fits into the region.[/i][/list] 

[b]Resources & Production[/b]:
[list][*][u]Energy Production[/u]: {{ENERGY_PRODUCTION}}
[*][u]Resources[/u]: {{RESOURCES}}
[*][u]Food Production[/u]: {{FOOD_PRODUCTION}}[/list]

[b]Stable Population[/b]:
[list][*][u]Population[/u]: {{POPULATION}}
[*][i]Look over the [url=[/url] when choosing your population.[/i][/list][/list]
[i]If you have any questions or concerns feel free to contact me otherwise use this information to complete the application and you are all set[/i]
[/spoiler]`;

function buildBBCCode(provinces, econ) {
  let primaryPct = "", secondaryPct = "", tertiaryPct = "";
  if (econ.sectorTotals) {
    // Explicitly the three combined sectors (Manufacturing = Light + Heavy
    // recombined) - NOT Object.values(), since sectorTotals now also
    // carries the Light/Heavy sub-buckets and this table's fixed 3-column
    // forum-template format has no room for a 5-way ranking.
    const t = econ.sectorTotals;
    const ranked = [t.Services, t.Manufacturing, t.Extraction].sort((a, b) => b - a);
    [primaryPct, secondaryPct, tertiaryPct] = ranked;
  }

  // One full [i]Name[/i][list]...[/list] block per major climate (>10% of
  // the claim), concatenated with no separator - matches how multiple
  // climate blocks are meant to sit back to back in the forum template.
  // Falls back to a single empty-field block if a major climate somehow
  // isn't in CLIMATE_DETAILS.
  const climateBlock = econ.majorClimates.map(e => {
    const detail = CLIMATE_DETAILS[e.name];
    return detail ? detail.bbc
      : `[i]${e.name}[/i][list][u]Season(s):[/u][list][/list][u]Features:[/u][list][/list][u]Agriculture:[/u][list][/list][u]Examples:[/u][list][/list][u]External Link:[/u][list][/list][/list]`;
  }).join("");

  // The classification (Service Economy, Industrial Economy, etc.) rather
  // than the per-province econ category (Service Focused, etc.) - this
  // template slot's existing empty "[list][*]...[/list]" bullet was
  // clearly built to hold a description of an economy archetype like
  // these, not the more granular per-province category.
  const econType = econ.classification ? econ.classification.name : econ.topEcon;
  const econTypeDesc = econ.classification ? (ECONOMY_DESCRIPTIONS[econ.classification.name] || "") : "";
  const exports = econ.classification && econ.sectorTotals
    ? buildWorldExports(econ.classification.name, econ.sectorTotals)
    : ["", "", "", "", ""];

  const resourcesText = Object.entries(econ.resourcesByType)
    .map(([type, labels]) => `${type} (${labels.join(', ')})`)
    .join('; ');

  let filled = BBC_TEMPLATE
    .replace("{{CLIMATE_BLOCK}}", climateBlock)
    .replace("{{ECON_TYPE}}", econType)
    .replace("{{ECON_TYPE_DESC}}", econTypeDesc)
    .replace("{{PRIMARY_PCT}}", primaryPct)
    .replace("{{SECONDARY_PCT}}", secondaryPct)
    .replace("{{TERTIARY_PCT}}", tertiaryPct)
    .replace("{{EXPORT_1}}", exports[0])
    .replace("{{EXPORT_2}}", exports[1])
    .replace("{{EXPORT_3}}", exports[2])
    .replace("{{EXPORT_4}}", exports[3])
    .replace("{{EXPORT_5}}", exports[4])
    .replace("{{POPULATION}}", formatNumber(econ.totalPopulation))
    .replace("{{ENERGY_PRODUCTION}}", formatEnergyProduction(econ.energyProduction.total))
    .replace("{{RESOURCES}}", resourcesText)
    .replace("{{FOOD_PRODUCTION}}", formatFoodProduction(econ.foodProduction.total));

  // No resource data at all (every claimed province has unknown climate -
  // rare, but possible with the handful of sliver provinces) - drop the
  // whole bullet line rather than leaving "Resources: " with nothing
  // after it, matching buildBioText's behavior of omitting the section
  // entirely in the same situation.
  if (!resourcesText) {
    filled = filled.replace(/\n\[\*\]\[u\]Resources\[\/u\]: \n/, "\n");
  }

  return filled;
}

// ---- climate reference data ----
//
// One entry per climate zone: `bbc` is the exact BBC-formatted block (used
// only in the copyable BBC code — see buildBBCCode above), while `features`
// and `agriculture` are plain-English versions of the same content, used in
// the prose shown on the bio page itself so nobody sees raw [list]/[u] tags
// there. Keyed by the climate names used elsewhere in this app; "Tundra"
// and "Humid Subtropical" aren't produced by the current climate data but
// are included here in case a future climate raster adds them.

const CLIMATE_DETAILS = {
  "Polar": {
    bbc: `[i]Polar/ Ice Cap[/i][list][u]Season(s):[/u][list]Polar Day, Polar Night[/list][u]Features:[/u][list]In Ice Cap Climates, the temperature never or almost never exceeds 0 °C (32 °F). The climate covers areas in or near the polar regions, as well as the highest mountaintops. Such areas are covered by a permanent layer of ice and have no vegetation, but they may have animal life, that usually feeds from the oceans. Ice cap climates are inhospitable to human life.[/list][u]Agriculture:[/u][list]Very little vegetation exists allowing for only niche foods based off of the environment. Found mostly in polar regions and deserts where the climate is too extreme to support most forms of life.[/list][u]Examples:[/u][list] Inner Greenland, Antarctica[/list][u]External Link:[/u][list]https://en.wikipedia.org/wiki/Ice_cap_climate[/list][/list]`,
    features: "In Polar / Ice Cap climates, the temperature almost never exceeds 0\u00b0C (32\u00b0F). The land is permanently covered in ice with no vegetation, though animal life feeding from the oceans can still be found \u2014 conditions are largely inhospitable to human life.",
    agriculture: "Very little vegetation exists, allowing for only niche foods based on the environment \u2014 among the most extreme climates on the planet for sustaining life.",
  },
  "Tundra": {
    bbc: `[i]Tundra[/i][list][u]Season(s):[/u][list]Winter, Summer[/list][u]Features:[/u][list] Tundra climates signifying a local climate in which at least one month has an average temperature high enough to melt snow. Tundras are dominated by polar winds and extremely low temperatures. It is divided into two seasons Winter when temperatures range from −28 °C (−18 °F) to −50 °C (−58 °F) and Summer with a temperature around 12 °C (54 °F) leaving the ground marshy. Very little Precipitation.  [/list][u]Agriculture:[/u][list]Cold Pastoral regions are found in the upper latitudes in regions usually too cold to support traditional agriculture. The herding of livestock better adapted for the lower vegetation level is an important part of the culture.[/list][u]Examples:[/u][list]Far Northern Canada/Russia Greenland[/list][u]External Link:[/u][list]https://en.wikipedia.org/wiki/Tundra[/list][/list]`,
    features: "Tundra climates see at least one month warm enough to melt snow, but are otherwise dominated by polar winds and extreme cold \u2014 winters range from \u221228\u00b0C to \u221250\u00b0C (\u221218\u00b0F to \u221258\u00b0F), while summers hover around 12\u00b0C (54\u00b0F) and leave the ground marshy. Precipitation is very low.",
    agriculture: "Cold pastoral regions in these upper latitudes are usually too cold for traditional agriculture, so herding livestock adapted to sparse vegetation is an important part of the culture.",
  },
  "Sub Arctic": {
    bbc: `[i]Sub-Arctic[/i][list][u]Season(s):[/u][list]Winter, Summer[/list][u]Features:[/u][list]In Subarctic climates temperatures, can vary widely sometimes dipping below −40 °C (−40 °F) with highs of 30 °C (86 °F) with 5–7 consecutive months where the average temperature is below freezing. Precipitation is low but slightly better than in the Tundra. This region is usually dominated by expansive Taiga forests with heavy snow in the winter.[/list][u]Agriculture:[/u][list]Cold Pastoral regions are found in the upper latitudes in regions usually too cold to support traditional agriculture. The herding of livestock better adapted for the lower vegetation level is an important part of the culture.[/list][u]Examples:[/u][list] Northern Canada/Russia[/list][u]External Link:[/u][list]https://en.wikipedia.org/wiki/Subarctic_climate[/list][/list]`,
    features: "Sub Arctic climates vary widely, sometimes dipping below \u221240\u00b0C (\u221240\u00b0F) with highs of 30\u00b0C (86\u00b0F), and 5\u20137 consecutive months averaging below freezing. Precipitation is low but slightly better than the Tundra, with the region usually dominated by expansive taiga forest and heavy winter snow.",
    agriculture: "Cold pastoral regions are found in these upper latitudes, generally too cold for traditional agriculture \u2014 herding livestock adapted to sparse vegetation is an important part of the culture here.",
  },
  "Highlands": {
    bbc: `[i]Alpine/Highlands[/i][list][u]Season(s):[/u][list]Winter, Summer[/list][u]Features:[/u][list] Alpine Climates are found on mountains whose elevation causes a separate climate to form distinct from the surrounding one. No month has a mean temperature higher than 10 °C (50 °F) in an Alpine Climate.[/list][u]Agriculture:[/u][list] Alpine climates are found in and around mountain ranges where vegetation is lacking leading to an extremely specialized diet along with reliance on pastoralism.[/list][u]Examples:[/u][list]Mountains[/list][u]External Link:[/u][list] https://en.wikipedia.org/wiki/Alpine_climate [/list][/list]`,
    features: "Highlands / Alpine climates form on mountains whose elevation creates a separate climate from the surrounding lowlands \u2014 no month sees a mean temperature above 10\u00b0C (50\u00b0F).",
    agriculture: "Vegetation is sparse in and around these mountain ranges, leading to a highly specialized diet reliant on pastoralism.",
  },
  "Arid": {
    bbc: `[i]Arid/Desert[/i][list][u]Season(s):[/u][list] Dry or Summer, Winter[/list][u]Features:[/u][list]Hot desert climates usually feature hot, sometimes exceptionally hot, periods of the year. In many locations featuring a hot desert climate, maximum temperatures of over 40 °C (104 °F) are not uncommon in summer and can soar to over 45 °C (113 °F) in the hottest regions. precipitation is too low to sustain any vegetation at all, or at most a very scanty shrub. An area that features this climate usually experiences from 25 to 200 mm (7.87 inches) per year of precipitation and in some years may experience no precipitation at all.[/list][list]Cold desert climates usually feature warm (usually hot) and dry summers, though summers typically are not quite as hot as summers in hot desert climates. Unlike hot desert climates, cold desert climates tend to feature cold winters with rare snow. Cold desert climates are typically found at higher altitudes than hot desert climates and are usually drier than hot desert climates. A cold desert climate is typically found in temperate zones, usually in the rain shadow of high mountains, which restrict precipitation from the westerly winds.[/list][u]Agriculture:[/u][list]Very little vegetation exists allowing for only niche foods based off of the environment. Found mostly in polar regions and deserts where the climate is too extreme to support many forms of life. Subsistence based on hunting and gathering as well as domesticated migratory animals.[/list][u]Examples:[/u][list] Sahara Desert (Hot), Gobi Desert (Cold)[/list][u]External Link:[/u][list]https://en.wikipedia.org/wiki/Desert_climate[/list][/list]`,
    features: "Hot desert climates bring scorching periods, with summer highs regularly above 40\u00b0C (104\u00b0F) and up to 45\u00b0C (113\u00b0F) in the hottest regions; precipitation is too low to sustain more than scanty shrub, typically 25\u2013200mm a year and sometimes none at all. Cold desert climates instead see warm, dry summers and cold winters with rare snow, usually forming at higher altitude in the rain shadow of mountains that block precipitation.",
    agriculture: "Very little vegetation exists, allowing for only niche foods based on the environment, with subsistence relying on hunting, gathering, and domesticated migratory animals.",
  },
  "Semi-Arid": {
    bbc: `[i]Semi-Arid/Steppe[/i][list][u]Season(s):[/u][list] Summer, Winter[/list][u]Features:[/u][list]Hot semi-arid climates tend to be located in the tropics and subtropics. These climates tend to have hot, sometimes extremely hot, summers and mild to warm winters. Snow rarely (if ever) falls in these regions. Hot semi-arid climates are most commonly found on the fringes of subtropical deserts.[/list][list]Cold semi-arid climates tend to be in temperate zones or elevated portions in subtropical zones. They are typically found in continental interiors some distance from large bodies of water. Cold semi-arid climates usually feature hot and dry summers. These areas usually see some snowfall during the winter, though snowfall is much lower than at locations at similar latitudes with more humid climates, and are sometimes subject to major temperature swings between day and night. [/list][u]Agriculture:[/u][list]Hot Pastoral regions are found in semi-arid to arid regions where most food production comes from basic subsistence farming and the herding of livestock better adapted for the lower vegetation level.[/list][u]Examples:[/u][list] Australian Out Back (Hot) Eurasian Steppes, Rocky Mountains (Cold)[/list][u]External Link:[/u][list] https://en.wikipedia.org/wiki/Semi-arid_climate[/list][/list]`,
    features: "Hot Semi-Arid climates are found mostly in the tropics and subtropics, on the fringes of subtropical deserts, with hot (sometimes extremely hot) summers, mild-to-warm winters, and rare snow. Cold semi-arid climates instead sit in temperate continental interiors, with hot, dry summers, some winter snowfall, and often sharp day-to-night temperature swings.",
    agriculture: "Pastoral regions here rely on basic subsistence farming alongside herding livestock adapted to sparse vegetation.",
  },
  "Mediterranean": {
    bbc: `[i]Mediterranean[/i][list][u]Season(s):[/u][list]Summer, Winter[/list][u]Features:[/u][list]Mediterranean climates are characterized by dry summers and mild, moist winters. The average temperature is above 10 °C (50 °F) in their warmest months, and an average in the coldest between 18 to −3 °C (64 to 27 °F). The climate receives almost all of its precipitation during the winter, autumn and spring seasons, and may go anywhere from 4 to 6 months during the summer without having any significant precipitation.[/list][u]Agriculture:[/u][list]Mediterranean regions have a specialized diet based around it\u2019s distinct climate. The environment leads to more niche foods suitable for the drier climate such as olive oil, and wines. [/list][u]Examples:[/u][list]The Mediterranean Basin, California[/list][u]External Link:[/u][list]https://en.wikipedia.org/wiki/Mediterranean_climate[/list][/list]`,
    features: "Mediterranean climates bring dry summers and mild, moist winters, with warmest-month averages above 10\u00b0C (50\u00b0F) and coldest-month averages between 18\u00b0C and \u22123\u00b0C (64\u00b0F to 27\u00b0F). Nearly all precipitation falls in winter, autumn, and spring, leaving 4 to 6 summer months with little to no rain.",
    agriculture: "The dry climate shapes a specialized diet built around niche crops like olives and grapes, producing regional staples such as olive oil and wine.",
  },
  "Tropical Wet Dry": {
    bbc: `[i]Savanna/Tropical Wet & Dry[/i][list][u]Season(s):[/u][list]Wet, Dry[/list][u]Features:[/u][list]Tropical savanna climates have monthly mean temperatures above 18 °C (64 °F) in every month of the year and typically a pronounced dry season, with the driest month having precipitation less than 60 mm. The difference between the wet and dry season can either be quite pronounced in either direction or relatively equal depending on location and yearly patterns[/list][u]Agriculture:[/u][list]Seasonal regions are dependent on a wet season to produce most crops, focusing on plants that can survive in waterlogged conditions. Droughts can have a profound effect on people\u2019s lives as it can seriously hamper food production. Most food is produced on a subsistence level. [/list][u]Examples:[/u][list]South East Asia, Central Africa[/list][u]External Link:[/u][list]https://en.wikipedia.org/wiki/Tropical_savanna_climate[/list][/list]`,
    features: "Tropical Wet & Dry (savanna) climates stay above 18\u00b0C (64\u00b0F) year-round with a pronounced dry season \u2014 the driest month sees less than 60mm of rain \u2014 though the contrast between wet and dry seasons varies by location and year.",
    agriculture: "These seasonal regions depend heavily on the wet season to produce most crops, favoring plants that tolerate waterlogged conditions; droughts can seriously disrupt food production, which is mostly subsistence-level.",
  },
  "Humid Continental": {
    bbc: `[i]Humid Continental[/i][list][u]Season(s):[/u][list]Spring, Summer, Autumn, Winter[/list][u]Features:[/u][list] In the Humid Continental Climate, precipitation is relatively well distributed year-round in many areas, while others may see a marked reduction in wintry precipitation, which increases the chances of a wintertime drought.  Snowfall occurs in all areas with a humid continental climate and in many such places is more common than rain during the height of winter. In places with sufficient wintertime precipitation, the snow cover is often deep, having the coldest month mean temperature below -3 C (26.6 F). [/list][u]Agriculture:[/u][list]Continental climates are well known as bread basket regions. The immense flat lands are perfect for growing staple crops like corn, wheat, and barley on a large scale.[/list][u]Examples:[/u][list]Western Russia/Ukraine, United States Mid-West [/list][u]External Link:[/u][list]https://en.wikipedia.org/wiki/Humid_continental_climate[/list][/list]`,
    features: "Humid Continental climates see precipitation fairly well distributed year-round in many areas, though some see markedly less winter precipitation and a higher risk of wintertime drought. Snow falls everywhere in this climate and is often more common than rain in the depths of winter, with the coldest month averaging below \u22123\u00b0C (26.6\u00b0F).",
    agriculture: "Known as classic bread-basket regions, the vast flat lands here are ideal for large-scale staple crops like corn, wheat, and barley.",
  },
  "Oceanic": {
    bbc: `[i]Marine West Coast/Oceanic[/i][list][u]Season(s):[/u][list]Spring, Summer, Autumn, Winter[/list][u]Features:[/u][list]The Marine West Coast or Oceanic Climate has a very mild climate lacking in extreme temperatures. It typically lacks a dry season, as precipitation is consistent throughout the year. Summers are cool due to cool ocean currents, winters are mild usually very cloudy. With Summers below 22 °C (72 °F) and winters above −3 °C (27 °F).[/list][u]Agriculture:[/u][list]Temperate regions are excellent for traditional farming techniques well suited for a host of different crops that can be grown in the mid-latitudes. It usually lacking a large scale industrial production due to the terrain. [/list][u]Examples:[/u][list]Western Europe, Pacific NW North America, South Africa[/list][u]External Link:[/u][list]https://en.wikipedia.org/wiki/Oceanic_climate[/list][/list]`,
    features: "Oceanic climates are mild and lack extreme temperatures, with no real dry season since precipitation stays fairly consistent year-round. Cool ocean currents keep summers below 22\u00b0C (72\u00b0F), while winters stay mild \u2014 usually cloudy \u2014 and above \u22123\u00b0C (27\u00b0F).",
    agriculture: "These temperate regions suit traditional farming techniques and a wide range of mid-latitude crops well, though large-scale industrial agriculture is less common given the terrain.",
  },
  "Tropical Rainforest": {
    bbc: `[i]Rain Forest/Tropical Wet[/i][list][u]Season(s):[/u][list]Wet[/list][u]Features:[/u][list]Tropical rainforests have a type of tropical climate in which there is no dry season – all months have an average precipitation value of at least 60 mm. Tropical rainforests have no summer or winter; it is typically hot and wet throughout the year and rainfall is both heavy and frequent. One day in an equatorial climate can be very similar to the next, while the change in temperature between day and night may be more significant than the average change in temperature across the year.[/list][u]Agriculture:[/u][list]Tropical regions produce food through labor-intensive cultivation. Traditional farming techniques usually can\u2019t be supported without widespread deforestation. Most food is produced on a subsistence level and comes from trees. Tropical Fruits, Teas, Rice, and Beans are some of the many crops grown here. [/list][u]Examples:[/u][list]Amazon Rainforest, Indonesia[/list][u]External Link:[/u][list]https://en.wikipedia.org/wiki/Tropical_rainforest_climate[/list][/list]`,
    features: "Tropical Rainforest climates have no dry season at all \u2014 every month averages at least 60mm of rain \u2014 and no real summer or winter, staying hot and wet with heavy, frequent rainfall year-round. Day-to-day weather barely changes, and the swing between day and night temperatures can exceed the swing across the whole year.",
    agriculture: "Food here comes through labor-intensive cultivation, since traditional farming can rarely be sustained without heavy deforestation; most food is subsistence-level and tree-grown, including tropical fruits, tea, rice, and beans.",
  },
  "Humid Subtropical": {
    bbc: `[i]Humid Subtropical[/i][list][u]Season(s):[/u][list]Summer, Winter[/list][u]Features:[/u][list]Humid Subtropical climates feature mean temperatures in the coldest months between 0 °C (32 °F) and 18 °C (64 °F) and mean temperatures in the warmest months of 22 °C (72 °F) or higher. They tend to have more uniform rainfall. Most summer rainfall occurs during thunderstorms. Dry Seasons can occur in the winter although mostly in extreme conditions. [/list][u]Agriculture:[/u][list] Subtropical regions are well suited for growing Cash Crop. The climate allows for the cultivation of fast growing highly valued crops such as cotton, soybeans, tobacco, and fruits. Rice is usually produced in this region as well due to the rainfall. [/list][u]Examples:[/u][list] Southern United States, Southern China[/list][u]External Link:[/u][list]https://en.wikipedia.org/wiki/Humid_subtropical_climate[/list][/list]`,
    features: "Humid Subtropical climates see coldest-month means between 0\u00b0C and 18\u00b0C (32\u00b0F to 64\u00b0F) and warmest-month means of 22\u00b0C (72\u00b0F) or higher, with fairly uniform rainfall \u2014 mostly from summer thunderstorms \u2014 and only rare, extreme-condition winter dry spells.",
    agriculture: "These regions suit fast-growing, high-value cash crops like cotton, soybeans, tobacco, and fruit, with rice also common thanks to reliable rainfall.",
  },
};

// ---- economic sector randomization ----
//
// Every province's econ category (e.g. "Service Focused", "Mineral Oriented")
// implies a ranking of three underlying sectors — Services, Manufacturing,
// and Extraction — and "Focused" vs "Oriented" controls how lopsided the
// split is. This is computed fresh each time a bio is generated; if you'd
// rather lock these numbers in per-province instead of re-rolling them
// every time, this is the place to swap random generation for a lookup
// against a value stored in data.js.

const ECON_SECTOR_CONFIG = {
  "Service Focused":      { order: ["Services", "Manufacturing", "Extraction"], magnitude: "focused" },
  "Service Oriented":     { order: ["Services", "Manufacturing", "Extraction"], magnitude: "oriented" },
  "Production Focused":   { order: ["Manufacturing", "Services", "Extraction"], magnitude: "focused" },
  "Energy Focused":       { order: ["Extraction", "Services", "Manufacturing"], magnitude: "focused" },
  "Energy Oriented":      { order: ["Manufacturing", "Extraction", "Services"], magnitude: "oriented" },
  "Agriculture Focused":  { order: ["Extraction", "Services", "Manufacturing"], magnitude: "focused" },
  "Agriculture Oriented": { order: ["Manufacturing", "Extraction", "Services"], magnitude: "oriented" },
  "Mineral Focused":      { order: ["Extraction", "Services", "Manufacturing"], magnitude: "focused" },
  "Mineral Oriented":     { order: ["Manufacturing", "Extraction", "Services"], magnitude: "oriented" },
};

// Manufacturing is further split into Light Industry and Heavy Industry.
// Light Industry = Manufacturing % × this factor (rounded); Heavy Industry
// is whatever's left, so Light + Heavy always equals Manufacturing exactly
// for that province.
const LIGHT_INDUSTRY_FACTOR = {
  "Service Focused":      0.75,
  "Service Oriented":     0.50,
  "Production Focused":   0.40,
  "Energy Focused":       0.10,
  "Energy Oriented":      0.20,
  "Agriculture Focused":  0.75,
  "Agriculture Oriented": 0.80,
  "Mineral Focused":      0.10,
  "Mineral Oriented":     0.20,
};

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ---- population ----
//
// Each province gets a randomized base population (400,000-3 million), then
// scaled by its econ category's and dominant climate's modifiers below.
// Computed once per province in computeEconomics (same pass as the sector
// splits) so the prose text and the BBC code always show the same total.
const ECON_POPULATION_MODIFIER = {
  "Service Focused":      1.4,
  "Service Oriented":     1,
  "Production Focused":   1.3,
  "Energy Focused":       0.5,
  "Energy Oriented":      0.6,
  "Agriculture Focused":  0.8,
  "Agriculture Oriented": 0.9,
  "Mineral Focused":      0.5,
  "Mineral Oriented":     0.6,
};

const CLIMATE_POPULATION_MODIFIER = {
  "Polar":               0.1,
  "Tundra":              0.25,
  "Sub Arctic":          0.5,
  "Highlands":           0.7,
  "Arid":                0.8,
  "Semi-Arid":           0.9,
  "Mediterranean":       1,
  "Tropical Wet Dry":    1.05,
  "Humid Continental":   1.1,
  "Oceanic":             1.15,
  "Tropical Rainforest": 1.3,
  "Humid Subtropical":   1.35,
};

function computeProvincePopulation(p) {
  const base = randInt(400000, 3000000);
  const econMod = ECON_POPULATION_MODIFIER[p.econ] != null ? ECON_POPULATION_MODIFIER[p.econ] : 1;
  const climateName = p.climate ? p.climate.dominant : null;
  const climateMod = (climateName && CLIMATE_POPULATION_MODIFIER[climateName] != null) ? CLIMATE_POPULATION_MODIFIER[climateName] : 1;
  return Math.round(base * econMod * climateMod);
}

function formatNumber(n) {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// ---- energy production ----
//
// A single claim-wide modifier, not a per-province one. Every province
// rolls a random value from a range set by its econ category, then that
// roll gets scaled by a claim-size multiplier - P2 for every category
// except the two Energy ones, which use O2 instead (both P2 and O2 come
// from the SAME claim-size bracket, just different columns of it). The
// per-province results are summed, then rounded once at the end.
const ENERGY_COUNT_BRACKETS = [
  { min: 1,  max: 4,       P2: 0.25, O2: 0.50 },
  { min: 5,  max: 10,      P2: 0.50, O2: 0.75 },
  { min: 11, max: 20,      P2: 1.00, O2: 1.00 },
  { min: 21, max: Infinity, P2: 1.70, O2: 2.00 },
];
function getEnergyCountModifiers(numProvinces) {
  const bracket = ENERGY_COUNT_BRACKETS.find(b => numProvinces >= b.min && numProvinces <= b.max);
  return bracket || ENERGY_COUNT_BRACKETS[0];
}

const ENERGY_OUTPUT_CONFIG = {
  "Service Focused":      { range: [-2, 0],  uses: "P2" },
  "Service Oriented":     { range: [-3, -1], uses: "P2" },
  "Production Focused":   { range: [-7, -5], uses: "P2" },
  "Energy Focused":       { range: [15, 30], uses: "O2" },
  "Energy Oriented":      { range: [5, 15],  uses: "O2" },
  "Agriculture Focused":  { range: [-2, 1],  uses: "P2" },
  "Agriculture Oriented": { range: [-3, 0],  uses: "P2" },
  "Mineral Focused":      { range: [-5, -3], uses: "P2" },
  "Mineral Oriented":     { range: [-3, -1], uses: "P2" },
};

// Returns { total, perProvince, P2, O2 }. `total` is rounded once at the
// end (not per-province) to avoid compounding rounding error across a
// large claim.
function computeEnergyProduction(provinces) {
  const { P2, O2 } = getEnergyCountModifiers(provinces.length);
  let total = 0;
  const perProvince = provinces.map(p => {
    const config = ENERGY_OUTPUT_CONFIG[p.econ];
    if (!config) return { label: p.label, econ: p.econ, roll: 0, value: 0 };
    const roll = randInt(config.range[0], config.range[1]);
    const multiplier = config.uses === "O2" ? O2 : P2;
    const value = roll * multiplier;
    total += value;
    return { label: p.label, econ: p.econ, roll, value };
  });
  return { total: Math.round(total), perProvince, P2, O2 };
}

function formatSigned(n) {
  return (n >= 0 ? "+" : "") + n;
}

// "Energy Dependent" / "Energy Surplus" per the sign of the total. Exactly
// 0 wasn't specified either way, so it gets its own "Energy Balanced"
// label rather than being lumped into one of the other two.
function energyStatusLabel(n) {
  if (n < 0) return "Energy Dependent";
  if (n > 0) return "Energy Surplus";
  return "Energy Balanced";
}

function formatEnergyProduction(n) {
  return `${formatSigned(n)} ${energyStatusLabel(n)}`;
}

// ---- food production ----
//
// Same claim-size-scaled-random-sum pattern as Energy Production above,
// but with two differences: Agriculture categories use the T2 multiplier
// while every other category uses U2 (Energy Production split on Energy
// vs everyone else; this one splits on Agriculture vs everyone else),
// and the summed total gets a flat -20-per-selected-province penalty
// applied before classifying into one of five Food Production tiers.
const FOOD_COUNT_BRACKETS = [
  { min: 1,  max: 4,        T2: 0.75, U2: 0.75 },
  { min: 5,  max: 10,       T2: 0.80, U2: 0.75 },
  { min: 11, max: 20,       T2: 1.00, U2: 1.00 },
  { min: 21, max: Infinity, T2: 1.50, U2: 1.75 },
];
function getFoodCountModifiers(numProvinces) {
  const bracket = FOOD_COUNT_BRACKETS.find(b => numProvinces >= b.min && numProvinces <= b.max);
  return bracket || FOOD_COUNT_BRACKETS[0];
}

const FOOD_OUTPUT_CONFIG = {
  "Service Focused":      { range: [5, 10],  uses: "U2" },
  "Service Oriented":     { range: [10, 20], uses: "U2" },
  "Production Focused":   { range: [1, 10],  uses: "U2" },
  "Energy Focused":       { range: [1, 5],   uses: "U2" },
  "Energy Oriented":      { range: [5, 15],  uses: "U2" },
  "Agriculture Focused":  { range: [35, 75], uses: "T2" },
  "Agriculture Oriented": { range: [30, 40], uses: "T2" },
  "Mineral Focused":      { range: [1, 5],   uses: "U2" },
  "Mineral Oriented":     { range: [5, 15],  uses: "U2" },
};

// Returns { total, perProvince, T2, U2 }. `total` is rounded once at the
// end, after the -20/province penalty, not per-province.
function computeFoodProduction(provinces) {
  const { T2, U2 } = getFoodCountModifiers(provinces.length);
  let total = 0;
  const perProvince = provinces.map(p => {
    const config = FOOD_OUTPUT_CONFIG[p.econ];
    if (!config) return { label: p.label, econ: p.econ, roll: 0, value: 0 };
    const roll = randInt(config.range[0], config.range[1]);
    const multiplier = config.uses === "T2" ? T2 : U2;
    const value = roll * multiplier;
    total += value;
    return { label: p.label, econ: p.econ, roll, value };
  });
  total -= 20 * provinces.length;
  return { total: Math.round(total), perProvince, T2, U2 };
}

function foodClassification(n) {
  if (n < -300) return "Critical Food Importer";
  if (n < -200) return "Major Food Importer";
  if (n < 0) return "Minor Food Importer";
  if (n < 200) return "Minor Food Exporter";
  return "Major Food Exporter";
}

function formatFoodProduction(n) {
  return `${formatSigned(n)}: ${foodClassification(n)}`;
}

// ---- GDP ----
//
// Step 1 (per province): a GDP modifier from that SAME province's own
// Food Production, Energy Production, and Population values - not the
// claim-wide totals.
//   modifier = (food/20) + abs(energy/10) + (population/4,500,000)
// Step 2: a random base dollar figure drawn from a range set by the
// province's econ category.
// Step 3: GDP = base x modifier.
const GDP_RANGE = {
  "Service Focused":      [7500000000,  40000000000],
  "Service Oriented":     [1000000000,  55000000000],
  "Production Focused":   [750000000,   35000000000],
  "Energy Focused":       [500000000,   15000000000],
  "Energy Oriented":      [250000000,   25000000000],
  "Agriculture Focused":  [500000000,   15000000000],
  "Agriculture Oriented": [250000000,   25000000000],
  "Mineral Focused":      [500000000,   15000000000],
  "Mineral Oriented":     [250000000,   25000000000],
};

function randFloat(min, max) {
  return min + Math.random() * (max - min);
}

function computeGDPModifier(foodValue, energyValue, population) {
  return (foodValue / 20) + Math.abs(energyValue / 10) + (population / 4500000);
}

// Requires the food/energy/population per-province arrays already built
// elsewhere in computeEconomics (same order as `provinces`) - reuses
// those exact values rather than re-rolling food/energy/population
// independently here.
function computeGDP(provinces, foodPerProvince, energyPerProvince, populationPerProvince) {
  let total = 0;
  const perProvince = provinces.map((p, i) => {
    const foodValue = foodPerProvince[i] ? foodPerProvince[i].value : 0;
    const energyValue = energyPerProvince[i] ? energyPerProvince[i].value : 0;
    const population = populationPerProvince[i] ? populationPerProvince[i].population : 0;
    const modifier = computeGDPModifier(foodValue, energyValue, population);
    const range = GDP_RANGE[p.econ];
    const base = range ? randFloat(range[0], range[1]) : 0;
    const gdpValue = Math.round(base * modifier);
    total += gdpValue;
    return { label: p.label, econ: p.econ, modifier, base: Math.round(base), gdp: gdpValue };
  });
  return { perProvince, total: Math.round(total) };
}

function formatCurrency(n) {
  return "$" + formatNumber(Math.round(n));
}

// Returns { Services, Manufacturing, Extraction, LightIndustry, HeavyIndustry }
// percentages (integers) for a single province's econ category, or null if
// the category isn't recognized. Services + Manufacturing + Extraction sum
// to 100; LightIndustry + HeavyIndustry sum to exactly Manufacturing.
//
// Primary rolls 70-90% for Focused categories, 41-70% for Oriented ones;
// secondary and tertiary split whatever's left, with Oriented additionally
// keeping secondary from exceeding primary.
//
// Service Focused / Service Oriented get one further adjustment: Extraction
// (their tertiary sector) is kept under EXTRACTION_CAP_PCT (~10%), since a
// service economy should have very little raw resource extraction. Keeping
// secondary <= primary while also forcing tertiary that low requires
// primary to be at least MIN_FEASIBLE_PRIMARY_FOR_CAP - Service Focused's
// range (70-90) already always clears that on its own, but Service
// Oriented's normal range (41-70) doesn't reach it for every roll. Rather
// than rolling in the full 41-70 range and pushing low rolls up to the
// floor (which piles up a disproportionate share of rolls on exactly 46),
// Service Oriented rolls its primary directly within the feasible
// 46-70 window, so every value in range is equally likely.
const EXTRACTION_CAP_PCT = 10;
const EXTRACTION_CAPPED_ECONS = ["Service Focused", "Service Oriented"];
const MIN_FEASIBLE_PRIMARY_FOR_CAP = Math.ceil((101 - EXTRACTION_CAP_PCT) / 2); // = 46 at a 10% cap

function computeSectorSplit(econName) {
  const config = ECON_SECTOR_CONFIG[econName];
  if (!config) return null;

  const [primaryKey, secondaryKey, tertiaryKey] = config.order;
  const isCapped = EXTRACTION_CAPPED_ECONS.indexOf(econName) !== -1;
  let primary, secondary;

  if (config.magnitude === "focused") {
    primary = randInt(70, 90); // already always >= MIN_FEASIBLE_PRIMARY_FOR_CAP
  } else if (isCapped) {
    primary = randInt(MIN_FEASIBLE_PRIMARY_FOR_CAP, 70);
  } else {
    primary = randInt(41, 70);
  }

  if (isCapped) {
    const secondaryMax = Math.min(primary, 99 - primary);
    const secondaryMin = Math.min(secondaryMax, Math.max(9, (101 - EXTRACTION_CAP_PCT) - primary));
    secondary = randInt(secondaryMin, secondaryMax);
  } else if (config.magnitude === "focused") {
    secondary = randInt(9, 99 - primary);
  } else {
    secondary = randInt(9, Math.min(99 - primary, primary));
  }
  const tertiary = 100 - primary - secondary;

  const split = {
    [primaryKey]: primary,
    [secondaryKey]: secondary,
    [tertiaryKey]: tertiary,
  };

  const factor = LIGHT_INDUSTRY_FACTOR[econName] != null ? LIGHT_INDUSTRY_FACTOR[econName] : 0.5;
  const manufacturing = split.Manufacturing || 0;
  const light = Math.round(manufacturing * factor);
  split.LightIndustry = light;
  split.HeavyIndustry = manufacturing - light;

  return split;
}

// Averages a list of per-province sector splits into one overall
// breakdown, rounded to whole percentages that still sum to 100.
// Returns Services / LightIndustry / HeavyIndustry / Extraction (the four
// displayed buckets, always summing to 100) plus Manufacturing (the
// unsplit Light+Heavy total, kept around for the BBC code's ranked
// Primary/Secondary/Tertiary columns, which mirror the forum template's
// fixed 3-column structure rather than this 4-way breakdown).
function computeSectorTotals(splits) {
  const allKeys = ["Services", "Extraction", "LightIndustry", "HeavyIndustry"];
  const raw = {};
  allKeys.forEach(s => {
    raw[s] = splits.reduce((sum, sp) => sum + (sp[s] || 0), 0) / splits.length;
  });

  const rounded = {};
  let roundedSum = 0;
  allKeys.forEach(s => {
    rounded[s] = Math.round(raw[s]);
    roundedSum += rounded[s];
  });

  // Rounding can drift the total off 100 by a point or two — nudge the
  // largest bucket to absorb the difference so the displayed total is
  // always exactly 100%.
  const diff = 100 - roundedSum;
  if (diff !== 0) {
    const largest = allKeys.reduce((a, b) => (rounded[a] >= rounded[b] ? a : b));
    rounded[largest] += diff;
  }

  // Manufacturing = Light + Heavy, recombined post-rounding so it stays
  // consistent with the two displayed sub-buckets above.
  rounded.Manufacturing = rounded.LightIndustry + rounded.HeavyIndustry;

  return rounded;
}

// ---- economy classification ----
//
// A single descriptive label for the claim's overall economic character,
// derived from the aggregate Services / Light Industry / Heavy Industry /
// Extraction totals. Checked in two tiers:
//
//   1. The four "pure" economies (>50% in one sector alone). At most one
//      of these can ever be true at once, since two sectors can't each
//      individually exceed 50% of a 100% total.
//   2. Only if none of those match, the six blended two-sector economies
//      (>50% combined). Multiple of these CAN be true simultaneously
//      (e.g. Services+Light both also make Services+Extraction pass if
//      Extraction is nonzero), so whichever has the largest combined
//      percentage wins.
//
// Tier 1 has to be checked first and separately - if every candidate were
// thrown into one flat "largest percentage wins" pool, a pure economy
// would almost never win, since adding any second sector's percentage on
// top of it only makes the combined number bigger. That would make the
// four pure economies effectively unreachable.
const ECONOMY_TYPES = [
  { name: "Service Economy",                    tier: 1, pct: t => t.Services },
  { name: "Consumer Goods Economy",              tier: 1, pct: t => t.LightIndustry },
  { name: "Industrial Economy",                  tier: 1, pct: t => t.HeavyIndustry },
  { name: "Resource Economy",                    tier: 1, pct: t => t.Extraction },
  { name: "Consumer Goods & Services Economy",   tier: 2, pct: t => t.Services + t.LightIndustry },
  { name: "Consumer Goods & Materials Economy",  tier: 2, pct: t => t.LightIndustry + t.Extraction },
  { name: "Manufacturing Economy",               tier: 2, pct: t => t.LightIndustry + t.HeavyIndustry },
  { name: "Industrial Goods & Services Economy", tier: 2, pct: t => t.HeavyIndustry + t.Services },
  { name: "Industrial Goods & Materials Economy",tier: 2, pct: t => t.HeavyIndustry + t.Extraction },
  { name: "Non-Industrial Economy",              tier: 2, pct: t => t.Services + t.Extraction },
];

// Non-Industrial is reserved for genuinely low-industry, extraction-driven
// economies (petro-states and similar). Without this gate it wins far too
// often: Manufacturing is split into Light + Heavy, so any Services +
// Extraction pairing out-scores every pairing that uses only one half of
// Manufacturing - even when total Manufacturing is as large as either.
// Claims that fail the gate fall through to the next-best tier 2 pairing.
const NON_INDUSTRIAL_MAX_MANUFACTURING = 25;
const NON_INDUSTRIAL_MIN_EXTRACTION = 35;

function qualifiesAsNonIndustrial(sectorTotals) {
  const manufacturing = (sectorTotals.LightIndustry || 0) + (sectorTotals.HeavyIndustry || 0);
  return manufacturing <= NON_INDUSTRIAL_MAX_MANUFACTURING &&
    (sectorTotals.Extraction || 0) >= NON_INDUSTRIAL_MIN_EXTRACTION;
}

function classifyEconomy(sectorTotals) {
  const tier1 = ECONOMY_TYPES.filter(e => e.tier === 1)
    .map(e => ({ name: e.name, pct: e.pct(sectorTotals) }))
    .filter(e => e.pct > 50);

  const pool = tier1.length > 0
    ? tier1
    : ECONOMY_TYPES.filter(e => e.tier === 2)
        .filter(e => e.name !== "Non-Industrial Economy" || qualifiesAsNonIndustrial(sectorTotals))
        .map(e => ({ name: e.name, pct: e.pct(sectorTotals) }))
        .filter(e => e.pct > 50);

  if (pool.length === 0) {
    // Only possible when the sectors are split too evenly for any single
    // sector, or any pair, to break 50% (e.g. close to a 25/25/25/25 split).
    return { name: "Diversified Economy", pct: null };
  }

  pool.sort((a, b) => b.pct - a.pct);
  return pool[0];
}

// ---- World Exports (the 1st-5th ranked list) ----
//
// Which of the four base sectors defines each classification, used to
// build its export ranking below. Single-item arrays are the four
// "specialized" (tier 1) economies; two-item arrays are the six
// "combined" (tier 2) ones. "Diversified Economy" has no defined ranking
// rule (it wasn't one of the ten named types this was designed for), so
// it's left out - buildWorldExports() returns five blanks for it.
const ECONOMY_SECTOR_KEYS = {
  "Service Economy":                    ["Services"],
  "Consumer Goods Economy":              ["LightIndustry"],
  "Industrial Economy":                  ["HeavyIndustry"],
  "Resource Economy":                    ["Extraction"],
  "Consumer Goods & Services Economy":   ["Services", "LightIndustry"],
  "Consumer Goods & Materials Economy":  ["LightIndustry", "Extraction"],
  "Manufacturing Economy":               ["LightIndustry", "HeavyIndustry"],
  "Industrial Goods & Services Economy": ["HeavyIndustry", "Services"],
  "Industrial Goods & Materials Economy":["HeavyIndustry", "Extraction"],
  "Non-Industrial Economy":              ["Services", "Extraction"],
};

const SECTOR_EXPORT_LABEL = {
  Services: "Services",
  LightIndustry: "Consumer Goods",
  HeavyIndustry: "Industrial Goods",
  Extraction: "Raw Materials",
};
const ALL_SECTOR_KEYS = ["Services", "LightIndustry", "HeavyIndustry", "Extraction"];

// Returns [1st, 2nd, 3rd, 4th, 5th] export labels for a classification,
// given the claim's aggregate sector totals.
function buildWorldExports(classificationName, sectorTotals) {
  const keys = ECONOMY_SECTOR_KEYS[classificationName];
  if (!keys || !sectorTotals) return ["", "", "", "", ""];

  const label = k => SECTOR_EXPORT_LABEL[k];
  const val = k => sectorTotals[k] || 0;

  if (keys.length === 1) {
    // ---- Specialized economies (one sector > 50%) ----
    // 1st-3rd are all that same dominant sector.
    const main = keys[0];
    const mainLabel = label(main);
    const others = ALL_SECTOR_KEYS.filter(k => k !== main);

    // 4th: any other sector(s) over 20%; none -> repeat the main sector.
    // (All three others exceeding 20% at once isn't mathematically
    // possible here, since together they can't exceed the ~50% left over
    // once the dominant sector takes its share.)
    const above20 = others.filter(k => val(k) > 20);
    const slot4 = above20.length === 0 ? mainLabel : above20.map(label).join(" or ");

    // 5th: same, but at a 15% threshold - here all three others clearing
    // 15% each IS possible, hence the "Any" case.
    const above15 = others.filter(k => val(k) > 15);
    const slot5 = above15.length === 0 ? mainLabel
      : above15.length === 3 ? "Any"
      : above15.map(label).join(" or ");

    return [mainLabel, mainLabel, mainLabel, slot4, slot5];
  }

  // ---- Combined economies (a pair of sectors > 50% together) ----
  const [a, b] = keys;
  const first = val(a) >= val(b) ? a : b; // ties default to the first-listed sector
  const second = first === a ? b : a;
  const firstLabel = label(first), secondLabel = label(second);

  // 3rd: both paired sectors individually over 25% -> "X or Y"; otherwise repeat 1st.
  const slot3 = (val(first) > 25 && val(second) > 25)
    ? `${firstLabel} or ${secondLabel}`
    : firstLabel;

  // 4th looks at the OTHER two sectors only (the ones not part of this
  // classification's defining pair) - "none -> repeat 2nd / one -> that
  // one / both -> "X or Y"".
  const others = ALL_SECTOR_KEYS.filter(k => k !== a && k !== b);
  const above20 = others.filter(k => val(k) > 20);
  const slot4 = above20.length === 0 ? secondLabel : above20.map(label).join(" or ");

  // 5th looks at ALL FOUR sectors, not just the "other two" - the pair
  // already used in slots 1-3 is still eligible here too, so a sector
  // that's already 1st or 2nd place can also show up in the 5th slot's
  // list. (Only "Any" is reserved for every sector clearing 15% at once;
  // since four sector percentages always sum to 100, at least one sector
  // is guaranteed to be above 15%, so the "nothing qualifies" fallback
  // below can't actually happen - it's just there for safety.)
  const above15 = ALL_SECTOR_KEYS.filter(k => val(k) > 15);
  const slot5 = above15.length === 0 ? secondLabel
    : above15.length === ALL_SECTOR_KEYS.length ? "Any"
    : above15.map(label).join(" or ");

  return [firstLabel, secondLabel, slot3, slot4, slot5];
}

// Plain-text description per classification, used both in the on-page bio
// prose and (via buildBBCCode) inside the BBC template's Economy Type
// bullet. "Diversified Economy" isn't one of the ten named types - it's
// this file's own fallback for claims too evenly split to hit any of the
// >50% thresholds - so it gets a short description written to match here
// rather than one from the original set.
const ECONOMY_DESCRIPTIONS = {
  "Service Economy": "Service Economies are highly specialized economies in which the tertiary sector is the dominant force in the economy. The tertiary sector consists of activities where people offer their knowledge and time to improve productivity, performance, potential, and sustainability. Unlike goods services are intangible in nature. The goal of the economy is to export services, while importing finished goods, consumer goods, and services from other states. Competition, demand, and trade will shape the service industry dramatically. The state is heavily reliant on imported goods of all kinds. Competition can be fierce so finding a specialized market is ideal. Pollution is minimal.",

  "Consumer Goods Economy": "Consumer Goods Economies are highly specialized in the light secondary sector. They are focused on the creation of consumer goods, as contrasted by industrial economies which are oriented towards intermediate and final products. The goal of the economy is to export its consumer goods while importing raw material, finished goods, and services from other states. The resources on hand, trade, and the priorities of your nation will influence what type of refinement and manufacturing will take place within the country. The state is reliant on importation of raw materials from other states to be manufactured into consumer goods, as well as needing finished goods and services. Competition can be high so finding a specialized market is ideal. Pollution is a concern for many of these economies but investment into cleaner practices can help limit such issues.",

  "Industrial Economy": "Industrial Economies are highly specialized in the heavy secondary sector. They are oriented towards intermediate and finished goods intended for other industries and require large capital investment. They are contrasted by consumer goods economies, which focuses on the creation of consumer goods. The goal of the economy is to export its intermediate and finished goods while importing raw material, other finished goods, and services from other states. The resources on hand, trade, and the priorities of your nation will influence what type of refinement and manufacturing will take place within the country. The state is reliant on importation of raw materials, and intermediate goods from other states to be manufactured into finished goods, as well as needing consumer goods and services. Competition can be high so finding a specialized market is ideal. Environmental Damage and Pollution are major concerns for heavy industries as they produce a large amount of waste material.",

  "Resource Economy": "Resource Economies are highly specialized in the primary sector. They are focused on the cultivation and extraction of natural resources. Resource economies have various forms depending on the natural resources available. The goal of the economy is to export its raw materials while importing finished goods, consumer goods, and services from other states. The natural resources at your disposal will influence what type of production will take place within the country ie extraction of raw materials or cultivation of agriculture. The state is reliant on importation of goods and services. Although considered at the of the international economy resource based nations are the foundation of the economic order allowing them the power to severely damage the economics of unfriendly nations through embargoes. Environmental damage is a concern for many of these economies from mining and fracking to soil erosion and pesticide usage.",

  "Consumer Goods & Services Economy": "Consumer Goods & Services Economy has a mixture of tertiary and light secondary sectors as the dominant force in the country. The economy is focused on creating and selling consumer goods. The service sector and the light manufacturing sector are the primary outputs of your economy, making up a sizable portion of the economy. The goal of the economy is to export services as well as finished goods, while importing parts, other finished goods, and services from other states. Competition, demand, and trade will shape the service industry dramatically while the resources on hand, and the priorities of your nation will influence what type of manufacturing will take place within the country. The state is reliant on the importation of raw materials and finished goods. Competition can be fierce so finding a specialized market is ideal. Pollution is a concern for some of these economies but investment into cleaner practices can help limit such issues.",

  "Consumer Goods & Materials Economy": "Consumer Goods & Materials Economies are based around Primary and Light Secondary activities. The economy is focused on raw material extraction and creating consumer goods. Light Manufacturing and Extraction are the primary outputs of your economy, making up a sizable portion of the economy. The goal of the economy is to extract raw materials for export or usage in the production of Consumer goods, while importing finished goods, and services from other states. Competition, demand, and trade will shape the service industry dramatically while the resources on hand, and the priorities of your nation will influence what type of manufacturing will take place within the country. The state is reliant on the importation of finished goods and services. Competition can be high so finding a specialized market is ideal. Environmental damage is a concern for many of these economies from mining and fracking to soil erosion and pesticide usage.",

  "Manufacturing Economy": "Manufacturing Economies are based around Secondary activities. The economy is focused on creating intermediate, finished, and consumer goods. Light Manufacturing and Heavy Manufacturing are the primary outputs of your economy, making up a sizable portion of the economy. The goal of the economy is to export its intermediate, final, and consumer goods, while importing raw materials, and services from other states. Competition, demand, and trade will shape the service industry dramatically while the resources on hand, and the priorities of your nation will influence what type of manufacturing will take place within the country. The state is reliant on the importation of raw materials and services. Competition can be high so finding a specialized market is ideal. Environmental Damage and Pollution are major concerns for manufacturing economies as they produce a large amount of waste material.",

  "Industrial Goods & Services Economy": "Industrial & Services Economies are based around Tertiary and Heavy Secondary activities. The economy is focused on creating and selling intermediate and finished goods intended for use in other businesses. Services and Heavy Manufacturing are the primary outputs of your economy, making up a sizable portion of the economy. The goal of the economy is to export its services and, intermediate/final goods, while importing, raw materials, and consumer goods and services from other states. Competition, demand, and trade will shape the service industry dramatically while the resources on hand, and the priorities of your nation will influence what type of manufacturing will take place within the country. The state is reliant on the importation of raw materials and consumer goods. Competition can be high so finding a specialized market is ideal. Environmental Damage and Pollution are major concerns for heavy industries as they produce a large amount of waste material.",

  "Industrial Goods & Materials Economy": "Industrial Goods & Materials Economies are based around Primary and Heavy Secondary activities. The economy is focused on raw material extraction and creating intermediate and final goods. Heavy Manufacturing and Extraction are the primary outputs of your economy, making up a sizable portion of the economy. The goal of the economy is to extract raw materials for export or usage in the production of intermediate and final goods, while importing consumer goods, and services from other states. Competition, demand, and trade will shape the service industry dramatically while the resources on hand, and the priorities of your nation will influence what type of manufacturing will take place within the country. The state is reliant on the importation of consumer goods and services. Competition can be high so finding a specialized market is ideal. Environmental damage is a major concern for many of these economies from mining and fracking to soil erosion and pesticide usage, as well as pollution from heavy industries.",

  "Non-Industrial Economy": "Non-industrial Economies are based around Primary and Tertiary activities. The economy is focused on raw material extraction and services. Services and Extraction are the primary outputs of your economy, making up a sizable portion of the economy. These economies usually emerge from resource rich nations who have grown economically to the point of supporting a large Service industry but have not caught up infrastructure to support a secondary sector. The existence of the service economy is almost entirely reliant on the raw resource and usually is the source of wealth of the consumers and or focus of the service industry through the trade of resource. Commonly found in petrol states, it is considered highly unstable and many attempt to use the momentary wealth to diversify the economy either through creating a strong independent service economy bypassing the other or the catching up of the other sectors to build a more stable basis. The state is reliant on the importation of most goods. Environmental damage is a concern for many of these economies from mining and fracking to soil erosion and pesticide usage.",

  "Diversified Economy": "Diversified Economies have no single sector, or pair of sectors, that clearly dominates output - Services, Manufacturing, and Extraction each contribute a meaningful share. This spread-out base can make the economy more resilient to a downturn in any one sector, but also means it lacks the sharp specialization (and the trade leverage that comes with it) of a more focused economy. Trade tends to be broad rather than deep, importing and exporting across many categories instead of concentrating on one export and a handful of imports.",
};

// ---- small helpers ----

function uniq(arr) {
  return Array.from(new Set(arr));
}

function countBy(arr, fn) {
  const out = {};
  arr.forEach(item => {
    const key = fn(item);
    out[key] = (out[key] || 0) + 1;
  });
  return out;
}

function topEntry(counts) {
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

function otherKeys(counts, exclude) {
  return Object.keys(counts).filter(k => k !== exclude);
}

function describeClimate(name) {
  const descriptions = {
    "Oceanic": "temperate and oceanic",
    "Humid Continental": "humid continental",
    "Mediterranean": "mild and Mediterranean",
    "Arid": "arid and dry",
    "Semi-Arid": "semi-arid",
    "Tropical Wet Dry": "tropical, with distinct wet and dry seasons",
    "Tropical Rainforest": "dense tropical rainforest",
    "Highlands": "rugged highland terrain",
    "Sub Arctic": "subarctic and cold",
    "Polar": "polar and frozen",
  };
  return descriptions[name] || name.toLowerCase();
}

// ---- Energy Resources (Coal / Natural Gas / Oil / Uranium) per province ----
//
// Each province's specific energy resource is rolled per-generation, using
// its climate as weighting - matches this project's existing pattern where
// climate is a fixed province property but economy/food/energy/population
// OUTPUTS are randomized on each "Generate" click, not baked in.
//
// TEMPORARY, PER USER'S OWN NOTE: this is meant to eventually be replaced
// once the province data itself is finalized on the map - at that point,
// each province's resource type should be rolled ONCE and hardcoded into
// data.js (the same way climate.dominant already is), rather than
// re-rolled every time a bio is generated. Flagging this in code as well
// as here so it isn't lost.
//
// Percentages are given by the source table; the four keys per row always
// sum to 100. Two rows in the source table (Tundra, Humid Sub-tropical)
// don't correspond to any climate this project actually uses (its ten
// climates are the CLIMATE_DETAILS/describeClimate keys above) and are
// omitted here as a result. Two more needed a naming reconciliation:
// "Continental" -> "Humid Continental" and "Tropical Wet" -> "Tropical
// Rainforest", both used consistently as the same climate elsewhere in
// this project under those exact names.
const RESOURCE_WEIGHTS_BY_CLIMATE = {
  "Polar":               { "Coal": 5,  "Natural Gas": 15, "Oil": 79, "Uranium": 1 },
  "Sub Arctic":          { "Coal": 50, "Natural Gas": 45, "Oil": 4,  "Uranium": 1 },
  "Highlands":           { "Coal": 0,  "Natural Gas": 10, "Oil": 89, "Uranium": 1 },
  "Arid":                { "Coal": 5,  "Natural Gas": 10, "Oil": 84, "Uranium": 1 },
  "Semi-Arid":           { "Coal": 10, "Natural Gas": 20, "Oil": 69, "Uranium": 1 },
  "Mediterranean":       { "Coal": 25, "Natural Gas": 20, "Oil": 54, "Uranium": 1 },
  "Tropical Wet Dry":    { "Coal": 10, "Natural Gas": 30, "Oil": 59, "Uranium": 1 },
  "Humid Continental":   { "Coal": 65, "Natural Gas": 30, "Oil": 4,  "Uranium": 1 },
  "Oceanic":             { "Coal": 25, "Natural Gas": 20, "Oil": 54, "Uranium": 1 },
  "Tropical Rainforest": { "Coal": 5,  "Natural Gas": 5,  "Oil": 89, "Uranium": 1 },
};

// Weighted-random pick from a { label: weight } map. Weights don't need to
// sum to any particular number - this normalizes against whatever total
// they add up to.
function weightedPick(weights) {
  const entries = Object.entries(weights);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = Math.random() * total;
  for (const [label, w] of entries) {
    roll -= w;
    if (roll <= 0) return label;
  }
  return entries[entries.length - 1][0]; // floating-point fallback
}

// Rolls a resource type for every province with a known climate, and
// groups the results by resource type (e.g. { "Oil": ["S9","S12"], ... })
// for compact display - provinces with no climate data (a handful of
// slivers, per this project's known data gaps) are skipped rather than
// guessed at.
function rollProvinceResources(provinces) {
  const byResource = {};
  provinces.forEach(p => {
    // Only Energy-type provinces actually produce a specific fuel
    // resource - a Service Focused or Agriculture Oriented province
    // shouldn't come up as sitting on Coal/Oil/etc. just because its
    // climate would statistically favor it.
    if (p.econ !== "Energy Focused" && p.econ !== "Energy Oriented") return;
    const climate = p.climate && p.climate.dominant;
    const weights = climate && RESOURCE_WEIGHTS_BY_CLIMATE[climate];
    if (!weights) return;
    const resource = weightedPick(weights);
    if (!byResource[resource]) byResource[resource] = [];
    byResource[resource].push(p.label);
  });
  return byResource;
}

// Expose globally so map.js can call it without a module bundler.
window.generateLandBio = generateLandBio;

/*
 * NOTE ON ASYNC / AI-GENERATED BIOS
 * ----------------------------------
 * If you'd rather call an AI API to write the bio instead of the
 * template above, make generateLandBio an async function and update
 * the call site in map.js to `await` it (and show a loading state
 * while it's in flight). Everything else in this file's contract
 * stays the same — it still just needs to resolve to { text, bbcCode }.
 */
