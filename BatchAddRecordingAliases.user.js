/*
 * Built using mbz-loujine-common.js by loujine
 * https://github.com/loujine/musicbrainz-scripts
 * MIT License
 */

/* global $ helper edits sidebar requests GM_info aliases */
'use strict';

// ==UserScript==
// @name         Batch Add Recording Aliases from another Release
// @namespace    YoGo9
// @author       YoGo9
// @version      12/23/25
// @description  Paste a source release URL/MBID; copy its track titles as recording aliases on the current (target) release's recordings.
// @homepage     https://github.com/YoGo9/Scripts
// @updateURL    https://raw.githubusercontent.com/YoGo9/Scripts/main/BatchAddRecordingAliases.user.js
// @downloadURL  https://raw.githubusercontent.com/YoGo9/Scripts/main/BatchAddRecordingAliases.user.js
// @require      https://raw.githubusercontent.com/loujine/musicbrainz-scripts/master/mbz-loujine-common.js
// @include      http*://musicbrainz.org/release/*
// @include      http*://beta.musicbrainz.org/release/*
// @exclude      http*://*musicbrainz.org/doc/*
// @grant        GM_info
// @run-at       document-end
// ==/UserScript==

(function () {
  const HOST = location.origin;
  const WS_HOST = 'https://musicbrainz.org';

  const RELEASE_MBID_RE = /\/release\/([0-9a-f-]{36})/i;
  const UUID_RE = /^[0-9a-f-]{36}$/i;

  function parseReleaseMbid(input) {
    const s = String(input || '').trim();
    if (UUID_RE.test(s)) return s;
    const m = s.match(RELEASE_MBID_RE);
    return m ? m[1] : null;
  }

  function currentReleaseMbid() {
    const m = location.pathname.match(RELEASE_MBID_RE);
    return m ? m[1] : null;
  }

  async function wsRelease(releaseMbid) {
    const url = `${WS_HOST}/ws/2/release/${releaseMbid}?inc=recordings+media&fmt=json`;
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error(`WS fetch failed ${r.status} for release ${releaseMbid}`);
    return r.json();
  }

  function flattenTracks(releaseJson) {
    const out = [];
    for (const medium of (releaseJson.media || [])) {
      const mPos = medium.position;
      for (const track of (medium.tracks || [])) {
        out.push({
          mediumPosition: mPos,
          trackPosition: track.position,
          trackTitle: track.title,
          recordingMbid: track.recording?.id || null,
          recordingTitle: track.recording?.title || null,
        });
      }
    }
    return out;
  }

  function mapByRecording(tracks) {
    const m = new Map();
    for (const t of tracks) {
      if (t.recordingMbid) m.set(t.recordingMbid, t.trackTitle);
    }
    return m;
  }

  function mapByPosition(tracks) {
    const m = new Map();
    for (const t of tracks) {
      m.set(`${t.mediumPosition}-${t.trackPosition}`, t.trackTitle);
    }
    return m;
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function editNote(sourceReleaseUrl) {
    return `Batch Add Recording Alias from release ${sourceReleaseUrl}`;
  }

  function injectUI() {
    const box = document.createElement('div');
    box.style.border = '1px solid #ccc';
    box.style.padding = '10px';
    box.style.margin = '10px 0';
    box.style.background = '#fff';

    box.innerHTML = `
      <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
        <span style="font-weight:600;">Copy track titles → recording aliases</span>

        <input id="yomo-src" style="width:520px; max-width:100%;" placeholder="Paste SOURCE release URL or MBID">

        <label style="display:flex; gap:6px; align-items:center;">
          Type:
          <span id="yomo-type-wrap">${aliases.type}</span>
        </label>

        <label style="display:flex; gap:6px; align-items:center;">
          Locale:
          <input id="yomo-locale" style="width:70px;" value="en">
        </label>

        <label style="display:flex; gap:6px; align-items:center;">
          <input id="yomo-primary" type="checkbox">
          Primary
        </label>

        <button id="yomo-preview" type="button">Preview</button>
        <button id="yomo-submit" type="button" disabled>Submit</button>
      </div>

      <div id="yomo-status" style="margin-top:8px; white-space:pre-wrap;"></div>
      <div id="yomo-table" style="margin-top:8px; max-height:320px; overflow:auto;"></div>
    `;

    (document.querySelector('#content') || document.body).prepend(box);

    // Ensure the select has a stable ID we can read
    const typeSel = box.querySelector('#yomo-type-wrap select');
    if (typeSel) typeSel.id = 'yomo-type';

    return box;
  }

  function setStatus(msg) {
    const el = document.getElementById('yomo-status');
    if (el) el.textContent = msg;
  }

  function render(rows) {
    const wrap = document.getElementById('yomo-table');
    if (!wrap) return;

    wrap.innerHTML = `
      <table class="tbl" style="width:100%;">
        <thead>
          <tr>
            <th>Medium</th>
            <th>#</th>
            <th>Recording</th>
            <th>Alias to add (from source)</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((r, i) => `
            <tr data-idx="${i}">
              <td>${esc(r.mediumPosition)}</td>
              <td>${esc(r.trackPosition)}</td>
              <td>
                <a href="${HOST}/recording/${r.recordingMbid}" target="_blank" rel="noreferrer noopener">
                  ${esc(r.recordingTitle || '(recording)')}
                </a>
                <div style="opacity:.65; font-size:11px;">${esc(r.recordingMbid)}</div>
              </td>
              <td>${esc(r.aliasName)}</td>
              <td class="st" title="${esc(r.matchType)}"></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  function submitOneAlias({ recordingMbid, aliasName, locale, primary, typeId, sourceUrl }, onOk, onFail) {
    const postData = {
      name: edits.encodeName(aliasName),
      sort_name: edits.encodeName(aliasName),
      locale: locale,
      primary_for_locale: primary ? 1 : 0,
      edit_note: editNote(sourceUrl),
    };

    // Only send type_id if the user selected one (blank means default)
    if (typeId) {
      postData.type_id = typeId;
    }

    requests.POST(
      `${HOST}/recording/${recordingMbid}/add-alias`,
      edits.formatEdit('edit-alias', postData),
      xhr => onOk(xhr),
      xhr => onFail(xhr)
    );
  }

  async function buildRows(sourceInput) {
    const srcMbid = parseReleaseMbid(sourceInput);
    if (!srcMbid) throw new Error('Could not parse SOURCE release MBID from input.');

    const tgtMbid = currentReleaseMbid();
    if (!tgtMbid) throw new Error('Could not parse TARGET release MBID from current page.');

    const srcUrlNormalized = sourceInput.trim().startsWith('http')
      ? sourceInput.trim()
      : `${HOST}/release/${srcMbid}`;

    setStatus('Fetching releases from WS…');
    const [src, tgt] = await Promise.all([wsRelease(srcMbid), wsRelease(tgtMbid)]);

    const srcTracks = flattenTracks(src);
    const tgtTracks = flattenTracks(tgt);

    const byRec = mapByRecording(srcTracks);
    const byPos = mapByPosition(srcTracks);

    const rows = [];
    for (const t of tgtTracks) {
      if (!t.recordingMbid) continue;

      let aliasName = byRec.get(t.recordingMbid);
      let matchType = 'recording';

      // Fallback if recordings differ (not ideal but better than nothing)
      if (!aliasName) {
        aliasName = byPos.get(`${t.mediumPosition}-${t.trackPosition}`);
        matchType = aliasName ? 'position' : 'none';
      }

      if (!aliasName) continue;

      rows.push({
        mediumPosition: t.mediumPosition,
        trackPosition: t.trackPosition,
        recordingMbid: t.recordingMbid,
        recordingTitle: t.recordingTitle,
        aliasName,
        matchType,
        sourceUrl: srcUrlNormalized,
      });
    }

    return rows;
  }

  function run() {
    if (!helper.isUserLoggedIn()) return;

    const ui = injectUI();
    let lastRows = null;

    ui.querySelector('#yomo-preview').addEventListener('click', async () => {
      try {
        const srcInput = ui.querySelector('#yomo-src').value;
        lastRows = await buildRows(srcInput);

        setStatus(`Preview ready. ${lastRows.length} aliases found to add.`);
        render(lastRows);

        ui.querySelector('#yomo-submit').disabled = lastRows.length === 0;
      } catch (e) {
        console.error(e);
        setStatus(`Preview failed: ${e.message}`);
      }
    });

    ui.querySelector('#yomo-submit').addEventListener('click', async () => {
      if (!lastRows || !lastRows.length) return;

      const locale = (ui.querySelector('#yomo-locale').value || 'en').trim() || 'en';
      const primary = !!ui.querySelector('#yomo-primary').checked;

      const typeId = ui.querySelector('#yomo-type')?.value || '';

      setStatus(`Submitting ${lastRows.length} alias edits…`);
      const trs = Array.from(document.querySelectorAll('#yomo-table tbody tr'));

      // Send sequentially to be gentle
      let i = 0;
      const next = () => {
        if (i >= lastRows.length) {
          setStatus('Done.');
          return;
        }

        const row = lastRows[i];
        const st = trs[i]?.querySelector('.st');
        if (st) st.textContent = 'Sending…';

        submitOneAlias(
          {
            recordingMbid: row.recordingMbid,
            aliasName: row.aliasName,
            locale,
            primary,
            typeId,
            sourceUrl: row.sourceUrl,
          },
          (xhr) => {
            if (st) st.textContent = `OK (HTTP ${xhr.status})`;
            i += 1;
            setTimeout(next, 400);
          },
          (xhr) => {
            if (st) st.textContent = `Error (HTTP ${xhr.status})`;
            i += 1;
            setTimeout(next, 400);
          }
        );
      };

      next();
    });
  }

  $(document).ready(run);
})();
