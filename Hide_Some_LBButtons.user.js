// ==UserScript==
// @name         Hide Love, Hate, and Play Buttons on ListenBrainz
// @namespace    http://tampermonkey.net/
// @downloadURL  https://github.com/YoGo9/Scripts/raw/main/Hide_Some_LBButtons.user.js
// @updateURL    https://github.com/YoGo9/Scripts/raw/main/Hide_Some_LBButtons.user.js
// @version      0.1
// @description  Hide love, hate, and play buttons on ListenBrainz
// @author       YoGo9
// @match        https://listenbrainz.org/user/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Function to hide specified elements
    function hideButtons() {
        const loveButtons = document.querySelectorAll('.listen-controls .love');
        const hateButtons = document.querySelectorAll('.listen-controls .hate');
        const playButtons = document.querySelectorAll('.listen-controls .play-button');

        loveButtons.forEach(button => button.style.display = 'none');
        hateButtons.forEach(button => button.style.display = 'none');
        playButtons.forEach(button => button.style.display = 'none');
    }

    // Run the function on page load
    window.addEventListener('load', hideButtons);
    // Run again when mutations happen (e.g., when new elements are added dynamically)
    const observer = new MutationObserver(hideButtons);
    observer.observe(document.body, { childList: true, subtree: true });
})();
