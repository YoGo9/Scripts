// ==UserScript==
// @name         MusicBrainz Quick Add Cover Art
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Adds an "Add Cover Art" link to release edit search results on MusicBrainz.
// @match        *://musicbrainz.org/search/edits*
// @match        *://beta.musicbrainz.org/search/edits*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Select all release links in the edit search results
    document.querySelectorAll("a[href*='/release/']").forEach(link => {
        // Create the new "Add Cover Art" link
        const coverArtLink = document.createElement('a');
        coverArtLink.textContent = "Add Cover Art";
        coverArtLink.href = link.href + "/cover-art";
        coverArtLink.style.marginLeft = "10px";
        coverArtLink.style.color = "blue";
        coverArtLink.style.textDecoration = "underline";

        // Insert the "Add Cover Art" link after the existing release link
        link.parentNode.insertBefore(coverArtLink, link.nextSibling);
    });
})();
