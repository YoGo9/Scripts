// ==UserScript==
// @name         OneClickClearAnnotation
// @namespace    https://github.com/YoGo9/Scripts
// @version      1.1
// @description  Adds a red "Clear Annotation" button on any MusicBrainz /edit_annotation page that clears the annotation, fills the edit note, and submits automatically
// @author       YoGo9
// @homepage     https://github.com/YoGo9/Scripts
// @updateURL    https://raw.githubusercontent.com/YoGo9/Scripts/main/OneClickClearAnnotation.user.js
// @downloadURL  https://raw.githubusercontent.com/YoGo9/Scripts/main/OneClickClearAnnotation.user.js
// @supportURL   https://github.com/YoGo9/Scripts/issues
// @match        https://musicbrainz.org/*/edit_annotation
// @match        https://beta.musicbrainz.org/*/edit_annotation
// @match        https://test.musicbrainz.org/*/edit_annotation
// @grant        none
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';
  if (!/\/edit_annotation$/.test(location.pathname)) return;

  // Wait helper (resolves the first time all selectors are found, or times out)
  function waitFor(selectors, timeout = 8000) {
    return new Promise((resolve, reject) => {
      const start = performance.now();
      const tryFind = () => {
        const els = selectors.map(sel => document.querySelector(sel));
        if (els.every(Boolean)) return resolve(els);
        if (performance.now() - start > timeout) return reject(new Error('Timeout waiting for elements'));
        requestAnimationFrame(tryFind);
      };
      tryFind();
    });
  }

  // Robust selectors for the three things we need
  const annotationSel = [
    'textarea#annotation',
    'textarea[name="annotation"]',
    'textarea[name="edit-annotation.text"]',
    'textarea[name$="annotation.text"]',
  ].join(',');

  const editNoteSel = [
    'textarea#edit-note',
    'textarea[name="edit-note"]',
    'textarea[name$="edit_note"]',
    'textarea[name$="edit-note"]',
  ].join(',');

  const formSel = [
    'form[action*="/edit_annotation"]',
    'form[action$="/edit"]',
    'form[action*="/edit"]',
    'form' // fallback
  ].join(',');

  waitFor([annotationSel, editNoteSel, formSel]).then(init).catch(() => {
    // silently give up if the page never exposes the fields (rare)
  });

  function init([annotationEl, editNoteEl, formEl]) {
    // Try to find the "Enter edit" button (several fallbacks)
    let enterBtn =
      document.querySelector('.buttons input[type="submit"].positive') ||
      document.querySelector('.buttons button.positive[type="submit"]') ||
      Array.from(formEl.querySelectorAll('input[type="submit"],button[type="submit"]'))
        .find(el => /enter/i.test((el.value || el.textContent || '').trim()));

    // Create our red button
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Clear Annotation';
    Object.assign(btn.style, {
      marginLeft: '10px',
      padding: '5px 12px',
      border: '1px solid #a00',
      borderRadius: '4px',
      color: '#a00',
      backgroundColor: '#fff5f5',
      fontWeight: 'bold',
      cursor: 'pointer',
    });

    // Place it next to the Enter edit button if possible; otherwise above edit note
    if (enterBtn && enterBtn.parentElement) {
      enterBtn.parentElement.insertBefore(btn, enterBtn);
    } else if (editNoteEl && editNoteEl.parentElement) {
      editNoteEl.parentElement.insertBefore(btn, editNoteEl);
    } else {
      formEl.insertBefore(btn, formEl.firstChild);
    }

    // Properly set textarea values (works with any event bindings)
    function setText(el, text) {
      const proto = Object.getPrototypeOf(el);
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      setter ? setter.call(el, text) : (el.value = text);
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    btn.addEventListener('click', () => {
      // 1) Clear annotation
      setText(annotationEl, '');

      // 2) Fill edit note
      setText(editNoteEl, 'Copyright info moved to relationships');

      // 3) Submit
      if (enterBtn && typeof enterBtn.click === 'function') {
        enterBtn.click();
      } else if (typeof formEl.requestSubmit === 'function') {
        // Try to prefer a positive/primary submit if present
        const preferred =
          document.querySelector('.buttons input[type="submit"].positive, .buttons button.positive[type="submit"]') ||
          null;
        formEl.requestSubmit(preferred || undefined);
      } else {
        formEl.submit();
      }
    });
  }
})();
