// ==UserScript==
// @name         MusicBrainz Customizable Language Selector
// @namespace    https://github.com/YoGo9/Scripts
// @version      2.0
// @description  Add customizable quick-select buttons for languages in MusicBrainz release editor, work editor and alias editor
// @author       YoGo9
// @homepage     https://github.com/YoGo9/Scripts
// @updateURL    https://raw.githubusercontent.com/YoGo9/Scripts/main/SetLanguageInReleaseEditor.user.js
// @downloadURL  https://raw.githubusercontent.com/YoGo9/Scripts/main/SetLanguageInReleaseEditor.user.js
// @supportURL   https://github.com/YoGo9/Scripts/issues
// @match        https://musicbrainz.org/*
// @match        https://test.musicbrainz.org/*
// @match        https://beta.musicbrainz.org/*
// @grant        GM_setValue
// @grant        GM_getValue
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';

  // ----------------- Utilities -----------------

  function forceValue(input, value) {
    const proto = Object.getPrototypeOf(input);
    const valueSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    valueSetter?.call(input, String(value));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function createButton(text, onClick) {
    const btn = document.createElement('button');
    btn.textContent = text;
    Object.assign(btn.style, {
      marginRight: '8px', padding: '4px 10px', backgroundColor: '#eee',
      border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer', fontSize: '12px'
    });
    btn.type = 'button';
    btn.addEventListener('click', e => { e.preventDefault(); onClick(); return false; });
    return btn;
  }

  function showSettingsDialog({ type, options, selectedValues, onSave }) {
    const dialog = document.createElement('div');
    Object.assign(dialog.style, {
      position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
      zIndex: 10000, background: '#fff', padding: '20px', borderRadius: '8px',
      boxShadow: '0 4px 8px rgba(0,0,0,.2)', width: '420px', maxHeight: '80vh', overflowY: 'auto',
      fontFamily: 'inherit'
    });

    const h = document.createElement('h3');
    h.textContent = `Customize ${type} buttons`;
    h.style.marginTop = '0';
    dialog.appendChild(h);

    const list = document.createElement('div');
    Object.assign(list.style, { maxHeight: '300px', overflowY: 'auto', border: '1px solid #eee', padding: '10px', marginBottom: '15px' });

    const sorted = [...options].sort((a, b) => a.text.localeCompare(b.text, undefined, { sensitivity: 'base' }));
    for (const opt of sorted) {
      const label = document.createElement('label');
      label.style.display = 'block';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = String(opt.value);
      cb.checked = selectedValues.includes(String(opt.value));
      cb.style.marginRight = '6px';
      label.appendChild(cb);
      label.appendChild(document.createTextNode(opt.text));
      list.appendChild(label);
    }
    dialog.appendChild(list);

    const actions = document.createElement('div');
    Object.assign(actions.style, { display: 'flex', justifyContent: 'space-between' });

    const cancel = createButton('Cancel', () => { dialog.remove(); overlay.remove(); });
    const save = createButton('Save', () => {
      const vals = Array.from(list.querySelectorAll('input[type=checkbox]'))
        .filter(cb => cb.checked).map(cb => String(cb.value));
      onSave(vals);
      dialog.remove(); overlay.remove();
      location.reload();
    });
    save.style.background = '#4CAF50'; save.style.color = '#fff'; save.style.borderColor = '#4CAF50';

    actions.appendChild(cancel); actions.appendChild(save);
    dialog.appendChild(actions);

    const overlay = document.createElement('div');
    Object.assign(overlay.style, { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 9999 });

    document.body.appendChild(overlay);
    document.body.appendChild(dialog);
  }

  // ----------------- Preferences -----------------

  const DEFAULT_ALIAS_LOCALES = ['he', 'yi', 'en', 'zh-Hant'];
  const DEFAULT_LANGUAGE_IDS = []; // pick via ⚙️
  const DEFAULT_SCRIPT_IDS = [];   // pick via ⚙️

  let aliasLocales = (GM_getValue('mbAliasLocales') || DEFAULT_ALIAS_LOCALES).map(String);
  let languageIDs  = (GM_getValue('mbLanguageIDs')  || DEFAULT_LANGUAGE_IDS).map(String);
  let scriptIDs    = (GM_getValue('mbScriptIDs')    || DEFAULT_SCRIPT_IDS).map(String);

  // Back-compat migration (old name-based keys -> ID-based)
  function migrateNamesToIDsIfNeeded() {
    const legacyLangNames = GM_getValue('mbLanguages');
    const legacyScriptNames = GM_getValue('mbScripts');
    const languageSelect = document.getElementById('language') ||
                           document.querySelector('.select-list-row select');
    const scriptSelect = document.getElementById('script');

    if (Array.isArray(legacyLangNames) && languageSelect) {
      const ids = legacyLangNames.map(name => {
        const opt = Array.from(languageSelect.options).find(o => o.text.trim() === name);
        return opt ? String(opt.value) : null;
      }).filter(Boolean);
      if (ids.length) { languageIDs = ids; GM_setValue('mbLanguageIDs', ids); }
      GM_setValue('mbLanguages', null);
    }

    if (Array.isArray(legacyScriptNames) && scriptSelect) {
      const ids = legacyScriptNames.map(name => {
        const opt = Array.from(scriptSelect.options).find(o => o.text.trim() === name);
        return opt ? String(opt.value) : null;
      }).filter(Boolean);
      if (ids.length) { scriptIDs = ids; GM_setValue('mbScriptIDs', ids); }
      GM_setValue('mbScripts', null);
    }
  }

  // ----------------- Alias pages (/aliases & /add-alias) -----------------

  function isAliasPage() {
    return /\/(artist|work|label|place|series|event|recording|release|release-group)\/[0-9a-f-]+\/(aliases|add-alias)$/.test(location.pathname);
  }

  function addAliasLocaleToolbar() {
    // Accept a few possible select names/classes for locales
    const localeSelects = document.querySelectorAll('select[name$="locale_id"], select[name$="locale"], select.locale');
    if (!localeSelects.length) return;

    const firstSelect = localeSelects[0];
    const options = Array.from(firstSelect.options)
      .filter(o => o.value && !/—/.test(o.text))
      .map(o => ({ value: o.value, text: o.text.trim() }));

    // Filter stored codes to ones actually present here
    const quick = aliasLocales.filter(code => options.some(o => o.value === code));
    if (!quick.length) return;

    // Build toolbar
    const bar = document.createElement('div');
    Object.assign(bar.style, { margin: '10px 0', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' });
    const title = document.createElement('strong');
    title.textContent = 'Quick locale:';
    bar.appendChild(title);

    quick.forEach(code => {
      const opt = options.find(o => o.value === code);
      if (!opt) return;
      bar.appendChild(createButton(opt.text, () => setAliasLocaleSingleClick(code)));
    });

    // ⚙️
    const gear = createButton('⚙️', () => {
      showSettingsDialog({
        type: 'alias locales',
        options,
        selectedValues: aliasLocales,
        onSave: vals => { aliasLocales = vals; GM_setValue('mbAliasLocales', vals); },
      });
    });
    bar.appendChild(gear);

    // Insert near the first locale select
    const anchor = firstSelect.closest('.row, .form-row, fieldset, form, #page') || firstSelect.parentElement;
    anchor.parentElement.insertBefore(bar, anchor);
  }

  // For /add-alias: set the only select. For /aliases: set last empty or add row then set.
  function setAliasLocaleSingleClick(code) {
    const isAddAlias = /\/add-alias$/.test(location.pathname);
    const selects = document.querySelectorAll('select[name$="locale_id"], select[name$="locale"], select.locale');
    if (!selects.length) return;

    if (isAddAlias) {
      forceValue(selects[0], code);
      return;
    }

    // /aliases (multi-row)
    const last = selects[selects.length - 1];
    if (last && !last.value) {
      forceValue(last, code);
      return;
    }

    const addBtn = document.querySelector('button.add-item, input.add-item');
    if (addBtn) {
      addBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      setTimeout(() => {
        const newSelects = document.querySelectorAll('select[name$="locale_id"], select[name$="locale"], select.locale');
        const newest = newSelects[newSelects.length - 1];
        if (newest) forceValue(newest, code);
      }, 300);
    }
  }

  // ----------------- Release/Work languages & scripts -----------------

  function getAvailableOptions(selectEl, { isWorkEditor }) {
    const out = [];
    for (const opt of selectEl.options) {
      const text = opt.text?.trim();
      if (!text || text === '—' || text === '⠀' || text.startsWith('Frequently used')) continue;
      if (isWorkEditor && /^\[.*multiple.*\]/i.test(text)) continue;   // skip [Multiple languages] in Work
      if (!isWorkEditor && /^\[.*lyrics.*\]/i.test(text)) continue;    // skip [No lyrics] in Release
      out.push({ id: String(opt.value), text });
    }
    return out;
  }

  function createButtonsFromIDs(selectEl, preferredIDs) {
    return preferredIDs
      .map(id => {
        const opt = Array.from(selectEl.options).find(o => String(o.value) === String(id));
        if (!opt) return null;
        return { text: opt.text.trim(), onClick: () => forceValue(selectEl, id) };
      })
      .filter(Boolean);
  }

  function addButtonsAfter(selectEl, buttons, { onOpenSettings }) {
    const wrap = document.createElement('div');
    Object.assign(wrap.style, { display: 'inline-block', marginLeft: '15px', marginTop: '5px' });
    for (const b of buttons) wrap.appendChild(createButton(b.text, b.onClick));
    const gear = createButton('⚙️', onOpenSettings);
    wrap.appendChild(gear);
    selectEl.parentNode.insertBefore(wrap, selectEl.nextSibling);
  }

  // --- Work editor one-click helpers ---

  function getNoLyricsID() {
    const firstSelect = document.querySelector('.select-list-row select');
    if (!firstSelect) return '486';
    const candidate =
      Array.from(firstSelect.options).find(o => /^\[.*lyrics.*\]$/i.test(o.text.trim())) ||
      Array.from(firstSelect.options).find(o => String(o.value) === '486');
    return candidate ? String(candidate.value) : '486';
  }

  function updateWorkEditorLanguageUI(noLyricsId) {
    const firstSelect = document.querySelector('.select-list-row select');
    if (!firstSelect) return;
    const addBtn = document.getElementById('add-language');
    if (String(firstSelect.value) === String(noLyricsId)) {
      if (addBtn?.style) addBtn.style.display = 'none';
      document.querySelectorAll('.select-list-row').forEach((row, i) => { if (i > 0) row.style.display = 'none'; });
    } else {
      if (addBtn?.style) addBtn.style.display = '';
      document.querySelectorAll('.select-list-row').forEach(row => (row.style.display = ''));
    }
  }

  function ensureEmptyLanguageSelect() {
    return new Promise(resolve => {
      const selects = Array.from(document.querySelectorAll('.select-list-row select'));
      const empty = selects.find(s => !s.value);
      if (empty) return resolve(empty);

      const container = document.querySelector('.form-row-select-list');
      if (!container) return resolve(null);

      const before = selects.length;
      const obs = new MutationObserver(() => {
        const now = Array.from(document.querySelectorAll('.select-list-row select'));
        if (now.length > before) {
          obs.disconnect();
          resolve(now[now.length - 1]);
        }
      });
      obs.observe(container, { childList: true, subtree: true });

      const addBtn = document.getElementById('add-language');
      if (addBtn) {
        addBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        setTimeout(() => {
          const now = Array.from(document.querySelectorAll('.select-list-row select'));
          if (now.length > before) {
            obs.disconnect();
            resolve(now[now.length - 1]);
          }
        }, 300);
      } else {
        resolve(null);
      }
    });
  }

  async function setWorkLanguageSingleClick(id, noLyricsId) {
    const first = document.querySelector('.select-list-row select');
    if (!first) return;

    if (String(first.value) === String(noLyricsId)) {
      forceValue(first, id);
      setTimeout(() => updateWorkEditorLanguageUI(noLyricsId), 50);
      return;
    }

    const already = Array.from(document.querySelectorAll('.select-list-row select'))
      .some(s => String(s.value) === String(id));
    if (already) return;

    const target = await ensureEmptyLanguageSelect();
    if (target) forceValue(target, id);
  }

  function addWorkEditorLanguageButtons(preferredIDs) {
    const container = document.querySelector('.form-row-select-list');
    const firstSelect = document.querySelector('.select-list-row select');
    if (!container || !firstSelect) return;

    const noLyricsId = getNoLyricsID();

    const quick = document.createElement('div');
    Object.assign(quick.style, { margin: '10px 0', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' });

    const label = document.createElement('strong');
    label.textContent = 'Quick add:';
    quick.appendChild(label);

    preferredIDs.forEach(id => {
      const opt = Array.from(firstSelect.options).find(o => String(o.value) === String(id));
      if (!opt) return;
      quick.appendChild(createButton(opt.text.trim(), async () => {
        await setWorkLanguageSingleClick(String(id), noLyricsId);
      }));
    });

    const gear = createButton('⚙️', () => {
      const opts = getAvailableOptions(firstSelect, { isWorkEditor: true })
        .map(o => ({ value: o.id, text: o.text }));
      showSettingsDialog({
        type: 'languages',
        options: opts,
        selectedValues: languageIDs,
        onSave: vals => { languageIDs = vals; GM_setValue('mbLanguageIDs', vals); },
      });
    });
    quick.appendChild(gear);

    container.parentElement.insertBefore(quick, container);

    const obs = new MutationObserver(() => updateWorkEditorLanguageUI(noLyricsId));
    obs.observe(firstSelect, { attributes: true, attributeFilter: ['value'] });
    updateWorkEditorLanguageUI(noLyricsId);
  }

  // ----------------- Main -----------------

  window.addEventListener('load', function () {
    // Alias editors first (/aliases & /add-alias)
    if (isAliasPage()) {
      addAliasLocaleToolbar();
      return;
    }

    const isWorkEditor = location.href.includes('/work/');
    migrateNamesToIDsIfNeeded();

    // Release editor: language + script quick buttons
    const languageSelect = document.getElementById('language');
    if (languageSelect) {
      const buttons = createButtonsFromIDs(languageSelect, languageIDs);
      addButtonsAfter(languageSelect, buttons, {
        onOpenSettings: () => {
          const opts = getAvailableOptions(languageSelect, { isWorkEditor: false })
            .map(o => ({ value: o.id, text: o.text }));
          showSettingsDialog({
            type: 'languages',
            options: opts,
            selectedValues: languageIDs,
            onSave: vals => { languageIDs = vals; GM_setValue('mbLanguageIDs', vals); },
          });
        },
      });
    }

    const scriptSelect = document.getElementById('script');
    if (scriptSelect) {
      const buttons = createButtonsFromIDs(scriptSelect, scriptIDs);
      addButtonsAfter(scriptSelect, buttons, {
        onOpenSettings: () => {
          const opts = getAvailableOptions(scriptSelect, { isWorkEditor: false })
            .map(o => ({ value: o.id, text: o.text }));
          showSettingsDialog({
            type: 'scripts',
            options: opts,
            selectedValues: scriptIDs,
            onSave: vals => { scriptIDs = vals; GM_setValue('mbScriptIDs', vals); },
          });
        },
      });
    }

    // Work editor: lyrics languages quick bar (one-click)
    if (isWorkEditor && document.querySelector('.form-row-select-list')) {
      setTimeout(() => addWorkEditorLanguageButtons(languageIDs), 500);
    }
  });

  // Small helper used earlier
  function createButtonsFromIDs(selectEl, preferredIDs) {
    return preferredIDs
      .map(id => {
        const opt = Array.from(selectEl.options).find(o => String(o.value) === String(id));
        if (!opt) return null;
        return { text: opt.text.trim(), onClick: () => forceValue(selectEl, id) };
      })
      .filter(Boolean);
  }

})();

