import { logger } from '../utils/logger.js';
import { AppError } from '../errors/index.js';
import { getRequestId } from './requestId.js';

export function errorHandler(err, req, res, _next) {
  const requestId = getRequestId(req);
  const isDevelopment = process.env.NODE_ENV === 'development';

  // Create error response structure
  let errorResponse;

  if (err instanceof AppError) {
    // Our custom errors already have the right structure
    errorResponse = err.toJSON();
  } else {
    // Handle other errors (Express, validation, etc.)
    let status = err.status || err.statusCode || 500;
    let code = 'INTERNAL_SERVER_ERROR';
    let message = err.message || 'An unexpected error occurred';
    let details = {};

    // Handle specific error types
    if (err.name === 'ValidationError' || err.name === 'ZodError') {
      status = 400;
      code = 'VALIDATION_ERROR';
      message = 'Invalid request data';
      details = isDevelopment ? (err.errors || err.issues || {}) : {};
    } else if (err.name === 'UnauthorizedError') {
      status = 401;
      code = 'AUTHENTICATION_ERROR';
      message = 'Authentication required';
    } else if (err.name === 'ForbiddenError') {
      status = 403;
      code = 'AUTHORIZATION_ERROR';
      message = 'Access forbidden';
    } else if (err.name === 'NotFoundError') {
      status = 404;
      code = 'RESOURCE_NOT_FOUND';
      message = 'Resource not found';
    } else if (err.code === 'SQLITE_CONSTRAINT') {
      status = 409;
      code = 'DATABASE_CONSTRAINT_ERROR';
      message = 'Data conflict detected';
    } else if (err.code === 'SQLITE_ERROR' || err.code === 'SQLITE_CANTOPEN') {
      status = 500;
      code = 'DATABASE_ERROR';
      message = 'Database operation failed';
    } else if (err.name === 'SyntaxError') {
      status = 400;
      code = 'INVALID_JSON';
      message = 'Invalid JSON in request body';
    }

    errorResponse = {
      error: {
        code,
        message,
        status,
        details
      }
    };
  }

  // Add request ID to error response
  errorResponse.error.requestId = requestId;
  errorResponse.error.timestamp = new Date().toISOString();

  // Log error with context (filter sensitive data)
  const logContext = {
    requestId,
    error: err.message,
    code: errorResponse.error.code,
    status: errorResponse.error.status,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    ...(req.params && Object.keys(req.params).length > 0 && { params: filterSensitiveData(req.params) }),
    ...(req.query && Object.keys(req.query).length > 0 && { query: filterSensitiveData(req.query) }),
    ...(req.body && Object.keys(req.body).length > 0 && { body: filterSensitiveData(req.body) })
  };

  // Include stack trace in development
  if (isDevelopment) {
    logContext.stack = err.stack;
    errorResponse.error.stack = err.stack;
  }

  // Log with appropriate level
  if (errorResponse.error.status >= 500) {
    logger.error('Server error', logContext);
  } else if (errorResponse.error.status >= 400) {
    logger.warn('Client error', logContext);
  } else {
    logger.info('Request error', logContext);
  }

  // Set response headers
  res.setHeader('Content-Type', 'application/json');

  // Send error response
  res.status(errorResponse.error.status).json(errorResponse);
}

/**
 * Filter sensitive data from request data for logging
 * Remove or mask sensitive fields to prevent data leaks
 */
function filterSensitiveData(data) {
  if (!data || typeof data !== 'object') {
    return data;
  }

  const sensitiveFields = [
    'password', 'token', 'auth', 'authorization', 'secret', 'key',
    'private', 'credential', 'session', 'cookie', 'csrf'
  ];

  const filtered = { ...data };

  Object.keys(filtered).forEach(key => {
    const lowercaseKey = key.toLowerCase();
    if (sensitiveFields.some(field => lowercaseKey.includes(field))) {
      filtered[key] = '[REDACTED]';
    } else if (typeof filtered[key] === 'object' && filtered[key] !== null) {
      filtered[key] = filterSensitiveData(filtered[key]);
    }
  });

  return filtered;
}