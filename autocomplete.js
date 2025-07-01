class TrieNode {
    constructor() {
        this.children = new Map();
        this.isEndOfWord = false;
        this.prompt = null;
        this.originalWord = '';
    }
}

class AutocompleteEngine {
    constructor() {
        this.trie = new TrieNode();
        this.fuzzyThreshold = 0.3;
        this.predictor = new NGramPredictor(); // N-gram predictor
        this.initialize();
        this.setupStorageListener();
    }

    async initialize() {
        try {
            const prompts = await storage.get(storage.stores.settings, 'prompts');
            if (!prompts) {
                // No prompts found, proceed silently
            } else {
                const allPrompts = [...(prompts.global || []), ...(prompts.local || [])];
                this.buildTrie(allPrompts);
            }
            await this.predictor.initialize();
        } catch (error) {
            console.error('AutocompleteEngine: Error initializing:', error);
        }
    }

    setupStorageListener() {
        // Custom storage change listener for IndexedDB
        // We'll trigger updates when the PromptBox saves state
        window.addEventListener('promptsUpdated', async (event) => {
            try {
                const prompts = await storage.get(storage.stores.settings, 'prompts');
                if (prompts) {
                    const allPrompts = [
                        ...(prompts.global || []),
                        ...(prompts.local || [])
                    ];
                    this.buildTrie(allPrompts);
                }
            } catch (error) {
                console.error('AutocompleteEngine: Error updating from storage:', error);
            }
        });
    }

    buildTrie(prompts) {
        this.trie = new TrieNode();
        prompts.forEach(prompt => this.insert(prompt));
    }

    insert(prompt) {
        let node = this.trie;
        const word = prompt.text.toLowerCase();
        for (const char of word) {
            if (!node.children.has(char)) {
                node.children.set(char, new TrieNode());
            }
            node = node.children.get(char);
        }
        node.isEndOfWord = true;
        node.prompt = prompt;
        node.originalWord = word;
    }

    levenshteinDistance(str1, str2) {
        const matrix = Array(str2.length + 1).fill(null)
            .map(() => Array(str1.length + 1).fill(null));
        for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
        for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
        for (let j = 1; j <= str2.length; j++) {
            for (let i = 1; i <= str1.length; i++) {
                const substitutionCost = str1[i - 1] === str2[j - 1] ? 0 : 1;
                matrix[j][i] = Math.min(
                    matrix[j][i - 1] + 1,
                    matrix[j - 1][i] + 1,
                    matrix[j - 1][i - 1] + substitutionCost
                );
            }
        }
        return matrix[str2.length][str1.length];
    }

    getAllWords(node = this.trie, prefix = '', words = []) {
        if (node.isEndOfWord) {
            words.push({ prompt: node.prompt, word: node.originalWord, prefix });
        }
        for (const [char, childNode] of node.children) {
            this.getAllWords(childNode, prefix + char, words);
        }
        return words;
    }

    search(query) {
        if (!query) return [];
        query = query.toLowerCase();

        const prefixes = [];
        const words = query.split(' ');
        for (let i = 0; i < query.length; i++) {
            prefixes.push(query.slice(i));
        }
        for (let i = 0; i < words.length; i++) {
            const phrase = words.slice(i).join(' ');
            for (let j = 0; j < phrase.length; j++) {
                prefixes.push(phrase.slice(j));
            }
        }

        const prefixMatches = prefixes.map(prefix => this.searchPrefix(prefix)).flat();
        const fuzzyMatches = this.searchFuzzy(query);

        let ngramMatches = [];
        try {
            ngramMatches = this.predictor.predict(query).map(pred => ({
                prompt: { text: pred.text, type: 'ngram' },
                matchType: 'ngram',
                score: pred.probability
            }));
        } catch (error) {
            console.error('AutocompleteEngine: N-gram prediction failed:', error);
        }

        const seen = new Set();
        const allMatches = [...prefixMatches, ...fuzzyMatches, ...ngramMatches]
            .filter(match => {
                const id = match.prompt.text;
                if (seen.has(id)) return false;
                seen.add(id);
                return true;
            })
            .sort((a, b) => {
                if (a.matchType !== b.matchType) {
                    return a.matchType === 'prefix' ? -1 : (a.matchType === 'fuzzy' ? 0 : 1);
                }
                return b.score - a.score;
            });

        return allMatches.map(match => match.prompt);
    }

    searchPrefix(prefix) {
        let node = this.trie;
        const results = [];
        for (const char of prefix) {
            if (!node.children.has(char)) return [];
            node = node.children.get(char);
        }
        this.collectWords(node, prefix, results, prefix.length);
        return results;
    }

    searchFuzzy(query) {
        const allWords = this.getAllWords();
        const results = [];
        allWords.forEach(({ prompt, word }) => {
            const distance = this.levenshteinDistance(query, word);
            const maxLength = Math.max(query.length, word.length);
            const similarity = 1 - (distance / maxLength);
            if (similarity > this.fuzzyThreshold) {
                results.push({ prompt, matchType: 'fuzzy', score: similarity });
            }
        });
        return results;
    }

    collectWords(node, prefix, results, prefixLength) {
        if (node.isEndOfWord) {
            results.push({ prompt: node.prompt, matchType: 'prefix', score: prefixLength });
        }
        for (const [char, childNode] of node.children) {
            this.collectWords(childNode, prefix + char, results, prefixLength);
        }
    }
}

class PromptAutocomplete {
    constructor() {
        this.currentSuggestions = [];
        this.suggestionsContainer = null;
        this.contentContainer = null;
        this.inputElement = null;
        this.lastContent = '';
        this.isDragging = false;
        this.currentX = 0;
        this.currentY = 0;
        this.initialX = 0;
        this.initialY = 0;
        this.xOffset = 0;
        this.yOffset = 0;
        this.searchEngine = new AutocompleteEngine();
        console.log('PromptAutocomplete: Action performed');
        setTimeout(() => this.initialize(), 0);
    }

    initialize() {
        console.log('PromptAutocomplete: Action performed');
        this.createSuggestionsContainer();
        const inputElement = document.querySelector('.ProseMirror[contenteditable="true"]');
        if (inputElement) {
            this.setupAutocomplete(inputElement);
        }
        const observer = new MutationObserver((mutations, obs) => {
            const inputElement = document.querySelector('.ProseMirror[contenteditable="true"]');
            if (inputElement && !this.inputElement) {
                this.setupAutocomplete(inputElement);
                this.positionBelowInput();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    createGhostOverlay() {
        console.log('PromptAutocomplete: Action performed');
        this.ghostOverlay = document.createElement('div');
        Object.assign(this.ghostOverlay.style, {
            position: 'absolute',
            pointerEvents: 'none',
            color: '#8888',
            zIndex: '1000',
            whiteSpace: 'pre-wrap',
            fontFamily: 'inherit',
            fontSize: 'inherit',
            padding: 'inherit',
            visibility: 'hidden'
        });
        document.body.appendChild(this.ghostOverlay);
    }

    updateGhostOverlay() {
        console.log('PromptAutocomplete: Action performed');
        if (!this.inputElement || !this.ghostOverlay || this.currentSuggestions.length === 0) {
            if (this.ghostOverlay) {
                this.ghostOverlay.style.visibility = 'hidden';
            }
            return;
        }

        const currentContent = this.inputElement.textContent.trim();
        const words = currentContent.split(/\s+/);
        const currentWord = words[words.length - 1] || '';
        const context = words.slice(0, -1).join(' ') || '';

        const topSuggestion = this.currentSuggestions[0];
        let ghostText = '';

        let wordPrediction = '';
        try {
            const ngramPredictions = this.searchEngine.predictor.predict(context.trim() || currentWord);
            if (ngramPredictions.length > 0) {
                const predictedFullText = ngramPredictions[0].text;
                const predictedWords = predictedFullText.split(/\s+/);
                const lastPredictedWord = predictedWords[predictedWords.length - 1];
                if (lastPredictedWord.startsWith(currentWord.toLowerCase())) {
                    wordPrediction = lastPredictedWord.slice(currentWord.length);
                }
            }
        } catch (error) {
            console.error('PromptAutocomplete: Error predicting word with N-gram:', error);
        }

        if (wordPrediction) {
            ghostText = wordPrediction;
        } else if (topSuggestion) {
            const { endIndex } = this.findLongestCommonSuffixPrefix(currentContent.toLowerCase(), topSuggestion.text.toLowerCase());
            ghostText = topSuggestion.text.slice(endIndex).trim();
            const ghostWords = ghostText.split(/\s+/);
            ghostText = ghostWords.slice(0, 3).join(' ');
        }

        if (!ghostText) {
            this.ghostOverlay.style.visibility = 'hidden';
            return;
        }

        const selection = window.getSelection();
        let range = selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : document.createRange();
        range.selectNodeContents(this.inputElement);
        range.collapse(false);

        const tempSpan = document.createElement('span');
        range.insertNode(tempSpan);
        const spanRect = tempSpan.getBoundingClientRect();
        tempSpan.remove();

        Object.assign(this.ghostOverlay.style, {
            top: `${spanRect.top}px`,
            left: `${spanRect.left}px`,
            visibility: 'visible'
        });
        this.ghostOverlay.textContent = ghostText;
    }

    findLongestCommonSuffixPrefix(str1, str2) {
        let maxLength = 0;
        let endIndex = 0;
        for (let i = 1; i <= Math.min(str1.length, str2.length); i++) {
            const suffix = str1.slice(-i);
            const prefix = str2.slice(0, i);
            if (suffix === prefix) {
                maxLength = i;
                endIndex = i;
            }
        }
        return { commonLength: maxLength, endIndex };
    }

    createSuggestionsContainer() {
        console.log('PromptAutocomplete: Action performed');
        try {
            const existingContainer = document.querySelector('.prompt-suggestions');
            if (existingContainer) {
                existingContainer.remove();
            }
            this.suggestionsContainer = document.createElement('div');
            this.suggestionsContainer.className = 'prompt-suggestions';
            const header = document.createElement('div');
            header.className = 'suggestions-header';
            header.textContent = 'Suggestions';
            this.contentContainer = document.createElement('div');
            this.contentContainer.className = 'suggestions-content';
            const emptyState = document.createElement('div');
            emptyState.className = 'empty-state';
            emptyState.textContent = 'No suggestions available';
            this.contentContainer.appendChild(emptyState);
            this.suggestionsContainer.appendChild(header);
            this.suggestionsContainer.appendChild(this.contentContainer);
            Object.assign(this.suggestionsContainer.style, {
                position: 'fixed',
                top: '100px',
                left: '100px',
                background: 'white',
                border: '1px solid #ddd',
                borderRadius: '4px',
                width: '300px',
                minHeight: '100px',
                maxHeight: '300px',
                boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
                zIndex: '10000',
                display: 'block',
                fontSize: '14px',
                fontFamily: 'Arial, sans-serif',
                overflow: 'hidden'
            });
            Object.assign(header.style, {
                padding: '8px 12px',
                borderBottom: '1px solid #ddd',
                backgroundColor: '#f5f5f5',
                fontWeight: 'bold',
                cursor: 'move',
                userSelect: 'none'
            });
            Object.assign(this.contentContainer.style, {
                overflowY: 'auto',
                maxHeight: '250px',
                padding: '8px 0'
            });
            Object.assign(emptyState.style, {
                padding: '12px',
                color: '#666',
                textAlign: 'center',
                fontStyle: 'italic'
            });
            document.body.appendChild(this.suggestionsContainer);
            this.setupDragging(header);
            document.addEventListener('click', (e) => {
                if (this.suggestionsContainer && 
                    !this.suggestionsContainer.contains(e.target) && 
                    e.target !== this.inputElement) {
                    this.updateSuggestions();
                }
            });
        } catch (error) {
            console.error('PromptAutocomplete: Error creating suggestions container:', error);
        }
    }

    setupDragging(dragHandle) {
        console.log('PromptAutocomplete: Action performed');
        const dragStart = (e) => {
            if (e.type === "touchstart") {
                this.initialX = e.touches[0].clientX - this.xOffset;
                this.initialY = e.touches[0].clientY - this.yOffset;
            } else {
                this.initialX = e.clientX - this.xOffset;
                this.initialY = e.clientY - this.yOffset;
            }
            if (e.target === dragHandle) this.isDragging = true;
        };
        const dragEnd = () => {
            this.isDragging = false;
        };
        const drag = (e) => {
            if (this.isDragging && this.suggestionsContainer) {
                e.preventDefault();
                if (e.type === "touchmove") {
                    this.currentX = e.touches[0].clientX - this.initialX;
                    this.currentY = e.touches[0].clientY - this.initialY;
                } else {
                    this.currentX = e.clientX - this.initialX;
                    this.currentY = e.clientY - this.initialY;
                }
                this.xOffset = this.currentX;
                this.yOffset = this.currentY;
                this.suggestionsContainer.style.transform = `translate(${this.currentX}px, ${this.currentY}px)`;
            }
        };
        dragHandle.addEventListener('touchstart', dragStart, false);
        dragHandle.addEventListener('mousedown', dragStart, false);
        document.addEventListener('touchend', dragEnd, false);
        document.addEventListener('mouseup', dragEnd, false);
        document.addEventListener('touchmove', drag, false);
        document.addEventListener('mousemove', drag, false);
    }

    positionBelowInput() {
        console.log('PromptAutocomplete: Action performed');
        if (this.inputElement && this.suggestionsContainer) {
            const rect = this.inputElement.getBoundingClientRect();
            this.suggestionsContainer.style.top = `${rect.bottom + 5}px`;
            this.suggestionsContainer.style.left = `${rect.left}px`;
            this.suggestionsContainer.style.transform = 'none';
            this.xOffset = 0;
            this.yOffset = 0;
        } else {
            console.warn('PromptAutocomplete: Input or container missing for positioning');
        }
    }

    setupAutocomplete(inputElement) {
        console.log('PromptAutocomplete: Action performed');
        this.inputElement = inputElement;
        this.createGhostOverlay();
        let debounceTimeout;
        inputElement.addEventListener('input', async (e) => {
            clearTimeout(debounceTimeout);
            debounceTimeout = setTimeout(() => {
                const content = e.target.textContent;
                if (content === this.lastContent) return;
                this.lastContent = content;
                try {
                    this.currentSuggestions = this.searchEngine.search(content);
                    this.updateSuggestions();
                    this.updateGhostOverlay();
                } catch (error) {
                    console.error('PromptAutocomplete: Error getting suggestions:', error);
                    this.currentSuggestions = [];
                    this.updateSuggestions();
                    this.updateGhostOverlay();
                }
            }, 150);
        });
        document.addEventListener('selectionchange', () => {
            if (this.currentSuggestions.length > 0) {
                this.updateGhostOverlay();
            }
        });
        inputElement.addEventListener('keydown', (e) => {
            if (!this.currentSuggestions.length) return;
            if (e.key === 'Tab') {
                e.preventDefault();
                this.completeSuggestion(this.currentSuggestions[0]);
                this.updateGhostOverlay();
            }
        });
    }

    updateSuggestions() {
        console.log('PromptAutocomplete: Action performed');
        if (!this.contentContainer) {
            console.warn('PromptAutocomplete: Content container missing');
            return;
        }
        this.contentContainer.innerHTML = '';
        if (this.currentSuggestions.length === 0) {
            const emptyState = document.createElement('div');
            emptyState.className = 'empty-state';
            emptyState.textContent = 'No suggestions available';
            Object.assign(emptyState.style, {
                padding: '12px',
                color: '#666',
                textAlign: 'center',
                fontStyle: 'italic'
            });
            this.contentContainer.appendChild(emptyState);
            return;
        }
        this.currentSuggestions.forEach((suggestion) => {
            const div = document.createElement('div');
            Object.assign(div.style, {
                padding: '8px 12px',
                cursor: 'pointer',
                borderBottom: '1px solid #eee',
                backgroundColor: 'white',
                transition: 'background-color 0.2s'
            });
            const matchingPart = suggestion.text.substring(0, this.lastContent.length);
            const remainingPart = suggestion.text.substring(this.lastContent.length);
            div.innerHTML = `<strong>${matchingPart}</strong>${remainingPart}`;
            div.addEventListener('click', () => this.completeSuggestion(suggestion));
            div.addEventListener('mouseenter', () => { div.style.backgroundColor = '#f0f0f0'; });
            div.addEventListener('mouseleave', () => { div.style.backgroundColor = 'white'; });
            this.contentContainer.appendChild(div);
        });
    }

    completeSuggestion(suggestion) {
        console.log('PromptAutocomplete: Action performed');
        if (!this.inputElement) {
            console.warn('PromptAutocomplete: No input element to complete suggestion');
            return;
        }
        const currentContent = this.inputElement.textContent.trim();
        const suggestionText = suggestion.text.trim();
        const { endIndex } = this.findLongestCommonSuffixPrefix(currentContent.toLowerCase(), suggestionText.toLowerCase());
        const finalString = currentContent + suggestionText.slice(endIndex);
        this.inputElement.innerHTML = `<p>${finalString}</p>`;
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(this.inputElement);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
        try {
            this.searchEngine.predictor.train(finalString);
            this.searchEngine.predictor.saveToStorage();
        } catch (error) {
            console.error('PromptAutocomplete: Failed to train N-gram:', error);
        }
        this.currentSuggestions = [];
        this.updateSuggestions();
    }
}

const promptAutocomplete = new PromptAutocomplete();