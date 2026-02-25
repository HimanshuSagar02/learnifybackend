import express from "express"
import dotenv from "dotenv"
import cookieParser from "cookie-parser"
import cors from "cors"
import connectDb from "./configs/db.js"

// Security Middlewares
import {
  securityHeaders,
  apiLimiter,
  authLimiter,
  passwordResetLimiter,
  paymentLimiter,
  uploadLimiter,
  mongoSanitization,
  xssProtection,
  hppProtection,
  requestSizeLimit,
  securityLogger
} from "./middlewares/security.js"

// Routes
import authRouter from "./routes/authRoute.js";
import userRouter from "./routes/userRoute.js"
import courseRouter from "./routes/courseRoute.js"
import paymentRouter from "./routes/paymentRoute.js"
import aiRoute from "./routes/aiRoute.js";
import noteRoute from "./routes/noteRoute.js";
import assignmentRoute from "./routes/assignmentRoute.js";
import reviewRouter from "./routes/reviewRoute.js"
import progressRoutes from "./routes/progressRoutes.js";

import certificateRoutes from "./routes/certificateRoutes.js";
import adminRoute from "./routes/adminRoute.js";
import courseNoteRoute from "./routes/courseNoteRoute.js";
import attendanceRoute from "./routes/attendanceRoute.js";
import notificationRoute from "./routes/notificationRoute.js";
import setupRoute from "./routes/setupRoute.js";
import testRoute from "./routes/testRoute.js";
import liveClassRoute from "./routes/liveClassRoute.js";
import gradeRoute from "./routes/gradeRoute.js";
import doubtRoute from "./routes/doubtRoute.js";
import aiAssistantRoute from "./routes/aiAssistantRoute.js";
import feedbackRoute from "./routes/feedbackRoute.js";
import marketingRoute from "./routes/marketingRoute.js";
import feeRoute from "./routes/feeRoute.js";

dotenv.config({ path: "./.env" }); 

const app = express();
const port = process.env.PORT || 8000   // fallback if env missing

// =====================================================
// CORS CONFIGURATION (Must be First)
// =====================================================
console.log("CORS Configuration:", {
    NODE_ENV: process.env.NODE_ENV || "development",
    FRONTEND_URL: process.env.FRONTEND_URL || "Not set",
    CORS_MODE: "Allowing all origins"
});

// CORS - Allow all origins (MUST be before other middleware)
app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) {
            console.log('[CORS] No origin header - allowing request');
            return callback(null, true);
        }
        
        // Build allowed origins list
        const allowedOrigins = [];
        
        // Add FRONTEND_URL if set
        if (process.env.FRONTEND_URL) {
            // Support comma-separated list of URLs
            const urls = process.env.FRONTEND_URL.split(',').map(url => url.trim());
            allowedOrigins.push(...urls);
        }
        
        // Always allow localhost for development
        allowedOrigins.push(
            'http://localhost:5173',
            'http://localhost:5174',
            'http://localhost:5175',
            'http://127.0.0.1:5173',
            'http://127.0.0.1:5174',
            'http://127.0.0.1:5175'
        );
        
        // Always allow Netlify domain (production frontend)
        allowedOrigins.push(
            'https://rajchemreactor.netlify.app',
            'https://www.rajchemreactor.netlify.app',
            'http://rajchemreactor.netlify.app' // HTTP version if exists
        );
        
        // In development, allow all origins
        if (process.env.NODE_ENV !== 'production') {
            console.log(`[CORS] Development mode - allowing origin: ${origin}`);
            return callback(null, true);
        }
        
        // In production, check against whitelist
        console.log(`[CORS] Production mode - checking origin: ${origin}`);
        console.log(`[CORS] Allowed origins:`, allowedOrigins);
        
        // Check if origin matches any allowed origin (exact match or subdomain)
        const isAllowed = allowedOrigins.some(allowed => {
            // Exact match
            if (allowed === origin) return true;
            // Subdomain match (e.g., www.rajchemreactor.netlify.app matches rajchemreactor.netlify.app)
            if (origin && origin.endsWith(allowed.replace(/^https?:\/\//, ''))) return true;
            return false;
        });
        
        if (allowedOrigins.length === 0 || isAllowed) {
            console.log(`[CORS] ✅ Origin allowed: ${origin}`);
            callback(null, true);
        } else {
            console.error(`[CORS] ❌ Origin blocked: ${origin}`);
            console.error(`[CORS] Allowed origins:`, allowedOrigins);
            // TEMPORARY: Allow anyway if FRONTEND_URL not set (for deployment testing)
            if (!process.env.FRONTEND_URL) {
                console.warn(`[CORS] ⚠️ FRONTEND_URL not set - allowing origin anyway (temporary)`);
                callback(null, true);
            } else {
                callback(new Error(`Not allowed by CORS. Origin: ${origin}`));
            }
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'Cookie'],
    exposedHeaders: ['Set-Cookie'],
    preflightContinue: false,
    optionsSuccessStatus: 204
}));

// Handle preflight requests explicitly (MUST be before routes)
// Use regex pattern instead of wildcard for Express 5.x compatibility
app.options(/.*/, (req, res) => {
    const origin = req.headers.origin;
    console.log(`[CORS] Preflight request from: ${origin}`);
    
    // Build allowed origins (same as main CORS config)
    const allowedOrigins = [];
    if (process.env.FRONTEND_URL) {
        const urls = process.env.FRONTEND_URL.split(',').map(url => url.trim());
        allowedOrigins.push(...urls);
    }
    allowedOrigins.push(
        'http://localhost:5173',
        'http://localhost:5174',
        'http://localhost:5175',
        'https://rajchemreactor.netlify.app',
        'https://www.rajchemreactor.netlify.app',
        'http://rajchemreactor.netlify.app'
    );
    
    // Allow origin if in list or development mode
    if (process.env.NODE_ENV !== 'production' || !origin || allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin || '*');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Cookie');
        res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
        console.log(`[CORS] ✅ Preflight allowed for: ${origin}`);
        return res.status(204).send();
    } else {
        console.error(`[CORS] ❌ Preflight blocked for: ${origin}`);
        return res.status(403).json({ error: 'CORS preflight failed' });
    }
});

// =====================================================
// SECURITY MIDDLEWARES (Applied After CORS)
// =====================================================

// Trust Proxy (for rate limiting behind reverse proxy)
app.set('trust proxy', 1);

// Security Headers (Helmet) - Configured to not interfere with CORS
app.use(securityHeaders);

// Request Size Limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Cookie Parser
app.use(cookieParser());

// Data Sanitization (MongoDB injection prevention) - Skip for auth and GET routes
// Using custom sanitization to avoid read-only property errors with express-mongo-sanitize
app.use((req, res, next) => {
  // Skip sanitization for auth routes and GET requests (read-only)
  if (req.path.startsWith('/api/auth') || req.method === 'GET') {
    return next();
  }
  
  // Apply custom sanitization (only sanitizes body and params, not query)
  mongoSanitization(req, res, next);
});

// XSS Protection - Only apply to POST/PUT/PATCH requests with body data
app.use((req, res, next) => {
  // Skip XSS protection for GET requests, auth routes, and payment routes
  const skipRoutes = ['/api/auth', '/api/payment'];
  const skipMethods = ['GET', 'HEAD', 'OPTIONS'];
  
  if (skipMethods.includes(req.method) || skipRoutes.some(route => req.path.startsWith(route))) {
    return next();
  }
  
  try {
    xssProtection(req, res, next);
  } catch (error) {
    console.error("[Security] XSS protection error:", error);
    next(); // Continue even if XSS protection fails
  }
});

// HTTP Parameter Pollution Protection - Skip for GET requests
app.use((req, res, next) => {
  // Skip HPP for GET requests and auth routes
  if (req.method === 'GET' || req.path.startsWith('/api/auth')) {
    return next();
  }
  try {
    hppProtection(req, res, next);
  } catch (error) {
    console.error("[Security] HPP protection error:", error);
    next(); // Continue even if HPP protection fails
  }
});

// Security Logging - Skip for GET requests and auth routes
app.use((req, res, next) => {
  // Skip security logging for GET requests and auth routes
  if (req.method === 'GET' || req.path.startsWith('/api/auth')) {
    return next();
  }
  try {
    securityLogger(req, res, next);
  } catch (error) {
    console.error("[Security] Security logging error:", error);
    next(); // Continue even if logging fails
  }
});

// General API Rate Limiting
app.use('/api', apiLimiter);

// API Routes 🔽
app.use("/api/auth", authRouter)          // LOGIN / SIGNUP
app.use("/api/user", userRouter)
app.use("/api/course", courseRouter)
app.use("/api/payment", paymentRouter)
app.use("/api/ai", aiRoute);
app.use("/api/ai-assistant", aiAssistantRoute); 
app.use("/api/review", reviewRouter)
app.use("/api/progress", progressRoutes)
  //progress route added successfully
app.use("/api/cert", certificateRoutes); // certificate route connected
// Admin routes - Register with detailed logging
app.use("/api/admin", (req, res, next) => {
  console.log(`[AdminRoute] Incoming request: ${req.method} ${req.originalUrl}`);
  console.log(`[AdminRoute] Request path: ${req.path}, Base URL: ${req.baseUrl}`);
  next();
}, adminRoute);
console.log("[Index] Admin routes registered at /api/admin");
app.use("/api/sharednotes", courseNoteRoute);
app.use("/api/attendance", attendanceRoute);
app.use("/api/notes", noteRoute);
app.use("/api/assignments", assignmentRoute);
app.use("/api/notifications", notificationRoute);
app.use("/api/setup", setupRoute); // One-time setup routes (no auth required)
app.use("/api/test", testRoute); // Test routes
app.use("/api/liveclass", liveClassRoute); // Live classes
app.use("/api/grades", gradeRoute); // Grades/Marks
app.use("/api/doubts", doubtRoute); // Doubts/Questions
app.use("/api/feedback", feedbackRoute); // Feedback System
app.use("/api/marketing", marketingRoute); // Marketing offers and demo booking
app.use("/api/fee", feeRoute); // Offline/online fee records

// Test Route
app.get("/", (req,res)=>{
    res.send("Server Running Successfully ✔")
})

// Error handling middleware (should be after all routes)
app.use((err, req, res, next) => {
  console.error("❌ Error:", err);
  res.status(500).json({ 
    message: "Internal server error", 
    error: process.env.NODE_ENV === "development" ? err.message : "Something went wrong" 
  });
});

// DB + Server Start
app.listen(port, async ()=>{
    console.log(`🔥 Server started on port ${port}`)
    console.log("🌍 Environment:", process.env.NODE_ENV || "development");
    console.log("📦 Node version:", process.version);
    
    // Log environment variables status
    console.log("\n📋 Environment Variables Status:");
    console.log("   MONGODB_URL:", process.env.MONGODB_URL ? "✅ Set" : "❌ Missing (CRITICAL)");
    console.log("   JWT_SECRET:", process.env.JWT_SECRET ? "✅ Set" : "❌ Missing");
    console.log("   FRONTEND_URL:", process.env.FRONTEND_URL || "Not set");
    console.log("   PORT:", port);
    
    console.log("\n🔑 API Keys Status:");
    console.log("   GEMINI_API_KEY:", process.env.GEMINI_API_KEY ? "✅ Set" : "❌ Missing");
    console.log("   ☁️  Cloudinary Config:", 
        (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) 
        ? "✅ Set" : "❌ Missing"
    );
    if (process.env.CLOUDINARY_CLOUD_NAME) {
        console.log("      Cloud Name:", process.env.CLOUDINARY_CLOUD_NAME);
    }
    console.log("   📹 LiveKit Config:", 
        (process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET && process.env.LIVEKIT_URL) 
        ? "✅ Set" : "❌ Missing"
    );
    if (process.env.LIVEKIT_API_KEY) {
        console.log("      API Key:", process.env.LIVEKIT_API_KEY);
        console.log("      URL:", process.env.LIVEKIT_URL || "Not set");
        if (!process.env.LIVEKIT_API_SECRET) {
            console.log("      ⚠️  WARNING: LIVEKIT_API_SECRET is missing! LiveKit will not work.");
        }
    }
    console.log("   📧 Email Config:", 
        (process.env.EMAIL && process.env.EMAIL_PASS) 
        ? "✅ Set" : "❌ Missing (Forgot Password will not work)"
    );
    if (process.env.EMAIL) {
        console.log("      Email:", process.env.EMAIL);
        if (!process.env.EMAIL_PASS) {
            console.log("      ⚠️  WARNING: EMAIL_PASS is missing! Email sending will not work.");
        }
    }
    
    console.log("\n🔌 Database Connection:");
    // Connect to database
    await connectDb();
    
    // Verify connection after a short delay
    setTimeout(async () => {
        const { isDbConnected } = await import("./configs/db.js");
        if (isDbConnected()) {
            console.log("✅ Database connection verified - Ready to serve requests");
        } else {
            console.warn("⚠️  Database connection not established - Some features may not work");
            console.warn("   Check Render logs for connection errors");
            console.warn("   Verify MONGODB_URL environment variable is set correctly");
        }
    }, 2000);
})

process.on("uncaughtException", (err)=> {
  console.log("❗ Server Crash:", err);
  process.exit(1);
});

process.on("unhandledRejection", (err)=> {
  console.log("❗ Unhandled Rejection:", err);
});

