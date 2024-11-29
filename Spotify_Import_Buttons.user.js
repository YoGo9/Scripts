// ==UserScript==
// @name         Spotify Import Buttons (a-tisket & Harmony)
// @namespace    http://tampermonkey.net/
// @downloadURL  https://github.com/YoGo9/Scripts/raw/main/Spotify_Import_Buttons.user.js
// @updateURL    https://github.com/YoGo9/Scripts/raw/main/Spotify_Import_Buttons.user.js
// @version      0.3
// @description  Adds buttons to Spotify album pages to import the album into a-tisket and Harmony.
// @author       YoMo
// @match        https://open.spotify.com/album/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Create a container for the buttons
    const buttonContainer = document.createElement('div');
    buttonContainer.style.position = 'fixed';
    buttonContainer.style.bottom = '20px';
    buttonContainer.style.right = '20px';
    buttonContainer.style.zIndex = '1000';
    buttonContainer.style.display = 'flex';
    buttonContainer.style.gap = '10px';

    // Common button styles
    const buttonStyle = {
        padding: '10px',
        fontSize: '1em',
        backgroundColor: '#1DB954',
        color: 'white',
        border: 'none',
        borderRadius: '5px',
        cursor: 'pointer'
    };

    // Function to apply styles to buttons
    function applyStyles(button, styles) {
        for (const property in styles) {
            button.style[property] = styles[property];
        }
    }

    // Create the "Import to a-tisket" button
    const atisketButton = document.createElement('button');
    atisketButton.textContent = 'Import to a-tisket';
    applyStyles(atisketButton, buttonStyle);

    atisketButton.onclick = function() {
        const currentPage = window.location.href;
        const spotID = currentPage.replace(/^(https\:\/\/open\.spotify\.com\/album\/)+/, '').split('?')[0];
        const newURL = "https://atisket.pulsewidth.org.uk/?spf_id=" + spotID;
        window.open(newURL, '_blank').focus();
    };

    // Create the "Import to Harmony" button
    const harmonyButton = document.createElement('button');
    harmonyButton.textContent = 'Import to Harmony';
    applyStyles(harmonyButton, buttonStyle);

    harmonyButton.onclick = function() {
        const currentPage = window.location.href;
        const newURL = "https://harmony.pulsewidth.org.uk/release?url=" + encodeURIComponent(currentPage) + "&category=all";
        window.open(newURL, '_blank').focus();
    };

    // Append buttons to the container
    buttonContainer.appendChild(atisketButton);
    buttonContainer.appendChild(harmonyButton);

    // Append the container to the body of the page
    document.body.appendChild(buttonContainer);
})();
