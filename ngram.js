class NGramPredictor {
    constructor(n = 3) { // Changed to trigrams for better context
        this.n = n;
        this.ngrams = new Map();
        this.initialized = false;
        this.smoothingAlpha = 0.1;
        console.log('NGramPredictor: Constructor called with n=', n);
    }

    async initialize() {
        console.log('NGramPredictor: Initializing');
        if (this.initialized) {
            console.log('NGramPredictor: Already initialized');
            return;
        }
        try {
            const ngramData = await storage.get(storage.stores.ngramData, 'ngramData');
            console.log('NGramPredictor: Loaded ngramData:', ngramData);
            if (ngramData && ngramData.ngrams) {
                this.ngrams = new Map(
                    Object.entries(ngramData.ngrams).map(([context, data]) => [
                        context,
                        { total: data.total, words: new Map(Object.entries(data.words)) }
                    ])
                );
                console.log('NGramPredictor: N-grams loaded:', this.ngrams);
            } else {
                console.log('NGramPredictor: No ngramData found, loading defaults');
                await this.loadDefaultTrainingData();
            }
            this.initialized = true;
            console.log('NGramPredictor: Initialization complete');
        } catch (error) {
            console.error('NGramPredictor: Error initializing:', error);
            this.initialized = true; // Proceed even if failed
        }
    }

    async loadDefaultTrainingData() {
        console.log('NGramPredictor: Loading default training data');
        try {
            this.train("quick brown fox jumps over the lazy dog");
            await this.saveToStorage();
            console.log('NGramPredictor: Default data trained and saved');
        } catch (error) {
            console.error('NGramPredictor: Error loading default data:', error);
        }
    }

    async saveToStorage() {
        console.log('NGramPredictor: Saving to storage');
        try {
            const storageData = {
                ngrams: Object.fromEntries(
                    Array.from(this.ngrams.entries()).map(([context, data]) => [
                        context,
                        { total: data.total, words: Object.fromEntries(data.words) }
                    ])
                ),
                lastUpdated: new Date().toISOString()
            };
            await storage.set(storage.stores.ngramData, 'ngramData', storageData);
            console.log('NGramPredictor: Data saved:', storageData);
        } catch (error) {
            console.error('NGramPredictor: Error saving to storage:', error);
        }
    }

    train(text) {
        console.log('NGramPredictor: Training with text:', text);
        try {
            const words = this.tokenize(text);
            console.log('NGramPredictor: Tokenized words:', words);
            for (let i = 0; i <= words.length - this.n; i++) {
                const context = words.slice(i, i + this.n - 1).join(' ');
                const nextWord = words[i + this.n - 1];
                if (!this.ngrams.has(context)) {
                    this.ngrams.set(context, { total: 0, words: new Map() });
                }
                const entry = this.ngrams.get(context);
                entry.words.set(nextWord, (entry.words.get(nextWord) || 0) + 1);
                entry.total++;
                console.log('NGramPredictor: Updated n-gram:', context, entry);
            }
        } catch (error) {
            console.error('NGramPredictor: Error training:', error);
        }
    }

    predict(sequence, maxPredictions = 3) {
        console.log('NGramPredictor: Predicting for sequence:', sequence);
        if (!this.initialized) {
            console.warn('NGramPredictor: Not initialized, returning empty predictions');
            return [];
        }
        try {
            const words = this.tokenize(sequence);
            const context = words.slice(-this.n + 1).join(' ');
            console.log('NGramPredictor: Context:', context);
            if (!this.ngrams.has(context)) {
                console.log('NGramPredictor: Context not found, trying fallback');
                return this.handleUnknownContext(context);
            }
            const { total, words: nextWords } = this.ngrams.get(context);
            const vocabSize = nextWords.size;
            const predictions = Array.from(nextWords.entries())
                .map(([word, count]) => ({
                    word,
                    probability: (count + this.smoothingAlpha) / (total + this.smoothingAlpha * (vocabSize + 1))
                }))
                .sort((a, b) => b.probability - a.probability)
                .slice(0, maxPredictions)
                .map(p => ({
                    text: `${sequence} ${p.word}`.trim(),
                    probability: p.probability,
                    type: 'ngram'
                }));
            console.log('NGramPredictor: Predictions:', predictions);
            return predictions;
        } catch (error) {
            console.error('NGramPredictor: Error predicting:', error);
            return [];
        }
    }

    tokenize(text) {
        try {
            const tokens = text.toLowerCase()
                .replace(/[^a-z0-9']/g, ' ')
                .split(/\s+/)
                .filter(w => w.length > 0);
            console.log('NGramPredictor: Tokenized:', tokens);
            return tokens;
        } catch (error) {
            console.error('NGramPredictor: Error tokenizing:', error);
            return [];
        }
    }

    handleUnknownContext(context) {
        console.log('NGramPredictor: Handling unknown context:', context);
        if (this.n > 1 && context.includes(' ')) {
            const shorterContext = context.split(' ').slice(1).join(' ');
            console.log('NGramPredictor: Falling back to shorter context:', shorterContext);
            return this.predict(shorterContext, 1);
        }
        console.log('NGramPredictor: No fallback available');
        return [];
    }
}

const predictor = new NGramPredictor();