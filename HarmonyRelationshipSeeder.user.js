// ==UserScript==
// @name        Harmony Recordings Relationship Seeder
// @namespace   http://tampermonkey.net/
// @downloadURL https://github.com/YoGo9/Scripts/raw/main/HarmonyRelationshipSeeder.user.js
// @updateURL   https://github.com/YoGo9/Scripts/raw/main/HarmonyRelationshipSeeder.user.js
// @version     1.6
// @tag         ai-created
// @description Generate MusicBrainz relationship seeder URLs from Harmony streaming links.
// @author      YoGo9
// @license     MIT
// @match       https://harmony.pulsewidth.org.uk/release/actions*
// @match       https://harmony.pulsewidth.org.uk/release/*/actions*
// @grant       none
// @run-at      document-end
// ==/UserScript==

(function () {
  'use strict';

  const INJECT_MARK = 'hrs-injected-v16';

  const serviceMap = {
    spotify:  { name: 'Spotify',  color: '#1DB954' },
    deezer:   { name: 'Deezer',   color: '#FF6600' },
    itunes:   { name: 'iTunes',   color: '#A6A6A6' },
    tidal:    { name: 'Tidal',    color: '#000000' },
    bandcamp: { name: 'Bandcamp', color: '#629AA0' },
    beatport: { name: 'Beatport', color: '#01FF01' },
  };

  const providerNameMap = {
    spotify: 'Spotify',
    deezer: 'Deezer',
    itunes: 'iTunes',
    tidal: 'Tidal',
    bandcamp: 'Bandcamp',
    beatport: 'Beatport',
  };

  // MusicBrainz link type IDs → common names
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
    '976': 'secondhandsongs',
  };

  // --- bootstrap & re-run on SPA-ish updates ---
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  const mo = new MutationObserver(() => init());
  mo.observe(document.documentElement, { childList: true, subtree: true });

  function init() {
    // only inject once per render “area”
    if (document.querySelector(`[data-${INJECT_MARK}="1"]`)) return;

    const firstAction = findFirstRecordingAction();
    if (!firstAction) return;

    const available = getAvailableServices();
    if (available.length === 0) return;

    const panel = buildPanel(available);
    // Try to place above the first action
    firstAction.parentNode.insertBefore(panel, firstAction);
    panel.setAttribute(`data-${INJECT_MARK}`, '1');
  }

  function findFirstRecordingAction() {
    // Look for the “Link external IDs” action for recordings
    // It looks like:
    // <div class="action"> <p><a href=".../recording/{mbid}/edit?...edit-recording.url...">Link external IDs</a> ...</p></div>
    const candidates = Array.from(document.querySelectorAll('.action a[href*="/recording/"][href*="/edit"]'));
    // Prefer ones that actually seed links (contain edit-recording in query)
    const withSeed = candidates.find(a => a.href.includes('edit-recording'));
    return (withSeed || candidates[0])?.closest('.action') || null;
  }

  function buildPanel(availableServices) {
    const container = document.createElement('div');
    container.className = 'action';
    container.style.marginBottom = '10px';

    const icon = `
      <svg class="icon" width="24" height="24" stroke-width="2" style="vertical-align: middle">
        <use xlink:href="/icon-sprite.svg#link"></use>
      </svg>`;

    const wrapper = document.createElement('div');
    const title = document.createElement('p');
    title.innerHTML = `<strong>Generate Relationship Seeders:</strong>`;
    wrapper.appendChild(title);

    // Build buttons
    availableServices.forEach(service => {
      const seederUrl = generateSeederUrl(service);
      if (!seederUrl) return;
      const info = getServiceInfo(service);
      const a = document.createElement('a');
      a.href = seederUrl;
      a.textContent = info.name;
      a.className = 'seeder-btn';
      Object.assign(a.style, btnStyle(info.color));
      wrapper.appendChild(a);
    });

    if (availableServices.length > 1) {
      const sep = document.createElement('span');
      sep.textContent = ' | ';
      sep.style.margin = '0 10px';
      sep.style.color = '#666';
      wrapper.appendChild(sep);

      const allUrl = generateAllServicesSeeder();
      if (allUrl) {
        const allBtn = document.createElement('a');
        allBtn.href = allUrl;
        allBtn.textContent = 'All Services';
        Object.assign(allBtn.style, btnStyle('#28a745', true));
        wrapper.appendChild(allBtn);
      }
    }

    const hint = document.createElement('p');
    hint.textContent = 'Create seeder URLs for individual services or all at once';
    Object.assign(hint.style, { fontSize: '12px', color: '#666', marginTop: '5px' });

    const rightDiv = document.createElement('div');
    rightDiv.appendChild(title);
    rightDiv.appendChild(wrapper);
    rightDiv.appendChild(hint);

    container.innerHTML = icon;
    container.appendChild(rightDiv);
    return container;
  }

  function btnStyle(bg, bold = false) {
    return {
      background: bg, color: 'white', padding: '6px 12px', border: 'none',
      borderRadius: '4px', cursor: 'pointer', fontSize: '12px',
      margin: '2px 5px 2px 0', textDecoration: 'none', display: 'inline-block',
      fontWeight: bold ? '700' : '400',
    };
  }

  // --- data extraction ---

  function getAvailableServices() {
    const services = new Set();
    // Each “action” block contains <span class="entity-links"> with provider anchors
    document.querySelectorAll('.action .entity-links a[href]').forEach(a => {
      const s = getServiceFromUrl(a.href);
      if (s !== 'unknown') services.add(s);
    });
    return Array.from(services);
  }

  function getServiceInfo(service) {
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
      if (recordings.length === 0) return null;

      const releaseMbid = extractReleaseMbid();
      if (!releaseMbid) return null;

      const seederData = buildSeederData(releaseMbid, recordings, targetService);
      return buildSeederUrl(releaseMbid, seederData);
    } catch (e) {
      console.error('Seeder error:', e);
      return null;
    }
  }

  function generateAllServicesSeeder() {
    try {
      const recordings = extractAllRecordingData();
      if (recordings.length === 0) return null;

      const releaseMbid = extractReleaseMbid();
      if (!releaseMbid) return null;

      const seederData = buildAllServicesSeederData(releaseMbid, recordings);
      return buildSeederUrl(releaseMbid, seederData);
    } catch (e) {
      console.error('Seeder(all) error:', e);
      return null;
    }
  }

  function extractReleaseMbid() {
    // Album-level MB link is rendered in ProviderList/headers; it’s safe to find any release link
    const mbLink = document.querySelector('a[href*="musicbrainz.org/release/"]');
    const m = mbLink?.href.match(/musicbrainz\.org\/release\/([a-f0-9-]+)/);
    return m ? m[1] : null;
  }

  function extractRecordingDataForService(targetService) {
    const list = [];
    document.querySelectorAll('.action').forEach(action => {
      const entityLinks = action.querySelector('.entity-links');
      if (!entityLinks) return;

      const mbRecLink = entityLinks.querySelector('a[href*="musicbrainz.org/recording/"]');
      const recMbid = mbRecLink?.href.match(/musicbrainz\.org\/recording\/([a-f0-9-]+)/)?.[1];
      if (!recMbid) return;

      const svcAnchor = Array.from(entityLinks.querySelectorAll('a[href]')).find(a => getServiceFromUrl(a.href) === targetService);
      if (!svcAnchor) return;

      const types = extractRelationshipTypesFromAction(action, svcAnchor.href);
      if (types.length === 0) return;

      list.push({ mbid: recMbid, url: svcAnchor.href, types });
    });
    return list;
  }

  function extractAllRecordingData() {
    const list = [];
    document.querySelectorAll('.action').forEach(action => {
      const entityLinks = action.querySelector('.entity-links');
      if (!entityLinks) return;

      const mbRecLink = entityLinks.querySelector('a[href*="musicbrainz.org/recording/"]');
      const recMbid = mbRecLink?.href.match(/musicbrainz\.org\/recording\/([a-f0-9-]+)/)?.[1];
      if (!recMbid) return;

      const urls = [];
      entityLinks.querySelectorAll('a[href]').forEach(a => {
        const svc = getServiceFromUrl(a.href);
        if (svc === 'unknown') return;

        const types = extractRelationshipTypesFromAction(action, a.href);
        if (types.length) urls.push({ url: a.href, types, service: svc });
      });

      if (urls.length) list.push({ mbid: recMbid, urls });
    });
    return list;
  }

  function extractRelationshipTypesFromAction(actionEl, targetUrl) {
    // Find the MB edit link within the same action; it contains the seeded URLs & link_type_ids
    const editLink = actionEl.querySelector('a[href*="/recording/"][href*="/edit"]');
    if (!editLink) return [];

    const editUrl = decodeURIComponent(editLink.href);
    // flattened query keys look like: edit-recording.url.0.text=...&edit-recording.url.0.link_type_id=268
    const re = /edit-recording\.url\.(\d+)\.text=([^&]+)&edit-recording\.url\.\1\.link_type_id=(\d+)/g;
    const found = [];
    for (const m of editUrl.matchAll(re)) {
      const [, idx, encUrl, linkTypeId] = m;
      const dec = decodeURIComponent(encUrl);
      if (dec === targetUrl) {
        const name = linkTypeMap[linkTypeId];
        if (name) found.push(name);
      }
    }
    return found;
  }

  function getAlbumUrlForService(service) {
    const provider = providerNameMap[service];
    if (!provider) return null;
    const li = document.querySelector(`ul.provider-list li[data-provider="${provider}"]`);
    const a = li?.querySelector('a.provider-id');
    return a?.href || null;
  }

  function buildSeederData(releaseMbid, recordings, service) {
    const info = getServiceInfo(service);
    const harmonyUrl = window.location.href;
    const albumUrl = getAlbumUrlForService(service);

    let note = `Release: https://musicbrainz.org/release/${releaseMbid}\n${info.name} links from Harmony: ${harmonyUrl}`;
    if (albumUrl) note += `\n${info.name} Album: ${albumUrl}`;

    const data = { note, version: 1, recordings: {} };
    for (const r of recordings) {
      data.recordings[r.mbid] = { url: r.url, types: r.types };
    }
    return data;
  }

  function buildAllServicesSeederData(releaseMbid, recordings) {
    const harmonyUrl = window.location.href;
    const services = getAvailableServices();

    let note = `Release: https://musicbrainz.org/release/${releaseMbid}\nAll services from Harmony: ${harmonyUrl}`;
    for (const s of services) {
      const albumUrl = getAlbumUrlForService(s);
      if (albumUrl) {
        const info = getServiceInfo(s);
        note += `\n${info.name} Album: ${albumUrl}`;
      }
    }

    const data = { note, version: 2, recordings: {} };
    for (const r of recordings) {
      data.recordings[r.mbid] = r.urls.map(u => ({ url: u.url, types: u.types }));
    }
    return data;
  }

  function buildSeederUrl(releaseMbid, seederData) {
    const encoded = encodeURIComponent(JSON.stringify(seederData));
    return `https://musicbrainz.org/release/${releaseMbid}/edit-relationships#seed-urls-v1=${encoded}`;
  }
})();
