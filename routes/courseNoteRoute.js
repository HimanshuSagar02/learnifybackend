import express from "express";
import isAuth from "../middlewares/isAuth.js";
import upload from "../middlewares/multer.js";
import {
  listCourseNotes,
  createCourseNote,
  deleteCourseNote,
} from "../controllers/courseNoteController.js";

const router = express.Router();

router.use(isAuth);

router.get("/", listCourseNotes);
router.post("/", upload.single("file"), createCourseNote);
router.delete("/:noteId", deleteCourseNote);

export default router;

