// ==UserScript==
// @name         MusicBrainz Customizable Language Selector
// @namespace    https://github.com/YoGo9/Scripts
// @version      1.3
// @description  Add customizable quick-select buttons for languages in MusicBrainz release editor and work editor
// @author       YoGo9
// @homepage     https://github.com/YoGo9/Scripts
// @updateURL    https://raw.githubusercontent.com/YoGo9/Scripts/main/SetLanguageInReleaseEditor.user.js
// @downloadURL  https://raw.githubusercontent.com/YoGo9/Scripts/main/SetLanguageInReleaseEditor.user.js
// @supportURL   https://github.com/YoGo9/Scripts/issues
// @match        https://musicbrainz.org/release/*/edit
// @match        https://beta.musicbrainz.org/release/*/edit
// @match        https://musicbrainz.org/release/add*
// @match        https://beta.musicbrainz.org/release/add*
// @match        https://musicbrainz.org/work/*/edit
// @match        https://beta.musicbrainz.org/work/*/edit
// @match        https://musicbrainz.org/work/create*
// @match        https://beta.musicbrainz.org/work/create*
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
    
    // Function to properly set value in React components
    function forceValue(input, value) {
        // Force react state change by bubbling up the input event
        input.dispatchEvent(new Event("input", {bubbles: true}));
        // Use native input value setter to bypass React (simple value setter is overridden by react)
        (Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value").set).call(input, value);
        // Trigger change event to update React state
        input.dispatchEvent(new Event("change", {bubbles: true}));
    }
    
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
        
        // First check if this is the work editor or release editor
        const isWorkEditor = window.location.href.includes('/work/');
        
        for (let i = 0; i < selectElement.options.length; i++) {
            const optionText = selectElement.options[i].text.trim();
            if (optionText && optionText !== '—' && optionText !== '⠀' && 
                !optionText.startsWith('Frequently used')) {
                // In work editor we want to include [No lyrics] but not in release editor
                // In release editor we want to include [Multiple languages] but not in work editor
                if (isWorkEditor && optionText === '[Multiple languages]') {
                    continue; // Skip [Multiple languages] in work editor
                }
                if (!isWorkEditor && optionText === '[No lyrics]') {
                    continue; // Skip [No lyrics] in release editor
                }
                options.push(optionText);
            }
        }
        return options;
    }
    
    // Function to add buttons after a specified element
    function addButtonsAfter(element, buttons, isMultiSelect = false) {
        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'inline-block';
        buttonContainer.style.marginLeft = '15px';
        buttonContainer.style.marginTop = '5px';
        
        buttons.forEach(button => {
            const btn = document.createElement('button');
            btn.textContent = button.text;
            btn.type = 'button'; // Prevent form submission
            
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
            
            // Use different click handlers for multi-select vs. single-select
            if (isMultiSelect) {
                btn.addEventListener('click', function(e) {
                    e.preventDefault(); // Prevent any form submission
                    button.onClick(e);
                    return false;
                });
            } else {
                btn.addEventListener('click', function(e) {
                    e.preventDefault(); // Prevent any form submission
                    button.onClick(e);
                    return false;
                });
            }
            
            buttonContainer.appendChild(btn);
        });
        
        // Add settings button
        const settingsBtn = document.createElement('button');
        settingsBtn.textContent = '⚙️';
        settingsBtn.title = 'Settings';
        settingsBtn.type = 'button'; // Prevent form submission
        settingsBtn.style.marginLeft = '5px';
        settingsBtn.style.padding = '4px 8px';
        settingsBtn.style.backgroundColor = '#f8f8f8';
        settingsBtn.style.border = '1px solid #ddd';
        settingsBtn.style.borderRadius = '4px';
        settingsBtn.style.cursor = 'pointer';
        
        settingsBtn.addEventListener('click', function(e) {
            e.preventDefault(); // Prevent any form submission
            // Determine which type of selector this is
            let type = 'language';
            if (element.id === 'script') {
                type = 'script';
            }
            showSettingsDialog(type, getAvailableOptions(element), type === 'language' ? preferredLanguages : preferredScripts);
            return false;
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
        
        // Create checkboxes for all available options
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
    
    // Function to create button objects from preferred options for single-select elements
    function createButtonsFromPreferences(selectElement, preferredOptions) {
        return preferredOptions.map(option => {
            // Skip options that don't exist in this context
            if (!findOptionValueByText(selectElement, option)) {
                return null;
            }
            
            return {
                text: option,
                onClick: function(e) {
                    e.preventDefault();
                    const value = findOptionValueByText(selectElement, option);
                    if (value) {
                        forceValue(selectElement, value);
                    } else {
                        alert(`${option} option not found in the dropdown`);
                    }
                    return false;
                }
            };
        }).filter(button => button !== null); // Remove null entries
    }
    
    // Function for updating the work editor language UI
    function updateWorkEditorLanguageUI() {
        // Check if "[No lyrics]" is selected
        const firstLanguageSelect = document.querySelector('.select-list-row select');
        if (firstLanguageSelect && firstLanguageSelect.value === '486') {
            // If "[No lyrics]" is selected, hide the "Add language" button
            const addLanguageButton = document.getElementById('add-language');
            if (addLanguageButton) {
                addLanguageButton.style.display = 'none';
            }
            
            // Also hide any existing language rows except the first one
            const languageRows = document.querySelectorAll('.select-list-row');
            for (let i = 1; i < languageRows.length; i++) {
                languageRows[i].style.display = 'none';
            }
        } else {
            // Make sure the "Add language" button is visible
            const addLanguageButton = document.getElementById('add-language');
            if (addLanguageButton) {
                addLanguageButton.style.display = '';
            }
            
            // Show all language rows
            const languageRows = document.querySelectorAll('.select-list-row');
            for (let i = 0; i < languageRows.length; i++) {
                languageRows[i].style.display = '';
            }
        }
    }
    
    // Function to add work editor language buttons
    function addWorkEditorLanguageButtons() {
        // Check if the language rows container exists
        const languageRowsContainer = document.querySelector('.form-row-select-list');
        if (!languageRowsContainer) return;
        
        // Create a container div for the quick add buttons
        const quickAddContainer = document.createElement('div');
        quickAddContainer.style.margin = '10px 0';
        quickAddContainer.style.display = 'flex';
        quickAddContainer.style.alignItems = 'center';
        
        // Add a label
        const quickAddLabel = document.createElement('div');
        quickAddLabel.textContent = 'Quick add:';
        quickAddLabel.style.marginRight = '10px';
        quickAddLabel.style.fontWeight = 'bold';
        quickAddContainer.appendChild(quickAddLabel);
        
        // Create button container
        const buttonsDiv = document.createElement('div');
        buttonsDiv.style.display = 'flex';
        buttonsDiv.style.flexWrap = 'wrap';
        quickAddContainer.appendChild(buttonsDiv);
        
        // Get the first language select for option lookup
        const firstLanguageSelect = document.querySelector('.select-list-row select');
        if (!firstLanguageSelect) return;
        
        // Add buttons for each preferred language
        preferredLanguages.forEach(language => {
            const btn = document.createElement('button');
            btn.textContent = language;
            btn.type = 'button';
            
            // Style the button
            btn.style.margin = '0 5px 5px 0';
            btn.style.padding = '4px 12px';
            btn.style.backgroundColor = '#eee';
            btn.style.border = '1px solid #ccc';
            btn.style.borderRadius = '4px';
            btn.style.cursor = 'pointer';
            
            // Get the language value
            const value = findOptionValueByText(firstLanguageSelect, language);
            if (!value) {
                // Skip this language if it doesn't exist in the dropdown
                return;
            }
            
            // Add click handler
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                
                if (language === '[No lyrics]') {
                    // Special handling for "[No lyrics]" option
                    // Clear all languages first
                    const languageRows = document.querySelectorAll('.select-list-row');
                    for (let i = 1; i < languageRows.length; i++) {
                        // Click the remove button for all rows except the first
                        const removeButton = languageRows[i].querySelector('button.remove-item');
                        if (removeButton) {
                            removeButton.click();
                        }
                    }
                    
                    // Set the first dropdown to "[No lyrics]"
                    forceValue(firstLanguageSelect, value);
                    
                    // Update UI to hide the "Add language" button
                    setTimeout(updateWorkEditorLanguageUI, 100);
                } else {
                    // For normal languages
                    
                    // Check if "[No lyrics]" is currently selected
                    if (firstLanguageSelect.value === '486') {
                        // If "[No lyrics]" is selected, replace it with the new language
                        forceValue(firstLanguageSelect, value);
                        setTimeout(updateWorkEditorLanguageUI, 100);
                    } else {
                        // Regular language handling - find or create an empty dropdown
                        let emptySelect = null;
                        const selects = document.querySelectorAll('.select-list-row select');
                        
                        // Look for an empty select
                        for (let i = 0; i < selects.length; i++) {
                            if (!selects[i].value || selects[i].value === "") {
                                emptySelect = selects[i];
                                break;
                            }
                        }
                        
                        if (!emptySelect) {
                            // If no empty select found, click the "Add language" button to add a new row
                            // and immediately set the value (to avoid the two-step click)
                            const addLanguageButton = document.getElementById('add-language');
                            if (addLanguageButton) {
                                // Temporarily store the original click handler
                                const originalClick = addLanguageButton.onclick;
                                
                                // Override the click handler to add our custom logic
                                addLanguageButton.onclick = function(e) {
                                    // Call the original handler to add the row
                                    if (originalClick) {
                                        originalClick.call(this, e);
                                    }
                                    
                                    // Wait a short time for the row to be added
                                    setTimeout(() => {
                                        // Find the newly added row
                                        const newSelect = document.querySelector('.select-list-row:last-child select');
                                        if (newSelect) {
                                            // Set the value of the new select
                                            forceValue(newSelect, value);
                                        }
                                        
                                        // Restore the original click handler
                                        addLanguageButton.onclick = originalClick;
                                    }, 50);
                                };
                                
                                // Trigger the click to add a new row
                                addLanguageButton.click();
                            }
                        } else {
                            // Use the empty select
                            forceValue(emptySelect, value);
                        }
                    }
                }
                
                return false;
            });
            
            buttonsDiv.appendChild(btn);
        });
        
        // Add settings button
        const settingsBtn = document.createElement('button');
        settingsBtn.textContent = '⚙️';
        settingsBtn.title = 'Settings';
        settingsBtn.type = 'button';
        settingsBtn.style.margin = '0 5px 5px 0';
        settingsBtn.style.padding = '4px 8px';
        settingsBtn.style.backgroundColor = '#f8f8f8';
        settingsBtn.style.border = '1px solid #ddd';
        settingsBtn.style.borderRadius = '4px';
        settingsBtn.style.cursor = 'pointer';
        
        settingsBtn.addEventListener('click', function(e) {
            e.preventDefault();
            showSettingsDialog('language', getAvailableOptions(firstLanguageSelect), preferredLanguages);
            return false;
        });
        
        buttonsDiv.appendChild(settingsBtn);
        
        // Find where to insert the quick add container
        let lyricsLanguagesLabel = null;
        const labels = document.querySelectorAll('label');
        for (let i = 0; i < labels.length; i++) {
            if (labels[i].textContent.includes('Lyrics languages')) {
                lyricsLanguagesLabel = labels[i];
                break;
            }
        }
        
        if (lyricsLanguagesLabel) {
            // Insert after the label's parent
            const parentElement = lyricsLanguagesLabel.parentElement;
            if (parentElement && parentElement.parentElement) {
                parentElement.parentElement.insertBefore(quickAddContainer, languageRowsContainer.nextSibling);
            } else {
                // Fallback insertion
                languageRowsContainer.parentElement.insertBefore(quickAddContainer, languageRowsContainer.nextSibling);
            }
        } else {
            // Fallback - insert after the language rows container
            languageRowsContainer.parentElement.insertBefore(quickAddContainer, languageRowsContainer.nextSibling);
        }
        
        // Set up observers to watch for language changes
        const firstLanguageSelectObserver = new MutationObserver(function(mutations) {
            updateWorkEditorLanguageUI();
        });
        
        // Observe changes to the first language select value
        firstLanguageSelectObserver.observe(firstLanguageSelect, { 
            attributes: true, 
            attributeFilter: ['value'] 
        });
        
        // Initial UI update
        updateWorkEditorLanguageUI();
    }
    
    // Wait for the page to fully load
    window.addEventListener('load', function() {
        // Check if we're on a work editor page or a release editor page
        const isWorkEditor = window.location.href.includes('/work/');
        
        // Add buttons for language selection in release editor
        const languageSelect = document.getElementById('language');
        if (languageSelect) {
            const languageButtons = createButtonsFromPreferences(languageSelect, preferredLanguages);
            addButtonsAfter(languageSelect, languageButtons);
        }
        
        // Add buttons for script selection in release editor
        const scriptSelect = document.getElementById('script');
        if (scriptSelect) {
            const scriptButtons = createButtonsFromPreferences(scriptSelect, preferredScripts);
            addButtonsAfter(scriptSelect, scriptButtons);
        }
        
        // Add buttons for lyrics languages in work editor
        if (isWorkEditor) {
            // Add a slight delay to ensure React components are fully loaded
            setTimeout(addWorkEditorLanguageButtons, 500);
        }
    });
})();
