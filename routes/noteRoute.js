import express from "express";
import isAuth from "../middlewares/isAuth.js";
import { createNote, getNotes, updateNote, deleteNote } from "../controllers/noteController.js";

const router = express.Router();

router.use(isAuth);

router.get("/", getNotes);
router.post("/", createNote);
router.patch("/:noteId", updateNote);
router.delete("/:noteId", deleteNote);

export default router;

