// ==UserScript==
// @name          MusicBrainz Wikipedia to Wikidata Converter
// @version       2025.6.16
// @namespace     https://github.com/YoGo9
// @author        YoGo9
// @description   Convert Wikipedia links to Wikidata and update relationships accordingly
// @homepageURL   https://github.com/YoGo9/Scripts
// @downloadURL   https://raw.github.com/YoGo9/Scripts/main/wikipedia-to-wikidata.user.js
// @updateURL     https://raw.github.com/YoGo9/Scripts/main/wikipedia-to-wikidata.user.js
// @supportURL    https://github.com/YoGo9/Scripts/issues
// @grant         GM_xmlhttpRequest
// @connect       wikipedia.org
// @connect       wikidata.org
// @connect       musicbrainz.org
// @match         *://*.musicbrainz.org/artist/*
// @match         *://*.musicbrainz.org/event/*
// @match         *://*.musicbrainz.org/label/*
// @match         *://*.musicbrainz.org/place/*
// @match         *://*.musicbrainz.org/release-group/*
// @match         *://*.musicbrainz.org/series/*
// @match         *://*.musicbrainz.org/url/*
// @match         *://*.musicbrainz.org/dialog*
// ==/UserScript==

(function () {
    'use strict';

    const qs = (s, el = document) => el.querySelector(s);
    const qsa = (s, el = document) => el.querySelectorAll(s);

    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    const nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;

    function setReactInputValue(input, value) {
        nativeInputValueSetter.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function setReactTextareaValue(input, value) {
        nativeTextareaValueSetter.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    const delay = ms => new Promise(res => setTimeout(res, ms));

    function fetchURL(url, options) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                url: url,
                onload: r => r.status >= 400 ? reject(new Error(`HTTP error: ${r.status}`)) : resolve(r),
                onabort: e => reject(new Error("Request aborted.", { cause: e })),
                onerror: e => reject(new Error("Request failed.", { cause: e })),
                ontimeout: e => reject(new Error("Request timed out.", { cause: e })),
                ...options,
            });
        });
    }

    function isWikipediaLink(link) {
        return /^https?:\/\/([a-z]+)\.wikipedia\.org/i.test(link);
    }

    function isWikidataLink(link) {
        return /^https?:\/\/(www\.)?wikidata\.org\/wiki\/Q[0-9]+/i.test(link);
    }

    function parseWikipediaUrl(url) {
        const m = url.match(/^https?:\/\/([a-z]+)\.wikipedia\.org\/wiki\/(.+)$/i);
        return m ? { language: m[1], title: decodeURIComponent(m[2]) } : null;
    }

    async function getWikidataUrlFromWikipedia(wikipediaUrl) {
        const info = parseWikipediaUrl(wikipediaUrl);
        if (!info) throw new Error("Invalid Wikipedia URL");
        const apiUrl = `https://${info.language}.wikipedia.org/w/api.php?action=query&prop=pageprops&titles=${encodeURIComponent(info.title)}&format=json&origin=*`;
        const res = await fetchURL(apiUrl);
        const json = JSON.parse(res.responseText);
        const pages = json.query.pages;
        const pageId = Object.keys(pages)[0];
        if (pageId === "-1") throw new Error("Wikipedia page not found");
        const id = pages[pageId].pageprops?.wikibase_item;
        if (!id) throw new Error("No Wikidata ID found");
        return `https://www.wikidata.org/wiki/${id}`;
    }

    function clearError(el) {
        el.querySelector(".wikidata-converter-error")?.remove();
    }

    function displayError(el, error, selector = "") {
        let p = document.createElement("p");
        p.className = "error wikidata-converter-error";
        p.style.wordBreak = "break-word";
        p.textContent = error.message;
        const container = selector ? el.querySelector(selector) || el : el;
        container.insertAdjacentElement("afterend", p);
    }

    function addMessageToEditNote(msg) {
        const input = qs('#edit-note-text, .edit-note');
        const current = input.value.split('\n—\n');
        setReactTextareaValue(input, [...new Set([...current.map(t => t.trim()), msg, `${GM_info.script.name} (v${GM_info.script.version})`])].join('\n—\n'));
    }

    function displaySuccessMessage(msg) {
        let p = document.createElement("p");
        p.className = "success wikidata-converter-success";
        p.style.wordBreak = "break-word";
        p.textContent = msg;
        const target = qs('.row.no-label.buttons') || qs('#content');
        target.insertAdjacentElement("afterend", p);
        setTimeout(() => p.remove(), 5000);
    }

    function waitForElement(selector, parent = document.body, timeout = 5000) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                observer.disconnect();
                reject(new Error(`Timeout: ${selector}`));
            }, timeout);
            const observer = new MutationObserver(() => {
                const el = qs(selector, parent);
                if (el) {
                    clearTimeout(timer);
                    observer.disconnect();
                    resolve(el);
                }
            });
            observer.observe(parent, { childList: true, subtree: true });
            const el = qs(selector, parent);
            if (el) {
                clearTimeout(timer);
                observer.disconnect();
                resolve(el);
            }
        });
    }

    function waitForElementRemoval(selector, parent = document.body, timeout = 5000) {
        return new Promise((resolve, reject) => {
            if (!qs(selector, parent)) return resolve();
            const timer = setTimeout(() => {
                observer.disconnect();
                reject(new Error(`Timeout removal: ${selector}`));
            }, timeout);
            const observer = new MutationObserver(() => {
                if (!qs(selector, parent)) {
                    clearTimeout(timer);
                    observer.disconnect();
                    resolve();
                }
            });
            observer.observe(parent, { childList: true, subtree: true });
        });
    }

    async function handleRelationshipDialog(dialog) {
        await delay(100);
        const typeInput = await waitForElement("input[id^='relationship-type-']", dialog, 2000);
        typeInput.click();
        await delay(50);

        const texts = ["Wikidata / Wikidata page for", "Wikidata page for / Wikidata"];
        let option = [...qsa("li[role='option']", document.body)].find(el => texts.includes(el.textContent.trim()));

        if (!option) {
            const input = await waitForElement(".ui-autocomplete-input", dialog, 2000);
            setReactInputValue(input, texts[0]);
            await delay(300);
            option = [...qsa("li[role='option']", document.body)].find(el => texts.includes(el.textContent.trim()));
        }

        option?.click();
        await delay(50);
        const done = qs("div.buttons > div > button", dialog);
        done?.click();
        await delay(100);
    }

    async function fixLinkURLEdit(row) {
        const input = row.querySelector("input#id-edit-url\\.url");
        const button = row.querySelector("button.wikidata-converter-button");
        input.setAttribute("oldLink", input.value);
        button.disabled = true;
        clearError(row);

        let success = false;
        let allHandled = false;

        try {
            const wikidataURL = await getWikidataUrlFromWikipedia(input.value);
            setReactInputValue(input, wikidataURL);
            addMessageToEditNote(`${input.getAttribute("oldLink")} → ${wikidataURL}`);
            success = true;

            const editor = qs("#relationship-editor");
            if (editor) {
                const rows = [...editor.querySelectorAll("tr.wikipedia-page-for")];
                let total = 0, done = 0;

                for (const tr of rows) {
                    const items = [...tr.querySelectorAll(".relationship-item")];
                    total += items.length;
                    for (const item of items) {
                        const edit = item.querySelector(".edit-item");
                        if (edit) {
                            edit.click();
                            try {
                                const dialog = await waitForElement("#edit-relationship-dialog", document.body, 5000);
                                await handleRelationshipDialog(dialog);
                                await waitForElementRemoval("#edit-relationship-dialog", document.body, 5000);
                                await delay(300);
                            } catch {
                                const dialog = qs("#edit-relationship-dialog");
                                dialog?.querySelector("button")?.click();
                                await delay(300);
                            }
                        }
                        done++;
                    }
                }
                allHandled = total === done;
            } else {
                allHandled = true;
            }
        } catch (e) {
            console.warn(e);
            displayError(row, e, ".wikidata-converter-button");
        } finally {
            button.disabled = false;
            const checkbox = qs('#id-edit-url\\.make_votable');
            if (checkbox) {
                checkbox.checked = true;
                checkbox.dispatchEvent(new Event('change', { bubbles: true }));
            }

            const submit = qs("button.submit.positive");
            if (submit) {
                await delay(500);
                submit.click();
                displaySuccessMessage(success
                    ? "Wikipedia URL successfully converted to Wikidata and submitted!"
                    : "Wikipedia conversion failed but relationships removed and submitted.");
            }
        }
    }

    function runOnURLEditPage() {
        const input = qs("input#id-edit-url\\.url");
        if (!input || !isWikipediaLink(input.value) || isWikidataLink(input.value)) return;

        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = "Convert to Wikidata";
        btn.className = "styled-button wikidata-converter-button";
        btn.onclick = () => fixLinkURLEdit(input.closest("td") || input.parentElement);
        input.insertAdjacentElement("afterend", btn);
    }

    const loc = location.href;
    if (loc.includes("/url/")) {
        runOnURLEditPage();
    }
})();
