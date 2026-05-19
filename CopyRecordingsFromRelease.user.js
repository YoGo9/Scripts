// ==UserScript==
// @name         MB: Copy Recordings From Release
// @namespace    https://github.com/YoGo9
// @version      5/19/2026
// @description  On the Recordings tab of the release editor, paste a release MBID or URL to auto-assign all recordings by track position
// @author       YoGo9
// @homepage     https://github.com/YoGo9/Scripts
// @updateURL    https://raw.githubusercontent.com/YoGo9/Scripts/main/CopyRecordingsFromRelease.user.js
// @downloadURL  https://raw.githubusercontent.com/YoGo9/Scripts/main/CopyRecordingsFromRelease.user.js
// @match        *://*.musicbrainz.org/release/add
// @match        *://*.musicbrainz.org/release/*/edit
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const MBID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

    // ── UI injection ──────────────────────────────────────────────────────────

    function injectUI() {
        if (document.getElementById('cfr-widget')) return;

        const anchor = document.querySelector('.changes');
        if (!anchor) return;

        const wrapper = document.createElement('div');
        wrapper.id = 'cfr-widget';
        wrapper.style.cssText = [
            'margin: 12px 0 0 0',
            'padding: 10px 12px',
            'background: #f0f4ff',
            'border: 1px solid #99a8d0',
            'border-radius: 4px',
            'font-size: 13px',
            'clear: both',
        ].join(';');

        wrapper.innerHTML =
            '<strong style="display:block;margin-bottom:6px;">&#x1F4CB; Copy recordings from another release</strong>' +
            '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">' +
                '<input id="cfr-input" type="text" placeholder="Paste release MBID or URL\u2026"' +
                ' style="flex:1;min-width:220px;padding:4px 6px;font-size:13px;border:1px solid #aaa;border-radius:3px;" />' +
                '<button id="cfr-btn" type="button"' +
                ' style="padding:4px 10px;font-size:13px;cursor:pointer;border-radius:3px;border:1px solid #888;background:#e8eaf0;">' +
                'Apply</button>' +
            '</div>' +
            '<div id="cfr-status" style="margin-top:5px;min-height:16px;font-style:italic;color:#555;"></div>';

        anchor.appendChild(wrapper);

        document.getElementById('cfr-btn').addEventListener('click', onApply);
        document.getElementById('cfr-input').addEventListener('keydown', function (e) {
            if (e.key === 'Enter') onApply();
        });
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    function setStatus(msg, color) {
        var el = document.getElementById('cfr-status');
        if (el) { el.textContent = msg; el.style.color = color || '#555'; }
    }

    async function onApply() {
        var raw = (document.getElementById('cfr-input') || {}).value;
        if (!raw || !raw.trim()) { setStatus('Please paste a release MBID or URL.', '#a00'); return; }

        var match = raw.trim().match(MBID_RE);
        if (!match) { setStatus('Could not find a valid MBID in the input.', '#a00'); return; }

        var mbid = match[0];
        setStatus('Fetching release ' + mbid + '\u2026');

        var releaseData;
        try {
            var resp = await fetch('/ws/2/release/' + mbid + '?inc=recordings+artist-credits&fmt=json');
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            releaseData = await resp.json();
        } catch (err) {
            setStatus('Error fetching release: ' + err.message, '#a00');
            return;
        }

        applyRecordings(releaseData);
    }

    // ── Apply recordings ──────────────────────────────────────────────────────

    function applyRecordings(releaseData) {
        // Build map: "mediumPos:trackPos" -> WS2 recording object
        // WS2 medium.position and track.position are both 1-based integers
        var trackMap = new Map();
        (releaseData.media || []).forEach(function (medium) {
            var medPos = medium.position;
            (medium.tracks || []).forEach(function (track) {
                if (track.recording) {
                    trackMap.set(medPos + ':' + track.position, track.recording);
                }
            });
        });

        if (!trackMap.size) {
            setStatus('No recordings found in that release.', '#a00');
            return;
        }

        var vm = getReleaseEditorVM();
        if (!vm) {
            setStatus('Could not access the release editor view-model.', '#a00');
            return;
        }

        var release = vm.rootField.release();
        if (!release) { setStatus('No release loaded in editor.', '#a00'); return; }

        var applied = 0, skipped = 0, notFound = 0;

        release.mediums().forEach(function (medium) {
            var medPos = medium.position();   // KO observable, 1-based

            medium.tracks().forEach(function (track) {
                var trackPos = track.position(); // 1-based (0 = pregap)
                var key = medPos + ':' + trackPos;
                var recData = trackMap.get(key);

                if (!recData) { notFound++; return; }

                // Already has this exact recording
                if (track.hasExistingRecording() && track.recording() && track.recording().gid === recData.id) {
                    skipped++;
                    return;
                }

                try {
                    // WS2 uses rec.id for MBIDs; MB.entity expects rec.gid
                    // WS2 artist-credit uses artist.id; MB.entity expects artist.gid
                    var names = (recData['artist-credit'] || [])
                        .filter(function (ac) { return ac && typeof ac === 'object' && ac.artist; })
                        .map(function (ac) {
                            return {
                                name: ac.name || ac.artist.name || '',
                                joinPhrase: ac.joinphrase || '',
                                artist: {
                                    gid: ac.artist.id,
                                    name: ac.artist.name || '',
                                    sortName: ac.artist['sort-name'] || '',
                                    entityType: 'artist',
                                },
                            };
                        });

                    var entityData = {
                        gid: recData.id,
                        name: recData.title,
                        length: recData.length || null,
                        artistCredit: { names: names },
                    };

                    var entity = MB.entity(entityData, 'recording');
                    track.recording(entity);
                    applied++;
                } catch (e) {
                    console.error('[CFR] Error on track', trackPos, e);
                    notFound++;
                }
            });
        });

        var color = applied > 0 ? '#007700' : '#a00';
        setStatus('Done: ' + applied + ' applied, ' + skipped + ' already set, ' + notFound + ' not matched.', color);
    }

    // ── Access the KO view-model ──────────────────────────────────────────────
    //   viewModel.js:  MB.releaseEditor = { rootField: { release: ko.observable() } }
    //   init.js:       MB._releaseEditor = releaseEditor  (full instance)

    function getReleaseEditorVM() {
        try {
            if (window.MB && window.MB.releaseEditor && window.MB.releaseEditor.rootField)
                return window.MB.releaseEditor;
            if (window.MB && window.MB._releaseEditor && window.MB._releaseEditor.rootField)
                return window.MB._releaseEditor;

            // Fallback: KO context walk
            var changesDiv = document.querySelector('.changes[data-bind]');
            if (changesDiv) {
                var ctx = ko.contextFor(changesDiv);
                if (ctx && ctx.$root && ctx.$root.rootField) return ctx.$root;
                if (ctx && ctx.$parents) {
                    for (var i = 0; i < ctx.$parents.length; i++) {
                        if (ctx.$parents[i] && ctx.$parents[i].rootField) return ctx.$parents[i];
                    }
                }
            }
        } catch (e) {
            console.error('[CFR] getReleaseEditorVM error:', e);
        }
        return null;
    }

    // ── Tab-change observer ───────────────────────────────────────────────────

    var observer = new MutationObserver(function () {
        if (!document.getElementById('cfr-widget')) injectUI();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    injectUI();

})();
