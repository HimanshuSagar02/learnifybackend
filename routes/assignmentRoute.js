import express from "express";
import isAuth from "../middlewares/isAuth.js";
import upload from "../middlewares/multer.js";
import {
  createAssignment,
  getAssignmentsByCourse,
  updateAssignment,
  deleteAssignment,
  submitAssignment,
  getMySubmission,
  getSubmissionsForAssignment,
  gradeSubmission,
} from "../controllers/assignmentController.js";

const router = express.Router();

router.use(isAuth);

// Educator manages assignments
router.post("/", upload.single("attachment"), createAssignment);
router.patch("/:assignmentId", updateAssignment);
router.delete("/:assignmentId", deleteAssignment);

// List assignments for a course (students + educators)
router.get("/:courseId", getAssignmentsByCourse);

// Student submission
router.post("/:assignmentId/submit", upload.single("attachment"), submitAssignment);
router.get("/:assignmentId/my", getMySubmission);

// Educator views submissions and grades
router.get("/:assignmentId/submissions", getSubmissionsForAssignment);
router.post("/submissions/:submissionId/grade", gradeSubmission);

export default router;

