import express from "express";
import isAuth from "../middlewares/isAuth.js";
import isAdmin from "../middlewares/isAdmin.js";
import {
  markAttendance,
  listCourseAttendance,
  listMyAttendance,
  listAllAttendance,
} from "../controllers/attendanceController.js";

const router = express.Router();

// Students get their attendance
router.get("/my", isAuth, listMyAttendance);

// Course attendance (educator who owns it)
router.get("/course/:courseId", isAuth, listCourseAttendance);

// Mark attendance (educator)
router.post("/", isAuth, markAttendance);

// Admin view all
router.get("/all", isAuth, isAdmin, listAllAttendance);

export default router;

