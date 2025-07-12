/**
 * Graph Visualizer using D3.js
 * Handles network graph rendering and interactions
 */
export class GraphVisualizer {
  constructor(containerId, options = {}) {
    this.containerId = containerId;
    this.container = document.getElementById(containerId);
    
    if (!this.container) {
      throw new Error(`Container with id "${containerId}" not found`);
    }

    this.options = {
      width: options.width || this.container.clientWidth,
      height: options.height || this.container.clientHeight || 600,
      nodeRadius: {
        min: 8,
        max: 30,
        default: 12
      },
      linkDistance: 100,
      linkStrength: 0.3,
      chargeStrength: -150,
      collideRadius: 15,
      colors: {
        node: {
          default: '#4CAF50',
          selected: '#E91E63',
          exchange: '#2196F3',
          validator: '#9C27B0',
          suspicious: '#F44336'
        },
        link: {
          default: '#666',
          highlighted: '#E91E63',
          weak: '#999'
        }
      },
      ...options
    };

    this.svg = null;
    this.simulation = null;
    this.nodes = [];
    this.links = [];
    this.nodeElements = null;
    this.linkElements = null;
    this.labelElements = null;
    this.zoom = null;
    
    this.selectedNode = null;
    this.lockedNodes = new Set();
    this.simulationPaused = false;
    this.eventHandlers = new Map();
    
    this.init();
  }

  /**
   * Initialize the visualization
   */
  init() {
    // Clear existing content
    this.container.innerHTML = '';

    // Create SVG
    this.svg = d3.select(this.container)
      .append('svg')
      .attr('width', this.options.width)
      .attr('height', this.options.height);

    // Create zoom behavior
    this.zoom = d3.zoom()
      .scaleExtent([0.1, 3])
      .on('zoom', (event) => {
        this.svg.select('.graph-group')
          .attr('transform', event.transform);
      });

    this.svg.call(this.zoom);

    // Create main group for graph elements
    const graphGroup = this.svg.append('g')
      .attr('class', 'graph-group');

    // Create groups for different elements (order matters for layering)
    graphGroup.append('g').attr('class', 'links');
    graphGroup.append('g').attr('class', 'nodes');
    graphGroup.append('g').attr('class', 'labels');

    // Create force simulation with gentler physics
    this.simulation = d3.forceSimulation()
      .force('link', d3.forceLink().id(d => d.id).distance(this.options.linkDistance).strength(this.options.linkStrength))
      .force('charge', d3.forceManyBody().strength(this.options.chargeStrength))
      .force('center', d3.forceCenter(this.options.width / 2, this.options.height / 2))
      .force('collision', d3.forceCollide().radius(this.options.collideRadius))
      .alphaDecay(0.05)
      .velocityDecay(0.8);

    // Handle window resize
    window.addEventListener('resize', () => this.handleResize());
    
    // Handle keyboard shortcuts
    window.addEventListener('keydown', (event) => this.handleKeyDown(event));
  }

  /**
   * Load and render graph data
   */
  loadData(graphData) {
    if (!graphData || !graphData.nodes || !graphData.links) {
      console.error('Invalid graph data structure');
      return;
    }

    // Process nodes
    this.nodes = graphData.nodes.map(node => ({
      id: node.address || node.id,
      address: node.address || node.id,
      identity: node.identity || null,
      balance: node.balance || 0,
      transferCount: node.transferCount || 0,
      totalVolume: node.totalVolume || 0,
      riskScore: node.riskScore || 0,
      type: node.type || 'default',
      x: node.x || null,
      y: node.y || null,
      ...node
    }));

    // Process links
    this.links = graphData.links.map(link => ({
      source: link.source || link.from_address,
      target: link.target || link.to_address,
      volume: link.volume || link.total_volume || 0,
      transferCount: link.transferCount || link.transfer_count || 0,
      strength: link.strength || this.calculateLinkStrength(link),
      ...link
    }));

    this.render();
  }

  /**
   * Calculate link strength based on volume and frequency
   */
  calculateLinkStrength(link) {
    const volume = link.volume || link.total_volume || 0;
    const count = link.transferCount || link.transfer_count || 1;
    
    // Normalize strength between 0.1 and 1.0
    const volumeScore = Math.log10(volume + 1) / 10;
    const countScore = Math.log10(count + 1) / 5;
    
    return Math.min(Math.max((volumeScore + countScore) / 2, 0.1), 1.0);
  }

  /**
   * Render the graph
   */
  render() {
    // Update links
    this.linkElements = this.svg.select('.links')
      .selectAll('.link')
      .data(this.links, d => `${d.source.id || d.source}-${d.target.id || d.target}`);

    this.linkElements.exit().remove();

    const linkEnter = this.linkElements.enter()
      .append('line')
      .attr('class', 'link')
      .style('stroke', this.options.colors.link.default)
      .style('stroke-opacity', 0.6)
      .style('stroke-width', d => Math.sqrt(d.strength * 10) + 1);

    this.linkElements = linkEnter.merge(this.linkElements);

    // Update nodes
    this.nodeElements = this.svg.select('.nodes')
      .selectAll('.node')
      .data(this.nodes, d => d.id);

    this.nodeElements.exit().remove();

    const nodeEnter = this.nodeElements.enter()
      .append('circle')
      .attr('class', 'node')
      .attr('r', d => this.getNodeRadius(d))
      .style('fill', d => this.getNodeColor(d))
      .style('stroke', '#fff')
      .style('stroke-width', 2)
      .style('cursor', 'pointer');

    // Add node interactions
    nodeEnter
      .on('click', (event, d) => this.handleNodeClick(event, d))
      .on('mouseover', (event, d) => this.handleNodeMouseOver(event, d))
      .on('mouseout', (event, d) => this.handleNodeMouseOut(event, d))
      .call(d3.drag()
        .on('start', (event, d) => this.dragStarted(event, d))
        .on('drag', (event, d) => this.dragged(event, d))
        .on('end', (event, d) => this.dragEnded(event, d))
      );

    this.nodeElements = nodeEnter.merge(this.nodeElements);
    
    // Update node styles to show locked state
    this.updateNodeStyles();

    // Update labels
    this.labelElements = this.svg.select('.labels')
      .selectAll('.label')
      .data(this.nodes, d => d.id);

    this.labelElements.exit().remove();

    const labelEnter = this.labelElements.enter()
      .append('text')
      .attr('class', 'label')
      .style('text-anchor', 'middle')
      .style('font-size', '10px')
      .style('fill', '#fff')
      .style('pointer-events', 'none')
      .text(d => this.getNodeLabel(d));

    this.labelElements = labelEnter.merge(this.labelElements);

    // Update simulation
    this.simulation
      .nodes(this.nodes)
      .on('tick', () => this.ticked());

    this.simulation.force('link')
      .links(this.links);

    // Restart simulation if not paused
    if (!this.simulationPaused) {
      this.simulation.alpha(0.3).restart();
    }
  }

  /**
   * Get node radius based on importance
   */
  getNodeRadius(node) {
    const { min, max, default: defaultRadius } = this.options.nodeRadius;
    
    if (node.totalVolume > 0) {
      const scale = Math.log10(node.totalVolume + 1) / 10;
      return min + (max - min) * Math.min(scale, 1);
    }
    
    return defaultRadius;
  }

  /**
   * Get node color based on type and risk
   */
  getNodeColor(node) {
    const colors = this.options.colors.node;
    
    if (node.id === this.selectedNode?.id) {
      return colors.selected;
    }
    
    switch (node.type) {
      case 'exchange':
        return colors.exchange;
      case 'validator':
        return colors.validator;
      default:
        if (node.riskScore > 0.7) {
          return colors.suspicious;
        }
        return colors.default;
    }
  }
  
  /**
   * Get node stroke color including locked state
   */
  getNodeStrokeColor(node) {
    if (this.lockedNodes.has(node.id)) {
      return '#FFD700'; // Gold for locked nodes
    }
    return '#fff';
  }
  
  /**
   * Get node stroke width including locked state
   */
  getNodeStrokeWidth(node) {
    if (this.lockedNodes.has(node.id)) {
      return 3; // Thicker stroke for locked nodes
    }
    return 2;
  }

  /**
   * Get node label
   */
  getNodeLabel(node) {
    if (node.identity) {
      return node.identity.length > 10 ? node.identity.substring(0, 10) + '...' : node.identity;
    }
    
    const address = node.address || node.id;
    return address.substring(0, 6) + '...' + address.substring(address.length - 4);
  }

  /**
   * Handle simulation tick
   */
  ticked() {
    this.linkElements
      .attr('x1', d => d.source.x)
      .attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x)
      .attr('y2', d => d.target.y);

    this.nodeElements
      .attr('cx', d => d.x)
      .attr('cy', d => d.y);

    this.labelElements
      .attr('x', d => d.x)
      .attr('y', d => d.y + 4);
  }

  /**
   * Node click handler
   */
  handleNodeClick(event, node) {
    event.stopPropagation();
    
    // Handle double-click for locking
    if (event.detail === 2) {
      this.toggleNodeLock(node);
    }
    
    // Update selection
    this.selectedNode = node;
    
    // Update node colors
    this.updateNodeStyles();
    
    // Emit event
    this.emit('nodeClick', { node, event });
  }

  /**
   * Node mouse over handler
   */
  handleNodeMouseOver(event, node) {
    // Highlight connected links
    this.linkElements
      .style('stroke', d => 
        (d.source.id === node.id || d.target.id === node.id) 
          ? this.options.colors.link.highlighted 
          : this.options.colors.link.default
      )
      .style('stroke-opacity', d => 
        (d.source.id === node.id || d.target.id === node.id) ? 1 : 0.3
      );

    this.emit('nodeHover', { node, event });
  }

  /**
   * Node mouse out handler
   */
  handleNodeMouseOut(event, node) {
    // Reset link colors
    this.linkElements
      .style('stroke', this.options.colors.link.default)
      .style('stroke-opacity', 0.6);

    this.emit('nodeHoverOut', { node, event });
  }

  /**
   * Drag handlers with position locking support
   */
  dragStarted(event, node) {
    if (!event.active && !this.simulationPaused) this.simulation.alphaTarget(0.1).restart();
    node.fx = node.x;
    node.fy = node.y;
    node.__dragging = true;
  }

  dragged(event, node) {
    node.fx = event.x;
    node.fy = event.y;
  }

  dragEnded(event, node) {
    node.__dragging = false;
    
    // Check if user wants to lock position (ctrl+drag)
    const shouldLock = event.sourceEvent?.ctrlKey || event.sourceEvent?.metaKey;
    
    if (shouldLock || this.lockedNodes.has(node.id)) {
      // Keep node locked in position
      this.lockedNodes.add(node.id);
      // Keep fx, fy set
    } else {
      // Release for normal physics
      node.fx = null;
      node.fy = null;
    }
    
    if (!event.active && !this.simulationPaused) this.simulation.alphaTarget(0);
    
    // Update visual feedback
    this.updateNodeStyles();
  }

  /**
   * Handle window resize
   */
  handleResize() {
    const newWidth = this.container.clientWidth;
    const newHeight = this.container.clientHeight || 600;
    
    this.options.width = newWidth;
    this.options.height = newHeight;
    
    this.svg
      .attr('width', newWidth)
      .attr('height', newHeight);
    
    this.simulation
      .force('center', d3.forceCenter(newWidth / 2, newHeight / 2))
      .alpha(0.3)
      .restart();
  }
  
  /**
   * Handle keyboard shortcuts
   */
  handleKeyDown(event) {
    switch (event.key) {
      case ' ': // Spacebar to toggle simulation
        event.preventDefault();
        this.toggleSimulation();
        break;
      case 'l':
      case 'L':
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          if (this.selectedNode) {
            this.lockNode(this.selectedNode);
          }
        }
        break;
      case 'u':
      case 'U':
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          // Unlock all nodes
          this.nodes.forEach(node => {
            if (this.lockedNodes.has(node.id)) {
              this.unlockNode(node);
            }
          });
        }
        break;
    }
  }

  /**
   * Zoom to fit graph
   */
  zoomToFit() {
    if (this.nodes.length === 0) return;

    const bounds = this.getGraphBounds();
    const fullWidth = this.options.width;
    const fullHeight = this.options.height;
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;

    if (width === 0 || height === 0) return;

    const midX = (bounds.minX + bounds.maxX) / 2;
    const midY = (bounds.minY + bounds.maxY) / 2;
    const scale = Math.min(fullWidth / width, fullHeight / height) * 0.8;

    const transform = d3.zoomIdentity
      .translate(fullWidth / 2 - scale * midX, fullHeight / 2 - scale * midY)
      .scale(scale);

    this.svg.transition()
      .duration(750)
      .call(this.zoom.transform, transform);
  }

  /**
   * Get graph bounds
   */
  getGraphBounds() {
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    this.nodes.forEach(node => {
      if (node.x < minX) minX = node.x;
      if (node.x > maxX) maxX = node.x;
      if (node.y < minY) minY = node.y;
      if (node.y > maxY) maxY = node.y;
    });

    return { minX, maxX, minY, maxY };
  }

  /**
   * Event handling
   */
  on(event, handler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event).add(handler);
  }

  off(event, handler) {
    if (this.eventHandlers.has(event)) {
      this.eventHandlers.get(event).delete(handler);
    }
  }

  emit(event, data) {
    if (this.eventHandlers.has(event)) {
      this.eventHandlers.get(event).forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in event handler for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Toggle node position lock
   */
  toggleNodeLock(node) {
    if (this.lockedNodes.has(node.id)) {
      this.unlockNode(node);
    } else {
      this.lockNode(node);
    }
  }
  
  /**
   * Lock a node's position
   */
  lockNode(node) {
    this.lockedNodes.add(node.id);
    node.fx = node.x;
    node.fy = node.y;
    this.updateNodeStyles();
    console.log(`Node ${node.id} locked`);
  }
  
  /**
   * Unlock a node's position
   */
  unlockNode(node) {
    this.lockedNodes.delete(node.id);
    node.fx = null;
    node.fy = null;
    this.updateNodeStyles();
    console.log(`Node ${node.id} unlocked`);
  }
  
  /**
   * Update node visual styles
   */
  updateNodeStyles() {
    if (this.nodeElements) {
      this.nodeElements
        .style('fill', d => this.getNodeColor(d))
        .style('stroke', d => this.getNodeStrokeColor(d))
        .style('stroke-width', d => this.getNodeStrokeWidth(d));
    }
  }
  
  /**
   * Pause the force simulation
   */
  pauseSimulation() {
    this.simulationPaused = true;
    this.simulation.alphaTarget(0).stop();
    console.log('Simulation paused');
  }
  
  /**
   * Resume the force simulation
   */
  resumeSimulation() {
    this.simulationPaused = false;
    this.simulation.alpha(0.3).restart();
    console.log('Simulation resumed');
  }
  
  /**
   * Toggle simulation pause/resume
   */
  toggleSimulation() {
    if (this.simulationPaused) {
      this.resumeSimulation();
    } else {
      this.pauseSimulation();
    }
    return !this.simulationPaused;
  }
  
  /**
   * Clear the graph
   */
  clear() {
    this.nodes = [];
    this.links = [];
    this.selectedNode = null;
    this.lockedNodes.clear();
    this.simulationPaused = false;
    
    this.svg.select('.links').selectAll('.link').remove();
    this.svg.select('.nodes').selectAll('.node').remove();
    this.svg.select('.labels').selectAll('.label').remove();
    
    this.simulation.nodes([]);
    this.simulation.force('link').links([]);
  }

  /**
   * Destroy the visualization
   */
  destroy() {
    if (this.simulation) {
      this.simulation.stop();
    }
    
    this.container.innerHTML = '';
    this.eventHandlers.clear();
    this.lockedNodes.clear();
    
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('keydown', this.handleKeyDown);
  }
}