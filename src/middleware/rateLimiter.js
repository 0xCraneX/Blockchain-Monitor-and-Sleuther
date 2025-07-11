import rateLimit from 'express-rate-limit';
import { logger } from '../utils/logger.js';

// Default rate limiter
export const rateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req, res) => {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      url: req.url
    });
    res.status(429).json({
      error: {
        message: 'Too many requests from this IP, please try again later.',
        status: 429
      }
    });
  }
});

// Stricter rate limiter for search endpoints
export const searchRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 20, // limit each IP to 20 search requests per minute
  message: 'Too many search requests, please try again later.',
  skipSuccessfulRequests: false,
  keyGenerator: (req) => {
    // Include the search query in the key to prevent abuse of specific searches
    return `${req.ip}:${req.path}:${req.query.q || ''}`;
  }
});

// Very strict rate limiter for expensive operations
export const expensiveOperationLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 5, // limit each IP to 5 expensive operations per 5 minutes
  message: 'This operation is resource intensive. Please wait before trying again.',
  skipFailedRequests: false
});