// ==UserScript==
// @name         Wikipedia: Wikidata Tools
// @namespace    https://github.com/YoGo9/Scripts/
// @version      2025.05.11
// @description  Adds buttons to copy and visit the Wikidata entity for a Wikipedia page
// @author       YoGo9
// @match        https://*.wikipedia.org/wiki/*
// @grant        GM_setClipboard
// @license      MIT
// @homepageURL  https://github.com/YoGo9/Scripts/
// @supportURL   https://github.com/YoGo9/Scripts/issues
// @downloadURL  https://github.com/YoGo9/Scripts/raw/main/wikipedia_wikidata_buttons.user.js
// @updateURL    https://github.com/YoGo9/Scripts/raw/main/wikipedia_wikidata_buttons.user.js
// ==/UserScript==

(function () {
  'use strict';

  function createButton(label, onClick) {
    const btn = document.createElement('button');
    btn.innerText = label;
    btn.style.marginLeft = '8px';
    btn.style.padding = '6px 12px';
    btn.style.fontSize = '14px';
    btn.style.background = '#36c';
    btn.style.color = '#fff';
    btn.style.border = 'none';
    btn.style.borderRadius = '4px';
    btn.style.cursor = 'pointer';
    btn.onclick = onClick;
    return btn;
  }

  function addButtons() {
    const wikidataLink = document.querySelector('#t-wikibase a');
    const titleHeader = document.querySelector('#firstHeading');

    if (!wikidataLink || !titleHeader) return;

    const entityMatch = wikidataLink.href.match(/\/(Q\d+)/);
    if (!entityMatch) return;

    const wikidataURL = `https://www.wikidata.org/wiki/${entityMatch[1]}`;

    // Button: Copy
    const copyBtn = createButton('Copy Wikidata URL', () => {
      if (typeof GM_setClipboard !== 'undefined') {
        GM_setClipboard(wikidataURL);
      } else {
        navigator.clipboard.writeText(wikidataURL).then(() => {
          alert('Copied: ' + wikidataURL);
        });
      }
    });

    // Button: Visit
    const visitBtn = createButton('Visit Wikidata', () => {
      window.open(wikidataURL, '_blank');
    });

    // Container for buttons
    const container = document.createElement('div');
    container.style.marginTop = '10px';
    container.appendChild(copyBtn);
    container.appendChild(visitBtn);

    titleHeader.parentNode.insertBefore(container, titleHeader.nextSibling);
  }

  const observer = new MutationObserver(() => {
    if (document.querySelector('#t-wikibase a') && document.querySelector('#firstHeading')) {
      observer.disconnect();
      addButtons();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
})();
