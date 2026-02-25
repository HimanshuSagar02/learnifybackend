import jwt from "jsonwebtoken";
import mongoose from "mongoose";

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
      console.log("[isAuth] Attempting to reconnect...");
      
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
        console.log(`[isAuth] Token found in Authorization header`);
      }
    }
    
    if (!token) {
      console.log(`[isAuth] No token found in cookies for ${req.method} ${req.path}`);
      console.log(`[isAuth] Cookies received:`, Object.keys(req.cookies || {}));
      console.log(`[isAuth] Request headers:`, {
        origin: req.headers.origin,
        referer: req.headers.referer,
        cookie: req.headers.cookie ? 'present' : 'missing'
      });
      return res.status(401).json({ message: "Authentication required. Please login." });
    }
    
    let verifyToken;
    try {
      verifyToken = jwt.verify(token, process.env.JWT_SECRET);
      console.log(`[isAuth] Token verified for user: ${verifyToken.userId}`);
    } catch (jwtError) {
      console.error(`[isAuth] Token verification failed:`, jwtError.name);
      if (jwtError.name === "TokenExpiredError") {
        return res.status(401).json({ message: "Token expired. Please login again." });
      }
      if (jwtError.name === "JsonWebTokenError") {
        return res.status(401).json({ message: "Invalid token. Please login again." });
      }
      throw jwtError;
    }
    
    if (!verifyToken || !verifyToken.userId) {
      console.error(`[isAuth] Invalid token format`);
      return res.status(401).json({ message: "Invalid token format" });
    }
  
    req.userId = verifyToken.userId;
    next();
  } catch (error) {
    console.error("[isAuth] Middleware error:", error);
    return res.status(500).json({ 
      message: `Authentication error: ${error.message || String(error)}` 
    });
  }
};

export default isAuth;