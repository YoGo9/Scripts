// ==UserScript==
// @name         MB: Copy Recordings From Release
// @namespace    https://github.com/YoGo9
// @version      7/15/2026
// @description  On the Recordings tab of the release editor, paste a release/medium MBID or URL to auto-assign recordings by track position. Supports copying a single medium (e.g. one disc of a box set). Also suggests existing releases from the same release group.
// @author       YoGo9
// @homepage     https://github.com/YoGo9/Scripts
// @updateURL    https://raw.githubusercontent.com/YoGo9/Scripts/main/CopyRecordingsFromRelease.user.js
// @downloadURL  https://raw.githubusercontent.com/YoGo9/Scripts/main/CopyRecordingsFromRelease.user.js
// @match        *://*.musicbrainz.org/release/add*
// @match        *://*.musicbrainz.org/release/*/edit*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const MBID_RE        = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    const MEDIUM_URL_RE  = /\/medium\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
    const RELEASE_DISC_RE = /\/release\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/disc\/(\d+)/i;

    // ── UI injection ──────────────────────────────────────────────────────────

    function injectUI() {
        if (document.getElementById('cfr-widget')) return;
        const anchor = document.querySelector('.changes');
        if (!anchor) return;

        const wrapper = document.createElement('div');
        wrapper.id = 'cfr-widget';
        wrapper.style.cssText = 'margin:12px 0 0 0;padding:10px 12px;background:#f0f4ff;border:1px solid #99a8d0;border-radius:4px;font-size:13px;clear:both;';

        wrapper.innerHTML =
            '<strong style="display:block;margin-bottom:6px;">&#x1F4CB; Copy recordings from another release or medium</strong>' +
            // Suggestions section (hidden until populated)
            '<div id="cfr-suggestions" style="display:none;margin-bottom:8px;">' +
                '<div style="margin-bottom:4px;font-weight:bold;font-size:12px;color:#444;">Releases in this release group:</div>' +
                '<div id="cfr-suggestion-list"></div>' +
            '</div>' +
            // Manual paste section
            '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">' +
                '<input id="cfr-input" type="text" placeholder="Or paste a release/medium MBID or URL\u2026"' +
                ' style="flex:1;min-width:220px;padding:4px 6px;font-size:13px;border:1px solid #aaa;border-radius:3px;" />' +
                '<button id="cfr-btn" type="button"' +
                ' style="padding:4px 10px;font-size:13px;cursor:pointer;border-radius:3px;border:1px solid #888;background:#e8eaf0;">' +
                'Apply</button>' +
            '</div>' +
            // Target-medium chooser (hidden until needed)
            '<div id="cfr-target-chooser" style="display:none;margin-top:8px;"></div>' +
            '<div id="cfr-status" style="margin-top:5px;min-height:16px;font-style:italic;color:#555;"></div>';

        anchor.appendChild(wrapper);

        document.getElementById('cfr-btn').addEventListener('click', onApplyFromInput);
        document.getElementById('cfr-input').addEventListener('keydown', function (e) {
            if (e.key === 'Enter') onApplyFromInput();
        });

        // Try to load RG suggestions
        loadRGSuggestions();
    }

    // ── Release group suggestions ─────────────────────────────────────────────

    function loadRGSuggestions() {
        var vm = getReleaseEditorVM();
        if (!vm) return;

        var release = vm.rootField.release();
        if (!release) return;

        var rg = release.releaseGroup();
        var rgGid = rg && rg.gid;
        if (!rgGid) {
            // RG may not be set yet; subscribe and retry once
            release.releaseGroup.subscribe(function (newRG) {
                if (newRG && newRG.gid) fetchAndRenderSuggestions(newRG.gid);
            });
            return;
        }

        fetchAndRenderSuggestions(rgGid);
    }

    function fetchAndRenderSuggestions(rgGid) {
        var url = '/ws/2/release?release-group=' + rgGid + '&inc=artist-credits+media+labels+release-groups&fmt=json';
        fetch(url)
            .then(function (r) { return r.ok ? r.json() : Promise.reject('HTTP ' + r.status); })
            .then(function (data) {
                var releases = (data.releases || []);
                if (!releases.length) return;
                renderSuggestions(releases);
            })
            .catch(function (e) { console.warn('[CFR] RG fetch failed:', e); });
    }

    function renderSuggestions(releases) {
        var list = document.getElementById('cfr-suggestion-list');
        var section = document.getElementById('cfr-suggestions');
        if (!list || !section) return;

        list.innerHTML = '';

        releases.forEach(function (rel) {
            var mbid = rel.id;
            var title = rel.title || '(untitled)';

            // Build a human-readable descriptor: format · tracks · date · country
            var media = rel.media || [];
            var formats = [];
            var trackCounts = [];
            media.forEach(function (m) {
                if (m.format) formats.push(m.format);
                if (m['track-count']) trackCounts.push(m['track-count']);
            });
            var formatStr = formats.length ? formats.join('+') : '';
            var trackStr = trackCounts.length ? trackCounts.join('+') + ' tracks' : '';

            var events = rel['release-events'] || [];
            var dates = events.map(function (e) { return e.date; }).filter(Boolean);
            var countries = [];
            events.forEach(function (e) {
                var codes = e.area && e.area['iso-3166-1-codes'];
                if (codes) codes.forEach(function (c) { countries.push(c); });
            });
            var dateStr = dates.length ? dates[0] : '';
            var countryStr = [...new Set(countries)].join(', ');

            var meta = [formatStr, trackStr, dateStr, countryStr].filter(Boolean).join(' · ');

            var btn = document.createElement('button');
            btn.type = 'button';
            btn.style.cssText = 'display:block;width:100%;text-align:left;margin-bottom:3px;padding:4px 7px;font-size:12px;cursor:pointer;border:1px solid #bbb;border-radius:3px;background:#fff;';
            btn.innerHTML = '<strong>' + escapeHtml(title) + '</strong>' +
                (meta ? ' <span style="color:#666;font-weight:normal;">' + escapeHtml(meta) + '</span>' : '');

            btn.addEventListener('click', function () {
                applyFromMBID(mbid);
            });
            list.appendChild(btn);
        });

        section.style.display = 'block';
    }

    function escapeHtml(s) {
        return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    // ── Apply from manual input ───────────────────────────────────────────────

    function onApplyFromInput() {
        clearTargetChooser();
        var raw = (document.getElementById('cfr-input') || {}).value;
        if (!raw || !raw.trim()) { setStatus('Please paste a release or medium MBID or URL.', '#a00'); return; }
        raw = raw.trim();

        // 1) Medium permalink: /medium/{mbid}
        var mediumMatch = raw.match(MEDIUM_URL_RE);
        if (mediumMatch) {
            resolveMediumAndApply(mediumMatch[1]);
            return;
        }

        // 2) Release disc view: /release/{mbid}/disc/{n}
        var discMatch = raw.match(RELEASE_DISC_RE);
        if (discMatch) {
            applyFromMBID(discMatch[1], parseInt(discMatch[2], 10));
            return;
        }

        // 3) Plain release MBID or release URL
        var match = raw.match(MBID_RE);
        if (!match) { setStatus('Could not find a valid MBID in the input.', '#a00'); return; }
        applyFromMBID(match[0]);
    }

    // ── Medium MBID resolution ────────────────────────────────────────────────
    // There is no /ws/2/medium endpoint, but /medium/{mbid} on the website
    // redirects (same-origin) to /release/{release-mbid}/disc/{position},
    // so we follow the redirect and parse the final URL.

    function resolveMediumAndApply(mediumMbid) {
        setStatus('Resolving medium ' + mediumMbid + '\u2026');
        fetch('/medium/' + mediumMbid, { redirect: 'follow' })
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                var finalUrl = r.url || '';
                var discMatch = finalUrl.match(RELEASE_DISC_RE);
                if (discMatch) {
                    return { releaseMbid: discMatch[1], mediumPos: parseInt(discMatch[2], 10) };
                }
                // Fallback: redirect landed on a plain release URL (e.g. single-medium
                // release, or fragment-based anchor was stripped). Try #disc{n} fragment,
                // else assume medium 1.
                var relMatch = finalUrl.match(/\/release\/([0-9a-f-]{36})/i);
                if (!relMatch) throw new Error('Could not resolve medium to a release (landed on ' + finalUrl + ')');
                var fragMatch = finalUrl.match(/#disc(\d+)/i);
                return { releaseMbid: relMatch[1], mediumPos: fragMatch ? parseInt(fragMatch[1], 10) : 1 };
            })
            .then(function (info) {
                applyFromMBID(info.releaseMbid, info.mediumPos);
            })
            .catch(function (err) { setStatus('Error resolving medium: ' + err.message, '#a00'); });
    }

    function applyFromMBID(mbid, sourceMediumPos) {
        setStatus('Fetching release ' + mbid + (sourceMediumPos ? ' (medium ' + sourceMediumPos + ')' : '') + '\u2026');
        fetch('/ws/2/release/' + mbid + '?inc=recordings+artist-credits&fmt=json')
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .then(function (data) {
                if (sourceMediumPos) {
                    applyRecordingsFromMedium(data, sourceMediumPos);
                } else {
                    applyRecordings(data);
                }
            })
            .catch(function (err) { setStatus('Error fetching release: ' + err.message, '#a00'); });
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    function setStatus(msg, color) {
        var el = document.getElementById('cfr-status');
        if (el) { el.textContent = msg; el.style.color = color || '#555'; }
    }

    function clearTargetChooser() {
        var el = document.getElementById('cfr-target-chooser');
        if (el) { el.style.display = 'none'; el.innerHTML = ''; }
    }

    function buildRecordingEntity(recData) {
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
        return MB.entity({
            gid: recData.id,
            name: recData.title,
            length: recData.length || null,
            artistCredit: { names: names },
        }, 'recording');
    }

    function assignToTracks(tracks, trackMapByPos) {
        var applied = 0, skipped = 0, notFound = 0;
        tracks.forEach(function (track) {
            var recData = trackMapByPos.get(track.position());
            if (!recData) { notFound++; return; }
            if (track.hasExistingRecording() && track.recording() && track.recording().gid === recData.id) {
                skipped++; return;
            }
            try {
                track.recording(buildRecordingEntity(recData));
                applied++;
            } catch (e) {
                console.error('[CFR] Error on track', track.position(), e);
                notFound++;
            }
        });
        return { applied: applied, skipped: skipped, notFound: notFound };
    }

    function reportResult(res, suffix) {
        var color = res.applied > 0 ? '#007700' : '#a00';
        setStatus('Done: ' + res.applied + ' applied, ' + res.skipped + ' already set, ' +
                  res.notFound + ' not matched' + (suffix ? ' ' + suffix : '') + '.', color);
    }

    // ── Apply recordings (whole release, medium:track position match) ────────

    function applyRecordings(releaseData) {
        var trackMap = new Map();
        (releaseData.media || []).forEach(function (medium) {
            var medPos = medium.position;
            (medium.tracks || []).forEach(function (track) {
                if (track.recording) {
                    trackMap.set(medPos + ':' + track.position, track.recording);
                }
            });
        });

        if (!trackMap.size) { setStatus('No recordings found in that release.', '#a00'); return; }

        var vm = getReleaseEditorVM();
        if (!vm) { setStatus('Could not access the release editor view-model.', '#a00'); return; }

        var release = vm.rootField.release();
        if (!release) { setStatus('No release loaded in editor.', '#a00'); return; }

        var total = { applied: 0, skipped: 0, notFound: 0 };

        release.mediums().forEach(function (medium) {
            var medPos = medium.position();
            var perMedium = new Map();
            trackMap.forEach(function (rec, key) {
                var parts = key.split(':');
                if (parseInt(parts[0], 10) === medPos) perMedium.set(parseInt(parts[1], 10), rec);
            });
            var res = assignToTracks(medium.tracks(), perMedium);
            total.applied += res.applied;
            total.skipped += res.skipped;
            total.notFound += res.notFound;
        });

        reportResult(total);
    }

    // ── Apply recordings from a single source medium ─────────────────────────

    function applyRecordingsFromMedium(releaseData, sourceMediumPos) {
        var sourceMedium = (releaseData.media || []).find(function (m) {
            return m.position === sourceMediumPos;
        });
        if (!sourceMedium) {
            setStatus('Medium ' + sourceMediumPos + ' not found on that release.', '#a00');
            return;
        }

        var trackMap = new Map();
        (sourceMedium.tracks || []).forEach(function (track) {
            if (track.recording) trackMap.set(track.position, track.recording);
        });

        if (!trackMap.size) {
            setStatus('No recordings found on that medium.', '#a00');
            return;
        }

        var vm = getReleaseEditorVM();
        if (!vm) { setStatus('Could not access the release editor view-model.', '#a00'); return; }

        var release = vm.rootField.release();
        if (!release) { setStatus('No release loaded in editor.', '#a00'); return; }

        var targetMediums = release.mediums();
        var sourceLabel = 'medium ' + sourceMediumPos +
            (sourceMedium.title ? ' \u201C' + sourceMedium.title + '\u201D' : '') +
            ' (' + trackMap.size + ' tracks)';

        // One target medium: just apply.
        if (targetMediums.length === 1) {
            reportResult(assignToTracks(targetMediums[0].tracks(), trackMap), 'from source ' + sourceLabel);
            return;
        }

        // Multiple target mediums: if exactly one has a matching track count, use it.
        var matching = targetMediums.filter(function (m) {
            return m.tracks().length === trackMap.size;
        });
        if (matching.length === 1) {
            var res = assignToTracks(matching[0].tracks(), trackMap);
            reportResult(res, 'from source ' + sourceLabel + ' \u2192 target medium ' + matching[0].position());
            return;
        }

        // Ambiguous: let the user pick the target medium.
        renderTargetChooser(targetMediums, trackMap, sourceLabel);
    }

    function renderTargetChooser(targetMediums, trackMap, sourceLabel) {
        var chooser = document.getElementById('cfr-target-chooser');
        if (!chooser) return;
        chooser.innerHTML =
            '<div style="margin-bottom:4px;font-weight:bold;font-size:12px;color:#444;">' +
            'Source ' + escapeHtml(sourceLabel) + ' \u2014 apply to which medium of this release?</div>';

        targetMediums.forEach(function (m) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.style.cssText = 'display:block;width:100%;text-align:left;margin-bottom:3px;padding:4px 7px;font-size:12px;cursor:pointer;border:1px solid #bbb;border-radius:3px;background:#fff;';
            var name = m.name && m.name() ? ' \u201C' + m.name() + '\u201D' : '';
            btn.textContent = 'Medium ' + m.position() + name + ' \u00B7 ' + m.tracks().length + ' tracks';
            btn.addEventListener('click', function () {
                clearTargetChooser();
                reportResult(assignToTracks(m.tracks(), trackMap),
                             'from source ' + sourceLabel + ' \u2192 target medium ' + m.position());
            });
            chooser.appendChild(btn);
        });

        chooser.style.display = 'block';
        setStatus('Choose a target medium above.', '#555');
    }

    // ── Access the KO view-model ──────────────────────────────────────────────

    function getReleaseEditorVM() {
        try {
            if (window.MB && window.MB.releaseEditor && window.MB.releaseEditor.rootField)
                return window.MB.releaseEditor;
            if (window.MB && window.MB._releaseEditor && window.MB._releaseEditor.rootField)
                return window.MB._releaseEditor;
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
        } catch (e) { console.error('[CFR] getReleaseEditorVM error:', e); }
        return null;
    }

    // ── Tab-change observer ───────────────────────────────────────────────────

    var observer = new MutationObserver(function () {
        if (!document.getElementById('cfr-widget')) injectUI();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    injectUI();

})();
                
