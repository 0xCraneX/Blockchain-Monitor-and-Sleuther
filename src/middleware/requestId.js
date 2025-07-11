import { randomUUID } from 'crypto';

/**
 * Middleware to add unique request IDs for tracking and debugging
 * Adds request ID to request object and response headers
 */
export function requestIdMiddleware(req, res, next) {
  // Check if request already has an ID (from load balancer or proxy)
  const existingId = req.headers['x-request-id'] || 
                    req.headers['x-correlation-id'] || 
                    req.headers['request-id'];

  // Generate new ID if none exists
  const requestId = existingId || randomUUID();

  // Add to request object for use in handlers and logging
  req.requestId = requestId;

  // Add to response headers for client tracking
  res.setHeader('X-Request-ID', requestId);

  // Continue to next middleware
  next();
}

/**
 * Get request ID from request object or generate new one
 */
export function getRequestId(req) {
  return req?.requestId || randomUUID();
}