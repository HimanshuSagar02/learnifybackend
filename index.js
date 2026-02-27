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
  securityLogger,
  requestOriginGuard,
  getAllowedOrigins,
  isAllowedOrigin
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
const isProduction = process.env.NODE_ENV === "production";
const debugLog = (...args) => {
  if (!isProduction) {
    console.log(...args);
  }
};

app.disable("x-powered-by");
app.set("etag", "strong");

// =====================================================
// CORS CONFIGURATION (Must be First)
// =====================================================
debugLog("CORS Configuration:", {
    NODE_ENV: process.env.NODE_ENV || "development",
    FRONTEND_URL: process.env.FRONTEND_URL || "Not set",
    CORS_MODE: "Allowing all origins"
});

// CORS - Allow all origins (MUST be before other middleware)
app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) {
            debugLog('[CORS] No origin header - allowing request');
            return callback(null, true);
        }
        
        // Build allowed origins list
        const allowedOrigins = getAllowedOrigins();
        
        // In development, allow all origins
        if (process.env.NODE_ENV !== 'production') {
            debugLog(`[CORS] Development mode - allowing origin: ${origin}`);
            return callback(null, true);
        }
        
        // In production, check against whitelist
        debugLog(`[CORS] Production mode - checking origin: ${origin}`);
        debugLog(`[CORS] Allowed origins:`, allowedOrigins);
        
        const isAllowed = isAllowedOrigin(origin, allowedOrigins);
        
        if (allowedOrigins.length === 0 || isAllowed) {
            debugLog(`[CORS] ✅ Origin allowed: ${origin}`);
            callback(null, true);
        } else {
            console.error(`[CORS] ❌ Origin blocked: ${origin}`);
            debugLog(`[CORS] Allowed origins:`, allowedOrigins);
            // TEMPORARY: Allow anyway if FRONTEND_URL not set (for deployment testing)
            if (!process.env.FRONTEND_URL) {
                debugLog(`[CORS] ⚠️ FRONTEND_URL not set - allowing origin anyway (temporary)`);
                callback(null, true);
            } else {
                // Return a CORS rejection instead of bubbling to generic 500 handler.
                callback(null, false);
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
    debugLog(`[CORS] Preflight request from: ${origin}`);
    
    const allowedOrigins = getAllowedOrigins();
    const preflightAllowed =
      process.env.NODE_ENV !== "production" ||
      !origin ||
      allowedOrigins.length === 0 ||
      isAllowedOrigin(origin, allowedOrigins);

    if (preflightAllowed) {
        res.setHeader('Access-Control-Allow-Origin', origin || '*');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Cookie');
        res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
        debugLog(`[CORS] ✅ Preflight allowed for: ${origin}`);
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

// CSRF-style protection: validate Origin/Referer for state-changing browser requests
app.use(requestOriginGuard);

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
  debugLog(`[AdminRoute] Incoming request: ${req.method} ${req.originalUrl}`);
  debugLog(`[AdminRoute] Request path: ${req.path}, Base URL: ${req.baseUrl}`);
  next();
}, adminRoute);
debugLog("[Index] Admin routes registered at /api/admin");
app.use("/api/sharednotes", courseNoteRoute);
app.use("/api/attendance", attendanceRoute);
app.use("/api/notes", noteRoute);
app.use("/api/assignments", assignmentRoute);
app.use("/api/notifications", notificationRoute);
app.use("/api/setup", setupRoute); // One-time setup routes (no auth required)
if (process.env.NODE_ENV !== "production") {
  app.use("/api/test", testRoute); // Test routes (development only)
}
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

// Handle malformed JSON payloads early so clients get a clear 400 response.
app.use((err, req, res, next) => {
  const isJsonParseError =
    err?.type === "entity.parse.failed" ||
    (err instanceof SyntaxError && err?.status === 400 && "body" in err);

  if (!isJsonParseError) {
    return next(err);
  }

  if (process.env.NODE_ENV !== "production") {
    console.warn("[Request] Invalid JSON payload:", err?.body);
  }

  return res.status(400).json({
    message: "Invalid JSON payload",
    hint: "Send request body as valid JSON (Content-Type: application/json)",
  });
});

// Error handling middleware (should be after all routes)
app.use((err, req, res, next) => {
  if (String(err?.message || "").includes("Not allowed by CORS")) {
    return res.status(403).json({
      message: "CORS blocked for this origin",
      origin: req.headers.origin || null,
    });
  }

  console.error("❌ Error:", err);
  res.status(500).json({
    message: "Internal server error",
    error: process.env.NODE_ENV === "development" ? err.message : "Something went wrong",
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
    const hasSendGridConfig =
      Boolean(
        String(
          process.env.SEND_GRID_API_KEY || process.env.SENDGRID_API_KEY || ""
        ).trim()
      ) &&
      Boolean(
        String(
            process.env.EMAIL ||
            ""
        ).trim()
      );
    const hasSmtpConfig =
      Boolean(String(process.env.EMAIL || "").trim()) &&
      Boolean(String(process.env.EMAIL_PASS || "").trim());
    const activeEmailProvider = hasSendGridConfig
      ? "SendGrid"
      : hasSmtpConfig
        ? "SMTP"
        : "None";

    console.log(
      "   📧 Email Config:",
      activeEmailProvider !== "None"
        ? `✅ Set (${activeEmailProvider})`
        : "❌ Missing (Forgot Password will not work)"
    );

    if (activeEmailProvider === "SendGrid") {
      console.log(
        "      Sender:",
        process.env.EMAIL || process.env.EMAIL_FROM
      );
    } else if (activeEmailProvider === "SMTP") {
      console.log("      Email:", process.env.EMAIL);
      if (!process.env.EMAIL_PASS) {
        console.log("      ⚠️  WARNING: EMAIL_PASS is missing! Email sending will not work.");
      }
    } else {
      console.log(
        "      Configure SEND_GRID_API_KEY (recommended) or EMAIL + EMAIL_PASS."
      );
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


