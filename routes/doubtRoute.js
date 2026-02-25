import express from "express";
import isAuth from "../middlewares/isAuth.js";
import {
  createDoubt,
  getMyDoubts,
  getAssignedDoubts,
  getAllDoubts,
  getDoubtById,
  addResponse,
  updateDoubtStatus,
  assignDoubt,
  deleteDoubt,
} from "../controllers/doubtController.js";

const router = express.Router();

// Create doubt (student)
router.post("/", isAuth, createDoubt);

// Get my doubts (student)
router.get("/my", isAuth, getMyDoubts);

// Get doubts assigned to me (educator/admin)
router.get("/assigned", isAuth, getAssignedDoubts);

// Get all doubts (admin only)
router.get("/all", isAuth, getAllDoubts);

// Get single doubt
router.get("/:doubtId", isAuth, getDoubtById);

// Add response to doubt
router.post("/:doubtId/response", isAuth, addResponse);

// Update doubt status
router.patch("/:doubtId/status", isAuth, updateDoubtStatus);

// Assign doubt (admin only)
router.patch("/:doubtId/assign", isAuth, assignDoubt);

// Delete doubt
router.delete("/:doubtId", isAuth, deleteDoubt);

export default router;

