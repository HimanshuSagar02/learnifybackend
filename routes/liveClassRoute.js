import express from "express";
import isAuth from "../middlewares/isAuth.js";
import {
  createLiveClass,
  getCourseLiveClasses,
  getMyLiveClasses,
  getEducatorLiveClasses,
  joinLiveClass,
  updateLiveClassStatus,
  updateLiveClass,
  deleteLiveClass,
  getLiveClassById,
  handleOffer,
  getOffer,
  handleAnswer,
  getAnswer,
  handleIceCandidate,
  getIceCandidates,
  leaveLiveClass,
  getLiveKitToken,
  testLiveKitCredentials,
} from "../controllers/liveClassController.js";

const router = express.Router();

// Get live classes for a course
router.get("/course/:courseId", isAuth, getCourseLiveClasses);

// Get my live classes (student - enrolled courses)
router.get("/my", isAuth, getMyLiveClasses);

// Get educator's live classes
router.get("/educator", isAuth, getEducatorLiveClasses);

// Get single live class
router.get("/:liveClassId", isAuth, getLiveClassById);

// Create live class (educator)
router.post("/", isAuth, createLiveClass);

// Join live class (student)
router.post("/:liveClassId/join", isAuth, joinLiveClass);

// Update live class status
router.patch("/:liveClassId/status", isAuth, updateLiveClassStatus);

// Update live class
router.patch("/:liveClassId", isAuth, updateLiveClass);

// Delete live class
router.delete("/:liveClassId", isAuth, deleteLiveClass);

// WebRTC Signaling endpoints
// Create/Store offer (educator)
router.post("/:liveClassId/offer", isAuth, handleOffer);

// Get offer (student)
router.get("/:liveClassId/offer", isAuth, getOffer);

// Create/Store answer (student)
router.post("/:liveClassId/answer", isAuth, handleAnswer);

// Get answer (educator)
router.get("/:liveClassId/answer", isAuth, getAnswer);

// Store ICE candidate
router.post("/:liveClassId/ice-candidate", isAuth, handleIceCandidate);

// Get ICE candidates
router.get("/:liveClassId/ice-candidates", isAuth, getIceCandidates);

// Leave live class
router.post("/:liveClassId/leave", isAuth, leaveLiveClass);

// Get LiveKit access token
router.get("/:liveClassId/livekit-token", isAuth, getLiveKitToken);

// Test LiveKit credentials (admin only)
router.get("/test/livekit-credentials", isAuth, testLiveKitCredentials);

export default router;

