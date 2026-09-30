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
  // Nation is entered on Step 5 now (grouped with Capital/Classification/
  // Government Type), not on the bio page - snapshot.nation is only used
  // as a pre-fill fallback for old snapshots that still have it. The
  // header stays live-updated as the player types it in on Step 5.
  const identityNationEl = document.getElementById('identityNation');
  if(snapshot.nation) identityNationEl.value = snapshot.nation;
  function updateNationHeader(){
    document.getElementById('snapNation').textContent = identityNationEl.value.trim() || 'Unnamed Nation';
  }
  updateNationHeader();
  identityNationEl.addEventListener('input', updateNationHeader);
  document.getElementById('snapEconomy').textContent = snapshot.economyType || '\u2014';
  document.getElementById('snapPopulation').textContent = snapshot.population || '\u2014';
  document.getElementById('snapGDP').textContent = snapshot.gdp || '\u2014';
  document.getElementById('snapEnergy').textContent = snapshot.energyProduction || '\u2014';
  document.getElementById('snapFood').textContent = snapshot.foodProduction || '\u2014';
  document.getElementById('step1EconomyType').textContent = snapshot.economyType || '\u2014';
  document.getElementById('adjFoodValue').textContent = snapshot.foodProduction || '\u2014';

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

  if(!hasWorldExports){
    const warning = document.createElement('div');
    warning.className = 'spec-warning';
    warning.textContent = 'This claim\u2019s land bio doesn\u2019t have World Exports data attached (it may have been ' +
      'generated before this feature existed, or the snapshot didn\u2019t capture it). Every slot below is showing ' +
      'every specialization rather than the ranking your bio actually generated - go back and re-generate your ' +
      'bio, then continue here again, if you want the real ranking.';
    specSlotsEl.parentNode.insertBefore(warning, specSlotsEl);
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

  function buildSlot(rank){
    const label = worldExports[rank];
    const poolNames = poolsForExportLabel(label);

    const slotDiv = document.createElement('div');
    slotDiv.className = 'spec-slot';
    slotDiv.setAttribute('data-rank', rank);

    const heading = document.createElement('div');
    heading.className = 'spec-slot-heading';
    heading.appendChild(document.createTextNode(RANK_LABELS[rank] + ' Export: '));
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
        const id = specId(rank, name);
        const optLabel = document.createElement('label');
        optLabel.className = 'spec-option';
        optLabel.setAttribute('for', id);
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'specRank' + rank;
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

  for(let rank = 0; rank < 5; rank++){ specSlotsEl.appendChild(buildSlot(rank)); }

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

    for(let rank = 0; rank < 5; rank++){
      const poolNames = poolsForExportLabel(worldExports[rank]);
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
      if(candidates.length === 0) continue;
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      const radio = document.getElementById(specId(rank, pick));
      if(radio){
        radio.checked = true;
        radio.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
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
      line.textContent = b.spec + ' (' + ordinal(b.rank) + ') \u2014 ' + b.multiplier + '\u00d7 on ' +
        b.resource + ' provinces: ' + (b.provinces.length ? b.provinces.join(', ') : 'none in this claim');
      breakdownEl.appendChild(line);
    });
    result.appliedEnergyBonuses.forEach(function(b){
      const line = document.createElement('span');
      line.className = 'breakdown-item';
      line.textContent = b.spec + ' (' + ordinal(b.rank) + ') \u2014 +' + b.bonus + ' flat';
      breakdownEl.appendChild(line);
    });
    if(result.appliedFuelBonuses.length === 0 && result.appliedEnergyBonuses.length === 0){
      breakdownEl.textContent = 'No Fuel or Energy specialization chosen - total is unchanged.';
    }
  }

  // ---- Step 5: National Identity + Citizen Card BBC ----
  //
  // Matches the community's Citizen App Card template exactly - every
  // {{PLACEHOLDER}} below corresponds 1:1 to a "PUT X HERE" spot in the
  // original BBC. Things this page has no data for (flag image, dispatch
  // link, IIWiki link) are left as the original template's own literal
  // placeholder text for the player to fill in by hand after copying.
  const CITIZEN_CARD_TEMPLATE =
`[pre][*][box][background-block=#FFE6E6][center][size=250][b] [nation=noflag]{{NATION}}[/nation][/b][/size]
[img]200x100 Pixel Image of Flag here[/img]
[u]Join Date:{{JOIN_DATE}}[/u]
[Spoiler= More Information[DELETE ME]][table=plain][tr]
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
[/tr][/table][/spoiler[DELETE ME]]

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

  function buildCitizenCard(){
    const specs = [0,1,2,3,4].map(function(i){ return chosenSpecs[i] || ''; });
    const priorityText = chosenStance === 'Pacifist' ? 'Pacifist (no military)' : (chosenPriority || '');
    const stanceText = chosenStance || '';
    const army = String(focusValues['Army'] || 0);
    const navy = String(focusValues['Navy'] || 0);
    const airForce = String(focusValues['Air Force'] || 0);
    const expeditionary = String(focusValues['Expeditionary Forces'] || 0);
    const paramilitary = String(focusValues['Paramilitary / Militia / Gendarmes / Reserves'] || 0);
    const nationName = document.getElementById('identityNation').value.trim();

    const card = CITIZEN_CARD_TEMPLATE
      .replace('{{NATION}}', nationName || 'Nation')
      .replace('{{JOIN_DATE}}', todayJoinDate())
      .replace('{{CLASSIFICATION}}', document.getElementById('identityClassification').value.trim())
      .replace('{{CAPITAL}}', document.getElementById('identityCapital').value.trim())
      .replace('{{POPULATION}}', snapshot.population || '')
      .replace('{{GOVERNMENT_TYPE}}', document.getElementById('identityGovernment').value.trim())
      .replace('{{ECONOMY_TYPE}}', snapshot.economyType || '')
      .replace('{{GDP}}', snapshot.gdp || '')
      .replace('{{SPEC1}}', specs[0]).replace('{{SPEC2}}', specs[1]).replace('{{SPEC3}}', specs[2])
      .replace('{{SPEC4}}', specs[3]).replace('{{SPEC5}}', specs[4])
      .replace('{{PRIORITY}}', priorityText)
      .replace('{{STANCE}}', stanceText)
      .replace('{{ARMY}}', army)
      .replace('{{NAVY}}', navy)
      .replace('{{AIR_FORCE}}', airForce)
      .replace('{{EXPEDITIONARY}}', expeditionary)
      .replace('{{PARAMILITARY}}', paramilitary);

    // A copy-paste-ready block matching the FR (Form Responses) sheet's
    // own column order (B through T - column A/Timestamp is filled by
    // the sheet/form itself on submission). Bare values only, one per
    // line, no labels - this goes straight into sheet cells, so a label
    // would just be one more thing to strip out before pasting.
    const adminInfo = [
      nationName,
      snapshot.economyType || '',
      snapshot.gdp || '',
      snapshot.foodProduction || '',
      snapshot.energyProduction || '',
      snapshot.population || '',
      specs[0],
      specs[1],
      specs[2],
      specs[3],
      specs[4],
      priorityText,
      stanceText,
      navy,
      army,
      airForce,
      expeditionary,
      paramilitary,
      snapshot.claimCode || '',
    ].join('\n');

    return card + '\n\n[spoiler=for admin team usage]\n' + adminInfo + '\n[/spoiler]';
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
  bindCopyButton('copyCitizenCardBtn', function(){
    const text = buildCitizenCard();
    document.getElementById('citizenCardSource').value = text;
    return text;
  }, 'Copy Citizen Card BBC Code');

  // ---- Step navigation ----
  const TOTAL_STEPS = 5;
  let currentStep = 1;
  const backBtn = document.getElementById('backBtn');
  const nextBtn = document.getElementById('nextBtn');
  const stepIndicator = document.getElementById('stepIndicator');

  function panelFor(step){
    return step === 'summary' ? document.getElementById('stepSummary') : document.getElementById('step' + step);
  }

  function updateNextButtonState(){
    let enabled = true;
    if(currentStep === 1) enabled = chosenSpecs.every(Boolean);
    if(currentStep === 2){
      // Doctrine (both Priority and Stance) always required. Focus points
      // must be fully allocated too, UNLESS Pacifist (budget is 0, so
      // there's nothing to allocate - Focus is effectively skipped).
      const doctrineChosen = !!chosenPriority && !!chosenStance;
      const budget = chosenStance ? militaryFocusBudget(chosenStance) : MILITARY_FOCUS_BASE_POINTS;
      const focusComplete = chosenStance === 'Pacifist' || pointsSpent() === budget;
      enabled = doctrineChosen && focusComplete;
    }
    // Step 5 (National Identity) is never gated - these are flavor fields,
    // not required to see the summary.
    nextBtn.disabled = !enabled;
    const standardSetupNextBtn = document.getElementById('standardSetupNextBtn');
    if(standardSetupNextBtn) standardSetupNextBtn.disabled = !enabled;
    const randomizeNextBtn = document.getElementById('randomizeNextBtn');
    if(randomizeNextBtn) randomizeNextBtn.disabled = !enabled;
  }

  function showStep(step){
    // hide all panels
    [1,2,3,4,5,'summary'].forEach(function(s){ panelFor(s).hidden = true; });
    panelFor(step).hidden = false;

    backBtn.hidden = (step === 1);
    nextBtn.textContent = (step === TOTAL_STEPS) ? 'Finish \u2192' : 'Next \u2192';
    if(step === 'summary'){
      nextBtn.hidden = true;
    } else {
      nextBtn.hidden = false;
    }

    // update step-indicator dots
    stepIndicator.querySelectorAll('.step-dot').forEach(function(dot){
      const dotStep = parseInt(dot.getAttribute('data-step'), 10);
      dot.classList.toggle('active', step !== 'summary' && dotStep === step);
      dot.classList.toggle('done', step === 'summary' || dotStep < step);
    });

    if(step === 3){ renderChosenSummary(); renderEnergyAdjustment(); }
    if(step === 'summary') renderFinalSummary();
    updateNextButtonState();
  }

  function renderFinalSummary(){
    document.getElementById('summarySpecs').textContent = chosenSpecs.filter(Boolean).join(', ') || '\u2014';
    const militarySummary = chosenStance === 'Pacifist'
      ? 'Pacifist - no military'
      : (chosenPriority || '\u2014') + ' priority, ' + (chosenStance || '\u2014') + ' stance \u2014 ' +
        MILITARY_BRANCHES.map(function(b){ return b.id + ': ' + (focusValues[b.id] || 0); }).join(', ');
    document.getElementById('summaryMilitary').textContent = militarySummary;
    const popSelect = document.getElementById('specPopAdjust');
    const pct = parseInt(popSelect.value, 10);
    document.getElementById('summaryPopLevel').textContent = (pct >= 0 ? '+' : '') + pct + '%' + (pct === 0 ? ' (Stable)' : '');
    const identityBits = [
      document.getElementById('identityClassification').value.trim(),
      document.getElementById('identityNation').value.trim(),
    ].filter(Boolean).join(' ');
    const capitalBit = document.getElementById('identityCapital').value.trim();
    const govBit = document.getElementById('identityGovernment').value.trim();
    let identitySummary = identityBits || '\u2014';
    if(capitalBit) identitySummary += ' \u2014 Capital: ' + capitalBit;
    if(govBit) identitySummary += ' \u2014 ' + govBit;
    document.getElementById('summaryIdentity').textContent = identitySummary;
  }

  backBtn.addEventListener('click', function(){
    if(currentStep > 1){ currentStep -= 1; showStep(currentStep); }
  });
  nextBtn.addEventListener('click', function(){
    if(currentStep < TOTAL_STEPS){
      currentStep += 1;
      showStep(currentStep);
    } else {
      showStep('summary');
    }
  });

  showStep(currentStep);
})();
