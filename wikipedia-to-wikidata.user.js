// ==UserScript==
// @name          MusicBrainz Wikipedia to Wikidata Converter
// @version       2026.8.19
// @namespace     https://github.com/YoGo9
// @author        YoGo9
// @description   Convert Wikipedia links to their equivalent Wikidata entities
// @homepageURL   https://github.com/YoGo9/Scripts
// @downloadURL   https://raw.github.com/YoGo9/Scripts/main/wikipedia-to-wikidata.user.js
// @updateURL     https://raw.github.com/YoGo9/Scripts/main/wikipedia-to-wikidata.user.js
// @supportURL    https://github.com/YoGo9/Scripts/issues
// @grant         GM_xmlhttpRequest
// @connect       wikipedia.org
// @connect       wikidata.org
// @connect       musicbrainz.org
// @match         *://*.musicbrainz.org/area/*
// @match         *://*.musicbrainz.org/artist/*
// @match         *://*.musicbrainz.org/event/*
// @match         *://*.musicbrainz.org/instrument/*
// @match         *://*.musicbrainz.org/label/*
// @match         *://*.musicbrainz.org/place/*
// @match         *://*.musicbrainz.org/release-group/*
// @match         *://*.musicbrainz.org/series/*
// @match         *://*.musicbrainz.org/url/*
// @match         *://*.musicbrainz.org/work/*
// @match         *://*.musicbrainz.org/dialog*
// @match         *://*.musicbrainz.eu/area/*
// @match         *://*.musicbrainz.eu/artist/*
// @match         *://*.musicbrainz.eu/event/*
// @match         *://*.musicbrainz.eu/instrument/*
// @match         *://*.musicbrainz.eu/label/*
// @match         *://*.musicbrainz.eu/place/*
// @match         *://*.musicbrainz.eu/release-group/*
// @match         *://*.musicbrainz.eu/series/*
// @match         *://*.musicbrainz.eu/url/*
// @match         *://*.musicbrainz.eu/work/*
// @match         *://*.musicbrainz.eu/dialog*
// ==/UserScript==

(function () {
    'use strict';

    /**
     * Entity types that support a Wikipedia (and therefore Wikidata) URL relationship.
     * Single source of truth for the @match block, the create dialog, and isEntityEditPage.
     * Excludes genre (Wikidata-only, no Wikipedia), recording, and release, which have no
     * Wikipedia relationship. See https://musicbrainz.org/relationships for coverage per type.
     */
    const WIKIPEDIA_ENTITY_TYPES = [
        'area', 'artist', 'event', 'instrument',
        'label', 'place', 'release-group', 'series', 'work'
    ];
    const WIKIPEDIA_ENTITY_ALTERNATION = WIKIPEDIA_ENTITY_TYPES.join('|');

    // Adapted from https://stackoverflow.com/a/46012210
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;

    /**
     * Sets the value of an input element which has been manipulated by React.
     * @param {HTMLInputElement} input 
     * @param {string} value 
     */
    function setReactInputValue(input, value) {
        nativeInputValueSetter.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    const nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;

    /**
     * Sets the value of a textarea input element which has been manipulated by React.
     * @param {HTMLTextAreaElement} input 
     * @param {string} value 
     */
    function setReactTextareaValue(input, value) {
        nativeTextareaValueSetter.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    /**
     * Returns the first element that is a descendant of node that matches selectors.
     * @param {string} selectors 
     * @param {ParentNode} node 
     */
    function qs(selectors, node = document) {
        return node.querySelector(selectors);
    }

    /**
     * Extracts the entity type and ID from a MusicBrainz URL (can be incomplete and/or with additional path components and query parameters).
     * @param {string} url URL of a MusicBrainz entity page.
     * @returns {{ type: string, mbid: string } | undefined} Type and ID.
     */
    function extractEntityFromURL(url) {
        const entity = url.match(/(area|artist|event|genre|instrument|label|mbid|place|recording|release|release-group|series|url|work)\/([0-9a-f-]{36})(?:$|\/|\?)/);
        return entity ? {
            type: entity[1],
            mbid: entity[2]
        } : undefined;
    }

    /**
     * Returns a promise that resolves after the given delay.
     * @param {number} ms Delay in milliseconds.
     */
    function delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    // Rate limiting implementation
    function rateLimitedQueue(operation, interval) {
        let queue = Promise.resolve();
        return (...args) => {
            const result = queue.then(() => operation(...args));
            queue = queue.then(() => delay(interval), () => delay(interval));
            return result;
        };
    }

    /**
     * Limits the number of requests for the given operation within a time interval.
     * @param {Function} operation Operation that should be rate-limited.
     * @param {number} interval Time interval (in ms).
     * @param {number} requestsPerInterval Maximum number of requests within the interval.
     * @returns {Function} Rate-limited version of the given operation.
     */
    function rateLimit(operation, interval, requestsPerInterval = 1) {
        if (requestsPerInterval == 1) {
            return rateLimitedQueue(operation, interval);
        }
        const queues = Array(requestsPerInterval).fill().map(() => rateLimitedQueue(operation, interval));
        let queueIndex = 0;
        return (...args) => {
            queueIndex = (queueIndex + 1) % requestsPerInterval;
            return queues[queueIndex](...args);
        };
    }

    /**
     * Calls to the MusicBrainz API are limited to one request per second.
     * https://musicbrainz.org/doc/MusicBrainz_API
     */
    const callAPI = rateLimit(fetch, 1000);

    /**
     * Makes a request to the MusicBrainz API of the currently used server and returns the results as JSON.
     * @param {string} endpoint Endpoint (e.g. the entity type) which should be queried.
     * @param {Record<string,string>} query Query parameters.
     * @param {string[]} inc Include parameters which should be added to the query parameters.
     */
    async function fetchFromAPI(endpoint, query = {}, inc = []) {
        if (inc.length) {
            query.inc = inc.join(' ');
        }
        query.fmt = 'json';
        const headers = {
            'Accept': 'application/json',
        };
        const response = await callAPI(`https://musicbrainz.org/ws/2/${endpoint}?${new URLSearchParams(query)}`, { headers });
        if (response.ok) {
            return response.json();
        } else {
            throw response;
        }
    }

    function fetchURL(url, options) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "GET",
                url: url,
                onload: function (response) {
                    if (400 <= response.status) {
                        reject(new Error(`HTTP error! Status: ${response.status}`,
                            { cause: response }));
                    } else {
                        resolve(response);
                    }
                },
                onabort: function (error) {
                    reject(new Error("The request was aborted.",
                        { cause: error }));
                },
                onerror: function (error) {
                    reject(new Error("There was an error with the request. See the console for more details.",
                        { cause: error }));
                },
                ontimeout: function (error) {
                    reject(new Error("The request timed out.",
                        { cause: error }));
                },
                ...options,
            });
        });
    }

    const editNoteSeparator = '\n—\n';

    /**
     * Adds the given message and a footer for the active userscript to the edit note.
     * @param {string} message Edit note message.
     */
    function addMessageToEditNote(message) {
        /** @type {HTMLTextAreaElement} */
        const editNoteInput = qs('#edit-note-text, .edit-note');
        const previousContent = editNoteInput.value.split(editNoteSeparator);
        setReactTextareaValue(editNoteInput, buildEditNote(...previousContent, message));
    }

    /**
     * Builds an edit note for the given message sections and adds a footer section for the active userscript.
     * Automatically de-duplicates the sections to reduce auto-generated message and footer spam.
     * @param {...string} sections Edit note sections.
     * @returns {string} Complete edit note content.
     */
    function buildEditNote(...sections) {
        sections = sections.map((section) => section.trim());
        if (typeof GM_info !== 'undefined') {
            sections.push(`${GM_info.script.name} (v${GM_info.script.version}, https://github.com/YoGo9/Scripts)`);
        }
        // drop empty sections and keep only the last occurrence of duplicate sections
        return sections
            .filter((section, index) => section && sections.lastIndexOf(section) === index)
            .join(editNoteSeparator);
    }

    function displayError(element, error, selector = "") {
        let p = element.querySelector("p.wikidata-converter-error");
        if (!p) {
            p = document.createElement("p");
            p.className = "error wikidata-converter-error";
            p.style.wordBreak = "break-word";
            if (selector) {
                element = element.querySelector(selector) || element;
            }
            element.insertAdjacentElement("afterend", p);
        }
        p.textContent = error.message;
    }

    function clearError(element) {
        let p = element.querySelector("p.wikidata-converter-error");
        if (p) {
            p.remove();
        }
    }

    /**
     * Checks if a URL is a Wikipedia link
     * @param {string} link URL to check
     * @returns {boolean} True if it's a Wikipedia link
     */
    function isWikipediaLink(link) {
        return link.match(/^https?:\/\/([a-z0-9-]+)\.wikipedia\.org/i) !== null;
    }

    /**
     * Checks if a URL is a Wikidata link
     * @param {string} link URL to check
     * @returns {boolean} True if it's a Wikidata link
     */
    function isWikidataLink(link) {
        return link.match(/^https?:\/\/(www\.)?wikidata\.org\/wiki\/Q[0-9]+/i) !== null;
    }

    /**
     * Extracts a Wikidata entity ID from a Wikidata URL.
     * @param {string} link URL to inspect.
     * @returns {string | undefined} Uppercase Wikidata entity ID.
     */
    function extractWikidataID(link) {
        const match = link.match(/^https?:\/\/(?:www\.)?wikidata\.org\/wiki\/(Q[0-9]+)(?:$|[?#/])/i);
        return match ? match[1].toUpperCase() : undefined;
    }

    /**
     * Extracts the language code and article title from a Wikipedia URL
     * @param {string} wikipediaUrl The full Wikipedia URL
     * @returns {Object} Object containing language and title
     */
    function parseWikipediaUrl(wikipediaUrl) {
        const match = wikipediaUrl.match(/^https?:\/\/([a-z0-9-]+)\.wikipedia\.org\/wiki\/([^?#]+)(?:[?#].*)?$/i);
        if (!match) return null;
        
        return {
            language: match[1],
            title: decodeURIComponent(match[2])
        };
    }

    /**
     * Converts a Wikipedia URL to a Wikidata URL
     * @param {string} wikipediaUrl Full Wikipedia URL
     * @returns {Promise<string>} Promise resolving to Wikidata URL
     */
    async function getWikidataUrlFromWikipedia(wikipediaUrl) {
        const wikipediaInfo = parseWikipediaUrl(wikipediaUrl);
        if (!wikipediaInfo) {
            throw new Error("Invalid Wikipedia URL format");
        }

        // Call the Wikipedia API to get the Wikidata entity ID
        const apiUrl = `https://${wikipediaInfo.language}.wikipedia.org/w/api.php?action=query&prop=pageprops&titles=${encodeURIComponent(wikipediaInfo.title)}&format=json&origin=*`;
        
        try {
            const response = await fetchURL(apiUrl);
            const data = JSON.parse(response.responseText);
            
            // Extract the page ID (first key in pages object)
            const pages = data.query.pages;
            const pageId = Object.keys(pages)[0];
            
            if (pageId === "-1") {
                throw new Error("Wikipedia page not found");
            }
            
            // Get the Wikidata entity ID
            const wikidataId = pages[pageId].pageprops?.wikibase_item;
            
            if (!wikidataId) {
                throw new Error("No Wikidata entity found for this Wikipedia article");
            }
            
            return `https://www.wikidata.org/wiki/${wikidataId}`;
        } catch (error) {
            console.error("Error fetching Wikidata ID:", error);
            throw new Error("Failed to get Wikidata ID: " + (error.message || "Unknown error"));
        }
    }

    function fixLinkOnNonURLPage(span) {
        const tableRow = span.parentElement.parentElement;
        const observer = new MutationObserver(function () {
            const dialog = document.querySelector("#url-input-popover");
            const urlInput = dialog?.querySelector("input.raw-url");
            const doneButton = dialog?.querySelector("button.positive");

            if (!urlInput || !doneButton) {
                return;
            }

            setReactInputValue(urlInput, tableRow.getAttribute("newLink"));
            observer.disconnect();

            // Let React process the input event before accepting the dialog.
            setTimeout(function () {
                doneButton.click();
                addMessageToEditNote(tableRow.getAttribute("oldLink")
                    + " → "
                    + tableRow.getAttribute("newLink"));
            }, 0);
        });
        observer.observe(document.body, { childList: true, subtree: true });
        if (tableRow.getAttribute("newLink")) {
            tableRow.querySelector("td.link-actions > button.edit-item").click();
            return;
        }
        tableRow.querySelector(".wikidata-converter-button").disabled = true;
        clearError(tableRow);
        getWikidataUrlFromWikipedia(tableRow.querySelector("td > a").href)
            .then(function (wikidataLink) {
                tableRow.setAttribute("oldLink", tableRow.querySelector("td > a").href);
                tableRow.setAttribute("newLink", wikidataLink);
                tableRow.querySelector("td.link-actions > button.edit-item").click();
            })
            .catch(function (error) {
                console.warn(error);
                displayError(tableRow, error, "a.url");
                observer.disconnect();
            })
            .finally(function () {
                tableRow.querySelector(".wikidata-converter-button").disabled = false;
            });
    }

    function addFixerUpperButton(currentSpan) {
        const tableRow = currentSpan.parentElement.parentElement;
        const linkElement = tableRow.querySelector("a.url");
        if (!linkElement || isWikidataLink(linkElement.href) || !isWikipediaLink(linkElement.href) || 
            tableRow.querySelector('.wikidata-converter-button')) {
            return;
        }
        let button = document.createElement('button');
        button.addEventListener("click", (function () { fixLinkOnNonURLPage(currentSpan); }));
        button.type = 'button';
        button.innerHTML = "Convert to Wikidata";
        button.className = 'styled-button wikidata-converter-button';
        button.style.float = 'right';

        let td = document.createElement('td');
        td.className = "wikidata-converter-td";
        td.appendChild(button);
        currentSpan.parentElement.parentElement.appendChild(td);
    }

    /**
     * Waits until a condition returns a truthy value.
     * @param {Function} condition Condition to evaluate after DOM changes.
     * @param {string} errorMessage Error used when the timeout is reached.
     * @param {number} timeout Maximum wait in milliseconds.
     * @returns {Promise<*>} The truthy value returned by the condition.
     */
    function waitForCondition(condition, errorMessage, timeout = 5000) {
        return new Promise((resolve, reject) => {
            let timeoutID;
            const observer = new MutationObserver(() => {
                const result = condition();
                if (result) {
                    clearTimeout(timeoutID);
                    observer.disconnect();
                    resolve(result);
                }
            });
            const initialResult = condition();
            if (initialResult) {
                resolve(initialResult);
                return;
            }
            observer.observe(document.body, { childList: true, subtree: true, attributes: true });
            timeoutID = setTimeout(() => {
                observer.disconnect();
                reject(new Error(errorMessage));
            }, timeout);
        });
    }

    function getExternalLinkRows() {
        return Array.from(document.querySelectorAll(
            "#external-links-editor tr.external-link-item"
        ));
    }

    function getActiveWikipediaRows() {
        return getExternalLinkRows().filter((row) => {
            const link = row.querySelector("a.url");
            return link
                && isWikipediaLink(link.href)
                && !link.classList.contains("rel-remove");
        });
    }

    function getActiveWikidataIDs() {
        const wikidataIDs = new Set();
        getExternalLinkRows().forEach((row) => {
            const link = row.querySelector("a.url");
            if (!link || link.classList.contains("rel-remove")) {
                return;
            }
            const wikidataID = extractWikidataID(link.href);
            if (wikidataID) {
                wikidataIDs.add(wikidataID);
            }
        });
        return wikidataIDs;
    }

    async function addWikidataLinkToEditPage(wikidataURL) {
        const wikidataID = extractWikidataID(wikidataURL);
        if (!wikidataID) {
            throw new Error("The converted Wikidata URL is invalid");
        }

        const emptyInput = await waitForCondition(
            () => Array.from(document.querySelectorAll(
                '#external-links-editor input.value[type="url"]'
            )).find((input) => !input.value.trim()),
            "Could not find the Add another link field"
        );

        setReactInputValue(emptyInput, wikidataURL);
        await delay(50);

        const updatedInput = Array.from(document.querySelectorAll(
            '#external-links-editor input.value[type="url"]'
        )).find((input) => input.value === wikidataURL) || emptyInput;

        // MusicBrainz submits a newly entered external link when the field loses focus.
        updatedInput.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));

        try {
            return await waitForCondition(
                () => getExternalLinkRows().find((row) => {
                    const link = row.querySelector("a.url");
                    return link
                        && !link.classList.contains("rel-remove")
                        && extractWikidataID(link.href) === wikidataID;
                }),
                "MusicBrainz did not accept the new Wikidata link",
                1500
            );
        } catch (error) {
            // Fall back to a real focus change for browsers that do not synthesize focusout.
            if (updatedInput.isConnected) {
                updatedInput.focus();
                updatedInput.blur();
            }
            return waitForCondition(
                () => getExternalLinkRows().find((row) => {
                    const link = row.querySelector("a.url");
                    return link
                        && !link.classList.contains("rel-remove")
                        && extractWikidataID(link.href) === wikidataID;
                }),
                "MusicBrainz did not accept the new Wikidata link"
            );
        }
    }

    async function markWikipediaLinkForRemoval(row) {
        const removeButton = row.querySelector("td.link-actions > button.remove-item");
        if (!removeButton) {
            throw new Error("Could not find the remove button for the Wikipedia link");
        }
        removeButton.click();
        await waitForCondition(
            () => !row.isConnected || row.querySelector("a.url.rel-remove"),
            "MusicBrainz did not mark the Wikipedia link for removal"
        );
    }

    function displayConverterStatus(container, message, isError = false) {
        let status = container.querySelector(".wikidata-converter-status");
        if (!status) {
            status = document.createElement("p");
            status.className = "wikidata-converter-status";
            status.style.margin = "0.5em 0";
            container.appendChild(status);
        }
        status.classList.toggle("error", isError);
        status.textContent = message;
    }

    async function convertAllWikipediaLinks(button) {
        const container = button.parentElement;
        const wikipediaRows = getActiveWikipediaRows();
        if (!wikipediaRows.length) {
            displayConverterStatus(container, "No active Wikipedia links were found.");
            return;
        }

        button.disabled = true;
        button.textContent = `Converting 0/${wikipediaRows.length}…`;
        displayConverterStatus(container, "Looking up Wikidata links…");

        const lookups = await Promise.all(wikipediaRows.map(async (row) => {
            const wikipediaLink = row.querySelector("a.url").href;
            try {
                const wikidataLink = await getWikidataUrlFromWikipedia(wikipediaLink);
                return { row, wikipediaLink, wikidataLink };
            } catch (error) {
                return { row, wikipediaLink, error };
            }
        }));

        const activeWikidataIDs = getActiveWikidataIDs();
        const errors = [];
        let converted = 0;

        for (const lookup of lookups) {
            if (lookup.error) {
                errors.push(`${lookup.wikipediaLink}: ${lookup.error.message}`);
                continue;
            }

            const wikidataID = extractWikidataID(lookup.wikidataLink);
            try {
                if (!activeWikidataIDs.has(wikidataID)) {
                    await addWikidataLinkToEditPage(lookup.wikidataLink);
                    activeWikidataIDs.add(wikidataID);
                }
                await markWikipediaLinkForRemoval(lookup.row);
                addMessageToEditNote(lookup.wikipediaLink
                    + " → "
                    + lookup.wikidataLink);
                converted++;
                button.textContent = `Converting ${converted}/${wikipediaRows.length}…`;
            } catch (error) {
                errors.push(`${lookup.wikipediaLink}: ${error.message}`);
            }
        }

        button.disabled = false;
        button.textContent = "Convert all Wikipedia links to Wikidata";
        if (errors.length) {
            displayConverterStatus(
                container,
                `Converted ${converted} link${converted === 1 ? "" : "s"}. `
                    + `${errors.length} failed: ${errors.join(" | ")}`,
                true
            );
        } else {
            displayConverterStatus(
                container,
                `Converted ${converted} Wikipedia link${converted === 1 ? "" : "s"}.`
            );
        }
    }

    function addConvertAllButtonToEditPage() {
        const editor = document.querySelector("#external-links-editor");
        if (!editor || document.querySelector(".wikidata-converter-all-container")) {
            return;
        }

        const container = document.createElement("div");
        container.className = "wikidata-converter-all-container";
        container.style.marginBottom = "1em";

        const button = document.createElement("button");
        button.type = "button";
        button.className = "styled-button wikidata-converter-all-button";
        button.textContent = "Convert all Wikipedia links to Wikidata";
        button.addEventListener("click", () => convertAllWikipediaLinks(button));

        container.appendChild(button);
        editor.insertAdjacentElement("beforebegin", container);
    }

    function runOnEntityEditPage() {
        addConvertAllButtonToEditPage();
        const observer = new MutationObserver(addConvertAllButtonToEditPage);
        observer.observe(
            document.querySelector("#external-links-editor-container") || document.body,
            { childList: true, subtree: true }
        );
    }

    function highlightWikipediaLinks() {
        document.querySelectorAll(".external_links .wikipedia-favicon")
            .forEach(function (listItem) {
                const wikiLink = listItem.querySelector('a').href;
                if (isWikipediaLink(wikiLink) && !isWikidataLink(wikiLink)) {
                    const linkButton = document.createElement('a');
                    linkButton.className = "styled-button wikidata-converter-button";
                    linkButton.style.float = "right";
                    linkButton.textContent = "Convert to Wikidata";
                    const entity = extractEntityFromURL(document.location.href);
                    fetchFromAPI(entity.type + "/" + entity.mbid,
                        { "inc": "url-rels" })
                        .then((response) => {
                            let urlID = false;
                            for (const urlObject of response.relations) {
                                if (urlObject.url.resource == wikiLink) {
                                    urlID = urlObject.url.id;
                                    break;
                                }
                            }
                            if (urlID) {
                                linkButton.href = document.location.origin + "/url/" + urlID + "/edit";
                                listItem.appendChild(linkButton);
                            }
                        })
                        .catch((error) => {
                            console.error(error);
                            displayError(listItem, error, ".wikidata-converter-button");
                        });
                }
            });
    }

    function runUserscript() {
        highlightWikipediaLinks();
        const target = document.querySelector("#external-links-editor-container");
        if (target) {
            const observer = new MutationObserver(function (mutations) {
                mutations.forEach(function (mutation) {
                    if (mutation.addedNodes.length > 0
                        && (mutation.addedNodes.item(0).id == "external-links-editor"
                            || (mutation.addedNodes.item(0).classList
                                && mutation.addedNodes.item(0).classList.contains("url")
                                && isWikipediaLink(mutation.addedNodes.item(0).href)))) {
                        document.querySelectorAll(".wikipedia-favicon")
                            .forEach(addFixerUpperButton);
                    }
                    if (mutation.removedNodes.length > 0
                        && mutation.removedNodes.item(0).classList
                        && mutation.removedNodes.item(0).classList.contains("url")) {
                        if (mutation.target.nextElementSibling && 
                            mutation.target.nextElementSibling.classList.contains("wikidata-converter-td")) {
                            mutation.target.nextElementSibling.remove();
                        }
                        const tableRow = mutation.target.parentElement;
                        tableRow.removeAttribute("oldLink");
                        tableRow.removeAttribute("newLink");
                        clearError(tableRow);
                    }
                });
            });
            observer.observe(target, { childList: true, subtree: true });
        }
    }

    function fixLinkURLEdit(row) {
        const urlInput = row.querySelector("input#id-edit-url\\.url");
        const button = row.querySelector("button.wikidata-converter-button");
        urlInput.setAttribute("oldLink", urlInput.value);
        button.disabled = true;
        clearError(row);
        getWikidataUrlFromWikipedia(urlInput.value)
            .then((wikidataURL) => {
                setReactInputValue(urlInput, wikidataURL);
                addMessageToEditNote(urlInput.getAttribute("oldLink")
                    + " → "
                    + wikidataURL);
            })
            .catch((error) => {
                console.warn(error);
                displayError(row, error, ".wikidata-converter-button");
            })
            .finally(() => {
                button.disabled = false;
            });
    }

    function runOnURLEditPage() {
        const urlInput = document.querySelector("input#id-edit-url\\.url");
        if (!urlInput) {
            return;
        }
        if (!isWikipediaLink(urlInput.value) || isWikidataLink(urlInput.value)) {
            return;
        }
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = "Convert to Wikidata";
        button.className = "styled-button wikidata-converter-button";
        button.addEventListener("click", function () { fixLinkURLEdit(urlInput.parentElement); });
        urlInput.insertAdjacentElement("afterend", button);
    }

    function isEntityEditPage() {
        return new RegExp(
            `^/(${WIKIPEDIA_ENTITY_ALTERNATION})/[0-9a-f-]{36}/edit/?$`, 'i'
        ).test(document.location.pathname);
    }

    const location = document.location.href;
    if (location.match("^https?://((beta|test)\\.)?musicbrainz\\.(org|eu)/dialog")) {
        const dialogPath = new URLSearchParams(document.location.search).get("path");
        if (dialogPath && new RegExp(`^/(${WIKIPEDIA_ENTITY_ALTERNATION})/create`).test(dialogPath)) {
            runUserscript();
        }
    } else if (location.match("^https?://((beta|test)\\.)?musicbrainz\\.(org|eu)/url")) {
        runOnURLEditPage();
    } else if (isEntityEditPage()) {
        runOnEntityEditPage();
    } else {
        runUserscript();
    }

})();
