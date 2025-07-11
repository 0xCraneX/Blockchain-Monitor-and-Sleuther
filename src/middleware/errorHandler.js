import { logger } from '../utils/logger.js';

export function errorHandler(err, req, res, next) {
  // Log error
  logger.error('Request error', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip
  });

  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  // Default error
  let status = err.status || 500;
  let message = err.message || 'Internal Server Error';
  let details = null;

  // Handle specific error types
  if (err.name === 'ValidationError') {
    status = 400;
    message = 'Validation Error';
    details = isDevelopment ? err.details : undefined;
  } else if (err.name === 'UnauthorizedError') {
    status = 401;
    message = 'Unauthorized';
  } else if (err.name === 'ForbiddenError') {
    status = 403;
    message = 'Forbidden';
  } else if (err.name === 'NotFoundError') {
    status = 404;
    message = 'Not Found';
  } else if (err.code === 'SQLITE_CONSTRAINT') {
    status = 409;
    message = 'Conflict';
  } else if (err.code === 'SQLITE_ERROR') {
    status = 500;
    message = 'Database Error';
  }

  // Send error response
  res.status(status).json({
    error: {
      message,
      status,
      ...(isDevelopment && { 
        details,
        stack: err.stack 
      })
    }
  });
}