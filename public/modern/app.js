// Modern ES6 Module-based Frontend for Polkadot Analysis Tool
// This is a more advanced version with better performance and features

// API Service Class
export class PolkadotAPI {
    constructor(baseURL = '/api') {
        this.baseURL = baseURL;
        this.cache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    }

    async request(endpoint, options = {}) {
        const cacheKey = `${endpoint}-${JSON.stringify(options.params || {})}`;
        const cached = this.cache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.data;
        }

        try {
            const response = await fetch(`${this.baseURL}${endpoint}`, {
                ...options,
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                }
            });

            if (!response.ok) {
                throw new Error(`API error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            this.cache.set(cacheKey, { data, timestamp: Date.now() });
            return data;
        } catch (error) {
            console.error('API request failed:', error);
            throw error;
        }
    }

    async searchAddresses(query, limit = 10) {
        const params = new URLSearchParams({ q: query, limit });
        return this.request(`/addresses/search?${params}`);
    }

    async getGraph(address, filters = {}) {
        const params = new URLSearchParams({
            depth: filters.depth || 2,
            minVolume: filters.minVolume || '0',
            direction: filters.direction || 'both',
            maxNodes: filters.maxNodes || 100,
            includeRiskScores: filters.includeRiskScores || false
        });
        return this.request(`/graph/${address}?${params}`);
    }

    async getAddressDetails(address) {
        return this.request(`/addresses/${address}`);
    }

    async getRelationshipScore(from, to) {
        return this.request(`/relationships/${from}/${to}/score`);
    }

    async detectPatterns(address, options = {}) {
        const params = new URLSearchParams({
            depth: options.depth || 2,
            timeWindow: options.timeWindow || 86400,
            sensitivity: options.sensitivity || 'medium'
        });
        return this.request(`/graph/patterns/${address}?${params}`);
    }

    clearCache() {
        this.cache.clear();
    }
}

// State Management Store
export class Store {
    constructor(initialState = {}) {
        this.state = initialState;
        this.listeners = new Set();
    }

    getState() {
        return this.state;
    }

    setState(updates) {
        this.state = { ...this.state, ...updates };
        this.notify();
    }

    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    notify() {
        this.listeners.forEach(listener => listener(this.state));
    }
}

// WebSocket Manager
export class WebSocketManager {
    constructor(url = window.location.origin) {
        this.socket = null;
        this.url = url;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        this.handlers = new Map();
        this.connect();
    }

    connect() {
        if (typeof io === 'undefined') {
            console.error('Socket.IO not loaded');
            return;
        }

        this.socket = io(this.url);

        this.socket.on('connect', () => {
            console.log('WebSocket connected');
            this.reconnectAttempts = 0;
            this.emit('connection:status', { connected: true });
        });

        this.socket.on('disconnect', () => {
            console.log('WebSocket disconnected');
            this.emit('connection:status', { connected: false });
            this.attemptReconnect();
        });

        this.socket.on('error', (error) => {
            console.error('WebSocket error:', error);
        });

        // Set up default handlers
        this.setupDefaultHandlers();
    }

    setupDefaultHandlers() {
        this.on('graph:update', (data) => {
            console.log('Graph update received:', data);
        });

        this.on('pattern:alert', (data) => {
            console.log('Pattern alert:', data);
        });

        this.on('risk:alert', (data) => {
            console.log('Risk alert:', data);
        });
    }

    attemptReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            setTimeout(() => {
                console.log(`Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
                this.connect();
            }, this.reconnectDelay * this.reconnectAttempts);
        }
    }

    on(event, handler) {
        if (!this.handlers.has(event)) {
            this.handlers.set(event, new Set());
        }
        this.handlers.get(event).add(handler);

        if (this.socket) {
            this.socket.on(event, handler);
        }

        return () => {
            this.handlers.get(event)?.delete(handler);
            if (this.socket) {
                this.socket.off(event, handler);
            }
        };
    }

    emit(event, data) {
        this.handlers.get(event)?.forEach(handler => handler(data));
        
        if (this.socket && this.socket.connected) {
            this.socket.emit(event, data);
        }
    }

    subscribe(address, filters = {}) {
        this.emit('subscribe:address', { address, filters });
    }

    unsubscribe(address) {
        this.emit('unsubscribe:address', { address });
    }
}

// Graph Renderer with Advanced Features
export class GraphRenderer {
    constructor(container, options = {}) {
        this.container = container;
        this.width = options.width || container.clientWidth;
        this.height = options.height || container.clientHeight;
        this.simulation = null;
        this.svg = null;
        this.g = null;
        this.zoom = null;
        this.nodes = [];
        this.links = [];
        this.selectedNode = null;
        this.options = {
            nodeRadius: 20,
            linkDistance: 100,
            chargeStrength: -300,
            collisionRadius: 30,
            ...options
        };
    }

    init() {
        // Clear existing content
        d3.select(this.container).selectAll('*').remove();

        // Create SVG
        this.svg = d3.select(this.container)
            .append('svg')
            .attr('width', this.width)
            .attr('height', this.height);

        // Create container group
        this.g = this.svg.append('g');

        // Set up zoom
        this.zoom = d3.zoom()
            .scaleExtent([0.1, 10])
            .on('zoom', (event) => {
                this.g.attr('transform', event.transform);
            });

        this.svg.call(this.zoom);

        // Create arrow markers
        this.createArrowMarkers();

        // Initialize force simulation
        this.simulation = d3.forceSimulation()
            .force('link', d3.forceLink().id(d => d.id || d.address).distance(this.options.linkDistance))
            .force('charge', d3.forceManyBody().strength(this.options.chargeStrength))
            .force('center', d3.forceCenter(this.width / 2, this.height / 2))
            .force('collision', d3.forceCollide().radius(this.options.collisionRadius));

        return this;
    }

    createArrowMarkers() {
        const defs = this.svg.append('defs');

        ['outgoing', 'incoming', 'bidirectional'].forEach(type => {
            defs.append('marker')
                .attr('id', `arrow-${type}`)
                .attr('viewBox', '0 -5 10 10')
                .attr('refX', 25)
                .attr('refY', 0)
                .attr('markerWidth', 8)
                .attr('markerHeight', 8)
                .attr('orient', 'auto')
                .append('path')
                .attr('d', 'M0,-5L10,0L0,5')
                .attr('fill', type === 'outgoing' ? '#ff9800' : 
                             type === 'incoming' ? '#4caf50' : '#2196f3');
        });
    }

    updateGraph(graphData) {
        if (!graphData) return;

        this.nodes = graphData.nodes || [];
        this.links = graphData.edges || [];

        // Update simulation
        this.simulation.nodes(this.nodes);
        this.simulation.force('link').links(this.links);

        // Render
        this.renderLinks();
        this.renderNodes();
        this.renderLabels();

        // Update simulation
        this.simulation.on('tick', () => this.tick());
        this.simulation.alpha(1).restart();

        // Auto-fit
        setTimeout(() => this.fitToScreen(), 1000);
    }

    renderLinks() {
        const linkGroup = this.g.selectAll('.links').data([0]);
        linkGroup.enter().append('g').attr('class', 'links');

        const links = this.g.select('.links')
            .selectAll('.link')
            .data(this.links, d => `${d.source.id || d.source.address}-${d.target.id || d.target.address}`);

        links.exit().remove();

        const linkEnter = links.enter()
            .append('line')
            .attr('class', 'link');

        links.merge(linkEnter)
            .attr('stroke', d => this.getLinkColor(d))
            .attr('stroke-width', d => Math.sqrt(d.suggestedWidth || 2))
            .attr('stroke-opacity', 0.6)
            .attr('marker-end', d => `url(#arrow-${d.direction || 'bidirectional'})`)
            .on('mouseover', (event, d) => this.onLinkHover(event, d))
            .on('mouseout', () => this.hideTooltip());
    }

    renderNodes() {
        const nodeGroup = this.g.selectAll('.nodes').data([0]);
        nodeGroup.enter().append('g').attr('class', 'nodes');

        const nodes = this.g.select('.nodes')
            .selectAll('.node')
            .data(this.nodes, d => d.id || d.address);

        nodes.exit().remove();

        const nodeEnter = nodes.enter()
            .append('circle')
            .attr('class', 'node')
            .call(this.drag());

        nodes.merge(nodeEnter)
            .attr('r', d => d.suggestedSize || this.options.nodeRadius)
            .attr('fill', d => this.getNodeColor(d))
            .attr('stroke', d => d === this.selectedNode ? '#fff' : 'none')
            .attr('stroke-width', 3)
            .on('click', (event, d) => this.onNodeClick(event, d))
            .on('dblclick', (event, d) => this.onNodeDoubleClick(event, d))
            .on('mouseover', (event, d) => this.onNodeHover(event, d))
            .on('mouseout', () => this.hideTooltip());
    }

    renderLabels() {
        const labelGroup = this.g.selectAll('.labels').data([0]);
        labelGroup.enter().append('g').attr('class', 'labels');

        const labels = this.g.select('.labels')
            .selectAll('.label')
            .data(this.nodes, d => d.id || d.address);

        labels.exit().remove();

        const labelEnter = labels.enter()
            .append('text')
            .attr('class', 'label');

        labels.merge(labelEnter)
            .text(d => this.getNodeLabel(d))
            .attr('font-size', '10px')
            .attr('fill', '#ffffff')
            .attr('text-anchor', 'middle')
            .attr('dy', -25)
            .style('pointer-events', 'none');
    }

    tick() {
        this.g.selectAll('.link')
            .attr('x1', d => d.source.x)
            .attr('y1', d => d.source.y)
            .attr('x2', d => d.target.x)
            .attr('y2', d => d.target.y);

        this.g.selectAll('.node')
            .attr('cx', d => d.x)
            .attr('cy', d => d.y);

        this.g.selectAll('.label')
            .attr('x', d => d.x)
            .attr('y', d => d.y);
    }

    drag() {
        return d3.drag()
            .on('start', (event, d) => {
                if (!event.active) this.simulation.alphaTarget(0.3).restart();
                d.fx = d.x;
                d.fy = d.y;
            })
            .on('drag', (event, d) => {
                d.fx = event.x;
                d.fy = event.y;
            })
            .on('end', (event, d) => {
                if (!event.active) this.simulation.alphaTarget(0);
                d.fx = null;
                d.fy = null;
            });
    }

    getNodeColor(node) {
        if (node.nodeType === 'center') return '#e6007a';
        
        if (node.riskScore) {
            if (node.riskScore > 70) return '#f44336';
            if (node.riskScore > 40) return '#ff9800';
        }

        if (node.identity?.display?.display) {
            const identity = node.identity.display.display.toLowerCase();
            if (identity.includes('exchange')) return '#ff5722';
            if (identity.includes('validator')) return '#2196f3';
            if (identity.includes('pool')) return '#9c27b0';
        }

        if (node.merkle?.tag_type) {
            if (node.merkle.tag_type === 'Exchange') return '#ff5722';
            if (node.merkle.tag_type === 'Mixer') return '#f44336';
        }

        return '#9e9e9e';
    }

    getLinkColor(link) {
        if (link.suspiciousPattern) return '#f44336';
        if (link.direction === 'outgoing') return '#ff9800';
        if (link.direction === 'incoming') return '#4caf50';
        return '#2196f3';
    }

    getNodeLabel(node) {
        if (node.identity?.display?.display) {
            return node.identity.display.display;
        }
        return `${node.address.slice(0, 8)}...`;
    }

    onNodeClick(event, node) {
        event.stopPropagation();
        this.selectedNode = node;
        this.renderNodes();
        if (this.onNodeSelect) {
            this.onNodeSelect(node);
        }
    }

    onNodeDoubleClick(event, node) {
        event.stopPropagation();
        if (this.onNodeExpand) {
            this.onNodeExpand(node);
        }
    }

    onNodeHover(event, node) {
        const tooltip = d3.select('body').append('div')
            .attr('class', 'graph-tooltip')
            .style('position', 'absolute')
            .style('background', 'rgba(0, 0, 0, 0.9)')
            .style('color', 'white')
            .style('padding', '10px')
            .style('border-radius', '5px')
            .style('font-size', '12px')
            .style('pointer-events', 'none')
            .style('z-index', 1000);

        const balance = node.balance?.free || '0';
        const identity = node.identity?.display?.display || 'Unknown';
        
        tooltip.html(`
            <div>
                <strong>Address:</strong> ${node.address}<br>
                <strong>Identity:</strong> ${identity}<br>
                <strong>Balance:</strong> ${balance} DOT<br>
                <strong>Type:</strong> ${node.nodeType || 'regular'}<br>
                ${node.riskScore ? `<strong>Risk Score:</strong> ${node.riskScore}%<br>` : ''}
            </div>
        `);

        tooltip.style('left', (event.pageX + 10) + 'px')
            .style('top', (event.pageY - 10) + 'px');
    }

    onLinkHover(event, link) {
        const tooltip = d3.select('body').append('div')
            .attr('class', 'graph-tooltip')
            .style('position', 'absolute')
            .style('background', 'rgba(0, 0, 0, 0.9)')
            .style('color', 'white')
            .style('padding', '10px')
            .style('border-radius', '5px')
            .style('font-size', '12px')
            .style('pointer-events', 'none')
            .style('z-index', 1000);

        tooltip.html(`
            <div>
                <strong>Volume:</strong> ${link.volume || '0'} DOT<br>
                <strong>Transactions:</strong> ${link.count || 0}<br>
                <strong>Direction:</strong> ${link.direction || 'bidirectional'}<br>
                ${link.suspiciousPattern ? '<strong style="color: #f44336">⚠️ Suspicious Pattern</strong><br>' : ''}
            </div>
        `);

        tooltip.style('left', (event.pageX + 10) + 'px')
            .style('top', (event.pageY - 10) + 'px');
    }

    hideTooltip() {
        d3.selectAll('.graph-tooltip').remove();
    }

    fitToScreen() {
        const bounds = this.g.node().getBBox();
        const fullWidth = bounds.width;
        const fullHeight = bounds.height;
        const midX = bounds.x + fullWidth / 2;
        const midY = bounds.y + fullHeight / 2;

        const scale = 0.8 / Math.max(fullWidth / this.width, fullHeight / this.height);
        const translate = [this.width / 2 - scale * midX, this.height / 2 - scale * midY];

        this.svg.call(
            this.zoom.transform,
            d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale)
        );
    }

    highlight(nodeIds) {
        this.g.selectAll('.node')
            .attr('opacity', d => nodeIds.includes(d.id || d.address) ? 1 : 0.3);
        
        this.g.selectAll('.link')
            .attr('opacity', d => {
                const sourceId = d.source.id || d.source.address;
                const targetId = d.target.id || d.target.address;
                return nodeIds.includes(sourceId) && nodeIds.includes(targetId) ? 1 : 0.1;
            });
    }

    resetHighlight() {
        this.g.selectAll('.node').attr('opacity', 1);
        this.g.selectAll('.link').attr('opacity', 0.6);
    }

    exportSVG() {
        const svgData = this.svg.node().outerHTML;
        const blob = new Blob([svgData], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = 'polkadot-graph.svg';
        a.click();
        
        URL.revokeObjectURL(url);
    }
}

// Utility Functions
export const formatBalance = (balance) => {
    if (!balance) return '0';
    const num = parseFloat(balance);
    if (num > 1e9) return `${(num / 1e9).toFixed(2)}B`;
    if (num > 1e6) return `${(num / 1e6).toFixed(2)}M`;
    if (num > 1e3) return `${(num / 1e3).toFixed(2)}K`;
    return num.toFixed(2);
};

export const shortenAddress = (address, start = 8, end = 8) => {
    if (!address || address.length < start + end) return address;
    return `${address.slice(0, start)}...${address.slice(-end)}`;
};

export const isValidPolkadotAddress = (address) => {
    return /^[1-9A-HJ-NP-Za-km-z]{46,48}$/.test(address);
};

export const debounce = (func, wait) => {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
};

// Export main application class
export class PolkadotAnalyzer {
    constructor(options = {}) {
        this.api = new PolkadotAPI(options.apiUrl);
        this.ws = new WebSocketManager(options.wsUrl);
        this.store = new Store({
            selectedAddress: '',
            graphData: null,
            filters: {
                depth: 2,
                minVolume: '0',
                direction: 'both',
                includeRiskScores: false
            },
            isLoading: false,
            error: null,
            selectedNode: null,
            patterns: null,
            searchResults: []
        });
        this.graphRenderer = null;
    }

    init(graphContainer) {
        this.graphRenderer = new GraphRenderer(graphContainer).init();
        this.graphRenderer.onNodeSelect = (node) => this.handleNodeSelect(node);
        this.graphRenderer.onNodeExpand = (node) => this.expandNode(node);
        
        this.setupWebSocketHandlers();
        return this;
    }

    setupWebSocketHandlers() {
        this.ws.on('graph:update', (data) => {
            const state = this.store.getState();
            if (data.address === state.selectedAddress) {
                this.updateGraph(data.updates);
            }
        });

        this.ws.on('pattern:alert', (alert) => {
            this.showAlert('Pattern Detected', alert.message, 'warning');
        });

        this.ws.on('risk:alert', (alert) => {
            this.showAlert('Risk Alert', alert.message, 'error');
        });
    }

    async loadGraph(address) {
        this.store.setState({ isLoading: true, error: null, selectedAddress: address });

        try {
            const filters = this.store.getState().filters;
            const graphData = await this.api.getGraph(address, filters);
            
            this.store.setState({ graphData, isLoading: false });
            this.graphRenderer.updateGraph(graphData);
            
            // Subscribe to real-time updates
            this.ws.subscribe(address, filters);
            
            // Load patterns asynchronously
            this.loadPatterns(address);
            
        } catch (error) {
            this.store.setState({ error: error.message, isLoading: false });
            this.showAlert('Error', error.message, 'error');
        }
    }

    async loadPatterns(address) {
        try {
            const patterns = await this.api.detectPatterns(address);
            this.store.setState({ patterns });
        } catch (error) {
            console.error('Failed to load patterns:', error);
        }
    }

    async expandNode(node) {
        const address = node.id || node.address;
        
        try {
            const expansion = await this.api.getGraph(address, { depth: 1 });
            
            // Merge with existing graph
            const currentGraph = this.store.getState().graphData;
            const mergedGraph = this.mergeGraphs(currentGraph, expansion);
            
            this.store.setState({ graphData: mergedGraph });
            this.graphRenderer.updateGraph(mergedGraph);
            
        } catch (error) {
            this.showAlert('Expansion Failed', error.message, 'error');
        }
    }

    mergeGraphs(graph1, graph2) {
        const nodeMap = new Map();
        const edgeMap = new Map();
        
        // Add existing nodes
        graph1.nodes.forEach(node => nodeMap.set(node.address, node));
        
        // Add new nodes
        graph2.nodes.forEach(node => {
            if (!nodeMap.has(node.address)) {
                nodeMap.set(node.address, node);
            }
        });
        
        // Add existing edges
        graph1.edges.forEach(edge => {
            const key = `${edge.source}-${edge.target}`;
            edgeMap.set(key, edge);
        });
        
        // Add new edges
        graph2.edges.forEach(edge => {
            const key = `${edge.source}-${edge.target}`;
            if (!edgeMap.has(key)) {
                edgeMap.set(key, edge);
            }
        });
        
        return {
            nodes: Array.from(nodeMap.values()),
            edges: Array.from(edgeMap.values())
        };
    }

    handleNodeSelect(node) {
        this.store.setState({ selectedNode: node });
    }

    updateFilters(filters) {
        const currentFilters = this.store.getState().filters;
        this.store.setState({ filters: { ...currentFilters, ...filters } });
        
        // Reload graph with new filters
        const address = this.store.getState().selectedAddress;
        if (address) {
            this.loadGraph(address);
        }
    }

    showAlert(title, message, type = 'info') {
        // This should be implemented by the UI framework
        console.log(`[${type.toUpperCase()}] ${title}: ${message}`);
    }

    getState() {
        return this.store.getState();
    }

    subscribe(listener) {
        return this.store.subscribe(listener);
    }
}

// Initialize when DOM is ready
if (typeof window !== 'undefined') {
    window.PolkadotAnalyzer = PolkadotAnalyzer;
    window.polkadotAPI = PolkadotAPI;
    window.graphRenderer = GraphRenderer;
}