(function(){
  'use strict';

  const SNAPSHOT_KEY = 'landClaimSpecializationSnapshot';

  // ---- load the snapshot handed off from the bio page ----
  let snapshot = null;
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if(raw) snapshot = JSON.parse(raw);
  } catch(e){ snapshot = null; }

  const noSnapshotCard = document.getElementById('noSnapshotCard');
  const specApp = document.getElementById('specApp');

  if(!snapshot){
    noSnapshotCard.hidden = false;
    specApp.hidden = true;
    return;
  }
  noSnapshotCard.hidden = true;
  specApp.hidden = false;

  // ---- populate the read-only snapshot header ----
  // Nation is entered on Step 5 (grouped with Capital/Classification/
  // Government Type), not on the bio page - snapshot.nation is only used
  // as a pre-fill fallback for old snapshots that still have it. It's no
  // longer shown in the top snapshot box - that slot now shows Provinces
  // instead, which doesn't change as the player types, so it's just set
  // once below.
  const identityNationEl = document.getElementById('identityNation');
  if(snapshot.nation) identityNationEl.value = snapshot.nation;
  document.getElementById('snapEconomy').textContent = snapshot.economyType || '\u2014';
  document.getElementById('snapPopulation').textContent = snapshot.population || '\u2014';
  document.getElementById('snapGDP').textContent = snapshot.gdp || '\u2014';
  document.getElementById('snapEnergy').textContent = snapshot.energyProduction || '\u2014';
  document.getElementById('snapFood').textContent = snapshot.foodProduction || '\u2014';
  document.getElementById('step1EconomyType').textContent = snapshot.economyType || '\u2014';

  // Parses a population figure like "5,000,000" or "5000000" into a
  // plain number; returns null if unrecognized (same fallback stance as
  // the GDP/Food parsers elsewhere in this file).
  function parsePopulationNumber(raw){
    if(!raw) return null;
    const match = String(raw).trim().match(/^(-?[\d,]+)/);
    if(!match) return null;
    const n = parseInt(match[1].replace(/,/g, ''), 10);
    return isNaN(n) ? null : n;
  }
  function formatPopulationValue(n){
    return Math.round(n).toLocaleString('en-US');
  }

  // ---- Step 1: one slot per World Exports rank, tied to that rank's sector ----
  // snapshot.worldExports is the bio's actual 1st-5th ranked export labels
  // (e.g. "Services", "Raw Materials", "Services or Raw Materials", "Any").
  // Each slot only offers specializations from the pool(s) that label maps
  // to - see poolsForExportLabel in specialization-data.js. Falls back to
  // "Any" (every pool) for all 5 ranks if the snapshot is missing this
  // data (e.g. a snapshot saved before this feature existed) - shown as a
  // visible warning rather than silently substituting different options
  // than the player would expect from their actual bio.
  const RANK_LABELS = ['1st', '2nd', '3rd', '4th', '5th'];
  const hasWorldExports = !!(snapshot.worldExports && snapshot.worldExports.length === 5);
  const worldExports = hasWorldExports ? snapshot.worldExports : ['Any', 'Any', 'Any', 'Any', 'Any'];
  const specSlotsEl = document.getElementById('specSlots');
  const chosenSpecs = new Array(5).fill(null); // one choice per rank, in order

  // ---- Small claims: fewer World Export slots ----
  //
  // A claim under 10 provinces represents a smaller nation whose workforce
  // can't realistically support 5 distinct major export industries, so it
  // only gets 3 World Export slots instead of 5. Two of those are sourced
  // from the bio's 1st and 2nd ranked exports specifically (not 1st/3rd,
  // etc.) - a combined economy type (e.g. "Industrial Goods & Services")
  // generates its two component sectors as the 1st and 2nd ranked exports,
  // so sourcing from ranks 1 and 2 guarantees both halves of a combined
  // economy type actually show up as real specializations, rather than
  // risking the 2nd sector getting crowded out by whatever lands in a
  // later, less predictable rank. The 3rd slot is sourced from the 5th
  // ranked export. Players see all three labeled sequentially as "1st
  // Export", "2nd Export", "3rd Export".
  //
  // Each visible slot has a SOURCE rank (which world-export label/pool it
  // draws its options from) and a STORAGE index (where the pick lands in
  // chosenSpecs). For a small claim these differ for the 2nd slot: it
  // sources its options from world-export rank 2 (index 1), but the pick
  // is stored at chosenSpecs[2] - the SPEC3 position - not chosenSpecs[1].
  // This is deliberate and affects real game mechanics, not just display:
  // every rank-keyed table in specialization-data.js (FUEL_MULTIPLIER_BY_
  // RANK, ENERGY_FLAT_BONUS_BY_RANK) reads chosenSpecs by its ARRAY INDEX,
  // so a spec landing at chosenSpecs[2] genuinely gets 3rd-rank bonus
  // strength (2x / +75), not 2nd-rank strength - matching the fact that
  // it's recorded as the SPEC3 pick. This one storage decision is what
  // drives the Citizen Card / admin info / Full Application recording too
  // (SPEC2 and SPEC4 simply stay null/blank, no separate remapping step
  // needed) as well as Step 3's bonus math - both fall out of the same
  // array position automatically.
  const SMALL_CLAIM_PROVINCE_THRESHOLD = 10;
  const provinceCount = (snapshot.perProvinceEnergy || []).length;
  document.getElementById('snapProvinces').textContent = provinceCount > 0 ? String(provinceCount) : '\u2014';
  // Only restrict when province count is actually known (>0) - an older
  // snapshot with no per-province data at all can't be judged as "small",
  // so it falls back to the normal 5 slots rather than being guessed at.
  const isSmallClaim = provinceCount > 0 && provinceCount < SMALL_CLAIM_PROVINCE_THRESHOLD;
  // { sourceRank: which worldExports[] label/pool supplies the options,
  //   storageIndex: which chosenSpecs[] slot the pick is written to }
  const VISIBLE_SLOTS = isSmallClaim
    ? [{ sourceRank: 0, storageIndex: 0 }, { sourceRank: 1, storageIndex: 2 }, { sourceRank: 4, storageIndex: 4 }]
    : [0, 1, 2, 3, 4].map(function(i){ return { sourceRank: i, storageIndex: i }; });
  // displayRankByStorageRank: maps a storage position's 1-indexed "rank"
  // (as the bonus tables see it, i.e. storageIndex+1) back to its
  // sequential display position, so the Step 3 breakdown's ordinal labels
  // stay consistent with what Step 1 showed the player (still "2nd", not
  // "3rd", even though the bonus strength genuinely is 3rd-rank).
  const displayRankByStorageRank = {};
  VISIBLE_SLOTS.forEach(function(slot, displayIndex){ displayRankByStorageRank[slot.storageIndex + 1] = displayIndex + 1; });

  if(!hasWorldExports){
    const warning = document.createElement('div');
    warning.className = 'spec-warning';
    warning.textContent = 'This claim\u2019s land bio doesn\u2019t have World Exports data attached (it may have been ' +
      'generated before this feature existed, or the snapshot didn\u2019t capture it). Every slot below is showing ' +
      'every specialization rather than the ranking your bio actually generated - go back and re-generate your ' +
      'bio, then continue here again, if you want the real ranking.';
    specSlotsEl.parentNode.insertBefore(warning, specSlotsEl);
  }

  if(isSmallClaim){
    const smallClaimNote = document.createElement('div');
    smallClaimNote.className = 'spec-warning';
    smallClaimNote.textContent = 'Your claim has ' + provinceCount + ' province' + (provinceCount === 1 ? '' : 's') +
      ' (fewer than ' + SMALL_CLAIM_PROVINCE_THRESHOLD + '), so to reflect your smaller workforce you only get 3 ' +
      'World Export slots instead of 5, drawn from your bio\u2019s 1st, 2nd, and 5th ranked exports.';
    specSlotsEl.parentNode.insertBefore(smallClaimNote, specSlotsEl);
  }

  function specId(rank, name){ return 'spec_' + rank + '_' + name.replace(/[^a-z0-9]+/gi, '_'); }

  // Fuel specializations require having a matching resource province, and
  // climate-gated specializations (Forestry's wood types) require having
  // a matching climate province - a player can't specialize in extracting
  // or harvesting something their claim doesn't actually have any of, and
  // Primary-sector specializations (Agriculture/Fishing/Forestry/Mining)
  // require a province of the matching economic type. Computed once from
  // the snapshot's per-province data. If that data isn't available at all
  // (an older bio snapshot predating this hand-off), every gated
  // specialization is treated as unavailable rather than assumed to
  // qualify, since there's no way to actually verify it.
  const availableResources = {};
  const availableClimates = {};
  const availableEconSectors = {};
  (snapshot.perProvinceEnergy || []).forEach(function(p){
    if(p.resource) availableResources[p.resource] = true;
    if(p.climate) availableClimates[p.climate] = true;
    if(p.econ) availableEconSectors[p.econ] = true;
  });

  function specializationGateReason(name){
    const status = specializationRequirementStatus(name, availableResources, availableClimates, availableEconSectors);
    if(status === null || status === true) return null; // no requirement, or requirement met
    return status; // e.g. "requires Oil in your claim"
  }

  function buildSlot(sourceRank, storageIndex, displayIndex){
    const label = worldExports[sourceRank];
    const poolNames = poolsForExportLabel(label);

    const slotDiv = document.createElement('div');
    slotDiv.className = 'spec-slot';
    slotDiv.setAttribute('data-rank', storageIndex);

    const heading = document.createElement('div');
    heading.className = 'spec-slot-heading';
    heading.appendChild(document.createTextNode(RANK_LABELS[displayIndex] + ' Export: '));
    const sectorSpan = document.createElement('span');
    sectorSpan.className = 'rank-sector';
    sectorSpan.textContent = label;
    heading.appendChild(sectorSpan);
    slotDiv.appendChild(heading);

    const status = document.createElement('div');
    status.className = 'spec-slot-status';
    status.textContent = 'Not yet chosen';
    slotDiv.appendChild(status);

    const optionsDiv = document.createElement('div');
    optionsDiv.className = 'spec-options';
    poolNames.forEach(function(poolName){
      const groupLabel = document.createElement('div');
      groupLabel.className = 'spec-group-label';
      groupLabel.textContent = poolName;
      optionsDiv.appendChild(groupLabel);

      (SPECIALIZATION_POOLS[poolName] || []).forEach(function(name){
        const id = specId(storageIndex, name);
        const optLabel = document.createElement('label');
        optLabel.className = 'spec-option';
        optLabel.setAttribute('for', id);
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'specRank' + storageIndex;
        input.id = id;
        input.value = name;

        const gateReason = specializationGateReason(name);
        if(gateReason){
          input.disabled = true;
          input.setAttribute('data-spec-gated', 'true');
          optLabel.classList.add('disabled');
        }
        optLabel.appendChild(input);
        optLabel.appendChild(document.createTextNode(' ' + name));
        if(gateReason){
          const note = document.createElement('span');
          note.className = 'resource-gate-note';
          note.textContent = ' (' + gateReason + ')';
          optLabel.appendChild(note);
        }
        optionsDiv.appendChild(optLabel);
      });
    });
    slotDiv.appendChild(optionsDiv);
    return slotDiv;
  }

  VISIBLE_SLOTS.forEach(function(slot, displayIndex){ specSlotsEl.appendChild(buildSlot(slot.sourceRank, slot.storageIndex, displayIndex)); });

  // ---- Market Saturation (live from the community's Google Sheet) ----
  // Shows a colored badge next to each specialization reflecting how many
  // other nations already share that export, plus a legend explaining
  // what each color means. Fetched after the slots render, so Step 1 is
  // usable immediately even if this is slow or fails outright.
  const marketLegendEl = document.createElement('div');
  marketLegendEl.className = 'market-legend';
  marketLegendEl.innerHTML = '<span class="market-legend-label">Loading market saturation data\u2026</span>';
  specSlotsEl.parentNode.insertBefore(marketLegendEl, specSlotsEl);

  function renderMarketLegend(){
    marketLegendEl.innerHTML = '';
    const label = document.createElement('span');
    label.className = 'market-legend-label';
    label.textContent = 'Market Saturation:';
    marketLegendEl.appendChild(label);
    MARKET_SATURATION_LEVELS.forEach(function(level){
      const item = document.createElement('span');
      item.className = 'market-legend-item';
      const badge = document.createElement('span');
      badge.className = 'market-badge';
      badge.style.setProperty('--fill', level.fill);
      badge.style.color = level.color;
      item.appendChild(badge);
      item.appendChild(document.createTextNode(level.id));
      marketLegendEl.appendChild(item);
    });
  }

  function applyMarketBadges(map){
    specSlotsEl.querySelectorAll('.spec-option').forEach(function(optionLabel){
      const input = optionLabel.querySelector('input[type="radio"]');
      if(!input) return;
      const status = map[input.value.toLowerCase()];
      if(!status) return;
      const level = MARKET_SATURATION_LEVELS.filter(function(l){ return l.id === status; })[0];
      if(!level) return;
      const badge = document.createElement('span');
      badge.className = 'market-badge';
      badge.style.setProperty('--fill', level.fill);
      badge.style.color = level.color;
      badge.title = status;
      optionLabel.insertBefore(badge, optionLabel.firstChild);
    });
  }

  let lastMarketMap = null;
  fetchMarketSaturation(function(map, err){
    if(err || !map){
      marketLegendEl.innerHTML = '<span class="market-legend-label market-legend-error">' +
        'Couldn\u2019t load live market saturation data - specializations are shown without it.</span>';
      return;
    }
    lastMarketMap = map;
    renderMarketLegend();
    applyMarketBadges(map);
  });

  // "Randomize" - fills every unfilled slot with a random pick from that
  // slot's own pool, skipping specializations already chosen in another
  // slot and (when market data loaded successfully) skipping Balanced/
  // Saturated/Oversaturated markets in favor of the three less-crowded
  // states. If filtering by market state would leave a slot with nothing
  // to pick from, that filter is dropped for just that slot rather than
  // leaving it unfilled.
  const EXCLUDED_RANDOM_STATES = ['Balanced Market', 'Saturated Market', 'Oversaturated Market'];
  document.getElementById('randomizeSpecsBtn').addEventListener('click', function(){
    // Full reroll every time - clears whatever's currently chosen (even
    // manual picks) first, so clicking again actually changes the result
    // instead of only filling in whatever's still blank.
    for(let r = 0; r < 5; r++){ chosenSpecs[r] = null; }
    specSlotsEl.querySelectorAll('input[type="radio"]').forEach(function(radio){
      radio.checked = false;
      // Resource-gated radios (a Fuel specialization with no matching
      // province in this claim) stay disabled through a reroll - they're
      // not eligible regardless of what else is chosen.
      if(radio.getAttribute('data-spec-gated') === 'true') return;
      radio.disabled = false;
      radio.closest('.spec-option').classList.remove('disabled');
    });
    specSlotsEl.querySelectorAll('.spec-slot-status').forEach(function(status){
      status.textContent = 'Not yet chosen';
      status.classList.remove('filled');
    });

    VISIBLE_SLOTS.forEach(function(slot){
      const poolNames = poolsForExportLabel(worldExports[slot.sourceRank]);
      let candidates = [];
      poolNames.forEach(function(poolName){
        (SPECIALIZATION_POOLS[poolName] || []).forEach(function(name){ candidates.push(name); });
      });
      candidates = candidates.filter(function(name){ return chosenSpecs.indexOf(name) === -1; });
      candidates = candidates.filter(function(name){ return !specializationGateReason(name); });
      if(lastMarketMap){
        const lessCrowded = candidates.filter(function(name){
          const status = lastMarketMap[name.toLowerCase()];
          return !status || EXCLUDED_RANDOM_STATES.indexOf(status) === -1;
        });
        if(lessCrowded.length > 0) candidates = lessCrowded;
      }
      if(candidates.length === 0) return;
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      const radio = document.getElementById(specId(slot.storageIndex, pick));
      if(radio){
        radio.checked = true;
        radio.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    updateNextButtonState();
  });

  // Sits right next to Randomize, same idea as standardSetupNextBtn on
  // Step 2 - just clicks the real Next button so it always follows the
  // same validation/step logic and stays in sync with it.
  document.getElementById('randomizeNextBtn').addEventListener('click', function(){
    nextBtn.click();
  });

  // Once a specialization is picked for one rank, it's disabled in every
  // other rank's list - the same specialty shouldn't be both your 1st and
  // 3rd export, for example.
  function refreshDuplicateState(){
    const chosenSet = new Set(chosenSpecs.filter(Boolean));
    specSlotsEl.querySelectorAll('input[type="radio"]').forEach(function(radio){
      const isSpecGated = radio.getAttribute('data-spec-gated') === 'true';
      const isChosenElsewhere = !radio.checked && chosenSet.has(radio.value);
      radio.disabled = isSpecGated || isChosenElsewhere;
      radio.closest('.spec-option').classList.toggle('disabled', isSpecGated || isChosenElsewhere);
    });
  }

  specSlotsEl.addEventListener('change', function(e){
    if(e.target.type !== 'radio') return;
    const rank = parseInt(e.target.name.replace('specRank', ''), 10);
    chosenSpecs[rank] = e.target.value;
    const slotDiv = e.target.closest('.spec-slot');
    const status = slotDiv.querySelector('.spec-slot-status');
    status.textContent = 'Chosen: ' + e.target.value;
    status.classList.add('filled');
    refreshDuplicateState();
    updateNextButtonState();
    updateSnapshotBox(computeCurrentAdjustments());
  });

  // ---- Step 2: Military Doctrine (Priority + Stance) ----
  document.getElementById('militaryPriorityIntro').textContent = MILITARY_PRIORITY_INTRO;
  document.getElementById('militaryStanceIntro').textContent = MILITARY_STANCE_INTRO;

  let chosenPriority = null;
  let chosenStance = null;

  function buildDoctrineOptions(containerId, options, groupName, onChosen){
    const container = document.getElementById(containerId);
    options.forEach(function(opt){
      const id = groupName + '_' + opt.id.replace(/[^a-z0-9]+/gi, '_');
      const optLabel = document.createElement('label');
      optLabel.className = 'spec-option doctrine-option';
      optLabel.setAttribute('for', id);
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = groupName;
      input.id = id;
      input.value = opt.id;
      optLabel.appendChild(input);
      const textWrap = document.createElement('span');
      const nameSpan = document.createElement('strong');
      nameSpan.textContent = opt.id;
      textWrap.appendChild(nameSpan);
      textWrap.appendChild(document.createTextNode(' \u2014 ' + opt.description));
      optLabel.appendChild(textWrap);
      container.appendChild(optLabel);
    });
    container.addEventListener('change', function(e){
      if(e.target.name !== groupName) return;
      onChosen(e.target.value);
      renderFocusBranches();
      updateNextButtonState();
    });
  }

  buildDoctrineOptions('militaryPriorityOptions', MILITARY_PRIORITY_OPTIONS, 'militaryPriority', function(v){ chosenPriority = v; });
  buildDoctrineOptions('militaryStanceOptions', MILITARY_STANCE_OPTIONS, 'militaryStance', function(v){ chosenStance = v; });

  // ---- Step 2: Military Focus (point allocation across 5 branches) ----
  document.getElementById('militaryFocusIntro').textContent =
    'Distribute your points between the different armed forces to rank their importance to your nation.';
  const focusBranchesEl = document.getElementById('militaryFocusBranches');
  const focusValues = {}; // branch id -> points currently allocated
  MILITARY_BRANCHES.forEach(function(b){ focusValues[b.id] = 0; });

  function branchCap(branch){
    const raised = chosenStance && branch.raiseCapIf && branch.raiseCapIf(chosenPriority, chosenStance);
    if(branch.requiresUnlock && !raised) return 0;
    if(!raised) return branch.standardCap;
    return branch.raisedCap(chosenPriority, chosenStance);
  }

  function pointsSpent(){
    return MILITARY_BRANCHES.reduce(function(sum, b){ return sum + (focusValues[b.id] || 0); }, 0);
  }

  function renderFocusBranches(){
    const budget = chosenStance ? militaryFocusBudget(chosenStance) : MILITARY_FOCUS_BASE_POINTS;
    const isPacifist = chosenStance === 'Pacifist';
    focusBranchesEl.innerHTML = '';

    MILITARY_BRANCHES.forEach(function(branch){
      const cap = Math.min(branchCap(branch), budget);
      // Clamp any already-entered value down if a doctrine change lowered this branch's cap.
      if(focusValues[branch.id] > cap) focusValues[branch.id] = cap;

      const row = document.createElement('div');
      row.className = 'focus-branch' + (cap === 0 ? ' locked' : '');

      const label = document.createElement('label');
      label.textContent = branch.id + ' (max ' + cap + ')';
      row.appendChild(label);

      // The rule explaining how to raise/unlock this branch is always
      // shown, not just while locked - so players can see what Doctrine
      // choices would help before committing to one.
      if(branch.raiseDescription){
        const rule = document.createElement('div');
        rule.className = 'focus-rule-note';
        rule.textContent = branch.raiseDescription;
        row.appendChild(rule);
      }

      const input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.max = String(cap);
      input.value = String(focusValues[branch.id]);
      input.disabled = isPacifist || cap === 0;
      input.setAttribute('data-branch', branch.id);
      row.appendChild(input);

      if(branch.levelsPerPoint){
        const levelsNote = document.createElement('span');
        levelsNote.className = 'focus-levels-note';
        const perPoint = branch.levelsPerPoint(chosenPriority);
        levelsNote.textContent = '= ' + (focusValues[branch.id] * perPoint) + ' levels (' + perPoint + ' per point)';
        row.appendChild(levelsNote);
      }

      focusBranchesEl.appendChild(row);
    });

    document.getElementById('focusPointsTotal').textContent = isPacifist ? '0 (Pacifist - no military)' : budget;
    updateRemainingPoints();
  }

  function updateRemainingPoints(){
    const budget = chosenStance ? militaryFocusBudget(chosenStance) : MILITARY_FOCUS_BASE_POINTS;
    const remaining = budget - pointsSpent();
    document.getElementById('focusPointsRemaining').textContent = remaining;
  }

  focusBranchesEl.addEventListener('input', function(e){
    if(e.target.tagName !== 'INPUT') return;
    const branchId = e.target.getAttribute('data-branch');
    const branch = MILITARY_BRANCHES.filter(function(b){ return b.id === branchId; })[0];
    if(!branch) return;
    let val = parseInt(e.target.value, 10);
    if(isNaN(val) || val < 0) val = 0;
    const cap = Math.min(branchCap(branch), chosenStance ? militaryFocusBudget(chosenStance) : MILITARY_FOCUS_BASE_POINTS);
    if(val > cap) val = cap;
    // Also can't exceed remaining budget across all branches combined.
    const otherSpent = pointsSpent() - (focusValues[branchId] || 0);
    const budget = chosenStance ? militaryFocusBudget(chosenStance) : MILITARY_FOCUS_BASE_POINTS;
    if(otherSpent + val > budget) val = Math.max(0, budget - otherSpent);
    focusValues[branchId] = val;
    e.target.value = String(val);
    if(branch.levelsPerPoint){
      const row = e.target.closest('.focus-branch');
      const levelsNote = row.querySelector('.focus-levels-note');
      const perPoint = branch.levelsPerPoint(chosenPriority);
      levelsNote.textContent = '= ' + (val * perPoint) + ' levels (' + perPoint + ' per point)';
    }
    updateRemainingPoints();
    updateNextButtonState();
  });

  renderFocusBranches();

  // "Use Standard Setup" - Defensive stance, Balanced priority, and a
  // preset point allocation (4 Navy / 5 Army / 3 Air Force / 3 Reserves)
  // that uses the full 15-point Defensive budget without needing any
  // raised caps, for players who just want a reasonable default.
  document.getElementById('standardSetupBtn').addEventListener('click', function(){
    const priorityRadio = document.getElementById('militaryPriority_Balanced');
    const stanceRadio = document.getElementById('militaryStance_Defensive');
    priorityRadio.checked = true;
    chosenPriority = 'Balanced';
    stanceRadio.checked = true;
    chosenStance = 'Defensive';

    MILITARY_BRANCHES.forEach(function(b){ focusValues[b.id] = 0; });
    focusValues['Navy'] = 4;
    focusValues['Army'] = 5;
    focusValues['Air Force'] = 3;
    focusValues['Paramilitary / Militia / Gendarmes / Reserves'] = 3;

    renderFocusBranches();
    updateNextButtonState();
  });

  // A second "Next" sitting right next to "Use Standard Setup," so
  // picking the preset doesn't require scrolling all the way back down
  // to the bottom nav to move on - it just clicks the real Next button,
  // so it always follows the same validation/step logic (and stays
  // disabled/enabled in sync with it - see updateNextButtonState).
  document.getElementById('standardSetupNextBtn').addEventListener('click', function(){
    nextBtn.click();
  });

  // ---- Step 3: show chosen specializations for reference ----
  function renderChosenSummary(){
    const el = document.getElementById('chosenSummary');
    const filled = chosenSpecs.filter(Boolean);
    if(filled.length === 0){ el.textContent = ''; return; }
    el.textContent = 'Your chosen specializations: ' + filled.join(', ');
  }

  // Matches landbio.js's formatSigned/energyStatusLabel/formatEnergyProduction
  // exactly (rounding, sign, status-label thresholds), so the number shown
  // here always reads the same way it does on the bio page.
  function formatEnergyValue(n){
    const rounded = Math.round(n);
    const sign = rounded >= 0 ? '+' : '';
    const label = rounded < 0 ? 'Energy Dependent' : rounded > 0 ? 'Energy Surplus' : 'Energy Balanced';
    return sign + rounded + ' ' + label;
  }

  function ordinal(n){
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  function renderEnergyAdjustment(){
    const perProvinceEnergy = snapshot.perProvinceEnergy || [];
    const originalEl = document.getElementById('adjEnergyOriginal');
    const valueEl = document.getElementById('adjEnergyValue');
    const breakdownEl = document.getElementById('adjEnergyBreakdown');

    if(perProvinceEnergy.length === 0){
      const fallback = snapshot.energyProduction || '\u2014';
      originalEl.textContent = fallback;
      valueEl.textContent = fallback;
      breakdownEl.textContent = 'Per-province data isn\u2019t available for this claim (an older bio snapshot, ' +
        'most likely), so specialization adjustments can\u2019t be calculated - showing the original total unchanged.';
      return;
    }

    const result = applyEnergySpecializationAdjustments(perProvinceEnergy, chosenSpecs);
    originalEl.textContent = formatEnergyValue(result.originalTotal);
    valueEl.textContent = formatEnergyValue(result.adjustedTotal);

    breakdownEl.innerHTML = '';
    result.appliedFuelBonuses.forEach(function(b){
      const line = document.createElement('span');
      line.className = 'breakdown-item';
      line.textContent = b.spec + ' (' + ordinal(displayRankByStorageRank[b.rank] || b.rank) + ') \u2014 ' + b.multiplier + '\u00d7 on ' +
        b.resource + ' provinces: ' + (b.provinces.length ? b.provinces.join(', ') : 'none in this claim');
      breakdownEl.appendChild(line);
    });
    result.appliedEnergyBonuses.forEach(function(b){
      const line = document.createElement('span');
      line.className = 'breakdown-item';
      line.textContent = b.spec + ' (' + ordinal(displayRankByStorageRank[b.rank] || b.rank) + ') \u2014 +' + b.bonus + ' flat';
      breakdownEl.appendChild(line);
    });
    if(result.appliedFuelBonuses.length === 0 && result.appliedEnergyBonuses.length === 0){
      breakdownEl.textContent = 'No Fuel or Energy specialization chosen - total is unchanged.';
    }
  }

  function formatFoodValue(n){
    const rounded = Math.round(n);
    const sign = rounded >= 0 ? '+' : '';
    const label = rounded < 0 ? 'Food Deficit' : rounded > 0 ? 'Food Surplus' : 'Food Balanced';
    return sign + rounded + ' ' + label;
  }

  // Unlike Energy, there's no per-province food array in the snapshot
  // contract - just the bio's single aggregate foodProduction figure, as
  // a string like "+30 Food Surplus". This pulls the leading signed
  // number back out so it can be used as a real starting total; returns
  // null if the string doesn't start with a parseable number (missing or
  // unrecognized snapshot data), same "can't adjust, show unchanged"
  // fallback stance the Energy side takes for missing per-province data.
  function parseFoodProductionNumber(raw){
    if(!raw) return null;
    const match = String(raw).match(/^([+-]?\d+)/);
    if(!match) return null;
    return parseInt(match[1], 10);
  }

  function renderFoodAdjustment(){
    const originalEl = document.getElementById('adjFoodOriginal');
    const valueEl = document.getElementById('adjFoodValue');
    const breakdownEl = document.getElementById('adjFoodBreakdown');

    const originalNumber = parseFoodProductionNumber(snapshot.foodProduction);
    if(originalNumber === null){
      const fallback = snapshot.foodProduction || '\u2014';
      originalEl.textContent = fallback;
      valueEl.textContent = fallback;
      breakdownEl.textContent = 'This claim\u2019s Food Production figure isn\u2019t in a recognized format, so ' +
        'specialization adjustments can\u2019t be calculated - showing the original total unchanged.';
      return;
    }

    const result = applyFoodSpecializationAdjustments(originalNumber, chosenSpecs);
    originalEl.textContent = formatFoodValue(result.originalTotal);
    valueEl.textContent = formatFoodValue(result.adjustedTotal);

    breakdownEl.innerHTML = '';
    result.appliedFoodBonuses.forEach(function(b){
      const line = document.createElement('span');
      line.className = 'breakdown-item';
      const displayRank = ordinal(displayRankByStorageRank[b.rank] || b.rank);
      const effectNote = b.multiplier === 0 ? 'no effect' : b.multiplier === 1 ? 'full effect' : (b.multiplier + '\u00d7 effect');
      line.textContent = b.spec + ' (' + displayRank + ') \u2014 +' + b.bonus + ' flat (' + effectNote + ')';
      breakdownEl.appendChild(line);
    });
    if(result.appliedFoodBonuses.length === 0){
      breakdownEl.textContent = 'No Agriculture or Fishing specialization chosen - total is unchanged.';
    }
  }

  // ---- Step 4: population -> GDP adjustment ----
  const specPopAdjustEl = document.getElementById('specPopAdjust');

  // Single source of truth for every population-affected total - GDP,
  // Population itself, Food Production, and Energy Production - so Step
  // 4's own display and the persistent snapshot box at the top of the
  // page can never show different numbers for the same picks. Pure
  // computation, no DOM writes.
  function computeCurrentAdjustments(){
    const populationPercent = parseInt(specPopAdjustEl.value, 10);

    const gdp = applyPopulationAdjustment(snapshot.gdp, populationPercent);

    const populationBase = parsePopulationNumber(snapshot.population);
    const population = populationBase === null ? null : {
      originalNumber: populationBase,
      adjustedNumber: Math.round(populationBase * (1 + populationPercent / 100)),
    };

    const foodBase = parseFoodProductionNumber(snapshot.foodProduction);
    let food = null;
    if(foodBase !== null){
      const specResult = applyFoodSpecializationAdjustments(foodBase, chosenSpecs);
      const popResult = applyPopulationFoodAdjustment(specResult.adjustedTotal, populationPercent);
      food = { step3Total: specResult.adjustedTotal, adjustedTotal: popResult.adjustedTotal };
    }

    const perProvinceEnergy = snapshot.perProvinceEnergy || [];
    let energy = null;
    if(perProvinceEnergy.length > 0){
      const specResult = applyEnergySpecializationAdjustments(perProvinceEnergy, chosenSpecs);
      const popResult = applyPopulationEnergyAdjustment(specResult.adjustedTotal, populationPercent);
      energy = { step3Total: specResult.adjustedTotal, adjustedTotal: popResult.adjustedTotal };
    }

    return { populationPercent, gdp, population, food, energy };
  }

  // The persistent snapshot box at the top of the page (visible on every
  // step, not just Step 4) - always shows the CURRENT totals given
  // whatever's been picked so far, not the bio's frozen original figures.
  // Provinces and Economy Type don't change from any player choice, so
  // they're set once elsewhere and left alone here.
  function updateSnapshotBox(totals){
    document.getElementById('snapPopulation').textContent = totals.population
      ? formatPopulationValue(totals.population.adjustedNumber) : (snapshot.population || '\u2014');
    document.getElementById('snapGDP').textContent = totals.gdp.parsed
      ? totals.gdp.adjustedGDPText : (snapshot.gdp || '\u2014');
    document.getElementById('snapEnergy').textContent = totals.energy
      ? formatEnergyValue(totals.energy.adjustedTotal) : (snapshot.energyProduction || '\u2014');
    document.getElementById('snapFood').textContent = totals.food
      ? formatFoodValue(totals.food.adjustedTotal) : (snapshot.foodProduction || '\u2014');
  }

  function renderPopulationAdjustment(){
    const totals = computeCurrentAdjustments();
    const populationPercent = totals.populationPercent;

    // Population itself
    const popOriginalEl = document.getElementById('adjPopulationOriginal');
    const popValueEl = document.getElementById('adjPopulationValue');
    const popBreakdownEl = document.getElementById('adjPopulationBreakdown');
    if(!totals.population){
      const fallback = snapshot.population || '\u2014';
      popOriginalEl.textContent = fallback;
      popValueEl.textContent = fallback;
      popBreakdownEl.textContent = 'This claim\u2019s Population figure isn\u2019t in a recognized format, so it ' +
        'can\u2019t be adjusted - showing the original unchanged.';
    } else {
      popOriginalEl.textContent = formatPopulationValue(totals.population.originalNumber);
      popValueEl.textContent = formatPopulationValue(totals.population.adjustedNumber);
      popBreakdownEl.textContent = populationPercent === 0
        ? 'Stable population - no change.'
        : (populationPercent > 0 ? '+' : '') + populationPercent + '% \u2192 ' + formatPopulationValue(totals.population.adjustedNumber);
    }

    // GDP
    const gdpOriginalEl = document.getElementById('adjGDPOriginal');
    const gdpValueEl = document.getElementById('adjGDPValue');
    const gdpBreakdownEl = document.getElementById('adjGDPBreakdown');
    gdpOriginalEl.textContent = totals.gdp.originalGDPText;
    gdpValueEl.textContent = totals.gdp.adjustedGDPText;
    if(!totals.gdp.parsed){
      gdpBreakdownEl.textContent = 'This claim\u2019s GDP figure isn\u2019t in a recognized format, so the population ' +
        'adjustment can\u2019t be calculated - showing the original total unchanged.';
    } else if(populationPercent === 0){
      gdpBreakdownEl.textContent = 'Stable population - no GDP change.';
    } else {
      const sign = totals.gdp.gdpChangePercent >= 0 ? '+' : '';
      gdpBreakdownEl.textContent = (populationPercent > 0 ? '+' : '') + populationPercent + '% population \u2192 ' +
        sign + (Math.round(totals.gdp.gdpChangePercent * 100) / 100) + '% GDP';
    }

    // Food Production - builds on top of Step 3's already-specialization-
    // adjusted total, not the bio's raw pre-specialization figure.
    const popFoodOriginalEl = document.getElementById('adjPopFoodOriginal');
    const popFoodValueEl = document.getElementById('adjPopFoodValue');
    const popFoodBreakdownEl = document.getElementById('adjPopFoodBreakdown');
    if(!totals.food){
      const fallback = snapshot.foodProduction || '\u2014';
      popFoodOriginalEl.textContent = fallback;
      popFoodValueEl.textContent = fallback;
      popFoodBreakdownEl.textContent = 'This claim\u2019s Food Production figure isn\u2019t in a recognized format, ' +
        'so the population adjustment can\u2019t be calculated - showing the original total unchanged.';
    } else {
      popFoodOriginalEl.textContent = formatFoodValue(totals.food.step3Total);
      popFoodValueEl.textContent = formatFoodValue(totals.food.adjustedTotal);
      popFoodBreakdownEl.textContent = populationPercent === 0
        ? 'Stable population - no additional Food Production change.'
        : (populationPercent > 0 ? '+' : '') + populationPercent + '% population \u2192 ' + formatFoodValue(totals.food.adjustedTotal) + ' net.';
    }

    // Energy Production - same pattern as Food, built on Step 3's total.
    const popEnergyOriginalEl = document.getElementById('adjPopEnergyOriginal');
    const popEnergyValueEl = document.getElementById('adjPopEnergyValue');
    const popEnergyBreakdownEl = document.getElementById('adjPopEnergyBreakdown');
    if(!totals.energy){
      const fallback = snapshot.energyProduction || '\u2014';
      popEnergyOriginalEl.textContent = fallback;
      popEnergyValueEl.textContent = fallback;
      popEnergyBreakdownEl.textContent = 'Per-province data isn\u2019t available for this claim, so the population ' +
        'adjustment can\u2019t be calculated - showing the original total unchanged.';
    } else {
      popEnergyOriginalEl.textContent = formatEnergyValue(totals.energy.step3Total);
      popEnergyValueEl.textContent = formatEnergyValue(totals.energy.adjustedTotal);
      popEnergyBreakdownEl.textContent = populationPercent === 0
        ? 'Stable population - no additional Energy Production change.'
        : (populationPercent > 0 ? '+' : '') + populationPercent + '% population \u2192 ' + formatEnergyValue(totals.energy.adjustedTotal) + ' net.';
    }

    updateSnapshotBox(totals);
  }

  specPopAdjustEl.addEventListener('change', renderPopulationAdjustment);
  updateSnapshotBox(computeCurrentAdjustments());

  // ---- Step 5: National Identity + Citizen Card BBC ----
  //
  // Matches the community's Citizen App Card template exactly - every
  // {{PLACEHOLDER}} below corresponds 1:1 to a "PUT X HERE" spot in the
  // original BBC. Things this page has no data for (flag image, dispatch
  // link, IIWiki link) are left as the original template's own literal
  // placeholder text for the player to fill in by hand after copying.
  const CITIZEN_CARD_TEMPLATE =
`[pre][box][background-block=#FFE6E6][center][size=250][b] [nation=noflag]{{NATION}}[/nation][/b][/size]
[img]200x100 Pixel Image of Flag here[/img]
[u]Join Date:{{JOIN_DATE}}[/u]
[Spoiler= More Information][table=plain][tr]
[td][size=110]Classification:
[b]{{CLASSIFICATION}}[/b][/size][/td]
[td][size=110]Capital:
[b]{{CAPITAL}}[/b][/size][/td]
[td][size=110]Population:
[b]{{POPULATION}}[/b][/size][/td]
[/tr][tr]
[td][size=110]Government Type: 
[b]{{GOVERNMENT_TYPE}}[/b][/size][/td]
[td][size=110]Economy Type: 
[b]{{ECONOMY_TYPE}}[/b][/size][/td]
[td][size=110]Gross Domestic Product: 
[b]{{GDP}}[/b][/size][/td]
[/tr]
[/table]
[table]
[tr][td][/td][td][/td][/tr]
[tr][td]
[list=1][*]{{SPEC1}}[*]{{SPEC2}}[*]{{SPEC3}}[*]{{SPEC4}}[*]{{SPEC5}}[/list][/td]
[td][list][*]Doctrine: {{PRIORITY}}
[*]Stance: {{STANCE}}
[*]Army: {{ARMY}}
[*]Navy: {{NAVY}}
[*]Air Force: {{AIR_FORCE}}
[*]Expeditionary: {{EXPEDITIONARY}}
[*]Paramilitary: {{PARAMILITARY}}[/list][/td]
[/tr][/table][/spoiler[delete this]]

[url=DISPATCH HERE]Full Citizen Application[/url]
[url=IIWIKI LINK (Optional but encouraged)]IIWiki Page[/url]
[/Center][/background-block][/box][/pre]`;

  function todayJoinDate(){
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);
    return mm + '-' + dd + '-' + yy;
  }

  // Common values both the Citizen Card and the Full Application pull
  // from - factored out so the two templates can't drift out of sync
  // with each other on things like how Pacifist is worded.
  function gatherCommonFields(){
    // chosenSpecs is already indexed by its recorded SPEC position (see
    // VISIBLE_SLOTS above) - no remapping needed here anymore.
    const specs = [0,1,2,3,4].map(function(i){ return chosenSpecs[i] || ''; });
    const priorityText = chosenStance === 'Pacifist' ? 'Pacifist (no military)' : (chosenPriority || '');
    const stanceText = chosenStance || '';
    const army = String(focusValues['Army'] || 0);
    const navy = String(focusValues['Navy'] || 0);
    const airForce = String(focusValues['Air Force'] || 0);
    const expeditionary = String(focusValues['Expeditionary Forces'] || 0);
    const paramilitary = String(focusValues['Paramilitary / Militia / Gendarmes / Reserves'] || 0);
    const nationName = document.getElementById('identityNation').value.trim();
    return { specs, priorityText, stanceText, army, navy, airForce, expeditionary, paramilitary, nationName };
  }

  function buildCitizenCard(){
    const f = gatherCommonFields();
    const nationName = f.nationName;

    const card = CITIZEN_CARD_TEMPLATE
      .replace('{{NATION}}', nationName || 'Nation')
      .replace('{{JOIN_DATE}}', todayJoinDate())
      .replace('{{CLASSIFICATION}}', document.getElementById('identityClassification').value.trim())
      .replace('{{CAPITAL}}', document.getElementById('identityCapital').value.trim())
      .replace('{{POPULATION}}', snapshot.population || '')
      .replace('{{GOVERNMENT_TYPE}}', document.getElementById('identityGovernment').value.trim())
      .replace('{{ECONOMY_TYPE}}', snapshot.economyType || '')
      .replace('{{GDP}}', snapshot.gdp || '')
      .replace('{{SPEC1}}', f.specs[0]).replace('{{SPEC2}}', f.specs[1]).replace('{{SPEC3}}', f.specs[2])
      .replace('{{SPEC4}}', f.specs[3]).replace('{{SPEC5}}', f.specs[4])
      .replace('{{PRIORITY}}', f.priorityText)
      .replace('{{STANCE}}', f.stanceText)
      .replace('{{ARMY}}', f.army)
      .replace('{{NAVY}}', f.navy)
      .replace('{{AIR_FORCE}}', f.airForce)
      .replace('{{EXPEDITIONARY}}', f.expeditionary)
      .replace('{{PARAMILITARY}}', f.paramilitary);

    // A copy-paste-ready block matching the FR (Form Responses) sheet's
    // own column order (B through U - column A/Timestamp is filled by
    // the sheet/form itself on submission). Bare values only, one per
    // line, no labels - this goes straight into sheet cells, so a label
    // would just be one more thing to strip out before pasting.
    //
    // Food/Energy Production are wrapped in literal double quotes before
    // being pasted: both start with a leading "-" (e.g. "-75: Minor Food
    // Importer"), which Sheets tries to read as the start of a formula/
    // negative number on paste instead of as plain text. A value that
    // instead starts with a quote character isn't a formula trigger, so
    // it pastes in as-is. GDP/Population don't need this - they start
    // with "$"/a digit, neither of which Sheets treats as a formula lead.
    const claimMapHexColor = (function(){
      const el = document.getElementById('claimMapColorHex');
      return el ? el.value.trim() : '';
    })();

    const adminInfo = [
      nationName,
      document.getElementById('identityClassification').value.trim(),
      document.getElementById('identityCapital').value.trim(),
      document.getElementById('identityGovernment').value.trim(),
      snapshot.economyType || '',
      snapshot.gdp || '',
      snapshot.foodProduction ? '"' + snapshot.foodProduction + '"' : '',
      snapshot.energyProduction ? '"' + snapshot.energyProduction + '"' : '',
      snapshot.population || '',
      f.specs[0],
      f.specs[1],
      f.specs[2],
      f.specs[3],
      f.specs[4],
      f.priorityText,
      f.stanceText,
      f.navy,
      f.army,
      f.airForce,
      f.expeditionary,
      f.paramilitary,
      snapshot.claimCode || '',
      claimMapHexColor,
    ].join('\n');

    return card + '\n\n[/spoiler]\n\n[spoiler=for admin team usage]\n' + adminInfo + '\n[/spoiler]';
  }

  // ---- Full Application BBC generator ----
  //
  // A separate, longer template from the Citizen Card - this is the post
  // players make in their own Dispatches (the Citizen Card above is what
  // gets sent to Rylet directly, see the Next Steps note in Step 5's
  // HTML). Every {{PLACEHOLDER}} below corresponds 1:1 to a
  // "{Generator Fill}" spot in the community-provided template. Sections
  // meant for the player to write themselves (Political Environment,
  // Major Imports picks, economy narrative, military narrative, History)
  // are left as the original template's own instructional text in
  // parentheses - this page has no data to fill those from, same
  // philosophy as the Citizen Card leaving the flag image for the player.
  const FULL_APPLICATION_TEMPLATE =
`[list][*][b]Display Name[/b]: {{DISPLAY_NAME}}
[*][b]Capital City[/b]: {{CAPITAL}}
[*][b]Territory[/b]: [spoiler][img]INSERTIMAGEHERE[/img][/spoiler]
[*][b]Population[/b]: {{POPULATION}}
[*][b]Description of Political Environment[/b]: 


(Give a fairly detailed description of your nation's Government, including Type of Government, Head of Government/State, legislature, etc.)

[*][b]Description of the Economy[/b]: 

[list]
[*][b]Economy Type[/b]: {{ECONOMY_TYPE}}

[*][b]Specialization[/b]
{{SPEC1}} | {{SPEC2}} | {{SPEC3}} | {{SPEC4}}| {{SPEC5}}|
[*][b]Description of Resources:[/b]
    Food Production: {{FOOD_PRODUCTION}}
    Energy Production: {{ENERGY_PRODUCTION}}

[*][b]Major Imports[/b]
(Use the potential imports section as an idea of what kind of imports your nation might need. Some things make sense to produce nationally while others might be outside of the scope of your nation. Choose a few 3-5 to list so you can find economic partners)
[/list]

(Describe your economic system including the type of economy, the GDP in the Land Bio as well as the world exports chosen from the form. Outside of Land Bio information, be sure to tell us about how your economy operates going slightly beyond just saying "free trade")

[*][b]Description of Your Nation's Military:[/b]

[b]Military Doctrine[/b]: {{MIL_DOCTRINE}}

[b]National Attitude[/b]: {{NATIONAL_ATTITUDE}}

[b]Military Focus[/b]:
[List]
{{ARMY}} :[b]Army[/b]
{{NAVY}} :[b]Navy[/b]
{{AIR_FORCE}} :[b]Air force[/b]
{{EXPEDITIONARY}} :[b]Expeditionary[/b]
{{PARAMILITARY}} :[b] Paramilitary/Militia/Gendarmes[/b]
[/list]
(Military size, type, and quality of equipment, strengths/weaknesses, etc.[Size should be at most 5% of your country's population most nations should be well below that])

[*][b]History of your Nation[/b]: (Make it sufficiently detailed to take into account all territorial claims)`;

  function buildFullApplication(){
    const f = gatherCommonFields();
    const application = FULL_APPLICATION_TEMPLATE
      .replace('{{DISPLAY_NAME}}', f.nationName || 'Nation')
      .replace('{{CAPITAL}}', document.getElementById('identityCapital').value.trim())
      .replace('{{POPULATION}}', snapshot.population || '')
      .replace('{{ECONOMY_TYPE}}', snapshot.economyType || '')
      .replace('{{SPEC1}}', f.specs[0]).replace('{{SPEC2}}', f.specs[1]).replace('{{SPEC3}}', f.specs[2])
      .replace('{{SPEC4}}', f.specs[3]).replace('{{SPEC5}}', f.specs[4])
      .replace('{{FOOD_PRODUCTION}}', snapshot.foodProduction || '')
      .replace('{{ENERGY_PRODUCTION}}', snapshot.energyProduction || '')
      .replace('{{MIL_DOCTRINE}}', f.priorityText)
      .replace('{{NATIONAL_ATTITUDE}}', f.stanceText)
      .replace('{{ARMY}}', f.army)
      .replace('{{NAVY}}', f.navy)
      .replace('{{AIR_FORCE}}', f.airForce)
      .replace('{{EXPEDITIONARY}}', f.expeditionary)
      .replace('{{PARAMILITARY}}', f.paramilitary);

    // The Citizen Card used to be its own separate copy button - it's now
    // folded into the bottom of the Full Application (wrapped in its own
    // spoiler) since players send the whole Application to Rylet as one
    // piece. buildCitizenCard() is unchanged and still includes its own
    // nested admin-info spoiler - that data is exactly what Rylet needs
    // to process the application, so it travels along with it.
    const citizenCard = buildCitizenCard();
    return application + '\n\n[spoiler=Citizen Card]\n' + citizenCard + '\n[/spoiler]';
  }

  // Same copy-to-clipboard pattern used on the bio page (map.js's
  // bindCopyButton), reimplemented here since this is a separate page.
  function bindCopyButton(btnId, getText, label){
    const btn = document.getElementById(btnId);
    if(!btn) return;
    btn.addEventListener('click', function(){
      const text = getText();
      function done(ok){
        btn.textContent = ok ? 'Copied!' : 'Copy failed \u2014 select the text manually';
        btn.classList.toggle('copied', ok);
        setTimeout(function(){ btn.textContent = label; btn.classList.remove('copied'); }, 1800);
      }
      if(navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(text).then(function(){ done(true); }, function(){ done(false); });
      } else {
        try {
          const ta = document.createElement('textarea');
          ta.value = text; document.body.appendChild(ta); ta.select();
          document.execCommand('copy'); document.body.removeChild(ta);
          done(true);
        } catch(e){ done(false); }
      }
    });
  }
  bindCopyButton('copyFullApplicationBtn', function(){
    const text = buildFullApplication();
    document.getElementById('fullApplicationSource').value = text;
    return text;
  }, 'Full Application');

  // ---- Step navigation ----
  const TOTAL_STEPS = 5;
  let currentStep = 1;
  const backBtn = document.getElementById('backBtn');
  const nextBtn = document.getElementById('nextBtn');
  const stepIndicator = document.getElementById('stepIndicator');

  function panelFor(step){
    return document.getElementById('step' + step);
  }

  function updateNextButtonState(){
    let enabled = true;
    if(currentStep === 1) enabled = VISIBLE_SLOTS.every(function(slot){ return !!chosenSpecs[slot.storageIndex]; });
    if(currentStep === 2){
      // Doctrine (both Priority and Stance) always required. Focus points
      // must be fully allocated too, UNLESS Pacifist (budget is 0, so
      // there's nothing to allocate - Focus is effectively skipped).
      const doctrineChosen = !!chosenPriority && !!chosenStance;
      const budget = chosenStance ? militaryFocusBudget(chosenStance) : MILITARY_FOCUS_BASE_POINTS;
      const focusComplete = chosenStance === 'Pacifist' || pointsSpent() === budget;
      enabled = doctrineChosen && focusComplete;
    }
    // Step 5 (National Identity) is never gated - these are flavor fields.
    nextBtn.disabled = !enabled;
    const standardSetupNextBtn = document.getElementById('standardSetupNextBtn');
    if(standardSetupNextBtn) standardSetupNextBtn.disabled = !enabled;
    const randomizeNextBtn = document.getElementById('randomizeNextBtn');
    if(randomizeNextBtn) randomizeNextBtn.disabled = !enabled;
  }

  function showStep(step){
    // hide all panels
    [1,2,3,4,5].forEach(function(s){ panelFor(s).hidden = true; });
    panelFor(step).hidden = false;

    backBtn.hidden = (step === 1);
    nextBtn.textContent = (step === TOTAL_STEPS) ? 'Finish \u2192' : 'Next \u2192';
    // Step 5 is the real final step now (no separate summary page after
    // it) - nothing to advance to, so the Next/Finish button just hides.
    nextBtn.hidden = (step === TOTAL_STEPS);

    // update step-indicator dots
    stepIndicator.querySelectorAll('.step-dot').forEach(function(dot){
      const dotStep = parseInt(dot.getAttribute('data-step'), 10);
      dot.classList.toggle('active', dotStep === step);
      dot.classList.toggle('done', dotStep < step);
    });

    if(step === 3){ renderChosenSummary(); renderEnergyAdjustment(); renderFoodAdjustment(); }
    if(step === 4) renderPopulationAdjustment();
    if(step === 5){ renderClaimMap(); renderPotentialImports(); }
    updateNextButtonState();
  }

  // ---- Step 5: claim map snapshot (handed off from the bio page) ----
  //
  // map.js embeds a ready-made "map of your claim" SVG (one per continent
  // the claim touches, gold-outlined provinces on the same neutral fill
  // used elsewhere) directly on the bio page, and captures that same
  // markup into snapshot.claimMapHtml when "Continue to Specialization" is
  // clicked. Older snapshots saved before this existed simply won't have
  // it - handled the same "show a note, don't error" way as every other
  // optional snapshot field on this page.
  //
  // Rendered once (guarded by claimMapRendered) rather than every time
  // Step 5 is shown, since the map itself never changes and rebuilding it
  // repeatedly would just detach/reattach the same SVGs for no reason.
  let claimMapRendered = false;

  // Rasterizes one of the claim-map SVGs to a PNG and triggers a browser
  // download - SVG is what's embedded, but a plain image file is far more
  // useful for actually attaching to a forum post than raw SVG markup
  // would be. Draws through an off-screen <img>/<canvas> pair (the
  // standard way to rasterize inline SVG client-side); upscaled 3x off the
  // SVG's own viewBox dimensions so the exported image isn't blurry when
  // embedded larger than the on-page thumbnail.
  function downloadSvgAsPng(svgEl, filename){
    const svgString = new XMLSerializer().serializeToString(svgEl);
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = function(){
      const vb = svgEl.viewBox && svgEl.viewBox.baseVal;
      const scale = 3;
      const width = (vb && vb.width) ? vb.width : (svgEl.clientWidth || 800);
      const height = (vb && vb.height) ? vb.height : (svgEl.clientHeight || 600);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(svgUrl);
      canvas.toBlob(function(blob){
        if(!blob) return;
        const dlUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = dlUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function(){ URL.revokeObjectURL(dlUrl); }, 1000);
      }, 'image/png');
    };
    img.onerror = function(){
      URL.revokeObjectURL(svgUrl);
      console.warn('[Specialization] Could not rasterize the claim map for download.');
    };
    img.src = svgUrl;
  }

  function renderClaimMap(){
    const el = document.getElementById('claimMapDisplay');
    if(!el || claimMapRendered) return;
    claimMapRendered = true;

    if(!snapshot.claimMapHtml){
      el.innerHTML = '<p class="claim-map-empty">No claim map was captured for this claim (an older bio snapshot, ' +
        'most likely, from before this feature existed) - go back and re-generate your bio if you want one.</p>';
      return;
    }

    const row = document.createElement('div');
    row.className = 'map-row';
    row.innerHTML = snapshot.claimMapHtml;
    el.appendChild(row);

    row.querySelectorAll('.map-shot').forEach(function(shot){
      const svg = shot.querySelector('svg');
      if(!svg) return;
      const labelEl = shot.querySelector('.map-shot-label');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-secondary map-shot-download';
      btn.textContent = 'Download Image';
      btn.addEventListener('click', function(){
        const nationBit = (document.getElementById('identityNation').value.trim() || 'claim').replace(/[^a-z0-9]+/gi, '_');
        const continentBit = (labelEl ? labelEl.textContent.trim() : 'map').replace(/[^a-z0-9]+/gi, '_');
        downloadSvgAsPng(svg, nationBit + '_' + continentBit + '_map.png');
      });
      shot.appendChild(btn);
    });

    initClaimMapColorPicker(row);
  }

  // ---- Step 5: claim map color picker ----
  //
  // map.js marks every claimed province path (and the capital seal) with
  // a "claim-fill" class specifically so this page can find and recolor
  // them after the SVG has already been baked into snapshot.claimMapHtml
  // - the color picker and hex box here just set that attribute directly
  // on the live DOM elements, and the download button (above) rasterizes
  // whatever the SVG currently looks like, so a recolor always carries
  // through to the downloaded PNG.
  function normalizeHexColor(raw){
    const s = String(raw || '').trim().replace(/^#/, '');
    if(/^[0-9a-f]{6}$/i.test(s)) return '#' + s.toLowerCase();
    if(/^[0-9a-f]{3}$/i.test(s)){
      return '#' + s.toLowerCase().split('').map(function(c){ return c + c; }).join('');
    }
    return null;
  }

  function initClaimMapColorPicker(row){
    const colorPicker = document.getElementById('claimMapColorPicker');
    const hexInput = document.getElementById('claimMapColorHex');
    if(!colorPicker || !hexInput) return;

    const claimFillEls = row.querySelectorAll('.claim-fill');
    if(claimFillEls.length === 0) return; // nothing to recolor (e.g. no capital, no claimed provinces somehow)

    // Starting color is whatever map.js already baked in (the theme's
    // gold), not a hardcoded default, so the picker reflects the map
    // exactly as shown before anyone touches it.
    const currentFill = normalizeHexColor(claimFillEls[0].getAttribute('fill')) || '#e0a83e';
    colorPicker.value = currentFill;
    hexInput.value = currentFill;

    function applyColor(hex){
      claimFillEls.forEach(function(elm){ elm.setAttribute('fill', hex); });
    }

    colorPicker.addEventListener('input', function(){
      hexInput.value = colorPicker.value;
      hexInput.classList.remove('invalid');
      applyColor(colorPicker.value);
    });

    hexInput.addEventListener('input', function(){
      const normalized = normalizeHexColor(hexInput.value);
      if(!normalized){
        hexInput.classList.add('invalid');
        return;
      }
      hexInput.classList.remove('invalid');
      colorPicker.value = normalized;
      applyColor(normalized);
    });
  }

  // ---- Step 5: potential imports for the 5 chosen specializations ----
  //
  // One line per filled rank, ordinal-labeled to match how the rank is
  // referred to everywhere else on this page (1st/2nd/etc.), listing
  // whatever IMPORTS_BY_SPECIALIZATION has for that specialization (some
  // picks intentionally have none - see the comment on that table in
  // specialization-data.js).
  function renderPotentialImports(){
    const el = document.getElementById('potentialImportsList');
    if(!el) return;
    const lines = [];
    VISIBLE_SLOTS.forEach(function(slot, displayIndex){
      const spec = chosenSpecs[slot.storageIndex];
      if(!spec) return;
      const imports = importsForSpecialization(spec);
      const importsText = imports.length ? imports.join(', ') : 'No specific imports required';
      lines.push('<div class="import-line"><strong>' + ordinal(displayIndex + 1) + ' \u2014 ' + spec + ':</strong> ' + importsText + '</div>');
    });
    el.innerHTML = lines.join('') || '\u2014';
  }

  backBtn.addEventListener('click', function(){
    if(currentStep > 1){ currentStep -= 1; showStep(currentStep); }
  });
  nextBtn.addEventListener('click', function(){
    if(currentStep < TOTAL_STEPS){
      currentStep += 1;
      showStep(currentStep);
    }
    // On step 5 the button is hidden (see showStep), so there's nothing
    // further to advance to - no else branch needed.
  });

  showStep(currentStep);
})();
