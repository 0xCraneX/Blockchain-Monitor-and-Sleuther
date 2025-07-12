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
            
            // Force simulation settings
            forces: {
                charge: options.chargeStrength || -300,
                linkDistance: options.linkDistance || 80,
                linkStrength: options.linkStrength || 0.7,
                collideRadius: options.collideRadius || 30,
                alpha: options.alpha || 0.9,
                alphaDecay: options.alphaDecay || 0.028,
                velocityDecay: options.velocityDecay || 0.4
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
            currentFilters: {},
            isLoading: false,
            hasMore: false,
            nextCursor: null,
            viewTransform: null,
            zoomLevel: 1
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
        // Clear existing content
        this.container.selectAll('*').remove();
        
        // Create main SVG
        this.svg = this.container
            .append('svg')
            .attr('width', this.config.width)
            .attr('height', this.config.height)
            .attr('viewBox', [0, 0, this.config.width, this.config.height])
            .style('background-color', this.config.colors.background);
        
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
        this.nodeGroup = this.mainGroup.append('g').attr('class', 'nodes');
        this.labelGroup = this.mainGroup.append('g').attr('class', 'labels');
        this.overlayGroup = this.mainGroup.append('g').attr('class', 'overlays');
        
        // Create arrow markers for directed edges
        this.createArrowMarkers();
        
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
                .radius(d => this.getNodeRadius(d) + this.config.forces.collideRadius))
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
        
        // Apply risk score filter
        if (filters.riskThreshold !== undefined) {
            filteredNodes = filteredNodes.filter(node => 
                (node.riskScore || 0) <= filters.riskThreshold);
        }
        
        // Apply volume filter
        if (filters.minVolume && filters.minVolume !== '0') {
            const minVolume = BigInt(filters.minVolume);
            filteredLinks = filteredLinks.filter(link => 
                BigInt(link.volume || '0') >= minVolume);
        }
        
        // Apply balance filter
        if (filters.minBalance && filters.minBalance !== '0') {
            const minBalance = BigInt(filters.minBalance);
            filteredNodes = filteredNodes.filter(node => 
                BigInt(node.balance?.free || '0') >= minBalance);
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
        const connectedNodeIds = new Set();
        filteredLinks.forEach(link => {
            connectedNodeIds.add(link.source.address || link.source);
            connectedNodeIds.add(link.target.address || link.target);
        });
        
        filteredNodes = filteredNodes.filter(node => 
            connectedNodeIds.has(node.address));
        
        // Update filtered data
        this.state.filteredData = {
            nodes: filteredNodes,
            links: filteredLinks
        };
        
        console.log('Filters applied:', {
            originalNodes: this.state.data.nodes.length,
            filteredNodes: filteredNodes.length,
            originalLinks: this.state.data.links.length,
            filteredLinks: filteredLinks.length
        });
    }
    
    /**
     * Update force simulation parameters based on data size
     */
    updateSimulationParameters() {
        const nodeCount = this.state.filteredData.nodes.length;
        const linkCount = this.state.filteredData.links.length;
        
        // Adjust charge strength based on node count
        const chargeStrength = -Math.max(100, Math.min(1000, nodeCount * 5));
        this.simulation.force('charge').strength(chargeStrength);
        
        // Adjust link distance based on density
        const density = linkCount / (nodeCount * (nodeCount - 1) / 2 || 1);
        const linkDistance = Math.max(30, Math.min(200, 80 / Math.max(0.01, density)));
        this.simulation.force('link').distance(linkDistance);
        
        // Adjust collision radius based on average node size
        const avgNodeSize = this.state.filteredData.nodes.reduce((sum, n) => 
            sum + this.getNodeRadius(n), 0) / nodeCount || 0;
        this.simulation.force('collision').radius(d => 
            this.getNodeRadius(d) + avgNodeSize * 0.1);
        
        console.log('Simulation parameters updated:', {
            chargeStrength,
            linkDistance,
            avgNodeSize
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
            this.renderLabels();
            
            // Update simulation
            this.simulation
                .nodes(this.state.filteredData.nodes)
                .force('link').links(this.state.filteredData.links);
            
            // Restart simulation
            this.simulation.alpha(this.config.forces.alpha).restart();
            
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
            .selectAll('.edge')
            .data(this.state.filteredData.links, d => d.id || `${d.source}-${d.target}`);
        
        // Remove old edges
        linkSelection.exit()
            .transition()
            .duration(300)
            .attr('opacity', 0)
            .remove();
        
        // Add new edges
        const linkEnter = linkSelection.enter()
            .append('line')
            .attr('class', 'edge')
            .attr('stroke', d => this.getEdgeColor(d))
            .attr('stroke-width', d => this.getEdgeWidth(d))
            .attr('stroke-opacity', d => this.getEdgeOpacity(d))
            .attr('marker-end', d => this.getEdgeMarker(d));
        
        // Add stroke dasharray for special edge types
        linkEnter
            .attr('stroke-dasharray', d => this.getEdgeDashArray(d));
        
        // Merge enter and update selections
        const linkUpdate = linkEnter.merge(linkSelection);
        
        // Update edge appearance
        linkUpdate
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
     * Render node labels
     */
    renderLabels() {
        // Only show labels for important nodes or when zoomed in
        const showLabels = this.state.zoomLevel > 1.5 || 
                          this.state.filteredData.nodes.length <= 50;
        
        if (!showLabels) {
            this.labelGroup.selectAll('*').remove();
            return;
        }
        
        const labelSelection = this.labelGroup
            .selectAll('.label')
            .data(this.state.filteredData.nodes.filter(d => 
                this.shouldShowLabel(d)), d => d.address);
        
        // Remove old labels
        labelSelection.exit().remove();
        
        // Add new labels
        const labelEnter = labelSelection.enter()
            .append('text')
            .attr('class', 'label')
            .attr('text-anchor', 'middle')
            .attr('dy', d => this.getNodeRadius(d) + 15)
            .attr('font-family', this.config.nodes.labelFont)
            .attr('font-size', '11px')
            .attr('fill', this.config.colors.text)
            .attr('pointer-events', 'none')
            .text(d => this.getNodeLabel(d));
        
        // Merge selections
        const labelUpdate = labelEnter.merge(labelSelection);
        
        // Update label text and position
        labelUpdate
            .text(d => this.getNodeLabel(d))
            .attr('dy', d => this.getNodeRadius(d) + 15);
        
        this.labelSelection = labelUpdate;
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
        
        // Update edge positions
        if (this.edgeSelection) {
            this.edgeSelection
                .attr('x1', d => d.source.x)
                .attr('y1', d => d.source.y)
                .attr('x2', d => d.target.x)
                .attr('y2', d => d.target.y);
        }
        
        // Update label positions
        if (this.labelSelection) {
            this.labelSelection
                .attr('x', d => d.x)
                .attr('y', d => d.y);
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
        
        // Update label visibility based on zoom level
        this.updateLabelVisibility();
        
        // Trigger viewport change callback
        this.callbacks.onViewportChange(transform, this.state.zoomLevel);
    }
    
    /**
     * Update label visibility based on zoom level
     */
    updateLabelVisibility() {
        const showLabels = this.state.zoomLevel > 1.5 || 
                          this.state.filteredData.nodes.length <= 50;
        
        this.labelGroup
            .transition()
            .duration(200)
            .attr('opacity', showLabels ? 1 : 0);
    }
    
    /**
     * Create drag behavior for nodes
     */
    createDragBehavior() {
        return d3.drag()
            .on('start', (event, d) => {
                if (!event.active) {
                    this.simulation.alphaTarget(0.3).restart();
                }
                d.fx = d.x;
                d.fy = d.y;
            })
            .on('drag', (event, d) => {
                d.fx = event.x;
                d.fy = event.y;
            })
            .on('end', (event, d) => {
                if (!event.active) {
                    this.simulation.alphaTarget(0);
                }
                d.fx = null;
                d.fy = null;
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
        let sizeFactor = 0.5; // Default
        
        if (nodeData.suggestedSize !== undefined) {
            // Use suggested size from D3Formatter
            sizeFactor = Math.min(1, nodeData.suggestedSize / 100);
        } else {
            // Calculate based on degree, volume, importance
            if (nodeData.degree !== undefined) {
                sizeFactor = Math.min(1, nodeData.degree / 50) * 0.4;
            }
            
            if (nodeData.totalVolume && nodeData.totalVolume !== '0') {
                const volume = Number(BigInt(nodeData.totalVolume) / BigInt('1000000000000'));
                sizeFactor += Math.min(0.4, volume / 1000);
            }
            
            if (nodeData.importanceScore !== undefined) {
                sizeFactor += (nodeData.importanceScore / 100) * 0.2;
            }
        }
        
        return baseRadius + (maxRadius - baseRadius) * sizeFactor;
    }
    
    getNodeColor(nodeData) {
        if (nodeData.suggestedColor) {
            return nodeData.suggestedColor;
        }
        
        // Color based on risk score
        if (nodeData.riskScore !== undefined) {
            if (nodeData.riskScore >= 70) return this.config.colors.high;
            if (nodeData.riskScore >= 30) return this.config.colors.medium;
            return this.config.colors.safe;
        }
        
        // Color based on node type
        switch (nodeData.nodeType) {
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
        
        if (this.state.highlightedNodes.has(nodeData.address)) {
            return this.config.colors.medium;
        }
        
        return '#ffffff';
    }
    
    getNodeStrokeWidth(nodeData) {
        if (this.state.selectedNodes.has(nodeData.address)) {
            return this.config.nodes.strokeWidth * 2;
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
        
        if (edgeData.suggestedWidth !== undefined) {
            return edgeData.suggestedWidth;
        }
        
        // Calculate width based on volume
        if (edgeData.volume && edgeData.volume !== '0') {
            const volume = Number(BigInt(edgeData.volume) / BigInt('1000000000000'));
            const factor = Math.min(1, Math.log10(volume + 1) / 4);
            return baseWidth + (maxWidth - baseWidth) * factor;
        }
        
        return baseWidth;
    }
    
    getEdgeColor(edgeData) {
        if (edgeData.suggestedColor) {
            return edgeData.suggestedColor;
        }
        
        if (edgeData.suspiciousPattern) {
            return this.config.colors.high;
        }
        
        return '#666666';
    }
    
    getEdgeOpacity(edgeData) {
        return edgeData.suggestedOpacity || this.config.edges.opacity;
    }
    
    getEdgeMarker(edgeData) {
        return edgeData.bidirectional ? null : 'url(#arrow)';
    }
    
    getEdgeDashArray(edgeData) {
        if (edgeData.suspiciousPattern) return '5,5';
        if (edgeData.edgeType === 'inferred') return '3,3';
        return null;
    }
    
    shouldShowLabel(nodeData) {
        // Show labels for important nodes or when zoomed in
        return this.state.zoomLevel > 1.5 || 
               nodeData.importanceScore > 50 ||
               this.state.selectedNodes.has(nodeData.address) ||
               this.state.highlightedNodes.has(nodeData.address);
    }
    
    getNodeLabel(nodeData) {
        if (nodeData.identity?.display) {
            return nodeData.identity.display;
        }
        
        // Shorten address for display
        const addr = nodeData.address;
        return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
    }
    
    // Tooltip methods
    
    createNodeTooltip(nodeData) {
        const parts = [];
        
        parts.push(`<strong>Address:</strong> ${nodeData.address.substring(0, 12)}...`);
        
        if (nodeData.identity?.display) {
            parts.push(`<strong>Identity:</strong> ${nodeData.identity.display}`);
        }
        
        if (nodeData.nodeType) {
            parts.push(`<strong>Type:</strong> ${nodeData.nodeType}`);
        }
        
        if (nodeData.balance?.free) {
            try {
                // Handle decimal values by converting to string and removing decimals
                let balanceStr = nodeData.balance.free.toString();
                if (balanceStr.includes('.')) {
                    balanceStr = balanceStr.split('.')[0];
                }
                const balance = Number(BigInt(balanceStr) / BigInt('1000000000000'));
                parts.push(`<strong>Balance:</strong> ${balance.toLocaleString()} DOT`);
            } catch (e) {
                console.warn('Error converting balance:', e);
            }
        }
        
        if (nodeData.degree !== undefined) {
            parts.push(`<strong>Connections:</strong> ${nodeData.degree}`);
        }
        
        if (nodeData.totalVolume && nodeData.totalVolume !== '0') {
            try {
                // Handle decimal values by converting to string and removing decimals
                let volumeStr = nodeData.totalVolume.toString();
                if (volumeStr.includes('.')) {
                    volumeStr = volumeStr.split('.')[0];
                }
                const volume = Number(BigInt(volumeStr) / BigInt('1000000000000'));
                parts.push(`<strong>Total Volume:</strong> ${volume.toLocaleString()} DOT`);
            } catch (e) {
                console.warn('Error converting volume:', e);
            }
        }
        
        if (nodeData.riskScore !== undefined) {
            parts.push(`<strong>Risk Score:</strong> ${nodeData.riskScore}/100`);
        }
        
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
            const volume = Number(BigInt(edgeData.volume) / BigInt('1000000000000'));
            parts.push(`<strong>Volume:</strong> ${volume.toLocaleString()} DOT`);
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
                    value = Number(BigInt(node.balance.free) / BigInt('1000000000000'));
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
                    value = Number(BigInt(edge.volume) / BigInt('1000000000000'));
                }
                return `"${value}"`;
            });
            csv += row.join(',') + '\n';
        });
        
        return csv;
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