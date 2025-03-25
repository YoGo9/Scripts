// ==UserScript==
// @name         MusicBrainz Customizable Language Selector
// @namespace    https://github.com/YoGo9/Scripts
// @version      1.0
// @description  Add customizable quick-select buttons for languages in MusicBrainz release editor
// @author       YoGo9
// @homepage     https://github.com/YoGo9/Scripts
// @updateURL    https://raw.githubusercontent.com/YoGo9/Scripts/main/SetLanguageInReleaseEditor.user.js
// @downloadURL  https://raw.githubusercontent.com/YoGo9/Scripts/main/SetLanguageInReleaseEditor.user.js
// @supportURL   https://github.com/YoGo9/Scripts/issues
// @match        https://musicbrainz.org/release/*/edit
// @match        https://beta.musicbrainz.org/release/*/edit
// @grant        GM_setValue
// @grant        GM_getValue
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';
    
    // Default settings - modify these for your preferred languages
    const DEFAULT_LANGUAGES = ['Hebrew', 'Yiddish'];
    const DEFAULT_SCRIPTS = ['Hebrew'];
    
    // Load user settings or use defaults
    let preferredLanguages = GM_getValue('mbLanguages', DEFAULT_LANGUAGES);
    let preferredScripts = GM_getValue('mbScripts', DEFAULT_SCRIPTS);
    
    // Function to find the correct option value by text
    function findOptionValueByText(selectElement, text) {
        for (let i = 0; i < selectElement.options.length; i++) {
            if (selectElement.options[i].text.trim() === text) {
                return selectElement.options[i].value;
            }
        }
        return null;
    }
    
    // Function to get all available options from a select element
    function getAvailableOptions(selectElement) {
        const options = [];
        for (let i = 0; i < selectElement.options.length; i++) {
            const optionText = selectElement.options[i].text.trim();
            if (optionText && optionText !== '—' && optionText !== '⠀') {
                options.push(optionText);
            }
        }
        return options;
    }
    
    // Function to add buttons after a specified element
    function addButtonsAfter(element, buttons) {
        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'inline-block';
        buttonContainer.style.marginLeft = '15px';
        buttonContainer.style.marginTop = '5px';
        
        buttons.forEach(button => {
            const btn = document.createElement('button');
            btn.textContent = button.text;
            
            // Apply nice styling to the buttons
            btn.style.marginRight = '10px';
            btn.style.padding = '4px 12px';
            btn.style.backgroundColor = '#eee';
            btn.style.border = '1px solid #ccc';
            btn.style.borderRadius = '4px';
            btn.style.fontFamily = 'inherit';
            btn.style.fontSize = '13px';
            btn.style.cursor = 'pointer';
            btn.style.transition = 'all 0.2s ease';
            
            // Hover effect
            btn.addEventListener('mouseover', function() {
                btn.style.backgroundColor = '#ddd';
                btn.style.borderColor = '#bbb';
            });
            
            btn.addEventListener('mouseout', function() {
                btn.style.backgroundColor = '#eee';
                btn.style.borderColor = '#ccc';
            });
            
            // Active effect
            btn.addEventListener('mousedown', function() {
                btn.style.backgroundColor = '#ccc';
                btn.style.transform = 'translateY(1px)';
            });
            
            btn.addEventListener('mouseup', function() {
                btn.style.backgroundColor = '#ddd';
                btn.style.transform = 'translateY(0)';
            });
            
            btn.addEventListener('click', button.onClick);
            buttonContainer.appendChild(btn);
        });
        
        // Add settings button
        const settingsBtn = document.createElement('button');
        settingsBtn.textContent = '⚙️';
        settingsBtn.title = 'Settings';
        settingsBtn.style.marginLeft = '5px';
        settingsBtn.style.padding = '4px 8px';
        settingsBtn.style.backgroundColor = '#f8f8f8';
        settingsBtn.style.border = '1px solid #ddd';
        settingsBtn.style.borderRadius = '4px';
        settingsBtn.style.cursor = 'pointer';
        
        settingsBtn.addEventListener('click', function() {
            if (element.id === 'language') {
                showSettingsDialog('language', getAvailableOptions(element), preferredLanguages);
            } else if (element.id === 'script') {
                showSettingsDialog('script', getAvailableOptions(element), preferredScripts);
            }
        });
        
        buttonContainer.appendChild(settingsBtn);
        element.parentNode.insertBefore(buttonContainer, element.nextSibling);
    }
    
    // Function to show settings dialog
    function showSettingsDialog(type, availableOptions, selectedOptions) {
        // Create and style the dialog
        const dialog = document.createElement('div');
        dialog.style.position = 'fixed';
        dialog.style.top = '50%';
        dialog.style.left = '50%';
        dialog.style.transform = 'translate(-50%, -50%)';
        dialog.style.zIndex = '10000';
        dialog.style.backgroundColor = 'white';
        dialog.style.padding = '20px';
        dialog.style.borderRadius = '8px';
        dialog.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
        dialog.style.width = '400px';
        dialog.style.maxHeight = '80vh';
        dialog.style.overflowY = 'auto';
        
        // Create a header
        const header = document.createElement('h3');
        header.textContent = type === 'language' ? 'Customize Language Buttons' : 'Customize Script Buttons';
        header.style.marginTop = '0';
        header.style.marginBottom = '15px';
        dialog.appendChild(header);
        
        // Create description
        const description = document.createElement('p');
        description.textContent = `Select which ${type}s you want to appear as quick buttons:`;
        dialog.appendChild(description);
        
        // Create the options list
        const optionsContainer = document.createElement('div');
        optionsContainer.style.maxHeight = '300px';
        optionsContainer.style.overflowY = 'auto';
        optionsContainer.style.border = '1px solid #eee';
        optionsContainer.style.padding = '10px';
        optionsContainer.style.marginBottom = '15px';
        
        // Sort options alphabetically
        availableOptions.sort();
        
        availableOptions.forEach(option => {
            const optionLabel = document.createElement('label');
            optionLabel.style.display = 'block';
            optionLabel.style.marginBottom = '5px';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = option;
            checkbox.checked = selectedOptions.includes(option);
            checkbox.style.marginRight = '5px';
            
            optionLabel.appendChild(checkbox);
            optionLabel.appendChild(document.createTextNode(option));
            optionsContainer.appendChild(optionLabel);
        });
        
        dialog.appendChild(optionsContainer);
        
        // Create buttons
        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.justifyContent = 'space-between';
        
        const cancelButton = document.createElement('button');
        cancelButton.textContent = 'Cancel';
        cancelButton.style.padding = '6px 12px';
        cancelButton.style.border = '1px solid #ccc';
        cancelButton.style.borderRadius = '4px';
        cancelButton.style.backgroundColor = '#f8f8f8';
        cancelButton.style.cursor = 'pointer';
        
        const saveButton = document.createElement('button');
        saveButton.textContent = 'Save';
        saveButton.style.padding = '6px 12px';
        saveButton.style.border = '1px solid #4CAF50';
        saveButton.style.borderRadius = '4px';
        saveButton.style.backgroundColor = '#4CAF50';
        saveButton.style.color = 'white';
        saveButton.style.cursor = 'pointer';
        
        buttonContainer.appendChild(cancelButton);
        buttonContainer.appendChild(saveButton);
        dialog.appendChild(buttonContainer);
        
        // Create overlay
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.backgroundColor = 'rgba(0,0,0,0.5)';
        overlay.style.zIndex = '9999';
        
        // Add to document
        document.body.appendChild(overlay);
        document.body.appendChild(dialog);
        
        // Handle cancel
        cancelButton.addEventListener('click', function() {
            document.body.removeChild(overlay);
            document.body.removeChild(dialog);
        });
        
        // Handle save
        saveButton.addEventListener('click', function() {
            const newSelection = [];
            const checkboxes = optionsContainer.querySelectorAll('input[type="checkbox"]');
            checkboxes.forEach(checkbox => {
                if (checkbox.checked) {
                    newSelection.push(checkbox.value);
                }
            });
            
            if (type === 'language') {
                preferredLanguages = newSelection;
                GM_setValue('mbLanguages', newSelection);
            } else if (type === 'script') {
                preferredScripts = newSelection;
                GM_setValue('mbScripts', newSelection);
            }
            
            document.body.removeChild(overlay);
            document.body.removeChild(dialog);
            
            // Reload the page to apply changes
            location.reload();
        });
    }
    
    // Function to create button objects from preferred options
    function createButtonsFromPreferences(selectElement, preferredOptions) {
        return preferredOptions.map(option => {
            return {
                text: option,
                onClick: function() {
                    const value = findOptionValueByText(selectElement, option);
                    if (value) {
                        selectElement.value = value;
                        selectElement.dispatchEvent(new Event('change', { bubbles: true }));
                    } else {
                        alert(`${option} option not found in the dropdown`);
                    }
                }
            };
        });
    }
    
    // Wait for the page to fully load
    window.addEventListener('load', function() {
        // Add buttons for language selection
        const languageSelect = document.getElementById('language');
        if (languageSelect) {
            const languageButtons = createButtonsFromPreferences(languageSelect, preferredLanguages);
            addButtonsAfter(languageSelect, languageButtons);
        }
        
        // Add buttons for script selection
        const scriptSelect = document.getElementById('script');
        if (scriptSelect) {
            const scriptButtons = createButtonsFromPreferences(scriptSelect, preferredScripts);
            addButtonsAfter(scriptSelect, scriptButtons);
        }
    });
})();
