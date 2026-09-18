// ==UserScript==
// @name         MB: Copy Recordings From Release
// @namespace    https://github.com/YoGo9
// @version      2026.09.15
// @description  Copy recording assignments from another MusicBrainz release or medium. Includes release-group suggestions.
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

    const MBID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    const MEDIUM_URL_RE = /\/medium\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
    const RELEASE_DISC_RE = /\/release\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/disc\/(\d+)/i;
    const EDIT_RELEASE_RE = /\/release\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/edit/i;

    const WS_MIN_INTERVAL_MS = 1100;
    let lastWsRequestAt = 0;
    let wsQueue = Promise.resolve();

    let suggestionRequestId = 0;
    let watchedRelease = null;
    let releaseGroupSubscription = null;
    let lastLoadedRgGid = null;
    let cachedRgGid = null;
    let cachedReleases = [];

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function wsFetchJson(url) {
        const task = wsQueue.then(async function () {
            const elapsed = Date.now() - lastWsRequestAt;
            if (elapsed < WS_MIN_INTERVAL_MS) {
                await sleep(WS_MIN_INTERVAL_MS - elapsed);
            }

            lastWsRequestAt = Date.now();

            const response = await fetch(url, {
                headers: { Accept: 'application/json' },
                credentials: 'same-origin',
            });

            if (!response.ok) {
                throw new Error('HTTP ' + response.status);
            }

            return response.json();
        });

        wsQueue = task.catch(function () {});
        return task;
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, function (char) {
            return {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;',
            }[char];
        });
    }

    function injectStyles() {
        if (document.getElementById('cfr-styles')) return;

        const style = document.createElement('style');
        style.id = 'cfr-styles';
        style.textContent = `
            #cfr-widget {
                margin: 12px 0 0;
                padding: 9px 10px;
                border: 1px solid rgba(127,127,127,.32);
                border-radius: 4px;
                background: rgba(127,127,127,.045);
                color: inherit;
                font-size: 13px;
                clear: both;
            }

            #cfr-widget * {
                box-sizing: border-box;
            }

            #cfr-widget .cfr-title {
                margin-bottom: 7px;
                font-weight: bold;
            }

            #cfr-widget .cfr-rg-header {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 5px;
            }

            #cfr-widget .cfr-rg-title {
                font-weight: bold;
                font-size: 12px;
            }

            #cfr-widget .cfr-rg-state {
                opacity: .68;
                font-size: 12px;
            }

            #cfr-refresh {
                margin-left: auto;
            }

            #cfr-suggestions {
                display: none;
                margin-bottom: 9px;
            }

            #cfr-suggestions.cfr-visible {
                display: block;
            }

            #cfr-suggestion-list {
                display: grid;
                gap: 3px;
                max-height: 290px;
                overflow: auto;
            }

            #cfr-widget .cfr-release {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 5px 6px;
                border: 1px solid rgba(127,127,127,.22);
                border-radius: 3px;
                background: rgba(127,127,127,.025);
            }

            #cfr-widget .cfr-release-info {
                min-width: 0;
                flex: 1 1 auto;
            }

            #cfr-widget .cfr-release-title {
                font-weight: bold;
                line-height: 1.3;
            }

            #cfr-widget .cfr-release-meta {
                margin-top: 1px;
                opacity: .72;
                font-size: 11px;
                line-height: 1.35;
            }

            #cfr-widget .cfr-layout {
                flex: 0 0 auto;
                font-size: 11px;
                white-space: nowrap;
                opacity: .72;
            }

            #cfr-widget .cfr-layout.cfr-same {
                opacity: 1;
            }

            #cfr-widget .cfr-copy-button {
                flex: 0 0 auto;
                margin: 0;
                white-space: nowrap;
            }

            #cfr-widget .cfr-manual {
                display: flex;
                align-items: center;
                gap: 6px;
                flex-wrap: wrap;
                padding-top: 8px;
                border-top: 1px solid rgba(127,127,127,.18);
            }

            #cfr-input {
                flex: 1 1 420px;
                min-width: 220px;
            }

            #cfr-target-chooser {
                display: none;
                margin-top: 8px;
            }

            #cfr-target-chooser.cfr-visible {
                display: block;
            }

            #cfr-widget .cfr-target-title {
                margin-bottom: 4px;
                font-weight: bold;
                font-size: 12px;
            }

            #cfr-widget .cfr-target-button {
                display: block;
                width: 100%;
                margin: 0 0 3px;
                text-align: left;
            }

            #cfr-status {
                min-height: 18px;
                margin-top: 6px;
                opacity: .78;
            }

            #cfr-status.cfr-error {
                color: #a40000;
                opacity: 1;
            }

            #cfr-status.cfr-success {
                color: #087a08;
                opacity: 1;
            }

            @media (prefers-color-scheme: dark) {
                #cfr-widget {
                    border-color: rgba(220,220,220,.25);
                    background: rgba(255,255,255,.025);
                }

                #cfr-widget .cfr-release {
                    border-color: rgba(220,220,220,.16);
                    background: rgba(255,255,255,.02);
                }

                #cfr-widget .cfr-manual {
                    border-top-color: rgba(220,220,220,.14);
                }

                #cfr-status.cfr-error {
                    color: #ff9b9b;
                }

                #cfr-status.cfr-success {
                    color: #8fd58f;
                }
            }

            @media (max-width: 720px) {
                #cfr-widget .cfr-release {
                    align-items: flex-start;
                    flex-wrap: wrap;
                }

                #cfr-widget .cfr-release-info {
                    flex-basis: calc(100% - 95px);
                }

                #cfr-widget .cfr-layout {
                    margin-left: 0;
                }
            }
        `;

        document.head.appendChild(style);
    }

    function injectUI() {
        if (document.getElementById('cfr-widget')) return;

        const anchor = document.querySelector('.changes');
        if (!anchor) return;

        injectStyles();

        const wrapper = document.createElement('div');
        wrapper.id = 'cfr-widget';
        wrapper.innerHTML = `
            <div class="cfr-title">Copy recordings from another release or medium</div>

            <div id="cfr-suggestions">
                <div class="cfr-rg-header">
                    <span id="cfr-rg-title" class="cfr-rg-title">Releases in this release group</span>
                    <span id="cfr-rg-state" class="cfr-rg-state"></span>
                    <button id="cfr-refresh" class="styled-button" type="button">Refresh</button>
                </div>
                <div id="cfr-suggestion-list"></div>
            </div>

            <div class="cfr-manual">
                <input id="cfr-input" type="text" placeholder="Paste a release/medium MBID or URL…" autocomplete="off">
                <button id="cfr-btn" class="styled-button" type="button">Apply</button>
            </div>

            <div id="cfr-target-chooser"></div>
            <div id="cfr-status" role="status" aria-live="polite"></div>
        `;

        anchor.appendChild(wrapper);

        wrapper.querySelector('#cfr-btn').addEventListener('click', onApplyFromInput);
        wrapper.querySelector('#cfr-input').addEventListener('keydown', function (event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                onApplyFromInput();
            }
        });

        wrapper.querySelector('#cfr-refresh').addEventListener('click', function () {
            loadRGSuggestions(true);
        });

        setupReleaseGroupWatcher();
    }

    function currentEditedReleaseMbid() {
        const match = location.pathname.match(EDIT_RELEASE_RE);
        return match ? match[1].toLowerCase() : null;
    }

    function getTargetLayout() {
        const vm = getReleaseEditorVM();
        if (!vm) return [];

        const release = vm.rootField.release();
        if (!release) return [];

        return release.mediums().map(function (medium) {
            return medium.tracks().length;
        });
    }

    function getSourceLayout(release) {
        return (release.media || []).map(function (medium) {
            return Number(medium['track-count'] || 0);
        });
    }

    function layoutsEqual(a, b) {
        return a.length === b.length && a.every(function (value, index) {
            return value === b[index];
        });
    }

    function formatLayout(layout) {
        return layout.filter(Boolean).join(' + ');
    }

    function setupReleaseGroupWatcher() {
        const vm = getReleaseEditorVM();
        if (!vm) {
            setTimeout(setupReleaseGroupWatcher, 250);
            return;
        }

        const release = vm.rootField.release();
        if (!release || typeof release.releaseGroup !== 'function') {
            setTimeout(setupReleaseGroupWatcher, 250);
            return;
        }

        if (release === watchedRelease) {
            if (!lastLoadedRgGid) loadRGSuggestions(false);
            return;
        }

        if (releaseGroupSubscription && typeof releaseGroupSubscription.dispose === 'function') {
            releaseGroupSubscription.dispose();
        }

        watchedRelease = release;
        releaseGroupSubscription = release.releaseGroup.subscribe(function (newRg) {
            const newGid = newRg && newRg.gid ? newRg.gid : null;
            if (newGid !== lastLoadedRgGid) {
                loadRGSuggestions(false);
            }
        });

        loadRGSuggestions(false);
    }

    function getCurrentReleaseGroupGid() {
        const vm = getReleaseEditorVM();
        if (!vm) return null;

        const release = vm.rootField.release();
        if (!release || typeof release.releaseGroup !== 'function') return null;

        const rg = release.releaseGroup();
        return rg && rg.gid ? rg.gid : null;
    }

    function clearSuggestions(message) {
        const section = document.getElementById('cfr-suggestions');
        const list = document.getElementById('cfr-suggestion-list');
        const title = document.getElementById('cfr-rg-title');
        const state = document.getElementById('cfr-rg-state');

        if (list) list.innerHTML = '';
        if (title) title.textContent = 'Releases in this release group';
        if (state) state.textContent = message || '';
        if (section) section.classList.remove('cfr-visible');
    }

    async function loadRGSuggestions(force) {
        const rgGid = getCurrentReleaseGroupGid();

        if (!rgGid) {
            lastLoadedRgGid = null;
            cachedRgGid = null;
            cachedReleases = [];
            clearSuggestions();
            return;
        }

        if (!force && rgGid === lastLoadedRgGid) {
            if (cachedRgGid === rgGid) {
                showSuggestionResults(cachedReleases);
            }
            return;
        }

        lastLoadedRgGid = rgGid;
        const requestId = ++suggestionRequestId;

        const section = document.getElementById('cfr-suggestions');
        const list = document.getElementById('cfr-suggestion-list');
        const title = document.getElementById('cfr-rg-title');
        const state = document.getElementById('cfr-rg-state');
        const refresh = document.getElementById('cfr-refresh');

        if (!section || !list || !title || !state || !refresh) return;

        section.classList.add('cfr-visible');
        list.innerHTML = '';
        title.textContent = 'Releases in this release group';
        state.textContent = 'Loading…';
        refresh.disabled = true;

        try {
            const releases = [];
            const seen = new Set();
            let offset = 0;
            let total = null;

            while (total === null || offset < total) {
                if (requestId !== suggestionRequestId) return;

                const url = '/ws/2/release?release-group=' + encodeURIComponent(rgGid) +
                    '&inc=artist-credits+media+labels+release-groups&fmt=json&limit=100&offset=' + offset;

                const data = await wsFetchJson(url);
                if (requestId !== suggestionRequestId) return;

                const page = data.releases || [];
                if (total === null) {
                    total = Number(data['release-count'] ?? page.length);
                }

                for (const release of page) {
                    if (release.id && !seen.has(release.id)) {
                        seen.add(release.id);
                        releases.push(release);
                    }
                }

                offset += page.length;
                state.textContent = total > page.length
                    ? Math.min(offset, total) + ' / ' + total
                    : 'Loading…';

                if (!page.length) break;
            }

            if (requestId !== suggestionRequestId) return;

            const currentMbid = currentEditedReleaseMbid();
            const filtered = currentMbid
                ? releases.filter(function (release) {
                    return String(release.id || '').toLowerCase() !== currentMbid;
                })
                : releases;

            cachedRgGid = rgGid;
            cachedReleases = filtered;
            showSuggestionResults(filtered);
        } catch (error) {
            if (requestId !== suggestionRequestId) return;
            console.warn('[CFR] RG fetch failed:', error);
            list.innerHTML = '';
            state.textContent = 'Could not load releases.';
        } finally {
            if (requestId === suggestionRequestId) {
                refresh.disabled = false;
            }
        }
    }

    function showSuggestionResults(releases) {
        const section = document.getElementById('cfr-suggestions');
        const title = document.getElementById('cfr-rg-title');
        const state = document.getElementById('cfr-rg-state');

        if (section) section.classList.add('cfr-visible');
        if (title) title.textContent = 'Releases in this release group (' + releases.length + ')';
        if (state) state.textContent = '';
        renderSuggestions(releases);
    }

    function releaseMeta(release) {
        const media = release.media || [];
        const formats = [];
        const trackCounts = [];

        for (const medium of media) {
            if (medium.format) formats.push(medium.format);
            if (medium['track-count']) trackCounts.push(medium['track-count']);
        }

        const formatStr = formats.length ? formats.join(' + ') : '';
        const trackStr = trackCounts.length ? trackCounts.join(' + ') + ' tracks' : '';

        const events = release['release-events'] || [];
        const dates = events.map(function (event) { return event.date; }).filter(Boolean);
        const countries = [];

        for (const event of events) {
            const codes = event.area && event.area['iso-3166-1-codes'];
            if (codes) {
                for (const code of codes) countries.push(code);
            }
        }

        const labelBits = [];
        for (const info of (release['label-info'] || [])) {
            const name = info.label && info.label.name ? info.label.name : '';
            const cat = info['catalog-number'] || '';
            const bit = [name, cat].filter(Boolean).join(' ');
            if (bit) labelBits.push(bit);
        }

        return [
            formatStr,
            trackStr,
            dates[0] || '',
            [...new Set(countries)].join(', '),
            [...new Set(labelBits)].join(' / '),
        ].filter(Boolean).join(' · ');
    }

    function renderSuggestions(releases) {
        const list = document.getElementById('cfr-suggestion-list');
        if (!list) return;

        list.innerHTML = '';

        if (!releases.length) {
            list.textContent = 'No other releases found.';
            return;
        }

        const targetLayout = getTargetLayout();

        for (const release of releases) {
            const sourceLayout = getSourceLayout(release);
            const sameLayout = targetLayout.length > 0 && layoutsEqual(sourceLayout, targetLayout);

            const row = document.createElement('div');
            row.className = 'cfr-release';

            const info = document.createElement('div');
            info.className = 'cfr-release-info';
            info.innerHTML =
                '<div class="cfr-release-title">' + escapeHtml(release.title || '(untitled)') + '</div>' +
                '<div class="cfr-release-meta">' + escapeHtml(releaseMeta(release)) + '</div>';

            const layout = document.createElement('span');
            layout.className = 'cfr-layout' + (sameLayout ? ' cfr-same' : '');
            layout.textContent = sameLayout
                ? 'same layout'
                : (formatLayout(sourceLayout) ? formatLayout(sourceLayout) : 'different layout');

            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'styled-button cfr-copy-button';
            button.textContent = 'Copy recordings';
            button.addEventListener('click', function () {
                applyFromMBID(release.id);
            });

            row.appendChild(info);
            row.appendChild(layout);
            row.appendChild(button);
            list.appendChild(row);
        }
    }

    function onApplyFromInput() {
        clearTargetChooser();

        const input = document.getElementById('cfr-input');
        const raw = input ? input.value.trim() : '';

        if (!raw) {
            setStatus('Paste a release or medium MBID or URL.', 'error');
            return;
        }

        const mediumMatch = raw.match(MEDIUM_URL_RE);
        if (mediumMatch) {
            resolveMediumAndApply(mediumMatch[1]);
            return;
        }

        const discMatch = raw.match(RELEASE_DISC_RE);
        if (discMatch) {
            applyFromMBID(discMatch[1], parseInt(discMatch[2], 10));
            return;
        }

        const match = raw.match(MBID_RE);
        if (!match) {
            setStatus('Could not find a valid MBID in the input.', 'error');
            return;
        }

        applyFromMBID(match[0]);
    }

    function resolveMediumAndApply(mediumMbid) {
        setStatus('Resolving medium…');

        fetch('/medium/' + mediumMbid, { redirect: 'follow' })
            .then(function (response) {
                if (!response.ok) throw new Error('HTTP ' + response.status);

                const finalUrl = response.url || '';
                const discMatch = finalUrl.match(RELEASE_DISC_RE);

                if (discMatch) {
                    return {
                        releaseMbid: discMatch[1],
                        mediumPos: parseInt(discMatch[2], 10),
                    };
                }

                const releaseMatch = finalUrl.match(/\/release\/([0-9a-f-]{36})/i);
                if (!releaseMatch) {
                    throw new Error('Could not resolve medium to a release.');
                }

                const fragmentMatch = finalUrl.match(/#disc(\d+)/i);
                return {
                    releaseMbid: releaseMatch[1],
                    mediumPos: fragmentMatch ? parseInt(fragmentMatch[1], 10) : 1,
                };
            })
            .then(function (info) {
                applyFromMBID(info.releaseMbid, info.mediumPos);
            })
            .catch(function (error) {
                setStatus('Error resolving medium: ' + error.message, 'error');
            });
    }

    function applyFromMBID(mbid, sourceMediumPos) {
        setStatus('Fetching release…');

        const url = '/ws/2/release/' + mbid + '?inc=recordings+artist-credits&fmt=json';

        wsFetchJson(url)
            .then(function (data) {
                if (sourceMediumPos) {
                    applyRecordingsFromMedium(data, sourceMediumPos);
                } else {
                    applyRecordings(data);
                }
            })
            .catch(function (error) {
                setStatus('Error fetching release: ' + error.message, 'error');
            });
    }

    function setStatus(message, kind) {
        const element = document.getElementById('cfr-status');
        if (!element) return;

        element.className = '';
        if (kind) element.classList.add('cfr-' + kind);
        element.textContent = message || '';
    }

    function clearTargetChooser() {
        const chooser = document.getElementById('cfr-target-chooser');
        if (!chooser) return;

        chooser.classList.remove('cfr-visible');
        chooser.innerHTML = '';
    }

    function buildRecordingEntity(recData) {
        const names = (recData['artist-credit'] || [])
            .filter(function (credit) {
                return credit && typeof credit === 'object' && credit.artist;
            })
            .map(function (credit) {
                return {
                    name: credit.name || credit.artist.name || '',
                    joinPhrase: credit.joinphrase || '',
                    artist: {
                        gid: credit.artist.id,
                        name: credit.artist.name || '',
                        sortName: credit.artist['sort-name'] || '',
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
        let applied = 0;
        let skipped = 0;
        let notFound = 0;

        tracks.forEach(function (track) {
            const recData = trackMapByPos.get(track.position());

            if (!recData) {
                notFound += 1;
                return;
            }

            if (
                track.hasExistingRecording() &&
                track.recording() &&
                track.recording().gid === recData.id
            ) {
                skipped += 1;
                return;
            }

            try {
                track.recording(buildRecordingEntity(recData));
                applied += 1;
            } catch (error) {
                console.error('[CFR] Error on track', track.position(), error);
                notFound += 1;
            }
        });

        return { applied: applied, skipped: skipped, notFound: notFound };
    }

    function reportResult(result, suffix) {
        const message =
            'Done: ' + result.applied + ' applied, ' +
            result.skipped + ' already set, ' +
            result.notFound + ' not matched' +
            (suffix ? ' ' + suffix : '') + '.';

        setStatus(message, result.applied > 0 ? 'success' : '');
    }

    function applyRecordings(releaseData) {
        const trackMap = new Map();

        (releaseData.media || []).forEach(function (medium) {
            const mediumPos = medium.position;

            (medium.tracks || []).forEach(function (track) {
                if (track.recording) {
                    trackMap.set(mediumPos + ':' + track.position, track.recording);
                }
            });
        });

        if (!trackMap.size) {
            setStatus('No recordings found in that release.', 'error');
            return;
        }

        const vm = getReleaseEditorVM();
        if (!vm) {
            setStatus('Could not access the release editor.', 'error');
            return;
        }

        const release = vm.rootField.release();
        if (!release) {
            setStatus('No release loaded in editor.', 'error');
            return;
        }

        const total = { applied: 0, skipped: 0, notFound: 0 };

        release.mediums().forEach(function (medium) {
            const mediumPos = medium.position();
            const perMedium = new Map();

            trackMap.forEach(function (recording, key) {
                const parts = key.split(':');
                if (parseInt(parts[0], 10) === mediumPos) {
                    perMedium.set(parseInt(parts[1], 10), recording);
                }
            });

            const result = assignToTracks(medium.tracks(), perMedium);
            total.applied += result.applied;
            total.skipped += result.skipped;
            total.notFound += result.notFound;
        });

        reportResult(total);
    }

    function applyRecordingsFromMedium(releaseData, sourceMediumPos) {
        const sourceMedium = (releaseData.media || []).find(function (medium) {
            return medium.position === sourceMediumPos;
        });

        if (!sourceMedium) {
            setStatus('Medium ' + sourceMediumPos + ' not found on that release.', 'error');
            return;
        }

        const trackMap = new Map();
        (sourceMedium.tracks || []).forEach(function (track) {
            if (track.recording) {
                trackMap.set(track.position, track.recording);
            }
        });

        if (!trackMap.size) {
            setStatus('No recordings found on that medium.', 'error');
            return;
        }

        const vm = getReleaseEditorVM();
        if (!vm) {
            setStatus('Could not access the release editor.', 'error');
            return;
        }

        const release = vm.rootField.release();
        if (!release) {
            setStatus('No release loaded in editor.', 'error');
            return;
        }

        const targetMediums = release.mediums();
        const sourceLabel =
            'medium ' + sourceMediumPos +
            (sourceMedium.title ? ' “' + sourceMedium.title + '”' : '') +
            ' (' + trackMap.size + ' tracks)';

        if (targetMediums.length === 1) {
            reportResult(
                assignToTracks(targetMediums[0].tracks(), trackMap),
                'from source ' + sourceLabel
            );
            return;
        }

        const matching = targetMediums.filter(function (medium) {
            return medium.tracks().length === trackMap.size;
        });

        if (matching.length === 1) {
            const result = assignToTracks(matching[0].tracks(), trackMap);
            reportResult(
                result,
                'from source ' + sourceLabel + ' → target medium ' + matching[0].position()
            );
            return;
        }

        renderTargetChooser(targetMediums, trackMap, sourceLabel);
    }

    function renderTargetChooser(targetMediums, trackMap, sourceLabel) {
        const chooser = document.getElementById('cfr-target-chooser');
        if (!chooser) return;

        chooser.innerHTML =
            '<div class="cfr-target-title">Source ' + escapeHtml(sourceLabel) +
            ' — apply to which medium of this release?</div>';

        targetMediums.forEach(function (medium) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'styled-button cfr-target-button';

            const name = medium.name && medium.name() ? ' “' + medium.name() + '”' : '';
            button.textContent =
                'Medium ' + medium.position() + name + ' · ' + medium.tracks().length + ' tracks';

            button.addEventListener('click', function () {
                clearTargetChooser();
                reportResult(
                    assignToTracks(medium.tracks(), trackMap),
                    'from source ' + sourceLabel + ' → target medium ' + medium.position()
                );
            });

            chooser.appendChild(button);
        });

        chooser.classList.add('cfr-visible');
        setStatus('Choose a target medium above.');
    }

    function getReleaseEditorVM() {
        try {
            if (window.MB && window.MB.releaseEditor && window.MB.releaseEditor.rootField) {
                return window.MB.releaseEditor;
            }

            if (window.MB && window.MB._releaseEditor && window.MB._releaseEditor.rootField) {
                return window.MB._releaseEditor;
            }

            const changesDiv = document.querySelector('.changes[data-bind]');
            if (changesDiv && window.ko) {
                const context = ko.contextFor(changesDiv);

                if (context && context.$root && context.$root.rootField) {
                    return context.$root;
                }

                if (context && context.$parents) {
                    for (let i = 0; i < context.$parents.length; i += 1) {
                        if (context.$parents[i] && context.$parents[i].rootField) {
                            return context.$parents[i];
                        }
                    }
                }
            }
        } catch (error) {
            console.error('[CFR] getReleaseEditorVM error:', error);
        }

        return null;
    }

    const observer = new MutationObserver(function () {
        if (!document.getElementById('cfr-widget')) {
            injectUI();
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    injectUI();
})();
