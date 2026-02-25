import express from "express";
import isAuth from "../middlewares/isAuth.js";
import isAdmin from "../middlewares/isAdmin.js";
import { createUserByAdmin, listUsers, updateUserStatus, updateUserPassword } from "../controllers/adminUserController.js";
import { getPortalStats, getActivities, getProblems } from "../controllers/adminPortalController.js";

const router = express.Router();

// Log route registration
console.log("[AdminRoute] Admin routes being registered");

// User management routes - Apply middlewares directly (not as array)
router.get("/users", isAuth, isAdmin, listUsers);
router.post("/users", isAuth, isAdmin, createUserByAdmin);
router.patch("/users/:userId/status", isAuth, isAdmin, updateUserStatus);
router.patch("/users/:userId/password", isAuth, isAdmin, updateUserPassword);

// Portal management routes - Apply middlewares directly to each route
router.get("/portal/stats", isAuth, isAdmin, async (req, res) => {
  try {
    console.log("[AdminRoute] GET /portal/stats route hit");
    console.log("[AdminRoute] User ID:", req.userId);
    console.log("[AdminRoute] Request path:", req.path);
    console.log("[AdminRoute] Request originalUrl:", req.originalUrl);
    await getPortalStats(req, res);
  } catch (error) {
    console.error("[AdminRoute] Error in /portal/stats:", error);
    if (!res.headersSent) {
      return res.status(500).json({ message: "Internal server error", error: error.message });
    }
  }
});

router.get("/portal/activities", isAuth, isAdmin, async (req, res) => {
  try {
    console.log("[AdminRoute] GET /portal/activities route hit");
    console.log("[AdminRoute] User ID:", req.userId);
    await getActivities(req, res);
  } catch (error) {
    console.error("[AdminRoute] Error in /portal/activities:", error);
    if (!res.headersSent) {
      return res.status(500).json({ message: "Internal server error", error: error.message });
    }
  }
});

router.get("/portal/problems", isAuth, isAdmin, async (req, res) => {
  try {
    console.log("[AdminRoute] GET /portal/problems route hit");
    console.log("[AdminRoute] User ID:", req.userId);
    await getProblems(req, res);
  } catch (error) {
    console.error("[AdminRoute] Error in /portal/problems:", error);
    if (!res.headersSent) {
      return res.status(500).json({ message: "Internal server error", error: error.message });
    }
  }
});

// Test route to verify admin routes are working
router.get("/test", isAuth, isAdmin, (req, res) => {
  console.log("[AdminRoute] GET /test route hit");
  return res.status(200).json({ 
    message: "Admin routes are working!", 
    userId: req.userId,
    timestamp: new Date().toISOString()
  });
});

// List all registered routes (for debugging)
router.get("/routes", isAuth, isAdmin, (req, res) => {
  const routes = [
    "GET /api/admin/users",
    "POST /api/admin/users",
    "PATCH /api/admin/users/:userId/status",
    "PATCH /api/admin/users/:userId/password",
    "GET /api/admin/portal/stats",
    "GET /api/admin/portal/activities",
    "GET /api/admin/portal/problems",
    "GET /api/admin/test"
  ];
  return res.status(200).json({ 
    message: "Admin routes list",
    routes,
    timestamp: new Date().toISOString()
  });
});

console.log("[AdminRoute] Admin routes registered successfully");
console.log("[AdminRoute] Available routes:");
console.log("  - GET /api/admin/users");
console.log("  - GET /api/admin/portal/stats");
console.log("  - GET /api/admin/portal/activities");
console.log("  - GET /api/admin/portal/problems");
console.log("  - GET /api/admin/test");

export default router;

