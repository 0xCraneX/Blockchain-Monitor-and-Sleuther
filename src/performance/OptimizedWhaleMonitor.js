import { Worker } from 'worker_threads';
import { cpus } from 'os';
import { EventEmitter } from 'events';
import path from 'path';
import { fileURLToPath } from 'url';
import ora from 'ora';
import chalk from 'chalk';

// Import optimized services
import { PerformanceOptimizer } from './PerformanceOptimizer.js';
import { CacheManager } from './CacheManager.js';
import { DataStreamProcessor } from './DataStreamProcessor.js';
import { FastJSONProcessor } from './FastJSONProcessor.js';
import { PatternMatcher } from './PatternMatcher.js';
import { MemoryManager } from './MemoryManager.js';
import { createLogger, formatDOT, formatDuration, formatAddress } from '../utils/logger.js';
import { 
  ALL_INTERESTING_ADDRESSES, 
  COLLECTION_LIMITS, 
  PATHS,
  TIME_CONSTANTS 
} from '../utils/constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logger = createLogger('optimized-monitor');

/**
 * OptimizedWhaleMonitor - High-performance blockchain monitoring for 1000+ accounts
 * 
 * Performance Features:
 * - Parallel processing with worker threads
 * - Streaming data processing for low memory usage
 * - Smart caching with LRU eviction
 * - Optimized pattern detection algorithms
 * - Memory-mapped file storage for fast I/O
 * - Incremental updates to minimize full scans
 */
export class OptimizedWhaleMonitor extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      // Performance settings
      workerCount: options.workerCount || Math.max(cpus().length - 1, 1),
      batchSize: options.batchSize || 50, // Accounts per batch
      maxMemoryMB: options.maxMemoryMB || 100,
      cacheSize: options.cacheSize || 10000,
      streamBufferSize: options.streamBufferSize || 1024 * 1024, // 1MB
      
      // Monitoring settings
      maxAddresses: options.maxAddresses || 1000,
      updateInterval: options.updateInterval || 60000, // 1 minute
      fullScanInterval: options.fullScanInterval || 300000, // 5 minutes
      
      // Feature flags
      enableParallel: options.enableParallel !== false,
      enableStreaming: options.enableStreaming !== false,
      enableCompression: options.enableCompression !== false,
      enableIncremental: options.enableIncremental !== false,
      
      ...options
    };
    
    // Core components
    this.optimizer = new PerformanceOptimizer(this.options);
    this.cacheManager = new CacheManager(this.options.cacheSize);
    this.streamProcessor = new DataStreamProcessor(this.options);
    this.jsonProcessor = new FastJSONProcessor();
    this.patternMatcher = new PatternMatcher();
    this.memoryManager = new MemoryManager(this.options.maxMemoryMB);
    
    // Worker pool for parallel processing
    this.workers = [];
    this.workerQueue = [];
    this.activeWorkers = 0;
    
    // Monitoring state
    this.monitoringActive = false;
    this.lastFullScan = 0;
    this.processedCount = 0;
    this.startTime = null;
    
    // Performance metrics
    this.metrics = {
      accountsProcessed: 0,
      transfersAnalyzed: 0,
      patternsDetected: 0,
      cacheHits: 0,
      cacheMisses: 0,
      workerTasks: 0,
      memoryPeakMB: 0,
      avgProcessingTime: 0,
      cycleTime: 0
    };
    
    // Initialize performance tracking
    this.performanceInterval = null;
  }

  /**
   * Initialize the monitoring system
   */
  async initialize() {
    logger.info('Initializing Optimized Whale Monitor', {
      workerCount: this.options.workerCount,
      maxAddresses: this.options.maxAddresses,
      maxMemoryMB: this.options.maxMemoryMB
    });
    
    try {
      // Initialize workers
      if (this.options.enableParallel) {
        await this.initializeWorkers();
      }
      
      // Initialize cache
      await this.cacheManager.initialize();
      
      // Initialize memory manager
      this.memoryManager.startMonitoring();
      
      // Load previous state if incremental updates enabled
      if (this.options.enableIncremental) {
        await this.loadPreviousState();
      }
      
      // Start performance monitoring
      this.startPerformanceMonitoring();
      
      logger.success('Optimized Whale Monitor initialized');
      
    } catch (error) {
      logger.error('Failed to initialize monitor', error);
      throw error;
    }
  }

  /**
   * Start monitoring addresses
   */
  async startMonitoring(addresses = null) {
    if (this.monitoringActive) {
      logger.warn('Monitoring already active');
      return;
    }
    
    this.monitoringActive = true;
    this.startTime = Date.now();
    
    // Use provided addresses or load from config
    const targetAddresses = addresses || await this.loadTargetAddresses();
    
    logger.info(`Starting monitoring for ${targetAddresses.length} addresses`);
    
    // Initial full scan
    await this.performFullScan(targetAddresses);
    
    // Start incremental monitoring
    this.startIncrementalMonitoring(targetAddresses);
    
    this.emit('monitoring:started', {
      addressCount: targetAddresses.length,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Perform optimized full scan of all addresses
   */
  async performFullScan(addresses) {
    const spinner = ora('Performing full scan...').start();
    const scanStart = Date.now();
    
    try {
      // Reset metrics for this scan
      this.metrics.cycleStart = scanStart;
      
      // Batch addresses for parallel processing
      const batches = this.createBatches(addresses, this.options.batchSize);
      
      logger.debug(`Processing ${batches.length} batches of ~${this.options.batchSize} addresses`);
      
      // Process batches in parallel
      if (this.options.enableParallel) {
        await this.processBatchesParallel(batches, spinner);
      } else {
        await this.processBatchesSerial(batches, spinner);
      }
      
      // Run pattern detection on collected data
      spinner.text = 'Detecting patterns...';
      const patterns = await this.detectPatterns();
      
      // Update metrics
      const scanDuration = Date.now() - scanStart;
      this.metrics.cycleTime = scanDuration;
      this.lastFullScan = Date.now();
      
      spinner.succeed(`Full scan completed in ${formatDuration(scanDuration)}`);
      
      // Emit results
      this.emit('scan:completed', {
        duration: scanDuration,
        addressesProcessed: this.metrics.accountsProcessed,
        patternsDetected: patterns.length,
        memoryUsageMB: this.memoryManager.getCurrentUsage()
      });
      
      return patterns;
      
    } catch (error) {
      spinner.fail('Full scan failed');
      logger.error('Error during full scan', error);
      throw error;
    }
  }

  /**
   * Process batches in parallel using worker threads
   */
  async processBatchesParallel(batches, spinner) {
    const totalBatches = batches.length;
    let completedBatches = 0;
    
    return new Promise((resolve, reject) => {
      const results = [];
      
      // Queue all batches
      batches.forEach((batch, index) => {
        this.workerQueue.push({
          id: `batch_${index}`,
          batch,
          index,
          callback: (error, result) => {
            if (error) {
              reject(error);
              return;
            }
            
            results[index] = result;
            completedBatches++;
            
            // Update progress
            const progress = (completedBatches / totalBatches * 100).toFixed(1);
            spinner.text = `Processing batches... ${progress}% (${completedBatches}/${totalBatches})`;
            
            // Check if all batches completed
            if (completedBatches === totalBatches) {
              resolve(this.mergeResults(results));
            }
          }
        });
      });
      
      // Start processing queue
      this.processWorkerQueue();
    });
  }

  /**
   * Process worker queue
   */
  processWorkerQueue() {
    while (this.workerQueue.length > 0 && this.activeWorkers < this.workers.length) {
      const task = this.workerQueue.shift();
      const worker = this.getAvailableWorker();
      
      if (worker) {
        this.activeWorkers++;
        this.metrics.workerTasks++;
        
        worker.postMessage({
          type: 'process_batch',
          taskId: task.id,
          batch: task.batch
        });
        
        // Store callback for this task
        worker.pendingTasks.set(task.id, task.callback);
      }
    }
  }

  /**
   * Initialize worker threads
   */
  async initializeWorkers() {
    const workerPath = path.join(__dirname, 'worker.js');
    
    for (let i = 0; i < this.options.workerCount; i++) {
      const worker = new Worker(workerPath, {
        workerData: {
          workerId: i,
          options: this.options
        }
      });
      
      worker.pendingTasks = new Map();
      worker.available = true;
      
      // Handle worker messages
      worker.on('message', (message) => {
        this.handleWorkerMessage(worker, message);
      });
      
      // Handle worker errors
      worker.on('error', (error) => {
        logger.error(`Worker ${i} error`, error);
      });
      
      this.workers.push(worker);
    }
    
    logger.info(`Initialized ${this.workers.length} worker threads`);
  }

  /**
   * Handle messages from workers
   */
  handleWorkerMessage(worker, message) {
    switch (message.type) {
      case 'task_complete':
        const callback = worker.pendingTasks.get(message.taskId);
        if (callback) {
          callback(null, message.result);
          worker.pendingTasks.delete(message.taskId);
        }
        
        this.activeWorkers--;
        worker.available = true;
        
        // Process next task in queue
        this.processWorkerQueue();
        break;
        
      case 'task_error':
        const errorCallback = worker.pendingTasks.get(message.taskId);
        if (errorCallback) {
          errorCallback(new Error(message.error));
          worker.pendingTasks.delete(message.taskId);
        }
        
        this.activeWorkers--;
        worker.available = true;
        break;
        
      case 'metrics':
        // Update metrics from worker
        this.updateMetrics(message.metrics);
        break;
    }
  }

  /**
   * Get available worker
   */
  getAvailableWorker() {
    return this.workers.find(w => w.available && w.pendingTasks.size === 0);
  }

  /**
   * Create batches of addresses for processing
   */
  createBatches(addresses, batchSize) {
    const batches = [];
    
    for (let i = 0; i < addresses.length; i += batchSize) {
      batches.push(addresses.slice(i, i + batchSize));
    }
    
    return batches;
  }

  /**
   * Process batches serially (fallback for non-parallel mode)
   */
  async processBatchesSerial(batches, spinner) {
    const results = [];
    
    for (let i = 0; i < batches.length; i++) {
      const progress = ((i + 1) / batches.length * 100).toFixed(1);
      spinner.text = `Processing batch ${i + 1}/${batches.length} (${progress}%)`;
      
      const result = await this.processBatch(batches[i]);
      results.push(result);
      
      // Check memory usage
      if (this.memoryManager.isNearLimit()) {
        logger.warn('Memory limit approaching, clearing cache');
        this.cacheManager.clear();
        global.gc && global.gc(); // Force garbage collection if available
      }
    }
    
    return this.mergeResults(results);
  }

  /**
   * Process a single batch of addresses
   */
  async processBatch(addresses) {
    const batchResults = {
      profiles: [],
      transfers: [],
      patterns: [],
      metrics: {
        processed: 0,
        cached: 0,
        errors: 0
      }
    };
    
    for (const addressInfo of addresses) {
      try {
        // Check cache first
        const cached = this.cacheManager.get(`profile:${addressInfo.address}`);
        if (cached && this.isCacheValid(cached)) {
          batchResults.profiles.push(cached.data);
          batchResults.metrics.cached++;
          this.metrics.cacheHits++;
          continue;
        }
        
        this.metrics.cacheMisses++;
        
        // Process address with streaming if enabled
        const profile = this.options.enableStreaming ?
          await this.streamProcessor.processAddress(addressInfo) :
          await this.processAddress(addressInfo);
        
        if (profile) {
          batchResults.profiles.push(profile);
          
          // Update cache
          this.cacheManager.set(`profile:${addressInfo.address}`, {
            data: profile,
            timestamp: Date.now()
          });
          
          // Extract patterns immediately to reduce memory
          const patterns = this.patternMatcher.extractPatterns(profile);
          if (patterns.length > 0) {
            batchResults.patterns.push(...patterns);
          }
          
          batchResults.metrics.processed++;
          this.metrics.accountsProcessed++;
        }
        
      } catch (error) {
        logger.error(`Error processing ${addressInfo.address}`, error);
        batchResults.metrics.errors++;
      }
    }
    
    return batchResults;
  }

  /**
   * Check if cached data is still valid
   */
  isCacheValid(cached) {
    const age = Date.now() - cached.timestamp;
    return age < this.options.updateInterval;
  }

  /**
   * Merge results from multiple batches
   */
  mergeResults(results) {
    const merged = {
      profiles: [],
      patterns: [],
      metrics: {
        processed: 0,
        cached: 0,
        errors: 0
      }
    };
    
    for (const result of results) {
      if (result) {
        merged.profiles.push(...(result.profiles || []));
        merged.patterns.push(...(result.patterns || []));
        
        if (result.metrics) {
          merged.metrics.processed += result.metrics.processed;
          merged.metrics.cached += result.metrics.cached;
          merged.metrics.errors += result.metrics.errors;
        }
      }
    }
    
    return merged;
  }

  /**
   * Detect patterns in collected data
   */
  async detectPatterns() {
    const patterns = [];
    
    // Get all profiles from cache
    const profiles = [];
    for (const key of this.cacheManager.keys()) {
      if (key.startsWith('profile:')) {
        const cached = this.cacheManager.get(key);
        if (cached && cached.data) {
          profiles.push(cached.data);
        }
      }
    }
    
    // Run pattern detection algorithms
    patterns.push(...this.patternMatcher.detectDormantWhales(profiles));
    patterns.push(...this.patternMatcher.detectUnusualActivity(profiles));
    patterns.push(...this.patternMatcher.detectVelocityChanges(profiles));
    patterns.push(...this.patternMatcher.detectRelationshipPatterns(profiles));
    
    this.metrics.patternsDetected = patterns.length;
    
    return patterns;
  }

  /**
   * Start incremental monitoring
   */
  startIncrementalMonitoring(addresses) {
    // Schedule incremental updates
    this.incrementalInterval = setInterval(async () => {
      if (!this.monitoringActive) return;
      
      try {
        // Check if full scan is needed
        const timeSinceLastScan = Date.now() - this.lastFullScan;
        if (timeSinceLastScan >= this.options.fullScanInterval) {
          await this.performFullScan(addresses);
        } else {
          // Perform incremental update
          await this.performIncrementalUpdate(addresses);
        }
      } catch (error) {
        logger.error('Error in incremental monitoring', error);
      }
    }, this.options.updateInterval);
  }

  /**
   * Perform incremental update (only check recently active addresses)
   */
  async performIncrementalUpdate(addresses) {
    logger.debug('Performing incremental update');
    
    // Filter addresses to check based on activity patterns
    const activeAddresses = addresses.filter(addr => {
      const cached = this.cacheManager.get(`profile:${addr.address}`);
      if (!cached || !cached.data) return true;
      
      // Check addresses that were recently active
      const profile = cached.data;
      const daysSinceLastActivity = profile.analysis?.daysSinceLastActivity || 999;
      
      // Check active addresses more frequently
      return daysSinceLastActivity < 7;
    });
    
    logger.debug(`Incremental update for ${activeAddresses.length} active addresses`);
    
    // Process only active addresses
    if (activeAddresses.length > 0) {
      const batches = this.createBatches(activeAddresses, this.options.batchSize);
      await this.processBatchesSerial(batches, { text: () => {} }); // Silent processing
      
      // Detect new patterns
      const patterns = await this.detectPatterns();
      
      if (patterns.length > 0) {
        this.emit('patterns:detected', patterns);
      }
    }
  }

  /**
   * Start performance monitoring
   */
  startPerformanceMonitoring() {
    this.performanceInterval = setInterval(() => {
      const metrics = {
        ...this.metrics,
        memoryUsageMB: this.memoryManager.getCurrentUsage(),
        cacheSize: this.cacheManager.size(),
        uptime: Date.now() - this.startTime
      };
      
      // Track peak memory
      if (metrics.memoryUsageMB > this.metrics.memoryPeakMB) {
        this.metrics.memoryPeakMB = metrics.memoryUsageMB;
      }
      
      // Calculate average processing time
      if (this.metrics.accountsProcessed > 0) {
        this.metrics.avgProcessingTime = 
          (Date.now() - this.startTime) / this.metrics.accountsProcessed;
      }
      
      this.emit('metrics:update', metrics);
    }, 5000); // Update every 5 seconds
  }

  /**
   * Get performance report
   */
  getPerformanceReport() {
    const uptime = Date.now() - this.startTime;
    const processingRate = this.metrics.accountsProcessed / (uptime / 1000); // per second
    
    return {
      summary: {
        uptime: formatDuration(uptime),
        accountsMonitored: this.options.maxAddresses,
        accountsProcessed: this.metrics.accountsProcessed,
        transfersAnalyzed: this.metrics.transfersAnalyzed,
        patternsDetected: this.metrics.patternsDetected
      },
      performance: {
        processingRate: `${processingRate.toFixed(2)} accounts/sec`,
        avgProcessingTime: `${this.metrics.avgProcessingTime.toFixed(2)}ms`,
        lastCycleTime: formatDuration(this.metrics.cycleTime),
        cacheHitRate: `${(this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses) * 100).toFixed(2)}%`,
        workerUtilization: `${(this.metrics.workerTasks / this.options.workerCount).toFixed(2)} tasks/worker`
      },
      memory: {
        currentUsageMB: this.memoryManager.getCurrentUsage().toFixed(2),
        peakUsageMB: this.metrics.memoryPeakMB.toFixed(2),
        limitMB: this.options.maxMemoryMB,
        cacheEntries: this.cacheManager.size()
      },
      optimization: {
        parallelProcessing: this.options.enableParallel,
        streaming: this.options.enableStreaming,
        compression: this.options.enableCompression,
        incrementalUpdates: this.options.enableIncremental
      }
    };
  }

  /**
   * Load target addresses (with support for 1000+ addresses)
   */
  async loadTargetAddresses() {
    // For demo, generate a large set of addresses
    const addresses = [...ALL_INTERESTING_ADDRESSES];
    
    // Add synthetic addresses for scale testing
    const syntheticCount = Math.max(0, this.options.maxAddresses - addresses.length);
    for (let i = 0; i < syntheticCount; i++) {
      addresses.push({
        address: `1synthetic${i.toString().padStart(42, '0')}`,
        name: `Synthetic Account ${i}`,
        type: 'synthetic'
      });
    }
    
    return addresses.slice(0, this.options.maxAddresses);
  }

  /**
   * Update metrics from worker results
   */
  updateMetrics(workerMetrics) {
    if (workerMetrics.transfersAnalyzed) {
      this.metrics.transfersAnalyzed += workerMetrics.transfersAnalyzed;
    }
  }

  /**
   * Load previous state for incremental updates
   */
  async loadPreviousState() {
    // Implementation would load from persistent storage
    logger.debug('Loading previous state for incremental updates');
  }

  /**
   * Stop monitoring
   */
  async stopMonitoring() {
    this.monitoringActive = false;
    
    // Clear intervals
    if (this.incrementalInterval) {
      clearInterval(this.incrementalInterval);
    }
    
    if (this.performanceInterval) {
      clearInterval(this.performanceInterval);
    }
    
    // Terminate workers
    for (const worker of this.workers) {
      await worker.terminate();
    }
    
    // Stop memory monitoring
    this.memoryManager.stopMonitoring();
    
    // Generate final report
    const report = this.getPerformanceReport();
    
    logger.info('Monitoring stopped', report.summary);
    
    this.emit('monitoring:stopped', report);
    
    return report;
  }

  /**
   * Process single address (fallback for non-streaming mode)
   */
  async processAddress(addressInfo) {
    // This would integrate with the existing SubscanService
    // For now, return mock data for performance testing
    return {
      address: addressInfo.address,
      name: addressInfo.name,
      type: addressInfo.type,
      transactionCount: Math.floor(Math.random() * 1000),
      totalVolumeSent: (BigInt(Math.floor(Math.random() * 1000000)) * BigInt(10 ** 10)).toString(),
      totalVolumeReceived: (BigInt(Math.floor(Math.random() * 1000000)) * BigInt(10 ** 10)).toString(),
      analysis: {
        daysSinceLastActivity: Math.floor(Math.random() * 365),
        isDormant: Math.random() > 0.7
      },
      counterparties: []
    };
  }
}

// Export for use
export default OptimizedWhaleMonitor;