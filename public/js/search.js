/**
 * Comprehensive Search Functionality for Polkadot Analysis Tool
 * 
 * Features:
 * - Real-time search with debouncing
 * - Autocomplete dropdown with proper formatting
 * - Address format validation (Polkadot SS58 format)
 * - Identity display with verified indicators
 * - Search history and recent addresses
 * - Keyboard navigation for accessibility
 * - Mobile-responsive design
 * - Performance optimizations
 */

class PolkadotAddressSearch {
    constructor(options = {}) {
        this.options = {
            searchInputId: 'address-search',
            searchButtonId: 'search-btn',
            resultsContainerId: 'search-results',
            debounceMs: 300,
            maxResults: 10,
            maxSearchHistory: 20,
            cacheExpiryMs: 5 * 60 * 1000, // 5 minutes
            ...options
        };

        // State management
        this.searchCache = new Map();
        this.searchHistory = this.loadSearchHistory();
        this.currentQuery = '';
        this.selectedIndex = -1;
        this.isLoading = false;
        this.abortController = null;

        // Initialize components
        this.init();
    }

    init() {
        this.searchInput = document.getElementById(this.options.searchInputId);
        this.searchButton = document.getElementById(this.options.searchButtonId);
        this.resultsContainer = document.getElementById(this.options.resultsContainerId);

        if (!this.searchInput || !this.searchButton || !this.resultsContainer) {
            console.error('Search elements not found');
            return;
        }

        this.setupEventListeners();
        this.createLoadingIndicator();
        this.setupKeyboardNavigation();
        
        // Initialize with recent searches if input is empty
        if (!this.searchInput.value.trim()) {
            this.showRecentSearches();
        }
    }

    setupEventListeners() {
        // Input events
        this.searchInput.addEventListener('input', this.debounce(this.handleInput.bind(this), this.options.debounceMs));
        this.searchInput.addEventListener('focus', this.handleFocus.bind(this));
        this.searchInput.addEventListener('blur', this.handleBlur.bind(this));
        
        // Button events
        this.searchButton.addEventListener('click', this.handleSearch.bind(this));
        
        // Document events
        document.addEventListener('click', this.handleDocumentClick.bind(this));
    }

    setupKeyboardNavigation() {
        this.searchInput.addEventListener('keydown', (e) => {
            const results = this.resultsContainer.querySelectorAll('.search-result-item:not(.search-result-header)');
            
            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    this.selectedIndex = Math.min(this.selectedIndex + 1, results.length - 1);
                    this.updateSelection(results);
                    break;
                    
                case 'ArrowUp':
                    e.preventDefault();
                    this.selectedIndex = Math.max(this.selectedIndex - 1, -1);
                    this.updateSelection(results);
                    break;
                    
                case 'Enter':
                    e.preventDefault();
                    if (this.selectedIndex >= 0 && results[this.selectedIndex]) {
                        this.selectResult(results[this.selectedIndex]);
                    } else {
                        this.handleSearch();
                    }
                    break;
                    
                case 'Escape':
                    this.hideResults();
                    this.searchInput.blur();
                    break;
            }
        });
    }

    updateSelection(results) {
        results.forEach((result, index) => {
            result.classList.toggle('selected', index === this.selectedIndex);
        });

        // Scroll selected item into view
        if (this.selectedIndex >= 0 && results[this.selectedIndex]) {
            results[this.selectedIndex].scrollIntoView({
                block: 'nearest',
                behavior: 'smooth'
            });
        }
    }

    async handleInput(e) {
        const query = e.target.value.trim();
        this.currentQuery = query;
        this.selectedIndex = -1;

        if (query.length === 0) {
            this.showRecentSearches();
            return;
        }

        if (query.length < 2) {
            this.hideResults();
            return;
        }

        // Show validation feedback immediately
        this.showValidationFeedback(query);

        // Perform search
        await this.performSearch(query);
    }

    handleFocus() {
        if (this.currentQuery.length === 0) {
            this.showRecentSearches();
        } else if (this.resultsContainer.children.length > 0) {
            this.showResults();
        }
    }

    handleBlur() {
        // Delay hiding to allow for click events
        setTimeout(() => {
            if (!this.resultsContainer.contains(document.activeElement)) {
                this.hideResults();
            }
        }, 150);
    }

    handleDocumentClick(e) {
        if (!this.searchInput.contains(e.target) && !this.resultsContainer.contains(e.target)) {
            this.hideResults();
        }
    }

    async handleSearch() {
        const query = this.searchInput.value.trim();
        if (!query) return;

        this.setLoading(true);
        
        try {
            // Validate address format first
            const validation = this.validatePolkadotAddress(query);
            if (!validation.isValid && !this.isLikelyIdentitySearch(query)) {
                this.showValidationError(validation.error);
                return;
            }

            // Add to search history
            this.addToSearchHistory(query);

            // Wait for main search function to be available, then trigger it
            await this.waitForMainSearchFunction();
            
            if (typeof window.performMainSearch === 'function') {
                await window.performMainSearch(query);
            } else {
                throw new Error('Main search function is not available');
            }

            this.hideResults();
        } catch (error) {
            console.error('Search error:', error);
            this.showError('Search failed. Please try again.');
        } finally {
            this.setLoading(false);
        }
    }

    /**
     * Wait for the main search function to be available
     */
    async waitForMainSearchFunction() {
        const maxWaitTime = 10000; // 10 seconds timeout
        const checkInterval = 100; // Check every 100ms
        
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Timeout waiting for main search function to be available'));
            }, maxWaitTime);
            
            const checkFunction = () => {
                if (typeof window.performMainSearch === 'function') {
                    clearTimeout(timeout);
                    resolve();
                } else {
                    setTimeout(checkFunction, checkInterval);
                }
            };
            
            // Start checking immediately
            checkFunction();
        });
    }

    async performSearch(query) {
        if (this.abortController) {
            this.abortController.abort();
        }
        this.abortController = new AbortController();

        // Check cache first
        const cacheKey = query.toLowerCase();
        const cached = this.searchCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.options.cacheExpiryMs) {
            this.displayResults(cached.results, query);
            return;
        }

        this.setLoading(true);

        try {
            const results = await this.searchAPI(query, this.abortController.signal);
            
            // Cache results
            this.searchCache.set(cacheKey, {
                results,
                timestamp: Date.now()
            });

            this.displayResults(results, query);
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('Search API error:', error);
                this.showError('Search failed. Please try again.');
            }
        } finally {
            this.setLoading(false);
        }
    }

    async searchAPI(query, signal) {
        const response = await fetch(`/api/addresses/search?q=${encodeURIComponent(query)}&limit=${this.options.maxResults}`, {
            signal,
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Search API error: ${response.status}`);
        }

        const data = await response.json();
        return data.results || [];
    }

    displayResults(results, query) {
        this.resultsContainer.innerHTML = '';

        if (results.length === 0) {
            this.displayNoResults(query);
            return;
        }

        // Create results list
        results.forEach((result, index) => {
            const resultElement = this.createResultElement(result, query, index);
            this.resultsContainer.appendChild(resultElement);
        });

        // Add suggestions for typos/partial matches
        this.addSearchSuggestions(query);

        this.showResults();
    }

    createResultElement(result, query, index) {
        const item = document.createElement('div');
        item.className = 'search-result-item';
        item.setAttribute('role', 'option');
        item.setAttribute('tabindex', '0');
        
        // Highlight matching text
        const highlightedAddress = this.highlightMatch(result.address, query);
        const highlightedIdentity = result.identity_display ? 
            this.highlightMatch(result.identity_display, query) : null;

        // Determine address type and risk level
        const addressType = this.determineAddressType(result);
        const riskLevel = this.determineRiskLevel(result.risk_score || 0);

        item.innerHTML = `
            <div class="search-result-content">
                <div class="search-result-header">
                    ${highlightedIdentity ? `
                        <div class="search-result-identity">
                            ${highlightedIdentity}
                            ${result.identity_verified ? '<span class="verified-badge" title="Verified Identity">✓</span>' : ''}
                        </div>
                    ` : `
                        <div class="search-result-identity">
                            <span class="no-identity">Unknown Identity</span>
                        </div>
                    `}
                    <div class="search-result-badges">
                        ${this.createAddressTypeBadge(addressType)}
                        ${this.createRiskBadge(riskLevel)}
                    </div>
                </div>
                <div class="search-result-address" title="${result.address}">
                    ${highlightedAddress}
                </div>
                <div class="search-result-details">
                    <span class="balance">Balance: ${this.formatBalance(result.balance)}</span>
                    <span class="transfers">Transfers: ${result.total_transfers_in + result.total_transfers_out || 0}</span>
                </div>
            </div>
        `;

        // Add click handler
        item.addEventListener('click', () => this.selectResult(item, result));
        
        // Add keyboard handler
        item.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.selectResult(item, result);
            }
        });

        return item;
    }

    selectResult(element, result = null) {
        if (!result) {
            // Extract address from element if result not provided
            const addressElement = element.querySelector('.search-result-address');
            const address = addressElement ? addressElement.textContent.trim() : '';
            result = { address };
        }

        this.searchInput.value = result.address;
        this.addToSearchHistory(result.address);
        this.hideResults();
        
        // Trigger selection callback
        if (typeof this.options.onSelect === 'function') {
            this.options.onSelect(result);
        }
        
        // Auto-trigger search if enabled
        if (this.options.autoSearch !== false) {
            // Use setTimeout to ensure this doesn't block the UI
            setTimeout(() => this.handleSearch(), 0);
        }
    }

    showRecentSearches() {
        if (this.searchHistory.length === 0) {
            this.hideResults();
            return;
        }

        this.resultsContainer.innerHTML = '';

        // Header
        const header = document.createElement('div');
        header.className = 'search-result-header recent-searches-header';
        header.innerHTML = `
            <span>Recent Searches</span>
            <button class="clear-history-btn" title="Clear History">×</button>
        `;
        
        header.querySelector('.clear-history-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.clearSearchHistory();
        });
        
        this.resultsContainer.appendChild(header);

        // Recent searches
        this.searchHistory.slice(-this.options.maxResults).reverse().forEach((item, index) => {
            const element = this.createRecentSearchElement(item, index);
            this.resultsContainer.appendChild(element);
        });

        this.showResults();
    }

    createRecentSearchElement(item, index) {
        const element = document.createElement('div');
        element.className = 'search-result-item recent-search-item';
        element.setAttribute('role', 'option');
        element.setAttribute('tabindex', '0');

        element.innerHTML = `
            <div class="search-result-content">
                <div class="search-result-identity">
                    ${item.identity || 'Recent Search'}
                </div>
                <div class="search-result-address" title="${item.address}">
                    ${this.truncateAddress(item.address)}
                </div>
                <div class="search-result-details">
                    <span class="timestamp">${this.formatRelativeTime(item.timestamp)}</span>
                </div>
            </div>
            <button class="remove-history-btn" title="Remove from history">×</button>
        `;

        // Add click handlers
        element.addEventListener('click', (e) => {
            if (!e.target.classList.contains('remove-history-btn')) {
                this.selectResult(element, item);
            }
        });

        element.querySelector('.remove-history-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.removeFromSearchHistory(item.address);
            element.remove();
        });

        return element;
    }

    displayNoResults(query) {
        const validation = this.validatePolkadotAddress(query);
        
        this.resultsContainer.innerHTML = `
            <div class="search-no-results">
                <div class="no-results-icon">🔍</div>
                <div class="no-results-message">
                    ${validation.isValid ? 
                        'No results found for this address.' : 
                        'No results found. Try searching by identity name or check the address format.'
                    }
                </div>
                ${this.getSuggestionText(query)}
            </div>
        `;
        
        this.showResults();
    }

    getSuggestionText(query) {
        const suggestions = [];
        
        if (query.length > 10 && !this.validatePolkadotAddress(query).isValid) {
            suggestions.push('• Ensure the address is a valid Polkadot SS58 format');
        }
        
        if (query.length < 10) {
            suggestions.push('• Try entering more characters');
        }
        
        suggestions.push('• Search by identity name (e.g. "Alice", "Treasury")');
        suggestions.push('• Check for typos in the address');
        
        return suggestions.length > 0 ? `
            <div class="search-suggestions">
                <strong>Suggestions:</strong>
                <ul>
                    ${suggestions.map(s => `<li>${s}</li>`).join('')}
                </ul>
            </div>
        ` : '';
    }

    addSearchSuggestions(query) {
        // Add did-you-mean suggestions for common typos
        if (this.shouldShowTypoSuggestion(query)) {
            const suggestion = this.generateTypoSuggestion(query);
            if (suggestion) {
                const suggestionElement = document.createElement('div');
                suggestionElement.className = 'search-suggestion-item';
                suggestionElement.innerHTML = `
                    <div class="suggestion-content">
                        Did you mean: <strong>${suggestion}</strong>?
                    </div>
                `;
                
                suggestionElement.addEventListener('click', () => {
                    this.searchInput.value = suggestion;
                    this.performSearch(suggestion);
                });
                
                this.resultsContainer.appendChild(suggestionElement);
            }
        }
    }

    // Validation Methods
    validatePolkadotAddress(address) {
        // Use the enhanced validator if available
        if (typeof window !== 'undefined' && window.polkadotAddressValidator) {
            const result = window.polkadotAddressValidator.validateAddress(address, {
                allowedNetworks: ['polkadot', 'kusama', 'substrate'],
                strictFormat: false,
                cacheResults: true
            });
            
            return {
                isValid: result.isValid,
                error: result.error || null,
                networkInfo: result.networkInfo,
                warnings: result.warnings || []
            };
        }

        // Fallback to basic validation
        if (!address || typeof address !== 'string') {
            return { isValid: false, error: 'Address must be a string' };
        }

        // Polkadot addresses use SS58 format
        // They start with '1' and are 48 characters long, or other prefixes for different networks
        const ss58Regex = /^[1-9A-HJ-NP-Za-km-z]{47,50}$/;
        
        if (!ss58Regex.test(address)) {
            return { 
                isValid: false, 
                error: 'Invalid Polkadot address format. Should be 47-50 characters using SS58 encoding.' 
            };
        }
        
        return { isValid: true };
    }

    isLikelyIdentitySearch(query) {
        // Check if query looks like an identity search (contains letters, shorter, etc.)
        return query.length < 20 && /[a-zA-Z]/.test(query) && !/^[1-9A-HJ-NP-Za-km-z]{40,}$/.test(query);
    }

    showValidationFeedback(query) {
        const validation = this.validatePolkadotAddress(query);
        
        // Remove existing validation feedback
        const existing = this.searchInput.parentNode.querySelector('.validation-feedback');
        if (existing) {
            existing.remove();
        }

        // Skip validation feedback for short queries (likely identity searches)
        if (query.length < 10) {
            this.searchInput.classList.remove('error', 'warning');
            return;
        }

        if (!validation.isValid && !this.isLikelyIdentitySearch(query)) {
            this.searchInput.classList.add('warning');
            this.searchInput.classList.remove('error');
            
            const feedback = document.createElement('div');
            feedback.className = 'validation-feedback warning';
            feedback.textContent = 'Address format may be invalid';
            this.searchInput.parentNode.appendChild(feedback);
        } else {
            this.searchInput.classList.remove('error', 'warning');
        }
    }

    showValidationError(message) {
        this.searchInput.classList.add('error');
        
        // Remove existing feedback
        const existing = this.searchInput.parentNode.querySelector('.validation-feedback');
        if (existing) {
            existing.remove();
        }
        
        const feedback = document.createElement('div');
        feedback.className = 'validation-feedback error';
        feedback.textContent = message;
        this.searchInput.parentNode.appendChild(feedback);
        
        setTimeout(() => {
            feedback.remove();
            this.searchInput.classList.remove('error');
        }, 5000);
    }

    // Utility Methods
    highlightMatch(text, query) {
        if (!query || !text) return text;
        
        const regex = new RegExp(`(${this.escapeRegex(query)})`, 'gi');
        return text.replace(regex, '<mark>$1</mark>');
    }

    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    truncateAddress(address, start = 8, end = 8) {
        if (!address || address.length <= start + end + 3) return address;
        return `${address.substring(0, start)}...${address.substring(address.length - end)}`;
    }

    formatBalance(balance) {
        if (!balance || balance === '0') return '0 DOT';
        
        // Convert from Planck to DOT (10^10 Planck = 1 DOT for Polkadot)
        const dots = parseFloat(balance) / Math.pow(10, 10);
        
        if (dots >= 1000000) {
            return `${(dots / 1000000).toFixed(2)}M DOT`;
        } else if (dots >= 1000) {
            return `${(dots / 1000).toFixed(2)}K DOT`;
        } else {
            return `${dots.toFixed(4)} DOT`;
        }
    }

    formatRelativeTime(timestamp) {
        const now = Date.now();
        const time = new Date(timestamp).getTime();
        const diff = now - time;
        
        const minute = 60 * 1000;
        const hour = 60 * minute;
        const day = 24 * hour;
        
        if (diff < minute) {
            return 'Just now';
        } else if (diff < hour) {
            const mins = Math.floor(diff / minute);
            return `${mins}m ago`;
        } else if (diff < day) {
            const hours = Math.floor(diff / hour);
            return `${hours}h ago`;
        } else {
            const days = Math.floor(diff / day);
            return `${days}d ago`;
        }
    }

    determineAddressType(account) {
        // Heuristics to determine address type
        const balance = parseFloat(account.balance || '0');
        const transferCount = (account.total_transfers_in || 0) + (account.total_transfers_out || 0);
        
        if (account.identity_verified) {
            return 'verified';
        } else if (transferCount > 1000 || balance > 1000000) {
            return 'high-activity';
        } else if (transferCount > 100) {
            return 'active';
        } else {
            return 'normal';
        }
    }

    determineRiskLevel(riskScore) {
        if (riskScore >= 0.8) return 'high';
        if (riskScore >= 0.5) return 'medium';
        if (riskScore >= 0.2) return 'low';
        return 'minimal';
    }

    createAddressTypeBadge(type) {
        const badges = {
            'verified': '<span class="address-type-badge verified">Verified</span>',
            'high-activity': '<span class="address-type-badge high-activity">High Activity</span>',
            'active': '<span class="address-type-badge active">Active</span>',
            'normal': ''
        };
        return badges[type] || '';
    }

    createRiskBadge(level) {
        if (level === 'minimal') return '';
        
        const badges = {
            'high': '<span class="risk-badge high">High Risk</span>',
            'medium': '<span class="risk-badge medium">Medium Risk</span>',
            'low': '<span class="risk-badge low">Low Risk</span>'
        };
        return badges[level] || '';
    }

    shouldShowTypoSuggestion(query) {
        // Show typo suggestions for addresses that are close to valid format but not quite right
        return query.length > 40 && query.length < 60 && !this.validatePolkadotAddress(query).isValid;
    }

    generateTypoSuggestion(query) {
        // Use enhanced validator if available
        if (typeof window !== 'undefined' && window.polkadotAddressValidator) {
            const suggestions = window.polkadotAddressValidator.suggestCorrections(query);
            return suggestions.length > 0 ? suggestions[0] : null;
        }

        // Fallback to basic typo correction
        let corrected = query
            // Remove invalid characters
            .replace(/[^1-9A-HJ-NP-Za-km-z]/g, '')
            // Fix common character substitutions
            .replace(/0/g, 'o')  // 0 -> o
            .replace(/O/g, 'o')  // O -> o
            .replace(/I/g, '1')  // I -> 1
            .replace(/l/g, '1'); // l -> 1
        
        // Ensure proper length
        if (corrected.length > 50) {
            corrected = corrected.substring(0, 50);
        }
        
        // Only suggest if the correction is meaningful and valid format
        if (corrected !== query && corrected.length >= 47 && this.validatePolkadotAddress(corrected).isValid) {
            return corrected;
        }
        
        return null;
    }

    // Search History Management
    loadSearchHistory() {
        try {
            const stored = localStorage.getItem('polkadot-search-history');
            return stored ? JSON.parse(stored) : [];
        } catch (error) {
            console.warn('Failed to load search history:', error);
            return [];
        }
    }

    saveSearchHistory() {
        try {
            localStorage.setItem('polkadot-search-history', JSON.stringify(this.searchHistory));
        } catch (error) {
            console.warn('Failed to save search history:', error);
        }
    }

    addToSearchHistory(address, identity = null) {
        // Remove existing entry if present
        this.searchHistory = this.searchHistory.filter(item => item.address !== address);
        
        // Add to beginning
        this.searchHistory.unshift({
            address,
            identity,
            timestamp: Date.now()
        });
        
        // Limit history size
        if (this.searchHistory.length > this.options.maxSearchHistory) {
            this.searchHistory = this.searchHistory.slice(0, this.options.maxSearchHistory);
        }
        
        this.saveSearchHistory();
    }

    removeFromSearchHistory(address) {
        this.searchHistory = this.searchHistory.filter(item => item.address !== address);
        this.saveSearchHistory();
    }

    clearSearchHistory() {
        this.searchHistory = [];
        this.saveSearchHistory();
        this.hideResults();
    }

    // UI State Management
    showResults() {
        this.resultsContainer.style.display = 'block';
        this.resultsContainer.setAttribute('aria-hidden', 'false');
    }

    hideResults() {
        this.resultsContainer.style.display = 'none';
        this.resultsContainer.setAttribute('aria-hidden', 'true');
        this.selectedIndex = -1;
        
        // Clear validation feedback
        const feedback = this.searchInput.parentNode.querySelector('.validation-feedback');
        if (feedback) {
            feedback.remove();
        }
        this.searchInput.classList.remove('error', 'warning');
    }

    setLoading(loading) {
        this.isLoading = loading;
        this.searchButton.disabled = loading;
        
        if (loading) {
            this.searchButton.innerHTML = '<span class="loading-spinner"></span> Searching...';
            this.showLoadingIndicator();
        } else {
            this.searchButton.innerHTML = 'Search';
            this.hideLoadingIndicator();
        }
    }

    createLoadingIndicator() {
        if (!document.querySelector('.search-loading-indicator')) {
            const indicator = document.createElement('div');
            indicator.className = 'search-loading-indicator';
            indicator.innerHTML = '<div class="spinner"></div><span>Searching...</span>';
            indicator.style.display = 'none';
            this.resultsContainer.parentNode.appendChild(indicator);
        }
    }

    showLoadingIndicator() {
        const indicator = document.querySelector('.search-loading-indicator');
        if (indicator) {
            indicator.style.display = 'flex';
        }
    }

    hideLoadingIndicator() {
        const indicator = document.querySelector('.search-loading-indicator');
        if (indicator) {
            indicator.style.display = 'none';
        }
    }

    showError(message) {
        this.resultsContainer.innerHTML = `
            <div class="search-error">
                <div class="error-icon">⚠️</div>
                <div class="error-message">${message}</div>
            </div>
        `;
        this.showResults();
    }

    // Utility function for debouncing
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Public API methods
    clearSearch() {
        this.searchInput.value = '';
        this.currentQuery = '';
        this.hideResults();
    }

    setQuery(query) {
        this.searchInput.value = query;
        this.currentQuery = query;
        this.performSearch(query);
    }

    focus() {
        this.searchInput.focus();
    }

    // Cleanup
    destroy() {
        if (this.abortController) {
            this.abortController.abort();
        }
        
        // Remove event listeners
        this.searchInput.removeEventListener('input', this.handleInput);
        this.searchInput.removeEventListener('focus', this.handleFocus);
        this.searchInput.removeEventListener('blur', this.handleBlur);
        this.searchButton.removeEventListener('click', this.handleSearch);
        document.removeEventListener('click', this.handleDocumentClick);
        
        // Clear timers and references
        this.searchCache.clear();
    }
}

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.polkadotSearch = new PolkadotAddressSearch({
        onSelect: (result) => {
            console.log('Address selected:', result);
        },
        autoSearch: true
    });
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PolkadotAddressSearch;
}