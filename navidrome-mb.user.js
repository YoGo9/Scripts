// ==UserScript==
// @name         Navidrome: MusicBrainz Integration (badge + seed)
// @namespace    https://github.com/YoGo9
// @version      2.0.0
// @description  Badges MB-tagged albums on grids (album list + artist pages), and adds a context-aware button on album pages: "Open release in MusicBrainz" when tagged, or "Add to MusicBrainz" (seeds a new release from your Navidrome tags) when not.
// @match        *://*/app/*
// @match        *://*/*/app/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  const MB_COLOR = '#ba478f';
  const DEBOUNCE = 300;

  const mbzMap = {};          // albumId -> mbzAlbumId (string) or null
  const badged = new WeakSet();
  let prefetched = false;

  // ─────────────────────────────────────── shared helpers
  const _fetch = window.fetch.bind(window);

  function authHeaders(extra) {
    const token = localStorage.getItem('token');
    const h = Object.assign({ Accept: 'application/json' }, extra || {});
    if (token) h['X-ND-Authorization'] = 'Bearer ' + token;
    return h;
  }

  // Always goes through the ORIGINAL fetch so it won't trigger the harvest below.
  function apiJson(url) {
    return _fetch(url, { credentials: 'include', headers: authHeaders() })
      .then(r => { if (!r.ok) throw new Error(url + ' -> HTTP ' + r.status); return r.json(); });
  }

  // ─────────────────────────────────────── harvest mbzAlbumId from list responses
  window.fetch = async function (...args) {
    const response = await _fetch(...args);
    const url = (typeof args[0] === 'string' ? args[0] : (args[0]?.url ?? ''));
    if (url.includes('/api/album') && !url.match(/\/api\/album\/[^?]/)) {
      response.clone().json().then(data => {
        if (Array.isArray(data)) {
          data.forEach(a => { if (a?.id) mbzMap[a.id] = a.mbzAlbumId || null; });
          applyBadges();
        }
      }).catch(() => {});
    }
    return response;
  };

  // ─────────────────────────────────────── proactively fetch all albums (once)
  function prefetchAll() {
    if (prefetched) return;
    prefetched = true;

    const batchSize = 500;
    function fetchBatch(start) {
      _fetch(`/api/album?_start=${start}&_end=${start + batchSize}&_order=ASC&_sort=name`,
        { credentials: 'include', headers: authHeaders() })
        .then(r => {
          const total = parseInt(r.headers.get('X-Total-Count') ?? '0', 10);
          return r.json().then(data => ({ data, total }));
        })
        .then(({ data, total }) => {
          if (!Array.isArray(data)) return;
          data.forEach(a => { if (a?.id) mbzMap[a.id] = a.mbzAlbumId || null; });
          applyBadges();
          if (start + batchSize < total) fetchBatch(start + batchSize);
        })
        .catch(e => { prefetched = false; console.warn('[ND-MB] prefetch error', e); });
    }
    fetchBatch(0);
  }

  // ─────────────────────────────────────── grid badge
  function makeBadge() {
    const el = document.createElement('div');
    el.className = 'nd-mb-badge';
    el.title = 'MusicBrainz tagged';
    Object.assign(el.style, {
      position: 'absolute', bottom: '6px', right: '6px',
      padding: '1px 4px', borderRadius: '4px',
      background: MB_COLOR, color: '#fff',
      fontSize: '10px', fontWeight: '700', fontFamily: 'Arial, sans-serif',
      lineHeight: '15px', letterSpacing: '0.2px',
      zIndex: '10', pointerEvents: 'none', userSelect: 'none',
      boxShadow: '0 1px 3px rgba(0,0,0,0.5)', whiteSpace: 'nowrap',
    });
    el.textContent = 'MB';
    return el;
  }

  function isActivePage() {
    return location.hash.startsWith('#/album') || location.hash.includes('/artist/');
  }

  function albumIdFromHref(href) {
    const m = (href ?? '').match(/#\/album\/([^/]+)/);
    return m ? m[1] : null;
  }

  function getCoverDiv(link) {
    const img = link.querySelector('img');
    if (img) return img.parentElement;
    return link.querySelector('div') ?? null;
  }

  function applyBadges() {
    if (!isActivePage()) return;
    document.querySelectorAll('a[href*="#/album/"]').forEach(link => {
      const albumId = albumIdFromHref(link.getAttribute('href'));
      if (!albumId || !mbzMap[albumId]) return;   // truthy = has an MBID
      const coverDiv = getCoverDiv(link);
      if (!coverDiv || badged.has(coverDiv)) return;
      badged.add(coverDiv);
      if (getComputedStyle(coverDiv).position === 'static') coverDiv.style.position = 'relative';
      coverDiv.appendChild(makeBadge());
    });
  }

  // ─────────────────────────────────────── album-page floating button
  const FAB_ID = 'nd-mb-fab';
  let fabAlbumId = null;

  function showAlbumId() {
    const m = location.hash.match(/#\/album\/([^/?]+)/);   // matches show page, not the list
    return m ? m[1] : null;
  }

  function removeFab() {
    const el = document.getElementById(FAB_ID);
    if (el) el.remove();
  }

  function renderFab({ label, onClick, href }) {
    removeFab();
    const btn = document.createElement(href ? 'a' : 'button');
    btn.id = FAB_ID;
    if (href) { btn.href = href; btn.target = '_blank'; btn.rel = 'noopener'; }
    btn.textContent = label;
    Object.assign(btn.style, {
      position: 'fixed', bottom: '24px', right: '24px',
      padding: '10px 16px', borderRadius: '20px',
      background: MB_COLOR, color: '#fff',
      fontFamily: 'Arial, sans-serif', fontSize: '13px', fontWeight: '700',
      border: 'none', cursor: 'pointer', textDecoration: 'none',
      boxShadow: '0 2px 8px rgba(0,0,0,0.4)', zIndex: '99999',
    });
    if (onClick) btn.addEventListener('click', onClick);
    document.body.appendChild(btn);
  }

  function refreshFab() {
    const albumId = showAlbumId();
    if (!albumId) { fabAlbumId = null; removeFab(); return; }
    if (albumId === fabAlbumId) return;   // already built for this album
    fabAlbumId = albumId;
    removeFab();

    apiJson('/api/album/' + albumId).then(album => {
      if (showAlbumId() !== albumId) return;   // navigated away while fetching
      const mbid = album.mbzAlbumId || null;
      mbzMap[albumId] = mbid;
      if (mbid) {
        renderFab({ label: 'Open release in MusicBrainz', href: 'https://musicbrainz.org/release/' + mbid });
      } else {
        renderFab({ label: 'Add to MusicBrainz', onClick: () => seedRelease(albumId, album) });
      }
    }).catch(e => console.warn('[ND-MB] album fetch error', e));
  }

  // ─────────────────────────────────────── seed a new MB release from Navidrome tags
  function seedRelease(albumId, album) {
    apiJson(`/api/song?album_id=${encodeURIComponent(albumId)}&_start=0&_end=2000`)
      .then(songs => {
        if (!Array.isArray(songs) || songs.length === 0) { alert('No tracks found for this album.'); return; }
        buildAndSubmitSeed(album, songs);
      })
      .catch(e => alert('Could not fetch album data from Navidrome:\n' + e.message));
  }

  function buildAndSubmitSeed(album, songs) {
    const tags = album.tags || {};
    const tag = name => {
      const v = tags[name];
      return Array.isArray(v) && v.length ? v[0] : null;
    };

    songs.sort((a, b) => {
      const da = a.discNumber || 1, db = b.discNumber || 1;
      return da !== db ? da - db : (a.trackNumber || 0) - (b.trackNumber || 0);
    });

    const discs = [];
    songs.forEach(s => { const d = s.discNumber || 1; if (!discs.includes(d)) discs.push(d); });
    discs.sort((a, b) => a - b);

    const form = document.createElement('form');
    form.action = 'https://musicbrainz.org/release/add';
    form.method = 'post';
    form.target = '_blank';
    form.style.display = 'none';

    const add = (name, value) => {
      if (value == null || value === '') return;
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = value;
      form.appendChild(input);
    };

    const fmtLen = seconds => {
      if (!seconds && seconds !== 0) return '';
      const t = Math.round(seconds), s = t % 60;
      return Math.floor(t / 60) + ':' + (s < 10 ? '0' : '') + s;
    };

    add('name', album.name);

    const rg = album.mbzReleaseGroupId || null;
    if (rg) add('release_group', rg);
    else { const rt = tag('releasetype'); if (rt) add('type', rt); }

    const ver = tag('albumversion'); if (ver) add('comment', ver);
    const barcode = tag('barcode'); if (barcode) add('barcode', barcode);
    const status = tag('releasestatus'); if (status) add('status', status.toLowerCase());

    const parts = String(album.releaseDate || album.date || '').split('-');
    add('events.0.date.year', parts[0] || '');
    add('events.0.date.month', parts[1] || '');
    add('events.0.date.day', parts[2] || '');
    const country = tag('releasecountry'); if (country) add('events.0.country', country);

    const catalog = album.catalogNum || null;
    const label = tag('recordlabel');
    if (catalog) add('labels.0.catalog_number', catalog);
    if (label) add('labels.0.name', label);

    const albumArtistMbid = album.mbzAlbumArtistId || null;
    add('artist_credit.names.0.name', album.albumArtist);
    add('artist_credit.names.0.artist.name', album.albumArtist);
    if (albumArtistMbid) add('artist_credit.names.0.mbid', albumArtistMbid);

    const media = tag('media');
    discs.forEach((disc, mi) => {
      const discSongs = songs.filter(s => (s.discNumber || 1) === disc);
      if (media) add(`mediums.${mi}.format`, media);
      const subtitle = discSongs.map(s => s.discSubtitle).filter(Boolean)[0];
      if (subtitle) add(`mediums.${mi}.name`, subtitle);
      discSongs.forEach((s, ti) => {
        const p = `mediums.${mi}.track.${ti}.`;
        add(p + 'name', s.title);
        add(p + 'number', s.trackNumber || ti + 1);
        add(p + 'length', fmtLen(s.duration));
        if (s.mbzRecordingID) add(p + 'recording', s.mbzRecordingID);
        const artist = s.artist || album.albumArtist;
        add(p + 'artist_credit.names.0.name', artist);
        add(p + 'artist_credit.names.0.artist.name', artist);
        if (s.mbzArtistId) add(p + 'artist_credit.names.0.mbid', s.mbzArtistId);
      });
    });

    add('edit_note', 'Seeded from personal Navidrome library tags via userscript.');

    document.body.appendChild(form);
    form.submit();
    setTimeout(() => form.remove(), 1000);
  }

  // ─────────────────────────────────────── observers + routing
  let scanTimer = null;
  const observer = new MutationObserver(() => {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(applyBadges, DEBOUNCE);
  });

  function startObserving() {
    observer.observe(document.body, { childList: true, subtree: true });
    prefetchAll();
  }
  function stopObserving() {
    observer.disconnect();
    clearTimeout(scanTimer);
  }

  function route() {
    if (isActivePage()) startObserving(); else stopObserving();
    refreshFab();
  }

  window.addEventListener('hashchange', () => { stopObserving(); route(); });

  const boot = () => route();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
