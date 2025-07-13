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
            targetAddress: TARGET_ADDRESS, // Target address for auto-loading
            currentAddress: null,
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
            investigations: []
        };
        
        // Initialize components
        console.log('Initializing application components...');
        this.initializeComponents();
        console.log('Setting up event handlers...');
        this.setupEventHandlers();
        console.log('Loading initial data...');
        this.loadInitialData();
        
        console.log('Polkadot Analysis Tool initialized successfully with loadAddressGraph method available:', typeof this.loadAddressGraph === 'function');
    }
    
    /**
     * Initialize application components
     */
    initializeComponents() {
        // Check if PolkadotGraphVisualization is available
        if (typeof PolkadotGraphVisualization === 'undefined') {
            console.error('PolkadotGraphVisualization class not found. Make sure graph.js is loaded before app.js');
            throw new Error('Graph visualization dependency not available');
        }
        
        // Initialize graph visualization
        try {
            // First verify the container exists before attempting initialization
            const graphContainer = document.querySelector('#network-graph');
            if (!graphContainer) {
                throw new Error('Graph container #network-graph not found in DOM. Please check HTML structure.');
            }
            
            // Ensure the visualization section is visible
            const visualizationSection = document.getElementById('visualization-section');
            if (visualizationSection && visualizationSection.style.display === 'none') {
                console.log('Making visualization section visible');
                visualizationSection.style.display = 'block';
            }
            
            // Get the parent container dimensions
            const graphContainerParent = document.getElementById('graph-container');
            if (graphContainerParent) {
                const parentRect = graphContainerParent.getBoundingClientRect();
                console.log('Graph container parent dimensions:', parentRect);
                
                // If parent has no dimensions, set explicit ones
                if (parentRect.width === 0 || parentRect.height === 0) {
                    graphContainerParent.style.width = '100%';
                    graphContainerParent.style.height = '600px';
                    graphContainerParent.style.minHeight = '600px';
                }
            }
            
            // Check if SVG container has dimensions
            const containerRect = graphContainer.getBoundingClientRect();
            if (containerRect.width === 0 || containerRect.height === 0) {
                console.warn('Graph container has zero dimensions. Setting default dimensions.');
                // Set explicit dimensions on the SVG
                graphContainer.setAttribute('width', '1200');
                graphContainer.setAttribute('height', '600');
                graphContainer.setAttribute('viewBox', '0 0 1200 600');
                graphContainer.style.width = '100%';
                graphContainer.style.height = '100%';
            }
            
            console.log('Initializing graph with container:', graphContainer);
            
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
            console.log('Graph visualization initialized successfully');
        } catch (error) {
            console.error('Failed to initialize graph visualization:', error);
            this.handleError(error);
            
            // Create a placeholder graph object to prevent further errors
            this.graph = {
                updateData: () => console.warn('Graph not initialized - using placeholder'),
                clear: () => console.warn('Graph not initialized - using placeholder'),
                destroy: () => console.warn('Graph not initialized - using placeholder'),
                resize: () => console.warn('Graph not initialized - using placeholder')
            };
            
            // Don't throw - allow app to continue with degraded functionality
            console.log('Continuing with placeholder graph object');
        }
        
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
            const wsUrl = window.APP_CONFIG?.WS_URL || '';
            this.socket = io(wsUrl);
            
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
        console.log('Starting loadInitialData...');
        try {
            // Load any saved investigations
            console.log('Loading saved investigations...');
            await this.loadSavedInvestigations();
            
            // Check for URL parameters for direct address loading
            const urlParams = new URLSearchParams(window.location.search);
            const addressFromUrl = urlParams.get('address');
            const targetAddress = this.state.targetAddress;
            console.log('URL address:', addressFromUrl, 'Target address:', targetAddress);
            
            const address = addressFromUrl || targetAddress;
            console.log('Address to load:', address);
            
            if (address) {
                // Set search input to the target address
                const searchInput = document.getElementById('address-search');
                if (searchInput) {
                    searchInput.value = address;
                    console.log('Set search input value to:', address);
                } else {
                    console.log('Search input element not found');
                }
                
                // Don't load directly - let it complete initialization first
                // The search component will trigger the load via performMainSearch
                console.log('Address set in search box, waiting for user action or auto-trigger');
            } else {
                console.log('No address to load');
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
            const apiUrl = window.APP_CONFIG?.API_BASE_URL || '';
            const response = await fetch(`${apiUrl}/api/addresses/search?q=${encodeURIComponent(query)}&limit=10`);
            
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
        console.log('loadAddressGraph called with address:', address);
        
        if (!this.isValidSubstrateAddress(address)) {
            console.error('Invalid Substrate address format:', address);
            this.showError('Invalid Substrate address format');
            return;
        }
        console.log('Address validation passed');
        
        console.log('Calling showLoading...');
        this.showLoading();
        this.state.currentAddress = address;
        
        console.log('Building query parameters...');
        try {
            // Build query parameters
            console.log('Current filters:', JSON.stringify(this.state.filters));
            const params = new URLSearchParams({
                depth: this.state.filters.depth,
                maxNodes: this.state.filters.maxNodes,
                minVolume: this.state.filters.minVolume,
                minBalance: this.state.filters.minBalance,
                direction: this.state.filters.direction,
                layout: 'force'
            });
            console.log('URLSearchParams created successfully');
            
            if (this.state.filters.nodeTypes.length > 0) {
                this.state.filters.nodeTypes.forEach(type => {
                    params.append('nodeTypes', type);
                });
            }
            
            if (this.state.filters.riskThreshold !== null) {
                params.set('riskThreshold', this.state.filters.riskThreshold);
            }
            
            console.log('Query parameters built:', params.toString());
            
            // Fetch graph data
            const apiUrl = window.APP_CONFIG?.API_BASE_URL || '';
            const fetchUrl = `${apiUrl}/api/graph/${address}?${params}`;
            console.log('Fetching graph data from:', fetchUrl);
            
            const response = await fetch(fetchUrl);
            console.log('Fetch response received:', response.status);
            
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
            
            // Apply current filters BEFORE loading data to ensure they're available during rendering
            this.graph.setFilters(this.state.filters);
            
            // Load the graph data into visualization
            this.graph.loadGraphData(mappedData);
            this.state.graphData = mappedData; // Store the mapped data, not the raw response
            
            // Show visualization section
            this.showVisualizationSection();
            
            // Update statistics
            this.updateStatistics();
            
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
        console.log('Applying filters:', this.state.filters);
        
        if (this.state.currentAddress) {
            // Don't reload the entire graph, just update filters on existing graph
            if (this.state.graphData) {
                console.log('Updating filters on existing graph data');
                this.graph.setFilters(this.state.filters);
                this.updateStatistics();
            } else {
                this.loadAddressGraph(this.state.currentAddress);
            }
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
            riskThreshold: null,
            volumeThreshold: null
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
        const volumeThresholdFilter = document.getElementById('volume-threshold-filter');
        
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
        
        // Volume threshold for red highlighting
        if (volumeThresholdFilter) {
            const threshold = parseFloat(volumeThresholdFilter.value);
            console.log('Volume threshold input value:', volumeThresholdFilter.value, 'parsed as:', threshold);
            
            if (threshold > 0) {
                this.state.filters.volumeThreshold = (BigInt(Math.floor(threshold * 1e12)).toString());
                console.log(`Volume threshold set to ${threshold} DOT (${this.state.filters.volumeThreshold} plancks)`);
            } else {
                this.state.filters.volumeThreshold = null;
                console.log('Volume threshold cleared');
            }
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
        const volumeThresholdFilter = document.getElementById('volume-threshold-filter');
        
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
        
        if (volumeThresholdFilter) {
            const threshold = this.state.filters.volumeThreshold ? 
                Number(BigInt(this.state.filters.volumeThreshold)) / 1e12 : '';
            volumeThresholdFilter.value = threshold;
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
            const expandAddress = address || this.state.currentAddress;
            if (!expandAddress) {
                throw new Error('No address specified for expansion');
            }
            
            // Use the regular graph endpoint to get data for this node
            const params = new URLSearchParams({
                depth: 1,
                minVolume: this.state.filters.minVolume || 0
            });
            
            const apiUrl = window.APP_CONFIG?.API_BASE_URL || '';
            const response = await fetch(`${apiUrl}/api/graph/${expandAddress}?${params}`);
            
            if (!response.ok) {
                throw new Error('Failed to expand graph');
            }
            
            const expandedData = await response.json();
            
            // Merge new data with existing data
            if (expandedData.nodes && expandedData.nodes.length > 0) {
                // Initialize graphData if it doesn't exist
                if (!this.state.graphData) {
                    this.state.graphData = {
                        nodes: [],
                        links: [],
                        metadata: {}
                    };
                }
                
                // Ensure arrays exist
                if (!this.state.graphData.nodes) this.state.graphData.nodes = [];
                if (!this.state.graphData.links) this.state.graphData.links = [];
                
                // Create maps for better lookup and update
                const existingNodesMap = new Map(
                    this.state.graphData.nodes.map(n => [n.id || n.address, n])
                );
                const existingEdgeIds = new Set(
                    this.state.graphData.links.map(e => {
                        const sourceId = e.source.id || e.source.address || e.source;
                        const targetId = e.target.id || e.target.address || e.target;
                        return `${sourceId}-${targetId}`;
                    })
                );
                
                // Process new nodes
                expandedData.nodes.forEach(node => {
                    const nodeId = node.id || node.address;
                    if (existingNodesMap.has(nodeId)) {
                        // Update existing node with new data (e.g., balance, identity)
                        const existingNode = existingNodesMap.get(nodeId);
                        if (node.balance && (!existingNode.balance || existingNode.balance.free === '0')) {
                            existingNode.balance = node.balance;
                        }
                        if (node.identity && !existingNode.identity) {
                            existingNode.identity = node.identity;
                        }
                        if (node.degree !== undefined) {
                            existingNode.degree = node.degree;
                        }
                        if (node.totalVolume !== undefined) {
                            existingNode.totalVolume = node.totalVolume;
                        }
                    } else {
                        // Add new node with highlight
                        node.isNew = true;
                        node.suggestedColor = '#4CAF50'; // Green for new nodes
                        this.state.graphData.nodes.push(node);
                    }
                });
                
                // Add new edges that don't already exist
                const newEdges = (expandedData.edges || expandedData.links || []).filter(edge => {
                    const sourceId = edge.source.id || edge.source.address || edge.source;
                    const targetId = edge.target.id || edge.target.address || edge.target;
                    const edgeId = `${sourceId}-${targetId}`;
                    return !existingEdgeIds.has(edgeId);
                });
                
                // Mark new edges for visual feedback
                newEdges.forEach(edge => {
                    edge.isNew = true;
                    edge.suggestedColor = '#4CAF50'; // Green for new edges
                });
                
                this.state.graphData.links.push(...newEdges);
                
                // Update metadata
                if (expandedData.metadata) {
                    this.state.graphData.metadata = {
                        ...this.state.graphData.metadata,
                        ...expandedData.metadata
                    };
                }
                
                // Apply current filters before reloading to ensure consistent highlighting
                this.graph.setFilters(this.state.filters);
                
                // Reload the graph with updated data
                this.graph.loadGraphData(this.state.graphData);
                
                // Focus on the expanded node after a short delay
                setTimeout(() => {
                    const node = this.state.graphData.nodes.find(n => 
                        (n.id || n.address) === expandAddress
                    );
                    if (node) {
                        this.graph.focusOnNode(node);
                    }
                }, 500);
                
                // Remove highlights after animation
                setTimeout(() => {
                    this.state.graphData.nodes.forEach(n => {
                        if (n.isNew) {
                            delete n.isNew;
                            delete n.suggestedColor;
                        }
                    });
                    this.state.graphData.links.forEach(e => {
                        if (e.isNew) {
                            delete e.isNew;
                            delete e.suggestedColor;
                        }
                    });
                    this.graph.updateNodeAppearance();
                    this.graph.updateEdgeAppearance();
                }, 3000);
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
        
        // Debug logging
        console.log('[DEBUG] Node data:', nodeData);
        console.log('[DEBUG] Identity object:', nodeData.identity);
        console.log('[DEBUG] Identity type:', typeof nodeData.identity);
        console.log('[DEBUG] Identity.display:', nodeData.identity?.display);
        console.log('[DEBUG] Identity.display type:', typeof nodeData.identity?.display);
        
        // Fix for identity structure - handle all cases
        let identity = 'Unknown';
        
        // If identity is a string, use it directly
        if (typeof nodeData.identity === 'string' && nodeData.identity.trim() !== '') {
            identity = nodeData.identity;
        }
        // If identity.display is a string, use it
        else if (typeof nodeData.identity?.display === 'string' && nodeData.identity.display.trim() !== '') {
            identity = nodeData.identity.display;
        }
        // Check for nested display.display structure (Subscan format)
        else if (nodeData.identity?.display?.display !== undefined) {
            // If it's a non-empty string
            if (typeof nodeData.identity.display.display === 'string' && nodeData.identity.display.display.trim() !== '') {
                identity = nodeData.identity.display.display;
            }
            // If it's explicitly null or empty, this address has no identity
            else if (nodeData.identity.display.display === null || nodeData.identity.display.display === '') {
                identity = 'Unknown';
            }
        }
        // If identity is an object, try to extract a meaningful value
        else if (nodeData.identity && typeof nodeData.identity === 'object') {
            // Try to find any non-empty string value in the identity object
            const findString = (obj, depth = 0) => {
                if (depth > 3) return null; // Prevent infinite recursion
                for (const key in obj) {
                    if (key === 'isConfirmed' || key === 'isInvalid' || key === 'verified') continue; // Skip boolean flags
                    if (typeof obj[key] === 'string' && obj[key].trim() !== '') {
                        return obj[key];
                    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                        const result = findString(obj[key], depth + 1);
                        if (result) return result;
                    }
                }
                return null;
            };
            const foundString = findString(nodeData.identity);
            if (foundString) {
                identity = foundString;
            }
        }
        const address = nodeData.address;
        const nodeType = nodeData.nodeType || 'regular';
        
        // Fix for balance format detection (might be in DOT or planck)
        let balance = 'Unknown';
        if (nodeData.balance?.free) {
            const balanceNum = Number(nodeData.balance.free);
            // If balance is greater than 1e10, it's likely in planck units
            if (balanceNum > 1e10) {
                balance = (balanceNum / 1e12).toLocaleString() + ' DOT';
            } else {
                // Already in DOT format
                balance = balanceNum.toLocaleString() + ' DOT';
            }
        }
        
        const connections = nodeData.degree || 0;
        // Risk scoring not implemented yet
        
        // Final identity display - show "No identity" if we still have Unknown
        const displayIdentity = identity === 'Unknown' ? 'No identity' : identity;
        
        nodeInfoContainer.innerHTML = `
            <p><span class="label">Identity:</span> ${displayIdentity}</p>
            <p><span class="label">Address:</span> 
                <span style="font-size: 11px; word-break: break-all;">${address}</span>
            </p>
            <p><span class="label">Type:</span> ${nodeType}</p>
            <p><span class="label">Balance:</span> ${balance}</p>
            <p><span class="label">Connections:</span> ${connections}</p>
            
            <div style="margin-top: 15px;">
                <button class="btn-primary investigate-node-btn" data-address="${address}">
                    Investigate
                </button>
                <button class="btn-secondary expand-node-btn" data-address="${address}">
                    Expand
                </button>
            </div>
        `;
        
        // Add event listeners for the buttons
        const investigateBtn = nodeInfoContainer.querySelector('.investigate-node-btn');
        const expandBtn = nodeInfoContainer.querySelector('.expand-node-btn');
        
        if (investigateBtn) {
            investigateBtn.addEventListener('click', () => {
                this.investigateNode(address);
            });
        }
        
        if (expandBtn) {
            expandBtn.addEventListener('click', () => {
                this.expandFromNode(address);
            });
        }
        
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
            // Use graph data if available
            const nodeCount = this.state.graphData?.nodes?.length || stats.visibleNodes || 0;
            nodeCountEl.textContent = nodeCount;
        }
        
        if (edgeCountEl) {
            // Use graph data if available (edges or links)
            const edgeCount = this.state.graphData?.edges?.length || this.state.graphData?.links?.length || stats.visibleEdges || 0;
            edgeCountEl.textContent = edgeCount;
        }
        
        if (totalVolumeEl && this.state.graphData) {
            const totalVolume = this.calculateTotalVolume();
            totalVolumeEl.textContent = totalVolume.toFixed(2);
        }
        
        // Update volume range information to help users understand actual data ranges
        this.updateVolumeRangeInfo();
    }
    
    /**
     * Calculate total volume in the current graph
     */
    calculateTotalVolume() {
        // Check for both links and edges format
        const edges = this.state.graphData?.links || this.state.graphData?.edges || [];
        if (!edges || edges.length === 0) return 0;
        
        return edges.reduce((total, edge) => {
            try {
                if (edge.volume) {
                    // Handle decimal values
                    let volumeStr = edge.volume.toString();
                    if (volumeStr.includes('.')) {
                        volumeStr = volumeStr.split('.')[0];
                    }
                    const volume = Number(BigInt(volumeStr)) / 1e12;
                    return total + volume;
                }
            } catch (e) {
                console.warn('Error calculating volume:', e);
            }
            return total;
        }, 0);
    }
    
    /**
     * Update volume range information to help users understand actual data ranges
     */
    updateVolumeRangeInfo() {
        // Check for both links and edges format
        const edges = this.state.graphData?.links || this.state.graphData?.edges || [];
        if (!edges || edges.length === 0) {
            return;
        }
        
        let minVolume = Infinity;
        let maxVolume = 0;
        let validVolumeCount = 0;
        
        edges.forEach(edge => {
            try {
                if (edge.volume) {
                    // Handle decimal values
                    let volumeStr = edge.volume.toString();
                    if (volumeStr.includes('.')) {
                        volumeStr = volumeStr.split('.')[0];
                    }
                    const volume = Number(BigInt(volumeStr)) / 1e12; // Convert to DOT
                    
                    if (volume > 0) {
                        minVolume = Math.min(minVolume, volume);
                        maxVolume = Math.max(maxVolume, volume);
                        validVolumeCount++;
                    }
                }
            } catch (e) {
                console.warn('Error processing volume:', e);
            }
        });
        
        // Add or update volume range display in the stats panel
        let volumeRangeEl = document.getElementById('volume-range-info');
        if (!volumeRangeEl) {
            const statsPanel = document.querySelector('#graph-stats');
            if (statsPanel) {
                volumeRangeEl = document.createElement('div');
                volumeRangeEl.id = 'volume-range-info';
                volumeRangeEl.className = 'stat-item';
                volumeRangeEl.innerHTML = `
                    <span class="stat-label">Volume Range:</span>
                    <span class="stat-value" id="volume-range-value">-</span>
                `;
                statsPanel.appendChild(volumeRangeEl);
            }
        }
        
        if (volumeRangeEl && validVolumeCount > 0) {
            const valueEl = document.getElementById('volume-range-value');
            if (valueEl) {
                if (minVolume === Infinity) minVolume = 0;
                const rangeText = minVolume === maxVolume 
                    ? `${maxVolume.toFixed(2)} DOT`
                    : `${minVolume.toFixed(2)} - ${maxVolume.toFixed(2)} DOT`;
                valueEl.textContent = rangeText;
                valueEl.title = `Min: ${minVolume.toFixed(2)} DOT, Max: ${maxVolume.toFixed(2)} DOT (${validVolumeCount} connections)`;
            }
        }
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
            
            const apiUrl = window.APP_CONFIG?.API_BASE_URL || '';
            const response = await fetch(`${apiUrl}/api/investigations`, {
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
        console.log('loadSavedInvestigations called');
        try {
            // Skip loading investigations for now since the endpoint doesn't exist
            console.log('Skipping investigations load - endpoint not implemented yet');
            this.state.investigations = [];
            
            /* TODO: Implement when investigations endpoint is ready
            const apiUrl = window.APP_CONFIG?.API_BASE_URL || '';
            const url = `${apiUrl}/api/investigations`;
            console.log('Fetching investigations from:', url);
            const response = await fetch(url, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });
            console.log('Investigations response:', response.status);
            if (response.ok) {
                this.state.investigations = await response.json();
                console.log('Investigations loaded:', this.state.investigations);
            }
            */
        } catch (error) {
            console.error('Error loading investigations:', error);
        }
        console.log('loadSavedInvestigations completed');
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
        // Use the proper address validator if available
        if (typeof polkadotAddressValidator !== 'undefined') {
            return polkadotAddressValidator.isValidFormat(address);
        }
        // Fallback to basic validation for SS58 format (47-50 characters)
        return /^[1-9A-HJ-NP-Za-km-z]{47,50}$/.test(address);
    }
    
    /**
     * Search for identity
     */
    async searchIdentity(query) {
        const apiUrl = window.APP_CONFIG?.API_BASE_URL || '';
        const response = await fetch(`${apiUrl}/api/addresses/search?q=${encodeURIComponent(query)}`);
        
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
            const apiUrl = window.APP_CONFIG?.API_BASE_URL || '';
            const response = await fetch(`${apiUrl}/api/nodes/${address}`);
            
            if (response.ok) {
                const nodeDetails = await response.json();
                console.log('Node details:', nodeDetails);
                
                // Display the investigation results in a modal or panel
                this.displayInvestigationResults(nodeDetails);
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
    
    /**
     * Display investigation results for a node
     */
    displayInvestigationResults(nodeDetails) {
        // Create a modal or update the side panel with detailed information
        const modalContent = `
            <div class="investigation-results">
                <h3>Investigation: ${nodeDetails.address.substring(0, 8)}...${nodeDetails.address.slice(-6)}</h3>
                
                <div class="detail-section">
                    <h4>Basic Information</h4>
                    <p><strong>Type:</strong> ${nodeDetails.nodeType}</p>
                    <p><strong>Balance:</strong> ${FormatUtils.formatBalance(nodeDetails.balance)}</p>
                    ${nodeDetails.identity ? `<p><strong>Identity:</strong> ${nodeDetails.identity.display || 'None'}</p>` : ''}
                </div>
                
                <div class="detail-section">
                    <h4>Activity Summary</h4>
                    <p><strong>First Seen:</strong> ${new Date(nodeDetails.firstSeen).toLocaleDateString()}</p>
                    <p><strong>Last Active:</strong> ${new Date(nodeDetails.lastActive).toLocaleDateString()}</p>
                    <p><strong>Total Connections:</strong> ${nodeDetails.degree}</p>
                </div>
                
                <div class="detail-section">
                    <h4>Transaction Volume</h4>
                    <p><strong>Incoming:</strong> ${FormatUtils.formatBalance(nodeDetails.totalIncoming)} (${nodeDetails.incomingCount} transfers)</p>
                    <p><strong>Outgoing:</strong> ${FormatUtils.formatBalance(nodeDetails.totalOutgoing)} (${nodeDetails.outgoingCount} transfers)</p>
                </div>
                
                ${nodeDetails.tags && nodeDetails.tags.length > 0 ? `
                <div class="detail-section">
                    <h4>Tags</h4>
                    <div class="tags">
                        ${nodeDetails.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
                    </div>
                </div>
                ` : ''}
            </div>
        `;
        
        // Show in a modal or update the side panel
        this.showModal('Node Investigation', modalContent);
    }
    
    /**
     * Show a modal with content
     */
    showModal(title, content) {
        // Create modal overlay
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal">
                <div class="modal-header">
                    <h2>${title}</h2>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-content">
                    ${content}
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);
        
        // Add close functionality
        overlay.querySelector('.modal-close').addEventListener('click', () => {
            overlay.remove();
        });
        
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
            }
        });
    }
}

// Initialize application when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing Polkadot Analysis Tool...');
    
    try {
        // Check dependencies
        if (typeof d3 === 'undefined') {
            throw new Error('D3.js not loaded. Make sure D3.js script is included.');
        }
        
        if (typeof PolkadotGraphVisualization === 'undefined') {
            throw new Error('PolkadotGraphVisualization not loaded. Make sure graph.js is included before app.js.');
        }
        
        // Create global app instance
        window.app = new PolkadotAnalysisApp();
        
        // Ensure the app is properly exposed for integration
        console.log('Main app system initialized and available');
        
        // Dispatch custom event to notify other components that app is ready
        document.dispatchEvent(new CustomEvent('polkadotAppReady', { 
            detail: { app: window.app } 
        }));
        
        console.log('App ready event dispatched');
        
    } catch (error) {
        console.error('Failed to initialize Polkadot Analysis Tool:', error);
        
        // Show error message to user
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #f44336;
            color: white;
            padding: 15px;
            border-radius: 4px;
            z-index: 10000;
            max-width: 400px;
            font-family: Arial, sans-serif;
        `;
        errorDiv.textContent = `Initialization Error: ${error.message}`;
        document.body.appendChild(errorDiv);
        
        // Try to hide loading indicator if it exists
        const loadingSection = document.getElementById('loading');
        if (loadingSection) {
            loadingSection.style.display = 'none';
        }
    }
});

// Export for module usage if needed
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PolkadotAnalysisApp;
}