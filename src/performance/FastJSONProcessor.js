import { createLogger } from '../utils/logger.js';

const logger = createLogger('fast-json');

/**
 * FastJSONProcessor - Optimized JSON parsing and stringification
 */
export class FastJSONProcessor {
  constructor() {
    // Pre-compiled schemas for common data structures
    this.schemas = new Map();
    
    // Buffer pool for reuse
    this.bufferPool = [];
    this.maxBufferSize = 1024 * 1024; // 1MB
    
    // String intern pool for common strings
    this.stringPool = new Map();
    
    // Initialize common strings
    this.initializeStringPool();
  }

  /**
   * Initialize string pool with common blockchain terms
   */
  initializeStringPool() {
    const commonStrings = [
      'address', 'hash', 'block', 'timestamp', 'value', 'from', 'to',
      'type', 'status', 'success', 'error', 'transfers', 'balance',
      'nonce', 'fee', 'data', 'extrinsic', 'event', 'method', 'section'
    ];
    
    for (const str of commonStrings) {
      this.stringPool.set(str, str);
    }
  }

  /**
   * Fast parse with optimization
   */
  parse(jsonString, schema = null) {
    try {
      // Use schema if provided for validation
      if (schema) {
        return this.parseWithSchema(jsonString, schema);
      }
      
      // Standard parse with reviver for optimization
      return JSON.parse(jsonString, this.createReviver());
      
    } catch (error) {
      logger.error('JSON parse error', error);
      throw error;
    }
  }

  /**
   * Parse with schema validation
   */
  parseWithSchema(jsonString, schema) {
    const obj = JSON.parse(jsonString);
    
    // Validate against schema
    this.validateSchema(obj, schema);
    
    return obj;
  }

  /**
   * Create optimized reviver function
   */
  createReviver() {
    return (key, value) => {
      // Intern common strings
      if (typeof value === 'string' && this.stringPool.has(value)) {
        return this.stringPool.get(value);
      }
      
      // Convert BigInt strings
      if (typeof value === 'string' && /^\d{15,}$/.test(value)) {
        try {
          return BigInt(value);
        } catch {
          return value;
        }
      }
      
      return value;
    };
  }

  /**
   * Fast stringify with optimization
   */
  stringify(obj, schema = null) {
    try {
      // Use schema if provided for optimization
      if (schema) {
        return this.stringifyWithSchema(obj, schema);
      }
      
      // Use replacer for BigInt handling
      return JSON.stringify(obj, this.createReplacer());
      
    } catch (error) {
      logger.error('JSON stringify error', error);
      throw error;
    }
  }

  /**
   * Create optimized replacer function
   */
  createReplacer() {
    return (key, value) => {
      // Handle BigInt
      if (typeof value === 'bigint') {
        return value.toString();
      }
      
      // Handle undefined/null
      if (value === undefined) {
        return null;
      }
      
      return value;
    };
  }

  /**
   * Stringify with schema optimization
   */
  stringifyWithSchema(obj, schema) {
    // Build optimized string using schema
    const parts = [];
    
    this.buildFromSchema(obj, schema, parts);
    
    return parts.join('');
  }

  /**
   * Build JSON string from schema
   */
  buildFromSchema(obj, schema, parts) {
    parts.push('{');
    
    const keys = Object.keys(schema);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      
      if (i > 0) parts.push(',');
      
      parts.push('"', key, '":');
      
      const value = obj[key];
      const valueSchema = schema[key];
      
      if (value === null || value === undefined) {
        parts.push('null');
      } else if (valueSchema.type === 'object') {
        this.buildFromSchema(value, valueSchema.properties, parts);
      } else if (valueSchema.type === 'array') {
        this.buildArray(value, valueSchema.items, parts);
      } else {
        parts.push(JSON.stringify(value));
      }
    }
    
    parts.push('}');
  }

  /**
   * Build array JSON
   */
  buildArray(arr, itemSchema, parts) {
    parts.push('[');
    
    for (let i = 0; i < arr.length; i++) {
      if (i > 0) parts.push(',');
      
      if (itemSchema && itemSchema.type === 'object') {
        this.buildFromSchema(arr[i], itemSchema.properties, parts);
      } else {
        parts.push(JSON.stringify(arr[i]));
      }
    }
    
    parts.push(']');
  }

  /**
   * Stream parse large JSON files
   */
  async parseStream(stream, onObject) {
    const chunks = [];
    let buffer = '';
    let depth = 0;
    let inString = false;
    let escape = false;
    
    for await (const chunk of stream) {
      buffer += chunk.toString();
      
      // Simple JSON object detection
      for (let i = 0; i < buffer.length; i++) {
        const char = buffer[i];
        
        if (!inString) {
          if (char === '"') {
            inString = true;
          } else if (char === '{') {
            depth++;
          } else if (char === '}') {
            depth--;
            
            if (depth === 0) {
              // Complete object found
              const jsonStr = buffer.substring(0, i + 1);
              buffer = buffer.substring(i + 1);
              
              try {
                const obj = this.parse(jsonStr);
                await onObject(obj);
              } catch (error) {
                logger.error('Stream parse error', error);
              }
              
              i = -1; // Reset position
            }
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
    }
  }

  /**
   * Batch parse multiple JSON strings
   */
  parseBatch(jsonStrings) {
    const results = [];
    const errors = [];
    
    for (let i = 0; i < jsonStrings.length; i++) {
      try {
        results.push(this.parse(jsonStrings[i]));
      } catch (error) {
        errors.push({ index: i, error: error.message });
        results.push(null);
      }
    }
    
    return { results, errors };
  }

  /**
   * Compact JSON (remove whitespace)
   */
  compact(jsonString) {
    return jsonString.replace(/\s+/g, '');
  }

  /**
   * Pretty print JSON
   */
  pretty(obj, indent = 2) {
    return JSON.stringify(obj, this.createReplacer(), indent);
  }

  /**
   * Validate schema
   */
  validateSchema(obj, schema) {
    for (const [key, valueSchema] of Object.entries(schema)) {
      const value = obj[key];
      
      // Check required
      if (valueSchema.required && value === undefined) {
        throw new Error(`Missing required field: ${key}`);
      }
      
      // Check type
      if (value !== undefined && value !== null) {
        const actualType = Array.isArray(value) ? 'array' : typeof value;
        if (actualType !== valueSchema.type) {
          throw new Error(`Type mismatch for ${key}: expected ${valueSchema.type}, got ${actualType}`);
        }
      }
    }
  }

  /**
   * Create schema from sample object
   */
  createSchema(sampleObj) {
    const schema = {};
    
    for (const [key, value] of Object.entries(sampleObj)) {
      const type = Array.isArray(value) ? 'array' : typeof value;
      
      schema[key] = {
        type,
        required: true
      };
      
      if (type === 'object' && value !== null) {
        schema[key].properties = this.createSchema(value);
      } else if (type === 'array' && value.length > 0) {
        const itemType = typeof value[0];
        schema[key].items = {
          type: itemType
        };
        
        if (itemType === 'object') {
          schema[key].items.properties = this.createSchema(value[0]);
        }
      }
    }
    
    return schema;
  }

  /**
   * Memory-efficient JSON diff
   */
  diff(obj1, obj2) {
    const changes = {
      added: {},
      removed: {},
      modified: {}
    };
    
    // Check obj1 keys
    for (const key in obj1) {
      if (!(key in obj2)) {
        changes.removed[key] = obj1[key];
      } else if (obj1[key] !== obj2[key]) {
        changes.modified[key] = {
          old: obj1[key],
          new: obj2[key]
        };
      }
    }
    
    // Check obj2 keys
    for (const key in obj2) {
      if (!(key in obj1)) {
        changes.added[key] = obj2[key];
      }
    }
    
    return changes;
  }

  /**
   * Apply JSON patch
   */
  patch(obj, changes) {
    const result = { ...obj };
    
    // Remove keys
    for (const key in changes.removed) {
      delete result[key];
    }
    
    // Add keys
    for (const key in changes.added) {
      result[key] = changes.added[key];
    }
    
    // Modify keys
    for (const key in changes.modified) {
      result[key] = changes.modified[key].new;
    }
    
    return result;
  }

  /**
   * Get buffer from pool or create new
   */
  getBuffer(size) {
    // Try to reuse buffer from pool
    for (let i = 0; i < this.bufferPool.length; i++) {
      if (this.bufferPool[i].length >= size) {
        return this.bufferPool.splice(i, 1)[0];
      }
    }
    
    // Create new buffer
    return Buffer.allocUnsafe(size);
  }

  /**
   * Return buffer to pool
   */
  releaseBuffer(buffer) {
    if (buffer.length <= this.maxBufferSize && this.bufferPool.length < 10) {
      this.bufferPool.push(buffer);
    }
  }
}

export default FastJSONProcessor;