/*
 * NATIONAL SPECIALIZATION DATA
 * ----------------------------
 * The four category pools players choose from in Step 1, plus the
 * military-specific list used in Step 2. Defense items are pulled out of
 * the general Heavy Industry pool so they're reserved for the military
 * step rather than also being pickable as a regular specialization.
 *
 * Step 1's five slots are tied to the land bio's own World Exports
 * ranking, not freely chosen from the whole economy type - see
 * EXPORT_LABEL_TO_POOLS / poolsForExportLabel below.
 */

const SPECIALIZATION_POOLS = {
  Primary: [
    "Agriculture - Animals",
    "Agriculture - Animal Products",
    "Agriculture - Animal & Vegetable Byproducts",
    "Agriculture - Carbohydrate Products",
    "Agriculture - Fruits",
    "Agriculture - Sugar",
    "Agriculture - Vegetables",
    "Agriculture - Beverage Crops",
    "Agriculture - Spices",
    "Fishing - Aquaculture",
    "Fishing - Commercial",
    "Fishing - Pearling",
    "Forestry - Hard Wood",
    "Forestry - Soft Wood",
    "Forestry - Rubber",
    "Forestry - Tropical Hardwood",
    "Mining - Precious Metals",
    "Mining - Base Metals",
    "Mining - Precious Stones",
    "Mining - Rare Earth Elements",
    "Mining - Industrial Minerals",
    "Fuel - Coal Mining",
    "Fuel - Natural Gas Extraction",
    "Fuel - Petroleum Extraction",
    "Fuel - Uranium Extraction",
  ],
  Services: [
    "Hospitality - Cultural Activities",
    "Hospitality - Food Service",
    "Hospitality - Hotels",
    "Hospitality - Sex Work",
    "Hospitality - Tourism",
    "Mass Media - Printing & Publishing",
    "Mass Media - Film Industry",
    "Mass Media - Broadcast (News & TV)",
    "Mass Media - Music Industry",
    "Mass Media - Digital Media",
    "Healthcare",
    "Information technology",
    "Consulting",
    "Gambling",
    "Retailer - Online Store",
    "Retailer - Superstore",
    "Retail sales - Luxury Brand",
    "Financial services - Banking",
    "Financial services - Insurance",
    "Financial services - Investment management",
    "Professional services - Accounting",
    "Professional services - Legal services",
    "Professional services - Management consulting",
    "Cargo Transportation - Air",
    "Cargo Transportation - Ship",
    "Cargo Transportation - Rail",
    "Cargo Transportation - Road",
    "Commercial Transportation - Air",
    "Commercial Transportation - Ship",
    "Commercial Transportation - Rail",
  ],
  "Light Industry": [
    "Consumer Goods - Appliances",
    "Consumer Goods - Beauty Products",
    "Consumer Goods - Electronics",
    "Consumer Goods - Furniture",
    "Consumer Goods - Luxury Goods",
    "Consumer Goods - Plastics",
    "Foodstuffs - Alcohol",
    "Foodstuffs - Baked Goods",
    "Foodstuffs - Beverages",
    "Foodstuffs - Candy",
    "Foodstuffs - Canned Goods",
    "Foodstuffs - Frozen Food",
    "Foodstuffs - Packaged Food",
    "Foodstuffs - Snacks",
    "Animal Feed",
    "Leather industry",
    "Attire - Accessories",
    "Attire - Clothing",
    "Ceramics & Glassware",
    "Attire - Footwear",
    "Textiles - Cotton",
    "Textiles - Natural Fibers",
    "Textiles - Synthetic",
  ],
  "Heavy Industry": [
    "Automotive - Personal Vehicles",
    "Automotive - Transportation Vehicles",
    "Automotive - Utility Vehicle",
    "Aerospace - Civil Aircraft Small",
    "Aerospace - Civil Aircraft Large",
    "Aerospace - Helicopter",
    "Aerospace - Rockets",
    "Aerospace - Spacecraft",
    "Chemical - Commercial",
    "Chemical - Commodity",
    "Chemical - Pharmaceuticals",
    "Construction - Commercial",
    "Construction - Industrial",
    "Defense - Ammunition",
    "Defense - Armoured Fighting Vehicle",
    "Defense - Artillery",
    "Defense - Explosives",
    "Defense - Firearms",
    "Defense - Missiles",
    "Defense - Military Aircraft",
    "Defense - Military Vehicles",
    "Defense - Ships",
    "Defense - Submarines",
    "Electronics - Computing",
    "Electronics - Industrial",
    "Electronics - Semiconductor",
    "Electronics - Telecommunication",
    "Energy - Nuclear",
    "Energy - Renewable",
    "Energy - Fossil Fuels",
    "Engineering - Civil",
    "Engineering - Environmental",
    "Engineering - Robotics",
    "General Machinery",
    "Locomotive - Rapid Transit & Light Rail",
    "Locomotive - Freight",
    "Locomotive - Passenger/High Speed",
    "Metals - Alloys",
    "Metals - Refined Metals",
    "Metals - Steel",
    "Pulp and Paper Industry",
    "Shipbuilding - Commercial Large",
    "Shipbuilding - Commercial Small",
    "Shipbuilding - Private",
    "Waste - Disposal",
    "Waste - Recycling",
  ],
};


// ---- Required Imports (by chosen specialization) ----
//
// For each specialization a player can pick in Step 1, which OTHER
// specializations (drawn from this same closed set of 122 - not generic
// invented goods) a nation built around that industry would realistically
// need to import, since no claim produces every input its own economy
// needs. Every string in every list below is itself a valid key in
// SPECIALIZATION_POOLS - one nation's export is another's import, all
// within the same economic model this file already uses elsewhere. Most
// of this table's dependency chains were hand-authored (design pass, not
// auto-generated) to reflect realistic supply chains - General Machinery,
// Energy - Fossil Fuels, and the various Metals/Electronics entries are
// common inputs across many industries, matching how heavily real-world
// economies lean on machinery, energy, and refined materials as base
// inputs. "Cargo Transportation - Road" absorbed what were originally
// separate "Commercial Transportation - Road" references - that name
// doesn't exist in SPECIALIZATION_POOLS (only Cargo Transportation - Road
// does), and the two had identical dependency lists anyway.
//
// A set of specializations are deliberately left OUT of this table -
// either because they're knowledge/labor-based work with no concrete
// goods chain behind them (Hospitality - Cultural Activities, Hospitality
// - Sex Work, Consulting, Financial services - Investment management,
// Professional services - Accounting, Professional services - Legal
// services, Professional services - Management consulting), or because
// they were deliberately scoped out of this pass (Gambling, Financial
// services - Banking, Financial services - Insurance). They're still
// fully pickable in Step 1 like any other specialization -
// importsForSpecialization just returns an empty list for them, and the
// Summary panel shows "No specific imports required" rather than
// inventing a chain. They also never appear as an import FOR anything
// else below.
//
// Purely descriptive flavor text for the Summary panel - not wired into
// any other mechanic (energy/food/GDP) in this file. Every other entry in
// SPECIALIZATION_POOLS should have a matching key here; if pools are
// edited, re-sync this table the same pass (aside from the deliberate
// omissions above), and make sure any new/renamed entry used as an
// import value is still spelled exactly as it appears in
// SPECIALIZATION_POOLS.
const IMPORTS_BY_SPECIALIZATION = {
  // -- Primary --
  "Agriculture - Animals": ["Animal Feed", "General Machinery", "Energy - Fossil Fuels"],
  "Agriculture - Animal Products": ["Agriculture - Animals", "Animal Feed", "General Machinery"],
  "Agriculture - Animal & Vegetable Byproducts": ["Agriculture - Animals", "Agriculture - Vegetables", "General Machinery"],
  "Agriculture - Carbohydrate Products": ["Automotive - Utility Vehicle", "Chemical - Commercial", "Energy - Fossil Fuels"],
  "Agriculture - Fruits": ["Automotive - Utility Vehicle", "Chemical - Commercial", "Energy - Fossil Fuels"],
  "Agriculture - Sugar": ["Automotive - Utility Vehicle", "Chemical - Commercial"],
  "Agriculture - Vegetables": ["Automotive - Utility Vehicle", "Chemical - Commercial", "Energy - Fossil Fuels"],
  "Agriculture - Beverage Crops": ["Automotive - Utility Vehicle", "Chemical - Commercial", "Energy - Fossil Fuels"],
  "Agriculture - Spices": ["Automotive - Utility Vehicle", "Chemical - Commercial", "Energy - Fossil Fuels"],
  "Fishing - Aquaculture": ["Animal Feed", "General Machinery", "Energy - Fossil Fuels"],
  "Fishing - Commercial": ["Shipbuilding - Commercial Small", "Energy - Fossil Fuels", "General Machinery"],
  "Fishing - Pearling": ["Shipbuilding - Commercial Small", "Energy - Fossil Fuels", "General Machinery"],
  "Forestry - Hard Wood": ["Automotive - Utility Vehicle", "Energy - Fossil Fuels", "Cargo Transportation - Road"],
  "Forestry - Soft Wood": ["Automotive - Utility Vehicle", "Energy - Fossil Fuels", "Cargo Transportation - Road"],
  "Forestry - Rubber": ["Automotive - Utility Vehicle", "Energy - Fossil Fuels", "Cargo Transportation - Road", "Chemical - Commercial"],
  "Forestry - Tropical Hardwood": ["Automotive - Utility Vehicle", "Energy - Fossil Fuels", "Cargo Transportation - Road"],
  "Mining - Precious Metals": ["Automotive - Utility Vehicle", "Energy - Fossil Fuels", "Cargo Transportation - Road", "Engineering - Environmental"],
  "Mining - Base Metals": ["Automotive - Utility Vehicle", "Energy - Fossil Fuels", "Cargo Transportation - Rail", "Engineering - Environmental"],
  "Mining - Precious Stones": ["Automotive - Utility Vehicle", "Energy - Fossil Fuels", "Cargo Transportation - Road", "Engineering - Environmental"],
  "Mining - Rare Earth Elements": ["Automotive - Utility Vehicle", "Energy - Fossil Fuels", "Cargo Transportation - Rail", "Engineering - Environmental"],
  "Mining - Industrial Minerals": ["Automotive - Utility Vehicle", "Energy - Fossil Fuels", "Cargo Transportation - Road", "Engineering - Environmental"],
  "Fuel - Coal Mining": ["Automotive - Utility Vehicle", "Energy - Fossil Fuels", "Cargo Transportation - Rail", "Engineering - Environmental"],
  "Fuel - Natural Gas Extraction": ["Automotive - Utility Vehicle", "Energy - Fossil Fuels", "Engineering - Environmental", "Metals - Refined Metals"],
  "Fuel - Petroleum Extraction": ["Automotive - Utility Vehicle", "Energy - Fossil Fuels", "Cargo Transportation - Ship", "Engineering - Environmental"],
  "Fuel - Uranium Extraction": ["Automotive - Utility Vehicle", "Energy - Fossil Fuels", "Cargo Transportation - Rail", "Engineering - Environmental"],

  // -- Services --
  // (Hospitality - Cultural Activities, Hospitality - Sex Work, Consulting,
  // Financial services - Investment management, Professional services -
  // Accounting, Professional services - Legal services, Professional
  // services - Management consulting, Gambling, Financial services -
  // Banking, and Financial services - Insurance are intentionally omitted
  // - see the comment above this table.)
  "Hospitality - Food Service": ["Agriculture - Animal Products", "Agriculture - Vegetables", "Agriculture - Spices", "Foodstuffs - Packaged Food", "Cargo Transportation - Road"],
  "Hospitality - Hotels": ["Construction - Commercial", "Cargo Transportation - Road", "Energy - Fossil Fuels", "Waste - Disposal"],
  "Hospitality - Tourism": ["Hospitality - Hotels", "Commercial Transportation - Air", "Cargo Transportation - Road"],
  "Mass Media - Printing & Publishing": ["Pulp and Paper Industry", "Electronics - Computing", "Information technology", "Cargo Transportation - Road"],
  "Mass Media - Film Industry": ["Electronics - Computing", "Electronics - Telecommunication", "Information technology", "Commercial Transportation - Air"],
  "Mass Media - Broadcast (News & TV)": ["Electronics - Telecommunication", "Electronics - Computing", "Information technology", "Energy - Fossil Fuels"],
  "Mass Media - Music Industry": ["Electronics - Computing", "Electronics - Telecommunication", "Information technology"],
  "Mass Media - Digital Media": ["Electronics - Computing", "Electronics - Telecommunication", "Information technology"],
  "Healthcare": ["Chemical - Pharmaceuticals", "Electronics - Industrial", "Electronics - Computing", "Cargo Transportation - Road", "Waste - Disposal"],
  "Information technology": ["Electronics - Computing", "Electronics - Telecommunication", "Energy - Fossil Fuels"],
  "Retailer - Online Store": ["Information technology", "Electronics - Computing", "Electronics - Telecommunication", "Cargo Transportation - Road"],
  "Retailer - Superstore": ["Cargo Transportation - Road", "Information technology", "Waste - Disposal"],
  "Retail sales - Luxury Brand": ["Consumer Goods - Luxury Goods", "Cargo Transportation - Air", "Information technology"],
  "Cargo Transportation - Air": ["Aerospace - Civil Aircraft Large", "Energy - Fossil Fuels", "Electronics - Industrial"],
  "Cargo Transportation - Ship": ["Shipbuilding - Commercial Large", "Energy - Fossil Fuels", "Metals - Steel"],
  "Cargo Transportation - Rail": ["Locomotive - Freight", "Metals - Steel", "Energy - Fossil Fuels", "Engineering - Civil"],
  "Cargo Transportation - Road": ["Automotive - Transportation Vehicles", "Energy - Fossil Fuels", "Metals - Steel"],
  "Commercial Transportation - Air": ["Aerospace - Civil Aircraft Large", "Energy - Fossil Fuels", "Electronics - Industrial"],
  "Commercial Transportation - Ship": ["Shipbuilding - Commercial Large", "Energy - Fossil Fuels", "Metals - Steel"],
  "Commercial Transportation - Rail": ["Locomotive - Passenger/High Speed", "Metals - Steel", "Energy - Fossil Fuels", "Engineering - Civil"],

  // -- Light Industry --
  "Consumer Goods - Appliances": ["Electronics - Industrial", "Metals - Refined Metals", "Consumer Goods - Plastics", "Engineering - Robotics"],
  "Consumer Goods - Beauty Products": ["Chemical - Commercial", "Chemical - Pharmaceuticals", "Consumer Goods - Plastics"],
  "Consumer Goods - Electronics": ["Electronics - Semiconductor", "Metals - Refined Metals", "Consumer Goods - Plastics", "Electronics - Industrial", "Engineering - Robotics"],
  "Consumer Goods - Furniture": ["Forestry - Hard Wood", "Forestry - Tropical Hardwood", "Metals - Refined Metals", "Consumer Goods - Plastics", "Textiles - Natural Fibers"],
  "Consumer Goods - Luxury Goods": ["Metals - Refined Metals", "Mining - Precious Metals", "Mining - Precious Stones", "Leather industry", "Textiles - Natural Fibers"],
  "Consumer Goods - Plastics": ["Chemical - Commodity", "Fuel - Petroleum Extraction", "Fuel - Natural Gas Extraction", "Engineering - Robotics"],
  "Foodstuffs - Alcohol": ["Agriculture - Carbohydrate Products", "Agriculture - Fruits", "Agriculture - Sugar", "Cargo Transportation - Road"],
  "Foodstuffs - Baked Goods": ["Agriculture - Carbohydrate Products", "Agriculture - Animal Products", "Cargo Transportation - Road"],
  "Foodstuffs - Beverages": ["Agriculture - Fruits", "Agriculture - Sugar", "Agriculture - Beverage Crops", "Cargo Transportation - Road"],
  "Foodstuffs - Candy": ["Agriculture - Sugar", "Agriculture - Beverage Crops", "Agriculture - Carbohydrate Products", "Agriculture - Fruits", "Cargo Transportation - Road"],
  "Foodstuffs - Canned Goods": ["Agriculture - Vegetables", "Agriculture - Animal Products", "Fishing - Commercial", "Consumer Goods - Plastics", "Metals - Refined Metals"],
  "Foodstuffs - Frozen Food": ["Agriculture - Animal Products", "Agriculture - Fruits", "Agriculture - Vegetables", "Fishing - Aquaculture", "Energy - Fossil Fuels"],
  "Foodstuffs - Packaged Food": ["Agriculture - Carbohydrate Products", "Agriculture - Animal Products", "Consumer Goods - Plastics", "Cargo Transportation - Road"],
  "Foodstuffs - Snacks": ["Agriculture - Carbohydrate Products", "Agriculture - Fruits", "Consumer Goods - Plastics", "Cargo Transportation - Road"],
  "Animal Feed": ["Agriculture - Carbohydrate Products", "Agriculture - Animal & Vegetable Byproducts", "Chemical - Commodity"],
  "Leather industry": ["Agriculture - Animals", "Chemical - Commercial", "Energy - Fossil Fuels"],
  "Attire - Accessories": ["Leather industry", "Textiles - Natural Fibers", "Metals - Refined Metals", "Consumer Goods - Plastics", "Fishing - Pearling"],
  "Attire - Clothing": ["Textiles - Cotton", "Textiles - Natural Fibers", "Textiles - Synthetic"],
  "Ceramics & Glassware": ["Mining - Industrial Minerals", "Chemical - Commodity", "Energy - Fossil Fuels", "General Machinery"],
  "Attire - Footwear": ["Leather industry", "Forestry - Rubber", "Textiles - Synthetic", "Consumer Goods - Plastics"],
  "Textiles - Cotton": ["Agriculture - Carbohydrate Products", "Chemical - Commodity", "General Machinery", "Energy - Fossil Fuels"],
  "Textiles - Natural Fibers": ["Agriculture - Animals", "Agriculture - Carbohydrate Products", "General Machinery", "Energy - Fossil Fuels"],
  "Textiles - Synthetic": ["Chemical - Commodity", "Fuel - Petroleum Extraction", "Fuel - Natural Gas Extraction", "General Machinery"],

  // -- Heavy Industry --
  "Automotive - Personal Vehicles": ["Metals - Steel", "Metals - Refined Metals", "Electronics - Semiconductor", "Consumer Goods - Plastics", "Engineering - Robotics"],
  "Automotive - Transportation Vehicles": ["Metals - Steel", "Metals - Refined Metals", "Electronics - Semiconductor", "Consumer Goods - Plastics", "Engineering - Robotics"],
  "Automotive - Utility Vehicle": ["Metals - Steel", "Metals - Refined Metals", "Electronics - Industrial", "Consumer Goods - Plastics", "Engineering - Robotics"],
  "Aerospace - Civil Aircraft Small": ["Metals - Alloys", "Electronics - Semiconductor", "Chemical - Commercial", "Engineering - Robotics", "Electronics - Industrial"],
  "Aerospace - Civil Aircraft Large": ["Metals - Alloys", "Electronics - Semiconductor", "Chemical - Commercial", "Engineering - Robotics", "Electronics - Telecommunication"],
  "Aerospace - Helicopter": ["Metals - Alloys", "Electronics - Semiconductor", "Engineering - Robotics", "Chemical - Commercial", "Electronics - Telecommunication"],
  "Aerospace - Rockets": ["Metals - Alloys", "Electronics - Semiconductor", "Chemical - Commercial", "Engineering - Robotics", "Electronics - Telecommunication"],
  "Aerospace - Spacecraft": ["Electronics - Telecommunication", "Electronics - Semiconductor", "Metals - Alloys", "Engineering - Robotics"],
  "Chemical - Commercial": ["Chemical - Commodity", "Fuel - Petroleum Extraction", "Fuel - Natural Gas Extraction", "General Machinery"],
  "Chemical - Commodity": ["Fuel - Petroleum Extraction", "Fuel - Natural Gas Extraction", "Energy - Fossil Fuels", "General Machinery"],
  "Chemical - Pharmaceuticals": ["Chemical - Commercial", "Chemical - Commodity", "Electronics - Industrial", "Electronics - Computing"],
  "Construction - Commercial": ["Metals - Steel", "Mining - Industrial Minerals", "Automotive - Utility Vehicle", "Engineering - Civil", "Cargo Transportation - Road"],
  "Construction - Industrial": ["Metals - Steel", "Metals - Refined Metals", "Automotive - Utility Vehicle", "Engineering - Civil", "Engineering - Environmental"],
  "Defense - Ammunition": ["Metals - Refined Metals", "Chemical - Commodity", "General Machinery", "Electronics - Industrial"],
  "Defense - Armoured Fighting Vehicle": ["Metals - Steel", "Metals - Alloys", "Electronics - Industrial", "Engineering - Robotics", "Electronics - Semiconductor"],
  "Defense - Artillery": ["Metals - Steel", "Metals - Alloys", "Engineering - Robotics", "Electronics - Industrial"],
  "Defense - Explosives": ["Chemical - Commodity", "Fuel - Petroleum Extraction", "Metals - Refined Metals", "General Machinery"],
  "Defense - Firearms": ["Metals - Steel", "Metals - Refined Metals", "General Machinery", "Chemical - Commodity"],
  "Defense - Missiles": ["Metals - Alloys", "Electronics - Semiconductor", "Chemical - Commercial", "Engineering - Robotics", "Electronics - Telecommunication"],
  "Defense - Military Aircraft": ["Metals - Alloys", "Electronics - Semiconductor", "Chemical - Commercial", "Engineering - Robotics", "Electronics - Telecommunication"],
  "Defense - Military Vehicles": ["Metals - Steel", "Metals - Alloys", "Electronics - Industrial", "Engineering - Robotics"],
  "Defense - Ships": ["Metals - Steel", "Metals - Alloys", "Electronics - Telecommunication", "Engineering - Robotics", "Engineering - Civil"],
  "Defense - Submarines": ["Metals - Steel", "Metals - Alloys", "Electronics - Telecommunication", "Engineering - Robotics", "Engineering - Civil"],
  "Electronics - Semiconductor": ["Chemical - Commodity", "Metals - Refined Metals", "Mining - Rare Earth Elements", "Engineering - Robotics", "Energy - Fossil Fuels"],
  "Electronics - Industrial": ["Electronics - Semiconductor", "Metals - Refined Metals", "Engineering - Robotics", "Chemical - Commodity"],
  "Electronics - Computing": ["Electronics - Semiconductor", "Metals - Refined Metals", "Consumer Goods - Plastics", "Electronics - Industrial", "Engineering - Robotics"],
  "Electronics - Telecommunication": ["Electronics - Semiconductor", "Metals - Refined Metals", "Metals - Steel", "Engineering - Robotics", "Energy - Fossil Fuels"],
  "Energy - Nuclear": ["Fuel - Uranium Extraction", "Metals - Alloys", "Metals - Steel", "General Machinery", "Engineering - Civil"],
  "Energy - Renewable": ["Metals - Refined Metals", "Metals - Steel", "Electronics - Industrial", "General Machinery", "Engineering - Civil"],
  "Energy - Fossil Fuels": ["General Machinery", "Metals - Steel", "Engineering - Environmental"],
  "Engineering - Civil": ["Automotive - Utility Vehicle", "Metals - Steel", "Electronics - Computing"],
  "Engineering - Environmental": ["General Machinery", "Chemical - Commercial", "Waste - Recycling", "Electronics - Industrial"],
  "Engineering - Robotics": ["Electronics - Semiconductor", "Electronics - Industrial", "Metals - Refined Metals", "General Machinery", "Information technology"],
  "General Machinery": ["Metals - Steel", "Metals - Refined Metals", "Chemical - Commodity", "Energy - Fossil Fuels"],
  "Locomotive - Rapid Transit & Light Rail": ["Metals - Steel", "Metals - Refined Metals", "Electronics - Industrial", "Engineering - Robotics", "Engineering - Civil"],
  "Locomotive - Freight": ["Metals - Steel", "Metals - Refined Metals", "Electronics - Industrial", "Engineering - Robotics", "Engineering - Civil"],
  "Locomotive - Passenger/High Speed": ["Metals - Steel", "Metals - Alloys", "Electronics - Industrial", "Engineering - Robotics", "Engineering - Civil"],
  "Metals - Alloys": ["Metals - Refined Metals", "Chemical - Commodity", "Energy - Fossil Fuels", "General Machinery"],
  "Metals - Refined Metals": ["Mining - Base Metals", "Mining - Industrial Minerals", "Energy - Fossil Fuels", "General Machinery", "Engineering - Environmental"],
  "Metals - Steel": ["Mining - Base Metals", "Fuel - Coal Mining", "Energy - Fossil Fuels", "General Machinery"],
  "Pulp and Paper Industry": ["Forestry - Soft Wood", "Forestry - Hard Wood", "Chemical - Commodity", "General Machinery", "Energy - Fossil Fuels"],
  "Shipbuilding - Commercial Large": ["Metals - Steel", "Metals - Alloys", "Electronics - Telecommunication", "Engineering - Robotics", "Engineering - Civil"],
  "Shipbuilding - Commercial Small": ["Metals - Steel", "Metals - Refined Metals", "Consumer Goods - Plastics", "Engineering - Robotics", "Engineering - Civil"],
  "Shipbuilding - Private": ["Metals - Steel", "Metals - Alloys", "Consumer Goods - Plastics", "Electronics - Semiconductor", "Engineering - Robotics"],
  "Waste - Disposal": ["Construction - Industrial", "Automotive - Utility Vehicle", "Cargo Transportation - Road"],
  "Waste - Recycling": ["Metals - Refined Metals", "Consumer Goods - Plastics", "Engineering - Robotics", "Engineering - Environmental"],
};

// Returns the import list for a specialization name. Returns an empty
// array both for names not in this table at all (future-proofing against
// pool edits) AND for the specializations deliberately left out (see the
// comment above IMPORTS_BY_SPECIALIZATION) - callers don't need to
// distinguish the two cases, they just show "no imports."
function importsForSpecialization(name){
  return IMPORTS_BY_SPECIALIZATION[name] || [];
}

// ---- Military Doctrine ----
//
// Military Priority: what a nation values most about its armed forces'
// makeup. Each option's description is shown to the player alongside its
// name.
const MILITARY_PRIORITY_INTRO = "What does your nation prioritize? Does your country value a single branch " +
  "above all else; a small, well-regulated army with strong discipline and good weaponry; a large, overwhelming " +
  "force that makes up for its lack of training and arms by its sheer size; or a healthy balance sacrificing " +
  "state-of-the-art equipment for a slightly larger size?";
const MILITARY_PRIORITY_OPTIONS = [
  { id: "Specialized", description: "Values a single branch above all else." },
  { id: "Quality",     description: "A small, well-regulated army with strong discipline and good weaponry." },
  { id: "Quantity",    description: "A large, overwhelming force that makes up for its lack of training and arms by its sheer size." },
  { id: "Balanced",    description: "A healthy balance, sacrificing state-of-the-art equipment for a slightly larger size." },
];

// Military Stance: national attitude towards war.
const MILITARY_STANCE_INTRO = "What is your national attitude towards war?";
const MILITARY_STANCE_OPTIONS = [
  { id: "Pacifist",   description: "No military." },
  { id: "Neutral",    description: "Armed but zero interference." },
  { id: "Defensive",  description: "Protective of themselves and allies." },
  { id: "Projecting", description: "Exerting pressure on those around them." },
  { id: "Combative",  description: "Actively hostile towards elements of the international community." },
  { id: "Aggressive", description: "Seen as a pariah state by the international community; warmongering." },
];

// ---- Military Focus ----
//
// Players distribute a points budget across five branches to rank their
// relative importance. The budget and each branch's cap depend on the
// Doctrine choices above.
const MILITARY_FOCUS_BASE_POINTS = 15;

// Stance-based budget bonus. Pacifist overrides everything else to 0
// (matches "No military" - Focus is skipped entirely for Pacifist).
function militaryFocusBudget(stance){
  if(stance === "Pacifist") return 0;
  if(stance === "Combative" || stance === "Aggressive") return MILITARY_FOCUS_BASE_POINTS + 5;
  if(stance === "Projecting") return MILITARY_FOCUS_BASE_POINTS + 2;
  if(stance === "Neutral") return MILITARY_FOCUS_BASE_POINTS - 2;
  return MILITARY_FOCUS_BASE_POINTS; // Defensive
}

// Each branch's standard (unmodified) cap, whether/how it can be raised
// by Doctrine choices, and any special allocation rule.
//
// Navy/Army/Air Force share the same raised-cap numbers: once their
// unlock condition is met, the cap becomes 9 - or 11 for a player with
// Specialized priority, since "values a single branch above all else"
// pushes further than any other combination can, in ANY of the three
// (Specialized alone is always one way to unlock each of them, alongside
// each branch's own specific condition). Expeditionary Forces uses its
// own, lower pair (5 / 7 with Specialized) since it's a smaller force by
// nature. Paramilitary works differently still (see its own comment).
const MILITARY_RAISED_CAP = 9;
const MILITARY_RAISED_CAP_SPECIALIZED = 11;
function raisedBranchCap(priority){
  return priority === "Specialized" ? MILITARY_RAISED_CAP_SPECIALIZED : MILITARY_RAISED_CAP;
}

const EXPEDITIONARY_RAISED_CAP = 5;
const EXPEDITIONARY_RAISED_CAP_SPECIALIZED = 7;
function raisedExpeditionaryCap(priority){
  return priority === "Specialized" ? EXPEDITIONARY_RAISED_CAP_SPECIALIZED : EXPEDITIONARY_RAISED_CAP;
}

const MILITARY_BRANCHES = [
  {
    id: "Navy",
    standardCap: 6,
    raiseCapIf: function(priority, stance){ return stance === "Projecting" || priority === "Specialized"; },
    raisedCap: function(priority, stance){ return raisedBranchCap(priority); },
    raiseDescription: "Raises to 9 (11 with Specialized priority) with Projecting stance or Specialized priority.",
  },
  {
    id: "Army",
    standardCap: 7,
    raiseCapIf: function(priority, stance){ return priority === "Quantity" || priority === "Specialized"; },
    raisedCap: function(priority, stance){ return raisedBranchCap(priority); },
    raiseDescription: "Raises to 9 (11 with Specialized priority) with Quantity or Specialized priority.",
  },
  {
    id: "Air Force",
    standardCap: 5,
    raiseCapIf: function(priority, stance){ return priority === "Quality" || priority === "Specialized"; },
    raisedCap: function(priority, stance){ return raisedBranchCap(priority); },
    raiseDescription: "Raises to 9 (11 with Specialized priority) with Quality or Specialized priority.",
  },
  {
    // No standard cap was given for this branch at all - unlike the other
    // four, it isn't just "harder to max out," it's unavailable entirely
    // without the right Doctrine. standardCap of 0 plus requiresUnlock
    // models "locked out" rather than "capped low."
    id: "Expeditionary Forces",
    standardCap: 0,
    requiresUnlock: true,
    raiseCapIf: function(priority, stance){ return stance === "Projecting" || stance === "Aggressive" || stance === "Combative"; },
    raisedCap: function(priority, stance){ return raisedExpeditionaryCap(priority); },
    raiseDescription: "Unlocks to 5 (7 with Specialized priority) with Projecting, Combative, or Aggressive stance.",
  },
  {
    id: "Paramilitary / Militia / Gendarmes / Reserves",
    // Not specially capped below the total budget - always tracks
    // whatever the current budget is (15/17/20). The special rule here is
    // the levelsPerPoint conversion, not a lower ceiling.
    standardCap: MILITARY_FOCUS_BASE_POINTS,
    raiseCapIf: function(){ return true; },
    raisedCap: function(priority, stance){ return militaryFocusBudget(stance); },
    levelsPerPoint: function(priority){ return priority === "Quality" ? 1 : 2; },
    raiseDescription: "Not capped below your total points budget. Each point buys 2 levels of strength, or 1 with Quality priority.",
  },
];


const SPECIALIZATION_COUNT = 5;

// ---- Energy Production adjustments from chosen specializations ----
//
// A Fuel specialization multiplies the Energy Production of whichever
// provinces rolled that same fuel type as their resource (see
// landbio.js's rollProvinceResources / RESOURCE_WEIGHTS_BY_CLIMATE) - not
// the claim's whole energy total. An Energy specialization instead adds a
// flat bonus to the total, regardless of which provinces have which
// resource. Both are keyed by RANK (which of the 5 export slots the
// specialization was chosen for), 1st being the strongest.
const FUEL_SPEC_TO_RESOURCE = {
  "Fuel - Coal Mining": "Coal",
  "Fuel - Natural Gas Extraction": "Natural Gas",
  "Fuel - Petroleum Extraction": "Oil",
  "Fuel - Uranium Extraction": "Uranium",
};
// Index 0 = 1st rank, index 4 = 5th rank.
const FUEL_MULTIPLIER_BY_RANK = [2.5, 2.25, 2, 1.75, 1.5];

// ---- Climate-gated specializations ----
//
// Some specializations only make sense given the right climate somewhere
// in the claim - Forestry's wood types being the clearest case (a
// softwood-timber industry needs actual softwood forest, not just any
// land). Keyed to real-world geography as a reasonable basis: softwood =
// cold/temperate coniferous forest, hardwood = temperate broadleaf
// forest, tropical hardwood = teak/mahogany-type tropical timber, rubber
// wood = rubber tree habitat (tropical, wetter). Pearling uses the same
// tropical/wet climates as rubber wood - pearl oysters need warm coastal
// water, the closest proxy this project has without a coastal/landlocked
// province flag. A specialization qualifies if the claim has AT LEAST ONE
// province in ANY of its listed climates - it doesn't need to dominate
// the claim.
const CLIMATE_SPEC_REQUIREMENTS = {
  "Forestry - Soft Wood":         ["Sub Arctic", "Highlands", "Oceanic", "Humid Continental"],
  "Forestry - Hard Wood":         ["Humid Continental", "Oceanic", "Mediterranean"],
  "Forestry - Tropical Hardwood": ["Tropical Rainforest"],
  "Forestry - Rubber":            ["Tropical Rainforest", "Tropical Wet Dry"],
  "Fishing - Pearling":           ["Tropical Rainforest", "Tropical Wet Dry"],
};

// ---- Primary sector specializations gated by a province's economic type ----
//
// Matched by name prefix (e.g. any "Agriculture - X" item) rather than
// listing every individual specialization out. Forestry and Fishing have
// no dedicated econ type of their own in this project (adding one would
// mean reworking the food/energy/population/GDP formulas AND reclassifying
// every existing province in data.js - a much bigger change than this),
// so both are grouped under Agriculture Focused/Oriented, matching how
// agriculture/forestry/fishing are commonly grouped as primary biological
// production in real-world classification. Mining requires Mineral
// Focused/Oriented. Fuel isn't listed here - it's already gated
// indirectly, since only Energy Focused/Oriented provinces roll a
// resource at all (see rollProvinceResources in landbio.js).
const PRIMARY_ECON_SECTOR_REQUIREMENTS = {
  "Agriculture": ["Agriculture Focused", "Agriculture Oriented"],
  "Fishing":     ["Agriculture Focused", "Agriculture Oriented"],
  "Forestry":    ["Agriculture Focused", "Agriculture Oriented"],
  "Mining":      ["Mineral Focused", "Mineral Oriented"],
};

// General-purpose "does this specialization's requirement check out"
// function, covering every kind of requirement this page enforces: a Fuel
// specialization needing a matching rolled resource somewhere in the
// claim, a climate-gated specialization (Forestry's wood types, Pearling)
// needing a matching climate somewhere in the claim, and a Primary-sector
// specialization needing a province of the matching economic type
// somewhere in the claim. Requirements can compound (Forestry's wood
// types need BOTH a matching climate AND an Agriculture-type province) -
// all applicable ones are checked, and any that fail are combined into
// one message. Returns null if the specialization has no requirement at
// all, true if it has one (or more) and all are met, or a description of
// what's missing otherwise.
function specializationRequirementStatus(name, availableResources, availableClimates, availableEconSectors){
  let hasAnyRequirement = false;
  const unmetReasons = [];

  const resource = FUEL_SPEC_TO_RESOURCE[name];
  if(resource){
    hasAnyRequirement = true;
    if(!availableResources[resource]) unmetReasons.push('requires ' + resource + ' in your claim');
  }

  const climates = CLIMATE_SPEC_REQUIREMENTS[name];
  if(climates){
    hasAnyRequirement = true;
    const climateMet = climates.some(function(c){ return availableClimates[c]; });
    if(!climateMet){
      unmetReasons.push('requires ' + (climates.length === 1 ? climates[0] : climates.join(' or ')) + ' climate in your claim');
    }
  }

  const sectorPrefix = Object.keys(PRIMARY_ECON_SECTOR_REQUIREMENTS).filter(function(p){
    return name.indexOf(p + ' - ') === 0;
  })[0];
  if(sectorPrefix){
    hasAnyRequirement = true;
    const econTypes = PRIMARY_ECON_SECTOR_REQUIREMENTS[sectorPrefix];
    const econMet = econTypes.some(function(e){ return (availableEconSectors || {})[e]; });
    if(!econMet){
      unmetReasons.push('requires ' + econTypes.join(' or ') + ' in your claim');
    }
  }

  if(!hasAnyRequirement) return null;
  if(unmetReasons.length === 0) return true;
  return unmetReasons.join('; ');
}

const ENERGY_SPEC_NAMES = ["Energy - Nuclear", "Energy - Renewable", "Energy - Fossil Fuels"];
const ENERGY_FLAT_BONUS_BY_RANK = [125, 100, 75, 50, 25];

// Applies both adjustments to a claim's per-province energy breakdown.
// perProvinceEnergy: [{ label, energy, resource }, ...] (from the bio
// page's snapshot hand-off). chosenSpecs: the 5 export-rank picks, in
// order (chosenSpecs[0] is 1st, etc. - may contain nulls for unfilled
// slots). Returns { adjustedTotal, originalTotal, appliedFuelBonuses,
// appliedEnergyBonuses } - the two "applied" arrays are for showing the
// player what actually kicked in, not just the final number.
function applyEnergySpecializationAdjustments(perProvinceEnergy, chosenSpecs){
  const originalTotal = perProvinceEnergy.reduce((sum, p) => sum + p.energy, 0);
  // Work on a copy keyed by label so multiple Fuel specs (unlikely to
  // both match the same province, but not impossible) compound correctly
  // rather than each recomputing from the original value.
  const working = {};
  perProvinceEnergy.forEach(p => { working[p.label] = p.energy; });

  const appliedFuelBonuses = [];
  const appliedEnergyBonuses = [];
  let flatBonusTotal = 0;

  (chosenSpecs || []).forEach((spec, i) => {
    if (!spec) return;
    const rank = i + 1;
    const resource = FUEL_SPEC_TO_RESOURCE[spec];
    if (resource) {
      const multiplier = FUEL_MULTIPLIER_BY_RANK[i];
      const matching = perProvinceEnergy.filter(p => p.resource === resource);
      matching.forEach(p => { working[p.label] = p.energy * multiplier; });
      appliedFuelBonuses.push({ spec, rank, resource, multiplier, provinces: matching.map(p => p.label) });
      return;
    }
    if (ENERGY_SPEC_NAMES.indexOf(spec) !== -1) {
      const bonus = ENERGY_FLAT_BONUS_BY_RANK[i];
      flatBonusTotal += bonus;
      appliedEnergyBonuses.push({ spec, rank, bonus });
    }
  });

  const adjustedTotal = Object.values(working).reduce((sum, v) => sum + v, 0) + flatBonusTotal;
  return { adjustedTotal, originalTotal, appliedFuelBonuses, appliedEnergyBonuses };
}

// ---- Food Production specializations ----
//
// Mirrors the Energy specialization mechanic exactly (not the Fuel
// mechanic): each chosen Agriculture/Fishing specialization adds a flat,
// rank-based bonus to Food Production, using the SAME flat values Energy
// uses (ENERGY_FLAT_BONUS_BY_RANK - not a separate table, so the two
// can't drift apart). What differs per specialization is an effect
// multiplier reflecting how directly it represents staple food-growing
// capacity versus a cash crop, luxury good, or already-processed product
// that doesn't add to the claim's food supply the same way:
//   - No effect (0x): cash/export crops and non-food goods - Pearling
//     (pearls aren't food), Spices, Beverage Crops, and Sugar (grown for
//     flavor/export/processing rather than caloric staple food).
//   - Half effect (0.5x): partial contributors - Fruits (nutritious but
//     not a staple caloric base), Animal & Vegetable Byproducts
//     (byproducts, not primary food output), and Animal Products (dairy/
//     eggs/wool - a real but secondary food contribution; meat itself is
//     already counted at Agriculture - Animals, so this stays at half
//     rather than full to avoid double-counting food from one livestock
//     pick).
//   - Full effect (1x): staple food production - Carbohydrate Products,
//     Vegetables, Aquaculture, Fishing - Commercial, and Animals (raising
//     livestock - this is where meat itself is counted, alongside the
//     rest of the staple food a livestock operation produces).
const FOOD_SPEC_EFFECT_MULTIPLIER = {
  // No effect
  "Fishing - Pearling": 0,
  "Agriculture - Spices": 0,
  "Agriculture - Beverage Crops": 0,
  "Agriculture - Sugar": 0,
  // Half effect
  "Agriculture - Fruits": 0.5,
  "Agriculture - Animal & Vegetable Byproducts": 0.5,
  "Agriculture - Animal Products": 0.5,
  // Full effect
  "Agriculture - Carbohydrate Products": 1,
  "Agriculture - Vegetables": 1,
  "Fishing - Aquaculture": 1,
  "Fishing - Commercial": 1,
  "Agriculture - Animals": 1,
};

// Applies Food Production adjustments. originalFoodProduction is the
// bio snapshot's numeric food total - unlike Energy, there's no
// per-province food breakdown in the data contract, so this works off
// a single aggregate number rather than summing per-province entries.
// chosenSpecs: the 5 export-rank picks (same array Energy reads).
// Returns { adjustedTotal, originalTotal, appliedFoodBonuses } -
// appliedFoodBonuses includes every chosen Agriculture/Fishing spec
// (even 0x ones), so the UI can show players why a pick had no effect
// rather than just silently omitting it.
function applyFoodSpecializationAdjustments(originalFoodProduction, chosenSpecs){
  const originalTotal = Number(originalFoodProduction) || 0;
  const appliedFoodBonuses = [];
  let flatBonusTotal = 0;

  (chosenSpecs || []).forEach((spec, i) => {
    if (!spec) return;
    if (!(spec in FOOD_SPEC_EFFECT_MULTIPLIER)) return;
    const rank = i + 1;
    const multiplier = FOOD_SPEC_EFFECT_MULTIPLIER[spec];
    const bonus = ENERGY_FLAT_BONUS_BY_RANK[i] * multiplier;
    flatBonusTotal += bonus;
    appliedFoodBonuses.push({ spec, rank, bonus, multiplier });
  });

  const adjustedTotal = originalTotal + flatBonusTotal;
  return { adjustedTotal, originalTotal, appliedFoodBonuses };
}

// ---- Population / GDP adjustment (Step 4) ----
//
// Population loss shrinks GDP at a progressive (tax-bracket-style) rate
// that gets steeper the more population is lost - losing the first 30%
// hurts proportionally less than losing the next 30%, which hurts less
// than the last 30%:
//   - 0% to -30% population: -3% GDP per -10% population
//   - -30% to -60% population: -5% GDP per -10% population
//   - -60% to -90% population: -15% GDP per -10% population
// These stack cumulatively, not as a flat rate applied to the whole
// loss - e.g. -50% population is 3 full -10% steps at the first rate
// (-9%) plus 2 steps at the second rate (-10%) = -19% GDP, and -90%
// population is 3 steps at each of the three rates (-9% - 15% - 45%)
// = -69% GDP.
// Population growth is simpler and linear, no brackets: +5% GDP per
// +10% population.
const POPULATION_LOSS_GDP_TIERS = [
  { thresholdPercent: 30, gdpPercentPer10: 3 },  // 0 to -30% population
  { thresholdPercent: 30, gdpPercentPer10: 5 },  // -30% to -60% population
  { thresholdPercent: 30, gdpPercentPer10: 15 }, // -60% to -90% population (and beyond, at this same rate)
];
const POPULATION_GAIN_GDP_PERCENT_PER_10 = 5;

// populationLossPercent is a POSITIVE number representing how much
// population was lost (e.g. pass 50 for a -50% population selection).
// Walks the tiers above cumulatively and returns the total GDP percent
// lost (also positive/positive-meaning-loss, e.g. 19 for a -50% input).
function gdpLossPercentForPopulationLoss(populationLossPercent){
  let remaining = populationLossPercent;
  let totalLossPercent = 0;
  for (let i = 0; i < POPULATION_LOSS_GDP_TIERS.length && remaining > 0; i++) {
    const tier = POPULATION_LOSS_GDP_TIERS[i];
    const isLastTier = i === POPULATION_LOSS_GDP_TIERS.length - 1;
    const stepInThisTier = isLastTier ? remaining : Math.min(remaining, tier.thresholdPercent);
    totalLossPercent += (stepInThisTier / 10) * tier.gdpPercentPer10;
    remaining -= stepInThisTier;
  }
  return totalLossPercent;
}

// Returns the net GDP percent CHANGE (positive for growth, negative for
// loss) for a given population percent change (e.g. -50 or +120).
function gdpPercentChangeForPopulationChange(populationPercent){
  if (populationPercent === 0) return 0;
  if (populationPercent > 0) return (populationPercent / 10) * POPULATION_GAIN_GDP_PERCENT_PER_10;
  return -gdpLossPercentForPopulationLoss(-populationPercent);
}

// Parses a GDP display string like "$1.2B", "$500M", "$45,000,000", or a
// plain number into { dollarSign, number, suffix, hadCommas } so an
// adjusted value can be reformatted in the same style. Returns null if
// the string doesn't start with a recognizable number - same "can't
// adjust, show unchanged" fallback stance the Energy/Food adjustments
// take toward snapshot data that isn't in an expected format, since GDP
// has never been parsed as a number anywhere else in this file either.
function parseGDPString(raw){
  if (!raw) return null;
  const match = String(raw).trim().match(/^(\$?)(-?[\d,]+(?:\.\d+)?)\s*([KMBTkmbt]?)/);
  if (!match) return null;
  const numberPart = parseFloat(match[2].replace(/,/g, ''));
  if (isNaN(numberPart)) return null;
  return { dollarSign: match[1], number: numberPart, suffix: match[3], hadCommas: match[2].indexOf(',') !== -1 };
}

// Reformats newNumber in the same style parseGDPString detected -
// comma-grouped if the original was, otherwise a plain number (rounded
// to 2 decimal places, matching how abbreviated forms like "$1.2B" are
// usually written) - carrying over the original's $ sign and K/M/B/T
// suffix untouched.
function formatGDPValue(parsed, newNumber){
  const numStr = parsed.hadCommas && !parsed.suffix
    ? Math.round(newNumber).toLocaleString('en-US')
    : String(Math.round(newNumber * 100) / 100);
  return parsed.dollarSign + numStr + parsed.suffix;
}

// originalGDP: the bio snapshot's raw GDP string (snapshot.gdp).
// populationPercent: the Step 4 dropdown's selected value (e.g. -50, 0, 120).
// Returns { adjustedGDPText, originalGDPText, gdpChangePercent, parsed }.
// When the GDP string can't be parsed, parsed is false and both text
// fields just echo the original unchanged, mirroring the Food adjustment's
// fallback behavior for unrecognized snapshot data.
function applyPopulationAdjustment(originalGDP, populationPercent){
  const originalGDPText = originalGDP || '\u2014';
  const parsed = parseGDPString(originalGDP);
  if (!parsed) {
    return { adjustedGDPText: originalGDPText, originalGDPText: originalGDPText, gdpChangePercent: null, parsed: false };
  }
  const gdpChangePercent = gdpPercentChangeForPopulationChange(populationPercent);
  const newNumber = parsed.number * (1 + gdpChangePercent / 100);
  const adjustedGDPText = formatGDPValue(parsed, newNumber);
  return { adjustedGDPText, originalGDPText, gdpChangePercent, parsed: true };
}

// Population also affects any "net surplus/deficit" production metric -
// Food Production first, and now Energy Production too, reusing the
// exact same formula (same constants, same curve shapes) rather than a
// separately-tuned one. Unlike the earlier version of this formula,
// province count isn't a factor at all; instead the LOSS side branches
// on whether the metric is currently a surplus or a deficit (value >= 0
// vs < 0), since population loss helps a deficit differently than it
// helps a surplus.
//
// Structurally simplified (named constants for the growth tier
// boundaries/rates, extracted growth/loss fraction variables) but every
// numeric literal and operation order is kept identical to the original
// spreadsheet formula - verified against a literal, unsimplified port
// across 5,328 population/value combinations (including deep positive
// and negative values) with zero mismatches, since even a
// mathematically-equivalent rewrite can shift which side of a rounding
// boundary a result lands on due to floating-point.
//
// currentValue is the metric's ALREADY-adjusted total from its own Step
// 3 specialization bonuses (Food's from applyFoodSpecializationAdjustments,
// Energy's from applyEnergySpecializationAdjustments) - population
// effects apply on top of that. populationPercent is the Step 4
// dropdown's value.
//
// The model, in plain terms:
//   - Growth (population >= stable): strain increases in three
//     escalating tiers - a mild penalty up to +30% population, a much
//     steeper one from +30% to +60%, and a severe one beyond +60%.
//   - Mild loss (down to -30% population): fewer consumers grows
//     the surplus (or shrinks the deficit) at an accelerating-then-
//     leveling rate.
//   - Deep loss (beyond -30%): if currently in surplus, the benefit of
//     losing more population peaks around -30% and then reverses - past
//     a certain point there aren't enough people left to do the work,
//     and the surplus starts shrinking again. If currently in deficit,
//     losing population keeps easing the shortage but the improvement
//     tapers off, capping at roughly half the original deficit even at
//     extreme population loss - losing everyone doesn't erase
//     underlying production problems.
const POP_PROD_GROWTH_TIER1_MAX = 0.30, POP_PROD_GROWTH_TIER1_RATE = 10;
const POP_PROD_GROWTH_TIER2_MAX = 0.60, POP_PROD_GROWTH_TIER2_RATE = 100;
const POP_PROD_GROWTH_TIER3_RATE = 600;
const POP_PROD_GROWTH_TIER1_PENALTY = POP_PROD_GROWTH_TIER1_RATE * POP_PROD_GROWTH_TIER1_MAX; // 3
const POP_PROD_GROWTH_TIER2_PENALTY = POP_PROD_GROWTH_TIER2_RATE * (POP_PROD_GROWTH_TIER2_MAX - POP_PROD_GROWTH_TIER1_MAX); // 70

function applyPopulationProductionAdjustment(currentValue, populationPercent){
  const B17 = Number(currentValue) || 0;
  const C3 = 1 + (Number(populationPercent) || 0) / 100; // e.g. -30 -> 0.7, 20 -> 1.2

  let adjustedTotal;
  if (C3 >= 1) {
    const growth = C3 - 1;
    if (growth <= POP_PROD_GROWTH_TIER1_MAX) {
      adjustedTotal = Math.round(B17 - POP_PROD_GROWTH_TIER1_RATE * growth);
    } else if (growth <= POP_PROD_GROWTH_TIER2_MAX) {
      adjustedTotal = Math.round(B17 - (POP_PROD_GROWTH_TIER1_PENALTY + POP_PROD_GROWTH_TIER2_RATE * (growth - POP_PROD_GROWTH_TIER1_MAX)));
    } else {
      adjustedTotal = Math.round(B17 - (POP_PROD_GROWTH_TIER1_PENALTY + POP_PROD_GROWTH_TIER2_PENALTY + POP_PROD_GROWTH_TIER3_RATE * (growth - POP_PROD_GROWTH_TIER2_MAX)));
    }
  } else {
    const loss = 1 - C3;
    let multiplier;
    if (C3 >= 0.70) {
      multiplier = 2 * loss - (10 / 3) * Math.pow(loss, 2);
    } else {
      const excessLoss = loss - 0.3;
      multiplier = B17 >= 0
        ? 0.3 - (1.3 / 0.49) * Math.pow(excessLoss, 2)
        : 0.3 + 0.2 * (1 - Math.exp(-3 * excessLoss));
    }
    adjustedTotal = Math.round(B17 + Math.abs(B17) * multiplier);
  }

  return { adjustedTotal, ratio: C3 };
}

// Thin, self-documenting wrappers around the shared model above - keeps
// call sites in specialization.js reading clearly (which metric this is
// for) without duplicating any of the actual formula.
function applyPopulationFoodAdjustment(currentFoodProduction, populationPercent){
  return applyPopulationProductionAdjustment(currentFoodProduction, populationPercent);
}
function applyPopulationEnergyAdjustment(currentEnergyProduction, populationPercent){
  return applyPopulationProductionAdjustment(currentEnergyProduction, populationPercent);
}


// Maps a World Exports rank's sector label (from landbio.js's
// buildWorldExports - "Services", "Consumer Goods", "Industrial Goods",
// "Raw Materials", combinations like "Services or Raw Materials", or
// "Any") to which SPECIALIZATION_POOLS keys it draws from. This is what
// ties each of the 5 Step 1 slots to the claim's actual generated export
// ranking, rather than letting the player freely pick from their whole
// economy type's pool.
const EXPORT_LABEL_TO_POOLS = {
  "Services":         ["Services"],
  "Consumer Goods":   ["Light Industry"],
  "Industrial Goods": ["Heavy Industry"],
  "Raw Materials":    ["Primary"],
};
const ALL_POOL_NAMES = ["Primary", "Services", "Light Industry", "Heavy Industry"];

function poolsForExportLabel(label){
  if(!label) return ALL_POOL_NAMES.slice();
  const trimmed = label.trim();
  if(trimmed === "Any") return ALL_POOL_NAMES.slice();
  if(EXPORT_LABEL_TO_POOLS[trimmed]) return EXPORT_LABEL_TO_POOLS[trimmed].slice();
  if(trimmed.indexOf(" or ") !== -1){
    let pools = [];
    trimmed.split(" or ").forEach(function(part){
      const mapped = EXPORT_LABEL_TO_POOLS[part.trim()];
      if(mapped) pools = pools.concat(mapped);
    });
    if(pools.length > 0) return pools;
  }
  // Unrecognized label (shouldn't normally happen) - fall back to
  // offering everything rather than leaving the slot with no options.
  return ALL_POOL_NAMES.slice();
}

// ---- Live Market Saturation (Google Sheet integration) ----
//
// The community's "Rylet Land Bio Data" sheet tracks, per specialization,
// how many finished land bios share that same World Export - the ST
// sheet's row 1 has the specialization names, row 3 has the resulting
// Market Saturation label (computed by the sheet itself; this file just
// displays whatever it says, it doesn't compute saturation itself).
// Fetched live so it stays current as more nations submit bios, rather
// than a snapshot that goes stale immediately - see fetchMarketSaturation
// below.
//
// NOTE: I could not do a live end-to-end test of this exact fetch from a
// real browser (no network access in the environment I built this in) -
// the CSV export URL format below is Google's standard, documented
// public-sheet export pattern, and the sheet loaded successfully when I
// fetched it directly to inspect its structure, but please confirm the
// live page actually pulls data correctly once deployed, and let me know
// if the sheet's sharing settings need adjusting for this to work.
const MARKET_DATA_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1GSaqRFLXAyr13NIPWLi-COP2618QG4gg8ki4y-4rqVk/export?format=csv&gid=1017667740";

// The six states, in ascending order of "how occupied" the market is.
// `fill` drives a small pie-style badge (see the CSS), `color` tints it -
// a simple green-to-red spectrum so the visual reads at a glance even
// before you know the exact label, with the label itself always in the
// legend and each badge's title/tooltip too.
const MARKET_SATURATION_LEVELS = [
  { id: "Untapped Market",     fill: "0%",   color: "#2e7d32" },
  { id: "Monopoly",            fill: "20%",  color: "#1565c0" },
  { id: "Rival Markets",       fill: "40%",  color: "#00897b" },
  { id: "Balanced Market",     fill: "60%",  color: "#c9a227" },
  { id: "Saturated Market",    fill: "80%",  color: "#ef6c00" },
  { id: "Oversaturated Market",fill: "100%", color: "#c62828" },
];

// Minimal CSV row parser (handles quoted fields, escaped quotes) - no
// external library, consistent with the rest of this static site.
function parseCsvLine(line){
  const result = [];
  let cur = "";
  let inQuotes = false;
  for(let i = 0; i < line.length; i++){
    const c = line[i];
    if(inQuotes){
      if(c === '"'){
        if(line[i+1] === '"'){ cur += '"'; i++; }
        else { inQuotes = false; }
      } else { cur += c; }
    } else {
      if(c === '"') inQuotes = true;
      else if(c === ",") { result.push(cur); cur = ""; }
      else cur += c;
    }
  }
  result.push(cur);
  return result;
}

// Fetches and parses the ST sheet, calling back with a map of
// { "Specialization Name": "Saturation Level" } on success, or
// callback(null, error) on failure (network error, sheet moved/private,
// unexpected format, etc.) - callers should degrade gracefully rather
// than block on this.
function fetchMarketSaturation(callback){
  fetch(MARKET_DATA_CSV_URL)
    .then(function(res){
      if(!res.ok) throw new Error("HTTP " + res.status);
      return res.text();
    })
    .then(function(csvText){
      const rows = csvText.split(/\r?\n/).map(parseCsvLine);
      const nameRow = rows[0] || [];
      const saturationRow = rows[2] || []; // row 3 (0-indexed: row 2)
      const validLevels = MARKET_SATURATION_LEVELS.map(function(l){ return l.id; });
      const map = {};
      nameRow.forEach(function(name, i){
        const trimmedName = (name || "").trim();
        const trimmedSat = (saturationRow[i] || "").trim();
        if(trimmedName && validLevels.indexOf(trimmedSat) !== -1){
          map[trimmedName.toLowerCase()] = trimmedSat;
        }
      });
      callback(map, null);
    })
    .catch(function(err){ callback(null, err); });
}
