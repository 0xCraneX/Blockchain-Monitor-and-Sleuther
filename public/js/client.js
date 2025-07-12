// Client-side JavaScript for polkadot-analysis-tool
// This file provides frontend functionality for the blockchain analysis tool

// Wait for app to be ready before initializing client
function waitForApp() {
  if (typeof window.app !== 'undefined') {
    console.log('Main app detected, initializing client integration...');
    initializeApp();
  } else {
    console.log('Waiting for main app to be ready...');
    // Listen for the app ready event
    document.addEventListener('polkadotAppReady', function(event) {
      console.log('App ready event received, initializing client integration...');
      initializeApp();
    }, { once: true });
  }
}

document.addEventListener('DOMContentLoaded', function() {
  console.log('Polkadot Analysis Tool client loaded');
  
  // Wait for the main app to be ready
  waitForApp();
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
  let appReady = false;
  
  // Listen for the app ready event
  window.addEventListener('polkadotAppReady', () => {
    appReady = true;
    console.log('Main app system is now ready for integration');
  });
  
  // Provide main search function for the search component
  window.performMainSearch = async function(query) {
    console.log('Performing main search for:', query);
    
    try {
      // Show loading state
      showLoadingState(true);
      
      // Ensure main app is available before proceeding
      if (typeof window.app === 'undefined') {
        console.log('Main app not ready for search, waiting...');
        await new Promise(resolve => {
          document.addEventListener('polkadotAppReady', resolve, { once: true });
        });
      }
      
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
  
  console.log('window.performMainSearch function has been defined and is available:', typeof window.performMainSearch === 'function');
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
    // Wait for main app system to be available with timeout
    console.log('Graph loading delegated to main app system for address:', address);
    
    const maxWaitTime = 10000; // 10 seconds timeout
    
    // Use Promise to wait for either app ready or timeout
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for main app system to initialize'));
      }, maxWaitTime);
      
      const checkApp = () => {
        if (typeof window.app !== 'undefined' && window.app.loadAddressGraph) {
          clearTimeout(timeout);
          resolve();
        } else {
          // Check again in 100ms
          setTimeout(checkApp, 100);
        }
      };
      
      // Also listen for the app ready event
      const handleAppReady = () => {
        clearTimeout(timeout);
        document.removeEventListener('polkadotAppReady', handleAppReady);
        resolve();
      };
      
      document.addEventListener('polkadotAppReady', handleAppReady);
      
      // Start checking immediately
      checkApp();
    });
    
    // Now we can safely call the main app
    await window.app.loadAddressGraph(address);
    
  } catch (error) {
    console.error('Failed to load address graph:', error);
    showErrorMessage('Failed to load address relationships');
  }
}

function initializeNetworkGraph(centerAddress, relationships) {
  // Delegate to the main app's graph visualization system
  console.log('Graph initialization delegated to main app system');
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

// Debug utility function to test integration
window.testIntegration = function() {
  console.log('=== Integration Test ===');
  console.log('window.performMainSearch available:', typeof window.performMainSearch === 'function');
  console.log('window.app available:', typeof window.app !== 'undefined');
  console.log('window.app.loadAddressGraph available:', typeof window.app?.loadAddressGraph === 'function');
  console.log('Search components initialized:', typeof window.polkadotSearch !== 'undefined');
  
  if (typeof window.app !== 'undefined' && window.app.loadAddressGraph) {
    console.log('✅ Integration looks good - ready to search!');
    return true;
  } else {
    console.log('❌ Integration not complete yet');
    return false;
  }
};

// Export for module usage if needed
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initializeApp,
    performMainSearch: window.performMainSearch
  };
}