// ==UserScript==
// @name         Harmony Recordings Relationship Seeder
// @namespace    http://tampermonkey.net/
// @downloadURL  https://github.com/YoGo9/Scripts/raw/main/HarmonyRelationshipSeeder.user.js
// @updateURL    https://github.com/YoGo9/Scripts/raw/main/HarmonyRelationshipSeeder.user.js
// @version      1.4
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
        const firstRecordingSection = document.querySelector('.message a[href*="edit-recording.url"]');
        if (!firstRecordingSection) return;

        createSeederButtons();
    }

    function createSeederButtons() {
        const firstRecordingMessage = document.querySelector('.message:has(a[href*="edit-recording.url"])');
        if (!firstRecordingMessage) return;

        const availableServices = getAvailableServices();
        if (availableServices.length === 0) return;

        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'message';
        
        let buttonsHtml = `
            <svg class="icon" width="24" height="24" stroke-width="2">
                <use xlink:href="/icon-sprite.svg#link"></use>
            </svg>
            <div>
                <p><strong>Generate Relationship Seeders:</strong></p>
        `;

        // Individual service buttons
        for (let service of availableServices) {
            const serviceInfo = getServiceInfo(service);
            buttonsHtml += `
                <button class="seeder-btn" data-service="${service}" style="background: ${serviceInfo.color}; color: white; padding: 6px 12px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; margin: 2px 5px 2px 0;">
                    ${serviceInfo.name}
                </button>
            `;
        }

        // All Services button
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
        firstRecordingMessage.parentNode.insertBefore(buttonContainer, firstRecordingMessage);

        // Add click handlers
        buttonContainer.querySelectorAll('.seeder-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                generateSeederUrl(e.target.getAttribute('data-service'));
            });
        });

        const allServicesBtn = buttonContainer.querySelector('.seeder-btn-all');
        if (allServicesBtn) {
            allServicesBtn.addEventListener('click', generateAllServicesSeeder);
        }
    }

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

            copyToClipboard(seederUrl);
            window.open(seederUrl, '_blank');
        } catch (error) {
            console.error('Error generating seeder:', error);
            alert('Error generating seeder URL: ' + error.message);
        }
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

            copyToClipboard(seederUrl);
            window.open(seederUrl, '_blank');
        } catch (error) {
            console.error('Error generating all services seeder:', error);
            alert('Error generating seeder URL: ' + error.message);
        }
    }

    function extractReleaseMbid() {
        const mbLink = document.querySelector('a[href*="musicbrainz.org/release/"]');
        if (mbLink) {
            const match = mbLink.href.match(/musicbrainz\.org\/release\/([a-f0-9-]+)/);
            return match ? match[1] : null;
        }
        return null;
    }

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

    function extractMbidFromUrl(url, entityType) {
        const match = url.match(new RegExp(`musicbrainz\\.org\\/${entityType}\\/([a-f0-9-]+)`));
        return match ? match[1] : null;
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
