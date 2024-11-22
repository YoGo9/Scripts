// ==UserScript==
// @name         Harmony Add Cover Art Links
// @namespace    http://tampermonkey.net/
// @downloadURL  https://github.com/YoGo9/Scripts/raw/main/HarmonyDirectAddCover.user.js
// @updateURL    https://github.com/YoGo9/Scripts/raw/main/HarmonyDirectAddCover.user.js
// @version      0.1
// @description  Dynamically adds "Add Cover Art" links to Harmony importer for each cover image (without provider name).
// @author       YoGo9
// @match        https://harmony.pulsewidth.org.uk/release/actions*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // Extract the MusicBrainz release MBID from the URL
    const urlParams = new URLSearchParams(window.location.search);
    const mbid = urlParams.get('release_mbid');
    if (!mbid) {
        console.error("Release MBID not found in URL.");
        return;
    }

    // Base MusicBrainz URL for adding cover art
    const baseMusicBrainzURL = `https://musicbrainz.org/release/${mbid}/add-cover-art`;

    // Function to create "Add Cover Art" links
    function addCoverArtLinks() {
        // Select all cover image containers (figure elements with class "cover-image")
        const covers = document.querySelectorAll('figure.cover-image');

        if (covers.length === 0) {
            console.warn("No cover images found on the page.");
            return;
        }

        covers.forEach(cover => {
            const img = cover.querySelector('img'); // The image element

            if (img) {
                const imgUrl = img.src.replace(/\/250x250bb\.jpg/, '/1000x1000bb.jpg'); // Get high-quality image URL

                // Construct the Add Cover Art URL
                const addCoverArtURL = `${baseMusicBrainzURL}?x_seed.image.0.url=${encodeURIComponent(imgUrl)}&x_seed.origin=${encodeURIComponent(window.location.href)}`;

                // Check if the link already exists to avoid duplication
                if (!cover.querySelector('.add-cover-art-link')) {
                    // Create the link element
                    const link = document.createElement('a');
                    link.href = addCoverArtURL;
                    link.textContent = `Add Cover Art`; 
                    link.target = '_blank';
                    link.className = 'add-cover-art-link'; // Add a class to identify the link
                    link.style.display = 'block';
                    link.style.marginTop = '5px';

                    // Append the link to the cover container
                    cover.appendChild(link);
                }
            }
        });
    }

    // Run the function after the page content has fully loaded
    window.addEventListener('load', addCoverArtLinks);
})();
