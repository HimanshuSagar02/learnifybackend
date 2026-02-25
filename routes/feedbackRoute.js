import express from "express";
import isAuth from "../middlewares/isAuth.js";
import isAdmin from "../middlewares/isAdmin.js";
import {
  createFeedback,
  getAllFeedback,
  getFeedbackStats,
  updateFeedbackStatus,
  getMyFeedback,
  getTeachersList
} from "../controllers/feedbackController.js";
import { generateFeedbackReport } from "../controllers/feedbackReportController.js";

const router = express.Router();

// Student routes
router.post("/", isAuth, createFeedback); // Create feedback
router.get("/my", isAuth, getMyFeedback); // Get student's own feedback
router.get("/teachers", isAuth, getTeachersList); // Get teachers list

// Admin routes
router.get("/all", isAuth, isAdmin, getAllFeedback); // Get all feedback
router.get("/stats", isAuth, isAdmin, getFeedbackStats); // Get statistics
router.get("/report", isAuth, isAdmin, generateFeedbackReport); // Generate PDF report
router.patch("/:feedbackId/status", isAuth, isAdmin, updateFeedbackStatus); // Update feedback status

export default router;

