import rateLimit from 'express-rate-limit';
import { logger } from '../utils/logger.js';

// Default rate limiter
export const rateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60 * 1000, // 1 minute
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: true, // Enable the `X-RateLimit-*` headers as requested
  handler: (req, res) => {
    const resetTime = new Date(Date.now() + parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60 * 1000);
    
    // Add custom rate limit headers
    res.set({
      'X-RateLimit-Limit': parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
      'X-RateLimit-Remaining': 0,
      'X-RateLimit-Reset': Math.ceil(resetTime.getTime() / 1000),
      'Retry-After': Math.ceil((resetTime.getTime() - Date.now()) / 1000)
    });
    
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      url: req.url
    });
    res.status(429).json({
      error: {
        message: 'Too many requests from this IP, please try again later.',
        status: 429,
        retryAfter: Math.ceil((resetTime.getTime() - Date.now()) / 1000)
      }
    });
  }
});

// Rate limiter for search endpoints - 50 requests per minute in production
export const searchRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: process.env.NODE_ENV === 'test' ? 1000 : (process.env.NODE_ENV === 'development' ? 100 : 50),
  message: 'Too many search requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: true, // Enable X-RateLimit-* headers
  skipSuccessfulRequests: false,
  keyGenerator: (req) => {
    // Include the search query in the key to prevent abuse of specific searches
    return `${req.ip}:${req.path}:${req.query.q || ''}`;
  },
  handler: (req, res) => {
    const resetTime = new Date(Date.now() + 60 * 1000);
    const maxRequests = process.env.NODE_ENV === 'test' ? 1000 : (process.env.NODE_ENV === 'development' ? 100 : 50);
    
    res.set({
      'X-RateLimit-Limit': maxRequests,
      'X-RateLimit-Remaining': 0,
      'X-RateLimit-Reset': Math.ceil(resetTime.getTime() / 1000),
      'Retry-After': Math.ceil((resetTime.getTime() - Date.now()) / 1000)
    });
    
    logger.warn('Search rate limit exceeded', {
      ip: req.ip,
      url: req.url,
      query: req.query.q
    });
    res.status(429).json({
      error: {
        message: 'Too many search requests, please try again later.',
        status: 429,
        retryAfter: Math.ceil((resetTime.getTime() - Date.now()) / 1000)
      }
    });
  }
});

// Rate limiter for expensive operations (graph queries) - 20 requests per minute
export const expensiveOperationLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: process.env.NODE_ENV === 'test' ? 1000 : (process.env.NODE_ENV === 'development' ? 40 : 20),
  message: 'This operation is resource intensive. Please wait before trying again.',
  standardHeaders: true,
  legacyHeaders: true, // Enable X-RateLimit-* headers
  skipFailedRequests: false,
  handler: (req, res) => {
    const resetTime = new Date(Date.now() + 60 * 1000);
    const maxRequests = process.env.NODE_ENV === 'test' ? 1000 : (process.env.NODE_ENV === 'development' ? 40 : 20);
    
    res.set({
      'X-RateLimit-Limit': maxRequests,
      'X-RateLimit-Remaining': 0,
      'X-RateLimit-Reset': Math.ceil(resetTime.getTime() / 1000),
      'Retry-After': Math.ceil((resetTime.getTime() - Date.now()) / 1000)
    });
    
    logger.warn('Expensive operation rate limit exceeded', {
      ip: req.ip,
      url: req.url
    });
    res.status(429).json({
      error: {
        message: 'This operation is resource intensive. Please wait before trying again.',
        status: 429,
        retryAfter: Math.ceil((resetTime.getTime() - Date.now()) / 1000)
      }
    });
  }
});