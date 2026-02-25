import express from "express";
import isAuth from "../middlewares/isAuth.js";
import {
  createGrade,
  getCourseGrades,
  getMyGrades,
  getStudentGrades,
  updateGrade,
  deleteGrade,
  bulkUploadGrades,
  getGradeStatistics,
} from "../controllers/gradeController.js";

const router = express.Router();

// Get my grades (student)
router.get("/my", isAuth, getMyGrades);

// Get grade statistics for a course
router.get("/course/:courseId/statistics", isAuth, getGradeStatistics);

// Get all grades for a course (educator)
router.get("/course/:courseId", isAuth, getCourseGrades);

// Get grades for a specific student in a course (educator)
router.get("/course/:courseId/student/:studentId", isAuth, getStudentGrades);

// Create grade (educator)
router.post("/", isAuth, createGrade);

// Bulk upload grades (educator)
router.post("/bulk", isAuth, bulkUploadGrades);

// Update grade (educator)
router.patch("/:gradeId", isAuth, updateGrade);

// Delete grade (educator)
router.delete("/:gradeId", isAuth, deleteGrade);

export default router;

