/**
 * API Client for Polkadot Analysis Tool
 * Handles all HTTP requests to the backend API
 */
export class ApiClient {
  constructor(baseURL = '') {
    this.baseURL = baseURL;
    this.defaultHeaders = {
      'Content-Type': 'application/json',
    };
  }

  /**
   * Generic request method
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const config = {
      headers: { ...this.defaultHeaders, ...options.headers },
      ...options,
    };

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      }
      
      return await response.text();
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  }

  /**
   * Search for addresses
   */
  async searchAddresses(query, options = {}) {
    const params = new URLSearchParams({
      q: query,
      ...options
    });
    
    return this.request(`/api/addresses/search?${params}`);
  }

  /**
   * Get address details
   */
  async getAddressDetails(address) {
    return this.request(`/api/addresses/${encodeURIComponent(address)}`);
  }

  /**
   * Get address relationships graph
   */
  async getAddressGraph(address, options = {}) {
    const params = new URLSearchParams({
      depth: options.depth || 2,
      minVolume: options.minVolume || 0,
      timeRange: options.timeRange || 'all',
      minConnections: options.minConnections || 1,
      ...options
    });
    
    return this.request(`/api/graph/address/${encodeURIComponent(address)}?${params}`);
  }

  /**
   * Get network statistics
   */
  async getNetworkStats() {
    return this.request('/api/stats/network');
  }

  /**
   * Export graph data
   */
  async exportGraphData(address, format = 'json', options = {}) {
    const params = new URLSearchParams({
      format,
      ...options
    });
    
    return this.request(`/api/graph/export/${encodeURIComponent(address)}?${params}`);
  }

  /**
   * Save investigation
   */
  async saveInvestigation(data) {
    return this.request('/api/investigations', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  /**
   * Get investigation
   */
  async getInvestigation(id) {
    return this.request(`/api/investigations/${id}`);
  }

  /**
   * Find paths between addresses
   */
  async findPaths(fromAddress, toAddress, options = {}) {
    const params = new URLSearchParams({
      from: fromAddress,
      to: toAddress,
      maxDepth: options.maxDepth || 6,
      algorithm: options.algorithm || 'dijkstra',
      ...options
    });
    
    return this.request(`/api/graph/paths?${params}`);
  }
}