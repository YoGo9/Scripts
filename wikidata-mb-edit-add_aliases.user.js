/* global $ helper aliases edits sidebar requests GM_info */
'use strict';
// ==UserScript==
// @name         MusicBrainz edit: Add entity aliases in batch + Wikidata import
// @namespace    mbz-loujine-yogo
// @author       loujine + YoGo adaptation
// @version      2026.08.14
// @description  Add entity aliases in batch and preview/import useful labels and aliases from a linked Wikidata item
// @compatible   firefox+tampermonkey
// @license      MIT
// @require      https://raw.githubusercontent.com/loujine/musicbrainz-scripts/master/mbz-loujine-common.js
// @include      http*://*musicbrainz.org/*/*/aliases*
// @exclude      http*://*musicbrainz.org/doc/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

const aliasType = helper.isArtistURL() ? aliases.artistType :
                  helper.isInstrumentURL() ? aliases.instrumentType : aliases.type;

function getEntityInfoFromURL() {
    const match = location.pathname.match(/^\/([^/]+)\/([0-9a-f-]{36})\/aliases\/?$/i);
    if (!match) return null;
    return { type: match[1], mbid: match[2] };
}

function makeAliasRow(name = '', locale = '') {
    const tbody = document.querySelector('table.tbl tbody') || document.querySelector('table tbody');
    if (!tbody) throw new Error('Could not find the MusicBrainz aliases table.');

    const tr = document.createElement('tr');
    tr.className = 'newAlias';
    tr.innerHTML = `
      <td><input type="text" value=""></td>
      <td><input type="text" value="" placeholder="leave empty to use the name"></td>
      <td></td>
      <td></td>
      <td>${aliasType}</td>
      <td>
        ${aliases.locale}
        <input type="checkbox">
        <span>primary</span>
      </td>
      <td><a href="#" class="deleteRow" style="color:red;">×</a></td>
    `;

    tbody.appendChild(tr);
    tr.children[0].querySelector('input').value = name;

    const localeSelect = tr.children[5].querySelector('select');
    if (localeSelect && locale !== undefined && locale !== null) {
        localeSelect.value = locale;
    }

    tr.querySelector('a.deleteRow').addEventListener('click', evt => {
        evt.preventDefault();
        evt.target.closest('tr').remove();
    });
    return tr;
}

function addRow() {
    makeAliasRow();
}

function submitAliases() {
    // Snapshot because the original code removes newAlias as it submits.
    for (const node of [...document.getElementsByClassName('newAlias')]) {
        const cols = node.children;
        const postData = {
            name: edits.encodeName(cols[0].children[0].value),
            sort_name: edits.encodeName(cols[1].children[0].value),
            type_id: cols[4].children[0].value,
            locale: cols[5].children[0].value,
            primary_for_locale: cols[5].children[1].checked ? 1 : 0,
            edit_note: sidebar.editNote(GM_info.script),
        };
        if (postData.sort_name === '') {
            postData.sort_name = postData.name;
        }
        cols[6].textContent = 'Sending edit data';
        console.info('Data ready to be posted: ', postData);
        requests.POST(
            document.URL.replace('aliases', 'add-alias'),
            edits.formatEdit('edit-alias', postData),
            xhr => {
                cols[6].textContent = `Success (code ${xhr.status})`;
                cols[6].parentElement.style.color = 'green';
            },
            xhr => {
                cols[6].textContent = `Error (code ${xhr.status})`;
                cols[6].parentElement.style.color = 'red';
            }
        );
        node.classList.remove('newAlias');
    }
}

function localeTemplateSelect() {
    const holder = document.createElement('div');
    holder.innerHTML = aliases.locale;
    return holder.querySelector('select');
}

function getMusicBrainzLocales() {
    const select = localeTemplateSelect();
    if (!select) return [];
    return [...select.options].map(o => ({ value: o.value, label: o.textContent.trim() }));
}

function normalizeLocaleCode(code) {
    return String(code || '').trim().replace(/_/g, '-').toLowerCase();
}

function mapWikidataLocaleToMusicBrainz(wdLocale, mbLocales) {
    // Wikidata "mul" means a language-independent/multilingual name.
    // In MusicBrainz the closest representation is an alias with no locale.
    if (wdLocale === 'mul') {
        const blank = mbLocales.find(x => x.value === '');
        return blank ? blank.value : '';
    }

    const wanted = normalizeLocaleCode(wdLocale);
    const exactish = mbLocales.find(x => normalizeLocaleCode(x.value) === wanted);
    return exactish ? exactish.value : null;
}

function normalizeName(name) {
    return String(name || '').trim().normalize('NFC');
}

function aliasKey(name, locale) {
    return `${normalizeName(name)}\u0000${normalizeLocaleCode(locale)}`;
}

async function fetchMusicBrainzEntity() {
    const entity = getEntityInfoFromURL();
    if (!entity) throw new Error('Could not determine the MusicBrainz entity from this URL.');

    const url = `/ws/2/${encodeURIComponent(entity.type)}/${encodeURIComponent(entity.mbid)}?inc=aliases+url-rels&fmt=json`;
    const response = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`MusicBrainz API returned HTTP ${response.status}.`);
    return response.json();
}

function getLinkedWikidataQid(mbEntity) {
    const relations = mbEntity.relations || [];
    for (const rel of relations) {
        const resource = rel && rel.url && rel.url.resource;
        if (!resource) continue;
        const match = resource.match(/(?:www\.)?wikidata\.org\/wiki\/(Q\d+)/i);
        if (match) return match[1].toUpperCase();
    }
    return null;
}

async function fetchWikidataNames(qid) {
    const params = new URLSearchParams({
        action: 'wbgetentities',
        ids: qid,
        props: 'labels|aliases',
        format: 'json',
        origin: '*',
    });
    const response = await fetch(`https://www.wikidata.org/w/api.php?${params.toString()}`);
    if (!response.ok) throw new Error(`Wikidata API returned HTTP ${response.status}.`);
    const data = await response.json();
    const entity = data.entities && data.entities[qid];
    if (!entity || entity.missing !== undefined) throw new Error(`Wikidata item ${qid} was not found.`);
    return {
        labels: entity.labels || {},
        aliases: entity.aliases || {},
    };
}

function getMusicBrainzEntityName(mbEntity) {
    return normalizeName(mbEntity.name || mbEntity.title || '');
}

function buildCandidates(wdNames, mbEntity) {
    const mbLocales = getMusicBrainzLocales();
    const existing = new Set((mbEntity.aliases || []).map(a => aliasKey(a.name, a.locale || '')));
    const mbName = getMusicBrainzEntityName(mbEntity);
    const seen = new Map();
    const candidates = [];

    function addCandidate(name, wdLocale, source) {
        name = normalizeName(name);
        if (!name) return;

        // Labels are useful as MusicBrainz aliases only when they actually provide
        // a different name/script from the entity's main MusicBrainz name.
        if (source === 'Label' && mbName && name === mbName) return;

        const mappedLocale = mapWikidataLocaleToMusicBrainz(wdLocale, mbLocales);
        const dedupeLocale = mappedLocale === null ? wdLocale : mappedLocale;
        const key = aliasKey(name, dedupeLocale);

        // If the same Wikidata name occurs as both a label and an alias for the
        // same locale, show/import it once and identify both sources.
        if (seen.has(key)) {
            const previous = seen.get(key);
            if (!previous.source.includes(source)) previous.source += ` + ${source}`;
            return;
        }

        let status = 'new';
        let reason = '';
        if (mappedLocale === null) {
            status = 'unsupported';
            reason = `MusicBrainz does not offer locale “${wdLocale}”`;
        } else if (existing.has(aliasKey(name, mappedLocale))) {
            status = 'existing';
            reason = 'Already exists in MusicBrainz';
        }

        const candidate = {
            name,
            wdLocale,
            mbLocale: mappedLocale,
            source,
            status,
            reason,
        };
        seen.set(key, candidate);
        candidates.push(candidate);
    }

    for (const [wdLocale, entry] of Object.entries(wdNames.labels || {})) {
        if (entry && entry.value) addCandidate(entry.value, wdLocale, 'Label');
    }

    for (const [wdLocale, entries] of Object.entries(wdNames.aliases || {})) {
        for (const entry of entries || []) {
            if (entry && entry.value) addCandidate(entry.value, wdLocale, 'Alias');
        }
    }

    candidates.sort((a, b) =>
        a.wdLocale.localeCompare(b.wdLocale) ||
        a.name.localeCompare(b.name) ||
        a.source.localeCompare(b.source)
    );
    return candidates;
}

function escapeHTML(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function showPreview(qid, candidates) {
    document.getElementById('wdAliasImportOverlay')?.remove();

    const newCount = candidates.filter(x => x.status === 'new').length;
    const existingCount = candidates.filter(x => x.status === 'existing').length;
    const unsupportedCount = candidates.filter(x => x.status === 'unsupported').length;

    const overlay = document.createElement('div');
    overlay.id = 'wdAliasImportOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:10000;display:flex;align-items:flex-start;justify-content:center;padding:5vh 2vw;overflow:auto;';

    const rows = candidates.map((item, index) => {
        const selectable = item.status === 'new';
        const statusText = item.status === 'new' ? 'Will add' : item.reason;
        const rowOpacity = selectable ? '1' : '.55';
        const localeDisplay = item.wdLocale === 'mul'
            ? 'mul → (no locale)'
            : (item.mbLocale !== null && item.mbLocale !== item.wdLocale
                ? `${item.wdLocale} → ${item.mbLocale}`
                : item.wdLocale);
        return `
            <tr style="opacity:${rowOpacity}">
              <td style="text-align:center"><input class="wdAliasChoice" data-index="${index}" type="checkbox" ${selectable ? 'checked' : 'disabled'}></td>
              <td>${escapeHTML(item.name)}</td>
              <td>${escapeHTML(localeDisplay)}</td>
              <td>${escapeHTML(item.source)}</td>
              <td>${escapeHTML(statusText)}</td>
            </tr>`;
    }).join('');

    overlay.innerHTML = `
      <div style="background:#fff;color:#222;max-width:1000px;width:100%;border-radius:8px;box-shadow:0 8px 30px rgba(0,0,0,.35);padding:18px;">
        <div style="display:flex;justify-content:space-between;gap:20px;align-items:start;">
          <div>
            <h2 style="margin:0 0 6px">Import names from Wikidata</h2>
            <div><strong>${escapeHTML(qid)}</strong> — ${newCount} new, ${existingCount} already in MusicBrainz, ${unsupportedCount} unsupported locale(s)</div>
          </div>
          <button type="button" id="wdAliasClose" style="font-size:20px;line-height:1">×</button>
        </div>

        <div style="margin:14px 0 8px;display:flex;gap:8px;flex-wrap:wrap;">
          <button type="button" id="wdAliasSelectAll">Select all new</button>
          <button type="button" id="wdAliasSelectNone">Select none</button>
        </div>

        <div style="max-height:60vh;overflow:auto;border:1px solid #bbb;">
          <table class="tbl" style="margin:0;width:100%">
            <thead><tr><th>Add</th><th>Name</th><th>Locale</th><th>Source</th><th>Status</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="5">Wikidata returned no useful labels or aliases.</td></tr>'}</tbody>
          </table>
        </div>

        <div style="margin-top:14px;display:flex;justify-content:flex-end;gap:8px;">
          <button type="button" id="wdAliasCancel">Cancel</button>
          <button type="button" id="wdAliasAdd" ${newCount ? '' : 'disabled'}>Add selected to batch</button>
        </div>
        <p style="margin:10px 0 0;font-size:90%;color:#555">Nothing is submitted by this preview. After adding the selected aliases to the batch table, use “Submit new aliases” to create the MusicBrainz edits.</p>
      </div>`;

    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('#wdAliasClose').addEventListener('click', close);
    overlay.querySelector('#wdAliasCancel').addEventListener('click', close);
    overlay.addEventListener('click', evt => { if (evt.target === overlay) close(); });

    overlay.querySelector('#wdAliasSelectAll').addEventListener('click', () => {
        overlay.querySelectorAll('.wdAliasChoice:not(:disabled)').forEach(x => { x.checked = true; });
    });
    overlay.querySelector('#wdAliasSelectNone').addEventListener('click', () => {
        overlay.querySelectorAll('.wdAliasChoice:not(:disabled)').forEach(x => { x.checked = false; });
    });
    overlay.querySelector('#wdAliasAdd').addEventListener('click', () => {
        const selected = [...overlay.querySelectorAll('.wdAliasChoice:checked')]
            .map(input => candidates[Number(input.dataset.index)])
            .filter(Boolean);
        for (const item of selected) {
            makeAliasRow(item.name, item.mbLocale || '');
        }
        close();
        const status = document.getElementById('wdAliasImportStatus');
        if (status) status.textContent = `Added ${selected.length} Wikidata name${selected.length === 1 ? '' : 's'} to the batch. Review them, then submit.`;
    });
}

async function importFromWikidata() {
    const button = document.getElementById('importWikidataAliases');
    const status = document.getElementById('wdAliasImportStatus');
    button.disabled = true;
    status.textContent = 'Finding linked Wikidata item…';

    try {
        const mbEntity = await fetchMusicBrainzEntity();
        const qid = getLinkedWikidataQid(mbEntity);
        if (!qid) throw new Error('This MusicBrainz entity does not have a linked Wikidata item.');

        status.textContent = `Loading labels and aliases from ${qid}…`;
        const wdNames = await fetchWikidataNames(qid);
        const candidates = buildCandidates(wdNames, mbEntity);
        status.textContent = `Loaded ${candidates.length} useful Wikidata name${candidates.length === 1 ? '' : 's'} from ${qid}.`;
        showPreview(qid, candidates);
    } catch (error) {
        console.error(error);
        status.textContent = `Wikidata import failed: ${error.message}`;
        alert(`Wikidata alias import failed:\n\n${error.message}`);
    } finally {
        button.disabled = false;
    }
}

$(document).ready(function () {
    if (!helper.isUserLoggedIn()) return false;

    // Preserve the original script's behavior for entities with no aliases yet.
    for (const node of document.getElementById('content').getElementsByTagName('p')) {
        if (node.innerHTML.includes('has no aliases')) {
            node.innerHTML = `
                <table class="tbl">
                  <thead>
                    <tr>
                      <th>Alias</th><th>Sort name</th><th>Begin Date</th><th>End Date</th><th>Type</th><th>Locale</th>
                    </tr>
                  </thead>
                  <tbody><tr></tr></tbody>
                </table>`;
        }
    }

    const table = document.querySelector('table.tbl') || document.getElementsByTagName('table')[0];
    if (!table) return false;

    table.insertAdjacentHTML('beforebegin', `
        <h3>Add aliases</h3>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
          <input type="button" id="addRow" value="+ Add a new row">
          <input type="button" id="importWikidataAliases" value="Import from Wikidata">
          <input type="button" id="submitAliases" value="Submit new aliases">
          <span id="wdAliasImportStatus" style="font-size:90%"></span>
        </div>
    `);

    document.getElementById('addRow').addEventListener('click', addRow);
    document.getElementById('importWikidataAliases').addEventListener('click', importFromWikidata);
    document.getElementById('submitAliases').addEventListener('click', submitAliases);
    return false;
});
