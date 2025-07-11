#!/bin/bash

# Security Remediation Script for Polkadot Analysis Tool
# This script helps implement the security recommendations from the security audit

echo "==================================="
echo "Security Remediation Script"
echo "==================================="

# 1. Handle .env file
echo "1. Handling .env file..."
if [ -f ".env" ]; then
    echo "   - Creating .env.example from current .env"
    cp .env .env.example
    # Remove any sensitive values from .env.example
    sed -i 's/=.*/=/' .env.example
    
    echo "   - Adding .env to .gitignore"
    if ! grep -q "^\.env$" .gitignore 2>/dev/null; then
        echo ".env" >> .gitignore
        echo "   - Added .env to .gitignore"
    else
        echo "   - .env already in .gitignore"
    fi
    
    echo "   ⚠️  WARNING: Remove .env from git history if it was committed"
    echo "   Run: git rm --cached .env"
fi

# 2. Create authentication middleware template
echo ""
echo "2. Creating authentication middleware template..."
cat > src/middleware/auth.js << 'EOF'
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger.js';

/**
 * Authentication middleware for protecting API endpoints
 */
export function authenticate(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({
      error: {
        message: 'Authentication required',
        code: 'AUTH_REQUIRED'
      }
    });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    logger.warn('Authentication failed', { error: error.message });
    return res.status(401).json({
      error: {
        message: 'Invalid or expired token',
        code: 'AUTH_FAILED'
      }
    });
  }
}

/**
 * API Key authentication for programmatic access
 */
export function authenticateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    return res.status(401).json({
      error: {
        message: 'API key required',
        code: 'API_KEY_REQUIRED'
      }
    });
  }
  
  // TODO: Implement API key validation against database
  // For now, check against environment variable
  if (apiKey !== process.env.API_KEY) {
    return res.status(401).json({
      error: {
        message: 'Invalid API key',
        code: 'INVALID_API_KEY'
      }
    });
  }
  
  next();
}

/**
 * Optional authentication - allows both authenticated and unauthenticated access
 */
export function optionalAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
    } catch (error) {
      // Invalid token, but continue as unauthenticated
      logger.debug('Optional auth: invalid token provided');
    }
  }
  
  next();
}
EOF

echo "   - Created src/middleware/auth.js"

# 3. Create nginx configuration template
echo ""
echo "3. Creating nginx configuration template..."
cat > nginx.conf.template << 'EOF'
# Nginx configuration for Polkadot Analysis Tool
# Provides DoS protection and security headers

upstream polkadot_app {
    server localhost:3000;
    keepalive 32;
}

# Rate limiting zones
limit_req_zone $binary_remote_addr zone=general:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=api:10m rate=5r/s;
limit_req_zone $binary_remote_addr zone=expensive:10m rate=1r/s;
limit_conn_zone $binary_remote_addr zone=addr:10m;

server {
    listen 80;
    server_name your-domain.com;
    
    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    # SSL configuration
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    
    # Security headers
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;
    
    # Connection limits
    limit_conn addr 10;
    
    # Timeouts to prevent slowloris
    client_body_timeout 10s;
    client_header_timeout 10s;
    keepalive_timeout 5s 5s;
    send_timeout 10s;
    
    # Body size limits
    client_max_body_size 10M;
    
    # Static files
    location / {
        root /var/www/polkadot-tool/public;
        try_files $uri $uri/ @backend;
        
        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
    
    # API endpoints with rate limiting
    location /api/ {
        # General API rate limit
        limit_req zone=api burst=20 nodelay;
        
        # Expensive operations
        location ~ ^/api/(graph|investigations) {
            limit_req zone=expensive burst=5 nodelay;
            proxy_pass http://polkadot_app;
            include proxy_params;
        }
        
        proxy_pass http://polkadot_app;
        include proxy_params;
    }
    
    # WebSocket support
    location /socket.io/ {
        proxy_pass http://polkadot_app;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        include proxy_params;
    }
    
    # Backend fallback
    location @backend {
        limit_req zone=general burst=20 nodelay;
        proxy_pass http://polkadot_app;
        include proxy_params;
    }
}

# Proxy parameters (create as /etc/nginx/proxy_params)
# proxy_set_header Host $http_host;
# proxy_set_header X-Real-IP $remote_addr;
# proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
# proxy_set_header X-Forwarded-Proto $scheme;
# proxy_connect_timeout 60s;
# proxy_send_timeout 60s;
# proxy_read_timeout 60s;
EOF

echo "   - Created nginx.conf.template"

# 4. Update package.json with security scripts
echo ""
echo "4. Adding security scripts to package.json..."
cat > security-scripts.json << 'EOF'
{
  "scripts": {
    "security:audit": "npm audit",
    "security:audit:fix": "npm audit fix",
    "security:check": "npm run security:audit && npm run lint",
    "security:headers": "curl -I http://localhost:3000 | grep -E '^(Strict-Transport-Security|X-Content-Type-Options|X-Frame-Options|Content-Security-Policy|X-XSS-Protection|Referrer-Policy)'",
    "security:test": "node run-security-tests.mjs"
  }
}
EOF

echo "   - Created security-scripts.json (manually add these to package.json)"

# 5. Create CSP configuration fix
echo ""
echo "5. Creating CSP header fix..."
cat > fix-csp-header.js << 'EOF'
// Add this to your security middleware configuration

// In src/security/index.js, update the helmet configuration:
// Change contentSecurityPolicy reportOnly to false in production:

const helmetConfig = {
  contentSecurityPolicy: {
    directives: cspConfig,
    reportOnly: config.environment === 'development' // Only report-only in dev
  },
  // ... rest of config
};
EOF

echo "   - Created fix-csp-header.js instructions"

# 6. Create security checklist
echo ""
echo "6. Creating security checklist..."
cat > SECURITY_CHECKLIST.md << 'EOF'
# Security Implementation Checklist

## Immediate Actions
- [ ] Remove .env from git history: `git rm --cached .env`
- [ ] Ensure .env is in .gitignore
- [ ] Rotate any exposed secrets
- [ ] Deploy authentication middleware to protect endpoints
- [ ] Enable CSP header in production mode

## Authentication Implementation
- [ ] Add JWT_SECRET to production environment
- [ ] Implement user authentication endpoints (/api/auth/login, /api/auth/refresh)
- [ ] Protect sensitive endpoints with authenticate middleware
- [ ] Implement API key management for programmatic access

## Infrastructure Security
- [ ] Deploy behind nginx reverse proxy
- [ ] Configure SSL certificates
- [ ] Enable HTTPS redirect
- [ ] Configure proper timeouts in nginx
- [ ] Set up fail2ban for brute force protection

## Ongoing Security Practices
- [ ] Run npm audit before each deployment
- [ ] Monitor security logs regularly
- [ ] Set up alerts for security events
- [ ] Regular security testing with automated tools
- [ ] Keep dependencies updated
EOF

echo "   - Created SECURITY_CHECKLIST.md"

echo ""
echo "==================================="
echo "Security Remediation Complete!"
echo "==================================="
echo ""
echo "Next steps:"
echo "1. Review and implement the authentication middleware"
echo "2. Configure nginx as reverse proxy"
echo "3. Enable CSP headers in production"
echo "4. Follow the security checklist"
echo ""
echo "⚠️  IMPORTANT: If .env was committed to git, remove it from history!"
echo "   Run: git filter-branch --force --index-filter 'git rm --cached --ignore-unmatch .env' --prune-empty --tag-name-filter cat -- --all"