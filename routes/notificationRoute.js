import express from "express";
import isAuth from "../middlewares/isAuth.js";
import {
  createNotification,
  getMyNotifications,
  markAsRead,
  getAllNotifications,
  deleteNotification,
} from "../controllers/notificationController.js";

const router = express.Router();

// Get my notifications
router.get("/my", isAuth, getMyNotifications);

// Get all notifications (for management - educator/admin)
router.get("/all", isAuth, getAllNotifications);

// Create notification (educator/admin)
router.post("/", isAuth, createNotification);

// Mark as read
router.post("/:notificationId/read", isAuth, markAsRead);

// Delete notification
router.delete("/:notificationId", isAuth, deleteNotification);

export default router;

