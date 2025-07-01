class PromptBox {
  constructor() {
      this.prompts = { global: [], local: [] };
      this.activeTab = 'local';
      this.isExpanded = false;
      this.position = { x: window.innerWidth - 300, y: 12 };
      this.togglePosition = { x: window.innerWidth - 200, y: 8 };
      this.predictor = new NGramPredictor(); // Add N-gram predictor
      this.editingId = null;
      console.log('PromptBox: Constructor called');
      this.createContainers();
      this.loadState().then(() => {
          this.render();
          this.setupToggleShortcut();
          console.log('PromptBox: Initial render and setup complete');
      });
  }

  createContainers() {
      console.log('PromptBox: Creating containers');
      this.toggleButton = document.createElement('div');
      this.toggleButton.className = 'prompt-toggle-btn';
      this.toggleButton.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
      `;
      document.body.appendChild(this.toggleButton);
      console.log('PromptBox: Toggle button added to DOM');

      this.container = document.createElement('div');
      this.container.className = 'ai-prompt-box hidden';
      document.body.appendChild(this.container);
      console.log('PromptBox: Main container added to DOM');

      this.updateTogglePosition();
      this.toggleButton.addEventListener('click', () => this.toggleExpand());
      console.log('PromptBox: Toggle button event listener set');
  }

  async loadState() {
      console.log('PromptBox: Loading state');
      try {
          const data = await storage.getMultiple(storage.stores.settings, ['prompts', 'position', 'togglePosition', 'isExpanded', 'activeTab']);
          console.log('PromptBox: Loaded state from storage:', data);
          if (data.prompts) this.prompts = data.prompts;
          if (data.position) this.position = data.position;
          if (data.togglePosition) this.togglePosition = data.togglePosition;
          if (data.activeTab) this.activeTab = data.activeTab;
          if (data.isExpanded) {
              this.isExpanded = data.isExpanded;
              this.toggleExpand();
          }
          this.updatePositions();
          await this.predictor.initialize(); // Initialize N-gram predictor
          console.log('PromptBox: N-gram predictor initialized successfully');
      } catch (error) {
          console.error('PromptBox: Error loading state:', error);
          // Fallback to default state if storage fails
          this.prompts = {
              global: [],
              local: []
          };
          console.log('PromptBox: Using default empty prompts due to load failure');
      }
  }

  updatePositions() {
      console.log('PromptBox: Updating positions');
      this.updateTogglePosition();
      if (this.isExpanded) {
          this.container.style.left = `${this.position.x}px`;
          this.container.style.top = `${this.position.y}px`;
          console.log('PromptBox: Container positioned at x:', this.position.x, 'y:', this.position.y);
      }
  }

  updateTogglePosition() {
      this.toggleButton.style.left = `${this.togglePosition.x}px`;
      this.toggleButton.style.top = `${this.togglePosition.y}px`;
      console.log('PromptBox: Toggle button positioned at x:', this.togglePosition.x, 'y:', this.togglePosition.y);
  }

  async saveState() {
      console.log('PromptBox: Saving state');
      try {
          await storage.setMultiple(storage.stores.settings, {
              prompts: this.prompts,
              position: this.position,
              togglePosition: this.togglePosition,
              isExpanded: this.isExpanded,
              activeTab: this.activeTab
          });
          console.log('PromptBox: State saved successfully');
      } catch (error) {
          console.error('PromptBox: Error saving state:', error);
      }
  }

  toggleExpand() {
      console.log('PromptBox: Toggling expand, current state:', this.isExpanded);
      this.isExpanded = !this.isExpanded;
      if (this.isExpanded) {
          this.container.style.left = `${this.position.x}px`;
          this.container.style.top = `${this.position.y}px`;
          this.container.classList.remove('hidden');
          console.log('PromptBox: Expanded container');
      } else {
          this.container.classList.add('hidden');
          console.log('PromptBox: Collapsed container');
      }
      this.saveState();
  }

  setupToggleShortcut() {
      console.log('PromptBox: Setting up toggle shortcut');
      document.addEventListener('keydown', (e) => {
          if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
              e.preventDefault();
              console.log('PromptBox: Ctrl+Shift+P pressed, toggling');
              this.toggleExpand();
          }
      });
  }

  setupDragging() {
      console.log('PromptBox: Setting up dragging');
      const handle = this.container.querySelector('.drag-handle');
      if (!handle) {
          console.warn('PromptBox: Drag handle not found');
          return;
      }
      let isDragging = false;
      let startX, startY, startPosX, startPosY;

      const handleMouseDown = (e) => {
          if (e.target.closest('.minimize-btn')) return;
          isDragging = true;
          startX = e.clientX;
          startY = e.clientY;
          startPosX = this.position.x;
          startPosY = this.position.y;
          console.log('PromptBox: Drag started at x:', startX, 'y:', startY);
      };

      const handleMouseMove = (e) => {
          if (!isDragging) return;
          const deltaX = e.clientX - startX;
          const deltaY = e.clientY - startY;
          this.position = {
              x: Math.min(Math.max(startPosX + deltaX, 50), window.innerWidth - 50),
              y: Math.max(startPosY + deltaY, 20)
          };
          this.updatePositions();
          console.log('PromptBox: Dragging to x:', this.position.x, 'y:', this.position.y);
      };

      const handleMouseUp = () => {
          if (isDragging) {
              isDragging = false;
              this.saveState();
              console.log('PromptBox: Drag ended');
          }
      };

      handle.addEventListener('mousedown', handleMouseDown);
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      console.log('PromptBox: Dragging event listeners set');
  }

  async addPrompt(text, type = 'local') {
      console.log('PromptBox: Adding prompt, text:', text, 'type:', type);
      if (!text.trim()) {
          console.log('PromptBox: Empty prompt, skipping');
          return;
      }
      const newPrompt = {
          id: `${type[0]}${Date.now()}`,
          text: text.trim(),
          type
      };
      this.prompts[type].push(newPrompt);
      console.log('PromptBox: Added prompt to list:', newPrompt);

      // Train N-gram with fallback
      try {
          await this.predictor.initialize();
          this.predictor.train(text);
          await this.predictor.saveToStorage();
          console.log('PromptBox: Successfully trained N-gram with:', text);
      } catch (error) {
          console.error('PromptBox: Failed to train N-gram:', error);
          // Continue even if N-gram fails
      }

      await this.saveState();
      this.render();
      
      // Dispatch custom event for IndexedDB storage listeners
      window.dispatchEvent(new CustomEvent('promptsUpdated', { detail: this.prompts }));
  }

  async deletePrompt(id) {
      console.log('PromptBox: Deleting prompt with id:', id);
      const type = id.startsWith('g') ? 'global' : 'local';
      if (type === 'global') {
          console.log('PromptBox: Cannot delete global prompt');
          return;
      }
      const confirmed = confirm('Are you sure you want to delete this prompt?');
      if (!confirmed) {
          console.log('PromptBox: Deletion cancelled by user');
          return;
      }
      this.prompts[type] = this.prompts[type].filter(prompt => prompt.id !== id);
      console.log('PromptBox: Prompt deleted, new list:', this.prompts[type]);
      await this.saveState();
      this.render();
      
      // Dispatch custom event for IndexedDB storage listeners
      window.dispatchEvent(new CustomEvent('promptsUpdated', { detail: this.prompts }));
  }

  async copyPrompt(id) {
      console.log('PromptBox: Copying prompt with id:', id);
      const type = id.startsWith('g') ? 'global' : 'local';
      const prompt = this.prompts[type].find(p => p.id === id);
      if (prompt) {
          try {
              await navigator.clipboard.writeText(prompt.text);
              const copyBtn = this.container.querySelector(`.copy-btn[data-id="${id}"]`);
              if (copyBtn) {
                  const originalHTML = copyBtn.innerHTML;
                  copyBtn.innerHTML = '✓';
                  setTimeout(() => { copyBtn.innerHTML = originalHTML; }, 1000);
                  console.log('PromptBox: Successfully copied prompt:', prompt.text);
              } else {
                  console.warn('PromptBox: Copy button not found for id:', id);
              }
          } catch (err) {
              console.error('PromptBox: Failed to copy text:', err);
          }
      } else {
          console.warn('PromptBox: Prompt not found for id:', id);
      }
  }

  async switchTab(tab) {
      console.log('PromptBox: Switching tab to:', tab);
      this.activeTab = tab;
      await this.saveState();
      this.render();
  }

  render() {
      console.log('PromptBox: Rendering with active tab:', this.activeTab);
      const currentPrompts = this.prompts[this.activeTab];
      if (!currentPrompts) {
          console.warn('PromptBox: No prompts found for tab:', this.activeTab);
          return;
      }
      this.container.innerHTML = `
          <div class="drag-handle">
              <span>PromptBox</span>
              <div class="handle-actions">
                  <button class="minimize-btn" title="Minimize">−</button>
                  <div class="handle-icon">⋮⋮</div>
              </div>
          </div>
          <div class="prompt-content">
              <div class="tabs">
                  <button class="tab-btn ${this.activeTab === 'global' ? 'active' : ''}" data-tab="global">Global</button>
                  <button class="tab-btn ${this.activeTab === 'local' ? 'active' : ''}" data-tab="local">Local</button>
              </div>
              ${this.activeTab === 'local' ? `
                  <div class="add-prompt">
                      <input type="text" placeholder="Add new local prompt..." id="new-prompt-input">
                      <button id="add-prompt-btn" class="action-btn add">+</button>
                  </div>
              ` : ''}
              <div class="prompts-list">
                  ${currentPrompts.map((prompt, index) => `
                      <div class="prompt-item">
                          <div class="prompt-header">
                              <span class="prompt-number">${index + 1}</span>
                              <button class="copy-btn action-btn" data-id="${prompt.id}" title="Copy">
                                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                  </svg>
                              </button>
                          </div>
                          <p class="prompt-text" title="${prompt.text}">${this.truncateText(prompt.text)}</p>
                          ${prompt.type === 'local' ? `
                              <div class="prompt-actions">
                                  <button class="delete-btn action-btn" data-id="${prompt.id}" title="Delete">
                                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                          <path d="M3 6h18"></path>
                                          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                                          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                                      </svg>
                                  </button>
                              </div>
                          ` : ''}
                      </div>
                  `).join('')}
              </div>
          </div>
      `;
      console.log('PromptBox: HTML rendered');
      this.setupEventListeners();
      this.setupDragging();
      console.log('PromptBox: Render complete');
  }

  truncateText(text, wordLimit = 10) {
      const words = text.split(' ');
      if (words.length > wordLimit) {
          return words.slice(0, wordLimit).join(' ') + '...';
      }
      return text;
  }

  setupEventListeners() {
      console.log('PromptBox: Setting up event listeners');
      const minimizeBtn = this.container.querySelector('.minimize-btn');
      if (minimizeBtn) {
          minimizeBtn.addEventListener('click', () => this.toggleExpand());
          console.log('PromptBox: Minimize button listener added');
      } else {
          console.warn('PromptBox: Minimize button not found');
      }

      const tabBtns = this.container.querySelectorAll('.tab-btn');
      tabBtns.forEach(btn => {
          btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
      });
      console.log('PromptBox: Tab button listeners added');

      const addInput = this.container.querySelector('#new-prompt-input');
      const addButton = this.container.querySelector('#add-prompt-btn');
      if (addInput && addButton) {
          addInput.addEventListener('keypress', (e) => {
              if (e.key === 'Enter') {
                  console.log('PromptBox: Enter pressed in input');
                  this.addPrompt(addInput.value);
                  addInput.value = '';
              }
          });
          addButton.addEventListener('click', () => {
              console.log('PromptBox: Add button clicked');
              this.addPrompt(addInput.value);
              addInput.value = '';
          });
          console.log('PromptBox: Add prompt listeners added');
      } else {
          console.warn('PromptBox: Add input or button not found');
      }

      this.container.querySelectorAll('.copy-btn').forEach(btn => {
          btn.addEventListener('click', () => this.copyPrompt(btn.dataset.id));
      });
      console.log('PromptBox: Copy button listeners added');

      this.container.querySelectorAll('.delete-btn').forEach(btn => {
          btn.addEventListener('click', () => this.deletePrompt(btn.dataset.id));
      });
      console.log('PromptBox: Delete button listeners added');
  }
}

if (document.readyState === 'loading') {
  console.log('PromptBox: Document still loading, waiting for DOMContentLoaded');
  document.addEventListener('DOMContentLoaded', () => new PromptBox());
} else {
  console.log('PromptBox: Document loaded, initializing immediately');
  new PromptBox();
}