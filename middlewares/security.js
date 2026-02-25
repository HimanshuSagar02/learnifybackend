import helmet from "helmet";
import rateLimit from "express-rate-limit";
// import mongoSanitize from "express-mongo-sanitize"; // Removed - using custom implementation
import hpp from "hpp";

/* =====================================================
    SECURITY HEADERS (Helmet)
=====================================================*/
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "http://localhost:*", "https://*"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Allow external resources
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginOpenerPolicy: false, // Allow cross-origin opener
  hsts: process.env.NODE_ENV === 'production' ? {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  } : false, // Disable HSTS in development
});

/* =====================================================
    RATE LIMITING
=====================================================*/

// General API rate limiter
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: "Too many requests from this IP, please try again later.",
    retryAfter: "15 minutes"
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === "/" || req.path === "/health";
  }
});

// Strict rate limiter for authentication endpoints
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: {
    error: "Too many authentication attempts, please try again after 15 minutes.",
    retryAfter: "15 minutes"
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful requests
});

// Strict rate limiter for password reset
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Limit each IP to 3 password reset requests per hour
  message: {
    error: "Too many password reset attempts, please try again after 1 hour.",
    retryAfter: "1 hour"
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter for payment endpoints
export const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 payment requests per windowMs
  message: {
    error: "Too many payment requests, please try again later.",
    retryAfter: "15 minutes"
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter for file uploads
export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // Limit each IP to 20 uploads per hour
  message: {
    error: "Too many file uploads, please try again later.",
    retryAfter: "1 hour"
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/* =====================================================
    DATA SANITIZATION
=====================================================*/

// MongoDB injection prevention - Custom implementation to avoid read-only property errors
// Helper function to sanitize objects (remove MongoDB operators like $ and .)
const sanitizeObject = (obj) => {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }
  
  const sanitized = {};
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      // Replace MongoDB operators ($, .) with underscores
      const sanitizedKey = key.replace(/[$.]/g, '_');
      const value = obj[key];
      
      // Recursively sanitize nested objects and arrays
      if (typeof value === 'object' && value !== null) {
        sanitized[sanitizedKey] = sanitizeObject(value);
      } else {
        sanitized[sanitizedKey] = value;
      }
    }
  }
  return sanitized;
};

// Custom MongoDB sanitization middleware (only sanitizes body and params, not query)
export const mongoSanitization = (req, res, next) => {
  try {
    // Sanitize req.body
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeObject(req.body);
    }
    
    // Sanitize req.params
    if (req.params && typeof req.params === 'object') {
      req.params = sanitizeObject(req.params);
    }
    
    // Note: We skip req.query to avoid "Cannot set property query" errors
    // Query parameters are less risky for MongoDB injection in POST/PUT/PATCH requests
    // GET requests are already skipped in index.js
    
    next();
  } catch (error) {
    console.error("[Security] MongoDB sanitization error:", error);
    next(); // Continue even if sanitization fails
  }
};

// XSS protection - Basic sanitization (skip sensitive fields)
export const xssProtection = (req, res, next) => {
  try {
    // Skip XSS protection for certain routes and fields
    const skipRoutes = ['/api/auth/login', '/api/auth/signup', '/api/payment'];
    const skipFields = ['password', 'newPassword', 'otp', 'razorpay_signature', 'razorpay_payment_id'];
    
    if (skipRoutes.some(route => req.path.startsWith(route))) {
      return next(); // Skip XSS protection for auth and payment routes
    }
    
    // Sanitize string values in request body (but skip sensitive fields)
    if (req.body && typeof req.body === 'object') {
      const sanitize = (obj, parentKey = '') => {
        for (const key in obj) {
          const fullKey = parentKey ? `${parentKey}.${key}` : key;
          
          // Skip sensitive fields
          if (skipFields.includes(key.toLowerCase())) {
            continue;
          }
          
          if (typeof obj[key] === 'string') {
            // Only sanitize if it looks like it might contain HTML/XSS
            if (/<[^>]*>/.test(obj[key]) || /javascript:/i.test(obj[key])) {
              // Basic XSS prevention - escape HTML entities
              obj[key] = obj[key]
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#x27;')
                .replace(/\//g, '&#x2F;');
            }
          } else if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
            sanitize(obj[key], fullKey);
          } else if (Array.isArray(obj[key])) {
            obj[key].forEach((item, index) => {
              if (typeof item === 'string') {
                if (/<[^>]*>/.test(item) || /javascript:/i.test(item)) {
                  obj[key][index] = item
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#x27;')
                    .replace(/\//g, '&#x2F;');
                }
              } else if (typeof item === 'object' && item !== null) {
                sanitize(item, `${fullKey}[${index}]`);
              }
            });
          }
        }
      };
      sanitize(req.body);
    }
    next();
  } catch (error) {
    console.error("[XSS Protection] Error:", error);
    next(); // Continue even if XSS protection fails
  }
};

// HTTP Parameter Pollution protection
export const hppProtection = hpp({
  whitelist: [
    'duration',
    'ratingsQuantity',
    'ratingsAverage',
    'maxGroupSize',
    'difficulty',
    'price'
  ]
});

/* =====================================================
    REQUEST SIZE LIMITS
=====================================================*/
export const requestSizeLimit = (maxSize = '10mb') => {
  return (req, res, next) => {
    const contentLength = req.get('content-length');
    if (contentLength) {
      const sizeInMB = parseInt(contentLength) / (1024 * 1024);
      const maxSizeInMB = parseInt(maxSize) || 10;
      
      if (sizeInMB > maxSizeInMB) {
        return res.status(413).json({
          error: `Request entity too large. Maximum size is ${maxSize}`,
          received: `${sizeInMB.toFixed(2)}MB`
        });
      }
    }
    next();
  };
};

/* =====================================================
    IP WHITELIST (Optional - for admin endpoints)
=====================================================*/
export const ipWhitelist = (allowedIPs = []) => {
  return (req, res, next) => {
    if (allowedIPs.length === 0) {
      return next(); // No whitelist configured
    }
    
    const clientIP = req.ip || req.connection.remoteAddress;
    
    if (allowedIPs.includes(clientIP)) {
      return next();
    }
    
    console.warn(`[Security] IP ${clientIP} not in whitelist`);
    return res.status(403).json({
      error: "Access denied. Your IP address is not authorized."
    });
  };
};

/* =====================================================
    SECURITY LOGGING
=====================================================*/
export const securityLogger = (req, res, next) => {
  // Log suspicious activities
  const suspiciousPatterns = [
    /<script/i,
    /javascript:/i,
    /onerror=/i,
    /onload=/i,
    /eval\(/i,
    /union.*select/i,
    /drop.*table/i,
    /delete.*from/i,
    /insert.*into/i,
    /update.*set/i
  ];
  
  const checkSuspicious = (obj, path = '') => {
    for (const key in obj) {
      const value = obj[key];
      const currentPath = path ? `${path}.${key}` : key;
      
      if (typeof value === 'string') {
        for (const pattern of suspiciousPatterns) {
          if (pattern.test(value)) {
            console.warn(`[Security] Suspicious pattern detected in ${currentPath}:`, value.substring(0, 100));
            // Log IP and user info
            console.warn(`[Security] IP: ${req.ip}, User: ${req.userId || 'anonymous'}, Path: ${req.path}`);
          }
        }
      } else if (typeof value === 'object' && value !== null) {
        checkSuspicious(value, currentPath);
      }
    }
  };
  
  if (req.body) checkSuspicious(req.body, 'body');
  if (req.query) checkSuspicious(req.query, 'query');
  if (req.params) checkSuspicious(req.params, 'params');
  
  next();
};

/* =====================================================
    CORS SECURITY
=====================================================*/
export const secureCors = (allowedOrigins = []) => {
  return (req, res, next) => {
    const origin = req.headers.origin;
    
    // In production, check against whitelist
    if (process.env.NODE_ENV === 'production' && allowedOrigins.length > 0) {
      if (origin && allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
      } else {
        return res.status(403).json({
          error: "CORS policy: Origin not allowed"
        });
      }
    }
    
    next();
  };
};

