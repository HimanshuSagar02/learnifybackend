import express from "express";
import isAuth from "../middlewares/isAuth.js";
import upload from "../middlewares/multer.js";

import { 
  getCurrentUser,
  UpdateProfile,
  getEnrolledCourses,
  getMyStudents,
  getAllStudents,
  getStudentPerformance,
  updateActivity,
  getParticipantDetails
} from "../controllers/userController.js";


let userRouter = express.Router();

// Get logged in user
userRouter.get("/currentuser", isAuth, getCurrentUser);

// Update profile
userRouter.post("/updateprofile", isAuth, upload.single("photoUrl"), UpdateProfile);

// ⭐ Get enrolled courses
userRouter.get("/enrolled", isAuth, getEnrolledCourses);

// ⭐ Get student performance (educator only)
userRouter.get("/student/:studentId/performance", isAuth, getStudentPerformance);

// Educator: list students across own courses
userRouter.get("/mystudents", isAuth, getMyStudents);

// Educator/Admin: get all students in the app
userRouter.get("/allstudents", isAuth, getAllStudents);

// Activity tracking
userRouter.post("/activity", isAuth, updateActivity);

// Get participant details by identity (for live classes)
userRouter.get("/participant/:identity", isAuth, getParticipantDetails);

export default userRouter;
