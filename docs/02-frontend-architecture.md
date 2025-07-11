# Frontend Architecture Guide

## Overview

This guide documents the frontend architecture for the Polkadot Analysis Tool, adapted from FollowTheDot's TypeScript/D3.js implementation. We'll extract the valuable visualization components while simplifying the architecture for maintainability.

## Component Architecture

### Core Components

#### 1. Graph Visualization (D3.js)
The heart of the application - an interactive force-directed graph for visualizing account relationships.

```javascript
// src/ui/components/NetworkGraph.js
export class NetworkGraph {
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            width: options.width || 1200,
            height: options.height || 800,
            nodeRadius: options.nodeRadius || 8,
            linkDistance: options.linkDistance || 100,
            chargeStrength: options.chargeStrength || -500,
            ...options
        };
        
        this.simulation = null;
        this.svg = null;
        this.nodes = [];
        this.links = [];
        
        this.init();
    }
    
    init() {
        // Create SVG container
        this.svg = d3.select(this.container)
            .append('svg')
            .attr('width', this.options.width)
            .attr('height', this.options.height);
            
        // Add zoom behavior
        const zoom = d3.zoom()
            .scaleExtent([0.2, 8])
            .on('zoom', (event) => {
                this.g.attr('transform', event.transform);
            });
            
        this.svg.call(zoom);
        
        // Create main group
        this.g = this.svg.append('g');
        
        // Initialize force simulation
        this.simulation = d3.forceSimulation()
            .force('link', d3.forceLink().id(d => d.id).distance(this.options.linkDistance))
            .force('charge', d3.forceManyBody().strength(this.options.chargeStrength))
            .force('center', d3.forceCenter(this.options.width / 2, this.options.height / 2))
            .force('collision', d3.forceCollide().radius(d => d.radius + 2));
    }
    
    updateGraph(data) {
        // Process nodes and links
        this.nodes = data.accounts.map(account => ({
            id: account.address,
            label: account.display_name || this.truncateAddress(account.address),
            balance: BigInt(account.balance || 0),
            radius: this.calculateNodeRadius(account),
            color: this.getNodeColor(account),
            ...account
        }));
        
        this.links = data.transferVolumes.map(transfer => ({
            source: transfer.from,
            target: transfer.to,
            value: Number(BigInt(transfer.volume) / 10_000_000n), // Scale down for visualization
            count: transfer.count,
            id: `${transfer.from}-${transfer.to}`
        }));
        
        this.render();
    }
    
    render() {
        // Clear existing elements
        this.g.selectAll('.link').remove();
        this.g.selectAll('.node').remove();
        
        // Render links
        const link = this.g.append('g')
            .attr('class', 'links')
            .selectAll('line')
            .data(this.links)
            .join('line')
            .attr('class', 'link')
            .attr('stroke-width', d => Math.sqrt(d.value))
            .attr('stroke', '#999')
            .attr('marker-end', 'url(#arrowhead)');
            
        // Render nodes
        const node = this.g.append('g')
            .attr('class', 'nodes')
            .selectAll('g')
            .data(this.nodes)
            .join('g')
            .attr('class', 'node')
            .call(this.drag());
            
        // Add circles
        node.append('circle')
            .attr('r', d => d.radius)
            .attr('fill', d => d.color)
            .attr('stroke', '#fff')
            .attr('stroke-width', 2);
            
        // Add labels
        node.append('text')
            .text(d => d.label)
            .attr('x', 0)
            .attr('y', -15)
            .attr('text-anchor', 'middle')
            .attr('font-size', '12px');
            
        // Update simulation
        this.simulation
            .nodes(this.nodes)
            .on('tick', () => this.ticked());
            
        this.simulation.force('link')
            .links(this.links);
            
        this.simulation.alpha(1).restart();
    }
    
    // Event handlers
    onNodeClick(callback) {
        this.g.selectAll('.node').on('click', (event, d) => {
            event.stopPropagation();
            callback(d);
        });
    }
    
    onNodeDoubleClick(callback) {
        this.g.selectAll('.node').on('dblclick', (event, d) => {
            event.stopPropagation();
            callback(d);
        });
    }
}
```

#### 2. Search Component
Address search with autocomplete and identity resolution.

```javascript
// src/ui/components/AddressSearch.js
export class AddressSearch {
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            placeholder: options.placeholder || 'Search address or identity...',
            debounceTime: options.debounceTime || 300,
            minChars: options.minChars || 3,
            onSelect: options.onSelect || (() => {}),
            ...options
        };
        
        this.searchTimeout = null;
        this.results = [];
        
        this.init();
    }
    
    init() {
        // Create search container
        const searchDiv = document.createElement('div');
        searchDiv.className = 'address-search';
        searchDiv.innerHTML = `
            <input type="text" 
                   class="search-input" 
                   placeholder="${this.options.placeholder}">
            <div class="search-results" style="display: none;"></div>
        `;
        
        this.container.appendChild(searchDiv);
        
        // Get elements
        this.input = searchDiv.querySelector('.search-input');
        this.resultsDiv = searchDiv.querySelector('.search-results');
        
        // Bind events
        this.input.addEventListener('input', (e) => this.handleInput(e));
        this.input.addEventListener('blur', () => this.hideResults());
        
        // Click outside to close
        document.addEventListener('click', (e) => {
            if (!searchDiv.contains(e.target)) {
                this.hideResults();
            }
        });
    }
    
    async handleInput(event) {
        const query = event.target.value.trim();
        
        // Clear previous timeout
        if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
        }
        
        // Check minimum characters
        if (query.length < this.options.minChars) {
            this.hideResults();
            return;
        }
        
        // Debounce search
        this.searchTimeout = setTimeout(async () => {
            await this.search(query);
        }, this.options.debounceTime);
    }
    
    async search(query) {
        try {
            const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
            const results = await response.json();
            
            this.displayResults(results);
        } catch (error) {
            console.error('Search error:', error);
            this.displayError();
        }
    }
    
    displayResults(results) {
        if (!results || results.length === 0) {
            this.resultsDiv.innerHTML = '<div class="no-results">No results found</div>';
            this.resultsDiv.style.display = 'block';
            return;
        }
        
        const html = results.map(result => `
            <div class="search-result" data-address="${result.address}">
                <div class="result-address">${this.truncateAddress(result.address)}</div>
                ${result.display_name ? `<div class="result-name">${result.display_name}</div>` : ''}
                ${result.verified ? '<span class="verified-badge">✓</span>' : ''}
            </div>
        `).join('');
        
        this.resultsDiv.innerHTML = html;
        this.resultsDiv.style.display = 'block';
        
        // Bind click events
        this.resultsDiv.querySelectorAll('.search-result').forEach(el => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const address = el.dataset.address;
                this.selectAddress(address);
            });
        });
    }
    
    selectAddress(address) {
        this.input.value = address;
        this.hideResults();
        this.options.onSelect(address);
    }
    
    truncateAddress(address) {
        if (address.length <= 16) return address;
        return `${address.slice(0, 8)}...${address.slice(-8)}`;
    }
}
```

#### 3. Control Panel
UI controls for graph manipulation and filtering.

```javascript
// src/ui/components/ControlPanel.js
export class ControlPanel {
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            onDepthChange: options.onDepthChange || (() => {}),
            onFilterChange: options.onFilterChange || (() => {}),
            onExport: options.onExport || (() => {}),
            ...options
        };
        
        this.init();
    }
    
    init() {
        const panel = document.createElement('div');
        panel.className = 'control-panel';
        panel.innerHTML = `
            <div class="control-group">
                <label>Expansion Depth:</label>
                <input type="range" id="depth-slider" min="1" max="5" value="2">
                <span id="depth-value">2</span>
            </div>
            
            <div class="control-group">
                <label>Min Transfer Volume:</label>
                <input type="number" id="volume-filter" placeholder="0">
            </div>
            
            <div class="control-group">
                <label>Time Range:</label>
                <select id="time-filter">
                    <option value="all">All Time</option>
                    <option value="year">Past Year</option>
                    <option value="month">Past Month</option>
                    <option value="week">Past Week</option>
                </select>
            </div>
            
            <div class="control-group">
                <button id="export-btn" class="btn btn-primary">Export Graph</button>
                <button id="reset-btn" class="btn btn-secondary">Reset View</button>
            </div>
        `;
        
        this.container.appendChild(panel);
        this.bindEvents();
    }
    
    bindEvents() {
        // Depth slider
        const depthSlider = document.getElementById('depth-slider');
        const depthValue = document.getElementById('depth-value');
        
        depthSlider.addEventListener('input', (e) => {
            depthValue.textContent = e.target.value;
            this.options.onDepthChange(parseInt(e.target.value));
        });
        
        // Volume filter
        const volumeFilter = document.getElementById('volume-filter');
        volumeFilter.addEventListener('change', (e) => {
            this.options.onFilterChange({
                minVolume: e.target.value ? BigInt(e.target.value) : 0n
            });
        });
        
        // Time filter
        const timeFilter = document.getElementById('time-filter');
        timeFilter.addEventListener('change', (e) => {
            this.options.onFilterChange({
                timeRange: e.target.value
            });
        });
        
        // Export button
        document.getElementById('export-btn').addEventListener('click', () => {
            this.options.onExport();
        });
        
        // Reset button
        document.getElementById('reset-btn').addEventListener('click', () => {
            this.resetFilters();
        });
    }
    
    resetFilters() {
        document.getElementById('depth-slider').value = 2;
        document.getElementById('depth-value').textContent = '2';
        document.getElementById('volume-filter').value = '';
        document.getElementById('time-filter').value = 'all';
        
        this.options.onFilterChange({
            minVolume: 0n,
            timeRange: 'all'
        });
    }
}
```

### State Management

#### EventBus Pattern
Simple pub/sub system for component communication.

```javascript
// src/ui/core/EventBus.js
export class EventBus {
    constructor() {
        this.events = {};
    }
    
    on(event, callback) {
        if (!this.events[event]) {
            this.events[event] = [];
        }
        this.events[event].push(callback);
        
        // Return unsubscribe function
        return () => {
            this.events[event] = this.events[event].filter(cb => cb !== callback);
        };
    }
    
    emit(event, data) {
        if (!this.events[event]) return;
        
        this.events[event].forEach(callback => {
            callback(data);
        });
    }
    
    once(event, callback) {
        const unsubscribe = this.on(event, (data) => {
            callback(data);
            unsubscribe();
        });
    }
}
```

#### Application State
Centralized state management for the application.

```javascript
// src/ui/core/AppState.js
export class AppState {
    constructor() {
        this.state = {
            currentAddress: null,
            graphData: null,
            filters: {
                depth: 2,
                minVolume: 0n,
                timeRange: 'all'
            },
            loading: false,
            error: null
        };
        
        this.listeners = new Map();
    }
    
    get(key) {
        return this.state[key];
    }
    
    set(key, value) {
        const oldValue = this.state[key];
        this.state[key] = value;
        
        // Notify listeners
        if (this.listeners.has(key)) {
            this.listeners.get(key).forEach(callback => {
                callback(value, oldValue);
            });
        }
    }
    
    subscribe(key, callback) {
        if (!this.listeners.has(key)) {
            this.listeners.set(key, []);
        }
        
        this.listeners.get(key).push(callback);
        
        // Return unsubscribe function
        return () => {
            const callbacks = this.listeners.get(key);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        };
    }
}
```

### API Integration

#### API Client
Centralized API communication layer.

```javascript
// src/ui/services/ApiClient.js
export class ApiClient {
    constructor(baseUrl = '/api') {
        this.baseUrl = baseUrl;
        this.cache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    }
    
    async searchAddresses(query) {
        const cacheKey = `search:${query}`;
        const cached = this.getFromCache(cacheKey);
        if (cached) return cached;
        
        const response = await this.fetch(`/search?q=${encodeURIComponent(query)}`);
        this.setCache(cacheKey, response);
        
        return response;
    }
    
    async getAddressGraph(address, options = {}) {
        const params = new URLSearchParams({
            depth: options.depth || 2,
            minVolume: options.minVolume?.toString() || '0',
            timeRange: options.timeRange || 'all'
        });
        
        return this.fetch(`/address/${address}/graph?${params}`);
    }
    
    async getTransfers(fromAddress, toAddress, options = {}) {
        const params = new URLSearchParams({
            from: fromAddress,
            to: toAddress,
            limit: options.limit || 100,
            offset: options.offset || 0
        });
        
        return this.fetch(`/transfers?${params}`);
    }
    
    async detectPatterns(address) {
        return this.fetch(`/address/${address}/patterns`);
    }
    
    async fetch(endpoint, options = {}) {
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        });
        
        if (!response.ok) {
            throw new Error(`API Error: ${response.statusText}`);
        }
        
        return response.json();
    }
    
    getFromCache(key) {
        const cached = this.cache.get(key);
        if (!cached) return null;
        
        if (Date.now() - cached.timestamp > this.cacheTimeout) {
            this.cache.delete(key);
            return null;
        }
        
        return cached.data;
    }
    
    setCache(key, data) {
        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });
        
        // Limit cache size
        if (this.cache.size > 100) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
    }
}
```

### CSS Architecture

#### Component Styles
```css
/* src/ui/styles/components.css */

/* Graph Container */
.graph-container {
    position: relative;
    width: 100%;
    height: 100vh;
    background: #f5f5f5;
    overflow: hidden;
}

.graph-container svg {
    width: 100%;
    height: 100%;
}

/* Nodes and Links */
.node {
    cursor: pointer;
    transition: all 0.3s ease;
}

.node:hover {
    filter: brightness(1.2);
}

.node.selected {
    stroke: #ff6b6b;
    stroke-width: 4px;
}

.link {
    stroke: #999;
    stroke-opacity: 0.6;
    transition: stroke-width 0.3s ease;
}

.link:hover {
    stroke-opacity: 1;
    stroke-width: 3;
}

/* Search Component */
.address-search {
    position: relative;
    width: 400px;
    margin: 20px;
}

.search-input {
    width: 100%;
    padding: 12px 16px;
    font-size: 16px;
    border: 2px solid #ddd;
    border-radius: 8px;
    outline: none;
    transition: border-color 0.3s ease;
}

.search-input:focus {
    border-color: #4CAF50;
}

.search-results {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: white;
    border: 1px solid #ddd;
    border-radius: 8px;
    margin-top: 4px;
    max-height: 300px;
    overflow-y: auto;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    z-index: 1000;
}

.search-result {
    padding: 12px;
    cursor: pointer;
    border-bottom: 1px solid #eee;
    transition: background-color 0.2s ease;
}

.search-result:hover {
    background-color: #f5f5f5;
}

.result-address {
    font-family: monospace;
    font-size: 14px;
    color: #333;
}

.result-name {
    font-size: 12px;
    color: #666;
    margin-top: 4px;
}

.verified-badge {
    display: inline-block;
    background: #4CAF50;
    color: white;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 11px;
    margin-left: 8px;
}

/* Control Panel */
.control-panel {
    position: fixed;
    top: 20px;
    right: 20px;
    background: white;
    padding: 20px;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    width: 300px;
    z-index: 100;
}

.control-group {
    margin-bottom: 16px;
}

.control-group label {
    display: block;
    font-size: 14px;
    font-weight: 500;
    margin-bottom: 8px;
    color: #333;
}

.control-group input[type="range"] {
    width: 100%;
}

.control-group input[type="number"],
.control-group select {
    width: 100%;
    padding: 8px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 14px;
}

.btn {
    padding: 8px 16px;
    border: none;
    border-radius: 4px;
    font-size: 14px;
    cursor: pointer;
    transition: background-color 0.2s ease;
}

.btn-primary {
    background: #4CAF50;
    color: white;
}

.btn-primary:hover {
    background: #45a049;
}

.btn-secondary {
    background: #666;
    color: white;
    margin-left: 8px;
}

.btn-secondary:hover {
    background: #555;
}

/* Loading States */
.loading-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(255, 255, 255, 0.9);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2000;
}

.spinner {
    width: 40px;
    height: 40px;
    border: 4px solid #f3f3f3;
    border-top: 4px solid #4CAF50;
    border-radius: 50%;
    animation: spin 1s linear infinite;
}

@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}
```

### Mobile Responsiveness

```javascript
// src/ui/utils/responsive.js
export class ResponsiveManager {
    constructor() {
        this.breakpoints = {
            mobile: 768,
            tablet: 1024,
            desktop: 1440
        };
        
        this.currentBreakpoint = this.getBreakpoint();
        this.listeners = [];
        
        window.addEventListener('resize', () => this.handleResize());
    }
    
    getBreakpoint() {
        const width = window.innerWidth;
        
        if (width < this.breakpoints.mobile) return 'mobile';
        if (width < this.breakpoints.tablet) return 'tablet';
        if (width < this.breakpoints.desktop) return 'desktop';
        return 'large';
    }
    
    handleResize() {
        const newBreakpoint = this.getBreakpoint();
        
        if (newBreakpoint !== this.currentBreakpoint) {
            this.currentBreakpoint = newBreakpoint;
            this.notifyListeners(newBreakpoint);
        }
    }
    
    onBreakpointChange(callback) {
        this.listeners.push(callback);
        
        // Return unsubscribe function
        return () => {
            this.listeners = this.listeners.filter(cb => cb !== callback);
        };
    }
    
    notifyListeners(breakpoint) {
        this.listeners.forEach(callback => callback(breakpoint));
    }
    
    isMobile() {
        return this.currentBreakpoint === 'mobile';
    }
    
    isTablet() {
        return this.currentBreakpoint === 'tablet';
    }
    
    isDesktop() {
        return this.currentBreakpoint === 'desktop' || this.currentBreakpoint === 'large';
    }
}
```

## Build Configuration

### Webpack Configuration
```javascript
// webpack.config.js
const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = {
    entry: './src/ui/index.js',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'bundle.[contenthash].js'
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: ['@babel/preset-env']
                    }
                }
            },
            {
                test: /\.css$/,
                use: [MiniCssExtractPlugin.loader, 'css-loader']
            }
        ]
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: './src/ui/index.html'
        }),
        new MiniCssExtractPlugin({
            filename: 'styles.[contenthash].css'
        })
    ],
    optimization: {
        splitChunks: {
            chunks: 'all',
            cacheGroups: {
                vendor: {
                    test: /[\\/]node_modules[\\/]/,
                    name: 'vendors',
                    priority: 10
                }
            }
        }
    }
};
```

## Performance Optimizations

1. **Virtual Scrolling**: For large result lists
2. **Debounced Search**: Reduce API calls
3. **Graph Simplification**: Limit visible nodes based on viewport
4. **Progressive Loading**: Load graph data in chunks
5. **Canvas Fallback**: Use Canvas for very large graphs
6. **Web Workers**: Offload heavy calculations

## Testing Strategy

```javascript
// src/ui/__tests__/NetworkGraph.test.js
import { NetworkGraph } from '../components/NetworkGraph';

describe('NetworkGraph', () => {
    let container;
    let graph;
    
    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        graph = new NetworkGraph(container);
    });
    
    afterEach(() => {
        document.body.removeChild(container);
    });
    
    test('should initialize with default options', () => {
        expect(graph.options.width).toBe(1200);
        expect(graph.options.height).toBe(800);
        expect(graph.simulation).toBeDefined();
    });
    
    test('should update graph with new data', () => {
        const mockData = {
            accounts: [
                { address: '1A1zP1...', balance: '1000000000' },
                { address: '1BoatS...', balance: '2000000000' }
            ],
            transferVolumes: [
                { from: '1A1zP1...', to: '1BoatS...', volume: '500000000', count: 10 }
            ]
        };
        
        graph.updateGraph(mockData);
        
        expect(graph.nodes.length).toBe(2);
        expect(graph.links.length).toBe(1);
    });
});
```

This frontend architecture provides a solid foundation for building an interactive blockchain analysis tool with modern web technologies.