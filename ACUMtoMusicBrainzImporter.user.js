// ==UserScript==
// @name        ACUM to MusicBrainz Importer
// @namespace   http://tampermonkey.net/
// @downloadURL https://github.com/YoGo9/Scripts/raw/main/ACUMtoMusicBrainzImporter.user.js
// @updateURL   https://github.com/YoGo9/Scripts/raw/main/ACUMtoMusicBrainzImporter.user.js
// @version     1.0
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
        const api = `https://nocs.acum.org.il/acumsitesearchdb/getalbuminfo?albumId=${albumId}`;
        try {
            const res = await fetch(api);
            const json = await res.json();
            if (json.errorCode !== 0) throw new Error(json.errorDescription);
            return json.data.albumBean;
        } catch (error) {
            console.error('Failed to fetch album data:', error);
            return null;
        }
    }

    function durationMs(timeStr) {
        if (!timeStr) return 0;
        const [m, s] = timeStr.split(':').map(Number);
        return m * 60 * 1000 + s * 1000;
    }

    function swapHebrewName(hebrewName) {
        if (!hebrewName) return '';
        
        // Split by space and reverse the order (assuming format is "LastName FirstName")
        const parts = hebrewName.trim().split(' ');
        if (parts.length >= 2) {
            // Reverse: Fname and Lname
            return parts.reverse().join(' ');
        }
        return hebrewName; // Return as-is if only one word
    }

    function createImportForm(album, mediumIndex = 0) {
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = 'https://musicbrainz.org/release/add';
        form.target = '_blank';
        form.style.display = 'none';

        const add = (name, val) => {
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = name;
            input.value = val || '';
            form.appendChild(input);
        };

        add('name', album.title);
        add('type', 'album');
        add('script', 'Hebr');
        add('status', 'official');
        
        // Swap Hebrew name from "LastName FirstName" to "FirstName LastName"
        const originalName = album.performer?.performerHebName || '';
        const swappedName = swapHebrewName(originalName);
        console.log('Artist name:', originalName, '->', swappedName);
        add('artist_credit.names.0.name', swappedName);
        
        add('urls.0.url', window.location.href);
        add('edit_note', 'Imported from ACUM: ' + window.location.href);

        const version = album.versions[mediumIndex];
        console.log('Using version data:', version);
        
        if (version && version.release_date) {
            // Handle MM/YYYY format
            const dateParts = version.release_date.split('/');
            if (dateParts.length === 2) {
                const [month, year] = dateParts;
                if (year && year.length === 4) {
                    add('events.0.date.year', year);
                    console.log('Set year:', year);
                }
                if (month && month.length <= 2) {
                    add('events.0.date.month', month);
                    console.log('Set month:', month);
                }
            }
        } else {
            console.log('No release date found for medium', mediumIndex);
        }
        
        add('events.0.country', 'IL');
        
        if (version) {
            add('labels.0.name', version.publisherHebName || '');
            add('labels.0.catalog_number', version.catalog_id || '');

            // Fix medium format mapping
            const selectedMedium = version.media?.toUpperCase() || 'CD';
            let format = 'CD'; // default
            
            if (selectedMedium === 'CD') format = 'CD';
            else if (selectedMedium === 'MC') format = 'Cassette';
            else if (selectedMedium === 'LP') format = '12" Vinyl';
            else if (selectedMedium === 'DVD') format = 'DVD';
            else if (selectedMedium === 'DIGITAL') format = 'Digital Media';
            
            add('mediums.0.format', format);
            console.log('Set medium format:', selectedMedium, '->', format);
        }

        if (album.tracks) {
            album.tracks.forEach((track, tIdx) => {
                add(`mediums.0.track.${tIdx}.name`, track.workHebName || '');
                add(`mediums.0.track.${tIdx}.length`, durationMs(track.time));
                add(`mediums.0.track.${tIdx}.number`, track.albumTrackNumber || (tIdx + 1));
            });
            console.log('Added', album.tracks.length, 'tracks');
        }

        return form;
    }

    function addImportColumn(album) {
        // Find the table
        const table = document.querySelector('.table_big_header, table');
        if (!table) {
            console.log('No table found');
            return;
        }

        // Add header for import column
        const headerRow = table.querySelector('thead tr, .table_big_header');
        if (headerRow) {
            const importHeader = document.createElement('th');
            importHeader.innerHTML = 'Import to<br>MusicBrainz';
            importHeader.style.cssText = `
                background: rgb(74, 144, 226);
                color: white;
                padding: 8px;
                text-align: center;
                font-weight: bold;
                writing-mode: vertical-rl;
                text-orientation: mixed;
                width: 50px;
            `;
            headerRow.appendChild(importHeader);
        }

        // Find all data rows and add import buttons
        const dataRows = table.querySelectorAll('tr:not(.table_big_header):not(thead tr)');
        let validRowIndex = 0; // Track only rows with actual data

        dataRows.forEach((row, rowIndex) => {
            // Check if this row has medium data (has multiple cells and content)
            if (row.cells && row.cells.length >= 4) {
                // Check if row has actual content (not empty cells)
                const hasContent = Array.from(row.cells).some(cell => 
                    cell.textContent && cell.textContent.trim() !== ''
                );
                
                if (hasContent && validRowIndex < album.versions.length) {
                    const importCell = document.createElement('td');
                    importCell.style.cssText = `
                        text-align: center;
                        padding: 8px;
                        background: #f8f9fa;
                        vertical-align: middle;
                    `;

                    const importButton = document.createElement('button');
                    importButton.textContent = '📤';
                    importButton.title = `Import medium ${validRowIndex + 1} (${album.versions[validRowIndex]?.media || 'Unknown'}) to MusicBrainz`;
                    importButton.style.cssText = `
                        background: #4a90e2;
                        color: white;
                        border: none;
                        padding: 8px;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 16px;
                        width: 35px;
                        height: 35px;
                    `;

                    // Capture the current validRowIndex in closure
                    const mediumIndex = validRowIndex;
                    importButton.onclick = () => {
                        console.log('Importing medium index:', mediumIndex, 'Version data:', album.versions[mediumIndex]);
                        const form = createImportForm(album, mediumIndex);
                        document.body.appendChild(form);
                        form.submit();
                        document.body.removeChild(form);
                    };

                    importCell.appendChild(importButton);
                    row.appendChild(importCell);
                    validRowIndex++;
                }
            }
        });

        console.log('Added import buttons for', validRowIndex, 'valid rows');
    }

    async function init() {
        const albumId = getAlbumId();
        if (!albumId) return;

        console.log('ACUM MusicBrainz Importer: Loading album', albumId);

        try {
            const album = await fetchAlbumData(albumId);
            if (album) {
                console.log('Album data loaded:', album.title);
                console.log('Album versions:', album.versions);
                addImportColumn(album);
            }
        } catch (error) {
            console.error('ACUM Importer Error:', error);
        }
    }

    // Wait for Angular to load the content
    function waitForContent() {
        const table = document.querySelector('table, .table_big_header');
        if (table) {
            setTimeout(init, 500);
        } else {
            setTimeout(waitForContent, 1000);
        }
    }

    // Start checking for content
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', waitForContent);
    } else {
        waitForContent();
    }
})();
        add('urls.0.url', window.location.href);
        add('edit_note', 'Imported from ACUM: ' + window.location.href);

        const version = album.versions[mediumIndex];
        console.log('Using version data:', version);
        
        if (version && version.release_date) {
            // Handle MM/YYYY format
            const dateParts = version.release_date.split('/');
            if (dateParts.length === 2) {
                const [month, year] = dateParts;
                if (year && year.length === 4) {
                    add('events.0.date.year', year);
                    console.log('Set year:', year);
                }
                if (month && month.length <= 2) {
                    add('events.0.date.month', month);
                    console.log('Set month:', month);
                }
            }
        } else {
            console.log('No release date found for medium', mediumIndex);
        }
        
        add('events.0.country', 'IL');
        
        if (version) {
            add('labels.0.name', version.publisherHebName || '');
            add('labels.0.catalog_number', version.catalog_id || '');

            // Fix medium format mapping
            const selectedMedium = version.media?.toUpperCase() || 'CD';
            let format = 'CD'; // default
            
            if (selectedMedium === 'CD') format = 'CD';
            else if (selectedMedium === 'MC') format = 'Cassette';
            else if (selectedMedium === 'LP') format = '12" Vinyl';
            else if (selectedMedium === 'DVD') format = 'DVD';
            else if (selectedMedium === 'DIGITAL') format = 'Digital Media';
            
            add('mediums.0.format', format);
            console.log('Set medium format:', selectedMedium, '->', format);
        }

        if (album.tracks) {
            album.tracks.forEach((track, tIdx) => {
                add(`mediums.0.track.${tIdx}.name`, track.workHebName || '');
                add(`mediums.0.track.${tIdx}.length`, durationMs(track.time));
                add(`mediums.0.track.${tIdx}.number`, track.albumTrackNumber || (tIdx + 1));
            });
            console.log('Added', album.tracks.length, 'tracks');
        }

        return form;
    }

    function addImportColumn(album) {
        // Find the table
        const table = document.querySelector('.table_big_header, table');
        if (!table) {
            console.log('No table found');
            return;
        }

        // Add header for import column
        const headerRow = table.querySelector('thead tr, .table_big_header');
        if (headerRow) {
            const importHeader = document.createElement('th');
            importHeader.innerHTML = 'Import to<br>MusicBrainz';
            importHeader.style.cssText = `
                background: rgb(74, 144, 226);
                color: white;
                padding: 8px;
                text-align: center;
                font-weight: bold;
                writing-mode: vertical-rl;
                text-orientation: mixed;
                width: 50px;
            `;
            headerRow.appendChild(importHeader);
        }

        // Find all data rows and add import buttons
        const dataRows = table.querySelectorAll('tr:not(.table_big_header):not(thead tr)');
        let validRowIndex = 0; // Track only rows with actual data

        dataRows.forEach((row, rowIndex) => {
            // Check if this row has medium data (has multiple cells and content)
            if (row.cells && row.cells.length >= 4) {
                // Check if row has actual content (not empty cells)
                const hasContent = Array.from(row.cells).some(cell => 
                    cell.textContent && cell.textContent.trim() !== ''
                );
                
                if (hasContent && validRowIndex < album.versions.length) {
                    const importCell = document.createElement('td');
                    importCell.style.cssText = `
                        text-align: center;
                        padding: 8px;
                        background: #f8f9fa;
                        vertical-align: middle;
                    `;

                    const importButton = document.createElement('button');
                    importButton.textContent = '📤';
                    importButton.title = `Import medium ${validRowIndex + 1} (${album.versions[validRowIndex]?.media || 'Unknown'}) to MusicBrainz`;
                    importButton.style.cssText = `
                        background: #4a90e2;
                        color: white;
                        border: none;
                        padding: 8px;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 16px;
                        width: 35px;
                        height: 35px;
                    `;

                    // Capture the current validRowIndex in closure
                    const mediumIndex = validRowIndex;
                    importButton.onclick = () => {
                        console.log('Importing medium index:', mediumIndex, 'Version data:', album.versions[mediumIndex]);
                        const form = createImportForm(album, mediumIndex);
                        document.body.appendChild(form);
                        form.submit();
                        document.body.removeChild(form);
                    };

                    importCell.appendChild(importButton);
                    row.appendChild(importCell);
                    validRowIndex++;
                }
            }
        });

        console.log('Added import buttons for', validRowIndex, 'valid rows');
    }

    async function init() {
        const albumId = getAlbumId();
        if (!albumId) return;

        console.log('ACUM MusicBrainz Importer: Loading album', albumId);

        try {
            const album = await fetchAlbumData(albumId);
            if (album) {
                console.log('Album data loaded:', album.title);
                console.log('Album versions:', album.versions);
                addImportColumn(album);
            }
        } catch (error) {
            console.error('ACUM Importer Error:', error);
        }
    }

    // Wait for Angular to load the content
    function waitForContent() {
        const table = document.querySelector('table, .table_big_header');
        if (table) {
            setTimeout(init, 500);
        } else {
            setTimeout(waitForContent, 1000);
        }
    }

    // Start checking for content
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', waitForContent);
    } else {
        waitForContent();
    }
})();
