// ==UserScript==
// @name         Wikipedia: Wikidata Links
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
    btn.style.margin = '4px';
    btn.style.padding = '6px 12px';
    btn.style.fontSize = '14px';
    btn.style.background = '#36c';
    btn.style.color = '#fff';
    btn.style.border = 'none';
    btn.style.borderRadius = '4px';
    btn.style.cursor = 'pointer';
    return Object.assign(btn, { onclick: onClick });
  }

  function addButtons() {
    const wikidataLink = document.querySelector('a[href*="wikidata.org/wiki/Special:EntityPage"]');
    const entityMatch = wikidataLink?.href?.match(/\/(Q\d+)/);
    if (!entityMatch) return;

    const wikidataURL = `https://www.wikidata.org/wiki/${entityMatch[1]}`;
    const isMobile = location.hostname.startsWith('m.');

    const copyBtn = createButton('Copy Wikidata URL', () => {
      if (typeof GM_setClipboard !== 'undefined') {
        GM_setClipboard(wikidataURL);
      } else {
        navigator.clipboard.writeText(wikidataURL).then(() => alert('Copied: ' + wikidataURL));
      }
    });

    const visitBtn = createButton('Visit Wikidata', () => {
      window.open(wikidataURL, '_blank');
    });

    const container = document.createElement('div');
    container.style.marginTop = '10px';
    container.appendChild(copyBtn);
    container.appendChild(visitBtn);

    // Insert into page depending on desktop or mobile layout
    const desktopTarget = document.querySelector('#firstHeading');
    const mobileTarget = document.querySelector('.pcs-edit-section-title');

    if (isMobile && mobileTarget) {
      mobileTarget.parentElement.appendChild(container);
    } else if (desktopTarget) {
      desktopTarget.parentNode.insertBefore(container, desktopTarget.nextSibling);
    }
  }

  const observer = new MutationObserver(() => {
    const hasWikidata = document.querySelector('a[href*="wikidata.org/wiki/Special:EntityPage"]');
    const titleExists = document.querySelector('#firstHeading, .pcs-edit-section-title');
    if (hasWikidata && titleExists) {
      observer.disconnect();
      addButtons();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
})();
