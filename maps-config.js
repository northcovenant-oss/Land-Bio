/*
 * MAP IMAGES
 * ----------
 * The images behind the land bio map's dropdown maps (files in /maps).
 * Each entry:
 *
 *   key: {
 *     href:      'maps/xxx.webp'       the map image
 *     x, y, width, height              where it sits, in map units (the map is
 *                                      1917.7 x 958.85 for the whole world, so
 *                                      a map that stops at 85 N / 80 S is
 *                                      placed and sized accordingly)
 *     caption:   'text'                shown in the legend box
 *     legendImg: 'maps/xxx-legend.webp'  (optional) the map's own legend/colour bar
 *     legend:    [{label, color}, ...]   (optional) legend drawn as swatches
 *   }
 *
 * A key that isn't listed here shows as a "coming soon" placeholder. The keys
 * are wired to menu entries in map.js (LAYER_GROUPS).
 */
const MAP_IMAGES = {
  "topography": {
    "href": "maps/topography.webp",
    "x": 1.056,
    "y": 1.053,
    "width": 1915.589,
    "height": 956.744,
    "caption": "Topography and bathymetry: elevation above and depth below sea level.",
    "legend": [
      {
        "label": "below −6,000 m",
        "color": "#0b2f46"
      },
      {
        "label": "−6,000 to −5,000 m",
        "color": "#114057"
      },
      {
        "label": "−5,000 to −4,000 m",
        "color": "#175165"
      },
      {
        "label": "−4,000 to −3,000 m",
        "color": "#1e6273"
      },
      {
        "label": "−3,000 to −2,000 m",
        "color": "#287482"
      },
      {
        "label": "−2,000 to −1,000 m",
        "color": "#3c8693"
      },
      {
        "label": "−1,000 to −200 m",
        "color": "#569aa3"
      },
      {
        "label": "−200 to 0 m (shelf)",
        "color": "#76b2b6"
      },
      {
        "label": "0–200 m",
        "color": "#76a056"
      },
      {
        "label": "200–500 m",
        "color": "#b0be64"
      },
      {
        "label": "500–1,000 m",
        "color": "#eada7c"
      },
      {
        "label": "1,000–2,000 m",
        "color": "#cca564"
      },
      {
        "label": "2,000–3,000 m",
        "color": "#b46e4e"
      },
      {
        "label": "3,000–4,500 m",
        "color": "#8c3434"
      },
      {
        "label": "above 4,500 m",
        "color": "#68242e"
      }
    ]
  },
  "currents_warmcold": {
    "href": "maps/currents_warmcold.webp",
    "x": 1.351,
    "y": 1.063,
    "width": 1914.997,
    "height": 956.725,
    "caption": "Major surface ocean currents (annual mean): warm and cold. Line width shows strength; shaded blue marks coastal upwelling.",
    "legendImg": "maps/currents_warmcold-legend.webp"
  },
  "currents_annual": {
    "href": "maps/currents_annual.webp",
    "x": 1.448,
    "y": 1.035,
    "width": 1914.803,
    "height": 956.78,
    "caption": "Surface ocean currents (annual mean, wind-driven). Line width shows speed; teal dots mark coastal upwelling.",
    "legendImg": "maps/currents_annual-legend.webp"
  },
  "currents_jan": {
    "href": "maps/currents_jan.webp",
    "x": 3.801,
    "y": 57.074,
    "width": 1910.098,
    "height": 819.969,
    "caption": "Surface currents in January. Colour shows speed; orange seas are currents that turn around between January and July.",
    "legendImg": "maps/currents_jan-legend.webp"
  },
  "currents_jul": {
    "href": "maps/currents_jul.webp",
    "x": 3.801,
    "y": 57.074,
    "width": 1910.098,
    "height": 819.969,
    "caption": "Surface currents in July. Colour shows speed; orange seas are currents that turn around between January and July.",
    "legendImg": "maps/currents_jul-legend.webp"
  },
  "haz_earthquakes": {
    "href": "maps/haz_earthquakes.webp",
    "x": 3.111,
    "y": 29.595,
    "width": 1911.479,
    "height": 884.971,
    "caption": "Earthquake shaking hazard from the plate boundaries (land solid, sea faded)."
  },
  "haz_volcanoes": {
    "href": "maps/haz_volcanoes.webp",
    "x": 3.111,
    "y": 29.595,
    "width": 1911.479,
    "height": 884.971,
    "caption": "Volcanoes: arcs behind the subduction zones, rift volcanoes and hotspots."
  },
  "haz_tsunamis": {
    "href": "maps/haz_tsunamis.webp",
    "x": 2.928,
    "y": 29.72,
    "width": 1911.844,
    "height": 884.122,
    "caption": "Tsunamis: coasts exposed to waves from the subduction zones (coloured coast and low ground behind it)."
  },
  "haz_floods": {
    "href": "maps/haz_floods.webp",
    "x": 3.091,
    "y": 29.847,
    "width": 1911.519,
    "height": 884.044,
    "caption": "Floods: river floodplains and deltas, storm-surge coasts, flash-flood deserts."
  },
  "haz_drought": {
    "href": "maps/haz_drought.webp",
    "x": 3.091,
    "y": 29.005,
    "width": 1911.519,
    "height": 886.232,
    "caption": "Drought: year-to-year rainfall failure, worst on the dry margins and single-wet-season lands."
  },
  "haz_wildfire": {
    "href": "maps/haz_wildfire.webp",
    "x": 3.091,
    "y": 30.109,
    "width": 1911.519,
    "height": 884.736,
    "caption": "Wildfire: fuel (vegetation) combined with fire weather (dry season, summer heat)."
  },
  "haz_tornadoes": {
    "href": "maps/haz_tornadoes.webp",
    "x": 3.256,
    "y": 29.353,
    "width": 1911.188,
    "height": 874.054,
    "caption": "Where tornadoes form: supercell environments (spring and summer)."
  },
  "haz_cyclone_genesis": {
    "href": "maps/haz_cyclone_genesis.webp",
    "x": 3.894,
    "y": 31.182,
    "width": 1909.912,
    "height": 878.946,
    "caption": "Where tropical cyclones form: genesis potential in each hemisphere's peak season. Pink line: sea surface 26.5 °C.",
    "legendImg": "maps/haz_cyclone_genesis-legend.webp"
  },
  "haz_cyclone_tracks": {
    "href": "maps/haz_cyclone_tracks.webp",
    "x": 3.118,
    "y": 30.345,
    "width": 1911.464,
    "height": 871.396,
    "caption": "A simulated decade of tropical cyclone tracks, coloured by strength, strongest drawn on top."
  },
  "haz_cyclone_risk": {
    "href": "maps/haz_cyclone_risk.webp",
    "x": 3.894,
    "y": 29.233,
    "width": 1909.912,
    "height": 880.895,
    "caption": "Hurricane / typhoon risk: how often a Cat 1+ storm passes within about 150 km (land solid, sea faded).",
    "legendImg": "maps/haz_cyclone_risk-legend.webp"
  },
  "haz_floes": {
    "href": "maps/haz_floes.webp",
    "x": 4.759,
    "y": 14.742,
    "width": 1908.183,
    "height": 888.349,
    "caption": "Drifting floes (spring break-up). Peak: north Apr-Jun, south Oct-Dec. Lines: winter ice edge (blue January / north, red July / south).",
    "legendImg": "maps/haz_floes-legend.webp"
  },
  "haz_icebergs": {
    "href": "maps/haz_icebergs.webp",
    "x": 4.759,
    "y": 14.742,
    "width": 1908.183,
    "height": 888.349,
    "caption": "Icebergs. Peak: north Aug-Oct, south Feb-May. Lines: winter ice edge (blue January / north, red July / south).",
    "legendImg": "maps/haz_icebergs-legend.webp"
  },
  "haz_polarlows": {
    "href": "maps/haz_polarlows.webp",
    "x": 4.759,
    "y": 16.687,
    "width": 1908.183,
    "height": 886.296,
    "caption": "Polar lows (winter cold-air outbreaks). Peak: north Dec-Mar, south Jun-Sep.",
    "legendImg": "maps/haz_polarlows-legend.webp"
  },
  "haz_seafog": {
    "href": "maps/haz_seafog.webp",
    "x": 4.759,
    "y": 16.687,
    "width": 1908.183,
    "height": 886.296,
    "caption": "Sea fog. Peak: north May-Aug, south Nov-Feb.",
    "legendImg": "maps/haz_seafog-legend.webp"
  },
  "koppen": {
    "href": "maps/koppen.webp",
    "x": 1.489,
    "y": 0.878,
    "width": 1914.721,
    "height": 956.882,
    "caption": "Köppen–Geiger climate classification.",
    "legendImg": "maps/koppen-legend.webp"
  },
  "trewartha": {
    "href": "maps/trewartha.webp",
    "x": 1.489,
    "y": 0.958,
    "width": 1914.721,
    "height": 956.615,
    "caption": "Köppen–Trewartha climate classification.",
    "legendImg": "maps/trewartha-legend.webp"
  },
  "biomes": {
    "href": "maps/biomes.webp",
    "x": 1.57,
    "y": 1.01,
    "width": 1914.56,
    "height": 956.494,
    "caption": "Terrestrial biomes.",
    "legendImg": "maps/biomes-legend.webp"
  },
  "temp_annual": {
    "href": "maps/temp_annual.webp",
    "x": 1.404,
    "y": 1.003,
    "width": 1914.891,
    "height": 956.844,
    "caption": "Annual mean temperature. Blue line: 0 °C.",
    "legendImg": "maps/temp_annual-legend.webp"
  },
  "temp_jan": {
    "href": "maps/temp_jan.webp",
    "x": 1.404,
    "y": 1.003,
    "width": 1914.891,
    "height": 956.844,
    "caption": "January mean temperature (northern winter, southern summer). White veil: sea ice. Blue line: 0 °C.",
    "legendImg": "maps/temp_jan-legend.webp"
  },
  "temp_jul": {
    "href": "maps/temp_jul.webp",
    "x": 1.404,
    "y": 1.003,
    "width": 1914.891,
    "height": 956.844,
    "caption": "July mean temperature (northern summer, southern winter). White veil: sea ice. Blue line: 0 °C.",
    "legendImg": "maps/temp_jul-legend.webp"
  },
  "temp_range": {
    "href": "maps/temp_range.webp",
    "x": 1.402,
    "y": 1.051,
    "width": 1914.896,
    "height": 956.747,
    "caption": "Seasonal temperature range (continentality): July minus January, absolute.",
    "legendImg": "maps/temp_range-legend.webp"
  },
  "minerals_rare": {
    "href": "maps/minerals_rare.webp",
    "x": 2.753,
    "y": 28.917,
    "width": 1912.193,
    "height": 874.246,
    "caption": "Rare earths, gems, industrial minerals and uranium."
  },
  "minerals_metals": {
    "href": "maps/minerals_metals.webp",
    "x": 2.753,
    "y": 28.917,
    "width": 1912.193,
    "height": 874.246,
    "caption": "Metal deposits: precious and base metals, iron and the alloy metals, by the geological setting that forms them."
  },
  "fisheries": {
    "href": "maps/fisheries.webp",
    "x": 2.742,
    "y": 29.686,
    "width": 1912.217,
    "height": 873.425,
    "caption": "Fisheries: shelves, upwelling (coastal and the equatorial cold tongue), fronts, river plumes and ice edges. Red outlines: major fishing grounds (1-15, largest first).",
    "legendImg": "maps/fisheries-legend.webp"
  }
};

/*
 * ICON OVERLAYS
 * -------------
 * Resource maps drawn as icons only (transparent images in /maps). Each one
 * gets an on/off button above the map and is shown over whichever map is
 * selected. Same fields as MAP_IMAGES, plus a label for the button.
 */
const OVERLAYS = [
  {
    "id": "metals",
    "label": "Metal deposits",
    "href": "maps/icons_metals.webp",
    "x": 2.753, "y": 28.917, "width": 1912.193, "height": 874.246,
    "legendImg": "maps/icons_metals-legend.png",
    "caption": "Precious and base metals, iron and the alloy metals. Bigger icon = bigger deposit."
  },
  {
    "id": "rare",
    "label": "Rare minerals & gems",
    "href": "maps/icons_rare.webp",
    "x": 2.753, "y": 28.917, "width": 1912.193, "height": 874.246,
    "legendImg": "maps/icons_rare-legend.png",
    "caption": "Rare earths, gems, industrial minerals and uranium. Bigger icon = bigger deposit."
  }
];
