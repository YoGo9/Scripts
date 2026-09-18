/*
 * Built using mbz-loujine-common.js by loujine
 * https://github.com/loujine/musicbrainz-scripts
 * MIT License
 */

/* global $ helper edits requests aliases */
'use strict';

// ==UserScript==
// @name         Batch Add Recording Aliases from another Release
// @namespace    YoGo9
// @author       YoGo9
// @version      2026.09.17
// @description  Copy track titles from another MusicBrainz release to recording aliases on the current release.
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

if (!/^\/release\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(location.pathname)) {
  return;
}

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
    const r = await fetch(url, {
      headers: { Accept: 'application/json' },
    });

    if (!r.ok) {
      throw new Error(`MusicBrainz returned HTTP ${r.status}`);
    }

    return r.json();
  }

  function flattenTracks(releaseJson) {
    const out = [];

    for (const medium of (releaseJson.media || [])) {
      const mediumPosition = medium.position;

      for (const track of (medium.tracks || [])) {
        out.push({
          mediumPosition,
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
    const map = new Map();

    for (const track of tracks) {
      if (track.recordingMbid) {
        map.set(track.recordingMbid, track.trackTitle);
      }
    }

    return map;
  }

  function mapByPosition(tracks) {
    const map = new Map();

    for (const track of tracks) {
      map.set(
        `${track.mediumPosition}-${track.trackPosition}`,
        track.trackTitle
      );
    }

    return map;
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[char]);
  }

  function editNote(sourceReleaseUrl) {
    return `Batch Add Recording Alias from release ${sourceReleaseUrl}`;
  }

  function injectStyles() {
    const style = document.createElement('style');

    style.textContent = `
      #yomo-alias-launch {
        margin-left: .5em;
        white-space: nowrap;
      }

      #yomo-alias-panel {
        display: none;
        margin: 8px 0 12px;
        padding: 8px 10px;
        border: 1px solid rgba(127, 127, 127, .32);
        background: transparent;
        color: inherit;
        font-size: 13px;
      }

      #yomo-alias-panel.yomo-open {
        display: block;
      }

      #yomo-alias-panel .yomo-line {
        display: flex;
        align-items: center;
        gap: 7px;
        flex-wrap: wrap;
      }

      #yomo-alias-panel .yomo-line + .yomo-line {
        margin-top: 6px;
      }

      #yomo-src {
        flex: 1 1 420px;
        min-width: 220px;
        max-width: 720px;
      }

      #yomo-locale {
        width: 54px;
      }

      #yomo-summary {
        min-height: 18px;
        margin-top: 6px;
      }

      #yomo-summary.yomo-error,
      .yomo-row-error {
        color: #a40000;
      }

      #yomo-summary.yomo-warning {
        color: #9a6700;
      }

      #yomo-actions {
        margin-left: auto;
      }

      #yomo-table-wrap {
        display: none;
        margin-top: 6px;
        max-height: 330px;
        overflow: auto;
        border-top: 1px solid rgba(127, 127, 127, .28);
      }

      #yomo-table-wrap.yomo-visible {
        display: block;
      }

      #yomo-table {
        width: 100%;
        margin-top: 5px;
      }

      #yomo-table th,
      #yomo-table td {
        padding: 3px 5px;
        vertical-align: top;
      }

      #yomo-table th:first-child,
      #yomo-table td:first-child {
        width: 24px;
        text-align: center;
      }

      #yomo-table .yomo-disc,
      #yomo-table .yomo-track {
        width: 44px;
        white-space: nowrap;
      }

      #yomo-table .yomo-recording {
        width: 43%;
      }

      #yomo-table .yomo-alias {
        width: 43%;
      }

      #yomo-table tr.yomo-done {
        opacity: .55;
      }

      #yomo-table tr.yomo-failed {
        background: rgba(164, 0, 0, .08);
      }

      .yomo-row-error {
        margin-top: 2px;
        font-size: 11px;
      }

      #yomo-type-wrap select {
        max-width: 145px;
      }

      @media (prefers-color-scheme: dark) {
        #yomo-alias-panel {
          border-color: rgba(220, 220, 220, .24);
          background: transparent;
        }

        #yomo-table-wrap {
          border-top-color: rgba(220, 220, 220, .18);
        }

        #yomo-summary.yomo-error,
        .yomo-row-error {
          color: #ff9b9b;
        }

        #yomo-summary.yomo-warning {
          color: #e0ba67;
        }

        #yomo-table tr.yomo-failed {
          background: rgba(255, 120, 120, .08);
        }
      }

      @media (max-width: 700px) {
        #yomo-actions {
          margin-left: 0;
        }

        #yomo-alias-panel {
          padding: 7px;
        }

        #yomo-table .yomo-recording,
        #yomo-table .yomo-alias {
          width: auto;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function findTabs() {
    return (
      document.querySelector('#content ul.tabs') ||
      document.querySelector('ul.tabs')
    );
  }

  function injectLauncherAndPanel() {
    injectStyles();

    const tabs = findTabs();
    const content = document.querySelector('#content') || document.body;

    const launch = document.createElement('button');
    launch.id = 'yomo-alias-launch';
    launch.type = 'button';
    launch.textContent = 'Recording aliases';

    let panelAnchor;

    if (tabs) {
      const li = document.createElement('li');
      li.style.float = 'right';
      li.style.marginLeft = '6px';
      li.appendChild(launch);
      tabs.appendChild(li);
      panelAnchor = tabs;
    } else {
      const fallback = document.createElement('div');
      fallback.style.textAlign = 'right';
      fallback.style.margin = '4px 0';
      fallback.appendChild(launch);
      content.prepend(fallback);
      panelAnchor = fallback;
    }

    const panel = document.createElement('div');
    panel.id = 'yomo-alias-panel';

    panel.innerHTML = `
      <div class="yomo-line">
        <strong>Source release</strong>
        <input
          id="yomo-src"
          type="text"
          placeholder="MusicBrainz release URL or MBID"
          autocomplete="off"
        >
        <button id="yomo-preview" type="button">Preview</button>
      </div>

      <div class="yomo-line">
        <label>
          Type
          <span id="yomo-type-wrap">${aliases.type}</span>
        </label>

        <label>
          Locale
          <input id="yomo-locale" type="text" value="en">
        </label>

        <label>
          <input id="yomo-primary" type="checkbox">
          Primary for locale
        </label>

        <span id="yomo-actions">
          <button id="yomo-submit" type="button" disabled>Submit selected</button>
        </span>
      </div>

      <div id="yomo-summary"></div>
      <div id="yomo-table-wrap"></div>
    `;

    panelAnchor.insertAdjacentElement('afterend', panel);

    const typeSelect = panel.querySelector('#yomo-type-wrap select');
    if (typeSelect) {
      typeSelect.id = 'yomo-type';
    }

    launch.addEventListener('click', () => {
      const open = panel.classList.toggle('yomo-open');
      launch.textContent = open ? 'Recording aliases ▴' : 'Recording aliases';
    });

    return { launch, panel };
  }

  function setSummary(message, kind = '') {
    const el = document.getElementById('yomo-summary');
    if (!el) return;

    el.className = '';
    if (kind) el.classList.add(`yomo-${kind}`);
    el.textContent = message || '';
  }

  function selectedIndexes() {
    return Array.from(
      document.querySelectorAll('#yomo-table tbody input.yomo-row-check:checked')
    ).map(input => Number(input.dataset.idx));
  }

  function updateSubmitButton() {
    const button = document.getElementById('yomo-submit');
    if (!button) return;

    const count = selectedIndexes().length;
    button.disabled = count === 0;
    button.textContent = count ? `Submit selected (${count})` : 'Submit selected';
  }

  function render(rows) {
    const wrap = document.getElementById('yomo-table-wrap');
    if (!wrap) return;

    if (!rows.length) {
      wrap.classList.remove('yomo-visible');
      wrap.innerHTML = '';
      updateSubmitButton();
      return;
    }

    wrap.innerHTML = `
      <table id="yomo-table" class="tbl">
        <thead>
          <tr>
            <th>
              <input
                id="yomo-check-all"
                type="checkbox"
                checked
                title="Select all"
              >
            </th>
            <th class="yomo-disc">Disc</th>
            <th class="yomo-track">Track</th>
            <th class="yomo-recording">Recording</th>
            <th class="yomo-alias">Alias to add</th>
          </tr>
        </thead>

        <tbody>
          ${rows.map((row, index) => `
            <tr data-idx="${index}">
              <td>
                <input
                  class="yomo-row-check"
                  type="checkbox"
                  data-idx="${index}"
                  checked
                >
              </td>

              <td class="yomo-disc">${esc(row.mediumPosition)}</td>
              <td class="yomo-track">${esc(row.trackPosition)}</td>

              <td class="yomo-recording">
                <a
                  href="${HOST}/recording/${esc(row.recordingMbid)}"
                  target="_blank"
                  rel="noreferrer noopener"
                >${esc(row.recordingTitle || '(recording)')}</a>
              </td>

              <td class="yomo-alias">
                <span>${esc(row.aliasName)}</span>
                <div class="yomo-row-error"></div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    wrap.classList.add('yomo-visible');

    const checkAll = wrap.querySelector('#yomo-check-all');
    const rowChecks = Array.from(
      wrap.querySelectorAll('input.yomo-row-check')
    );

    checkAll.addEventListener('change', () => {
      for (const checkbox of rowChecks) {
        if (!checkbox.disabled) {
          checkbox.checked = checkAll.checked;
        }
      }
      updateSubmitButton();
    });

    for (const checkbox of rowChecks) {
      checkbox.addEventListener('change', () => {
        const activeChecks = rowChecks.filter(cb => !cb.disabled);
        const checkedCount = activeChecks.filter(cb => cb.checked).length;

        checkAll.checked =
          activeChecks.length > 0 &&
          checkedCount === activeChecks.length;

        checkAll.indeterminate =
          checkedCount > 0 &&
          checkedCount < activeChecks.length;

        updateSubmitButton();
      });
    }

    updateSubmitButton();
  }

  function submitOneAlias(
    {
      recordingMbid,
      aliasName,
      locale,
      primary,
      typeId,
      sourceUrl,
    },
    onOk,
    onFail
  ) {
    const postData = {
      name: edits.encodeName(aliasName),
      sort_name: edits.encodeName(aliasName),
      locale,
      primary_for_locale: primary ? 1 : 0,
      edit_note: editNote(sourceUrl),
    };

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

    if (!srcMbid) {
      throw new Error('Could not read a source release MBID.');
    }

    const tgtMbid = currentReleaseMbid();

    if (!tgtMbid) {
      throw new Error('Could not read the current release MBID.');
    }

    const sourceUrl = sourceInput.trim().startsWith('http')
      ? sourceInput.trim()
      : `${HOST}/release/${srcMbid}`;

    const [sourceRelease, targetRelease] = await Promise.all([
      wsRelease(srcMbid),
      wsRelease(tgtMbid),
    ]);

    const sourceTracks = flattenTracks(sourceRelease);
    const targetTracks = flattenTracks(targetRelease);

    const byRecording = mapByRecording(sourceTracks);
    const byPosition = mapByPosition(sourceTracks);

    const rows = [];
    let unmatched = 0;

    for (const track of targetTracks) {
      if (!track.recordingMbid) {
        unmatched += 1;
        continue;
      }

      let aliasName = byRecording.get(track.recordingMbid);
      let matchType = 'recording';

      if (!aliasName) {
        aliasName = byPosition.get(
          `${track.mediumPosition}-${track.trackPosition}`
        );
        matchType = aliasName ? 'position' : 'none';
      }

      if (!aliasName) {
        unmatched += 1;
        continue;
      }

      rows.push({
        mediumPosition: track.mediumPosition,
        trackPosition: track.trackPosition,
        recordingMbid: track.recordingMbid,
        recordingTitle: track.recordingTitle,
        aliasName,
        matchType,
        sourceUrl,
      });
    }

    return {
      rows,
      unmatched,
      targetCount: targetTracks.length,
    };
  }

  function run() {
    if (!helper.isUserLoggedIn()) return;

    const { panel } = injectLauncherAndPanel();

    let lastRows = [];

    panel.querySelector('#yomo-preview').addEventListener('click', async () => {
      const previewButton = panel.querySelector('#yomo-preview');
      const submitButton = panel.querySelector('#yomo-submit');

      try {
        previewButton.disabled = true;
        submitButton.disabled = true;

        setSummary('Loading…');

        const sourceInput = panel.querySelector('#yomo-src').value;
        const result = await buildRows(sourceInput);

        lastRows = result.rows;
        render(lastRows);

        if (!lastRows.length) {
          setSummary('No matching aliases found.', 'warning');
          return;
        }

        if (result.unmatched) {
          setSummary(
            `${lastRows.length} aliases found. ${result.unmatched} track${result.unmatched === 1 ? '' : 's'} could not be matched.`,
            'warning'
          );
        } else {
          setSummary(`${lastRows.length} aliases found.`);
        }

        updateSubmitButton();
      } catch (error) {
        console.error(error);
        lastRows = [];
        render([]);
        setSummary(error.message || 'Preview failed.', 'error');
      } finally {
        previewButton.disabled = false;
      }
    });

    panel.querySelector('#yomo-submit').addEventListener('click', () => {
      if (!lastRows.length) return;

      const indexes = selectedIndexes();
      if (!indexes.length) return;

      const locale =
        (panel.querySelector('#yomo-locale').value || 'en').trim() || 'en';

      const primary = !!panel.querySelector('#yomo-primary').checked;
      const typeId = panel.querySelector('#yomo-type')?.value || '';

      const submitButton = panel.querySelector('#yomo-submit');
      const previewButton = panel.querySelector('#yomo-preview');

      submitButton.disabled = true;
      previewButton.disabled = true;

      let position = 0;
      let successCount = 0;
      let failedCount = 0;

      const next = () => {
        if (position >= indexes.length) {
          previewButton.disabled = false;
          updateSubmitButton();

          if (failedCount) {
            setSummary(
              `Finished: ${successCount} added, ${failedCount} failed.`,
              'error'
            );
          } else {
            setSummary(`Done. ${successCount} aliases added.`);
          }

          return;
        }

        const rowIndex = indexes[position];
        const row = lastRows[rowIndex];
        const tr = document.querySelector(
          `#yomo-table tbody tr[data-idx="${rowIndex}"]`
        );
        const checkbox = tr?.querySelector('.yomo-row-check');
        const errorEl = tr?.querySelector('.yomo-row-error');

        if (errorEl) {
          errorEl.textContent = '';
        }

        setSummary(
          `Submitting ${position + 1} of ${indexes.length}…`
        );

        submitOneAlias(
          {
            recordingMbid: row.recordingMbid,
            aliasName: row.aliasName,
            locale,
            primary,
            typeId,
            sourceUrl: row.sourceUrl,
          },
          () => {
            successCount += 1;

            if (tr) {
              tr.classList.add('yomo-done');
              tr.classList.remove('yomo-failed');
            }

            if (checkbox) {
              checkbox.checked = false;
              checkbox.disabled = true;
            }

            position += 1;
            setTimeout(next, 400);
          },
          xhr => {
            failedCount += 1;

            if (tr) {
              tr.classList.add('yomo-failed');
            }

            if (errorEl) {
              errorEl.textContent = `Error: HTTP ${xhr.status}`;
            }

            position += 1;
            setTimeout(next, 400);
          }
        );
      };

      next();
    });
  }

  $(document).ready(run);
})();
