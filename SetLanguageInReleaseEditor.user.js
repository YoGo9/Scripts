// ==UserScript==
// @name         MusicBrainz Customizable Language Selector
// @namespace    https://github.com/YoGo9/Scripts
// @version      1.5
// @description  Add customizable quick-select buttons for languages in MusicBrainz release editor and work editor
// @author       YoGo9
// @homepage     https://github.com/YoGo9/Scripts
// @updateURL    https://raw.githubusercontent.com/YoGo9/Scripts/main/SetLanguageInReleaseEditor.user.js
// @downloadURL  https://raw.githubusercontent.com/YoGo9/Scripts/main/SetLanguageInReleaseEditor.user.js
// @supportURL   https://github.com/YoGo9/Scripts/issues
// @match        https://musicbrainz.org/release/*/edit
// @match        https://beta.musicbrainz.org/release/*/edit
// @match        https://musicbrainz.org/release/add*
// @match        https://beta.musicbrainz.org/release/add*
// @match        https://musicbrainz.org/work/*/edit
// @match        https://beta.musicbrainz.org/work/*/edit
// @match        https://musicbrainz.org/work/create*
// @match        https://beta.musicbrainz.org/work/create*
// @grant        GM_setValue
// @grant        GM_getValue
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';

  // ---------- Utilities ----------

  function forceValue(input, value) {
    const proto = Object.getPrototypeOf(input);
    const valueSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    valueSetter?.call(input, String(value));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function getOption(selectEl, id) {
    const opt = Array.from(selectEl.options).find(o => String(o.value) === String(id));
    return opt ? { id: String(opt.value), text: opt.text.trim() } : null;
  }

  function getAvailableOptions(selectEl, { isWorkEditor }) {
    const out = [];
    for (const opt of selectEl.options) {
      const text = opt.text?.trim();
      if (!text || text === '—' || text === '⠀' || text.startsWith('Frequently used')) continue;
      if (isWorkEditor && /^\[.*multiple.*\]/i.test(text)) continue;
      if (!isWorkEditor && /^\[.*lyrics.*\]/i.test(text)) continue;
      out.push({ id: String(opt.value), text });
    }
    return out;
  }

  function btnStyle(bg, border, color = 'inherit') {
    return {
      padding: '6px 12px', border: `1px solid ${border}`, borderRadius: '4px',
      backgroundColor: bg, color, cursor: 'pointer'
    };
  }

  function createButtonsFromIDs(selectEl, preferredIDs) {
    return preferredIDs
      .map(id => {
        const opt = getOption(selectEl, id);
        if (!opt) return null;
        return {
          text: opt.text,
          onClick: () => forceValue(selectEl, opt.id),
        };
      })
      .filter(Boolean);
  }

  function addButtonsAfter(selectEl, buttons, { onOpenSettings }) {
    const wrap = document.createElement('div');
    Object.assign(wrap.style, { display: 'inline-block', marginLeft: '15px', marginTop: '5px' });

    for (const b of buttons) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = b.text;
      Object.assign(btn.style, {
        marginRight: '10px', padding: '4px 12px', backgroundColor: '#eee',
        border: '1px solid #ccc', borderRadius: '4px', fontFamily: 'inherit',
        fontSize: '13px', cursor: 'pointer', transition: 'all .2s'
      });
      btn.addEventListener('click', e => { e.preventDefault(); b.onClick(); return false; });
      wrap.appendChild(btn);
    }

    const gear = document.createElement('button');
    gear.type = 'button';
    gear.textContent = '⚙️';
    gear.title = 'Settings';
    Object.assign(gear.style, {
      marginLeft: '5px', padding: '4px 8px', backgroundColor: '#f8f8f8',
      border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer'
    });
    gear.addEventListener('click', e => { e.preventDefault(); onOpenSettings?.(); return false; });
    wrap.appendChild(gear);

    selectEl.parentNode.insertBefore(wrap, selectEl.nextSibling);
  }

  function showSettingsDialog({ type, options, selectedIDs, onSave }) {
    const dialog = document.createElement('div');
    Object.assign(dialog.style, {
      position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
      zIndex: 10000, backgroundColor: 'white', padding: '20px', borderRadius: '8px',
      boxShadow: '0 4px 8px rgba(0,0,0,0.2)', width: '420px', maxHeight: '80vh', overflowY: 'auto',
      fontFamily: 'inherit'
    });

    const header = document.createElement('h3');
    header.textContent = type === 'language' ? 'Customize Language Buttons' : 'Customize Script Buttons';
    header.style.marginTop = '0';
    dialog.appendChild(header);

    const p = document.createElement('p');
    p.textContent = `Select which ${type}s you want to appear as quick buttons:`;
    dialog.appendChild(p);

    const list = document.createElement('div');
    Object.assign(list.style, { maxHeight: '300px', overflowY: 'auto', border: '1px solid #eee', padding: '10px', marginBottom: '15px' });

    const sorted = [...options].sort((a, b) => a.text.localeCompare(b.text, undefined, { sensitivity: 'base' }));
    for (const opt of sorted) {
      const label = document.createElement('label');
      label.style.display = 'block';
      label.style.marginBottom = '6px';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = opt.id;
      cb.checked = selectedIDs.includes(String(opt.id));
      cb.style.marginRight = '6px';
      label.appendChild(cb);
      label.appendChild(document.createTextNode(opt.text));
      list.appendChild(label);
    }
    dialog.appendChild(list);

    const actions = document.createElement('div');
    Object.assign(actions.style, { display: 'flex', justifyContent: 'space-between' });

    const cancel = document.createElement('button');
    cancel.textContent = 'Cancel';
    Object.assign(cancel.style, btnStyle('#f8f8f8', '#ccc'));

    const save = document.createElement('button');
    save.textContent = 'Save';
    Object.assign(save.style, btnStyle('#4CAF50', '#4CAF50', 'white'));

    actions.appendChild(cancel);
    actions.appendChild(save);
    dialog.appendChild(actions);

    const overlay = document.createElement('div');
    Object.assign(overlay.style, { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999 });
    document.body.appendChild(overlay);
    document.body.appendChild(dialog);

    cancel.addEventListener('click', () => { document.body.removeChild(dialog); document.body.removeChild(overlay); });
    save.addEventListener('click', () => {
      const ids = Array.from(list.querySelectorAll('input[type=checkbox]'))
        .filter(cb => cb.checked)
        .map(cb => String(cb.value));
      onSave(ids);
      document.body.removeChild(dialog);
      document.body.removeChild(overlay);
      location.reload();
    });
  }

  // ---------- Preferences (store by ID) ----------

  const DEFAULT_LANGUAGE_IDS = [];
  const DEFAULT_SCRIPT_IDS = [];

  let preferredLanguageIDs = (GM_getValue('mbLanguageIDs') || DEFAULT_LANGUAGE_IDS).map(String);
  let preferredScriptIDs = (GM_getValue('mbScriptIDs') || DEFAULT_SCRIPT_IDS).map(String);

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
      if (ids.length) {
        preferredLanguageIDs = ids;
        GM_setValue('mbLanguageIDs', ids);
      }
      GM_setValue('mbLanguages', null);
    }

    if (Array.isArray(legacyScriptNames) && scriptSelect) {
      const ids = legacyScriptNames.map(name => {
        const opt = Array.from(scriptSelect.options).find(o => o.text.trim() === name);
        return opt ? String(opt.value) : null;
      }).filter(Boolean);
      if (ids.length) {
        preferredScriptIDs = ids;
        GM_setValue('mbScriptIDs', ids);
      }
      GM_setValue('mbScripts', null);
    }
  }

  // ---------- Work Editor one-click logic ----------

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
    if (String(firstSelect.value) === String(noLyricsId)) {
      document.getElementById('add-language')?.style && (document.getElementById('add-language').style.display = 'none');
      document.querySelectorAll('.select-list-row').forEach((row, i) => { if (i > 0) row.style.display = 'none'; });
    } else {
      document.getElementById('add-language')?.style && (document.getElementById('add-language').style.display = '');
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

      const beforeCount = selects.length;
      const obs = new MutationObserver(() => {
        const now = Array.from(document.querySelectorAll('.select-list-row select'));
        if (now.length > beforeCount) {
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
          if (now.length > beforeCount) {
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
    const firstSelect = document.querySelector('.select-list-row select');
    if (!firstSelect) return;
    if (String(firstSelect.value) === String(noLyricsId)) {
      forceValue(firstSelect, id);
      setTimeout(() => updateWorkEditorLanguageUI(noLyricsId), 50);
      return;
    }
    const already = Array.from(document.querySelectorAll('.select-list-row select'))
      .some(s => String(s.value) === String(id));
    if (already) return;
    const targetSelect = await ensureEmptyLanguageSelect();
    if (targetSelect) forceValue(targetSelect, id);
  }

  function addWorkEditorLanguageButtons(preferredIDs) {
    const container = document.querySelector('.form-row-select-list');
    if (!container) return;
    const firstSelect = document.querySelector('.select-list-row select');
    if (!firstSelect) return;
    const noLyricsId = getNoLyricsID();

    const quick = document.createElement('div');
    Object.assign(quick.style, { margin: '10px 0', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' });

    const label = document.createElement('div');
    label.textContent = 'Quick add:';
    label.style.fontWeight = 'bold';
    label.style.marginRight = '8px';
    quick.appendChild(label);

    preferredIDs.forEach(id => {
      const opt = Array.from(firstSelect.options).find(o => String(o.value) === String(id));
      if (!opt) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = opt.text.trim();
      Object.assign(btn.style, {
        padding: '4px 12px', backgroundColor: '#eee', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer'
      });
      btn.addEventListener('click', async e => { e.preventDefault(); await setWorkLanguageSingleClick(String(id), noLyricsId); return false; });
      quick.appendChild(btn);
    });

    const gear = document.createElement('button');
    gear.type = 'button';
    gear.textContent = '⚙️';
    Object.assign(gear.style, {
      padding: '4px 8px', backgroundColor: '#f8f8f8', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer'
    });
    gear.addEventListener('click', e => {
      e.preventDefault();
      const opts = getAvailableOptions(firstSelect, { isWorkEditor: true });
      showSettingsDialog({
        type: 'language',
        options: opts,
        selectedIDs: preferredLanguageIDs,
        onSave: ids => { preferredLanguageIDs = ids; GM_setValue('mbLanguageIDs', ids); },
      });
      return false;
    });
    quick.appendChild(gear);

    container.parentElement.insertBefore(quick, container.nextSibling);

    const obs = new MutationObserver(() => updateWorkEditorLanguageUI(noLyricsId));
    obs.observe(firstSelect, { attributes: true, attributeFilter: ['value'] });
    updateWorkEditorLanguageUI(noLyricsId);
  }

  // ---------- Main ----------

  window.addEventListener('load', function () {
    const isWorkEditor = location.href.includes('/work/');
    migrateNamesToIDsIfNeeded();

    const languageSelect = document.getElementById('language');
    if (languageSelect) {
      const buttons = createButtonsFromIDs(languageSelect, preferredLanguageIDs);
      addButtonsAfter(languageSelect, buttons, {
        onOpenSettings: () => {
          const opts = getAvailableOptions(languageSelect, { isWorkEditor: false });
          showSettingsDialog({
            type: 'language',
            options: opts,
            selectedIDs: preferredLanguageIDs,
            onSave: ids => { preferredLanguageIDs = ids; GM_setValue('mbLanguageIDs', ids); },
          });
        },
      });
    }

    const scriptSelect = document.getElementById('script');
    if (scriptSelect) {
      const buttons = createButtonsFromIDs(scriptSelect, preferredScriptIDs);
      addButtonsAfter(scriptSelect, buttons, {
        onOpenSettings: () => {
          const opts = getAvailableOptions(scriptSelect, { isWorkEditor: false });
          showSettingsDialog({
            type: 'script',
            options: opts,
            selectedIDs: preferredScriptIDs,
            onSave: ids => { preferredScriptIDs = ids; GM_setValue('mbScriptIDs', ids); },
          });
        },
      });
    }

    if (isWorkEditor) setTimeout(() => addWorkEditorLanguageButtons(preferredLanguageIDs), 500);
  });
})();
