import express from "express";
import isAuth from "../middlewares/isAuth.js";
import {
  aiTutorChat,
  generatePracticeQuestions,
  generateQuizFromContent,
  generateNotesSummary,
  checkPlagiarism,
  getContentForAI,
} from "../controllers/aiAssistantController.js";

const router = express.Router();

// AI Intelligent Tutor
router.post("/tutor/chat", isAuth, aiTutorChat);
router.post("/tutor/practice-questions", isAuth, generatePracticeQuestions);

// AI Quiz Generator
router.post("/quiz/generate", isAuth, generateQuizFromContent);

// AI Notes Summary
router.post("/notes/summarize", isAuth, generateNotesSummary);

// AI Plagiarism Checker
router.post("/plagiarism/check", isAuth, checkPlagiarism);

// Get content for AI features
router.get("/content", isAuth, getContentForAI);

export default router;

