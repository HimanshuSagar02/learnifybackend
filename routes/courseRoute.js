import express from "express";
import isAuth from "../middlewares/isAuth.js";
import { 
  createCourse, 
  createLecture, 
  editCourse, 
  editLecture, 
  getCourseById, 
  getCourseLecture, 
  getCreatorById, 
  getCreatorCourses, 
  getPublishedCourses, 
  removeCourse, 
  removeLecture, 
  getAllCourse,
  enrollCourse,
  getCourseStudents        // <<--- IMPORT ADDED
} from "../controllers/courseController.js";
import upload from "../middlewares/multer.js";

let courseRouter = express.Router();

// ================= Routes =================

// Create Course
courseRouter.post("/create", isAuth, createCourse);

// Fetch All Courses
courseRouter.get("/getallcourse", getAllCourse);

// Fetch Published Courses (for homepage)
courseRouter.get("/getpublishedcoures", getPublishedCourses);

// Fetch Courses of Creator
courseRouter.get("/getcreatorcourses", isAuth, getCreatorCourses);

// Edit Course
courseRouter.post("/editcourse/:courseId", isAuth, upload.single("thumbnail"), editCourse);

// Single Course Data
courseRouter.get("/getcourse/:courseId", isAuth, getCourseById);
courseRouter.get("/getcourse/:courseId/students", isAuth, getCourseStudents);

// Remove Course
courseRouter.delete("/removecourse/:courseId", isAuth, removeCourse);

// Create Lecture
courseRouter.post("/createlecture/:courseId", isAuth, createLecture);

// Get Lectures
courseRouter.get("/getcourselecture/:courseId", isAuth, getCourseLecture);

// Edit Lecture
courseRouter.post("/editlecture/:lectureId", isAuth, upload.single("videoUrl"), editLecture);

// Remove Lecture
courseRouter.delete("/removelecture/:lectureId", isAuth, removeLecture);

// Get Creator Profile (Instructor Info)
courseRouter.post("/getcreator", isAuth, getCreatorById);

// ⭐ Enroll Course
courseRouter.post("/enroll/:courseId", isAuth, enrollCourse);

export default courseRouter;
