// Client-side JavaScript for polkadot-analysis-tool
// This file provides frontend functionality for the blockchain analysis tool

document.addEventListener('DOMContentLoaded', function() {
  console.log('Polkadot Analysis Tool client loaded');
  
  // Initialize the application
  initializeApp();
});

function initializeApp() {
  console.log('Initializing Polkadot Analysis Tool...');
  
  // Initialize search integration
  initializeSearchIntegration();
  
  // Initialize other components as needed
  initializeVisualization();
  initializeControls();
}

function initializeSearchIntegration() {
  // Provide main search function for the search component
  window.performMainSearch = async function(query) {
    console.log('Performing main search for:', query);
    
    try {
      // Show loading state
      showLoadingState(true);
      
      // Validate the address/query
      const validation = validateSearchQuery(query);
      if (!validation.isValid && !isIdentitySearch(query)) {
        throw new Error(validation.error);
      }
      
      // Fetch account data
      const accountData = await fetchAccountData(query);
      if (!accountData) {
        throw new Error('Address not found');
      }
      
      // Show controls and visualization sections
      showSection('controls-section');
      showSection('visualization-section');
      
      // Load and display the graph
      await loadAddressGraph(accountData.address);
      
      // Update UI with account information
      updateAccountInfo(accountData);
      
    } catch (error) {
      console.error('Search failed:', error);
      showErrorMessage(error.message);
    } finally {
      showLoadingState(false);
    }
  };
}

function validateSearchQuery(query) {
  if (window.polkadotAddressValidator) {
    return window.polkadotAddressValidator.validateAddress(query, {
      allowedNetworks: ['polkadot', 'kusama', 'substrate'],
      strictFormat: false
    });
  }
  
  // Basic fallback validation
  const ss58Regex = /^[1-9A-HJ-NP-Za-km-z]{47,50}$/;
  return {
    isValid: ss58Regex.test(query),
    error: ss58Regex.test(query) ? null : 'Invalid address format'
  };
}

function isIdentitySearch(query) {
  return query.length < 20 && /[a-zA-Z]/.test(query) && !/^[1-9A-HJ-NP-Za-km-z]{40,}$/.test(query);
}

async function fetchAccountData(query) {
  try {
    const response = await fetch(`/api/addresses/search?q=${encodeURIComponent(query)}&limit=1`);
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const data = await response.json();
    if (data.results && data.results.length > 0) {
      return data.results[0];
    }
    
    // If no results from search, try direct address lookup
    if (validateSearchQuery(query).isValid) {
      const directResponse = await fetch(`/api/addresses/${encodeURIComponent(query)}`);
      if (directResponse.ok) {
        return await directResponse.json();
      }
    }
    
    return null;
  } catch (error) {
    console.error('Failed to fetch account data:', error);
    throw error;
  }
}

async function loadAddressGraph(address) {
  try {
    // Fetch relationships data
    const response = await fetch(`/api/addresses/${encodeURIComponent(address)}/relationships?limit=50`);
    if (!response.ok) {
      throw new Error(`Failed to load relationships: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('Relationships data:', data);
    
    // Initialize graph visualization
    initializeNetworkGraph(address, data.relationships || []);
    
    // Update statistics
    updateGraphStatistics(data.relationships || []);
    
  } catch (error) {
    console.error('Failed to load address graph:', error);
    showErrorMessage('Failed to load address relationships');
  }
}

function initializeNetworkGraph(centerAddress, relationships) {
  // Basic D3.js graph initialization
  const container = document.getElementById('graph-container');
  const svg = d3.select('#network-graph');
  
  // Clear previous content
  svg.selectAll('*').remove();
  
  // Set up dimensions
  const width = container.clientWidth;
  const height = container.clientHeight;
  
  svg.attr('width', width).attr('height', height);
  
  // Create nodes and links data
  const nodes = [{ id: centerAddress, type: 'center' }];
  const links = [];
  
  relationships.forEach(rel => {
    if (!nodes.find(n => n.id === rel.connected_address)) {
      nodes.push({ 
        id: rel.connected_address, 
        type: 'connected',
        identity: rel.identity,
        riskScore: rel.risk_score || 0
      });
    }
    
    links.push({
      source: centerAddress,
      target: rel.connected_address,
      value: parseFloat(rel.total_volume || 0)
    });
  });
  
  // Create force simulation
  const simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id(d => d.id).distance(100))
    .force('charge', d3.forceManyBody().strength(-300))
    .force('center', d3.forceCenter(width / 2, height / 2));
  
  // Create links
  const link = svg.append('g')
    .selectAll('line')
    .data(links)
    .enter().append('line')
    .attr('class', 'link')
    .attr('stroke-width', d => Math.sqrt(d.value / 1000000000000) + 1);
  
  // Create nodes
  const node = svg.append('g')
    .selectAll('circle')
    .data(nodes)
    .enter().append('circle')
    .attr('class', 'node')
    .attr('r', d => d.type === 'center' ? 15 : 10)
    .attr('fill', d => {
      if (d.type === 'center') return '#e6007a';
      if (d.riskScore > 0.7) return '#f44336';
      if (d.riskScore > 0.3) return '#ff9800';
      return '#4caf50';
    })
    .call(d3.drag()
      .on('start', dragstarted)
      .on('drag', dragged)
      .on('end', dragended))
    .on('click', (event, d) => showNodeDetails(d));
  
  // Add labels
  const label = svg.append('g')
    .selectAll('text')
    .data(nodes)
    .enter().append('text')
    .text(d => d.identity || truncateAddress(d.id))
    .attr('class', 'node-label')
    .attr('font-size', '10px')
    .attr('text-anchor', 'middle')
    .attr('dy', -20);
  
  // Update positions on simulation tick
  simulation.on('tick', () => {
    link
      .attr('x1', d => d.source.x)
      .attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x)
      .attr('y2', d => d.target.y);
    
    node
      .attr('cx', d => d.x)
      .attr('cy', d => d.y);
    
    label
      .attr('x', d => d.x)
      .attr('y', d => d.y);
  });
  
  // Drag functions
  function dragstarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
  }
  
  function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
  }
  
  function dragended(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
  }
}

function truncateAddress(address, start = 6, end = 6) {
  if (!address || address.length <= start + end + 3) return address;
  return `${address.substring(0, start)}...${address.substring(address.length - end)}`;
}

function showNodeDetails(node) {
  const detailsPanel = document.getElementById('node-details');
  const infoDiv = document.getElementById('node-info');
  
  infoDiv.innerHTML = `
    <div class="node-detail-item">
      <span class="label">Address:</span>
      <span class="value">${truncateAddress(node.id, 10, 10)}</span>
    </div>
    <div class="node-detail-item">
      <span class="label">Identity:</span>
      <span class="value">${node.identity || 'Unknown'}</span>
    </div>
    <div class="node-detail-item">
      <span class="label">Type:</span>
      <span class="value">${node.type === 'center' ? 'Search Target' : 'Connected Address'}</span>
    </div>
    <div class="node-detail-item">
      <span class="label">Risk Score:</span>
      <span class="value">${(node.riskScore * 100).toFixed(1)}%</span>
    </div>
  `;
  
  detailsPanel.style.display = 'block';
}

function updateAccountInfo(account) {
  // Update any account-specific UI elements
  console.log('Account info:', account);
}

function updateGraphStatistics(relationships) {
  const nodeCount = relationships.length + 1; // +1 for center node
  const edgeCount = relationships.length;
  const totalVolume = relationships.reduce((sum, rel) => sum + parseFloat(rel.total_volume || 0), 0);
  
  document.getElementById('node-count').textContent = nodeCount;
  document.getElementById('edge-count').textContent = edgeCount;
  document.getElementById('total-volume').textContent = (totalVolume / Math.pow(10, 10)).toFixed(2);
}

function initializeVisualization() {
  // Set up visualization event handlers
  console.log('Initializing visualization...');
}

function initializeControls() {
  // Set up control panel event handlers
  console.log('Initializing controls...');
  
  // Example: Apply filters button
  document.getElementById('apply-filters')?.addEventListener('click', () => {
    console.log('Applying filters...');
    // Implementation would go here
  });
}

function showSection(sectionId) {
  const section = document.getElementById(sectionId);
  if (section) {
    section.style.display = 'block';
  }
}

function hideSection(sectionId) {
  const section = document.getElementById(sectionId);
  if (section) {
    section.style.display = 'none';
  }
}

function showLoadingState(loading) {
  const loadingSection = document.getElementById('loading');
  if (loadingSection) {
    loadingSection.style.display = loading ? 'block' : 'none';
  }
}

function showErrorMessage(message) {
  // Simple error display - could be enhanced with a proper notification system
  alert('Error: ' + message);
}

// Export for module usage if needed
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initializeApp,
    performMainSearch: window.performMainSearch
  };
}