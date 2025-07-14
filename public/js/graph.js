/**
 * Polkadot Analysis Tool - D3.js Graph Visualization Component
 * 
 * This module provides comprehensive graph visualization capabilities for blockchain relationship data.
 * Features:
 * - Force-directed graph layout with customizable physics
 * - Interactive node and edge manipulation
 * - Progressive loading for large datasets
 * - Real-time filtering and highlighting
 * - Performance optimizations for smooth rendering
 * - Integration with D3Formatter service data format
 */

class PolkadotGraphVisualization {
    constructor(containerSelector, options = {}) {
        // Configuration
        this.config = {
            // Layout parameters
            width: options.width || 1200,
            height: options.height || 600,
            
            // Force simulation settings - much stronger spacing and very slow convergence
            forces: {
                charge: options.chargeStrength || -2000,          // Much stronger repulsion for better spacing
                linkDistance: options.linkDistance || 200,        // Longer links to spread nodes out more
                linkStrength: options.linkStrength || 0.1,        // Weaker link force so repulsion dominates
                collideRadius: options.collideRadius || 80,       // Much larger collision radius
                alpha: options.alpha || 0.2,                      // Lower starting energy
                alphaDecay: options.alphaDecay || 0.002,          // Extremely slow decay to prevent clustering
                velocityDecay: options.velocityDecay || 0.3       // Lower velocity decay for even smoother movement
            },
            
            // Visual styling
            nodes: {
                minRadius: options.nodeMinRadius || 8,
                maxRadius: options.nodeMaxRadius || 40,
                strokeWidth: options.nodeStrokeWidth || 2,
                labelFont: options.labelFont || '12px sans-serif'
            },
            
            edges: {
                minWidth: options.edgeMinWidth || 1,
                maxWidth: options.edgeMaxWidth || 8,
                opacity: options.edgeOpacity || 0.6,
                animationSpeed: options.animationSpeed || 1000
            },
            
            // Color schemes from D3Formatter
            colors: {
                safe: '#4CAF50',
                medium: '#FF9800',
                high: '#F44336',
                neutral: '#9E9E9E',
                exchange: '#2196F3',
                validator: '#9C27B0',
                mixer: '#FF5722',
                background: '#1a1a1a',
                text: '#ffffff'
            },
            
            // Performance settings
            performance: {
                maxNodes: options.maxNodes || 1000,
                maxEdges: options.maxEdges || 2000,
                useCanvas: options.useCanvas || false,
                levelOfDetail: options.levelOfDetail || true,
                spatialIndexing: options.spatialIndexing || true
            },
            
            // Progressive loading
            progressive: {
                batchSize: options.batchSize || 50,
                loadingDelay: options.loadingDelay || 100,
                enableAutoLoad: options.enableAutoLoad || false
            }
        };
        
        // State management
        this.state = {
            data: { nodes: [], links: [] },
            filteredData: { nodes: [], links: [] },
            selectedNodes: new Set(),
            highlightedNodes: new Set(),
            expandingNodes: new Set(),
            lockedNodes: new Set(),
            currentFilters: {},
            isLoading: false,
            hasMore: false,
            nextCursor: null,
            viewTransform: null,
            zoomLevel: 1,
            simulationPaused: false
        };
        
        // Performance tracking
        this.metrics = {
            renderTime: 0,
            nodeCount: 0,
            edgeCount: 0,
            lastUpdate: Date.now(),
            frameRate: 0
        };
        
        // Initialize visualization
        this.container = d3.select(containerSelector);
        
        // Validate container exists and is properly accessible
        if (this.container.empty()) {
            const error = new Error(`Graph container not found: ${containerSelector}. Please ensure the element exists in the DOM.`);
            console.error('PolkadotGraphVisualization initialization failed:', error.message);
            if (options.onError) {
                options.onError(error);
            }
            throw error;
        }
        
        // Validate container has a valid DOM node
        const containerNode = this.container.node();
        if (!containerNode) {
            const error = new Error(`Invalid container node for selector: ${containerSelector}`);
            console.error('PolkadotGraphVisualization initialization failed:', error.message);
            if (options.onError) {
                options.onError(error);
            }
            throw error;
        }
        
        console.log(`Graph container found: ${containerSelector}`, containerNode);
        
        this.initializeVisualization();
        this.setupEventHandlers();
        
        // Callback functions
        this.callbacks = {
            onNodeClick: options.onNodeClick || this.defaultNodeClick.bind(this),
            onNodeDoubleClick: options.onNodeDoubleClick || this.defaultNodeDoubleClick.bind(this),
            onEdgeClick: options.onEdgeClick || this.defaultEdgeClick.bind(this),
            onViewportChange: options.onViewportChange || (() => {}),
            onDataUpdate: options.onDataUpdate || (() => {}),
            onError: options.onError || console.error
        };
    }
    
    /**
     * Initialize the D3.js visualization components
     */
    initializeVisualization() {
        try {
            // Clear existing content
            this.container.selectAll('*').remove();
            
            // Get actual container dimensions with proper error handling
            const containerElement = this.container.node().tagName === 'svg' ? 
                this.container.node().parentNode : this.container.node();
            
            if (!containerElement) {
                throw new Error('Container element not accessible for dimension measurement');
            }
            
            const rect = containerElement.getBoundingClientRect();
            
            // Validate dimensions are meaningful
            if (!rect || (rect.width === 0 && rect.height === 0)) {
                console.warn('Container has zero dimensions, using fallback values');
                // Use CSS or computed styles as fallback
                const computedStyle = window.getComputedStyle(containerElement);
                const computedWidth = parseFloat(computedStyle.width);
                const computedHeight = parseFloat(computedStyle.height);
                
                this.config.width = computedWidth > 0 ? computedWidth : this.config.width;
                this.config.height = computedHeight > 0 ? computedHeight : this.config.height;
            } else {
                // Update config with actual dimensions
                this.config.width = rect.width || this.config.width;
                this.config.height = rect.height || this.config.height;
            }
            
            // Ensure minimum dimensions
            this.config.width = Math.max(this.config.width, 300);
            this.config.height = Math.max(this.config.height, 200);
            
            console.log(`Graph dimensions: ${this.config.width}x${this.config.height}`);
        } catch (error) {
            console.error('Error during container dimension detection:', error);
            this.callbacks.onError?.(error);
            // Continue with default dimensions
        }
        
        // Create main SVG with validation
        try {
            this.svg = this.container.node().tagName === 'svg' ? 
                this.container : 
                this.container.append('svg');
            
            if (!this.svg || this.svg.empty()) {
                throw new Error('Failed to create or access SVG element');
            }
            
            // Validate that dimensions are valid before setting attributes
            if (this.config.width <= 0 || this.config.height <= 0) {
                throw new Error(`Invalid SVG dimensions: ${this.config.width}x${this.config.height}`);
            }
            
            this.svg
                .attr('width', this.config.width)
                .attr('height', this.config.height)
                .attr('viewBox', [0, 0, this.config.width, this.config.height])
                .style('background-color', this.config.colors.background);
                
            console.log('SVG element created successfully');
        } catch (error) {
            console.error('Error creating SVG element:', error);
            this.callbacks.onError?.(error);
            throw error;
        }
        
        // Create zoom behavior
        this.zoom = d3.zoom()
            .scaleExtent([0.1, 10])
            .on('zoom', (event) => this.handleZoom(event));
        
        this.svg.call(this.zoom);
        
        // Create main group for zoomable content
        this.mainGroup = this.svg.append('g')
            .attr('class', 'main-group');
        
        // Create groups for different elements (order matters for rendering)
        this.edgeGroup = this.mainGroup.append('g').attr('class', 'edges');
        this.edgeLabelGroup = this.mainGroup.append('g').attr('class', 'edge-labels');
        this.nodeGroup = this.mainGroup.append('g').attr('class', 'nodes');
        this.labelGroup = this.mainGroup.append('g').attr('class', 'labels');
        this.overlayGroup = this.mainGroup.append('g').attr('class', 'overlays');
        
        // Arrows removed - cleaner visualization without endpoint markers
        // this.createArrowMarkers();
        
        // Initialize force simulation
        this.simulation = d3.forceSimulation()
            .force('link', d3.forceLink()
                .id(d => d.address)
                .distance(this.config.forces.linkDistance)
                .strength(this.config.forces.linkStrength))
            .force('charge', d3.forceManyBody()
                .strength(this.config.forces.charge))
            .force('center', d3.forceCenter(
                this.config.width / 2, 
                this.config.height / 2))
            .force('collision', d3.forceCollide()
                .radius(d => this.getNodeRadius(d) * 2 + this.config.forces.collideRadius)
                .strength(1.5)
                .iterations(3))
            .alpha(this.config.forces.alpha)
            .alphaDecay(this.config.forces.alphaDecay)
            .velocityDecay(this.config.forces.velocityDecay)
            .on('tick', () => this.tick())
            .on('end', () => this.onSimulationEnd());
        
        // Create tooltip
        this.tooltip = this.createTooltip();
        
        // Create loading indicator
        this.loadingIndicator = this.createLoadingIndicator();
        
        console.log('D3.js graph visualization initialized');
    }
    
    /**
     * Create arrow markers for directed edges
     */
    createArrowMarkers() {
        const defs = this.svg.append('defs');
        
        // Standard arrow marker
        defs.append('marker')
            .attr('id', 'arrow')
            .attr('viewBox', '0 -5 10 10')
            .attr('refX', 8)
            .attr('refY', 0)
            .attr('markerWidth', 6)
            .attr('markerHeight', 6)
            .attr('orient', 'auto')
            .append('path')
            .attr('d', 'M0,-5L10,0L0,5')
            .attr('fill', '#666');
        
        // Highlighted arrow marker
        defs.append('marker')
            .attr('id', 'arrow-highlighted')
            .attr('viewBox', '0 -5 10 10')
            .attr('refX', 8)
            .attr('refY', 0)
            .attr('markerWidth', 6)
            .attr('markerHeight', 6)
            .attr('orient', 'auto')
            .append('path')
            .attr('d', 'M0,-5L10,0L0,5')
            .attr('fill', this.config.colors.high);
    }
    
    /**
     * Create tooltip element
     */
    createTooltip() {
        return d3.select('body')
            .append('div')
            .attr('class', 'graph-tooltip')
            .style('position', 'absolute')
            .style('visibility', 'hidden')
            .style('background-color', 'rgba(0, 0, 0, 0.9)')
            .style('color', 'white')
            .style('padding', '10px')
            .style('border-radius', '4px')
            .style('font-size', '12px')
            .style('z-index', '1000')
            .style('pointer-events', 'none')
            .style('max-width', '300px');
    }
    
    /**
     * Create loading indicator
     */
    createLoadingIndicator() {
        const indicator = this.container
            .append('div')
            .attr('class', 'graph-loading')
            .style('position', 'absolute')
            .style('top', '50%')
            .style('left', '50%')
            .style('transform', 'translate(-50%, -50%)')
            .style('display', 'none')
            .style('z-index', '100');
        
        indicator.append('div')
            .attr('class', 'spinner')
            .style('width', '40px')
            .style('height', '40px')
            .style('border', '4px solid #333')
            .style('border-top', '4px solid #e6007a')
            .style('border-radius', '50%')
            .style('animation', 'spin 1s linear infinite');
        
        indicator.append('div')
            .style('margin-top', '10px')
            .style('color', 'white')
            .style('text-align', 'center')
            .text('Loading graph data...');
        
        return indicator;
    }
    
    /**
     * Load and display graph data
     * @param {Object} graphData - Graph data in D3Formatter format
     */
    loadGraphData(graphData) {
        const startTime = performance.now();
        
        try {
            // Validate data structure
            if (!graphData || !graphData.nodes || !graphData.links) {
                throw new Error('Invalid graph data format');
            }
            
            console.log('Loading graph data:', {
                nodes: graphData.nodes.length,
                links: graphData.links.length,
                metadata: graphData.metadata
            });
            
            // Store original data
            this.state.data = {
                nodes: graphData.nodes.map(node => ({ ...node })),
                links: graphData.links.map(link => ({ ...link }))
            };
            
            // Update metadata
            if (graphData.metadata) {
                this.state.hasMore = graphData.metadata.hasMore || false;
                this.state.nextCursor = graphData.metadata.nextCursor || null;
            }
            
            // Apply current filters
            this.applyFilters();
            
            // Update force simulation parameters based on data size
            this.updateSimulationParameters();
            
            // Render the graph
            this.render();
            
            // Update metrics
            const loadTime = performance.now() - startTime;
            this.metrics.renderTime = loadTime;
            this.metrics.nodeCount = this.state.filteredData.nodes.length;
            this.metrics.edgeCount = this.state.filteredData.links.length;
            this.metrics.lastUpdate = Date.now();
            
            console.log(`Graph rendered in ${loadTime.toFixed(2)}ms`);
            
            // Trigger callback
            this.callbacks.onDataUpdate(this.state.filteredData, this.metrics);
            
        } catch (error) {
            console.error('Error loading graph data:', error);
            this.callbacks.onError(error);
        }
    }
    
    /**
     * Apply filters to the data
     */
    applyFilters() {
        const filters = this.state.currentFilters;
        
        // Start with all nodes and links
        let filteredNodes = [...this.state.data.nodes];
        let filteredLinks = [...this.state.data.links];
        
        // Apply node type filter
        if (filters.nodeTypes && filters.nodeTypes.length > 0) {
            filteredNodes = filteredNodes.filter(node => 
                filters.nodeTypes.includes(node.nodeType || 'regular'));
        }
        
        // Risk filtering removed - not implemented yet
        
        // Apply volume filter
        if (filters.minVolume && filters.minVolume !== '0') {
            const minVolume = BigInt(filters.minVolume);
            filteredLinks = filteredLinks.filter(link => {
                if (!link.volume || link.volume === '0') return false;
                
                try {
                    // Volume is already in planck units (string format)
                    // Handle decimal values by removing decimal part
                    const volumeStr = link.volume.toString();
                    const volumeInt = volumeStr.includes('.') ? volumeStr.split('.')[0] : volumeStr;
                    const volumeBigInt = BigInt(volumeInt);
                    
                    const isAboveMin = volumeBigInt >= minVolume;
                    return isAboveMin;
                } catch (error) {
                    console.error('Error parsing volume:', error, link.volume);
                    return false;
                }
            });
        }
        
        // Apply balance filter
        if (filters.minBalance && filters.minBalance !== '0') {
            const minBalance = BigInt(filters.minBalance);
            filteredNodes = filteredNodes.filter(node => {
                try {
                    // Handle both balance formats (nested and flat)
                    const balance = node.balance?.free || node.balance || '0';
                    
                    // Check if balance is in DOT format (has decimal point)
                    const balanceStr = balance.toString();
                    let balancePlanck;
                    
                    if (balanceStr.includes('.')) {
                        // Balance is in DOT format, convert to planck
                        const balanceDot = parseFloat(balanceStr);
                        balancePlanck = BigInt(Math.floor(balanceDot * 1e10));
                    } else {
                        // Balance is already in planck format
                        balancePlanck = BigInt(balanceStr);
                    }
                    
                    return balancePlanck >= minBalance;
                } catch (error) {
                    console.error('Error parsing balance:', error, node.balance);
                    return false;
                }
            });
        }
        
        // Apply time range filter
        if (filters.timeRange) {
            const { start, end } = filters.timeRange;
            filteredLinks = filteredLinks.filter(link => {
                const timestamp = link.lastTransfer || link.firstTransfer;
                return timestamp && timestamp >= start && timestamp <= end;
            });
        }
        
        // Filter nodes to only include those connected by remaining links
        // But if there are no links at all after filtering, show all filtered nodes
        if (filteredLinks.length > 0) {
            const connectedNodeIds = new Set();
            filteredLinks.forEach(link => {
                connectedNodeIds.add(link.source.address || link.source);
                connectedNodeIds.add(link.target.address || link.target);
            });
            
            filteredNodes = filteredNodes.filter(node => 
                connectedNodeIds.has(node.address));
        }
        
        // Apply volume threshold highlighting to all links (visible and filtered)
        if (filters.volumeThreshold) {
            const threshold = filters.volumeThreshold;
            this.state.data.links.forEach(link => {
                if (link.volume) {
                    try {
                        // Handle decimal values by converting to string and removing decimal part
                        const linkVolumeStr = link.volume.toString();
                        const thresholdStr = threshold.toString();
                        
                        // Remove decimal part if present
                        const linkVolumeBigInt = BigInt(linkVolumeStr.includes('.') ? linkVolumeStr.split('.')[0] : linkVolumeStr);
                        const thresholdBigInt = BigInt(thresholdStr.includes('.') ? thresholdStr.split('.')[0] : thresholdStr);
                        
                        const isAboveThreshold = linkVolumeBigInt >= thresholdBigInt;
                        
                        // Store threshold status for use in rendering
                        link._aboveThreshold = isAboveThreshold;
                    } catch (error) {
                        console.error('Error in volume threshold comparison during filter:', error, {
                            linkVolume: link.volume,
                            threshold: threshold
                        });
                        link._aboveThreshold = false;
                    }
                } else {
                    link._aboveThreshold = false;
                }
            });
        } else {
            // Clear threshold highlighting if no threshold set
            this.state.data.links.forEach(link => {
                link._aboveThreshold = false;
            });
        }
        
        // Update filtered data
        this.state.filteredData = {
            nodes: filteredNodes,
            links: filteredLinks
        };
        
        console.log('Filters applied:', {
            originalNodes: this.state.data.nodes.length,
            filteredNodes: filteredNodes.length,
            originalLinks: this.state.data.links.length,
            filteredLinks: filteredLinks.length,
            volumeThreshold: filters.volumeThreshold || 'none'
        });
    }
    
    /**
     * Update force simulation parameters based on data size
     */
    updateSimulationParameters() {
        const nodeCount = this.state.filteredData.nodes.length;
        const linkCount = this.state.filteredData.links.length;
        
        // Much stronger repulsion for maximum spacing - aggressive scaling
        const chargeStrength = -Math.max(1000, Math.min(5000, 1500 + nodeCount * 50));
        this.simulation.force('charge').strength(chargeStrength);
        
        // Much longer link distances to force nodes apart
        const density = linkCount / (nodeCount * (nodeCount - 1) / 2 || 1);
        const baseLinkDistance = this.config.forces.linkDistance;
        const linkDistance = Math.max(200, Math.min(500, baseLinkDistance * 1.5 + (density > 0.2 ? 100 : 0)));
        this.simulation.force('link').distance(linkDistance);
        
        // Very aggressive collision detection with massive spacing
        const avgNodeSize = this.state.filteredData.nodes.reduce((sum, n) => 
            sum + this.getNodeRadius(n), 0) / nodeCount || 15;
        this.simulation.force('collision')
            .radius(d => this.getNodeRadius(d) + avgNodeSize * 2 + 60)  // Massive spacing buffer
            .strength(1.0)  // Maximum collision strength
            .iterations(5); // More iterations for better separation
        
        // Restart simulation with very slow parameters
        this.simulation
            .alpha(0.1)  // Very low restart energy
            .alphaDecay(0.001)  // Extremely slow decay
            .restart();
        
        console.log('Simulation parameters updated for maximum spacing:', {
            chargeStrength,
            linkDistance,
            avgNodeSize,
            density: density.toFixed(3),
            collisionRadius: avgNodeSize * 2 + 60
        });
    }
    
    /**
     * Render the graph visualization
     */
    render() {
        // Show loading indicator for large datasets
        if (this.state.filteredData.nodes.length > 200) {
            this.showLoading();
        }
        
        // Use requestAnimationFrame for smooth rendering
        requestAnimationFrame(() => {
            this.renderNodes();
            this.renderEdges();
            this.renderEdgeLabels();
            this.renderLabels();
            
            // Update simulation
            this.simulation
                .nodes(this.state.filteredData.nodes)
                .force('link').links(this.state.filteredData.links);
            
            // Restart simulation if not paused
            if (!this.state.simulationPaused) {
                this.simulation.alpha(this.config.forces.alpha).restart();
            }
            
            this.hideLoading();
        });
    }
    
    /**
     * Render graph nodes
     */
    renderNodes() {
        const nodeSelection = this.nodeGroup
            .selectAll('.node')
            .data(this.state.filteredData.nodes, d => d.address);
        
        // Remove old nodes
        nodeSelection.exit()
            .transition()
            .duration(300)
            .attr('opacity', 0)
            .remove();
        
        // Add new nodes
        const nodeEnter = nodeSelection.enter()
            .append('g')
            .attr('class', 'node')
            .attr('data-address', d => d.address);
        
        // Add node circles
        nodeEnter.append('circle')
            .attr('r', d => this.getNodeRadius(d))
            .attr('fill', d => this.getNodeColor(d))
            .attr('stroke', d => this.getNodeStrokeColor(d))
            .attr('stroke-width', d => this.getNodeStrokeWidth(d))
            .attr('opacity', d => this.getNodeOpacity(d));
        
        // Add node icons for special types
        nodeEnter.filter(d => this.shouldShowNodeIcon(d))
            .append('text')
            .attr('class', 'node-icon')
            .attr('text-anchor', 'middle')
            .attr('dy', '0.35em')
            .attr('font-family', 'Arial Unicode MS')
            .attr('font-size', d => this.getNodeRadius(d) * 0.8)
            .attr('fill', 'white')
            .text(d => this.getNodeIcon(d));
        
        // Merge enter and update selections
        const nodeUpdate = nodeEnter.merge(nodeSelection);
        
        // Update node appearance
        nodeUpdate.select('circle')
            .transition()
            .duration(300)
            .attr('r', d => this.getNodeRadius(d))
            .attr('fill', d => this.getNodeColor(d))
            .attr('stroke', d => this.getNodeStrokeColor(d))
            .attr('stroke-width', d => this.getNodeStrokeWidth(d))
            .attr('opacity', d => this.getNodeOpacity(d));
        
        // Add event handlers
        nodeUpdate
            .style('cursor', 'pointer')
            .on('click', (event, d) => this.handleNodeClick(event, d))
            .on('dblclick', (event, d) => this.handleNodeDoubleClick(event, d))
            .on('mouseover', (event, d) => this.handleNodeMouseOver(event, d))
            .on('mouseout', (event, d) => this.handleNodeMouseOut(event, d))
            .call(this.createDragBehavior());
        
        // Store node selection for later use
        this.nodeSelection = nodeUpdate;
    }
    
    /**
     * Render graph edges
     */
    renderEdges() {
        const linkSelection = this.edgeGroup
            .selectAll('.edge-group')
            .data(this.state.filteredData.links, d => d.id || `${d.source}-${d.target}`);
        
        // Remove old edges
        linkSelection.exit()
            .transition()
            .duration(300)
            .attr('opacity', 0)
            .remove();
        
        // Add new edges with threshold highlighting support
        const linkEnter = linkSelection.enter()
            .append('g')
            .attr('class', 'edge-group');
        
        // Add red outline for threshold highlighting (rendered first, underneath)
        linkEnter.append('line')
            .attr('class', 'edge-highlight')
            .attr('stroke', '#FF0000')
            .attr('stroke-width', d => this.getEdgeHighlightWidth(d))
            .attr('stroke-opacity', d => d._aboveThreshold ? 0.8 : 0);
        
        // Add main edge line (rendered second, on top)
        linkEnter.append('line')
            .attr('class', 'edge')
            .attr('stroke', d => this.getEdgeColor(d))
            .attr('stroke-width', d => this.getEdgeWidth(d))
            .attr('stroke-opacity', d => this.getEdgeOpacity(d))
            // .attr('marker-end', d => this.getEdgeMarker(d)); // Arrows removed
        
        // Add stroke dasharray for special edge types on the main edge line
        linkEnter.select('.edge')
            .attr('stroke-dasharray', d => this.getEdgeDashArray(d));
        
        // Merge enter and update selections
        const linkUpdate = linkEnter.merge(linkSelection);
        
        // Update edge appearance
        linkUpdate.select('.edge-highlight')
            .transition()
            .duration(300)
            .attr('stroke-width', d => this.getEdgeHighlightWidth(d))
            .attr('stroke-opacity', d => d._aboveThreshold ? 0.8 : 0);
        
        linkUpdate.select('.edge')
            .transition()
            .duration(300)
            .attr('stroke', d => this.getEdgeColor(d))
            .attr('stroke-width', d => this.getEdgeWidth(d))
            .attr('stroke-opacity', d => this.getEdgeOpacity(d))
            .attr('stroke-dasharray', d => this.getEdgeDashArray(d));
        
        // Add event handlers
        linkUpdate
            .style('cursor', 'pointer')
            .on('click', (event, d) => this.handleEdgeClick(event, d))
            .on('mouseover', (event, d) => this.handleEdgeMouseOver(event, d))
            .on('mouseout', (event, d) => this.handleEdgeMouseOut(event, d));
        
        // Store edge selection for later use
        this.edgeSelection = linkUpdate;
    }

    /**
     * Render permanent edge labels showing connection information
     */
    renderEdgeLabels() {
        const edgeLabelSelection = this.edgeLabelGroup
            .selectAll('.edge-label-group')
            .data(this.state.filteredData.links, d => d.id || `${d.source}-${d.target}`);
        
        // Remove old edge label groups
        edgeLabelSelection.exit().remove();
        
        // Add new edge label groups
        const edgeLabelEnter = edgeLabelSelection.enter()
            .append('g')
            .attr('class', 'edge-label-group');
        
        // Add background rectangle for better readability
        edgeLabelEnter.append('rect')
            .attr('class', 'edge-label-background')
            .attr('fill', 'rgba(0, 0, 0, 0.8)')
            .attr('stroke', 'rgba(255, 255, 255, 0.2)')
            .attr('stroke-width', 0.5)
            .attr('rx', 2)
            .attr('ry', 2);
        
        // Add the edge label text
        edgeLabelEnter.append('text')
            .attr('class', 'edge-label-text')
            .attr('text-anchor', 'middle')
            .attr('font-family', 'Arial, sans-serif')
            .attr('font-size', '10px')
            .attr('fill', '#ffffff')
            .attr('pointer-events', 'none')
            .style('user-select', 'none')
            .text(d => this.getEdgeLabelText(d));
        
        // Merge selections
        const edgeLabelUpdate = edgeLabelEnter.merge(edgeLabelSelection);
        
        // Update edge label text and styling
        edgeLabelUpdate.select('.edge-label-text')
            .text(d => this.getEdgeLabelText(d))
            .attr('font-size', '10px')
            .attr('opacity', 0.9);
        
        // Update background rectangles
        edgeLabelUpdate.each(function(d) {
            const group = d3.select(this);
            const text = group.select('.edge-label-text');
            const background = group.select('.edge-label-background');
            
            // Get text dimensions
            const bbox = text.node().getBBox();
            const padding = 3;
            
            // Update background size and position
            background
                .attr('x', bbox.x - padding)
                .attr('y', bbox.y - padding)
                .attr('width', bbox.width + padding * 2)
                .attr('height', bbox.height + padding * 2);
        });
        
        this.edgeLabelSelection = edgeLabelUpdate;
    }
    
    /**
     * Render node labels - now showing permanent labels for all nodes
     */
    renderLabels() {
        // Always show labels for all nodes
        const labelSelection = this.labelGroup
            .selectAll('.label-group')
            .data(this.state.filteredData.nodes, d => d.address);
        
        // Remove old label groups
        labelSelection.exit().remove();
        
        // Add new label groups
        const labelEnter = labelSelection.enter()
            .append('g')
            .attr('class', 'label-group');
        
        // Add background rectangle for better readability
        labelEnter.append('rect')
            .attr('class', 'label-background')
            .attr('fill', '#000000')
            .attr('fill-opacity', 0.85)
            .attr('stroke', '#ffffff')
            .attr('stroke-width', 1)
            .attr('stroke-opacity', 0.3)
            .attr('rx', 3)
            .attr('ry', 3);
        
        // Add the text label
        labelEnter.append('text')
            .attr('class', 'label-text')
            .attr('text-anchor', 'middle')
            .attr('font-family', this.config.nodes.labelFont)
            .attr('font-size', '14px')
            .attr('fill', '#ffffff')
            .attr('font-weight', 'bold')
            .attr('pointer-events', 'none')
            .style('user-select', 'none');
        
        // Merge selections
        const labelUpdate = labelEnter.merge(labelSelection);
        
        // Update label text and styling
        labelUpdate.select('.label-text')
            .selectAll('tspan')
            .remove();
            
        const graphInstance = this;
        labelUpdate.select('.label-text')
            .each(function(d) {
                const text = d3.select(this);
                const labelText = graphInstance.getNodeLabel(d);
                const lines = labelText.split('\n');
                
                lines.forEach((line, i) => {
                    text.append('tspan')
                        .attr('x', 0)
                        .attr('dy', i === 0 ? 0 : '1.2em')
                        .text(line)
                        .attr('fill', '#ffffff')
                        .attr('font-weight', 'bold');
                });
            })
            .attr('font-size', '14px')
            .attr('fill', '#ffffff')
            .attr('opacity', 1);
        
        // Update background rectangles with collision detection
        labelUpdate.each(function(d) {
            const group = d3.select(this);
            const text = group.select('.label-text');
            const background = group.select('.label-background');
            
            // Get text dimensions
            const bbox = text.node().getBBox();
            const padding = 4;
            
            // Update background size and position
            background
                .attr('x', bbox.x - padding)
                .attr('y', bbox.y - padding)
                .attr('width', bbox.width + padding * 2)
                .attr('height', bbox.height + padding * 2);
        });
        
        // Apply collision detection for better label positioning
        this.applyLabelCollisionDetection(labelUpdate);
        
        this.labelSelection = labelUpdate;
    }
    
    /**
     * Apply collision detection to prevent label overlaps
     */
    applyLabelCollisionDetection(labelSelection) {
        const labels = labelSelection.nodes();
        const nodeCount = this.state.filteredData.nodes.length;
        
        // Only apply collision detection for smaller graphs to avoid performance issues
        if (nodeCount > 100) return;
        
        // Simple collision detection - adjust label position if overlapping
        for (let i = 0; i < labels.length; i++) {
            for (let j = i + 1; j < labels.length; j++) {
                const label1 = d3.select(labels[i]);
                const label2 = d3.select(labels[j]);
                
                const data1 = label1.datum();
                const data2 = label2.datum();
                
                if (!data1 || !data2 || !data1.x || !data1.y || !data2.x || !data2.y) continue;
                
                const distance = Math.sqrt(
                    Math.pow(data1.x - data2.x, 2) + Math.pow(data1.y - data2.y, 2)
                );
                
                // If labels are too close, adjust their vertical offset
                if (distance < 60) {
                    const angle = Math.atan2(data2.y - data1.y, data2.x - data1.x);
                    const offsetDistance = 30;
                    
                    // Store offset for use in tick function
                    data1.labelOffsetX = Math.cos(angle + Math.PI) * offsetDistance * 0.3;
                    data1.labelOffsetY = Math.sin(angle + Math.PI) * offsetDistance * 0.3;
                    
                    data2.labelOffsetX = Math.cos(angle) * offsetDistance * 0.3;
                    data2.labelOffsetY = Math.sin(angle) * offsetDistance * 0.3;
                }
            }
        }
    }
    
    /**
     * Simulation tick handler
     */
    tick() {
        // Update node positions
        if (this.nodeSelection) {
            this.nodeSelection
                .attr('transform', d => `translate(${d.x}, ${d.y})`);
        }
        
        // Update edge positions (now groups containing multiple lines)
        if (this.edgeSelection) {
            this.edgeSelection.selectAll('line')
                .attr('x1', d => d.source.x)
                .attr('y1', d => d.source.y)
                .attr('x2', d => d.target.x)
                .attr('y2', d => d.target.y);
        }
        
        // Update label group positions with collision offsets
        if (this.labelSelection) {
            this.labelSelection
                .attr('transform', d => {
                    // Ensure coordinates exist before using them
                    const x = d.x || 0;
                    const y = d.y || 0;
                    const nodeRadius = this.getNodeRadius(d);
                    const baseOffsetY = nodeRadius + 18; // Position below the node
                    
                    // Apply collision detection offsets if they exist
                    const offsetX = d.labelOffsetX || 0;
                    const offsetY = baseOffsetY + (d.labelOffsetY || 0);
                    
                    return `translate(${x + offsetX}, ${y + offsetY})`;
                });
            
            // Update text position within each label group
            this.labelSelection.select('.label-text')
                .attr('x', 0)
                .attr('y', 0);
        }
        
        // Update edge label positions
        if (this.edgeLabelSelection) {
            this.edgeLabelSelection
                .attr('transform', d => {
                    // Ensure coordinates exist before using them
                    const sourceX = d.source?.x || 0;
                    const sourceY = d.source?.y || 0;
                    const targetX = d.target?.x || 0;
                    const targetY = d.target?.y || 0;
                    
                    const midX = (sourceX + targetX) / 2;
                    const midY = (sourceY + targetY) / 2;
                    return `translate(${midX}, ${midY})`;
                });
        }
    }
    
    /**
     * Simulation end handler
     */
    onSimulationEnd() {
        console.log('Force simulation completed');
        this.hideLoading();
    }
    
    /**
     * Handle zoom events
     */
    handleZoom(event) {
        const { transform } = event;
        this.state.viewTransform = transform;
        this.state.zoomLevel = transform.k;
        
        // Apply zoom transform to main group
        this.mainGroup.attr('transform', transform);
        
        // Keep labels visible at all zoom levels for now
        
        // Trigger viewport change callback
        this.callbacks.onViewportChange(transform, this.state.zoomLevel);
    }
    
    /**
     * Update label visibility based on zoom level
     */
    updateLabelVisibility() {
        // Labels are now always visible, but we adjust their opacity based on zoom and graph density
        if (this.labelSelection) {
            this.labelSelection
                .select('.label-text')
                .attr('opacity', this.getLabelOpacity())
                .attr('font-size', this.getLabelFontSize());
        }
    }
    
    /**
     * Create drag behavior for nodes with position locking
     */
    createDragBehavior() {
        return d3.drag()
            .on('start', (event, d) => {
                // Only restart simulation if not paused and dragging actively
                if (!event.active && !this.state.simulationPaused) {
                    this.simulation.alphaTarget(0.1).restart();
                }
                d.fx = d.x;
                d.fy = d.y;
                d.__dragging = true;
            })
            .on('drag', (event, d) => {
                d.fx = event.x;
                d.fy = event.y;
            })
            .on('end', (event, d) => {
                d.__dragging = false;
                
                // Check if user wants to lock position (double-click during drag or ctrl+drag)
                const shouldLock = event.sourceEvent?.ctrlKey || event.sourceEvent?.metaKey || d.__lockOnDrop;
                
                if (shouldLock) {
                    // Lock the node position
                    this.state.lockedNodes.add(d.address);
                    // Keep fixed position
                    // d.fx and d.fy remain set
                } else {
                    // Release position for normal physics
                    d.fx = null;
                    d.fy = null;
                }
                
                if (!event.active && !this.state.simulationPaused) {
                    this.simulation.alphaTarget(0);
                }
                
                // Update visual indication of locked nodes
                this.updateNodeLockVisualization();
            });
    }
    
    /**
     * Setup global event handlers
     */
    setupEventHandlers() {
        // Handle window resize
        window.addEventListener('resize', () => {
            this.handleResize();
        });
        
        // Handle keyboard shortcuts
        document.addEventListener('keydown', (event) => {
            this.handleKeyDown(event);
        });
        
        // Handle clicks outside the graph to clear selection
        this.svg.on('click', (event) => {
            if (event.target === event.currentTarget) {
                this.clearSelection();
            }
        });
    }
    
    /**
     * Handle window resize
     */
    handleResize() {
        const containerRect = this.container.node().getBoundingClientRect();
        const newWidth = containerRect.width;
        const newHeight = containerRect.height;
        
        if (newWidth !== this.config.width || newHeight !== this.config.height) {
            this.config.width = newWidth;
            this.config.height = newHeight;
            
            this.svg
                .attr('width', newWidth)
                .attr('height', newHeight)
                .attr('viewBox', [0, 0, newWidth, newHeight]);
            
            // Update center force
            this.simulation.force('center', d3.forceCenter(
                newWidth / 2, 
                newHeight / 2));
            
            console.log(`Graph resized to ${newWidth}x${newHeight}`);
        }
    }
    
    /**
     * Handle keyboard shortcuts
     */
    handleKeyDown(event) {
        switch (event.key) {
            case 'Escape':
                this.clearSelection();
                this.clearHighlight();
                break;
            case 'f':
            case 'F':
                if (event.ctrlKey || event.metaKey) {
                    event.preventDefault();
                    this.fitToView();
                }
                break;
            case ' ': // Spacebar to toggle simulation
                event.preventDefault();
                this.toggleSimulation();
                break;
            case 'l':
            case 'L':
                if (event.ctrlKey || event.metaKey) {
                    event.preventDefault();
                    // Lock all selected nodes
                    this.state.selectedNodes.forEach(address => {
                        const node = this.state.filteredData.nodes.find(n => n.address === address);
                        if (node) this.lockNode(node);
                    });
                }
                break;
            case 'u':
            case 'U':
                if (event.ctrlKey || event.metaKey) {
                    event.preventDefault();
                    // Unlock all nodes
                    this.state.lockedNodes.forEach(address => {
                        const node = this.state.filteredData.nodes.find(n => n.address === address);
                        if (node) this.unlockNode(node);
                    });
                }
                break;
            case '+':
            case '=':
                if (event.ctrlKey || event.metaKey) {
                    event.preventDefault();
                    this.zoomIn();
                }
                break;
            case '-':
                if (event.ctrlKey || event.metaKey) {
                    event.preventDefault();
                    this.zoomOut();
                }
                break;
        }
    }
    
    // Event Handlers
    
    handleNodeClick(event, nodeData) {
        event.stopPropagation();
        
        // Toggle selection
        if (this.state.selectedNodes.has(nodeData.address)) {
            this.state.selectedNodes.delete(nodeData.address);
        } else {
            if (!event.shiftKey) {
                this.state.selectedNodes.clear();
            }
            this.state.selectedNodes.add(nodeData.address);
        }
        
        this.updateNodeSelection();
        this.callbacks.onNodeClick(nodeData, event, this.state.selectedNodes);
    }
    
    handleNodeDoubleClick(event, nodeData) {
        event.stopPropagation();
        
        // Toggle node position lock on double-click
        if (this.state.lockedNodes.has(nodeData.address)) {
            this.unlockNode(nodeData);
        } else {
            this.lockNode(nodeData);
        }
        
        this.callbacks.onNodeDoubleClick(nodeData, event);
    }
    
    handleNodeMouseOver(event, nodeData) {
        // Show tooltip
        this.showTooltip(event, this.createNodeTooltip(nodeData));
        
        // Highlight connected nodes and edges
        this.highlightConnectedElements(nodeData.address);
    }
    
    handleNodeMouseOut(event, nodeData) {
        // Hide tooltip
        this.hideTooltip();
        
        // Clear highlight
        this.clearHighlight();
    }
    
    handleEdgeClick(event, edgeData) {
        event.stopPropagation();
        this.callbacks.onEdgeClick(edgeData, event);
    }
    
    handleEdgeMouseOver(event, edgeData) {
        // Show edge tooltip
        this.showTooltip(event, this.createEdgeTooltip(edgeData));
        
        // Highlight edge and connected nodes
        this.highlightEdge(edgeData);
    }
    
    handleEdgeMouseOut(event, edgeData) {
        this.hideTooltip();
        this.clearHighlight();
    }
    
    // Default callback implementations
    
    defaultNodeClick(nodeData, event, selectedNodes) {
        console.log('Node clicked:', nodeData.address, 'Selected nodes:', selectedNodes.size);
    }
    
    defaultNodeDoubleClick(nodeData, event) {
        console.log('Node double-clicked:', nodeData.address);
        // Center on node
        this.centerOnNode(nodeData);
    }
    
    defaultEdgeClick(edgeData, event) {
        console.log('Edge clicked:', edgeData.source, '->', edgeData.target);
    }
    
    // Visual property calculation methods
    
    getNodeRadius(nodeData) {
        const baseRadius = this.config.nodes.minRadius;
        const maxRadius = this.config.nodes.maxRadius;
        
        // Calculate radius based on node properties
        let sizeFactor = 0.3; // Default smaller
        
        if (nodeData.suggestedSize !== undefined) {
            // Use suggested size from D3Formatter
            sizeFactor = Math.min(1, nodeData.suggestedSize / 100);
        } else {
            // Calculate based on balance primarily, then degree
            if (nodeData.balance?.free) {
                // Find min/max balances from all nodes for proper scaling
                const allBalances = this.state.filteredData.nodes
                    .map(n => n.balance?.free ? BigInt(n.balance.free) : BigInt(0))
                    .filter(b => b > BigInt(0));
                
                if (allBalances.length > 0) {
                    const minBalance = allBalances.reduce((a, b) => a < b ? a : b);
                    const maxBalance = allBalances.reduce((a, b) => a > b ? a : b);
                    const balanceScale = FormatUtils.getVisualScale(nodeData.balance.free, minBalance, maxBalance);
                    sizeFactor = 0.3 + balanceScale * 0.7;
                }
            }
            
            // Add a small bonus for high degree nodes
            if (nodeData.degree !== undefined && nodeData.degree > 10) {
                sizeFactor = Math.min(1, sizeFactor + 0.1);
            }
        }
        
        return baseRadius + (maxRadius - baseRadius) * sizeFactor;
    }
    
    getNodeColor(nodeData) {
        // Check if this is an exchange node based on Merkle data
        if (nodeData.merkle?.tag_type === 'Exchange') {
            return '#E91E63'; // Bright pink/magenta for exchanges (more prominent)
        }
        
        if (nodeData.suggestedColor) {
            return nodeData.suggestedColor;
        }
        
        // Color based on node type
        switch (nodeData.nodeType) {
            case 'center': return this.config.colors.exchange; // Target node
            case 'exchange': return this.config.colors.exchange;
            case 'validator': return this.config.colors.validator;
            case 'mixer': return this.config.colors.mixer;
            default: return this.config.colors.neutral;
        }
    }
    
    getNodeStrokeColor(nodeData) {
        if (this.state.selectedNodes.has(nodeData.address)) {
            return this.config.colors.high;
        }
        
        if (this.state.lockedNodes.has(nodeData.address)) {
            return '#FFD700'; // Gold color for locked nodes
        }
        
        if (this.state.highlightedNodes.has(nodeData.address)) {
            return this.config.colors.medium;
        }
        
        return '#ffffff';
    }
    
    getNodeStrokeWidth(nodeData) {
        if (this.state.selectedNodes.has(nodeData.address)) {
            return this.config.nodes.strokeWidth * 2;
        }
        
        if (this.state.lockedNodes.has(nodeData.address)) {
            return this.config.nodes.strokeWidth * 2.5;
        }
        
        if (this.state.highlightedNodes.has(nodeData.address)) {
            return this.config.nodes.strokeWidth * 1.5;
        }
        
        return this.config.nodes.strokeWidth;
    }
    
    getNodeOpacity(nodeData) {
        return nodeData.opacity || 0.9;
    }
    
    shouldShowNodeIcon(nodeData) {
        return ['exchange', 'validator', 'mixer'].includes(nodeData.nodeType);
    }
    
    getNodeIcon(nodeData) {
        switch (nodeData.nodeType) {
            case 'exchange': return '⬌';
            case 'validator': return '✓';
            case 'mixer': return '⚬';
            default: return '';
        }
    }
    
    getEdgeWidth(edgeData) {
        const baseWidth = this.config.edges.minWidth;
        const maxWidth = this.config.edges.maxWidth;
        
        let finalWidth = baseWidth;
        
        if (edgeData.suggestedWidth !== undefined) {
            finalWidth = edgeData.suggestedWidth;
        }
        // Calculate width based on volume using FormatUtils for better scaling
        else if (edgeData.volume && edgeData.volume !== '0') {
            // Find min/max volumes from all edges for proper scaling
            const allVolumes = this.state.filteredData.links
                .map(l => l.volume ? BigInt(l.volume) : BigInt(0))
                .filter(v => v > BigInt(0));
            
            if (allVolumes.length > 0) {
                const minVolume = allVolumes.reduce((a, b) => a < b ? a : b);
                const maxVolume = allVolumes.reduce((a, b) => a > b ? a : b);
                const scale = FormatUtils.getVisualScale(edgeData.volume, minVolume, maxVolume);
                finalWidth = baseWidth + (maxWidth - baseWidth) * scale;
            }
        }
        
        return finalWidth;
    }
    
    getEdgeHighlightWidth(edgeData) {
        // Red highlight should be wider than the main edge for visibility
        return this.getEdgeWidth(edgeData) + 4;
    }
    
    /**
     * Interpolate between two colors
     */
    interpolateColor(color1, color2, t) {
        // Convert hex to RGB
        const c1 = this.hexToRgb(color1);
        const c2 = this.hexToRgb(color2);
        
        // Interpolate
        const r = Math.round(c1.r + (c2.r - c1.r) * t);
        const g = Math.round(c1.g + (c2.g - c1.g) * t);
        const b = Math.round(c1.b + (c2.b - c1.b) * t);
        
        // Convert back to hex
        return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
    }
    
    /**
     * Convert hex color to RGB
     */
    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 0, g: 0, b: 0 };
    }
    
    getEdgeColor(edgeData) {
        // Store the threshold status for highlighting but don't override color here
        if (this.state.currentFilters?.volumeThreshold) {
            const threshold = this.state.currentFilters.volumeThreshold;
            if (edgeData.volume) {
                try {
                    // Handle decimal values by converting to string and removing decimal part
                    const edgeVolumeStr = edgeData.volume.toString();
                    const thresholdStr = threshold.toString();
                    
                    // Remove decimal part if present
                    const edgeVolumeBigInt = BigInt(edgeVolumeStr.includes('.') ? edgeVolumeStr.split('.')[0] : edgeVolumeStr);
                    const thresholdBigInt = BigInt(thresholdStr.includes('.') ? thresholdStr.split('.')[0] : thresholdStr);
                    
                    const isAboveThreshold = edgeVolumeBigInt >= thresholdBigInt;
                    
                    // Store threshold status for use in other methods but get base color first
                    edgeData._aboveThreshold = isAboveThreshold;
                } catch (error) {
                    console.error('Error in volume threshold comparison:', error, {
                        edgeVolume: edgeData.volume,
                        threshold: threshold
                    });
                }
            }
        }
        
        // Determine base color first
        let baseColor = '#666666'; // default
        
        // Check for suspicious patterns
        if (edgeData.suspiciousPattern) {
            baseColor = this.config.colors.high;
        }
        // Check for suggested color (blue/green edges)
        else if (edgeData.suggestedColor) {
            baseColor = edgeData.suggestedColor;
        }
        // Color based on volume - higher volume = more alert color
        else if (edgeData.volume && edgeData.volume !== '0') {
            const allVolumes = this.state.filteredData.links
                .map(l => {
                    if (!l.volume) return BigInt(0);
                    // Handle decimal values by removing decimal part
                    const volumeStr = l.volume.toString();
                    const integerPart = volumeStr.includes('.') ? volumeStr.split('.')[0] : volumeStr;
                    return BigInt(integerPart);
                })
                .filter(v => v > BigInt(0));
            
            if (allVolumes.length > 0) {
                const minVolume = allVolumes.reduce((a, b) => a < b ? a : b);
                const maxVolume = allVolumes.reduce((a, b) => a > b ? a : b);
                
                // Convert current edge volume to BigInt safely
                const currentVolumeStr = edgeData.volume.toString();
                const currentVolumeInt = currentVolumeStr.includes('.') ? currentVolumeStr.split('.')[0] : currentVolumeStr;
                const currentVolume = BigInt(currentVolumeInt);
                
                const scale = FormatUtils.getVisualScale(currentVolume, minVolume, maxVolume);
                
                // Smooth gradient from gray to yellow to orange to red based on volume
                if (scale < 0.25) {
                    baseColor = '#666666'; // Very low volume - gray
                } else if (scale < 0.5) {
                    // Gradient from gray to yellow
                    const t = (scale - 0.25) * 4;
                    baseColor = this.interpolateColor('#666666', '#FFC107', t);
                } else if (scale < 0.75) {
                    // Gradient from yellow to orange
                    const t = (scale - 0.5) * 4;
                    baseColor = this.interpolateColor('#FFC107', '#FF9800', t);
                } else {
                    // Gradient from orange to red
                    const t = (scale - 0.75) * 4;
                    baseColor = this.interpolateColor('#FF9800', '#F44336', t);
                }
            }
        }
        
        // Return the base color unchanged - highlighting is handled by separate red outline
        return baseColor;
    }
    
    getEdgeOpacity(edgeData) {
        if (edgeData.suggestedOpacity !== undefined) {
            return edgeData.suggestedOpacity;
        }
        
        // Scale opacity based on volume for better visual hierarchy
        if (edgeData.volume && edgeData.volume !== '0') {
            const allVolumes = this.state.filteredData.links
                .map(l => l.volume ? BigInt(l.volume) : BigInt(0))
                .filter(v => v > BigInt(0));
            
            if (allVolumes.length > 0) {
                const minVolume = allVolumes.reduce((a, b) => a < b ? a : b);
                const maxVolume = allVolumes.reduce((a, b) => a > b ? a : b);
                const scale = FormatUtils.getVisualScale(edgeData.volume, minVolume, maxVolume);
                // Minimum opacity of 0.3, maximum of 0.9
                return 0.3 + scale * 0.6;
            }
        }
        
        return this.config.edges.opacity;
    }
    
    getEdgeMarker(edgeData) {
        return edgeData.bidirectional ? null : 'url(#arrow)';
    }
    
    getEdgeDashArray(edgeData) {
        if (edgeData.suspiciousPattern) return '5,5';
        if (edgeData.edgeType === 'inferred') return '3,3';
        return null;
    }
    
    /**
     * Get text label for edge
     */
    getEdgeLabelText(edgeData) {
        // Show formatted transfer info if we have both count and volume
        if (edgeData.count && edgeData.volume && edgeData.volume !== '0') {
            return FormatUtils.formatTransfer(edgeData.count, edgeData.volume);
        }
        
        // Show just volume if available
        if (edgeData.volume && edgeData.volume !== '0') {
            return FormatUtils.formatBalance(edgeData.volume);
        }
        
        // Show transaction count if available
        if (edgeData.count && edgeData.count > 1) {
            return `${edgeData.count} txs`;
        }
        
        // Default to empty string for single transactions with no volume
        return '';
    }
    
    shouldShowLabel(nodeData) {
        // All nodes now show labels permanently, but this method can be used for special styling
        return true;
    }
    
    getNodeLabel(nodeData) {
        // Always show abbreviated address - first 6 + last 4 characters
        const addr = nodeData.address;
        const abbreviatedAddr = `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
        
        // Get balance from various possible formats
        let balance = null;
        if (nodeData.balance?.free) {
            balance = nodeData.balance.free;
        } else if (nodeData.balance && typeof nodeData.balance === 'string') {
            balance = nodeData.balance;
        } else if (nodeData.free_balance) {
            balance = nodeData.free_balance;
        }
        
        // Format balance if available
        let formattedBalance = '';
        if (balance && balance !== '0') {
            // Check if balance is already in DOT format (has decimal point and is < 1e10)
            const numBalance = parseFloat(balance);
            if (!isNaN(numBalance)) {
                if (numBalance < 1e10 && balance.includes('.')) {
                    // Already in DOT format
                    formattedBalance = `${numBalance.toFixed(2)} DOT`;
                } else {
                    // Use FormatUtils for planck conversion
                    formattedBalance = FormatUtils.formatBalance(balance);
                }
            }
        }
        
        // Extract identity string from various possible formats
        let identityString = null;
        
        // Handle different identity formats
        if (typeof nodeData.identity === 'string') {
            identityString = nodeData.identity;
        } else if (typeof nodeData.identity?.display === 'string') {
            identityString = nodeData.identity.display;
        } else if (typeof nodeData.identity?.display?.display === 'string') {
            identityString = nodeData.identity.display.display;
        } else if (nodeData.identity && typeof nodeData.identity === 'object') {
            // Try to find any non-empty string value in the identity object
            const findString = (obj) => {
                for (const key in obj) {
                    if (typeof obj[key] === 'string' && obj[key].trim() !== '') {
                        return obj[key];
                    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                        const result = findString(obj[key]);
                        if (result) return result;
                    }
                }
                return null;
            };
            identityString = findString(nodeData.identity);
        }
        
        // Check for Merkle Science tags (exchange identification)
        let exchangeTag = null;
        if (nodeData.merkle?.tag_name) {
            exchangeTag = nodeData.merkle.tag_name;
            // Add tag type for context
            if (nodeData.merkle.tag_type === 'Exchange') {
                exchangeTag = `🏦 ${exchangeTag}`;
            }
        }
        
        // If there's an identity or exchange tag, show it with balance
        if (identityString || exchangeTag) {
            // Prefer exchange tag over identity if both exist
            const displayName = exchangeTag || identityString;
            if (formattedBalance) {
                return `${displayName}\n${formattedBalance}`;
            }
            return `${displayName}\n${abbreviatedAddr}`;
        }
        
        // Show address with balance (always show balance if available)
        if (formattedBalance) {
            return `${abbreviatedAddr}\n${formattedBalance}`;
        }
        
        return abbreviatedAddr;
    }
    
    /**
     * Get font size for labels based on zoom level
     */
    getLabelFontSize() {
        // Adjust font size based on zoom level for better readability
        const baseSize = 10;
        const scaleFactor = Math.max(0.8, Math.min(1.5, this.state.zoomLevel));
        return `${Math.round(baseSize * scaleFactor)}px`;
    }
    
    /**
     * Get label opacity based on zoom level and node count
     */
    getLabelOpacity() {
        const nodeCount = this.state.filteredData.nodes.length;
        
        // Reduce opacity for large graphs to reduce visual clutter
        if (nodeCount > 200) {
            return Math.max(0.6, this.state.zoomLevel * 0.8);
        } else if (nodeCount > 100) {
            return Math.max(0.7, this.state.zoomLevel * 0.9);
        }
        
        return Math.max(0.8, this.state.zoomLevel * 0.95);
    }
    
    // Tooltip methods
    
    createNodeTooltip(nodeData) {
        const parts = [];
        
        parts.push(`<strong>Address:</strong> ${nodeData.address.substring(0, 12)}...`);
        
        if (nodeData.identity?.display) {
            parts.push(`<strong>Identity:</strong> ${nodeData.identity.display}`);
        }
        
        // Add Merkle Science exchange identification
        if (nodeData.merkle) {
            parts.push('<strong>--- Exchange Identification ---</strong>');
            if (nodeData.merkle.tag_name) {
                parts.push(`<strong>Exchange:</strong> ${nodeData.merkle.tag_name}`);
            }
            if (nodeData.merkle.tag_type) {
                parts.push(`<strong>Tag Type:</strong> ${nodeData.merkle.tag_type}`);
            }
            if (nodeData.merkle.tag_subtype) {
                parts.push(`<strong>Compliance:</strong> ${nodeData.merkle.tag_subtype}`);
            }
            if (nodeData.merkle.address_type) {
                parts.push(`<strong>Address Type:</strong> ${nodeData.merkle.address_type}`);
            }
        }
        
        if (nodeData.nodeType) {
            parts.push(`<strong>Type:</strong> ${nodeData.nodeType}`);
        }
        
        if (nodeData.balance?.free) {
            try {
                const formattedBalance = FormatUtils.formatBalance(nodeData.balance.free);
                parts.push(`<strong>Balance:</strong> ${formattedBalance}`);
            } catch (e) {
                console.warn('Error converting balance:', e);
            }
        }
        
        if (nodeData.degree !== undefined) {
            parts.push(`<strong>Connections:</strong> ${nodeData.degree}`);
        }
        
        if (nodeData.totalVolume && nodeData.totalVolume !== '0') {
            try {
                const formattedVolume = FormatUtils.formatBalance(nodeData.totalVolume);
                parts.push(`<strong>Total Volume:</strong> ${formattedVolume}`);
            } catch (e) {
                console.warn('Error converting volume:', e);
            }
        }
        
        // Risk score removed - not implemented yet
        
        return parts.join('<br>');
    }
    
    createEdgeTooltip(edgeData) {
        const parts = [];
        
        const sourceAddr = (edgeData.source.address || edgeData.source).substring(0, 12);
        const targetAddr = (edgeData.target.address || edgeData.target).substring(0, 12);
        parts.push(`<strong>From:</strong> ${sourceAddr}...`);
        parts.push(`<strong>To:</strong> ${targetAddr}...`);
        
        if (edgeData.count) {
            parts.push(`<strong>Transactions:</strong> ${edgeData.count}`);
        }
        
        if (edgeData.volume && edgeData.volume !== '0') {
            const formattedVolume = FormatUtils.formatBalance(edgeData.volume);
            parts.push(`<strong>Volume:</strong> ${formattedVolume}`);
        }
        
        if (edgeData.firstTransfer) {
            const date = new Date(edgeData.firstTransfer * 1000);
            parts.push(`<strong>First:</strong> ${date.toLocaleDateString()}`);
        }
        
        if (edgeData.lastTransfer) {
            const date = new Date(edgeData.lastTransfer * 1000);
            parts.push(`<strong>Last:</strong> ${date.toLocaleDateString()}`);
        }
        
        return parts.join('<br>');
    }
    
    showTooltip(event, content) {
        this.tooltip
            .style('visibility', 'visible')
            .html(content)
            .style('left', (event.pageX + 10) + 'px')
            .style('top', (event.pageY - 10) + 'px');
    }
    
    hideTooltip() {
        this.tooltip.style('visibility', 'hidden');
    }
    
    // Highlighting methods
    
    highlightConnectedElements(nodeAddress) {
        this.clearHighlight();
        
        // Highlight the node itself
        this.state.highlightedNodes.add(nodeAddress);
        
        // Find connected nodes and edges
        this.state.filteredData.links.forEach(link => {
            const sourceId = link.source.address || link.source;
            const targetId = link.target.address || link.target;
            
            if (sourceId === nodeAddress) {
                this.state.highlightedNodes.add(targetId);
            } else if (targetId === nodeAddress) {
                this.state.highlightedNodes.add(sourceId);
            }
        });
        
        this.updateVisualization();
    }
    
    highlightEdge(edgeData) {
        this.clearHighlight();
        
        const sourceId = edgeData.source.address || edgeData.source;
        const targetId = edgeData.target.address || edgeData.target;
        
        this.state.highlightedNodes.add(sourceId);
        this.state.highlightedNodes.add(targetId);
        
        this.updateVisualization();
    }
    
    clearHighlight() {
        this.state.highlightedNodes.clear();
        this.updateVisualization();
    }
    
    updateNodeSelection() {
        if (this.nodeSelection) {
            this.nodeSelection
                .select('circle')
                .attr('stroke', d => this.getNodeStrokeColor(d))
                .attr('stroke-width', d => this.getNodeStrokeWidth(d));
        }
    }
    
    updateVisualization() {
        if (this.nodeSelection) {
            this.nodeSelection
                .select('circle')
                .attr('stroke', d => this.getNodeStrokeColor(d))
                .attr('stroke-width', d => this.getNodeStrokeWidth(d));
        }
    }
    
    clearSelection() {
        this.state.selectedNodes.clear();
        this.updateNodeSelection();
    }
    
    /**
     * Lock a node's position
     */
    lockNode(nodeData) {
        this.state.lockedNodes.add(nodeData.address);
        nodeData.fx = nodeData.x;
        nodeData.fy = nodeData.y;
        this.updateNodeLockVisualization();
        console.log(`Node ${nodeData.address.substring(0, 8)}... locked`);
    }
    
    /**
     * Unlock a node's position
     */
    unlockNode(nodeData) {
        this.state.lockedNodes.delete(nodeData.address);
        nodeData.fx = null;
        nodeData.fy = null;
        this.updateNodeLockVisualization();
        console.log(`Node ${nodeData.address.substring(0, 8)}... unlocked`);
    }
    
    /**
     * Update visual indication of locked nodes
     */
    updateNodeLockVisualization() {
        if (this.nodeSelection) {
            this.nodeSelection
                .select('circle')
                .attr('stroke', d => this.getNodeStrokeColor(d))
                .attr('stroke-width', d => this.getNodeStrokeWidth(d));
        }
    }
    
    /**
     * Pause the force simulation
     */
    pauseSimulation() {
        this.state.simulationPaused = true;
        this.simulation.alphaTarget(0).stop();
        console.log('Force simulation paused');
    }
    
    /**
     * Resume the force simulation
     */
    resumeSimulation() {
        this.state.simulationPaused = false;
        this.simulation.alpha(0.3).restart();
        console.log('Force simulation resumed');
    }
    
    /**
     * Toggle simulation pause/resume
     */
    toggleSimulation() {
        if (this.state.simulationPaused) {
            this.resumeSimulation();
        } else {
            this.pauseSimulation();
        }
        return !this.state.simulationPaused;
    }
    
    // Utility methods
    
    showLoading() {
        this.state.isLoading = true;
        this.loadingIndicator.style('display', 'block');
    }
    
    hideLoading() {
        this.state.isLoading = false;
        this.loadingIndicator.style('display', 'none');
    }
    
    fitToView() {
        if (this.state.filteredData.nodes.length === 0) return;
        
        // Calculate bounding box of all nodes
        const bounds = this.calculateNodeBounds();
        
        // Calculate transform to fit the graph
        const width = this.config.width;
        const height = this.config.height;
        const margin = 50;
        
        const scale = Math.min(
            (width - margin * 2) / (bounds.width || 1),
            (height - margin * 2) / (bounds.height || 1)
        );
        
        const centerX = width / 2 - (bounds.centerX * scale);
        const centerY = height / 2 - (bounds.centerY * scale);
        
        const transform = d3.zoomIdentity
            .translate(centerX, centerY)
            .scale(scale);
        
        this.svg.transition()
            .duration(750)
            .call(this.zoom.transform, transform);
    }
    
    calculateNodeBounds() {
        const nodes = this.state.filteredData.nodes;
        if (nodes.length === 0) return { width: 0, height: 0, centerX: 0, centerY: 0 };
        
        const xs = nodes.map(d => d.x || 0);
        const ys = nodes.map(d => d.y || 0);
        
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        
        return {
            width: maxX - minX,
            height: maxY - minY,
            centerX: (minX + maxX) / 2,
            centerY: (minY + maxY) / 2
        };
    }
    
    centerOnNode(nodeData) {
        if (!nodeData.x || !nodeData.y) return;
        
        const transform = d3.zoomIdentity
            .translate(
                this.config.width / 2 - nodeData.x * this.state.zoomLevel,
                this.config.height / 2 - nodeData.y * this.state.zoomLevel
            )
            .scale(this.state.zoomLevel);
        
        this.svg.transition()
            .duration(500)
            .call(this.zoom.transform, transform);
    }
    
    zoomIn() {
        this.svg.transition()
            .duration(300)
            .call(this.zoom.scaleBy, 1.5);
    }
    
    zoomOut() {
        this.svg.transition()
            .duration(300)
            .call(this.zoom.scaleBy, 1 / 1.5);
    }
    
    // Public API methods
    
    /**
     * Set filters for the graph data
     * @param {Object} filters - Filter configuration
     */
    setFilters(filters) {
        this.state.currentFilters = { ...filters };
        this.applyFilters();
        this.updateSimulationParameters();
        this.render();
    }
    
    /**
     * Get current graph statistics
     * @returns {Object} Statistics object
     */
    getStatistics() {
        return {
            totalNodes: this.state.data.nodes.length,
            visibleNodes: this.state.filteredData.nodes.length,
            totalEdges: this.state.data.links.length,
            visibleEdges: this.state.filteredData.links.length,
            selectedNodes: this.state.selectedNodes.size,
            highlightedNodes: this.state.highlightedNodes.size,
            ...this.metrics
        };
    }
    
    /**
     * Export graph data in various formats
     * @param {string} format - Export format ('json', 'csv')
     * @returns {string} Exported data
     */
    exportData(format = 'json') {
        switch (format.toLowerCase()) {
            case 'json':
                return JSON.stringify(this.state.filteredData, null, 2);
            case 'csv':
                return this.exportToCSV();
            default:
                throw new Error(`Unsupported export format: ${format}`);
        }
    }
    
    exportToCSV() {
        const nodeHeaders = ['address', 'nodeType', 'balance', 'degree', 'riskScore'];
        const edgeHeaders = ['source', 'target', 'volume', 'count', 'edgeType'];
        
        let csv = 'NODES\n';
        csv += nodeHeaders.join(',') + '\n';
        
        this.state.filteredData.nodes.forEach(node => {
            const row = nodeHeaders.map(header => {
                let value = node[header] || '';
                if (header === 'balance' && node.balance?.free) {
                    value = FormatUtils.formatBalance(node.balance.free);
                }
                return `"${value}"`;
            });
            csv += row.join(',') + '\n';
        });
        
        csv += '\nEDGES\n';
        csv += edgeHeaders.join(',') + '\n';
        
        this.state.filteredData.links.forEach(edge => {
            const row = edgeHeaders.map(header => {
                let value = edge[header] || '';
                if (header === 'source') {
                    value = edge.source.address || edge.source;
                } else if (header === 'target') {
                    value = edge.target.address || edge.target;
                } else if (header === 'volume' && edge.volume) {
                    value = FormatUtils.formatBalance(edge.volume);
                }
                return `"${value}"`;
            });
            csv += row.join(',') + '\n';
        });
        
        return csv;
    }
    
    /**
     * Focus on a specific node
     */
    focusOnNode(nodeOrAddress) {
        const address = typeof nodeOrAddress === 'string' ? nodeOrAddress : nodeOrAddress.address;
        const node = this.state.filteredData.nodes.find(n => 
            (n.id || n.address) === address
        );
        
        if (!node || !node.x || !node.y) {
            console.warn('Node not found or not positioned:', address);
            return;
        }
        
        // Calculate zoom to fit the node and its immediate neighbors
        const k = 2; // Zoom level
        const duration = 750;
        
        this.svg.transition()
            .duration(duration)
            .call(
                this.zoom.transform,
                d3.zoomIdentity
                    .translate(this.config.width / 2, this.config.height / 2)
                    .scale(k)
                    .translate(-node.x, -node.y)
            );
        
        // Highlight the node temporarily
        const nodeElement = this.nodeSelection.filter(d => 
            (d.id || d.address) === address
        );
        
        if (!nodeElement.empty()) {
            const originalRadius = this.getNodeRadius(node);
            nodeElement.select('circle')
                .transition()
                .duration(300)
                .attr('r', originalRadius * 1.5)
                .attr('stroke-width', 4)
                .transition()
                .duration(300)
                .attr('r', originalRadius)
                .attr('stroke-width', 2);
        }
    }
    
    /**
     * Update node appearance after data changes
     */
    updateNodeAppearance() {
        if (!this.nodeSelection) return;
        
        this.nodeSelection.select('circle')
            .transition()
            .duration(300)
            .attr('r', d => this.getNodeRadius(d))
            .attr('fill', d => this.getNodeColor(d))
            .attr('stroke', d => this.getNodeStrokeColor(d))
            .attr('stroke-width', d => this.getNodeStrokeWidth(d));
        
        // Update labels if balance changed
        this.renderLabels();
    }
    
    /**
     * Update edge appearance after data changes
     */
    updateEdgeAppearance() {
        if (!this.edgeSelection) return;
        
        this.edgeSelection
            .transition()
            .duration(300)
            .attr('stroke', d => this.getEdgeColor(d))
            .attr('stroke-width', d => this.getEdgeWidth(d))
            .attr('stroke-opacity', d => this.getEdgeOpacity(d));
        
        // Update edge labels
        this.renderEdgeLabels();
    }
    
    /**
     * Destroy the visualization and clean up resources
     */
    destroy() {
        // Stop simulation
        this.simulation.stop();
        
        // Remove event listeners
        window.removeEventListener('resize', this.handleResize);
        
        // Clear DOM elements
        this.container.selectAll('*').remove();
        this.tooltip.remove();
        
        // Clear state
        this.state = {
            data: { nodes: [], links: [] },
            filteredData: { nodes: [], links: [] },
            selectedNodes: new Set(),
            highlightedNodes: new Set(),
            expandingNodes: new Set(),
            currentFilters: {},
            isLoading: false,
            hasMore: false,
            nextCursor: null,
            viewTransform: null,
            zoomLevel: 1
        };
        
        console.log('Graph visualization destroyed');
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PolkadotGraphVisualization;
} else if (typeof window !== 'undefined') {
    window.PolkadotGraphVisualization = PolkadotGraphVisualization;
}