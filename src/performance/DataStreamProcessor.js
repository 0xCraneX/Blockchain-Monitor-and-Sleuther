import { Transform, Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('stream-processor');

/**
 * DataStreamProcessor - Stream-based data processing for memory efficiency
 */
export class DataStreamProcessor {
  constructor(options = {}) {
    this.options = {
      chunkSize: options.chunkSize || 100,
      bufferSize: options.bufferSize || 1024 * 1024, // 1MB
      parallelStreams: options.parallelStreams || 4,
      ...options
    };
    
    this.activeStreams = 0;
    this.processedItems = 0;
  }

  /**
   * Process address data in streaming fashion
   */
  async processAddress(addressInfo) {
    // Create streams for processing
    const dataStream = this.createDataStream(addressInfo);
    const transformStream = this.createTransformStream();
    const aggregatorStream = this.createAggregatorStream();
    
    try {
      // Process data through pipeline
      await pipeline(
        dataStream,
        transformStream,
        aggregatorStream
      );
      
      return aggregatorStream.getResult();
      
    } catch (error) {
      logger.error('Stream processing error', error);
      throw error;
    }
  }

  /**
   * Create data stream for address
   */
  createDataStream(addressInfo) {
    let page = 0;
    let hasMore = true;
    
    return new Readable({
      objectMode: true,
      async read() {
        if (!hasMore) {
          this.push(null); // End stream
          return;
        }
        
        try {
          // Simulate data fetching (would integrate with SubscanService)
          const data = await this.fetchAddressData(addressInfo, page);
          
          if (!data || data.length === 0) {
            hasMore = false;
            this.push(null);
            return;
          }
          
          // Push data to stream
          for (const item of data) {
            this.push(item);
          }
          
          page++;
          
        } catch (error) {
          this.destroy(error);
        }
      }
    });
  }

  /**
   * Create transform stream for processing
   */
  createTransformStream() {
    return new Transform({
      objectMode: true,
      transform(chunk, encoding, callback) {
        try {
          // Process each transfer
          const processed = {
            hash: chunk.hash,
            from: chunk.from,
            to: chunk.to,
            value: BigInt(chunk.amount || '0'),
            timestamp: chunk.block_timestamp * 1000,
            block: chunk.block_num,
            fee: BigInt(chunk.fee || '0')
          };
          
          callback(null, processed);
          
        } catch (error) {
          callback(error);
        }
      }
    });
  }

  /**
   * Create aggregator stream
   */
  createAggregatorStream() {
    const profile = {
      transactionCount: 0,
      totalVolumeSent: BigInt(0),
      totalVolumeReceived: BigInt(0),
      uniqueCounterparties: new Set(),
      transfers: [],
      firstSeen: null,
      lastSeen: null
    };
    
    const stream = new Transform({
      objectMode: true,
      transform(chunk, encoding, callback) {
        // Aggregate data
        profile.transactionCount++;
        
        if (chunk.from === profile.address) {
          profile.totalVolumeSent += chunk.value;
        } else {
          profile.totalVolumeReceived += chunk.value;
        }
        
        profile.uniqueCounterparties.add(
          chunk.from === profile.address ? chunk.to : chunk.from
        );
        
        // Update timestamps
        if (!profile.firstSeen || chunk.timestamp < profile.firstSeen) {
          profile.firstSeen = chunk.timestamp;
        }
        if (!profile.lastSeen || chunk.timestamp > profile.lastSeen) {
          profile.lastSeen = chunk.timestamp;
        }
        
        // Store limited transfers
        if (profile.transfers.length < 100) {
          profile.transfers.push(chunk);
        }
        
        callback();
      },
      
      flush(callback) {
        // Final processing
        profile.totalVolumeSent = profile.totalVolumeSent.toString();
        profile.totalVolumeReceived = profile.totalVolumeReceived.toString();
        profile.uniqueCounterparties = profile.uniqueCounterparties.size;
        
        callback();
      }
    });
    
    stream.getResult = () => profile;
    
    return stream;
  }

  /**
   * Process multiple addresses in parallel streams
   */
  async processAddressesBatch(addresses) {
    const results = [];
    const chunks = this.chunkArray(addresses, this.options.parallelStreams);
    
    for (const chunk of chunks) {
      const chunkResults = await Promise.all(
        chunk.map(addr => this.processAddress(addr))
      );
      
      results.push(...chunkResults);
    }
    
    return results;
  }

  /**
   * Create batched stream processor
   */
  createBatchedStream(batchSize = 100) {
    let batch = [];
    
    return new Transform({
      objectMode: true,
      
      transform(chunk, encoding, callback) {
        batch.push(chunk);
        
        if (batch.length >= batchSize) {
          this.push(batch);
          batch = [];
        }
        
        callback();
      },
      
      flush(callback) {
        if (batch.length > 0) {
          this.push(batch);
        }
        callback();
      }
    });
  }

  /**
   * Create parallel transform stream
   */
  createParallelTransform(asyncTransform, concurrency = 4) {
    let running = 0;
    const pending = [];
    
    return new Transform({
      objectMode: true,
      
      async transform(chunk, encoding, callback) {
        if (running >= concurrency) {
          await new Promise(resolve => {
            pending.push(resolve);
          });
        }
        
        running++;
        
        try {
          const result = await asyncTransform(chunk);
          this.push(result);
        } catch (error) {
          logger.error('Parallel transform error', error);
        } finally {
          running--;
          
          if (pending.length > 0) {
            const resolve = pending.shift();
            resolve();
          }
        }
        
        callback();
      }
    });
  }

  /**
   * Create compression stream for large data
   */
  createCompressionStream() {
    return new Transform({
      objectMode: true,
      
      transform(chunk, encoding, callback) {
        try {
          // Simple compression for repeated patterns
          const compressed = this.compressData(chunk);
          callback(null, compressed);
        } catch (error) {
          callback(error);
        }
      },
      
      compressData(data) {
        // Implement simple compression
        // For addresses, we can use reference compression
        const addressMap = new Map();
        let addressId = 0;
        
        const compressed = JSON.stringify(data, (key, value) => {
          if (key === 'address' || key === 'from' || key === 'to') {
            if (!addressMap.has(value)) {
              addressMap.set(value, addressId++);
            }
            return `@${addressMap.get(value)}`;
          }
          return value;
        });
        
        return {
          data: compressed,
          addressMap: Array.from(addressMap.entries())
        };
      }
    });
  }

  /**
   * Create deduplication stream
   */
  createDeduplicationStream(keyFn) {
    const seen = new Set();
    
    return new Transform({
      objectMode: true,
      
      transform(chunk, encoding, callback) {
        const key = keyFn(chunk);
        
        if (!seen.has(key)) {
          seen.add(key);
          callback(null, chunk);
        } else {
          callback(); // Skip duplicate
        }
      }
    });
  }

  /**
   * Stream JSON parsing for large files
   */
  createJSONParseStream() {
    let buffer = '';
    
    return new Transform({
      writableObjectMode: false,
      readableObjectMode: true,
      
      transform(chunk, encoding, callback) {
        buffer += chunk.toString();
        
        // Try to parse complete JSON objects
        let startIndex = 0;
        let openBraces = 0;
        let inString = false;
        let escape = false;
        
        for (let i = 0; i < buffer.length; i++) {
          const char = buffer[i];
          
          if (!inString) {
            if (char === '{') {
              if (openBraces === 0) startIndex = i;
              openBraces++;
            } else if (char === '}') {
              openBraces--;
              
              if (openBraces === 0) {
                // Complete object found
                try {
                  const jsonStr = buffer.substring(startIndex, i + 1);
                  const obj = JSON.parse(jsonStr);
                  this.push(obj);
                } catch (error) {
                  // Invalid JSON, skip
                }
              }
            } else if (char === '"') {
              inString = true;
            }
          } else {
            if (escape) {
              escape = false;
            } else if (char === '\\') {
              escape = true;
            } else if (char === '"') {
              inString = false;
            }
          }
        }
        
        // Keep unparsed data in buffer
        if (startIndex > 0) {
          buffer = buffer.substring(startIndex);
        }
        
        callback();
      },
      
      flush(callback) {
        // Try to parse remaining buffer
        if (buffer.trim()) {
          try {
            const obj = JSON.parse(buffer);
            this.push(obj);
          } catch (error) {
            // Invalid JSON
          }
        }
        callback();
      }
    });
  }

  /**
   * Mock data fetching (would integrate with real API)
   */
  async fetchAddressData(addressInfo, page) {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Return mock data
    if (page > 5) return null;
    
    const transfers = [];
    for (let i = 0; i < 100; i++) {
      transfers.push({
        hash: `0x${Math.random().toString(16).substring(2)}`,
        from: Math.random() > 0.5 ? addressInfo.address : `0x${Math.random().toString(16).substring(2)}`,
        to: Math.random() > 0.5 ? addressInfo.address : `0x${Math.random().toString(16).substring(2)}`,
        amount: Math.floor(Math.random() * 1000000000000000).toString(),
        block_timestamp: Math.floor(Date.now() / 1000) - Math.floor(Math.random() * 86400 * 365),
        block_num: Math.floor(Math.random() * 1000000),
        fee: Math.floor(Math.random() * 1000000000).toString()
      });
    }
    
    return transfers;
  }

  /**
   * Chunk array into smaller pieces
   */
  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Get processing statistics
   */
  getStats() {
    return {
      activeStreams: this.activeStreams,
      processedItems: this.processedItems,
      options: this.options
    };
  }
}

export default DataStreamProcessor;