class IndexedDBStorage {
    constructor() {
        this.dbName = 'PromptBoxDB';
        this.version = 1;
        this.db = null;
        this.stores = {
            prompts: 'prompts',
            ngramData: 'ngramData',
            settings: 'settings'
        };
    }

    async initialize() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                if (!db.objectStoreNames.contains(this.stores.prompts)) {
                    db.createObjectStore(this.stores.prompts, { keyPath: 'key' });
                }
                
                if (!db.objectStoreNames.contains(this.stores.ngramData)) {
                    db.createObjectStore(this.stores.ngramData, { keyPath: 'key' });
                }
                
                if (!db.objectStoreNames.contains(this.stores.settings)) {
                    db.createObjectStore(this.stores.settings, { keyPath: 'key' });
                }
            };
        });
    }

    async get(storeName, key) {
        if (!this.db) await this.initialize();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(key);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const result = request.result;
                resolve(result ? result.value : null);
            };
        });
    }

    async set(storeName, key, value) {
        if (!this.db) await this.initialize();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put({ key, value });
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
        });
    }

    async getMultiple(storeName, keys) {
        if (!this.db) await this.initialize();
        
        const results = {};
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            
            let completed = 0;
            const total = keys.length;
            
            if (total === 0) {
                resolve(results);
                return;
            }
            
            keys.forEach(key => {
                const request = store.get(key);
                
                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    const result = request.result;
                    if (result) {
                        results[key] = result.value;
                    }
                    
                    completed++;
                    if (completed === total) {
                        resolve(results);
                    }
                };
            });
        });
    }

    async setMultiple(storeName, data) {
        if (!this.db) await this.initialize();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            
            let completed = 0;
            const entries = Object.entries(data);
            const total = entries.length;
            
            if (total === 0) {
                resolve();
                return;
            }
            
            entries.forEach(([key, value]) => {
                const request = store.put({ key, value });
                
                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    completed++;
                    if (completed === total) {
                        resolve();
                    }
                };
            });
        });
    }

    async delete(storeName, key) {
        if (!this.db) await this.initialize();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(key);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
        });
    }

    async clear(storeName) {
        if (!this.db) await this.initialize();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.clear();
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
        });
    }

    async getAllKeys(storeName) {
        if (!this.db) await this.initialize();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAllKeys();
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
        });
    }

    async getAll(storeName) {
        if (!this.db) await this.initialize();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const results = {};
                request.result.forEach(item => {
                    results[item.key] = item.value;
                });
                resolve(results);
            };
        });
    }

    close() {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
}

const storage = new IndexedDBStorage();