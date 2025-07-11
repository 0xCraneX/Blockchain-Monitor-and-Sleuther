/**
 * Custom error classes for the Polkadot Analysis Tool
 * Provides consistent error handling and structured error responses
 */

// Base error class with consistent structure
export class AppError extends Error {
  constructor(message, code, status = 500, details = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.status = status;
    this.details = details;
    this.timestamp = new Date().toISOString();
    
    // Ensure stack trace points to where error was thrown, not this constructor
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        status: this.status,
        details: this.details,
        timestamp: this.timestamp
      }
    };
  }
}

// Validation errors
export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details = {}) {
    super(message, 'VALIDATION_ERROR', 400, details);
  }
}

export class InvalidAddressError extends ValidationError {
  constructor(address, expected = 'Valid SS58 encoded Substrate address') {
    super('Invalid address format', {
      address,
      expected,
      format: 'SS58'
    });
    this.code = 'INVALID_ADDRESS';
  }
}

export class MissingParameterError extends ValidationError {
  constructor(parameter, location = 'query') {
    super(`Missing required parameter: ${parameter}`, {
      parameter,
      location
    });
    this.code = 'MISSING_PARAMETER';
  }
}

export class InvalidParameterError extends ValidationError {
  constructor(parameter, value, expected) {
    super(`Invalid parameter value: ${parameter}`, {
      parameter,
      value,
      expected
    });
    this.code = 'INVALID_PARAMETER';
  }
}

// Database errors
export class DatabaseError extends AppError {
  constructor(message = 'Database operation failed', details = {}) {
    super(message, 'DATABASE_ERROR', 500, details);
  }
}

export class DatabaseConnectionError extends DatabaseError {
  constructor(path, originalError) {
    super('Failed to connect to database', {
      path,
      cause: originalError?.message
    });
    this.code = 'DATABASE_CONNECTION_ERROR';
    this.status = 503;
  }
}

export class DatabaseConstraintError extends DatabaseError {
  constructor(constraint, operation) {
    super('Database constraint violation', {
      constraint,
      operation
    });
    this.code = 'DATABASE_CONSTRAINT_ERROR';
    this.status = 409;
  }
}

export class RecordNotFoundError extends AppError {
  constructor(resource, identifier) {
    super(`${resource} not found`, {
      resource,
      identifier
    });
    this.code = 'RECORD_NOT_FOUND';
    this.status = 404;
  }
}

// Blockchain/RPC errors
export class BlockchainError extends AppError {
  constructor(message = 'Blockchain operation failed', details = {}) {
    super(message, 'BLOCKCHAIN_ERROR', 500, details);
  }
}

export class BlockchainConnectionError extends BlockchainError {
  constructor(endpoint, originalError) {
    super('Failed to connect to blockchain node', {
      endpoint,
      cause: originalError?.message
    });
    this.code = 'BLOCKCHAIN_CONNECTION_ERROR';
    this.status = 503;
  }
}

export class BlockchainRpcError extends BlockchainError {
  constructor(method, originalError) {
    super('Blockchain RPC call failed', {
      method,
      cause: originalError?.message
    });
    this.code = 'BLOCKCHAIN_RPC_ERROR';
    this.status = 502;
  }
}

export class BlockNotFoundError extends BlockchainError {
  constructor(blockNumber) {
    super('Block not found', {
      blockNumber
    });
    this.code = 'BLOCK_NOT_FOUND';
    this.status = 404;
  }
}

export class AccountNotFoundError extends BlockchainError {
  constructor(address) {
    super('Account not found or has no activity', {
      address
    });
    this.code = 'ACCOUNT_NOT_FOUND';
    this.status = 404;
  }
}

// Authentication and authorization errors
export class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed') {
    super(message, 'AUTHENTICATION_ERROR', 401);
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'Insufficient permissions', resource) {
    super(message, 'AUTHORIZATION_ERROR', 403, { resource });
  }
}

export class InvalidTokenError extends AuthenticationError {
  constructor() {
    super('Invalid or expired authentication token');
    this.code = 'INVALID_TOKEN';
  }
}

export class MissingTokenError extends AuthenticationError {
  constructor() {
    super('Authentication token required');
    this.code = 'MISSING_TOKEN';
  }
}

// Rate limiting errors
export class RateLimitError extends AppError {
  constructor(limit, windowMs, retryAfter) {
    super('Rate limit exceeded', {
      limit,
      windowMs,
      retryAfter
    });
    this.code = 'RATE_LIMIT_EXCEEDED';
    this.status = 429;
  }
}

// Service-specific errors
export class ServiceUnavailableError extends AppError {
  constructor(service, reason = 'Service temporarily unavailable') {
    super(reason, 'SERVICE_UNAVAILABLE', 503, { service });
  }
}

export class TimeoutError extends AppError {
  constructor(operation, timeout) {
    super('Operation timed out', {
      operation,
      timeout
    });
    this.code = 'TIMEOUT_ERROR';
    this.status = 408;
  }
}

export class ConfigurationError extends AppError {
  constructor(setting, message = 'Invalid configuration') {
    super(message, 'CONFIGURATION_ERROR', 500, { setting });
  }
}

// Graph-specific errors
export class GraphError extends AppError {
  constructor(message = 'Graph operation failed', details = {}) {
    super(message, 'GRAPH_ERROR', 500, details);
  }
}

export class GraphTooLargeError extends GraphError {
  constructor(nodeCount, maxNodes) {
    super('Graph would be too large to process', {
      nodeCount,
      maxNodes
    });
    this.code = 'GRAPH_TOO_LARGE';
    this.status = 413;
  }
}

export class PathNotFoundError extends GraphError {
  constructor(from, to, maxDepth) {
    super('No path found between addresses', {
      from,
      to,
      maxDepth
    });
    this.code = 'PATH_NOT_FOUND';
    this.status = 404;
  }
}

// Export error codes for easy reference
export const ERROR_CODES = {
  // Validation
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_ADDRESS: 'INVALID_ADDRESS',
  MISSING_PARAMETER: 'MISSING_PARAMETER',
  INVALID_PARAMETER: 'INVALID_PARAMETER',
  
  // Database
  DATABASE_ERROR: 'DATABASE_ERROR',
  DATABASE_CONNECTION_ERROR: 'DATABASE_CONNECTION_ERROR',
  DATABASE_CONSTRAINT_ERROR: 'DATABASE_CONSTRAINT_ERROR',
  RECORD_NOT_FOUND: 'RECORD_NOT_FOUND',
  
  // Blockchain
  BLOCKCHAIN_ERROR: 'BLOCKCHAIN_ERROR',
  BLOCKCHAIN_CONNECTION_ERROR: 'BLOCKCHAIN_CONNECTION_ERROR',
  BLOCKCHAIN_RPC_ERROR: 'BLOCKCHAIN_RPC_ERROR',
  BLOCK_NOT_FOUND: 'BLOCK_NOT_FOUND',
  ACCOUNT_NOT_FOUND: 'ACCOUNT_NOT_FOUND',
  
  // Authentication
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR: 'AUTHORIZATION_ERROR',
  INVALID_TOKEN: 'INVALID_TOKEN',
  MISSING_TOKEN: 'MISSING_TOKEN',
  
  // Rate limiting
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  
  // Service
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
  
  // Graph
  GRAPH_ERROR: 'GRAPH_ERROR',
  GRAPH_TOO_LARGE: 'GRAPH_TOO_LARGE',
  PATH_NOT_FOUND: 'PATH_NOT_FOUND'
};

// Helper function to create appropriate error from database errors
export function createDatabaseError(error, operation = 'database operation') {
  if (error.code === 'SQLITE_CONSTRAINT') {
    return new DatabaseConstraintError(error.message, operation);
  }
  if (error.code === 'SQLITE_ERROR' || error.code === 'SQLITE_CANTOPEN') {
    return new DatabaseConnectionError(error.message, error);
  }
  return new DatabaseError(`Database ${operation} failed: ${error.message}`, {
    originalError: error.message,
    code: error.code,
    operation
  });
}

// Helper function to create appropriate error from blockchain errors
export function createBlockchainError(error, method) {
  if (error.message?.includes('connection') || error.message?.includes('connect')) {
    return new BlockchainConnectionError(method, error);
  }
  if (error.message?.includes('timeout')) {
    return new TimeoutError(`Blockchain RPC: ${method}`, error.timeout);
  }
  return new BlockchainRpcError(method, error);
}