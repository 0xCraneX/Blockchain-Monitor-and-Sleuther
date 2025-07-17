import { logger } from '../utils/logger.js';

/**
 * Response sanitization middleware
 * Validates and sanitizes response data before sending to frontend
 */
export function responseSanitizer(req, res, next) {
  // Override res.json to add sanitization
  const originalJson = res.json;
  
  res.json = function(data) {
    try {
      // Only sanitize for graph endpoints
      if (req.path.includes('/graph/') && data && typeof data === 'object') {
        const sanitized = sanitizeGraphResponse(data);
        return originalJson.call(this, sanitized);
      }
      
      return originalJson.call(this, data);
    } catch (error) {
      logger.error('Response sanitization failed', {
        error: error.message,
        path: req.path,
        method: req.method
      });
      
      // Return original data if sanitization fails
      return originalJson.call(this, data);
    }
  };
  
  next();
}

/**
 * Sanitize graph response data
 * @param {Object} data - Response data
 * @returns {Object} Sanitized data
 */
function sanitizeGraphResponse(data) {
  if (!data || typeof data !== 'object') {
    return data;
  }

  const sanitized = { ...data };

  // Sanitize nodes array
  if (Array.isArray(sanitized.nodes)) {
    sanitized.nodes = sanitized.nodes.map((node, index) => {
      const sanitizedNode = { ...node };
      
      // Ensure required ID field
      if (!sanitizedNode.id && sanitizedNode.address) {
        sanitizedNode.id = sanitizedNode.address;
      }
      
      // Sanitize balance fields
      if (sanitizedNode.balance) {
        sanitizedNode.balance = {
          free: sanitizeBalanceField(sanitizedNode.balance.free),
          reserved: sanitizeBalanceField(sanitizedNode.balance.reserved),
          frozen: sanitizeBalanceField(sanitizedNode.balance.frozen)
        };
      }
      
      // Ensure required fields have defaults
      if (sanitizedNode.nodeType === undefined) {
        sanitizedNode.nodeType = 'regular';
      }
      if (sanitizedNode.suggestedSize === undefined) {
        sanitizedNode.suggestedSize = 40;
      }
      if (!sanitizedNode.suggestedColor) {
        sanitizedNode.suggestedColor = '#9E9E9E';
      }
      
      // Ensure numeric fields are numbers
      if (typeof sanitizedNode.degree !== 'number') {
        sanitizedNode.degree = 0;
      }
      if (typeof sanitizedNode.inDegree !== 'number') {
        sanitizedNode.inDegree = 0;
      }
      if (typeof sanitizedNode.outDegree !== 'number') {
        sanitizedNode.outDegree = 0;
      }
      
      return sanitizedNode;
    });
    
    // Remove any nodes without valid IDs after sanitization
    sanitized.nodes = sanitized.nodes.filter(node => node.id);
  }

  // Sanitize edges array
  if (Array.isArray(sanitized.edges)) {
    const validNodeIds = new Set(sanitized.nodes?.map(n => n.id) || []);
    
    sanitized.edges = sanitized.edges
      .map(edge => {
        const sanitizedEdge = { ...edge };
        
        // Ensure required fields
        if (!sanitizedEdge.id && sanitizedEdge.source && sanitizedEdge.target) {
          sanitizedEdge.id = `${sanitizedEdge.source}->${sanitizedEdge.target}`;
        }
        if (sanitizedEdge.volume === undefined) {
          sanitizedEdge.volume = '0';
        }
        if (sanitizedEdge.count === undefined) {
          sanitizedEdge.count = 0;
        }
        if (sanitizedEdge.suggestedWidth === undefined) {
          sanitizedEdge.suggestedWidth = 2;
        }
        if (!sanitizedEdge.suggestedColor) {
          sanitizedEdge.suggestedColor = '#999999';
        }
        
        return sanitizedEdge;
      })
      // Remove edges that reference invalid nodes
      .filter(edge => 
        edge.source && 
        edge.target && 
        validNodeIds.has(edge.source) && 
        validNodeIds.has(edge.target)
      );
  }

  // Update metadata to reflect any changes
  if (sanitized.metadata) {
    sanitized.metadata.totalNodes = sanitized.nodes?.length || 0;
    sanitized.metadata.totalEdges = sanitized.edges?.length || 0;
    sanitized.metadata.sanitized = true;
    sanitized.metadata.sanitizedAt = new Date().toISOString();
  }

  return sanitized;
}

/**
 * Sanitize balance field value
 * @param {*} value - Balance value
 * @returns {string} Sanitized balance as string
 */
function sanitizeBalanceField(value) {
  if (value === null || value === undefined) {
    return '0';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    return value.toString();
  }
  if (typeof value === 'object') {
    // Handle nested balance objects
    if (value.free !== undefined) {
      return sanitizeBalanceField(value.free);
    }
    // If it's an empty object or other invalid object, return '0'
    return '0';
  }
  // For any other type, convert to string or default to '0'
  try {
    return String(value);
  } catch (error) {
    logger.warn('Failed to sanitize balance field in middleware, using default', { value });
    return '0';
  }
}