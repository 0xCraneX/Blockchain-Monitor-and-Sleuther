/**
 * UI Components Module for Polkadot Analysis Tool
 * Provides modular UI components for network visualization and analysis
 */

// Component State Management
class UIState {
  constructor() {
    this.components = new Map();
    this.eventBus = new EventTarget();
    this.preferences = this.loadPreferences();
  }

  register(name, component) {
    this.components.set(name, component);
    console.log(`Component registered: ${name}`);
  }

  get(name) {
    return this.components.get(name);
  }

  emit(eventName, data) {
    this.eventBus.dispatchEvent(new CustomEvent(eventName, { detail: data }));
  }

  on(eventName, callback) {
    this.eventBus.addEventListener(eventName, callback);
  }

  off(eventName, callback) {
    this.eventBus.removeEventListener(eventName, callback);
  }

  loadPreferences() {
    const stored = localStorage.getItem('polkadot-analysis-preferences');
    return stored ? JSON.parse(stored) : {
      theme: 'dark',
      autoSave: true,
      defaultDepth: 2,
      defaultLayout: 'force',
      enableNotifications: true
    };
  }

  savePreferences() {
    localStorage.setItem('polkadot-analysis-preferences', JSON.stringify(this.preferences));
  }

  updatePreference(key, value) {
    this.preferences[key] = value;
    this.savePreferences();
    this.emit('preferences-updated', { key, value });
  }
}

// Global UI State
const uiState = new UIState();

// Base Component Class
class BaseComponent {
  constructor(container, options = {}) {
    this.container = typeof container === 'string' ? document.querySelector(container) : container;
    this.options = { ...this.defaultOptions, ...options };
    this.isVisible = false;
    this.eventListeners = [];
    
    this.setupComponent();
    this.bindEvents();
  }

  get defaultOptions() {
    return {};
  }

  setupComponent() {
    // Override in subclasses
  }

  bindEvents() {
    // Override in subclasses
  }

  show() {
    if (this.container) {
      this.container.style.display = 'block';
      this.isVisible = true;
      this.onShow();
    }
  }

  hide() {
    if (this.container) {
      this.container.style.display = 'none';
      this.isVisible = false;
      this.onHide();
    }
  }

  onShow() {
    // Override in subclasses
  }

  onHide() {
    // Override in subclasses
  }

  destroy() {
    this.eventListeners.forEach(({ element, event, handler }) => {
      element.removeEventListener(event, handler);
    });
    this.eventListeners = [];
  }

  addEventListener(element, event, handler) {
    element.addEventListener(event, handler);
    this.eventListeners.push({ element, event, handler });
  }

  emit(eventName, data) {
    uiState.emit(eventName, data);
  }
}

// Loading Component
class LoadingComponent extends BaseComponent {
  get defaultOptions() {
    return {
      text: 'Loading...',
      showProgress: false,
      cancellable: false
    };
  }

  setupComponent() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="loading-content">
        <div class="spinner"></div>
        <p class="loading-text">${this.options.text}</p>
        ${this.options.showProgress ? '<div class="progress-bar"><div class="progress-fill"></div></div>' : ''}
        ${this.options.cancellable ? '<button class="btn-secondary cancel-btn">Cancel</button>' : ''}
      </div>
    `;

    this.textElement = this.container.querySelector('.loading-text');
    this.progressFill = this.container.querySelector('.progress-fill');
    this.cancelBtn = this.container.querySelector('.cancel-btn');

    if (this.cancelBtn) {
      this.addEventListener(this.cancelBtn, 'click', () => {
        this.emit('loading-cancelled');
      });
    }
  }

  updateText(text) {
    if (this.textElement) {
      this.textElement.textContent = text;
    }
  }

  updateProgress(percentage) {
    if (this.progressFill) {
      this.progressFill.style.width = `${Math.min(100, Math.max(0, percentage))}%`;
    }
  }

  showWithProgress(text, cancellable = false) {
    this.options.text = text;
    this.options.showProgress = true;
    this.options.cancellable = cancellable;
    this.setupComponent();
    this.show();
  }
}

// Control Panel Component
class ControlPanelComponent extends BaseComponent {
  get defaultOptions() {
    return {
      filters: {
        depth: 2,
        maxNodes: 100,
        minVolume: '0',
        direction: 'both',
        layout: 'force',
        timeRange: 'all'
      }
    };
  }

  setupComponent() {
    if (!this.container) return;

    this.filters = { ...this.options.filters };
    this.setupFilterControls();
    this.setupPresetButtons();
    this.loadSavedFilters();
  }

  setupFilterControls() {
    // Enhance existing filter controls with additional functionality
    this.depthFilter = document.getElementById('depth-filter');
    this.volumeFilter = document.getElementById('volume-filter');
    this.timeFilter = document.getElementById('time-filter');
    this.connectionFilter = document.getElementById('connection-filter');
    this.applyBtn = document.getElementById('apply-filters');
    this.resetBtn = document.getElementById('reset-filters');

    // Add new advanced filters
    this.addAdvancedFilters();

    // Bind events
    if (this.depthFilter) {
      this.addEventListener(this.depthFilter, 'change', (e) => {
        this.filters.depth = parseInt(e.target.value);
        this.onFilterChange();
      });
    }

    if (this.volumeFilter) {
      this.addEventListener(this.volumeFilter, 'input', (e) => {
        this.filters.minVolume = e.target.value;
        this.debounceFilterChange();
      });
    }

    if (this.timeFilter) {
      this.addEventListener(this.timeFilter, 'change', (e) => {
        this.filters.timeRange = e.target.value;
        this.onFilterChange();
      });
    }

    if (this.applyBtn) {
      this.addEventListener(this.applyBtn, 'click', () => {
        this.applyFilters();
      });
    }

    if (this.resetBtn) {
      this.addEventListener(this.resetBtn, 'click', () => {
        this.resetFilters();
      });
    }
  }

  addAdvancedFilters() {
    const advancedFiltersHTML = `
      <div class="advanced-filters" style="margin-top: 1rem;">
        <details>
          <summary>Advanced Filters</summary>
          <div class="filter-group">
            <label for="layout-filter">Graph Layout:</label>
            <select id="layout-filter">
              <option value="force">Force-directed</option>
              <option value="hierarchical">Hierarchical</option>
              <option value="circular">Circular</option>
            </select>
          </div>
          <div class="filter-group">
            <label for="node-types-filter">Node Types:</label>
            <div class="checkbox-group">
              <label><input type="checkbox" value="regular" checked> Regular</label>
              <label><input type="checkbox" value="exchange"> Exchange</label>
              <label><input type="checkbox" value="validator"> Validator</label>
              <label><input type="checkbox" value="pool"> Pool</label>
            </div>
          </div>
          <div class="filter-group">
            <label for="risk-threshold">Risk Threshold:</label>
            <input type="range" id="risk-threshold" min="0" max="100" value="50">
            <span class="range-value">50</span>
          </div>
          <div class="filter-group">
            <label>
              <input type="checkbox" id="enable-clustering"> Enable Clustering
            </label>
          </div>
        </details>
      </div>
    `;

    this.container.querySelector('.control-panel').insertAdjacentHTML('beforeend', advancedFiltersHTML);

    // Bind advanced filter events
    this.layoutFilter = document.getElementById('layout-filter');
    this.nodeTypesCheckboxes = document.querySelectorAll('.checkbox-group input[type="checkbox"]');
    this.riskThreshold = document.getElementById('risk-threshold');
    this.enableClustering = document.getElementById('enable-clustering');

    if (this.layoutFilter) {
      this.addEventListener(this.layoutFilter, 'change', (e) => {
        this.filters.layout = e.target.value;
        this.onFilterChange();
      });
    }

    if (this.riskThreshold) {
      this.addEventListener(this.riskThreshold, 'input', (e) => {
        const value = e.target.value;
        this.filters.riskThreshold = parseInt(value);
        e.target.nextElementSibling.textContent = value;
        this.debounceFilterChange();
      });
    }

    this.nodeTypesCheckboxes.forEach(checkbox => {
      this.addEventListener(checkbox, 'change', () => {
        this.filters.nodeTypes = Array.from(this.nodeTypesCheckboxes)
          .filter(cb => cb.checked)
          .map(cb => cb.value);
        this.onFilterChange();
      });
    });

    if (this.enableClustering) {
      this.addEventListener(this.enableClustering, 'change', (e) => {
        this.filters.enableClustering = e.target.checked;
        this.onFilterChange();
      });
    }
  }

  setupPresetButtons() {
    const presetsHTML = `
      <div class="filter-presets" style="margin-top: 1rem;">
        <h4>Quick Presets</h4>
        <div class="preset-buttons">
          <button class="btn-secondary preset-btn" data-preset="overview">Overview</button>
          <button class="btn-secondary preset-btn" data-preset="detailed">Detailed</button>
          <button class="btn-secondary preset-btn" data-preset="risk-analysis">Risk Analysis</button>
          <button class="btn-secondary preset-btn" data-preset="transaction-flow">Transaction Flow</button>
        </div>
      </div>
    `;

    this.container.querySelector('.control-panel').insertAdjacentHTML('beforeend', presetsHTML);

    this.presetButtons = document.querySelectorAll('.preset-btn');
    this.presetButtons.forEach(btn => {
      this.addEventListener(btn, 'click', (e) => {
        this.applyPreset(e.target.dataset.preset);
      });
    });
  }

  applyPreset(presetName) {
    const presets = {
      overview: {
        depth: 1,
        maxNodes: 50,
        minVolume: '0',
        layout: 'force',
        enableClustering: false
      },
      detailed: {
        depth: 3,
        maxNodes: 200,
        minVolume: '0',
        layout: 'hierarchical',
        enableClustering: true
      },
      'risk-analysis': {
        depth: 2,
        maxNodes: 100,
        minVolume: '1000000000000',
        riskThreshold: 30,
        layout: 'force'
      },
      'transaction-flow': {
        depth: 4,
        maxNodes: 150,
        minVolume: '100000000000',
        layout: 'hierarchical',
        direction: 'both'
      }
    };

    const preset = presets[presetName];
    if (preset) {
      this.filters = { ...this.filters, ...preset };
      this.updateUIFromFilters();
      this.applyFilters();
    }
  }

  updateUIFromFilters() {
    if (this.depthFilter) this.depthFilter.value = this.filters.depth;
    if (this.volumeFilter) this.volumeFilter.value = this.filters.minVolume;
    if (this.layoutFilter) this.layoutFilter.value = this.filters.layout;
    if (this.riskThreshold) {
      this.riskThreshold.value = this.filters.riskThreshold || 50;
      this.riskThreshold.nextElementSibling.textContent = this.riskThreshold.value;
    }
  }

  onFilterChange() {
    if (uiState.preferences.autoSave) {
      this.saveFilters();
    }
    this.emit('filters-changed', this.filters);
  }

  debounceFilterChange() {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.onFilterChange();
    }, 300);
  }

  applyFilters() {
    this.emit('apply-filters', this.filters);
    this.saveFilters();
  }

  resetFilters() {
    this.filters = { ...this.options.filters };
    this.updateUIFromFilters();
    this.onFilterChange();
  }

  saveFilters() {
    localStorage.setItem('polkadot-analysis-filters', JSON.stringify(this.filters));
  }

  loadSavedFilters() {
    const saved = localStorage.getItem('polkadot-analysis-filters');
    if (saved) {
      this.filters = { ...this.filters, ...JSON.parse(saved) };
      this.updateUIFromFilters();
    }
  }

  getFilters() {
    return { ...this.filters };
  }
}

// Address Details Component
class AddressDetailsComponent extends BaseComponent {
  get defaultOptions() {
    return {
      showTransferHistory: true,
      showPatterns: true,
      showRiskScore: true,
      maxTransfers: 100
    };
  }

  setupComponent() {
    if (!this.container) return;

    this.currentAddress = null;
    this.transfersData = [];
    this.setupDetailsPanels();
    this.setupTabs();
  }

  setupDetailsPanels() {
    this.container.innerHTML = `
      <div class="address-details-header">
        <h3>Address Details</h3>
        <button class="close-btn" title="Close">&times;</button>
      </div>
      <div class="address-details-tabs">
        <button class="tab-btn active" data-tab="overview">Overview</button>
        <button class="tab-btn" data-tab="transfers">Transfers</button>
        <button class="tab-btn" data-tab="patterns">Patterns</button>
        <button class="tab-btn" data-tab="risk">Risk Analysis</button>
      </div>
      <div class="address-details-content">
        <div class="tab-content active" id="overview-tab">
          <div class="overview-content">
            <div class="address-info">
              <div class="info-item">
                <span class="label">Address:</span>
                <span class="value address-value" id="address-display"></span>
                <button class="copy-btn" title="Copy address">📋</button>
              </div>
              <div class="info-item">
                <span class="label">Identity:</span>
                <span class="value" id="identity-display">-</span>
              </div>
              <div class="info-item">
                <span class="label">Balance:</span>
                <span class="value" id="balance-display">-</span>
              </div>
              <div class="info-item">
                <span class="label">Total Transfers:</span>
                <span class="value" id="transfer-count-display">-</span>
              </div>
              <div class="info-item">
                <span class="label">Total Volume:</span>
                <span class="value" id="total-volume-display">-</span>
              </div>
            </div>
            <div class="quick-actions">
              <button class="btn-primary" id="expand-graph-btn">Expand Graph</button>
              <button class="btn-secondary" id="export-data-btn">Export Data</button>
              <button class="btn-secondary" id="add-to-investigation-btn">Add to Investigation</button>
            </div>
          </div>
        </div>
        <div class="tab-content" id="transfers-tab">
          <div class="transfers-controls">
            <input type="text" id="transfer-search" placeholder="Search transfers...">
            <select id="transfer-filter">
              <option value="all">All Transfers</option>
              <option value="incoming">Incoming</option>
              <option value="outgoing">Outgoing</option>
              <option value="large">Large (>1 DOT)</option>
            </select>
          </div>
          <div class="transfers-list" id="transfers-list">
            <!-- Transfer items will be populated here -->
          </div>
          <div class="transfers-pagination">
            <button class="btn-secondary" id="load-more-transfers">Load More</button>
          </div>
        </div>
        <div class="tab-content" id="patterns-tab">
          <div class="patterns-content" id="patterns-content">
            <!-- Pattern analysis will be populated here -->
          </div>
        </div>
        <div class="tab-content" id="risk-tab">
          <div class="risk-content" id="risk-content">
            <!-- Risk analysis will be populated here -->
          </div>
        </div>
      </div>
    `;

    this.bindDetailsPanelEvents();
  }

  setupTabs() {
    this.tabButtons = this.container.querySelectorAll('.tab-btn');
    this.tabContents = this.container.querySelectorAll('.tab-content');

    this.tabButtons.forEach(btn => {
      this.addEventListener(btn, 'click', (e) => {
        const tabName = e.target.dataset.tab;
        this.switchTab(tabName);
      });
    });
  }

  bindDetailsPanelEvents() {
    const closeBtn = this.container.querySelector('.close-btn');
    const copyBtn = this.container.querySelector('.copy-btn');
    const expandBtn = this.container.querySelector('#expand-graph-btn');
    const exportBtn = this.container.querySelector('#export-data-btn');
    const addToInvestigationBtn = this.container.querySelector('#add-to-investigation-btn');
    const transferSearch = this.container.querySelector('#transfer-search');
    const transferFilter = this.container.querySelector('#transfer-filter');
    const loadMoreBtn = this.container.querySelector('#load-more-transfers');

    if (closeBtn) {
      this.addEventListener(closeBtn, 'click', () => {
        this.hide();
      });
    }

    if (copyBtn) {
      this.addEventListener(copyBtn, 'click', () => {
        this.copyAddressToClipboard();
      });
    }

    if (expandBtn) {
      this.addEventListener(expandBtn, 'click', () => {
        this.emit('expand-graph', { address: this.currentAddress });
      });
    }

    if (exportBtn) {
      this.addEventListener(exportBtn, 'click', () => {
        this.exportAddressData();
      });
    }

    if (addToInvestigationBtn) {
      this.addEventListener(addToInvestigationBtn, 'click', () => {
        this.emit('add-to-investigation', { address: this.currentAddress });
      });
    }

    if (transferSearch) {
      this.addEventListener(transferSearch, 'input', (e) => {
        this.filterTransfers(e.target.value);
      });
    }

    if (transferFilter) {
      this.addEventListener(transferFilter, 'change', (e) => {
        this.filterTransfersByType(e.target.value);
      });
    }

    if (loadMoreBtn) {
      this.addEventListener(loadMoreBtn, 'click', () => {
        this.loadMoreTransfers();
      });
    }
  }

  switchTab(tabName) {
    this.tabButtons.forEach(btn => btn.classList.remove('active'));
    this.tabContents.forEach(content => content.classList.remove('active'));

    const activeBtn = this.container.querySelector(`[data-tab="${tabName}"]`);
    const activeContent = this.container.querySelector(`#${tabName}-tab`);

    if (activeBtn) activeBtn.classList.add('active');
    if (activeContent) activeContent.classList.add('active');

    // Load tab-specific data
    this.loadTabData(tabName);
  }

  async loadTabData(tabName) {
    if (!this.currentAddress) return;

    switch (tabName) {
      case 'transfers':
        await this.loadTransfers();
        break;
      case 'patterns':
        await this.loadPatterns();
        break;
      case 'risk':
        await this.loadRiskAnalysis();
        break;
    }
  }

  async showAddressDetails(address) {
    this.currentAddress = address;
    this.show();

    try {
      // Load basic address information
      const response = await fetch(`/api/addresses/${address}`);
      if (response.ok) {
        const addressData = await response.json();
        this.displayAddressInfo(addressData);
      }

      // Load the current active tab data
      const activeTab = this.container.querySelector('.tab-btn.active').dataset.tab;
      await this.loadTabData(activeTab);

    } catch (error) {
      console.error('Error loading address details:', error);
      this.showError('Failed to load address details');
    }
  }

  displayAddressInfo(data) {
    const addressDisplay = this.container.querySelector('#address-display');
    const identityDisplay = this.container.querySelector('#identity-display');
    const balanceDisplay = this.container.querySelector('#balance-display');
    const transferCountDisplay = this.container.querySelector('#transfer-count-display');
    const totalVolumeDisplay = this.container.querySelector('#total-volume-display');

    if (addressDisplay) {
      addressDisplay.textContent = this.formatAddress(data.address);
      addressDisplay.title = data.address;
    }

    if (identityDisplay) {
      identityDisplay.textContent = data.identity?.display || 'No identity';
    }

    if (balanceDisplay) {
      balanceDisplay.textContent = this.formatBalance(data.balance);
    }

    if (transferCountDisplay) {
      transferCountDisplay.textContent = data.transferCount || 0;
    }

    if (totalVolumeDisplay) {
      totalVolumeDisplay.textContent = this.formatBalance(data.totalVolume);
    }
  }

  async loadTransfers() {
    try {
      const response = await fetch(`/api/addresses/${this.currentAddress}/transfers?limit=${this.options.maxTransfers}`);
      if (response.ok) {
        const data = await response.json();
        this.transfersData = data.transfers || [];
        this.displayTransfers(this.transfersData);
      }
    } catch (error) {
      console.error('Error loading transfers:', error);
    }
  }

  displayTransfers(transfers) {
    const transfersList = this.container.querySelector('#transfers-list');
    if (!transfersList) return;

    if (transfers.length === 0) {
      transfersList.innerHTML = '<p class="no-data">No transfers found</p>';
      return;
    }

    transfersList.innerHTML = transfers.map(transfer => `
      <div class="transfer-item" data-hash="${transfer.hash}">
        <div class="transfer-header">
          <span class="transfer-direction ${transfer.from_address === this.currentAddress ? 'outgoing' : 'incoming'}">
            ${transfer.from_address === this.currentAddress ? '→' : '←'}
          </span>
          <span class="transfer-amount">${this.formatBalance(transfer.value)}</span>
          <span class="transfer-time">${this.formatTime(transfer.timestamp)}</span>
        </div>
        <div class="transfer-details">
          <div class="transfer-addresses">
            <span class="from-address">From: ${this.formatAddress(transfer.from_address)}</span>
            <span class="to-address">To: ${this.formatAddress(transfer.to_address)}</span>
          </div>
          <div class="transfer-meta">
            <span class="transfer-hash">Tx: ${transfer.hash.substring(0, 10)}...</span>
            <span class="transfer-status ${transfer.success ? 'success' : 'failed'}">${transfer.success ? 'Success' : 'Failed'}</span>
          </div>
        </div>
      </div>
    `).join('');

    // Add click events to transfer items
    transfersList.querySelectorAll('.transfer-item').forEach(item => {
      this.addEventListener(item, 'click', (e) => {
        const hash = e.currentTarget.dataset.hash;
        this.emit('transfer-selected', { hash, transfer: transfers.find(t => t.hash === hash) });
      });
    });
  }

  async loadPatterns() {
    try {
      const response = await fetch(`/api/addresses/${this.currentAddress}/patterns`);
      if (response.ok) {
        const data = await response.json();
        this.displayPatterns(data.patterns || []);
      }
    } catch (error) {
      console.error('Error loading patterns:', error);
    }
  }

  displayPatterns(patterns) {
    const patternsContent = this.container.querySelector('#patterns-content');
    if (!patternsContent) return;

    if (patterns.length === 0) {
      patternsContent.innerHTML = '<p class="no-data">No suspicious patterns detected</p>';
      return;
    }

    patternsContent.innerHTML = patterns.map(pattern => `
      <div class="pattern-item severity-${pattern.severity}">
        <div class="pattern-header">
          <span class="pattern-type">${this.formatPatternType(pattern.pattern_type)}</span>
          <span class="pattern-confidence">${(pattern.confidence * 100).toFixed(1)}%</span>
          <span class="pattern-severity severity-${pattern.severity}">${pattern.severity.toUpperCase()}</span>
        </div>
        <div class="pattern-description">${pattern.description}</div>
        ${pattern.evidence ? `<div class="pattern-evidence">
          <details>
            <summary>Evidence</summary>
            <pre>${JSON.stringify(pattern.evidence, null, 2)}</pre>
          </details>
        </div>` : ''}
      </div>
    `).join('');
  }

  async loadRiskAnalysis() {
    try {
      // Load risk score and analysis
      const response = await fetch(`/api/graph/metrics/${this.currentAddress}`);
      if (response.ok) {
        const data = await response.json();
        this.displayRiskAnalysis(data);
      }
    } catch (error) {
      console.error('Error loading risk analysis:', error);
    }
  }

  displayRiskAnalysis(data) {
    const riskContent = this.container.querySelector('#risk-content');
    if (!riskContent) return;

    const riskScore = data.riskScore || 0;
    const riskLevel = this.getRiskLevel(riskScore);

    riskContent.innerHTML = `
      <div class="risk-score-section">
        <div class="risk-score-display">
          <div class="risk-score-circle risk-${riskLevel}">
            <span class="risk-score-number">${riskScore}</span>
          </div>
          <div class="risk-level">Risk Level: <span class="risk-${riskLevel}">${riskLevel.toUpperCase()}</span></div>
        </div>
        <div class="risk-factors">
          <h4>Risk Factors</h4>
          ${this.formatRiskFactors(data.riskFactors || [])}
        </div>
      </div>
      <div class="network-metrics">
        <h4>Network Metrics</h4>
        <div class="metrics-grid">
          <div class="metric-item">
            <span class="metric-label">Degree Centrality:</span>
            <span class="metric-value">${data.degreeCentrality || 0}</span>
          </div>
          <div class="metric-item">
            <span class="metric-label">Betweenness Centrality:</span>
            <span class="metric-value">${data.betweennessCentrality || 0}</span>
          </div>
          <div class="metric-item">
            <span class="metric-label">Clustering Coefficient:</span>
            <span class="metric-value">${data.clusteringCoefficient || 0}</span>
          </div>
          <div class="metric-item">
            <span class="metric-label">Connected Components:</span>
            <span class="metric-value">${data.connectedComponents || 0}</span>
          </div>
        </div>
      </div>
    `;
  }

  copyAddressToClipboard() {
    if (this.currentAddress) {
      navigator.clipboard.writeText(this.currentAddress).then(() => {
        this.showTemporaryMessage('Address copied to clipboard');
      });
    }
  }

  exportAddressData() {
    if (!this.currentAddress) return;

    const data = {
      address: this.currentAddress,
      timestamp: new Date().toISOString(),
      transfers: this.transfersData,
      // Add more data as needed
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `address-${this.currentAddress.substring(0, 8)}-data.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  filterTransfers(searchTerm) {
    const items = this.container.querySelectorAll('.transfer-item');
    items.forEach(item => {
      const text = item.textContent.toLowerCase();
      item.style.display = text.includes(searchTerm.toLowerCase()) ? 'block' : 'none';
    });
  }

  filterTransfersByType(type) {
    const items = this.container.querySelectorAll('.transfer-item');
    items.forEach(item => {
      const shouldShow = this.shouldShowTransfer(item, type);
      item.style.display = shouldShow ? 'block' : 'none';
    });
  }

  shouldShowTransfer(item, type) {
    switch (type) {
      case 'all':
        return true;
      case 'incoming':
        return item.querySelector('.transfer-direction').textContent.trim() === '←';
      case 'outgoing':
        return item.querySelector('.transfer-direction').textContent.trim() === '→';
      case 'large':
        const amountText = item.querySelector('.transfer-amount').textContent;
        const amount = parseFloat(amountText.replace(/[^\d.]/g, ''));
        return amount > 1;
      default:
        return true;
    }
  }

  formatAddress(address) {
    return `${address.substring(0, 6)}...${address.substring(address.length - 6)}`;
  }

  formatBalance(balance) {
    if (!balance) return '0 DOT';
    const dot = parseFloat(balance) / 1e12;
    return `${dot.toFixed(4)} DOT`;
  }

  formatTime(timestamp) {
    return new Date(timestamp).toLocaleString();
  }

  formatPatternType(type) {
    return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  getRiskLevel(score) {
    if (score >= 70) return 'high';
    if (score >= 40) return 'medium';
    return 'low';
  }

  formatRiskFactors(factors) {
    if (factors.length === 0) {
      return '<p class="no-data">No specific risk factors identified</p>';
    }

    return factors.map(factor => `
      <div class="risk-factor">
        <span class="factor-name">${factor.name}</span>
        <span class="factor-impact impact-${factor.impact}">${factor.impact}</span>
      </div>
    `).join('');
  }

  showTemporaryMessage(message, duration = 3000) {
    const messageEl = document.createElement('div');
    messageEl.className = 'temporary-message';
    messageEl.textContent = message;
    this.container.appendChild(messageEl);

    setTimeout(() => {
      messageEl.remove();
    }, duration);
  }

  showError(message) {
    const errorEl = document.createElement('div');
    errorEl.className = 'error-message';
    errorEl.textContent = message;
    this.container.appendChild(errorEl);

    setTimeout(() => {
      errorEl.remove();
    }, 5000);
  }
}

// Pattern Detection Alerts Component
class PatternAlertsComponent extends BaseComponent {
  get defaultOptions() {
    return {
      autoShow: true,
      maxAlerts: 10,
      alertDuration: 10000
    };
  }

  setupComponent() {
    if (!this.container) {
      // Create floating alerts container
      this.container = document.createElement('div');
      this.container.className = 'pattern-alerts-container';
      this.container.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 1000;
        width: 350px;
        pointer-events: none;
      `;
      document.body.appendChild(this.container);
    }

    this.alerts = [];
    this.setupAlertListeners();
  }

  setupAlertListeners() {
    uiState.on('pattern-detected', (event) => {
      this.showAlert(event.detail);
    });

    uiState.on('risk-threshold-exceeded', (event) => {
      this.showRiskAlert(event.detail);
    });
  }

  showAlert(pattern) {
    if (!this.options.autoShow) return;

    const alertId = `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const alert = {
      id: alertId,
      pattern,
      timestamp: Date.now()
    };

    this.alerts.unshift(alert);
    if (this.alerts.length > this.options.maxAlerts) {
      this.alerts = this.alerts.slice(0, this.options.maxAlerts);
    }

    this.renderAlert(alert);
    
    // Auto-dismiss after duration
    setTimeout(() => {
      this.dismissAlert(alertId);
    }, this.options.alertDuration);
  }

  showRiskAlert(riskData) {
    const alert = {
      id: `risk-alert-${Date.now()}`,
      type: 'risk',
      severity: riskData.level,
      title: 'High Risk Address Detected',
      message: `Address ${riskData.address.substring(0, 8)}... has a risk score of ${riskData.score}`,
      timestamp: Date.now()
    };

    this.alerts.unshift(alert);
    this.renderAlert(alert);

    setTimeout(() => {
      this.dismissAlert(alert.id);
    }, this.options.alertDuration);
  }

  renderAlert(alert) {
    const alertEl = document.createElement('div');
    alertEl.className = `pattern-alert alert-${alert.pattern?.severity || alert.severity || 'medium'}`;
    alertEl.id = alert.id;
    alertEl.style.cssText = `
      background: var(--surface-color);
      border: 1px solid var(--border-color);
      border-left: 4px solid var(--warning-color);
      border-radius: 4px;
      padding: 1rem;
      margin-bottom: 0.5rem;
      animation: slideInRight 0.3s ease-out;
      pointer-events: auto;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    `;

    if (alert.pattern) {
      alertEl.innerHTML = `
        <div class="alert-header">
          <span class="alert-title">Suspicious Pattern Detected</span>
          <button class="alert-close">&times;</button>
        </div>
        <div class="alert-content">
          <div class="pattern-info">
            <span class="pattern-type">${this.formatPatternType(alert.pattern.patternType)}</span>
            <span class="pattern-confidence">${(alert.pattern.confidence * 100).toFixed(1)}% confidence</span>
          </div>
          <div class="pattern-address">Address: ${this.formatAddress(alert.pattern.address)}</div>
          <div class="alert-actions">
            <button class="btn-small investigate-btn">Investigate</button>
            <button class="btn-small dismiss-btn">Dismiss</button>
          </div>
        </div>
      `;
    } else {
      alertEl.innerHTML = `
        <div class="alert-header">
          <span class="alert-title">${alert.title}</span>
          <button class="alert-close">&times;</button>
        </div>
        <div class="alert-content">
          <div class="alert-message">${alert.message}</div>
          <div class="alert-actions">
            <button class="btn-small dismiss-btn">Dismiss</button>
          </div>
        </div>
      `;
    }

    // Set border color based on severity
    if (alert.pattern?.severity === 'high' || alert.severity === 'high') {
      alertEl.style.borderLeftColor = 'var(--error-color)';
    } else if (alert.pattern?.severity === 'medium' || alert.severity === 'medium') {
      alertEl.style.borderLeftColor = 'var(--warning-color)';
    } else {
      alertEl.style.borderLeftColor = 'var(--primary-color)';
    }

    this.container.prepend(alertEl);

    // Bind events
    const closeBtn = alertEl.querySelector('.alert-close');
    const dismissBtn = alertEl.querySelector('.dismiss-btn');
    const investigateBtn = alertEl.querySelector('.investigate-btn');

    if (closeBtn) {
      this.addEventListener(closeBtn, 'click', () => {
        this.dismissAlert(alert.id);
      });
    }

    if (dismissBtn) {
      this.addEventListener(dismissBtn, 'click', () => {
        this.dismissAlert(alert.id);
      });
    }

    if (investigateBtn) {
      this.addEventListener(investigateBtn, 'click', () => {
        this.emit('investigate-pattern', alert.pattern);
        this.dismissAlert(alert.id);
      });
    }
  }

  dismissAlert(alertId) {
    const alertEl = document.getElementById(alertId);
    if (alertEl) {
      alertEl.style.animation = 'slideOutRight 0.3s ease-in forwards';
      setTimeout(() => {
        alertEl.remove();
      }, 300);
    }

    this.alerts = this.alerts.filter(alert => alert.id !== alertId);
  }

  formatPatternType(type) {
    return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  formatAddress(address) {
    return `${address.substring(0, 6)}...${address.substring(address.length - 6)}`;
  }

  clearAllAlerts() {
    this.alerts.forEach(alert => this.dismissAlert(alert.id));
  }
}

// Investigation Session Management Component
class InvestigationSessionComponent extends BaseComponent {
  get defaultOptions() {
    return {
      autoSave: true,
      saveInterval: 30000, // 30 seconds
      maxSessions: 10
    };
  }

  setupComponent() {
    this.currentSession = null;
    this.sessionData = {
      addresses: [],
      filters: {},
      graphState: {},
      notes: '',
      timestamp: null
    };

    this.setupSessionUI();
    this.loadSessions();
    this.setupAutoSave();
  }

  setupSessionUI() {
    const sessionHTML = `
      <div class="investigation-sessions">
        <div class="session-header">
          <h4>Investigation Sessions</h4>
          <div class="session-controls">
            <button class="btn-small" id="new-session-btn">New</button>
            <button class="btn-small" id="save-session-btn">Save</button>
            <button class="btn-small" id="load-session-btn">Load</button>
          </div>
        </div>
        <div class="current-session" id="current-session">
          <div class="session-info">
            <span class="session-name">No active session</span>
            <span class="session-time"></span>
          </div>
          <div class="session-addresses">
            <div class="addresses-list" id="session-addresses-list"></div>
            <input type="text" id="add-address-input" placeholder="Add address to investigation...">
          </div>
          <div class="session-notes">
            <label for="session-notes-input">Investigation Notes:</label>
            <textarea id="session-notes-input" placeholder="Add notes about your investigation..."></textarea>
          </div>
        </div>
        <div class="sessions-list" id="sessions-list" style="display: none;">
          <!-- Saved sessions will be listed here -->
        </div>
      </div>
    `;

    this.container.insertAdjacentHTML('beforeend', sessionHTML);
    this.bindSessionEvents();
  }

  bindSessionEvents() {
    const newSessionBtn = document.getElementById('new-session-btn');
    const saveSessionBtn = document.getElementById('save-session-btn');
    const loadSessionBtn = document.getElementById('load-session-btn');
    const addAddressInput = document.getElementById('add-address-input');
    const notesInput = document.getElementById('session-notes-input');

    if (newSessionBtn) {
      this.addEventListener(newSessionBtn, 'click', () => {
        this.newSession();
      });
    }

    if (saveSessionBtn) {
      this.addEventListener(saveSessionBtn, 'click', () => {
        this.saveCurrentSession();
      });
    }

    if (loadSessionBtn) {
      this.addEventListener(loadSessionBtn, 'click', () => {
        this.toggleSessionsList();
      });
    }

    if (addAddressInput) {
      this.addEventListener(addAddressInput, 'keypress', (e) => {
        if (e.key === 'Enter') {
          this.addAddressToSession(e.target.value.trim());
          e.target.value = '';
        }
      });
    }

    if (notesInput) {
      this.addEventListener(notesInput, 'input', (e) => {
        this.sessionData.notes = e.target.value;
        if (this.options.autoSave) {
          this.scheduleAutoSave();
        }
      });
    }

    // Listen for address selections from the graph
    uiState.on('address-selected', (event) => {
      this.addAddressToSession(event.detail.address);
    });

    uiState.on('filters-changed', (event) => {
      this.sessionData.filters = event.detail;
      if (this.options.autoSave) {
        this.scheduleAutoSave();
      }
    });
  }

  newSession() {
    const sessionName = prompt('Enter investigation name:', `Investigation ${new Date().toLocaleDateString()}`);
    if (!sessionName) return;

    this.currentSession = {
      id: `session-${Date.now()}`,
      name: sessionName,
      created: new Date().toISOString()
    };

    this.sessionData = {
      addresses: [],
      filters: {},
      graphState: {},
      notes: '',
      timestamp: new Date().toISOString()
    };

    this.updateSessionUI();
    this.emit('session-created', this.currentSession);
  }

  addAddressToSession(address) {
    if (!address || this.sessionData.addresses.includes(address)) return;

    this.sessionData.addresses.push(address);
    this.updateAddressesList();
    
    if (this.options.autoSave) {
      this.scheduleAutoSave();
    }

    this.emit('address-added-to-session', { address, session: this.currentSession });
  }

  removeAddressFromSession(address) {
    this.sessionData.addresses = this.sessionData.addresses.filter(addr => addr !== address);
    this.updateAddressesList();
    
    if (this.options.autoSave) {
      this.scheduleAutoSave();
    }
  }

  updateSessionUI() {
    const sessionName = this.container.querySelector('.session-name');
    const sessionTime = this.container.querySelector('.session-time');

    if (sessionName && this.currentSession) {
      sessionName.textContent = this.currentSession.name;
    }

    if (sessionTime && this.currentSession) {
      sessionTime.textContent = new Date(this.currentSession.created).toLocaleString();
    }

    this.updateAddressesList();
  }

  updateAddressesList() {
    const addressesList = document.getElementById('session-addresses-list');
    if (!addressesList) return;

    if (this.sessionData.addresses.length === 0) {
      addressesList.innerHTML = '<p class="no-addresses">No addresses in this investigation</p>';
      return;
    }

    addressesList.innerHTML = this.sessionData.addresses.map(address => `
      <div class="session-address-item">
        <span class="address-text">${this.formatAddress(address)}</span>
        <div class="address-actions">
          <button class="btn-tiny view-btn" data-address="${address}">View</button>
          <button class="btn-tiny remove-btn" data-address="${address}">Remove</button>
        </div>
      </div>
    `).join('');

    // Bind address item events
    addressesList.querySelectorAll('.view-btn').forEach(btn => {
      this.addEventListener(btn, 'click', (e) => {
        const address = e.target.dataset.address;
        this.emit('view-address', { address });
      });
    });

    addressesList.querySelectorAll('.remove-btn').forEach(btn => {
      this.addEventListener(btn, 'click', (e) => {
        const address = e.target.dataset.address;
        this.removeAddressFromSession(address);
      });
    });
  }

  saveCurrentSession() {
    if (!this.currentSession) {
      this.newSession();
      return;
    }

    const sessions = this.loadSessions();
    sessions[this.currentSession.id] = {
      ...this.currentSession,
      data: { ...this.sessionData },
      lastModified: new Date().toISOString()
    };

    localStorage.setItem('polkadot-investigation-sessions', JSON.stringify(sessions));
    this.showTemporaryMessage('Session saved successfully');
  }

  loadSessions() {
    const stored = localStorage.getItem('polkadot-investigation-sessions');
    return stored ? JSON.parse(stored) : {};
  }

  toggleSessionsList() {
    const sessionsList = document.getElementById('sessions-list');
    if (!sessionsList) return;

    if (sessionsList.style.display === 'none') {
      this.displaySessionsList();
      sessionsList.style.display = 'block';
    } else {
      sessionsList.style.display = 'none';
    }
  }

  displaySessionsList() {
    const sessionsList = document.getElementById('sessions-list');
    const sessions = this.loadSessions();
    const sessionEntries = Object.entries(sessions);

    if (sessionEntries.length === 0) {
      sessionsList.innerHTML = '<p class="no-sessions">No saved sessions</p>';
      return;
    }

    sessionsList.innerHTML = `
      <h5>Saved Sessions</h5>
      <div class="sessions-grid">
        ${sessionEntries.map(([id, session]) => `
          <div class="session-item" data-session-id="${id}">
            <div class="session-item-header">
              <span class="session-item-name">${session.name}</span>
              <div class="session-item-actions">
                <button class="btn-tiny load-btn">Load</button>
                <button class="btn-tiny delete-btn">Delete</button>
              </div>
            </div>
            <div class="session-item-meta">
              <span class="session-addresses-count">${session.data.addresses.length} addresses</span>
              <span class="session-date">${new Date(session.lastModified).toLocaleDateString()}</span>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    // Bind session item events
    sessionsList.querySelectorAll('.load-btn').forEach(btn => {
      this.addEventListener(btn, 'click', (e) => {
        const sessionId = e.target.closest('.session-item').dataset.sessionId;
        this.loadSession(sessionId);
      });
    });

    sessionsList.querySelectorAll('.delete-btn').forEach(btn => {
      this.addEventListener(btn, 'click', (e) => {
        const sessionId = e.target.closest('.session-item').dataset.sessionId;
        this.deleteSession(sessionId);
      });
    });
  }

  loadSession(sessionId) {
    const sessions = this.loadSessions();
    const session = sessions[sessionId];

    if (!session) {
      this.showError('Session not found');
      return;
    }

    this.currentSession = session;
    this.sessionData = { ...session.data };

    this.updateSessionUI();
    
    // Update notes input
    const notesInput = document.getElementById('session-notes-input');
    if (notesInput) {
      notesInput.value = this.sessionData.notes || '';
    }

    // Hide sessions list
    const sessionsList = document.getElementById('sessions-list');
    if (sessionsList) {
      sessionsList.style.display = 'none';
    }

    this.emit('session-loaded', { session, data: this.sessionData });
    this.showTemporaryMessage(`Loaded session: ${session.name}`);
  }

  deleteSession(sessionId) {
    if (!confirm('Are you sure you want to delete this session?')) return;

    const sessions = this.loadSessions();
    delete sessions[sessionId];
    localStorage.setItem('polkadot-investigation-sessions', JSON.stringify(sessions));

    this.displaySessionsList();
    this.showTemporaryMessage('Session deleted');
  }

  setupAutoSave() {
    if (!this.options.autoSave) return;

    this.autoSaveTimer = setInterval(() => {
      if (this.currentSession && this.hasUnsavedChanges) {
        this.saveCurrentSession();
        this.hasUnsavedChanges = false;
      }
    }, this.options.saveInterval);
  }

  scheduleAutoSave() {
    this.hasUnsavedChanges = true;
  }

  exportSession() {
    if (!this.currentSession) {
      this.showError('No active session to export');
      return;
    }

    const exportData = {
      session: this.currentSession,
      data: this.sessionData,
      exported: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `investigation-${this.currentSession.name.replace(/\s+/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  formatAddress(address) {
    return `${address.substring(0, 6)}...${address.substring(address.length - 6)}`;
  }

  showTemporaryMessage(message, duration = 3000) {
    // Reuse the notification system from address details component
    const messageEl = document.createElement('div');
    messageEl.className = 'temporary-message';
    messageEl.textContent = message;
    messageEl.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: var(--success-color);
      color: white;
      padding: 0.75rem 1.5rem;
      border-radius: 4px;
      z-index: 1001;
    `;
    document.body.appendChild(messageEl);

    setTimeout(() => {
      messageEl.remove();
    }, duration);
  }

  showError(message) {
    const errorEl = document.createElement('div');
    errorEl.className = 'error-message';
    errorEl.textContent = message;
    errorEl.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: var(--error-color);
      color: white;
      padding: 0.75rem 1.5rem;
      border-radius: 4px;
      z-index: 1001;
    `;
    document.body.appendChild(errorEl);

    setTimeout(() => {
      errorEl.remove();
    }, 5000);
  }
}

// Statistics Dashboard Component
class StatsDashboardComponent extends BaseComponent {
  get defaultOptions() {
    return {
      updateInterval: 5000,
      showCharts: true,
      chartType: 'line'
    };
  }

  setupComponent() {
    this.stats = {
      nodes: 0,
      edges: 0,
      totalVolume: 0,
      avgRiskScore: 0,
      patternsDetected: 0
    };

    this.enhanceStatsPanel();
    this.setupRealTimeUpdates();
  }

  enhanceStatsPanel() {
    const statsPanel = this.container.querySelector('.stats-panel');
    if (!statsPanel) return;

    // Add enhanced stats display
    const enhancedHTML = `
      <div class="stats-grid">
        <div class="stat-item">
          <div class="stat-value" id="enhanced-node-count">0</div>
          <div class="stat-label">Network Nodes</div>
          <div class="stat-change" id="nodes-change"></div>
        </div>
        <div class="stat-item">
          <div class="stat-value" id="enhanced-edge-count">0</div>
          <div class="stat-label">Connections</div>
          <div class="stat-change" id="edges-change"></div>
        </div>
        <div class="stat-item">
          <div class="stat-value" id="enhanced-volume-count">0 DOT</div>
          <div class="stat-label">Total Volume</div>
          <div class="stat-change" id="volume-change"></div>
        </div>
        <div class="stat-item">
          <div class="stat-value" id="risk-score-avg">0</div>
          <div class="stat-label">Avg Risk Score</div>
          <div class="stat-change" id="risk-change"></div>
        </div>
        <div class="stat-item">
          <div class="stat-value" id="patterns-detected">0</div>
          <div class="stat-label">Patterns Detected</div>
          <div class="stat-change" id="patterns-change"></div>
        </div>
        <div class="stat-item">
          <div class="stat-value" id="network-density">0%</div>
          <div class="stat-label">Network Density</div>
          <div class="stat-change" id="density-change"></div>
        </div>
      </div>
      <div class="stats-charts" id="stats-charts">
        ${this.options.showCharts ? this.createChartsHTML() : ''}
      </div>
    `;

    statsPanel.innerHTML = `<h3>Network Statistics</h3>${enhancedHTML}`;
  }

  createChartsHTML() {
    return `
      <div class="chart-container">
        <h4>Network Growth</h4>
        <canvas id="network-growth-chart" width="300" height="150"></canvas>
      </div>
      <div class="chart-container">
        <h4>Risk Distribution</h4>
        <canvas id="risk-distribution-chart" width="300" height="150"></canvas>
      </div>
    `;
  }

  updateStats(newStats) {
    const prevStats = { ...this.stats };
    this.stats = { ...this.stats, ...newStats };

    // Update basic stats (maintain compatibility with existing system)
    const nodeCount = document.getElementById('node-count');
    const edgeCount = document.getElementById('edge-count');
    const totalVolume = document.getElementById('total-volume');

    if (nodeCount) nodeCount.textContent = this.stats.nodes;
    if (edgeCount) edgeCount.textContent = this.stats.edges;
    if (totalVolume) totalVolume.textContent = this.formatVolume(this.stats.totalVolume);

    // Update enhanced stats
    this.updateEnhancedStats(prevStats);
  }

  updateEnhancedStats(prevStats) {
    const updates = [
      { id: 'enhanced-node-count', value: this.stats.nodes, prev: prevStats.nodes, format: 'number' },
      { id: 'enhanced-edge-count', value: this.stats.edges, prev: prevStats.edges, format: 'number' },
      { id: 'enhanced-volume-count', value: this.stats.totalVolume, prev: prevStats.totalVolume, format: 'volume' },
      { id: 'risk-score-avg', value: this.stats.avgRiskScore, prev: prevStats.avgRiskScore, format: 'decimal' },
      { id: 'patterns-detected', value: this.stats.patternsDetected, prev: prevStats.patternsDetected, format: 'number' },
      { id: 'network-density', value: this.calculateNetworkDensity(), prev: this.calculateNetworkDensity(prevStats), format: 'percentage' }
    ];

    updates.forEach(update => {
      this.updateStatElement(update);
    });
  }

  updateStatElement({ id, value, prev, format }) {
    const element = document.getElementById(id);
    const changeElement = document.getElementById(id.replace(/enhanced-|(-count|-avg)/, '') + '-change');

    if (!element) return;

    // Update value
    element.textContent = this.formatStatValue(value, format);

    // Update change indicator
    if (changeElement && prev !== undefined) {
      const change = value - prev;
      if (change !== 0) {
        const changeText = change > 0 ? `+${this.formatStatValue(Math.abs(change), format)}` : `-${this.formatStatValue(Math.abs(change), format)}`;
        changeElement.textContent = changeText;
        changeElement.className = `stat-change ${change > 0 ? 'positive' : 'negative'}`;
      } else {
        changeElement.textContent = '';
        changeElement.className = 'stat-change';
      }
    }
  }

  formatStatValue(value, format) {
    switch (format) {
      case 'number':
        return value.toLocaleString();
      case 'volume':
        return this.formatVolume(value);
      case 'decimal':
        return value.toFixed(1);
      case 'percentage':
        return `${value.toFixed(1)}%`;
      default:
        return value.toString();
    }
  }

  formatVolume(volume) {
    const dot = parseFloat(volume) / 1e12;
    if (dot >= 1000000) {
      return `${(dot / 1000000).toFixed(1)}M DOT`;
    } else if (dot >= 1000) {
      return `${(dot / 1000).toFixed(1)}K DOT`;
    } else {
      return `${dot.toFixed(2)} DOT`;
    }
  }

  calculateNetworkDensity(stats = this.stats) {
    if (stats.nodes <= 1) return 0;
    const maxPossibleEdges = (stats.nodes * (stats.nodes - 1)) / 2;
    return maxPossibleEdges > 0 ? (stats.edges / maxPossibleEdges) * 100 : 0;
  }

  setupRealTimeUpdates() {
    if (this.options.updateInterval <= 0) return;

    this.updateTimer = setInterval(() => {
      this.refreshStats();
    }, this.options.updateInterval);

    // Listen for graph updates
    uiState.on('graph-updated', (event) => {
      const graphData = event.detail;
      this.updateStats({
        nodes: graphData.nodes?.length || 0,
        edges: graphData.links?.length || 0,
        totalVolume: this.calculateTotalVolume(graphData),
        avgRiskScore: this.calculateAvgRiskScore(graphData)
      });
    });

    uiState.on('pattern-detected', () => {
      this.stats.patternsDetected++;
      this.updateStats({ patternsDetected: this.stats.patternsDetected });
    });
  }

  async refreshStats() {
    try {
      const response = await fetch('/api/stats');
      if (response.ok) {
        const data = await response.json();
        this.updateStats(data);
      }
    } catch (error) {
      console.error('Error refreshing stats:', error);
    }
  }

  calculateTotalVolume(graphData) {
    if (!graphData?.links) return 0;
    return graphData.links.reduce((total, link) => {
      return total + (parseFloat(link.value || link.volume || 0));
    }, 0);
  }

  calculateAvgRiskScore(graphData) {
    if (!graphData?.nodes) return 0;
    const riskScores = graphData.nodes
      .map(node => node.riskScore || 0)
      .filter(score => score > 0);
    
    return riskScores.length > 0 
      ? riskScores.reduce((sum, score) => sum + score, 0) / riskScores.length 
      : 0;
  }

  destroy() {
    super.destroy();
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
    }
  }
}

// Export Component Classes
class ExportComponent extends BaseComponent {
  get defaultOptions() {
    return {
      formats: ['csv', 'json', 'png'],
      includeMetadata: true
    };
  }

  setupComponent() {
    this.setupExportButtons();
  }

  setupExportButtons() {
    const exportCsvBtn = document.getElementById('export-csv');
    const exportJsonBtn = document.getElementById('export-json');

    if (exportCsvBtn) {
      this.addEventListener(exportCsvBtn, 'click', () => {
        this.exportData('csv');
      });
    }

    if (exportJsonBtn) {
      this.addEventListener(exportJsonBtn, 'click', () => {
        this.exportData('json');
      });
    }

    // Add additional export options
    this.addAdvancedExportOptions();
  }

  addAdvancedExportOptions() {
    const exportPanel = this.container.querySelector('.export-panel');
    if (!exportPanel) return;

    const advancedHTML = `
      <div class="advanced-export" style="margin-top: 1rem;">
        <details>
          <summary>Export Options</summary>
          <div class="export-options">
            <label>
              <input type="checkbox" id="include-metadata" checked> Include Metadata
            </label>
            <label>
              <input type="checkbox" id="include-patterns"> Include Pattern Analysis
            </label>
            <label>
              <input type="checkbox" id="include-risk-scores"> Include Risk Scores
            </label>
            <div class="export-format">
              <label for="export-format-select">Format:</label>
              <select id="export-format-select">
                <option value="csv">CSV</option>
                <option value="json">JSON</option>
                <option value="graphml">GraphML</option>
                <option value="png">PNG Image</option>
              </select>
            </div>
            <button class="btn-primary" id="advanced-export-btn">Export</button>
          </div>
        </details>
      </div>
    `;

    exportPanel.insertAdjacentHTML('beforeend', advancedHTML);

    const advancedExportBtn = document.getElementById('advanced-export-btn');
    if (advancedExportBtn) {
      this.addEventListener(advancedExportBtn, 'click', () => {
        this.performAdvancedExport();
      });
    }
  }

  async exportData(format) {
    try {
      // Get current graph data
      const graphData = await this.getCurrentGraphData();
      
      switch (format) {
        case 'csv':
          this.exportCSV(graphData);
          break;
        case 'json':
          this.exportJSON(graphData);
          break;
        case 'png':
          this.exportPNG();
          break;
        default:
          console.error('Unsupported export format:', format);
      }
    } catch (error) {
      console.error('Export failed:', error);
      this.showError('Export failed. Please try again.');
    }
  }

  async performAdvancedExport() {
    const format = document.getElementById('export-format-select')?.value || 'json';
    const includeMetadata = document.getElementById('include-metadata')?.checked || false;
    const includePatterns = document.getElementById('include-patterns')?.checked || false;
    const includeRiskScores = document.getElementById('include-risk-scores')?.checked || false;

    const options = {
      format,
      includeMetadata,
      includePatterns,
      includeRiskScores
    };

    await this.exportWithOptions(options);
  }

  async exportWithOptions(options) {
    const graphData = await this.getCurrentGraphData();
    
    if (options.includePatterns) {
      graphData.patterns = await this.getPatternData();
    }

    if (options.includeRiskScores) {
      graphData.riskAnalysis = await this.getRiskData();
    }

    if (options.includeMetadata) {
      graphData.metadata = {
        exportedAt: new Date().toISOString(),
        exportOptions: options,
        version: '1.0.0'
      };
    }

    switch (options.format) {
      case 'csv':
        this.exportCSV(graphData);
        break;
      case 'json':
        this.exportJSON(graphData);
        break;
      case 'graphml':
        this.exportGraphML(graphData);
        break;
      case 'png':
        this.exportPNG();
        break;
    }
  }

  async getCurrentGraphData() {
    // This would need to be implemented to get current graph state
    // For now, return a placeholder
    return {
      nodes: [],
      links: [],
      timestamp: new Date().toISOString()
    };
  }

  async getPatternData() {
    // Get pattern analysis data
    return [];
  }

  async getRiskData() {
    // Get risk analysis data
    return {};
  }

  exportCSV(data) {
    const csvContent = this.convertToCSV(data);
    this.downloadFile(csvContent, 'polkadot-analysis.csv', 'text/csv');
  }

  exportJSON(data) {
    const jsonContent = JSON.stringify(data, null, 2);
    this.downloadFile(jsonContent, 'polkadot-analysis.json', 'application/json');
  }

  exportGraphML(data) {
    const graphmlContent = this.convertToGraphML(data);
    this.downloadFile(graphmlContent, 'polkadot-analysis.graphml', 'application/xml');
  }

  exportPNG() {
    const svg = document.getElementById('network-graph');
    if (!svg) {
      this.showError('No graph to export');
      return;
    }

    // Convert SVG to Canvas and then to PNG
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const data = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    const svgBlob = new Blob([data], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      canvas.width = svg.clientWidth;
      canvas.height = svg.clientHeight;
      ctx.drawImage(img, 0, 0);
      
      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'polkadot-graph.png';
        a.click();
        URL.revokeObjectURL(url);
      });
      
      URL.revokeObjectURL(url);
    };

    img.src = url;
  }

  convertToCSV(data) {
    if (!data.nodes || !data.links) return '';

    const nodesCsv = this.arrayToCSV(data.nodes, ['id', 'address', 'balance', 'riskScore', 'identity']);
    const linksCsv = this.arrayToCSV(data.links, ['source', 'target', 'value', 'transferCount', 'timestamp']);

    return `Nodes\n${nodesCsv}\n\nLinks\n${linksCsv}`;
  }

  convertToGraphML(data) {
    let graphml = `<?xml version="1.0" encoding="UTF-8"?>
<graphml xmlns="http://graphml.graphdrawing.org/xmlns"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://graphml.graphdrawing.org/xmlns
         http://graphml.graphdrawing.org/xmlns/1.0/graphml.xsd">
  <key id="address" for="node" attr.name="address" attr.type="string"/>
  <key id="balance" for="node" attr.name="balance" attr.type="double"/>
  <key id="riskScore" for="node" attr.name="riskScore" attr.type="double"/>
  <key id="value" for="edge" attr.name="value" attr.type="double"/>
  <key id="transferCount" for="edge" attr.name="transferCount" attr.type="int"/>
  <graph id="G" edgedefault="directed">
`;

    // Add nodes
    if (data.nodes) {
      data.nodes.forEach(node => {
        graphml += `    <node id="${node.id}">
      <data key="address">${node.address || ''}</data>
      <data key="balance">${node.balance || 0}</data>
      <data key="riskScore">${node.riskScore || 0}</data>
    </node>
`;
      });
    }

    // Add edges
    if (data.links) {
      data.links.forEach((link, index) => {
        graphml += `    <edge id="e${index}" source="${link.source}" target="${link.target}">
      <data key="value">${link.value || 0}</data>
      <data key="transferCount">${link.transferCount || 1}</data>
    </edge>
`;
      });
    }

    graphml += `  </graph>
</graphml>`;

    return graphml;
  }

  arrayToCSV(array, headers) {
    if (!array || array.length === 0) return '';

    const csvRows = [];
    csvRows.push(headers.join(','));

    array.forEach(item => {
      const values = headers.map(header => {
        const value = item[header] || '';
        return `"${value.toString().replace(/"/g, '""')}"`;
      });
      csvRows.push(values.join(','));
    });

    return csvRows.join('\n');
  }

  downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  showError(message) {
    // Use the same error display mechanism as other components
    const errorEl = document.createElement('div');
    errorEl.className = 'export-error';
    errorEl.textContent = message;
    errorEl.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: var(--error-color);
      color: white;
      padding: 0.75rem 1.5rem;
      border-radius: 4px;
      z-index: 1001;
    `;
    document.body.appendChild(errorEl);

    setTimeout(() => {
      errorEl.remove();
    }, 5000);
  }
}

// Initialize and export all components
export {
  UIState,
  BaseComponent,
  LoadingComponent,
  ControlPanelComponent,
  AddressDetailsComponent,
  PatternAlertsComponent,
  InvestigationSessionComponent,
  StatsDashboardComponent,
  ExportComponent,
  uiState
};

// Auto-initialization when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  console.log('UI Components module loaded');
  
  // Initialize core components
  const initializeComponents = () => {
    // Register components with global state
    const loading = new LoadingComponent('#loading');
    const controlPanel = new ControlPanelComponent('#controls-section');
    const addressDetails = new AddressDetailsComponent('#node-details');
    const patternAlerts = new PatternAlertsComponent();
    const investigationSession = new InvestigationSessionComponent('#controls-section');
    const statsDashboard = new StatsDashboardComponent('#controls-section');
    const exportComponent = new ExportComponent('#controls-section');

    uiState.register('loading', loading);
    uiState.register('controlPanel', controlPanel);
    uiState.register('addressDetails', addressDetails);
    uiState.register('patternAlerts', patternAlerts);
    uiState.register('investigationSession', investigationSession);
    uiState.register('statsDashboard', statsDashboard);
    uiState.register('exportComponent', exportComponent);

    console.log('All UI components initialized successfully');
  };

  // Initialize after a short delay to ensure DOM is fully ready
  setTimeout(initializeComponents, 100);
});