// ==UserScript==
// @name         Harmony Open All Links
// @namespace    http://tampermonkey.net/
// @downloadURL  https://github.com/YoGo9/Scripts/raw/main/HarmonyOpenAllRecordings.user.js
// @updateURL    https://github.com/YoGo9/Scripts/raw/main/HarmonyOpenAllRecordings.user.js
// @version      1.4
// @description  Opens all MB recording edit links from Harmony. Submits and closes tabs automatically on MB edit pages with a bookmarklet.
// @author       YoGo9
// @match        https://harmony.pulsewidth.org.uk/release/*
// @match        https://*.musicbrainz.org/recording/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
  'use strict';

  const STORAGE_KEY = 'harmony_submitted';

  // MUSICBRAINZ SUBMIT LISTENER + CLOSE AFTER SUCCESS
  if (location.hostname.endsWith("musicbrainz.org") && location.href.includes("/edit")) {
    const channel = new BroadcastChannel('mb_edit_channel');

    // Part 1: Listen for submit trigger
    channel.addEventListener('message', (e) => {
      if (e.data === 'submit-edit') {
        const btn = document.querySelector('button.submit.positive[type="submit"]');
        if (btn) {
          sessionStorage.setItem(STORAGE_KEY, 'true');
          btn.click();
        }
      }
    });

    console.log("✅ MB Submit Listener Active");
  }


  // Part 2: Check if submission was triggered and current URL indicates success
  const wasSubmitted = sessionStorage.getItem(STORAGE_KEY) === 'true';
  const isSuccessUrl = /^https:\/\/(beta\.)?musicbrainz\.org\/recording\/[a-f0-9-]{36}\/?$/.test(location.href);

  if (wasSubmitted && isSuccessUrl) {
    sessionStorage.removeItem(STORAGE_KEY);
    console.log("✅ Submission successful, closing tab...");
    setTimeout(() => window.close(), 200);
  }


  // HARMONY OPEN ALL RECORDING LINKS
  if (location.hostname === "harmony.pulsewidth.org.uk") {
    function addOpenAllButton() {
      const main = document.querySelector('main');
      if (!main) return;

      const buttonDiv = document.createElement('div');
      buttonDiv.className = 'message';
      buttonDiv.style.marginBottom = '20px';

      const icon = document.createElement('svg');
      icon.className = 'icon';
      icon.setAttribute('width', '24');
      icon.setAttribute('height', '24');
      icon.setAttribute('stroke-width', '2');
      const iconUse = document.createElement('use');
      iconUse.setAttribute('xlink:href', '/icon-sprite.svg#external-link');
      icon.appendChild(iconUse);

      const para = document.createElement('p');
      const button = document.createElement('button');
      button.textContent = 'Open All Recording Links in New Tabs';
      Object.assign(button.style, {
        padding: '5px 10px',
        backgroundColor: '#3273dc',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontWeight: 'bold'
      });

      button.addEventListener('mouseenter', () => button.style.backgroundColor = '#2366d1');
      button.addEventListener('mouseleave', () => button.style.backgroundColor = '#3273dc');
      button.addEventListener('click', openAllLinks);

      para.appendChild(button);
      const counterSpan = document.createElement('span');
      counterSpan.id = 'link-counter';
      counterSpan.style.marginLeft = '10px';
      counterSpan.style.fontSize = '0.9em';
      para.appendChild(counterSpan);

      buttonDiv.appendChild(icon);
      buttonDiv.appendChild(para);

      const firstLink = document.querySelector('.message a[href*="edit-recording.url"]');
      const insertTarget = firstLink?.closest('.message');
      if (insertTarget) {
        main.insertBefore(buttonDiv, insertTarget);
      } else {
        main.appendChild(buttonDiv);
      }

      updateLinkCounter();
    }

    function openAllLinks() {
      const linkElements = document.querySelectorAll('a[href*="edit-recording.url"]');
      const links = Array.from(linkElements);
      const counter = document.getElementById('link-counter');
      if (counter) {
        counter.textContent = `Opening ${links.length} recording links...`;
        counter.style.color = '#4caf50';
      }

      for (let i = 0; i < links.length; i++) {
        setTimeout(() => {
          const newWindow = window.open(links[i].href, '_blank');
          if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
            console.warn("Popup was blocked for link:", links[i].href);
          }
        }, i * 300);
      }
    }

    function updateLinkCounter() {
      const linkElements = document.querySelectorAll('a[href*="edit-recording.url"]');
      const counter = document.getElementById('link-counter');
      if (counter) {
        counter.textContent = `(${linkElements.length} recording links found)`;
      }
    }

    addOpenAllButton();
  }
})();
