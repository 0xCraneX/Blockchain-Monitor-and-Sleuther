/**
 * Token Bucket Rate Limiter
 *
 * Implements a token bucket algorithm for rate limiting API requests.
 * Tokens are added at a steady rate and consumed for each request.
 */
export class TokenBucket {
  constructor(capacity, refillRate, refillPeriodMs = 1000) {
    this.capacity = capacity; // Maximum number of tokens
    this.tokens = capacity; // Current number of tokens
    this.refillRate = refillRate; // Tokens added per refill period
    this.refillPeriodMs = refillPeriodMs; // Refill period in milliseconds
    this.lastRefill = Date.now();
  }

  /**
   * Refill tokens based on elapsed time
   */
  refill() {
    const now = Date.now();
    const timePassed = now - this.lastRefill;

    if (timePassed >= this.refillPeriodMs) {
      const periodsElapsed = Math.floor(timePassed / this.refillPeriodMs);
      const tokensToAdd = periodsElapsed * this.refillRate;

      this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }
  }

  /**
   * Try to consume tokens for a request
   * @param {number} tokensNeeded - Number of tokens to consume (default: 1)
   * @returns {boolean} - true if tokens were consumed, false if not enough tokens
   */
  consume(tokensNeeded = 1) {
    this.refill();

    if (this.tokens >= tokensNeeded) {
      this.tokens -= tokensNeeded;
      return true;
    }

    return false;
  }

  /**
   * Get time until next token is available (in milliseconds)
   * @param {number} tokensNeeded - Number of tokens needed
   * @returns {number} - Time to wait in milliseconds
   */
  getWaitTime(tokensNeeded = 1) {
    this.refill();

    if (this.tokens >= tokensNeeded) {
      return 0;
    }

    const tokensShortfall = tokensNeeded - this.tokens;
    const periodsNeeded = Math.ceil(tokensShortfall / this.refillRate);

    return periodsNeeded * this.refillPeriodMs;
  }

  /**
   * Wait until tokens are available and consume them
   * @param {number} tokensNeeded - Number of tokens to consume
   * @returns {Promise<void>}
   */
  async waitAndConsume(tokensNeeded = 1) {
    const waitTime = this.getWaitTime(tokensNeeded);

    if (waitTime > 0) {
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    // Try to consume after waiting
    if (!this.consume(tokensNeeded)) {
      // If still can't consume, recursively wait again
      return this.waitAndConsume(tokensNeeded);
    }
  }

  /**
   * Get current status of the bucket
   * @returns {object} - Current status information
   */
  getStatus() {
    this.refill();

    return {
      tokens: this.tokens,
      capacity: this.capacity,
      refillRate: this.refillRate,
      nextRefillIn: this.refillPeriodMs - (Date.now() - this.lastRefill)
    };
  }
}