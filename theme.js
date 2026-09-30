/*
 * THEME SWITCHER
 * --------------
 * Handles the "Appearance" section in the side panel: three selectable
 * styles (parchment / modern / dark), applied as a class on <body> and
 * persisted in localStorage so the choice sticks between visits.
 *
 * To add a 4th theme: give it a name, define a `body.theme-<name>` block
 * in style.css with the same custom properties as the existing themes,
 * and add a matching <button class="theme-option" data-theme="<name>">
 * in index.html's #setupOptions.
 */

(function(){
  const STORAGE_KEY = 'landClaimTheme';
  const DEFAULT_THEME = 'modern';

  const toggleBtn = document.getElementById('setupToggle');
  const optionsPanel = document.getElementById('setupOptions');
  const dropdown = document.getElementById('themeDropdown');
  const optionButtons = Array.from(document.querySelectorAll('.theme-option'));
  const hasDropdownUI = !!(toggleBtn && optionsPanel && dropdown);

  function closeDropdown(){
    if(!hasDropdownUI) return;
    toggleBtn.setAttribute('aria-expanded', 'false');
    optionsPanel.hidden = true;
  }

  function getSavedTheme(){
    try {
      return localStorage.getItem(STORAGE_KEY) || DEFAULT_THEME;
    } catch (e) {
      return DEFAULT_THEME; // localStorage unavailable (e.g. private browsing) - fall back silently
    }
  }

  function saveTheme(theme){
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {
      // non-fatal - theme just won't persist across reloads
    }
  }

  function applyTheme(theme){
    document.body.classList.remove('theme-parchment', 'theme-modern', 'theme-dark');
    if (theme !== 'parchment') {
      document.body.classList.add('theme-' + theme);
    }
    optionButtons.forEach(function(btn){
      btn.classList.toggle('active', btn.dataset.theme === theme);
    });
    // map.js exposes this so already-rendered provinces (e.g. the neutral
    // "Provinces" layer fill) pick up the new theme's colors immediately.
    if (typeof window.refreshMapTheme === 'function') {
      window.refreshMapTheme();
    }
  }

  optionButtons.forEach(function(btn){
    btn.addEventListener('click', function(){
      const theme = btn.dataset.theme;
      saveTheme(theme);
      applyTheme(theme);
      closeDropdown();
    });
  });

  // Pages without the Appearance dropdown (e.g. specialization.html) still
  // get the saved theme applied to <body> above; they just skip the UI
  // wiring below, since there's nothing in the DOM for it to attach to.
  if (hasDropdownUI) {
    toggleBtn.addEventListener('click', function(e){
      e.stopPropagation();
      const expanded = toggleBtn.getAttribute('aria-expanded') === 'true';
      toggleBtn.setAttribute('aria-expanded', String(!expanded));
      optionsPanel.hidden = expanded;
    });

    // Close the dropdown when clicking anywhere outside it.
    document.addEventListener('click', function(e){
      if (!dropdown.contains(e.target)) {
        closeDropdown();
      }
    });
  }

  applyTheme(getSavedTheme());
})();
