/*
 * ADMIN PAGE LOGIC
 * ----------------
 * Manages an in-browser working copy of claims.json. Nothing here talks
 * to a server - "saving" means exporting a JSON file, which then has to
 * be committed to the repo (replacing claims.json) for the change to
 * actually lock those provinces on the live map for everyone. See the
 * note in claims.js for why that's the case on a static GitHub Pages site.
 *
 * The working copy is mirrored into localStorage on every change purely
 * as a crash/accidental-close safety net, not as the source of truth -
 * claims.json (fetched fresh on load) is always the baseline.
 */

(function(){
  const DRAFT_KEY = 'landClaimAdminDraft';

  const byLabel = {};
  PROVINCES.forEach(function(p){ byLabel[p.label.toUpperCase()] = p; });

  let claims = [];       // the working copy this page edits
  let editingId = null;  // set while editing an existing claim

  const notFoundBanner = document.getElementById('notFoundBanner');
  const draftBanner = document.getElementById('draftBanner');
  const claimantNameInput = document.getElementById('claimantName');
  const adminClaimCodeInput = document.getElementById('adminClaimCode');
  const recordBtn = document.getElementById('recordClaimBtn');
  const cancelEditBtn = document.getElementById('cancelEditBtn');
  const formMsg = document.getElementById('formMsg');
  const tableBody = document.getElementById('claimsTableBody');
  const claimsEmpty = document.getElementById('claimsEmpty');
  const claimStat = document.getElementById('claimStat');
  const exportBtn = document.getElementById('exportBtn');
  const importInput = document.getElementById('importInput');

  function saveDraft(){
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(claims)); }
    catch(e){ /* non-fatal */ }
  }

  function loadDraft(){
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch(e){ return null; }
  }

  function init(){
    window.ClaimsStore.loadClaims().then(function(fileClaims){
      if(fileClaims.length === 0){
        // Could genuinely be an empty claims list, or the file/fetch failed -
        // ClaimsStore already logs the real reason to the console either way.
        notFoundBanner.hidden = false;
      }

      const draft = loadDraft();
      const draftDiffers = draft && JSON.stringify(draft) !== JSON.stringify(fileClaims);

      if(draftDiffers){
        draftBanner.hidden = false;
        document.getElementById('restoreDraftBtn').addEventListener('click', function(){
          claims = draft;
          draftBanner.hidden = true;
          saveDraft();
          renderTable();
        });
        document.getElementById('discardDraftBtn').addEventListener('click', function(){
          claims = fileClaims;
          draftBanner.hidden = true;
          saveDraft();
          renderTable();
        });
      }

      claims = fileClaims;
      saveDraft();
      renderTable();
    });
  }

  function totalProvinces(){ return PROVINCES.length; }
  function claimedProvinceCount(){
    return claims.reduce(function(sum, c){ return sum + (c.provinces || []).length; }, 0);
  }

  function renderTable(){
    tableBody.innerHTML = '';
    claimsEmpty.hidden = claims.length > 0;
    claimStat.textContent = claimedProvinceCount() + ' of ' + totalProvinces() + ' provinces claimed across ' + claims.length + ' claim' + (claims.length===1?'':'s');

    claims.forEach(function(claim){
      const tr = document.createElement('tr');
      const dateStr = claim.dateAdded ? new Date(claim.dateAdded).toLocaleDateString() : '';
      const provincesText = (claim.provinces||[]).map(function(label){
        return (claim.capital && label === claim.capital) ? label + ' \u2605' : label;
      }).join(', ');
      tr.innerHTML =
        '<td>' + escapeHtml(claim.name) + '</td>' +
        '<td class="provinces-cell">' + escapeHtml(provincesText) + '</td>' +
        '<td>' + escapeHtml(dateStr) + '</td>' +
        '<td class="actions-cell">' +
        '<button class="row-btn" data-action="edit">Edit</button>' +
        '<button class="row-btn danger" data-action="remove">Remove</button>' +
        '</td>';
      tr.querySelector('[data-action="edit"]').addEventListener('click', function(){ startEdit(claim.id); });
      tr.querySelector('[data-action="remove"]').addEventListener('click', function(){ removeClaim(claim.id); });
      tableBody.appendChild(tr);
    });
  }

  function escapeHtml(str){
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function setMsg(text, kind){
    formMsg.textContent = text;
    formMsg.className = 'admin-form-msg' + (kind ? ' ' + kind : '');
  }

  function startEdit(id){
    const claim = claims.find(function(c){ return c.id === id; });
    if(!claim) return;
    editingId = id;
    claimantNameInput.value = claim.name;
    adminClaimCodeInput.value = (claim.provinces||[]).map(function(label){
      return (claim.capital && label === claim.capital) ? label + '*' : label;
    }).join(', ');
    recordBtn.textContent = 'Save Changes';
    cancelEditBtn.hidden = false;
    setMsg('Editing "' + claim.name + '" \u2014 recording will replace this claim.', null);
    claimantNameInput.focus();
  }

  // Resets the form fields and edit state. Does NOT touch the status
  // message - callers decide what (if anything) to show after resetting,
  // since e.g. recordClaim() wants its success message to survive this.
  function resetForm(){
    editingId = null;
    claimantNameInput.value = '';
    adminClaimCodeInput.value = '';
    recordBtn.textContent = 'Record Claim';
    cancelEditBtn.hidden = true;
  }

  function removeClaim(id){
    claims = claims.filter(function(c){ return c.id !== id; });
    if(editingId === id) resetForm();
    saveDraft();
    renderTable();
  }

  function recordClaim(){
    const name = claimantNameInput.value.trim();
    const raw = adminClaimCodeInput.value.trim();

    if(!name){ setMsg('Enter a nation or claimant name.', 'error'); return; }
    if(!raw){ setMsg('Enter a claim code (e.g. S9, S12, N4).', 'error'); return; }

    const tokens = raw.split(/[,\s]+/).map(function(t){ return t.trim().toUpperCase(); }).filter(Boolean);
    const provinces = [];
    const unknown = [];
    const seen = {};
    let capital = null;
    tokens.forEach(function(tok){
      // A trailing "*" marks the capital, e.g. "S9*" - this is the same
      // marker the bio page's "Claim Code" box uses, so a code copied
      // straight from there pastes in correctly here.
      const isCapitalTok = tok.charAt(tok.length - 1) === '*';
      const label = isCapitalTok ? tok.slice(0, -1) : tok;
      const p = byLabel[label];
      if(!p){ unknown.push(label); return; }
      if(seen[p.label]) return;
      seen[p.label] = true;
      provinces.push(p.label);
      if(isCapitalTok) capital = p.label;
    });

    if(unknown.length){
      setMsg('Unrecognized province label' + (unknown.length===1?'':'s') + ': ' + unknown.join(', ') + '.', 'error');
      return;
    }
    if(provinces.length === 0){
      setMsg('No valid provinces in that claim code.', 'error');
      return;
    }

    // Conflict check against every OTHER claim (excluding the one being edited).
    const conflicts = [];
    provinces.forEach(function(label){
      const owner = claims.find(function(c){
        return c.id !== editingId && (c.provinces||[]).indexOf(label) !== -1;
      });
      if(owner) conflicts.push(label + ' (' + owner.name + ')');
    });
    if(conflicts.length){
      setMsg('Already claimed: ' + conflicts.join(', ') + '.', 'error');
      return;
    }

    if(editingId){
      const claim = claims.find(function(c){ return c.id === editingId; });
      claim.name = name;
      claim.provinces = provinces;
      claim.capital = capital;
      claim.dateAdded = claim.dateAdded || new Date().toISOString();
      claim.dateUpdated = new Date().toISOString();
    } else {
      claims.push({
        id: String(Date.now()) + '-' + Math.random().toString(36).slice(2,7),
        name: name,
        provinces: provinces,
        capital: capital,
        dateAdded: new Date().toISOString(),
      });
    }

    saveDraft();
    renderTable();
    resetForm();
    setMsg((editingId ? 'Claim updated.' : 'Claim recorded.') + ' Remember to export and commit claims.json to make it live.', 'success');
  }

  function exportClaims(){
    const payload = JSON.stringify({ claims: claims }, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'claims.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
  }

  function importClaims(file){
    const reader = new FileReader();
    reader.onload = function(){
      try {
        const data = JSON.parse(reader.result);
        if(!Array.isArray(data.claims)) throw new Error('File has no "claims" array.');
        claims = data.claims;
        resetForm();
        saveDraft();
        renderTable();
        setMsg('Imported ' + claims.length + ' claim' + (claims.length===1?'':'s') + ' from file.', 'success');
      } catch(e){
        setMsg('Could not import that file: ' + e.message, 'error');
      }
    };
    reader.readAsText(file);
  }

  recordBtn.addEventListener('click', recordClaim);
  cancelEditBtn.addEventListener('click', function(){ resetForm(); setMsg('', null); });
  exportBtn.addEventListener('click', exportClaims);
  importInput.addEventListener('change', function(){
    if(importInput.files && importInput.files[0]){
      importClaims(importInput.files[0]);
      importInput.value = '';
    }
  });
  adminClaimCodeInput.addEventListener('keydown', function(e){
    if(e.key === 'Enter') recordClaim();
  });

  init();
})();
