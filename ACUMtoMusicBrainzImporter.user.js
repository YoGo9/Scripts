// ==UserScript==
// @name        ACUM to MusicBrainz Importer
// @namespace   http://tampermonkey.net/
// @downloadURL https://github.com/YoGo9/Scripts/raw/main/ACUMtoMusicBrainzImporter.user.js
// @updateURL   https://github.com/YoGo9/Scripts/raw/main/ACUMtoMusicBrainzImporter.user.js
// @version     1.2
// @tag         ai-created
// @description Add MusicBrainz import buttons to ACUM album pages
// @author      YoGo9
// @license     MIT
// @match       https://nocs.acum.org.il/acumsitesearchdb/album*
// @grant       none
// @run-at      document-end
// ==/UserScript==

(function() {
    'use strict';

    function getAlbumId() {
        const params = new URLSearchParams(window.location.search);
        return params.get('albumid');
    }

    async function fetchAlbumData(albumId) {
        const api = 'https://nocs.acum.org.il/acumsitesearchdb/getalbuminfo?albumId=' + albumId;
        try {
            const res = await fetch(api);
            const json = await res.json();
            if (json.errorCode !== 0) {
                throw new Error(json.errorDescription);
            }
            return json.data.albumBean;
        } catch (error) {
            console.error('Failed to fetch album data:', error);
            return null;
        }
    }

    function durationMs(timeStr) {
        if (!timeStr) return 0;
        const parts = timeStr.split(':').map(Number);
        return parts[0] * 60 * 1000 + parts[1] * 1000;
    }

    function swapHebrewName(hebrewName) {
        if (!hebrewName) return '';
        const parts = hebrewName.trim().split(' ');
        if (parts.length >= 2) {
            return parts.reverse().join(' ');
        }
        return hebrewName;
    }

    function createImportForm(album, mediumIndex) {
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = 'https://musicbrainz.org/release/add';
        form.target = '_blank';
        form.style.display = 'none';

        function add(name, val) {
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = name;
            input.value = val || '';
            form.appendChild(input);
        }

        console.log('All album versions:', album.versions);
        console.log('Requested medium index:', mediumIndex);
        console.log('Version at index:', album.versions[mediumIndex]);

        add('name', album.title);
        add('type', 'album');
        add('script', 'Hebr');
        add('status', 'official');

        const originalName = album.performer ? album.performer.performerHebName : '';
        const swappedName = swapHebrewName(originalName);
        add('artist_credit.names.0.name', swappedName);

        add('urls.0.url', window.location.href);
        add('edit_note', 'Imported from ACUM: ' + window.location.href);

        const version = album.versions[mediumIndex];

        if (version && version.release_date) {
            const dateParts = version.release_date.split('/');
            if (dateParts.length === 2) {
                const month = dateParts[0];
                const year = dateParts[1];
                if (year && year.length === 4) {
                    add('events.0.date.year', year);
                }
                if (month && month.length <= 2) {
                    add('events.0.date.month', month);
                }
            }
        }

        add('events.0.country', 'IL');

        if (version) {
            add('labels.0.name', version.publisherHebName || '');
            add('labels.0.catalog_number', version.catalog_id || '');

            const selectedMedium = version.media ? version.media.toUpperCase() : 'CD';
            let format = 'CD';

            if (selectedMedium === 'CD') format = 'CD';
            else if (selectedMedium === 'MC') format = 'Cassette';
            else if (selectedMedium === 'LP') format = '12" Vinyl';
            else if (selectedMedium === 'DVD') format = 'DVD';
            else if (selectedMedium === 'DIGITAL') format = 'Digital Media';

            add('mediums.0.format', format);
        }

        if (album.tracks) {
            album.tracks.forEach(function(track, tIdx) {
                add('mediums.0.track.' + tIdx + '.name', track.workHebName || '');
                add('mediums.0.track.' + tIdx + '.length', durationMs(track.time));
                add('mediums.0.track.' + tIdx + '.number', track.albumTrackNumber || (tIdx + 1));
            });
        }

        return form;
    }

function addImportColumn(album) {
    const table = document.querySelector('table');
    if (!table) {
        console.log('No table found');
        return;
    }

    const headerRow = table.querySelector('tr:first-child');
    if (headerRow) {
        const importHeader = document.createElement('th');
        importHeader.innerHTML = 'Import to<br>MusicBrainz';
        importHeader.style.cssText = 'background: rgb(74, 144, 226); color: white; padding: 8px; text-align: center; font-weight: bold; writing-mode: vertical-rl; text-orientation: mixed; width: 50px;';
        headerRow.appendChild(importHeader);
    }

    // Get ALL rows, skip first (header)
    const allRows = Array.from(table.querySelectorAll('tr'));
    const dataRows = allRows.slice(1); // Skip header row

    console.log('Total rows found:', allRows.length);
    console.log('Data rows after skipping header:', dataRows.length);
    console.log('Album has', album.versions.length, 'versions');

    // Add button for each version up to the number of data rows available
    const maxButtons = Math.min(dataRows.length, album.versions.length);

    for (let i = 0; i < maxButtons; i++) {
        const row = dataRows[i];
        if (row && row.cells) {
            const importCell = document.createElement('td');
            importCell.style.cssText = 'text-align: center; padding: 8px; background: #f8f9fa; vertical-align: middle;';

            const importButton = document.createElement('button');
            importButton.textContent = '📤';
            importButton.title = 'Import ' + (album.versions[i] ? album.versions[i].media : 'medium') + ' to MusicBrainz';
            importButton.style.cssText = 'background: #4a90e2; color: white; border: none; padding: 8px; border-radius: 4px; cursor: pointer; font-size: 16px; width: 35px; height: 35px;';

            const mediumIndex = i;
            importButton.onclick = function() {
                console.log('Importing medium index:', mediumIndex);
                console.log('Version data:', album.versions[mediumIndex]);
                const form = createImportForm(album, mediumIndex);
                document.body.appendChild(form);
                form.submit();
                document.body.removeChild(form);
            };

            importCell.appendChild(importButton);
            row.appendChild(importCell);
        }
    }

    console.log('Added import buttons for', maxButtons, 'mediums');
}

    async function init() {
        const albumId = getAlbumId();
        if (!albumId) return;

        console.log('ACUM MusicBrainz Importer: Loading album', albumId);

        try {
            const album = await fetchAlbumData(albumId);
            if (album) {
                console.log('Album data loaded:', album.title);
                addImportColumn(album);
            }
        } catch (error) {
            console.error('ACUM Importer Error:', error);
        }
    }

    function waitForContent() {
        const table = document.querySelector('table');
        if (table) {
            setTimeout(init, 500);
        } else {
            setTimeout(waitForContent, 1000);
        }
    }

    console.log('ACUM Importer: Script loaded');
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', waitForContent);
    } else {
        waitForContent();
    }

})();
