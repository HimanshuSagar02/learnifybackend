import { body, param, query, validationResult } from "express-validator";
import validator from "validator";

/* =====================================================
    VALIDATION RESULT HANDLER
=====================================================*/
export const handleValidationErrors = (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.warn("[Validation] Validation errors:", errors.array());
      return res.status(400).json({
        error: "Validation failed",
        details: errors.array().map(err => ({
          field: err.path || err.param || err.location,
          message: err.msg,
          value: err.value ? String(err.value).substring(0, 50) : undefined
        }))
      });
    }
    next();
  } catch (error) {
    console.error("[Validation] Error in validation handler:", error);
    // Continue to next middleware if validation handler fails
    next();
  }
};

/* =====================================================
    AUTHENTICATION VALIDATION
=====================================================*/
export const validateSignup = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 2, max: 50 }).withMessage('Name must be between 2 and 50 characters')
    .matches(/^[a-zA-Z\s]+$/).withMessage('Name can only contain letters and spaces')
    .escape(),
  
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail()
    .customSanitizer((value) => {
      if (typeof value === 'string') {
        return value.toLowerCase();
      }
      return value;
    }),
  
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number')
    .matches(/^[a-zA-Z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]*$/).withMessage('Password contains invalid characters'),
  
  body('class')
    .optional()
    .isIn(['9th', '10th', '11th', '12th', 'NEET Dropper', '']).withMessage('Invalid class value'),
  
  body('subject')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('Subject must be less than 100 characters')
    .escape(),
  
  handleValidationErrors
];

export const validateLogin = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail()
    .customSanitizer((value) => {
      if (typeof value === 'string') {
        return value.toLowerCase();
      }
      return value;
    }),
  
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 1 }).withMessage('Password cannot be empty'),
  
  handleValidationErrors
];

export const validatePasswordReset = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail()
    .customSanitizer((value) => {
      if (typeof value === 'string') {
        return value.toLowerCase();
      }
      return value;
    }),
  
  handleValidationErrors
];

export const validateOtpVerification = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail()
    .customSanitizer((value) => {
      if (typeof value === 'string') {
        return value.toLowerCase();
      }
      return value;
    }),
  
  body('otp')
    .trim()
    .notEmpty().withMessage('OTP is required')
    .isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits')
    .isNumeric().withMessage('OTP must contain only numbers'),
  
  handleValidationErrors
];

export const validateNewPassword = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail()
    .customSanitizer((value) => {
      if (typeof value === 'string') {
        return value.toLowerCase();
      }
      return value;
    }),
  
  body('newPassword')
    .notEmpty().withMessage('New password is required')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
  
  handleValidationErrors
];

/* =====================================================
    COURSE VALIDATION
=====================================================*/
export const validateCourse = [
  body('title')
    .trim()
    .notEmpty().withMessage('Course title is required')
    .isLength({ min: 3, max: 200 }).withMessage('Title must be between 3 and 200 characters')
    .escape(),
  
  body('description')
    .optional()
    .trim()
    .isLength({ max: 5000 }).withMessage('Description must be less than 5000 characters')
    .escape(),
  
  body('category')
    .trim()
    .notEmpty().withMessage('Category is required')
    .isLength({ max: 100 }).withMessage('Category must be less than 100 characters')
    .escape(),
  
  body('class')
    .notEmpty().withMessage('Class is required')
    .isIn(['9th', '10th', '11th', '12th', 'NEET Dropper']).withMessage('Invalid class value'),
  
  body('subject')
    .trim()
    .notEmpty().withMessage('Subject is required')
    .isLength({ max: 100 }).withMessage('Subject must be less than 100 characters')
    .escape(),
  
  body('price')
    .optional()
    .isFloat({ min: 0 }).withMessage('Price must be a positive number')
    .toFloat(),
  
  handleValidationErrors
];

/* =====================================================
    PAYMENT VALIDATION
=====================================================*/
export const validatePayment = [
  body('courseId')
    .notEmpty().withMessage('Course ID is required')
    .isMongoId().withMessage('Invalid course ID format'),
  
  body('userId')
    .optional()
    .isMongoId().withMessage('Invalid user ID format'),
  
  handleValidationErrors
];

export const validatePaymentVerification = [
  body('razorpay_order_id')
    .trim()
    .notEmpty().withMessage('Order ID is required')
    .isLength({ max: 100 }).withMessage('Order ID is too long'),
  
  body('razorpay_payment_id')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('Payment ID is too long'),
  
  body('razorpay_signature')
    .optional()
    .trim()
    .isLength({ max: 200 }).withMessage('Signature is too long'),
  
  body('courseId')
    .notEmpty().withMessage('Course ID is required')
    .isMongoId().withMessage('Invalid course ID format'),
  
  body('userId')
    .notEmpty().withMessage('User ID is required')
    .isMongoId().withMessage('Invalid user ID format'),
  
  handleValidationErrors
];

/* =====================================================
    ID PARAMETER VALIDATION
=====================================================*/
export const validateMongoId = (paramName = 'id') => [
  param(paramName)
    .notEmpty().withMessage(`${paramName} is required`)
    .isMongoId().withMessage(`Invalid ${paramName} format`),
  
  handleValidationErrors
];

/* =====================================================
    FILE UPLOAD VALIDATION
=====================================================*/
export const validateFileUpload = (allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'], maxSize = 5 * 1024 * 1024) => {
  return (req, res, next) => {
    if (!req.file && !req.files) {
      return next(); // No file uploaded, skip validation
    }
    
    const files = req.files || [req.file];
    
    for (const file of files) {
      // Check file type
      if (!allowedTypes.includes(file.mimetype)) {
        return res.status(400).json({
          error: 'Invalid file type',
          allowedTypes: allowedTypes,
          received: file.mimetype
        });
      }
      
      // Check file size
      if (file.size > maxSize) {
        return res.status(400).json({
          error: 'File too large',
          maxSize: `${maxSize / (1024 * 1024)}MB`,
          received: `${(file.size / (1024 * 1024)).toFixed(2)}MB`
        });
      }
      
      // Check for malicious file names
      if (/[<>:"/\\|?*]/.test(file.originalname)) {
        return res.status(400).json({
          error: 'Invalid file name',
          message: 'File name contains invalid characters'
        });
      }
    }
    
    next();
  };
};

/* =====================================================
    INPUT SANITIZATION HELPERS
=====================================================*/
export const sanitizeString = (str) => {
  if (typeof str !== 'string') return str;
  return validator.escape(validator.trim(str));
};

export const sanitizeEmail = (email) => {
  if (typeof email !== 'string') return email;
  return validator.normalizeEmail(validator.trim(email.toLowerCase()));
};

export const sanitizeObject = (obj) => {
  if (typeof obj !== 'object' || obj === null) return obj;
  
  const sanitized = Array.isArray(obj) ? [] : {};
  
  for (const key in obj) {
    const value = obj[key];
    
    if (typeof value === 'string') {
      if (key.toLowerCase().includes('email')) {
        sanitized[key] = sanitizeEmail(value);
      } else {
        sanitized[key] = sanitizeString(value);
      }
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
};

