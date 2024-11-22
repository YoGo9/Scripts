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
                    const link = document.createElement('span');
                    link.innerHTML =  `+ Add Cover Art`;
                    link.onclick = function() {
                        window.open(addCoverArtURL, '_blank').focus();
                    };
                    link.className = 'label add-cover-art-link';

                    // Append the link to the cover container
                    cover.childNodes[1].appendChild(link);
                }
            }
        });
    }

    // Run the function after the page content has fully loaded
    window.addEventListener('load', addCoverArtLinks);
})();

// Insert CSS into the Head
function main() {
    let head = document.getElementsByTagName('head')[0];
    if (head) {
        let style = document.createElement('style');
        style.setAttribute('type', 'text/css');
        style.textContent = `
            .add-cover-art-link {
                min-height: 1.2em;
                cursor: pointer;
            }
        `;
        head.appendChild(style);
    }
}
main();
