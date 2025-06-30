// ==UserScript==
// @name         Harmony Relationship Seeder
// @namespace    http://tampermonkey.net/
// @downloadURL  https://github.com/YoGo9/Scripts/raw/main/HarmonyRelationshipSeeder.user.js
// @updateURL    https://github.com/YoGo9/Scripts/raw/main/HarmonyRelationshipSeeder.user.js
// @version      1.3
// @description  Generate MusicBrainz relationship seeder URLs from Harmony streaming links. Creates separate seeders for each streaming service.
// @author       YoGo9
// @match        https://harmony.pulsewidth.org.uk/release/actions*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // Wait for page to load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    function init() {
        // Find the first recording link section to place buttons above it
        const firstRecordingSection = document.querySelector('.message a[href*="edit-recording.url"]');
        if (!firstRecordingSection) {
            console.log('No recording sections found on this page');
            return;
        }

        // Create the seeder buttons
        createSeederButtons();
    }

    function createSeederButtons() {
        // Find where to insert the buttons (before first recording message)
        const firstRecordingMessage = document.querySelector('.message:has(a[href*="edit-recording.url"])');
        if (!firstRecordingMessage) return;

        // Extract what services are available
        const availableServices = getAvailableServices();
        
        if (availableServices.length === 0) {
            console.log('No streaming services found');
            return;
        }

        // Create button container
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'message';
        
        let buttonsHtml = `
            <svg class="icon" width="24" height="24" stroke-width="2">
                <use xlink:href="/icon-sprite.svg#link"></use>
            </svg>
            <div>
                <p><strong>Generate Relationship Seeders:</strong></p>
        `;

        // Create a button for each available service
        for (let service of availableServices) {
            const serviceInfo = getServiceInfo(service);
            buttonsHtml += `
                <button class="seeder-btn" data-service="${service}" style="background: ${serviceInfo.color}; color: white; padding: 6px 12px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; margin: 2px 5px 2px 0;">
                    ${serviceInfo.name}
                </button>
            `;
        }

        // Add "All Services" button if more than one service available
        if (availableServices.length > 1) {
            buttonsHtml += `
                <span style="margin: 0 10px; color: #666;">|</span>
                <button class="seeder-btn-all" style="background: #28a745; color: white; padding: 6px 12px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; margin: 2px 5px 2px 0; font-weight: bold;">
                    All Services
                </button>
            `;
        }

        buttonsHtml += `<p style="font-size: 12px; color: #666; margin-top: 5px;">Create seeder URLs for individual services or all at once</p></div>`;
        
        buttonContainer.innerHTML = buttonsHtml;

        // Insert before the first recording message
        firstRecordingMessage.parentNode.insertBefore(buttonContainer, firstRecordingMessage);

        // Add click handlers
        const buttons = buttonContainer.querySelectorAll('.seeder-btn');
        buttons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const service = e.target.getAttribute('data-service');
                generateSeederUrl(service);
            });
        });

        // Add click handler for "All Services" button
        const allServicesBtn = buttonContainer.querySelector('.seeder-btn-all');
        if (allServicesBtn) {
            allServicesBtn.addEventListener('click', () => {
                generateAllServicesSeeder();
            });
        }
    }

    function getAvailableServices() {
        const services = new Set();
        const linkMessages = document.querySelectorAll('.message');
        
        for (let message of linkMessages) {
            const linkText = message.textContent;
            if (!linkText.includes('Link external IDs')) continue;

            const entityLinks = message.querySelector('.entity-links');
            if (!entityLinks) continue;

            const links = entityLinks.querySelectorAll('a[href]');
            for (let link of links) {
                const url = link.href;
                const service = getServiceFromUrl(url);
                if (service !== 'unknown') {
                    services.add(service);
                }
            }
        }

        return Array.from(services);
    }

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

    function getServiceFromUrl(url) {
        if (url.includes('open.spotify.com/track/')) return 'spotify';
        if (url.includes('www.deezer.com/track/')) return 'deezer';
        if (url.includes('music.apple.com/')) return 'itunes';
        if (url.includes('tidal.com/track/')) return 'tidal';
        if (url.includes('bandcamp.com/track/')) return 'bandcamp';
        if (url.includes('beatport.com/track/')) return 'beatport';
        return 'unknown';
    }

    function generateSeederUrl(targetService) {
        try {
            const recordings = extractRecordingDataForService(targetService);
            
            if (recordings.length === 0) {
                alert(`No ${targetService} URLs found for recordings on this page`);
                return;
            }

            const releaseMbid = extractReleaseMbid();
            if (!releaseMbid) {
                alert('Could not find MusicBrainz release ID');
                return;
            }

            const seederData = buildSeederData(releaseMbid, recordings, targetService);
            const seederUrl = buildSeederUrl(releaseMbid, seederData);

            // Copy to clipboard and open in new tab
            copyToClipboard(seederUrl);
            window.open(seederUrl, '_blank');

        } catch (error) {
            console.error('Error generating seeder:', error);
            alert('Error generating seeder URL: ' + error.message);
        }
    }

    function extractReleaseMbid() {
        // Look for MusicBrainz release link
        const mbLink = document.querySelector('a[href*="musicbrainz.org/release/"]');
        if (mbLink) {
            const match = mbLink.href.match(/musicbrainz\.org\/release\/([a-f0-9-]+)/);
            return match ? match[1] : null;
        }
        return null;
    }

    function extractRecordingDataForService(targetService) {
        const recordings = [];
        
        // Find all "Link external IDs" messages
        const linkMessages = document.querySelectorAll('.message');
        
        for (let message of linkMessages) {
            const linkText = message.textContent;
            if (!linkText.includes('Link external IDs')) continue;

            const entityLinks = message.querySelector('.entity-links');
            if (!entityLinks) continue;

            // Extract recording MBID
            const mbRecordingLink = entityLinks.querySelector('a[href*="musicbrainz.org/recording/"]');
            if (!mbRecordingLink) continue;

            const recordingMbid = extractMbidFromUrl(mbRecordingLink.href, 'recording');
            if (!recordingMbid) continue;

            // Extract URL for the target service
            const serviceUrl = extractUrlForService(entityLinks, targetService);
            
            if (serviceUrl) {
                recordings.push({
                    mbid: recordingMbid,
                    url: serviceUrl.url,
                    types: serviceUrl.types
                });
            }
        }

        return recordings;
    }

    function extractUrlForService(entityLinks, targetService) {
        const links = entityLinks.querySelectorAll('a[href]');

        for (let link of links) {
            const url = link.href;
            const service = getServiceFromUrl(url);
            
            if (service === targetService) {
                const relationshipTypes = getRelationshipTypes(url);
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

    function getRelationshipTypes(url) {
        // Determine relationship type based on URL - using exact MusicBrainz relationship names
        if (url.includes('open.spotify.com/track/')) {
            return ['free streaming'];
        } else if (url.includes('www.deezer.com/track/')) {
            return ['free streaming'];
        } else if (url.includes('music.apple.com/')) {
            return ['streaming', 'purchase for download'];
        } else if (url.includes('tidal.com/track/')) {
            return ['free streaming'];
        } else if (url.includes('bandcamp.com/track/')) {
            return ['free streaming'];
        } else if (url.includes('beatport.com/track/')) {
            return ['purchase for download'];
        }
        return [];
    }

    function generateAllServicesSeeder() {
        try {
            const recordings = extractAllRecordingData();
            
            if (recordings.length === 0) {
                alert('No streaming URLs found for recordings on this page');
                return;
            }

            const releaseMbid = extractReleaseMbid();
            if (!releaseMbid) {
                alert('Could not find MusicBrainz release ID');
                return;
            }

            const seederData = buildAllServicesSeederData(releaseMbid, recordings);
            const seederUrl = buildSeederUrl(releaseMbid, seederData);

            // Copy to clipboard and open in new tab
            copyToClipboard(seederUrl);
            window.open(seederUrl, '_blank');

        } catch (error) {
            console.error('Error generating all services seeder:', error);
            alert('Error generating seeder URL: ' + error.message);
        }
    }

    function extractAllRecordingData() {
        const recordings = [];
        
        // Find all "Link external IDs" messages
        const linkMessages = document.querySelectorAll('.message');
        
        for (let message of linkMessages) {
            const linkText = message.textContent;
            if (!linkText.includes('Link external IDs')) continue;

            const entityLinks = message.querySelector('.entity-links');
            if (!entityLinks) continue;

            // Extract recording MBID
            const mbRecordingLink = entityLinks.querySelector('a[href*="musicbrainz.org/recording/"]');
            if (!mbRecordingLink) continue;

            const recordingMbid = extractMbidFromUrl(mbRecordingLink.href, 'recording');
            if (!recordingMbid) continue;

            // Extract all streaming URLs for this recording
            const streamingUrls = extractAllStreamingUrls(entityLinks);
            
            if (streamingUrls.length > 0) {
                recordings.push({
                    mbid: recordingMbid,
                    urls: streamingUrls
                });
            }
        }

        return recordings;
    }

    function extractAllStreamingUrls(entityLinks) {
        const urls = [];
        const links = entityLinks.querySelectorAll('a[href]');

        for (let link of links) {
            const url = link.href;
            const service = getServiceFromUrl(url);
            
            if (service !== 'unknown') {
                const relationshipTypes = getRelationshipTypes(url);
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

    function buildAllServicesSeederData(releaseMbid, recordings) {
        const harmonyUrl = window.location.href;
        const availableServices = getAvailableServices();
        
        // Build note with all album URLs
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
            version: 2,  // Use version 2 for multiple URLs per recording
            recordings: {}
        };

        // Add recordings with all their URLs
        for (let recording of recordings) {
            seederData.recordings[recording.mbid] = recording.urls.map(urlData => ({
                url: urlData.url,
                types: urlData.types
            }));
        }

        return seederData;
    }

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

        // Add recordings for this service only
        for (let recording of recordings) {
            seederData.recordings[recording.mbid] = {
                url: recording.url,
                types: recording.types
            };
        }

        return seederData;
    }

    function extractMbidFromUrl(url, entityType) {
        const match = url.match(new RegExp(`musicbrainz\\.org\\/${entityType}\\/([a-f0-9-]+)`));
        return match ? match[1] : null;
    }

    function getAlbumUrlForService(service) {
        // Map service names to provider data attributes
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
        
        // Find the provider list item for this service
        const providerItem = document.querySelector(`li[data-provider="${providerName}"]`);
        if (!providerItem) return null;
        
        // Extract the album URL from the provider-id link
        const providerLink = providerItem.querySelector('a.provider-id');
        if (!providerLink) return null;
        
        return providerLink.href;
    }

    function buildSeederUrl(releaseMbid, seederData) {
        const encodedData = encodeURIComponent(JSON.stringify(seederData));
        return `https://musicbrainz.org/release/${releaseMbid}/edit-relationships#seed-urls-v1=${encodedData}`;
    }

    function copyToClipboard(text) {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(text).then(() => {
                console.log('Seeder URL copied to clipboard');
            }).catch(err => {
                console.error('Failed to copy to clipboard:', err);
            });
        } else {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                console.log('Seeder URL copied to clipboard (fallback)');
            } catch (err) {
                console.error('Failed to copy to clipboard:', err);
            }
            document.body.removeChild(textArea);
        }
    }

})();
