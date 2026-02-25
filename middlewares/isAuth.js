import mongoose from "mongoose";
import User from "../models/userModel.js";
import { verifyToken as verifyJwtToken } from "../configs/token.js";

const isDevelopment = process.env.NODE_ENV !== "production";
const debugLog = (...args) => {
  if (isDevelopment) {
    console.log(...args);
  }
};

const clearAuthCookie = (res) => {
  const isProduction = process.env.NODE_ENV === "production";
  const cookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "None" : "Lax",
    path: "/",
  };

  if (isProduction && process.env.COOKIE_DOMAIN) {
    cookieOptions.domain = process.env.COOKIE_DOMAIN;
  }

  res.clearCookie("token", cookieOptions);
  res.clearCookie("token", { path: "/" });
};

const isAuth = async (req, res, next) => {
  try {
    // Check if JWT_SECRET is configured
    if (!process.env.JWT_SECRET) {
      console.error("[isAuth] JWT_SECRET is not configured in environment variables");
      return res.status(500).json({ message: "Server configuration error" });
    }
    
    // Check database connection
    if (mongoose.connection.readyState !== 1) {
      console.error(`[isAuth] Database not connected. State: ${mongoose.connection.readyState}`);
      debugLog("[isAuth] Attempting to reconnect...");
      
      // Try to reconnect if disconnected
      if (mongoose.connection.readyState === 0) {
        try {
          const connectDb = (await import("../configs/db.js")).default;
          await connectDb();
          // Wait a moment for connection
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (err) {
          console.error("[isAuth] Reconnection failed:", err.message);
        }
      }
      
      // If still not connected, return error
      if (mongoose.connection.readyState !== 1) {
        return res.status(503).json({ 
          message: "Database connection unavailable. Please try again later.",
          error: "Database not connected",
          readyState: mongoose.connection.readyState,
          hint: "Check MONGODB_URL environment variable and MongoDB Atlas network access"
        });
      }
    }
    
    // Try to get token from cookies first
    let { token } = req.cookies;
    
    // If no token in cookies, try Authorization header (for debugging)
    if (!token && req.headers.authorization) {
      const authHeader = req.headers.authorization;
      if (authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
        debugLog(`[isAuth] Token found in Authorization header`);
      }
    }
    
    if (!token) {
      debugLog(`[isAuth] No token found in cookies for ${req.method} ${req.path}`);
      debugLog(`[isAuth] Cookies received:`, Object.keys(req.cookies || {}));
      return res.status(401).json({ message: "Authentication required. Please login." });
    }
    
    let decodedToken;
    try {
      decodedToken = verifyJwtToken(token);
      debugLog(`[isAuth] Token verified for user: ${decodedToken.userId}`);
    } catch (jwtError) {
      debugLog(`[isAuth] Token verification failed:`, jwtError.message);
      if (jwtError.message === "Token has expired") {
        return res.status(401).json({ message: "Token expired. Please login again." });
      }
      if (jwtError.message === "Invalid token") {
        return res.status(401).json({ message: "Invalid token. Please login again." });
      }
      throw jwtError;
    }
    
    if (!decodedToken || !decodedToken.userId) {
      console.error(`[isAuth] Invalid token format`);
      return res.status(401).json({ message: "Invalid token format" });
    }

    const user = await User.findById(decodedToken.userId).select("_id role status");
    if (!user) {
      clearAuthCookie(res);
      return res.status(401).json({ message: "User not found. Please login again." });
    }

    if (user.status !== "approved") {
      clearAuthCookie(res);
      return res.status(403).json({
        message:
          user.status === "pending"
            ? "Account pending approval by admin"
            : "Account rejected by admin",
      });
    }
  
    req.userId = decodedToken.userId;
    req.userRole = user.role;
    next();
  } catch (error) {
    console.error("[isAuth] Middleware error:", error);
    return res.status(500).json({ 
      message: `Authentication error: ${error.message || String(error)}` 
    });
  }
};

export default isAuth;
