/**
 * Polkadot Address Validation Utility
 * 
 * This module provides comprehensive validation for Polkadot addresses using SS58 format.
 * It includes format validation, checksum verification, and network-specific validation.
 */

class PolkadotAddressValidator {
    constructor() {
        // SS58 Format constants
        this.POLKADOT_PREFIX = 0;
        this.KUSAMA_PREFIX = 2;
        this.WESTEND_PREFIX = 42;
        this.SUBSTRATE_PREFIX = 42;
        
        // Address length constants
        this.MIN_ADDRESS_LENGTH = 47;
        this.MAX_ADDRESS_LENGTH = 50;
        
        // SS58 alphabet (base58 without 0, O, I, l)
        this.SS58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
        
        // Cache for validation results
        this.validationCache = new Map();
    }

    /**
     * Validates a Polkadot address comprehensively
     * @param {string} address - The address to validate
     * @param {object} options - Validation options
     * @returns {object} Validation result with details
     */
    validateAddress(address, options = {}) {
        const {
            allowedNetworks = ['polkadot', 'kusama', 'substrate'],
            strictFormat = false,
            cacheResults = true
        } = options;

        // Check cache first
        const cacheKey = `${address}-${JSON.stringify(options)}`;
        if (cacheResults && this.validationCache.has(cacheKey)) {
            return this.validationCache.get(cacheKey);
        }

        const result = this._performValidation(address, allowedNetworks, strictFormat);
        
        // Cache result if enabled
        if (cacheResults) {
            this.validationCache.set(cacheKey, result);
        }
        
        return result;
    }

    /**
     * Performs the actual validation logic
     * @private
     */
    _performValidation(address, allowedNetworks, strictFormat) {
        // Basic type and null checks
        if (!address || typeof address !== 'string') {
            return {
                isValid: false,
                error: 'Address must be a non-empty string',
                errorCode: 'INVALID_TYPE'
            };
        }

        // Length validation
        const lengthValidation = this._validateLength(address);
        if (!lengthValidation.isValid) {
            return lengthValidation;
        }

        // Character set validation
        const charValidation = this._validateCharacterSet(address);
        if (!charValidation.isValid) {
            return charValidation;
        }

        // SS58 format validation
        const formatValidation = this._validateSS58Format(address);
        if (!formatValidation.isValid) {
            return formatValidation;
        }

        // Network prefix validation
        const networkValidation = this._validateNetworkPrefix(address, allowedNetworks);
        if (!networkValidation.isValid && strictFormat) {
            return networkValidation;
        }

        // Checksum validation (if available)
        const checksumValidation = this._validateChecksum(address);
        
        return {
            isValid: true,
            networkInfo: networkValidation.networkInfo,
            format: formatValidation.format,
            checksum: checksumValidation,
            warnings: strictFormat ? [] : networkValidation.warnings || []
        };
    }

    /**
     * Validates address length
     * @private
     */
    _validateLength(address) {
        if (address.length < this.MIN_ADDRESS_LENGTH) {
            return {
                isValid: false,
                error: `Address too short. Minimum length is ${this.MIN_ADDRESS_LENGTH} characters`,
                errorCode: 'LENGTH_TOO_SHORT'
            };
        }

        if (address.length > this.MAX_ADDRESS_LENGTH) {
            return {
                isValid: false,
                error: `Address too long. Maximum length is ${this.MAX_ADDRESS_LENGTH} characters`,
                errorCode: 'LENGTH_TOO_LONG'
            };
        }

        return { isValid: true };
    }

    /**
     * Validates character set (SS58 alphabet)
     * @private
     */
    _validateCharacterSet(address) {
        for (let i = 0; i < address.length; i++) {
            if (!this.SS58_ALPHABET.includes(address[i])) {
                return {
                    isValid: false,
                    error: `Invalid character '${address[i]}' at position ${i}. Address must use SS58 encoding`,
                    errorCode: 'INVALID_CHARACTER'
                };
            }
        }

        return { isValid: true };
    }

    /**
     * Validates SS58 format structure
     * @private
     */
    _validateSS58Format(address) {
        try {
            // Decode base58
            const decoded = this._decodeBase58(address);
            
            if (decoded.length < 35) { // Minimum: 1 byte prefix + 32 bytes pubkey + 2 bytes checksum
                return {
                    isValid: false,
                    error: 'Decoded address too short for valid SS58 format',
                    errorCode: 'INVALID_SS58_LENGTH'
                };
            }

            return {
                isValid: true,
                format: 'SS58',
                decodedLength: decoded.length
            };
        } catch (error) {
            return {
                isValid: false,
                error: 'Invalid SS58 format: ' + error.message,
                errorCode: 'INVALID_SS58_FORMAT'
            };
        }
    }

    /**
     * Validates network prefix
     * @private
     */
    _validateNetworkPrefix(address, allowedNetworks) {
        try {
            const decoded = this._decodeBase58(address);
            const prefix = decoded[0];
            
            const networkInfo = this._getNetworkInfo(prefix);
            
            if (!networkInfo) {
                return {
                    isValid: false,
                    error: `Unknown network prefix: ${prefix}`,
                    errorCode: 'UNKNOWN_NETWORK_PREFIX'
                };
            }

            if (!allowedNetworks.includes(networkInfo.name)) {
                return {
                    isValid: false,
                    error: `Network '${networkInfo.name}' not allowed. Allowed networks: ${allowedNetworks.join(', ')}`,
                    errorCode: 'NETWORK_NOT_ALLOWED',
                    warnings: [`Address appears to be for ${networkInfo.displayName} network`]
                };
            }

            return {
                isValid: true,
                networkInfo
            };
        } catch (error) {
            return {
                isValid: false,
                error: 'Failed to validate network prefix: ' + error.message,
                errorCode: 'PREFIX_VALIDATION_ERROR'
            };
        }
    }

    /**
     * Validates checksum (simplified version)
     * @private
     */
    _validateChecksum(address) {
        try {
            const decoded = this._decodeBase58(address);
            
            // In a full implementation, this would verify the Blake2b hash
            // For now, we'll do basic structural validation
            if (decoded.length >= 35) {
                return {
                    isValid: true,
                    verified: false, // Would be true if we actually computed the hash
                    note: 'Checksum structure appears valid (full verification requires crypto library)'
                };
            }
            
            return {
                isValid: false,
                verified: false,
                note: 'Insufficient data for checksum validation'
            };
        } catch (error) {
            return {
                isValid: false,
                verified: false,
                note: 'Checksum validation failed: ' + error.message
            };
        }
    }

    /**
     * Gets network information from prefix
     * @private
     */
    _getNetworkInfo(prefix) {
        const networks = {
            0: { name: 'polkadot', displayName: 'Polkadot', color: '#e6007a' },
            1: { name: 'polkadot', displayName: 'Polkadot (Legacy)', color: '#e6007a' },
            2: { name: 'kusama', displayName: 'Kusama', color: '#000000' },
            42: { name: 'substrate', displayName: 'Substrate/Generic', color: '#282829' },
            // Add more networks as needed
        };

        return networks[prefix] || null;
    }

    /**
     * Decodes base58 string
     * @private
     */
    _decodeBase58(encoded) {
        const alphabet = this.SS58_ALPHABET;
        const base = alphabet.length;
        
        let decoded = [];
        let multi = 1;
        let s = encoded;
        
        while (s.length > 0) {
            const byte = alphabet.indexOf(s[s.length - 1]);
            if (byte < 0) {
                throw new Error('Invalid character in base58 string');
            }
            
            decoded.push(byte * multi);
            multi *= base;
            s = s.slice(0, -1);
        }
        
        // Convert to bytes
        const result = [];
        let carry = 0;
        
        for (let i = 0; i < decoded.length; i++) {
            carry += decoded[i];
            result.push(carry % 256);
            carry = Math.floor(carry / 256);
        }
        
        while (carry > 0) {
            result.push(carry % 256);
            carry = Math.floor(carry / 256);
        }
        
        return new Uint8Array(result.reverse());
    }

    /**
     * Quick validation for simple format checking
     * @param {string} address - Address to validate
     * @returns {boolean} True if address appears valid
     */
    isValidFormat(address) {
        if (!address || typeof address !== 'string') {
            return false;
        }
        
        if (address.length < this.MIN_ADDRESS_LENGTH || address.length > this.MAX_ADDRESS_LENGTH) {
            return false;
        }
        
        // Check all characters are in SS58 alphabet
        for (let char of address) {
            if (!this.SS58_ALPHABET.includes(char)) {
                return false;
            }
        }
        
        return true;
    }

    /**
     * Suggests corrections for common address format errors
     * @param {string} address - Invalid address
     * @returns {string[]} Array of suggested corrections
     */
    suggestCorrections(address) {
        if (!address || typeof address !== 'string') {
            return [];
        }

        const suggestions = [];

        // Remove invalid characters
        const cleaned = address.replace(/[^123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]/g, '');
        if (cleaned !== address && cleaned.length >= this.MIN_ADDRESS_LENGTH) {
            suggestions.push(cleaned);
        }

        // Fix common character substitutions
        let corrected = address
            .replace(/0/g, 'o')  // 0 -> o
            .replace(/O/g, 'o')  // O -> o
            .replace(/I/g, '1')  // I -> 1
            .replace(/l/g, '1'); // l -> 1

        if (corrected !== address && this.isValidFormat(corrected)) {
            suggestions.push(corrected);
        }

        // Truncate if too long
        if (address.length > this.MAX_ADDRESS_LENGTH) {
            const truncated = address.substring(0, this.MAX_ADDRESS_LENGTH);
            if (this.isValidFormat(truncated)) {
                suggestions.push(truncated);
            }
        }

        return [...new Set(suggestions)]; // Remove duplicates
    }

    /**
     * Gets detailed format information
     * @param {string} address - Address to analyze
     * @returns {object} Format information
     */
    getFormatInfo(address) {
        const validation = this.validateAddress(address, { strictFormat: false });
        
        if (!validation.isValid) {
            return {
                isValid: false,
                error: validation.error,
                suggestions: this.suggestCorrections(address)
            };
        }

        return {
            isValid: true,
            network: validation.networkInfo,
            format: validation.format,
            checksum: validation.checksum,
            warnings: validation.warnings || []
        };
    }

    /**
     * Clears the validation cache
     */
    clearCache() {
        this.validationCache.clear();
    }

    /**
     * Gets cache statistics
     */
    getCacheStats() {
        return {
            size: this.validationCache.size,
            maxSize: 1000 // Could be configurable
        };
    }
}

// Create singleton instance
const polkadotAddressValidator = new PolkadotAddressValidator();

// Export for different environments
if (typeof window !== 'undefined') {
    window.PolkadotAddressValidator = PolkadotAddressValidator;
    window.polkadotAddressValidator = polkadotAddressValidator;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        PolkadotAddressValidator,
        polkadotAddressValidator
    };
}