import * as TWEEN from '@tweenjs/tween.js';
import { EventBus } from '../event/event-bus';
import { Graph } from './graph';
import { SearchBar } from './search-bar';
import { Network } from '../model/substrate/network';
import { Account } from '../model/ftd-model';
import { hide, show } from '../util/ui-util';
import { API } from '../api/api';

class UI {
    private readonly root: HTMLElement;
    private readonly background: HTMLDivElement;
    private readonly content: HTMLDivElement;
    private readonly eventBus = EventBus.getInstance();
    private readonly graph;
    private readonly searchBar: SearchBar;
    private readonly help: HTMLDivElement;
    private readonly showHelpButton: HTMLElement;
    private readonly hideHelpButton: HTMLElement;
    private readonly loading: HTMLDivElement;
    private readonly expansionControls: HTMLDivElement;
    private readonly depthControl: HTMLInputElement;
    private readonly depthValue: HTMLSpanElement;
    private readonly clearExpansionButton: HTMLButtonElement;
    private readonly expandAllButton: HTMLButtonElement;
    private readonly strategyControl: HTMLSelectElement;
    private readonly performanceControl: HTMLSelectElement;
    private readonly autoExpansionCheckbox: HTMLInputElement;
    private readonly loadMoreButton: HTMLButtonElement;
    private readonly progressiveStatus: HTMLDivElement;
    private readonly toggleAdvancedButton: HTMLButtonElement;
    private readonly advancedControls: HTMLDivElement;
    private readonly batchSizeControl: HTMLInputElement;
    private readonly batchSizeValue: HTMLSpanElement;
    private readonly minVolumeControl: HTMLInputElement;
    private readonly connectionFilter: HTMLSelectElement;
    private readonly smartPruningCheckbox: HTMLInputElement;
    private readonly breadcrumbTrail: HTMLDivElement;
    private readonly api: API;
    private readonly initialAddresses = [
        //'1wpTXaBGoyLNTDF9bosbJS3zh8V8D2ta7JKacveCkuCm7s6',
        '1EpEiYpWRAWmte4oPLtR5B1TZFxcBShBdjK4X9wWnq2KfLK',
        '15fTH34bbKGMUjF1bLmTqxPYgpg481imThwhWcQfCyktyBzL',
        //'13JJDv1yBfMtP1E66pHvm1ysreAXqkZHxY5jqFR4yKPfL2iB',
        //'1eUsBZgJuvpmVNBrBSRQ9gjPTuH6QMAnQrdwQ1ZXwa5FEvo',
    ];

    constructor(network: Network) {
        this.root = <HTMLElement>document.getElementById('root');
        this.background = <HTMLDivElement>document.getElementById('background');
        this.content = <HTMLDivElement>document.getElementById('content');
        this.help = <HTMLDivElement>document.getElementById('help');
        this.showHelpButton = <HTMLElement>document.getElementById('show-help-button');
        this.hideHelpButton = <HTMLElement>document.getElementById('hide-help-button');
        this.showHelpButton.addEventListener('click', (_event) => {
            show(this.help);
        });
        this.hideHelpButton.addEventListener('click', (_event) => {
            hide(this.help);
        });
        this.searchBar = new SearchBar(network, (account: Account) => {
            this.loadAccountGraph(account.address);
        });
        this.graph = new Graph(
            (address: string, depth?: number, priority?: boolean) => {
                this.expandGraph(address, depth, priority);
            },
            (address: string) => {
                this.loadAccountGraph(address);
            },
        );
        this.loading = <HTMLDivElement>document.getElementById('loading-container');
        this.expansionControls = <HTMLDivElement>document.getElementById('expansion-controls');
        this.depthControl = <HTMLInputElement>document.getElementById('depth-control');
        this.depthValue = <HTMLSpanElement>document.getElementById('depth-value');
        this.clearExpansionButton = <HTMLButtonElement>document.getElementById('clear-expansion');
        this.expandAllButton = <HTMLButtonElement>document.getElementById('expand-all');
        this.strategyControl = <HTMLSelectElement>document.getElementById('strategy-control');
        this.performanceControl = <HTMLSelectElement>document.getElementById('performance-control');
        this.autoExpansionCheckbox = <HTMLInputElement>document.getElementById('auto-expansion');
        this.loadMoreButton = <HTMLButtonElement>document.getElementById('load-more');
        this.progressiveStatus = <HTMLDivElement>document.getElementById('progressive-status');
        this.toggleAdvancedButton = <HTMLButtonElement>document.getElementById('toggle-advanced');
        this.advancedControls = <HTMLDivElement>document.getElementById('advanced-controls');
        this.batchSizeControl = <HTMLInputElement>document.getElementById('batch-size-control');
        this.batchSizeValue = <HTMLSpanElement>document.getElementById('batch-size-value');
        this.minVolumeControl = <HTMLInputElement>document.getElementById('min-volume-control');
        this.connectionFilter = <HTMLSelectElement>document.getElementById('connection-filter');
        this.smartPruningCheckbox = <HTMLInputElement>document.getElementById('smart-pruning');
        this.breadcrumbTrail = <HTMLDivElement>document.getElementById('breadcrumb-trail');
        this.api = new API(network.apiHost, network.apiPort);
        
        // Set up expansion control event handlers
        this.setupExpansionControls();
    }

    async init() {
        this.animate();
        const initialAddress =
            this.initialAddresses[Math.floor(Math.random() * this.initialAddresses.length)];
        const data = await this.api.getAccountGraph(initialAddress, 1);
        this.graph.appendData(initialAddress, data, 1);
        hide(this.loading);
    }

    private animate() {
        requestAnimationFrame(() => {
            this.animate();
        });
        TWEEN.update();
    }

    private async loadAccountGraph(address: string) {
        this.graph.reset();
        this.searchBar.disable();
        show(this.loading);
        try {
            const data = await this.api.getAccountGraph(address, 1);
            hide(this.loading);
            this.graph.appendData(address, data, 1);
            this.searchBar.enable();
        } catch (error) {
            hide(this.loading);
            this.searchBar.enable();
            alert(`Error while getting account graph: ${error}`);
        }
    }

    private async expandGraph(address: string, depth: number = 1, priority: boolean = false) {
        show(this.loading);
        try {
            const maxNodes = priority ? this.graph['maxNodesPerExpansion'] * 2 : this.graph['maxNodesPerExpansion'];
            const data = await this.api.getAccountGraph(address, depth, maxNodes);
            hide(this.loading);
            this.graph.appendData(address, data, depth);
        } catch (error) {
            hide(this.loading);
            alert(`Error while getting account graph: ${error}`);
        }
    }
    
    private setupExpansionControls(): void {
        // Depth control slider
        this.depthControl.addEventListener('input', (event) => {
            const target = event.target as HTMLInputElement;
            const depth = parseInt(target.value);
            this.depthValue.textContent = depth.toString();
            this.graph.setMaxExpansionDepth(depth);
        });
        
        // Clear expansion history
        this.clearExpansionButton.addEventListener('click', () => {
            this.graph.clearExpansionHistory();
            this.updateBreadcrumbs([]);
        });
        
        // Expand all visible nodes (within depth limit)
        this.expandAllButton.addEventListener('click', async () => {
            await this.expandAllNodes();
        });
        
        // Strategy control
        this.strategyControl.addEventListener('change', (event) => {
            const target = event.target as HTMLSelectElement;
            this.graph.setExpansionStrategy(target.value as any);
        });
        
        // Performance mode control
        this.performanceControl.addEventListener('change', (event) => {
            const target = event.target as HTMLSelectElement;
            this.graph.setPerformanceMode(target.value as any);
        });
        
        // Auto expansion toggle
        this.autoExpansionCheckbox.addEventListener('change', (event) => {
            const target = event.target as HTMLInputElement;
            this.graph.enableAutoExpansion(target.checked);
        });
        
        // Load more button
        this.loadMoreButton.addEventListener('click', async () => {
            await this.loadMoreNodes();
        });
        
        // Advanced controls toggle
        this.toggleAdvancedButton.addEventListener('click', () => {
            this.toggleAdvancedControls();
        });
        
        // Batch size control
        this.batchSizeControl.addEventListener('input', (event) => {
            const target = event.target as HTMLInputElement;
            const batchSize = parseInt(target.value);
            this.batchSizeValue.textContent = batchSize.toString();
            this.graph.setProgressiveLoadingBatchSize(batchSize);
        });
        
        // Advanced configuration controls
        this.minVolumeControl.addEventListener('change', () => {
            this.updateAdvancedConfiguration();
        });
        
        this.connectionFilter.addEventListener('change', () => {
            this.updateAdvancedConfiguration();
        });
        
        this.smartPruningCheckbox.addEventListener('change', () => {
            this.updateAdvancedConfiguration();
        });
        
        // Update breadcrumbs, performance metrics, and progressive loading status periodically
        setInterval(() => {
            this.updateBreadcrumbs(this.graph.getExpansionHistory());
            this.updatePerformanceDisplay();
            this.updateProgressiveLoadingStatus();
        }, 1000);
    }
    
    private updateBreadcrumbs(history: { address: string; timestamp: number; depth: number }[]): void {
        this.breadcrumbTrail.innerHTML = '';
        
        // Show last 10 expansions
        const recentHistory = history.slice(-10);
        
        recentHistory.forEach((item, index) => {
            const breadcrumbItem = document.createElement('div');
            breadcrumbItem.className = 'breadcrumb-item';
            breadcrumbItem.innerHTML = `
                <span>${this.truncateAddress(item.address)}</span>
                <span class="depth-badge">${item.depth}</span>
            `;
            
            breadcrumbItem.addEventListener('click', () => {
                this.loadAccountGraph(item.address);
            });
            
            this.breadcrumbTrail.appendChild(breadcrumbItem);
        });
    }
    
    private async expandAllNodes(): Promise<void> {
        // Get all expandable nodes and sort by importance
        const expandableNodes = this.graph['accounts'].filter((account: any) => 
            this.graph.canExpandNode(account.address)
        ).sort((a: any, b: any) => {
            const scoreA = this.graph['nodeImportanceScores'].get(a.address) || 
                          this.graph['calculateNodeImportance'](a);
            const scoreB = this.graph['nodeImportanceScores'].get(b.address) || 
                          this.graph['calculateNodeImportance'](b);
            return scoreB - scoreA;
        });
        
        // Expand nodes progressively with delay
        const maxConcurrent = this.graph['performanceMode'] === 'fast' ? 2 : 
                             this.graph['performanceMode'] === 'balanced' ? 3 : 5;
        
        for (let i = 0; i < Math.min(expandableNodes.length, maxConcurrent * 2); i++) {
            const node = expandableNodes[i];
            setTimeout(() => {
                if (this.graph.canExpandNode(node.address)) {
                    const depth = (this.graph['currentExpansionDepth'].get(node.address) || 0) + 1;
                    this.expandGraph(node.address, depth, true);
                }
            }, i * 1000); // 1 second delay between expansions
        }
    }
    
    private updatePerformanceDisplay(): void {
        const metrics = this.graph.getPerformanceMetrics();
        const queue = this.graph.getExpansionQueue();
        
        // Update expansion controls with performance info
        const performanceInfo = `Nodes: ${metrics.totalNodes} | Avg Time: ${metrics.averageExpansionTime.toFixed(0)}ms | Queue: ${queue.length}`;
        
        // You could add a performance display element to show this info
        console.log('Performance:', performanceInfo);
    }
    
    private async loadMoreNodes(): Promise<void> {
        this.updateProgressiveLoadingStatus('Loading more nodes...');
        this.loadMoreButton.disabled = true;
        
        try {
            const success = await this.graph.loadMoreNodes();
            
            if (success) {
                this.updateProgressiveLoadingStatus('Loaded successfully');
            } else {
                this.updateProgressiveLoadingStatus('No more nodes available');
            }
        } catch (error) {
            console.error('Error loading more nodes:', error);
            this.updateProgressiveLoadingStatus('Error loading nodes');
        } finally {
            this.loadMoreButton.disabled = false;
            
            // Reset status after 3 seconds
            setTimeout(() => {
                this.updateProgressiveLoadingStatus();
            }, 3000);
        }
    }
    
    private updateProgressiveLoadingStatus(message?: string): void {
        const statusElement = this.progressiveStatus.querySelector('.status-text');
        if (!statusElement) {
            return;
        }
        
        if (message) {
            statusElement.textContent = message;
            statusElement.className = 'status-text loading';
        } else {
            const loadingState = this.graph.getProgressiveLoadingState();
            
            if (loadingState.isLoading) {
                statusElement.textContent = 'Loading...';
                statusElement.className = 'status-text loading';
            } else if (loadingState.hasMore) {
                statusElement.textContent = `${loadingState.loadedBatches} batches loaded | ${loadingState.totalAvailable - this.graph['accounts'].length} more available`;
                statusElement.className = 'status-text';
            } else {
                statusElement.textContent = `Network complete | ${this.graph['accounts'].length} nodes total`;
                statusElement.className = 'status-text complete';
            }
            
            // Update load more button state
            this.loadMoreButton.disabled = loadingState.isLoading || !loadingState.hasMore;
        }
    }
    
    private toggleAdvancedControls(): void {
        const isVisible = this.advancedControls.style.display !== 'none';
        this.advancedControls.style.display = isVisible ? 'none' : 'block';
        this.toggleAdvancedButton.textContent = isVisible ? 'Advanced ⚙' : 'Hide Advanced ⚙';
    }
    
    private updateAdvancedConfiguration(): void {
        const config = {
            minVolume: parseFloat(this.minVolumeControl.value) || 0,
            connectionFilter: this.connectionFilter.value,
            smartPruning: this.smartPruningCheckbox.checked
        };
        
        // Apply configuration to graph
        console.log('Advanced configuration updated:', config);
        
        // You could add methods to the Graph class to handle these configurations
        // For example:
        // this.graph.setConnectionFilter(config.connectionFilter);
        // this.graph.setMinVolumeThreshold(BigInt(config.minVolume * 10_000_000));
        // this.graph.enableSmartPruning(config.smartPruning);
    }
    
    private truncateAddress(address: string): string {
        if (address.length <= 10) return address;
        return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
    }
}

export { UI };
