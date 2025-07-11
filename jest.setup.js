// Jest setup for ES modules compatibility
import { TextEncoder, TextDecoder } from 'util';

// Polyfill for TextEncoder/TextDecoder in Node.js test environment
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Mock for import.meta.url if needed
if (typeof import.meta === 'undefined') {
  global.import = {
    meta: {
      url: 'file://' + __filename
    }
  };
}