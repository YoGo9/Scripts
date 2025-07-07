// ==UserScript==
// @name        Harmony Recordings Relationship Seeder
// @namespace   http://tampermonkey.net/
// @downloadURL https://github.com/YoGo9/Scripts/raw/main/HarmonyRelationshipSeeder.user.js
// @updateURL   https://github.com/YoGo9/Scripts/raw/main/HarmonyRelationshipSeeder.user.js
// @version     1.5
// @tag         ai-created
// @description Generate MusicBrainz relationship seeder URLs from Harmony streaming links. 
// @author      YoGo9
// @license     MIT
// @match       https://harmony.pulsewidth.org.uk/release/actions*
// @grant       none
// @run-at      document-end
// ==/UserScript==

(function() {
    'use strict';

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    /**
     * Initializes the script by checking for the presence of the first recording section
     * and then creating the seeder buttons.
     */
    function init() {
        const firstRecordingSection = document.querySelector('.message a[href*="edit-recording.url"]');
        if (!firstRecordingSection) {
            return;
        }

        createSeederButtons();
    }

    /**
     * Creates and appends the seeder buttons (now <a> elements) to the page.
     * Each button allows generating a seeder URL for a specific streaming service
     * or for all available services. The seeder URL is directly set as the href.
     */
    function createSeederButtons() {
        const firstRecordingMessage = document.querySelector('.message:has(a[href*="edit-recording.url"])');
        if (!firstRecordingMessage) {
            return;
        }

        const availableServices = getAvailableServices();
        if (availableServices.length === 0) {
            return;
        }

        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'message';

        let buttonsHtml = `
            <svg class="icon" width="24" height="24" stroke-width="2">
                <use xlink:href="/icon-sprite.svg#link"></use>
            </svg>
            <div>
                <p><strong>Generate Relationship Seeders:</strong></p>
        `;

        for (let service of availableServices) {
            const serviceInfo = getServiceInfo(service);
            const seederUrl = generateSeederUrl(service);
            buttonsHtml += `
                <a href="${seederUrl}" class="seeder-btn" data-service="${service}"
                   style="background: ${serviceInfo.color}; color: white; padding: 6px 12px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; margin: 2px 5px 2px 0; text-decoration: none; display: inline-block;">
                    ${serviceInfo.name}
                </a>
            `;
        }

        if (availableServices.length > 1) {
            const allServicesSeederUrl = generateAllServicesSeeder();
            buttonsHtml += `
                <span style="margin: 0 10px; color: #666;">|</span>
                <a href="${allServicesSeederUrl}" class="seeder-btn-all"
                   style="background: #28a745; color: white; padding: 6px 12px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; margin: 2px 5px 2px 0; font-weight: bold; text-decoration: none; display: inline-block;">
                    All Services
                </a>
            `;
        }

        buttonsHtml += `<p style="font-size: 12px; color: #666; margin-top: 5px;">Create seeder URLs for individual services or all at once</p></div>`;

        buttonContainer.innerHTML = buttonsHtml;
        firstRecordingMessage.parentNode.insertBefore(buttonContainer, firstRecordingMessage);
    }

    /**
     * Scans the page to identify available streaming services based on linked URLs.
     * @returns {Array<string>} An array of unique service identifiers (e.g., 'spotify', 'deezer').
     */
    function getAvailableServices() {
        const services = new Set();
        document.querySelectorAll('.message').forEach(message => {
            if (!message.textContent.includes('Link external IDs')) return;

            const entityLinks = message.querySelector('.entity-links');
            if (!entityLinks) return;

            entityLinks.querySelectorAll('a[href]').forEach(link => {
                const service = getServiceFromUrl(link.href);
                if (service !== 'unknown') services.add(service);
            });
        });
        return Array.from(services);
    }

    /**
     * Provides display information (name and color) for known streaming services.
     * @param {string} service - The internal identifier of the service (e.g., 'spotify').
     * @returns {Object} An object containing the service's display name and a color code.
     */
    function getServiceInfo(service) {
        const serviceMap = {
            'spotify': { name: 'Spotify', color: '#1DB954' },
            'deezer': { name: 'Deezer', color: '#FF6600' },
            'itunes': { name: 'iTunes', color: '#A6A6A6' },
            'tidal': { name: 'Tidal', color: '#000000' },
            'bandcamp': { name: 'Bandcamp', color: '#629AA0' },
            'beatport': { name: 'Beatport', color: '#01FF01' }
        };
        return serviceMap[service] || { name: service, color: '#007bff' };
    }

    /**
     * Determines the streaming service from a given URL.
     * @param {string} url - The URL to check.
     * @returns {string} The service identifier (e.g., 'spotify') or 'unknown' if not matched.
     */
    function getServiceFromUrl(url) {
        if (url.includes('open.spotify.com/track/')) return 'spotify';
        if (url.includes('www.deezer.com/track/')) return 'deezer';
        if (url.includes('music.apple.com/')) return 'itunes';
        if (url.includes('tidal.com/track/')) return 'tidal';
        if (url.includes('bandcamp.com/track/')) return 'bandcamp';
        if (url.includes('beatport.com/track/')) return 'beatport';
        return 'unknown';
    }

    /**
     * Generates a MusicBrainz relationship seeder URL for a specific target service.
     * This function now *returns* the URL instead of opening a new window.
     * @param {string} targetService - The service for which to generate the seeder (e.g., 'spotify').
     * @returns {string|null} The generated seeder URL or null if an error occurs.
     */
    function generateSeederUrl(targetService) {
        try {
            const recordings = extractRecordingDataForService(targetService);
            if (recordings.length === 0) {
                console.warn(`No ${targetService} URLs found for recordings on this page`);
                return null;
            }

            const releaseMbid = extractReleaseMbid();
            if (!releaseMbid) {
                console.error('Could not find MusicBrainz release ID');
                return null;
            }

            const seederData = buildSeederData(releaseMbid, recordings, targetService);
            const seederUrl = buildSeederUrl(releaseMbid, seederData);

            return seederUrl;
        } catch (error) {
            console.error('Error generating seeder:', error);
            console.error('Error generating seeder URL: ' + error.message);
            return null;
        }
    }

    /**
     * Generates a MusicBrainz relationship seeder URL for all available services.
     * This function now *returns* the URL instead of opening a new window.
     * @returns {string|null} The generated seeder URL or null if an error occurs.
     */
    function generateAllServicesSeeder() {
        try {
            const recordings = extractAllRecordingData();
            if (recordings.length === 0) {
                console.warn('No streaming URLs found for recordings on this page');
                return null;
            }

            const releaseMbid = extractReleaseMbid();
            if (!releaseMbid) {
                console.error('Could not find MusicBrainz release ID');
                return null;
            }

            const seederData = buildAllServicesSeederData(releaseMbid, recordings);
            const seederUrl = buildSeederUrl(releaseMbid, seederData);

            return seederUrl;
        } catch (error) {
            console.error('Error generating all services seeder:', error);
            console.error('Error generating seeder URL: ' + error.message);
            return null;
        }
    }

    /**
     * Extracts the MusicBrainz Release MBID from a link on the page.
     * @returns {string|null} The MBID string or null if not found.
     */
    function extractReleaseMbid() {
        const mbLink = document.querySelector('a[href*="musicbrainz.org/release/"]');
        if (mbLink) {
            const match = mbLink.href.match(/musicbrainz\.org\/release\/([a-f0-9-]+)/);
            return match ? match[1] : null;
        }
        return null;
    }

    /**
     * Extracts recording data (MBID, URL, relationship types) for a specific service.
     * @param {string} targetService - The service to filter URLs by.
     * @returns {Array<Object>} An array of recording objects.
     */
    function extractRecordingDataForService(targetService) {
        const recordings = [];

        document.querySelectorAll('.message').forEach(message => {
            if (!message.textContent.includes('Link external IDs')) return;

            const entityLinks = message.querySelector('.entity-links');
            if (!entityLinks) return;

            const mbRecordingLink = entityLinks.querySelector('a[href*="musicbrainz.org/recording/"]');
            if (!mbRecordingLink) return;

            const recordingMbid = extractMbidFromUrl(mbRecordingLink.href, 'recording');
            if (!recordingMbid) return;

            const serviceUrl = extractUrlForService(entityLinks, targetService);
            if (serviceUrl) {
                recordings.push({
                    mbid: recordingMbid,
                    url: serviceUrl.url,
                    types: serviceUrl.types
                });
            }
        });

        return recordings;
    }

    /**
     * Extracts all streaming URLs and their relationship types for each recording.
     * @returns {Array<Object>} An array of recording objects, each containing an array of URLs.
     */
    function extractAllRecordingData() {
        const recordings = [];

        document.querySelectorAll('.message').forEach(message => {
            if (!message.textContent.includes('Link external IDs')) return;

            const entityLinks = message.querySelector('.entity-links');
            if (!entityLinks) return;

            const mbRecordingLink = entityLinks.querySelector('a[href*="musicbrainz.org/recording/"]');
            if (!mbRecordingLink) return;

            const recordingMbid = extractMbidFromUrl(mbRecordingLink.href, 'recording');
            if (!recordingMbid) return;

            const streamingUrls = extractAllStreamingUrls(entityLinks);
            if (streamingUrls.length > 0) {
                recordings.push({
                    mbid: recordingMbid,
                    urls: streamingUrls
                });
            }
        });

        return recordings;
    }

    /**
     * Extracts a specific streaming URL and its relationship types for a given service
     * from a set of entity links.
     * @param {HTMLElement} entityLinks - The container element with external links.
     * @param {string} targetService - The service to find the URL for.
     * @returns {Object|null} An object containing the URL and its types, or null if not found.
     */
    function extractUrlForService(entityLinks, targetService) {
        const links = entityLinks.querySelectorAll('a[href]');

        for (let link of links) {
            const url = link.href;
            const service = getServiceFromUrl(url);

            if (service === targetService) {
                const relationshipTypes = extractRelationshipTypesFromHarmony(entityLinks, url);
                if (relationshipTypes.length > 0) {
                    return {
                        url: url,
                        types: relationshipTypes
                    };
                }
            }
        }
        return null;
    }

    /**
     * Extracts all streaming URLs and their associated relationship types from a set of entity links.
     * @param {HTMLElement} entityLinks - The container element with external links.
     * @returns {Array<Object>} An array of URL objects, each with url, types, and service.
     */
    function extractAllStreamingUrls(entityLinks) {
        const urls = [];
        const links = entityLinks.querySelectorAll('a[href]');

        for (let link of links) {
            const url = link.href;
            const service = getServiceFromUrl(url);

            if (service !== 'unknown') {
                const relationshipTypes = extractRelationshipTypesFromHarmony(entityLinks, url);
                if (relationshipTypes.length > 0) {
                    urls.push({
                        url: url,
                        types: relationshipTypes,
                        service: service
                    });
                }
            }
        }
        return urls;
    }

    /**
     * Extracts relationship types for a given URL by parsing the Harmony edit URL.
     * @param {HTMLElement} entityLinks - The container element holding the entity links.
     * @param {string} targetUrl - The specific URL to find relationship types for.
     * @returns {Array<string>} An array of relationship type names.
     */
    function extractRelationshipTypesFromHarmony(entityLinks, targetUrl) {
        const messageDiv = entityLinks.closest('.message');
        const editLink = messageDiv ? messageDiv.querySelector('a[href*="edit-recording.url"]') : null;

        if (!editLink) return [];

        const editUrl = decodeURIComponent(editLink.href);
        const urlPattern = /edit-recording\.url\.(\d+)\.text=([^&]+)&edit-recording\.url\.\1\.link_type_id=(\d+)/g;
        const matches = [...editUrl.matchAll(urlPattern)];

        const relationshipTypes = [];

        for (let match of matches) {
            const [, index, encodedUrl, linkTypeId] = match;
            const decodedUrl = decodeURIComponent(encodedUrl);

            if (decodedUrl === targetUrl) {
                const relationshipType = getLinkTypeName(linkTypeId);
                if (relationshipType) {
                    relationshipTypes.push(relationshipType);
                }
            }
        }

        return relationshipTypes;
    }

    /**
     * Maps MusicBrainz link type IDs to human-readable names.
     * @param {string} linkTypeId - The numeric ID of the link type.
     * @returns {string|null} The name of the link type or null if not found.
     */
    function getLinkTypeName(linkTypeId) {
        const linkTypeMap = {
            '254': 'purchase for download',
            '255': 'download for free',
            '268': 'free streaming',
            '979': 'streaming',
            '256': 'production',
            '257': 'get the music',
            '258': 'IMDB samples',
            '285': 'allmusic',
            '302': 'license',
            '306': 'other databases',
            '905': 'crowdfunding',
            '976': 'secondhandsongs'
        };
        return linkTypeMap[linkTypeId] || null;
    }

    /**
     * Builds the JSON data payload for the MusicBrainz relationship seeder for a single service.
     * @param {string} releaseMbid - The MusicBrainz ID of the release.
     * @param {Array<Object>} recordings - An array of recording data objects.
     * @param {string} service - The target streaming service.
     * @returns {Object} The seeder data object.
     */
    function buildSeederData(releaseMbid, recordings, service) {
        const serviceInfo = getServiceInfo(service);
        const harmonyUrl = window.location.href;
        const albumUrl = getAlbumUrlForService(service);

        let note = `Release: https://musicbrainz.org/release/${releaseMbid}\n${serviceInfo.name} links from Harmony: ${harmonyUrl}`;

        if (albumUrl) {
            note += `\n${serviceInfo.name} Album: ${albumUrl}`;
        }

        const seederData = {
            note: note,
            version: 1,
            recordings: {}
        };

        for (let recording of recordings) {
            seederData.recordings[recording.mbid] = {
                url: recording.url,
                types: recording.types
            };
        }

        return seederData;
    }

    /**
     * Builds the JSON data payload for the MusicBrainz relationship seeder for all services.
     * @param {string} releaseMbid - The MusicBrainz ID of the release.
     * @param {Array<Object>} recordings - An array of recording data objects, each with multiple URLs.
     * @returns {Object} The seeder data object.
     */
    function buildAllServicesSeederData(releaseMbid, recordings) {
        const harmonyUrl = window.location.href;
        const availableServices = getAvailableServices();

        let note = `Release: https://musicbrainz.org/release/${releaseMbid}\nAll services from Harmony: ${harmonyUrl}`;

        for (let service of availableServices) {
            const albumUrl = getAlbumUrlForService(service);
            if (albumUrl) {
                const serviceInfo = getServiceInfo(service);
                note += `\n${serviceInfo.name} Album: ${albumUrl}`;
            }
        }

        const seederData = {
            note: note,
            version: 2,
            recordings: {}
        };

        for (let recording of recordings) {
            seederData.recordings[recording.mbid] = recording.urls.map(urlData => ({
                url: urlData.url,
                types: urlData.types
            }));
        }

        return seederData;
    }

    /**
     * Retrieves the album URL for a specific streaming service from the Harmony page.
     * @param {string} service - The service identifier.
     * @returns {string|null} The album URL or null if not found.
     */
    function getAlbumUrlForService(service) {
        const providerMap = {
            'spotify': 'Spotify',
            'deezer': 'Deezer',
            'itunes': 'iTunes',
            'tidal': 'Tidal',
            'bandcamp': 'Bandcamp',
            'beatport': 'Beatport'
        };

        const providerName = providerMap[service];
        if (!providerName) return null;

        const providerItem = document.querySelector(`li[data-provider="${providerName}"]`);
        if (!providerItem) return null;

        const providerLink = providerItem.querySelector('a.provider-id');
        return providerLink ? providerLink.href : null;
    }

    /**
     * Extracts the MusicBrainz ID (MBID) from a given URL for a specific entity type.
     * @param {string} url - The URL to parse.
     * @param {string} entityType - The type of MusicBrainz entity (e.g., 'recording', 'release').
     * @returns {string|null} The extracted MBID or null if not found.
     */
    function extractMbidFromUrl(url, entityType) {
        const match = url.match(new RegExp(`musicbrainz\\.org\\/${entityType}\\/([a-f0-9-]+)`));
        return match ? match[1] : null;
    }

    /**
     * Constructs the full MusicBrainz relationship seeder URL.
     * @param {string} releaseMbid - The MusicBrainz ID of the release.
     * @param {Object} seederData - The JSON data payload for the seeder.
     * @returns {string} The complete seeder URL.
     */
    function buildSeederUrl(releaseMbid, seederData) {
        const encodedData = encodeURIComponent(JSON.stringify(seederData));
        return `https://musicbrainz.org/release/${releaseMbid}/edit-relationships#seed-urls-v1=${encodedData}`;
    }

})();
