import { describe, it, expect } from 'vitest';

describe('Basic Tests', () => {
  it('should pass a simple test', () => {
    expect(1 + 1).toBe(2);
  });

  it('should test string operations', () => {
    const message = 'Hello World';
    expect(message).toContain('World');
    expect(message.length).toBe(11);
  });

  it('should test array operations', () => {
    const numbers = [1, 2, 3, 4, 5];
    expect(numbers).toHaveLength(5);
    expect(numbers.includes(3)).toBe(true);
  });

  it('should test async operations', async () => {
    const promise = new Promise(resolve => {
      setTimeout(() => resolve('async result'), 10);
    });
    
    const result = await promise;
    expect(result).toBe('async result');
  });
});