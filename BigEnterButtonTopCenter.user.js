// ==UserScript==
// @name         MusicBrainz Top Centered Edit Button
// @namespace    https://github.com/YoGo9/Scripts/
// @downloadURL  https://github.com/YoGo9/Scripts/raw/main/BigEnterButtonTopCenter.user.js
// @updateURL    https://github.com/YoGo9/Scripts/raw/main/BigEnterButtonTopCenter.user.js
// @version      1.2
// @description  Add a large, centered "Enter edit" button to the top of MusicBrainz edit pages
// @author       YoGo9
// @match        https://musicbrainz.org/*/edit*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    function insertTopEditButton() {
        const originalButton = document.querySelector('button.submit.positive[type="submit"]');
        if (!originalButton) return;

        const newButton = originalButton.cloneNode(true);

        // Make it larger and styled
        newButton.style.fontSize = '20px';
        newButton.style.padding = '12px 24px';
        newButton.style.backgroundColor = '#d1f2d1';
        newButton.style.border = '2px solid #81c784';
        newButton.style.borderRadius = '6px';
        newButton.style.boxShadow = '0 2px 6px rgba(0,0,0,0.2)';
        newButton.style.cursor = 'pointer';

        // Position it top center of the content area
        newButton.style.position = 'absolute';
        newButton.style.top = '100px';
        newButton.style.left = '50%';
        newButton.style.transform = 'translateX(-50%)';
        newButton.style.zIndex = '1000';

        originalButton.closest('form')?.appendChild(newButton);
    }

    window.addEventListener('load', insertTopEditButton);
})();
