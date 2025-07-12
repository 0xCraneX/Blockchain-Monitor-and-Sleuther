/**
 * Polkadot Analysis Tool - Main Application
 * 
 * This module coordinates the frontend functionality and integrates
 * the D3.js graph visualization with the backend API.
 */

class PolkadotAnalysisApp {
    constructor() {
        // Hardcoded target address for analysis
        const TARGET_ADDRESS = '13RBN6UF43sxkxUrd2H4QSJccvLNGr6HY4v3mN2WtW59WaNk';
        
        // Application state
        this.state = {
            currentAddress: TARGET_ADDRESS,
            graphData: null,
            selectedNodes: new Set(),
            filters: {
                depth: 1,
                maxNodes: 100,
                minVolume: '0',
                minBalance: '0',
                direction: 'both',
                nodeTypes: [],
                timeRange: null,
                riskThreshold: null
            },
            isLoading: false,
            searchResults: [],
            investigations: [],
            targetAddress: TARGET_ADDRESS
        };
        
        // Initialize components
        this.initializeComponents();
        this.setupEventHandlers();
        this.loadInitialData();
        
        console.log('Polkadot Analysis Tool initialized');
    }
    
    /**
     * Initialize application components
     */
    initializeComponents() {
        // Initialize graph visualization
        this.graph = new PolkadotGraphVisualization('#network-graph', {
            width: 1200,
            height: 600,
            onNodeClick: (nodeData, event, selectedNodes) => this.handleNodeClick(nodeData, event, selectedNodes),
            onNodeDoubleClick: (nodeData, event) => this.handleNodeDoubleClick(nodeData, event),
            onEdgeClick: (edgeData, event) => this.handleEdgeClick(edgeData, event),
            onViewportChange: (transform, zoomLevel) => this.handleViewportChange(transform, zoomLevel),
            onDataUpdate: (data, metrics) => this.handleDataUpdate(data, metrics),
            onError: (error) => this.handleError(error)
        });
        
        // Initialize WebSocket for real-time updates
        this.initializeWebSocket();
        
        // Initialize search functionality
        this.initializeSearch();
        
        console.log('Application components initialized');
    }
    
    /**
     * Setup event handlers for UI elements
     */
    setupEventHandlers() {
        // Search functionality
        const searchBtn = document.getElementById('search-btn');
        const searchInput = document.getElementById('address-search');
        
        if (searchBtn) {
            searchBtn.addEventListener('click', () => this.performSearch());
        }
        
        if (searchInput) {
            searchInput.addEventListener('keypress', (event) => {
                if (event.key === 'Enter') {
                    this.performSearch();
                }
            });
            
            searchInput.addEventListener('input', (event) => {
                this.handleSearchInput(event);
            });
        }
        
        // Filter controls
        const applyFiltersBtn = document.getElementById('apply-filters');
        const resetFiltersBtn = document.getElementById('reset-filters');
        
        if (applyFiltersBtn) {
            applyFiltersBtn.addEventListener('click', () => this.applyFilters());
        }
        
        if (resetFiltersBtn) {
            resetFiltersBtn.addEventListener('click', () => this.resetFilters());
        }
        
        // Export functionality
        const exportCsvBtn = document.getElementById('export-csv');
        const exportJsonBtn = document.getElementById('export-json');
        const saveInvestigationBtn = document.getElementById('save-investigation');
        
        if (exportCsvBtn) {
            exportCsvBtn.addEventListener('click', () => this.exportData('csv'));
        }
        
        if (exportJsonBtn) {
            exportJsonBtn.addEventListener('click', () => this.exportData('json'));
        }
        
        if (saveInvestigationBtn) {
            saveInvestigationBtn.addEventListener('click', () => this.saveInvestigation());
        }
        
        // Filter input change handlers
        this.setupFilterChangeHandlers();
        
        console.log('Event handlers setup complete');
    }
    
    /**
     * Setup filter change handlers
     */
    setupFilterChangeHandlers() {
        const filterElements = [
            'depth-filter',
            'volume-filter',
            'time-filter',
            'connection-filter'
        ];
        
        filterElements.forEach(elementId => {
            const element = document.getElementById(elementId);
            if (element) {
                element.addEventListener('change', () => {
                    this.updateFiltersFromUI();
                });
            }
        });
    }
    
    /**
     * Initialize WebSocket connection for real-time updates
     */
    initializeWebSocket() {
        if (typeof io !== 'undefined') {
            this.socket = io();
            
            this.socket.on('connect', () => {
                console.log('WebSocket connected');
            });
            
            this.socket.on('graph-update', (data) => {
                this.handleRealtimeUpdate(data);
            });
            
            this.socket.on('new-transaction', (data) => {
                this.handleNewTransaction(data);
            });
            
            this.socket.on('disconnect', () => {
                console.log('WebSocket disconnected');
            });
        }
    }
    
    /**
     * Initialize search functionality
     */
    initializeSearch() {
        this.searchCache = new Map();
        this.searchDebounceTimer = null;
    }
    
    /**
     * Load initial application data
     */
    async loadInitialData() {
        try {
            // Load any saved investigations
            await this.loadSavedInvestigations();
            
            // Check for URL parameters for direct address loading
            const urlParams = new URLSearchParams(window.location.search);
            const address = urlParams.get('address') || this.state.targetAddress;
            
            if (address) {
                // Set search input to the target address
                const searchInput = document.getElementById('address-search');
                if (searchInput) {
                    searchInput.value = address;
                }
                
                // Load the target address graph automatically
                await this.loadAddressGraph(address);
            }
            
        } catch (error) {
            console.error('Error loading initial data:', error);
            this.showError('Failed to load initial data');
        }
    }
    
    /**
     * Perform address search
     */
    async performSearch() {
        const searchInput = document.getElementById('address-search');
        const query = searchInput?.value?.trim();
        
        if (!query) {
            this.showError('Please enter an address or identity to search');
            return;
        }
        
        this.showLoading();
        
        try {
            // Check if it's a valid Substrate address or search for identity
            if (this.isValidSubstrateAddress(query)) {
                await this.loadAddressGraph(query);
            } else {
                // Search for identity
                const searchResults = await this.searchIdentity(query);
                this.displaySearchResults(searchResults);
            }
            
        } catch (error) {
            console.error('Search error:', error);
            this.showError('Search failed. Please check the address format.');
        } finally {
            this.hideLoading();
        }
    }
    
    /**
     * Handle search input changes (for autocomplete)
     */
    handleSearchInput(event) {
        const query = event.target.value?.trim();
        
        if (query && query.length >= 3) {
            // Debounce search suggestions
            clearTimeout(this.searchDebounceTimer);
            this.searchDebounceTimer = setTimeout(() => {
                this.fetchSearchSuggestions(query);
            }, 300);
        } else {
            this.hideSearchResults();
        }
    }
    
    /**
     * Fetch search suggestions
     */
    async fetchSearchSuggestions(query) {
        try {
            const response = await fetch(`/api/addresses/search?q=${encodeURIComponent(query)}&limit=10`);
            
            if (response.ok) {
                const suggestions = await response.json();
                this.displaySearchSuggestions(suggestions);
            }
            
        } catch (error) {
            console.error('Error fetching search suggestions:', error);
        }
    }
    
    /**
     * Display search suggestions
     */
    displaySearchSuggestions(suggestions) {
        const resultsContainer = document.getElementById('search-results');
        if (!resultsContainer) return;
        
        resultsContainer.innerHTML = '';
        
        if (suggestions.length === 0) {
            resultsContainer.style.display = 'none';
            return;
        }
        
        suggestions.forEach(suggestion => {
            const item = document.createElement('div');
            item.className = 'search-result-item';
            
            const identity = suggestion.identity || 'Unknown';
            const address = suggestion.address;
            
            item.innerHTML = `
                <div class="search-result-identity">${identity}</div>
                <div class="search-result-address">${address}</div>
            `;
            
            item.addEventListener('click', () => {
                this.selectSearchResult(suggestion);
            });
            
            resultsContainer.appendChild(item);
        });
        
        resultsContainer.style.display = 'block';
    }
    
    /**
     * Select a search result
     */
    async selectSearchResult(result) {
        const searchInput = document.getElementById('address-search');
        if (searchInput) {
            searchInput.value = result.identity || result.address;
        }
        
        this.hideSearchResults();
        await this.loadAddressGraph(result.address);
    }
    
    /**
     * Hide search results
     */
    hideSearchResults() {
        const resultsContainer = document.getElementById('search-results');
        if (resultsContainer) {
            resultsContainer.style.display = 'none';
        }
    }
    
    /**
     * Load graph data for a specific address
     */
    async loadAddressGraph(address) {
        if (!this.isValidSubstrateAddress(address)) {
            this.showError('Invalid Substrate address format');
            return;
        }
        
        this.showLoading();
        this.state.currentAddress = address;
        
        try {
            // Build query parameters
            const params = new URLSearchParams({
                depth: this.state.filters.depth,
                maxNodes: this.state.filters.maxNodes,
                minVolume: this.state.filters.minVolume,
                minBalance: this.state.filters.minBalance,
                direction: this.state.filters.direction,
                layout: 'force'
            });
            
            if (this.state.filters.nodeTypes.length > 0) {
                this.state.filters.nodeTypes.forEach(type => {
                    params.append('nodeTypes', type);
                });
            }
            
            if (this.state.filters.riskThreshold !== null) {
                params.set('riskThreshold', this.state.filters.riskThreshold);
            }
            
            // Fetch graph data
            const response = await fetch(`/api/graph/${address}?${params}`);
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || 'Failed to load graph data');
            }
            
            const graphData = await response.json();
            
            // Map API response format to expected format (edges -> links)
            const mappedData = {
                nodes: graphData.nodes || [],
                links: graphData.edges || [], // Frontend expects 'links', API returns 'edges'
                metadata: graphData.metadata || {}
            };
            
            // Load the graph data into visualization
            this.graph.loadGraphData(mappedData);
            this.state.graphData = graphData;
            
            // Show visualization section
            this.showVisualizationSection();
            
            // Update address history
            this.updateAddressHistory(address);
            
            // Update URL without page reload
            const newUrl = new URL(window.location);
            newUrl.searchParams.set('address', address);
            window.history.replaceState(null, '', newUrl);
            
            console.log('Graph loaded successfully for address:', address);
            
        } catch (error) {
            console.error('Error loading graph:', error);
            this.showError(error.message || 'Failed to load graph data');
        } finally {
            this.hideLoading();
        }
    }
    
    /**
     * Apply current filters to the graph
     */
    applyFilters() {
        this.updateFiltersFromUI();
        
        if (this.state.currentAddress) {
            this.loadAddressGraph(this.state.currentAddress);
        } else if (this.state.graphData) {
            this.graph.setFilters(this.state.filters);
            this.updateStatistics();
        }
    }
    
    /**
     * Reset filters to default values
     */
    resetFilters() {
        this.state.filters = {
            depth: 2,
            maxNodes: 100,
            minVolume: '0',
            minBalance: '0',
            direction: 'both',
            nodeTypes: [],
            timeRange: null,
            riskThreshold: null
        };
        
        this.updateFilterUI();
        this.applyFilters();
    }
    
    /**
     * Update filters from UI elements
     */
    updateFiltersFromUI() {
        const depthFilter = document.getElementById('depth-filter');
        const volumeFilter = document.getElementById('volume-filter');
        const timeFilter = document.getElementById('time-filter');
        const connectionFilter = document.getElementById('connection-filter');
        
        if (depthFilter) {
            this.state.filters.depth = parseInt(depthFilter.value);
        }
        
        if (volumeFilter) {
            const volume = parseFloat(volumeFilter.value);
            this.state.filters.minVolume = volume > 0 ? 
                (BigInt(Math.floor(volume * 1e12)).toString()) : '0';
        }
        
        if (timeFilter) {
            this.state.filters.timeRange = this.parseTimeFilter(timeFilter.value);
        }
        
        if (connectionFilter) {
            this.state.filters.minConnections = parseInt(connectionFilter.value);
        }
    }
    
    /**
     * Update filter UI elements
     */
    updateFilterUI() {
        const depthFilter = document.getElementById('depth-filter');
        const volumeFilter = document.getElementById('volume-filter');
        const timeFilter = document.getElementById('time-filter');
        const connectionFilter = document.getElementById('connection-filter');
        
        if (depthFilter) {
            depthFilter.value = this.state.filters.depth;
        }
        
        if (volumeFilter) {
            const volume = this.state.filters.minVolume !== '0' ? 
                Number(BigInt(this.state.filters.minVolume)) / 1e12 : 0;
            volumeFilter.value = volume;
        }
        
        if (timeFilter) {
            timeFilter.value = 'all';
        }
        
        if (connectionFilter) {
            connectionFilter.value = this.state.filters.minConnections || 1;
        }
    }
    
    /**
     * Parse time filter value
     */
    parseTimeFilter(value) {
        const now = Math.floor(Date.now() / 1000);
        
        switch (value) {
            case '24h':
                return { start: now - 86400, end: now };
            case '7d':
                return { start: now - 604800, end: now };
            case '30d':
                return { start: now - 2592000, end: now };
            case '90d':
                return { start: now - 7776000, end: now };
            default:
                return null;
        }
    }
    
    /**
     * Handle node click events
     */
    handleNodeClick(nodeData, event, selectedNodes) {
        this.state.selectedNodes = selectedNodes;
        this.displayNodeDetails(nodeData);
        console.log('Node selected:', nodeData.address);
    }
    
    /**
     * Handle node double-click events
     */
    async handleNodeDoubleClick(nodeData, event) {
        console.log('Node double-clicked, expanding:', nodeData.address);
        
        // Expand the graph from this node
        try {
            await this.expandFromNode(nodeData.address);
        } catch (error) {
            console.error('Error expanding from node:', error);
            this.showError('Failed to expand graph from this node');
        }
    }
    
    /**
     * Handle edge click events
     */
    handleEdgeClick(edgeData, event) {
        console.log('Edge clicked:', edgeData);
        this.displayEdgeDetails(edgeData);
    }
    
    /**
     * Handle viewport changes
     */
    handleViewportChange(transform, zoomLevel) {
        // Update any UI elements that depend on zoom level
        console.log('Viewport changed, zoom level:', zoomLevel);
    }
    
    /**
     * Handle data updates
     */
    handleDataUpdate(data, metrics) {
        this.updateStatistics(metrics);
        console.log('Graph data updated:', metrics);
    }
    
    /**
     * Handle errors
     */
    handleError(error) {
        console.error('Graph error:', error);
        this.showError(error.message || 'An error occurred in the graph visualization');
    }
    
    /**
     * Expand graph from a specific node
     */
    async expandFromNode(address) {
        this.showLoading();
        
        try {
            const params = new URLSearchParams({
                cursor: this.state.graphData?.metadata?.nextCursor || '',
                limit: 20,
                direction: 'outward'
            });
            
            const response = await fetch(`/api/graph/expand?${params}`);
            
            if (!response.ok) {
                throw new Error('Failed to expand graph');
            }
            
            const expandedData = await response.json();
            
            // Merge new data with existing data
            if (expandedData.nodes && expandedData.nodes.length > 0) {
                this.state.graphData.nodes.push(...expandedData.nodes);
                this.state.graphData.links.push(...expandedData.edges);
                
                // Update metadata
                if (expandedData.metadata) {
                    this.state.graphData.metadata = {
                        ...this.state.graphData.metadata,
                        ...expandedData.metadata
                    };
                }
                
                // Reload the graph with updated data
                this.graph.loadGraphData(this.state.graphData);
            }
            
        } catch (error) {
            throw error;
        } finally {
            this.hideLoading();
        }
    }
    
    /**
     * Display node details in the side panel
     */
    displayNodeDetails(nodeData) {
        const nodeInfoContainer = document.getElementById('node-info');
        const nodeDetailsPanel = document.getElementById('node-details');
        
        if (!nodeInfoContainer || !nodeDetailsPanel) return;
        
        const identity = nodeData.identity?.display || 'Unknown';
        const address = nodeData.address;
        const nodeType = nodeData.nodeType || 'regular';
        const balance = nodeData.balance?.free ? 
            (Number(BigInt(nodeData.balance.free)) / 1e12).toLocaleString() + ' DOT' : 
            'Unknown';
        const connections = nodeData.degree || 0;
        const riskScore = nodeData.riskScore || 0;
        
        nodeInfoContainer.innerHTML = `
            <p><span class="label">Identity:</span> ${identity}</p>
            <p><span class="label">Address:</span> ${address.substring(0, 20)}...</p>
            <p><span class="label">Type:</span> ${nodeType}</p>
            <p><span class="label">Balance:</span> ${balance}</p>
            <p><span class="label">Connections:</span> ${connections}</p>
            <p><span class="label">Risk Score:</span> ${riskScore}/100</p>
            
            <div style="margin-top: 15px;">
                <button onclick="app.investigateNode('${address}')" class="btn-primary">
                    Investigate
                </button>
                <button onclick="app.expandFromNode('${address}')" class="btn-secondary">
                    Expand
                </button>
            </div>
        `;
        
        nodeDetailsPanel.style.display = 'block';
    }
    
    /**
     * Display edge details
     */
    displayEdgeDetails(edgeData) {
        const volume = edgeData.volume ? 
            (Number(BigInt(edgeData.volume)) / 1e12).toLocaleString() + ' DOT' : 
            'Unknown';
        const count = edgeData.count || 1;
        
        console.log('Edge details:', {
            from: edgeData.source.address || edgeData.source,
            to: edgeData.target.address || edgeData.target,
            volume,
            count,
            suspicious: edgeData.suspiciousPattern || false
        });
    }
    
    /**
     * Update statistics display
     */
    updateStatistics(metrics = null) {
        const stats = metrics || this.graph?.getStatistics() || {};
        
        const nodeCountEl = document.getElementById('node-count');
        const edgeCountEl = document.getElementById('edge-count');
        const totalVolumeEl = document.getElementById('total-volume');
        
        if (nodeCountEl) {
            nodeCountEl.textContent = stats.visibleNodes || 0;
        }
        
        if (edgeCountEl) {
            edgeCountEl.textContent = stats.visibleEdges || 0;
        }
        
        if (totalVolumeEl && this.state.graphData) {
            const totalVolume = this.calculateTotalVolume();
            totalVolumeEl.textContent = totalVolume.toLocaleString();
        }
    }
    
    /**
     * Calculate total volume in the current graph
     */
    calculateTotalVolume() {
        if (!this.state.graphData?.links) return 0;
        
        return this.state.graphData.links.reduce((total, link) => {
            const volume = link.volume ? Number(BigInt(link.volume)) / 1e12 : 0;
            return total + volume;
        }, 0);
    }
    
    /**
     * Show visualization section
     */
    showVisualizationSection() {
        const controlsSection = document.getElementById('controls-section');
        const visualizationSection = document.getElementById('visualization-section');
        
        if (controlsSection) {
            controlsSection.style.display = 'block';
        }
        
        if (visualizationSection) {
            visualizationSection.style.display = 'block';
        }
    }
    
    /**
     * Show loading indicator
     */
    showLoading() {
        this.state.isLoading = true;
        const loadingSection = document.getElementById('loading');
        if (loadingSection) {
            loadingSection.style.display = 'block';
        }
    }
    
    /**
     * Hide loading indicator
     */
    hideLoading() {
        this.state.isLoading = false;
        const loadingSection = document.getElementById('loading');
        if (loadingSection) {
            loadingSection.style.display = 'none';
        }
    }
    
    /**
     * Show error message
     */
    showError(message) {
        console.error('App error:', message);
        
        // Create or update error display
        let errorDiv = document.getElementById('error-display');
        if (!errorDiv) {
            errorDiv = document.createElement('div');
            errorDiv.id = 'error-display';
            errorDiv.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: #f44336;
                color: white;
                padding: 15px;
                border-radius: 4px;
                z-index: 1000;
                max-width: 300px;
            `;
            document.body.appendChild(errorDiv);
        }
        
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            if (errorDiv) {
                errorDiv.style.display = 'none';
            }
        }, 5000);
    }
    
    /**
     * Export graph data
     */
    exportData(format) {
        if (!this.graph) {
            this.showError('No graph data to export');
            return;
        }
        
        try {
            const data = this.graph.exportData(format);
            const filename = `polkadot-graph-${this.state.currentAddress || 'data'}.${format}`;
            
            this.downloadFile(data, filename, format === 'json' ? 'application/json' : 'text/csv');
            
        } catch (error) {
            console.error('Export error:', error);
            this.showError('Failed to export data');
        }
    }
    
    /**
     * Download file helper
     */
    downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.style.display = 'none';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        URL.revokeObjectURL(url);
    }
    
    /**
     * Save current investigation
     */
    async saveInvestigation() {
        if (!this.state.currentAddress || !this.state.graphData) {
            this.showError('No data to save');
            return;
        }
        
        const name = prompt('Enter investigation name:');
        if (!name) return;
        
        try {
            const investigation = {
                name,
                address: this.state.currentAddress,
                filters: { ...this.state.filters },
                selectedNodes: Array.from(this.state.selectedNodes),
                timestamp: Date.now()
            };
            
            const response = await fetch('/api/investigations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(investigation)
            });
            
            if (response.ok) {
                console.log('Investigation saved successfully');
                await this.loadSavedInvestigations();
            } else {
                throw new Error('Failed to save investigation');
            }
            
        } catch (error) {
            console.error('Save error:', error);
            this.showError('Failed to save investigation');
        }
    }
    
    /**
     * Load saved investigations
     */
    async loadSavedInvestigations() {
        try {
            const response = await fetch('/api/investigations');
            if (response.ok) {
                this.state.investigations = await response.json();
            }
        } catch (error) {
            console.error('Error loading investigations:', error);
        }
    }
    
    /**
     * Handle real-time updates from WebSocket
     */
    handleRealtimeUpdate(data) {
        console.log('Real-time update received:', data);
        
        if (data.type === 'new_transaction' && this.state.currentAddress) {
            // Check if the transaction involves the current address
            if (data.from === this.state.currentAddress || data.to === this.state.currentAddress) {
                // Optionally refresh the graph or show notification
                console.log('New transaction for current address');
            }
        }
    }
    
    /**
     * Handle new transaction events
     */
    handleNewTransaction(data) {
        console.log('New transaction:', data);
        // Could show a notification or update the graph in real-time
    }
    
    /**
     * Update address history
     */
    updateAddressHistory(address) {
        const history = JSON.parse(localStorage.getItem('addressHistory') || '[]');
        
        // Remove if already exists
        const filtered = history.filter(item => item.address !== address);
        
        // Add to beginning
        filtered.unshift({
            address,
            timestamp: Date.now(),
            identity: null // Could be populated from search results
        });
        
        // Keep only last 10
        const updated = filtered.slice(0, 10);
        
        localStorage.setItem('addressHistory', JSON.stringify(updated));
    }
    
    /**
     * Validate Substrate address format
     */
    isValidSubstrateAddress(address) {
        // Basic validation for SS58 format
        return /^[1-9A-HJ-NP-Za-km-z]{47,48}$/.test(address);
    }
    
    /**
     * Search for identity
     */
    async searchIdentity(query) {
        const response = await fetch(`/api/addresses/search?q=${encodeURIComponent(query)}`);
        
        if (!response.ok) {
            throw new Error('Search failed');
        }
        
        return await response.json();
    }
    
    /**
     * Display search results
     */
    displaySearchResults(results) {
        if (results.length === 1) {
            // Single result, load directly
            this.selectSearchResult(results[0]);
        } else if (results.length > 1) {
            // Multiple results, show selection
            this.displaySearchSuggestions(results);
        } else {
            this.showError('No results found');
        }
    }
    
    /**
     * Investigate a specific node
     */
    async investigateNode(address) {
        console.log('Investigating node:', address);
        
        try {
            // Load detailed information about the node
            const response = await fetch(`/api/graph/metrics/${address}`);
            
            if (response.ok) {
                const metrics = await response.json();
                console.log('Node metrics:', metrics);
                
                // Could open a detailed view or modal
                this.displayDetailedNodeInfo(metrics);
            }
            
        } catch (error) {
            console.error('Error investigating node:', error);
            this.showError('Failed to load node details');
        }
    }
    
    /**
     * Display detailed node information
     */
    displayDetailedNodeInfo(metrics) {
        console.log('Detailed node info:', metrics);
        // This could open a modal or dedicated panel with detailed analysis
    }
    
    /**
     * Get application state for debugging
     */
    getState() {
        return { ...this.state };
    }
    
    /**
     * Get graph statistics
     */
    getGraphStatistics() {
        return this.graph?.getStatistics() || {};
    }
}

// Initialize application when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing Polkadot Analysis Tool...');
    
    // Create global app instance
    window.app = new PolkadotAnalysisApp();
});

// Export for module usage if needed
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PolkadotAnalysisApp;
}