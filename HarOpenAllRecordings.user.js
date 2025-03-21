// ==UserScript==
// @name         Harmony Open All Links
// @namespace    http://tampermonkey.net/
// @downloadURL  https://github.com/YoGo9/Scripts/raw/main/OpenAllRecordings.user.js
// @updateURL    https://github.com/YoGo9/Scripts/raw/main/OpenAllRecordings.user.js
// @version      1.0
// @description  Add a button to open all recording external ID links in new tabs
// @author       YoGo9
// @match        https://harmony.pulsewidth.org.uk/release/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Create a button and add it to the page
    function addOpenAllButton() {
        const main = document.querySelector('main');
        if (!main) return;

        // Create the button with styling similar to other elements on the page
        const buttonDiv = document.createElement('div');
        buttonDiv.className = 'message';
        buttonDiv.style.marginBottom = '20px';

        // Create the icon
        const icon = document.createElement('svg');
        icon.className = 'icon';
        icon.setAttribute('width', '24');
        icon.setAttribute('height', '24');
        icon.setAttribute('stroke-width', '2');

        // Create the use element for the icon
        const iconUse = document.createElement('use');
        iconUse.setAttribute('xlink:href', '/icon-sprite.svg#external-link');
        icon.appendChild(iconUse);

        // Create a paragraph with a button
        const para = document.createElement('p');
        const button = document.createElement('button');
        button.textContent = 'Open All Recording Links in New Tabs';
        button.style.padding = '5px 10px';
        button.style.backgroundColor = '#3273dc';
        button.style.color = 'white';
        button.style.border = 'none';
        button.style.borderRadius = '4px';
        button.style.cursor = 'pointer';
        button.style.fontWeight = 'bold';

        // Add hover effect
        button.addEventListener('mouseenter', () => {
            button.style.backgroundColor = '#2366d1';
        });
        button.addEventListener('mouseleave', () => {
            button.style.backgroundColor = '#3273dc';
        });

        // Add click event
        button.addEventListener('click', openAllLinks);

        para.appendChild(button);
        buttonDiv.appendChild(icon);
        buttonDiv.appendChild(para);

        // Add counter text
        const counterSpan = document.createElement('span');
        counterSpan.id = 'link-counter';
        counterSpan.style.marginLeft = '10px';
        counterSpan.style.fontSize = '0.9em';
        para.appendChild(counterSpan);

        // Get the recordings section - first recording link
        const firstRecordingLink = document.querySelector('.message a[href*="edit-recording.url"]');

        if (firstRecordingLink) {
            // Insert before the first recording link message
            const messageParent = firstRecordingLink.closest('.message');
            main.insertBefore(buttonDiv, messageParent);
        } else {
            // If no recording links found, add at the end of main
            main.appendChild(buttonDiv);
        }

        updateLinkCounter();
    }

    // Function to open all recording links
    function openAllLinks() {
        // Only target recording links
        const linkElements = document.querySelectorAll('a[href*="edit-recording.url"]');
        const links = Array.from(linkElements);
        const totalLinks = links.length;

        // Show that we're starting to open links
        const counter = document.getElementById('link-counter');
        if (counter) {
            counter.textContent = `Opening ${totalLinks} recording links...`;
            counter.style.color = '#4caf50';
        }

        // Open links with a more reliable method
        for (let i = 0; i < links.length; i++) {
            // Using setTimeout to create a delay between each window.open call
            setTimeout(function() {
                const newWindow = window.open(links[i].href, '_blank');
                // Check if window opened successfully
                if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
                    console.warn("Popup was blocked for link:", links[i].href);
                }
            }, i * 300); // Increased delay to 300ms to avoid popup blockers
        }
    }

    // Function to update the link counter
    function updateLinkCounter() {
        // Only count recording links
        const linkElements = document.querySelectorAll('a[href*="edit-recording.url"]');
        const counter = document.getElementById('link-counter');
        if (counter) {
            counter.textContent = `(${linkElements.length} recording links found)`;
        }
    }

    // Wait for the page to fully load
    window.addEventListener('load', () => {
        setTimeout(addOpenAllButton, 500);
    });
})();
