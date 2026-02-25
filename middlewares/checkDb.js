import mongoose from "mongoose";

/**
 * Middleware to check if database is connected before processing requests
 * This helps identify database connection issues early
 */
export const checkDbConnection = (req, res, next) => {
  const dbState = mongoose.connection.readyState;
  
  // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
  if (dbState !== 1) {
    console.error(`[DB Check] Database not connected. State: ${dbState}`);
    return res.status(503).json({
      message: "Database connection unavailable. Please try again later.",
      dbState: dbState,
      states: {
        0: "disconnected",
        1: "connected",
        2: "connecting",
        3: "disconnecting"
      }
    });
  }
  
  next();
};

export default checkDbConnection;

