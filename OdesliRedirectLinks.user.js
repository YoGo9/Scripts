// ==UserScript==
// @name        MusicBrainz: Add Odesli Redirect Links for Spotify, Deezer, and Apple Music
// @version     2024.10.28.7
// @description Adds "Odesli Redirect" buttons next to Spotify, Deezer, or Apple Music links in MusicBrainz release pages
// @license     MIT; https://opensource.org/licenses/MIT
// @namespace   https://github.com/YoGo9/Scripts/
// @match       *://*.musicbrainz.org/release/*
// @grant       none
// @run-at      document-idle
// ==/UserScript==

const serviceLinkRegexps = {
    spotify: /^https?:\/\/open\.spotify\.com\/album\/([0-9a-zA-Z]+)/i,
    deezer: /^https?:\/\/www\.deezer\.com\/album\/([0-9]+)/i,
    appleMusic: /^https?:\/\/music\.apple\.com\/[^/]+\/album\/[^/]+\/([0-9]+)/i
};

function addOdesliRedirectButtons() {
    const releaseRels = document.getElementById('release-relationships');
    if (!releaseRels) return;

    for (const bdi of releaseRels.getElementsByTagName('bdi')) {
        const linkText = bdi.innerText;

        for (const [service, regex] of Object.entries(serviceLinkRegexps)) {
            const matches = regex.exec(linkText);
            if (matches) {
                const id = matches[1];
                const odesliButton = document.createElement('a');

                // Set up the Odesli button attributes
                odesliButton.href = `https://odesli.co/${service === 'appleMusic' ? 'https://music.apple.com' : service === 'deezer' ? 'https://www.deezer.com' : 'https://open.spotify.com'}/album/${id}`;
                odesliButton.target = '_blank';
                odesliButton.innerText = '[odesli]';
                odesliButton.style.marginLeft = '5px'; // Small margin to separate from original link

                // Insert the Odesli button after the existing link
                bdi.parentNode.insertBefore(odesliButton, bdi.nextSibling);
            }
        }
    }
}

window.setTimeout(addOdesliRedirectButtons, 250);
