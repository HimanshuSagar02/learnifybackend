import LiveClass from "../models/liveClassModel.js";
import Course from "../models/courseModel.js";
import User from "../models/userModel.js";
import { generateLiveKitToken, getLiveKitURL } from "../configs/livekit.js";

// Test LiveKit credentials (admin only)
export const testLiveKitCredentials = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    const { generateLiveKitToken } = await import("../configs/livekit.js");
    
    // Try to generate a test token
    const testToken = await generateLiveKitToken(
      "test-room",
      "Test User",
      "test-identity",
      true
    );

    return res.status(200).json({
      success: true,
      message: "LiveKit credentials are valid",
      tokenLength: testToken.length,
      url: getLiveKitURL(),
    });
  } catch (error) {
    console.error("[LiveKit] Test credentials error:", error);
    return res.status(500).json({
      success: false,
      message: "LiveKit credentials test failed",
      error: error.message,
      hint: error.message.includes("LIVEKIT_API_SECRET") 
        ? "Please check your LIVEKIT_API_SECRET in .env file"
        : "Please verify your LiveKit API key and secret are correct"
    });
  }
};

// Create live class (educator only)
export const createLiveClass = async (req, res) => {
  try {
    const {
      title,
      description,
      courseId,
      platformType,
      meetingLink,
      meetingId,
      meetingPassword,
      scheduledDate,
      duration,
      maxParticipants,
    } = req.body;

    if (!title || !courseId || !scheduledDate) {
      return res.status(400).json({
        message: "Title, courseId, and scheduledDate are required",
      });
    }

    // Validate platform-specific requirements
    if (platformType === "zoom" || platformType === "google-meet") {
      if (!meetingLink) {
        return res.status(400).json({
          message: "Meeting link is required for Zoom/Google Meet classes",
        });
      }
    }

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Only educators and admins can create live classes
    if (user.role !== "educator" && user.role !== "admin") {
      console.log(`[CreateLiveClass] Access denied - User role: ${user.role}, User ID: ${req.userId}`);
      return res.status(403).json({ 
        message: "Only educators and admins can create live classes. Please contact your administrator if you need access." 
      });
    }
    
    console.log(`[CreateLiveClass] User authorized - Role: ${user.role}, Name: ${user.name}`);

    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ message: "Course not found" });

    // Verify educator owns the course (unless admin)
    if (user.role === "educator" && course.creator.toString() !== req.userId.toString()) {
      return res.status(403).json({ message: "You can only create live classes for your own courses" });
    }

    const liveClass = await LiveClass.create({
      title,
      description,
      courseId,
      educatorId: req.userId,
      platformType: platformType || "portal",
      meetingLink: meetingLink || "",
      meetingId: meetingId || "",
      meetingPassword: meetingPassword || "",
      scheduledDate: new Date(scheduledDate),
      duration: duration || 60,
      maxParticipants: maxParticipants || 100,
      status: "scheduled",
    });

    // Populate the created live class before returning
    await liveClass.populate("courseId", "title thumbnail");
    await liveClass.populate("educatorId", "name email photoUrl");
    
    console.log(`[CreateLiveClass] Live class created successfully - ID: ${liveClass._id}, Title: ${liveClass.title}`);
    
    return res.status(201).json(liveClass);
  } catch (error) {
    console.error("[CreateLiveClass] Error:", error);
    console.error("[CreateLiveClass] Error stack:", error.stack);
    return res.status(500).json({ 
      message: `Create live class failed: ${error.message || error}`,
      error: process.env.NODE_ENV === 'development' ? error.message : "Internal server error",
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// Get live classes for a course
export const getCourseLiveClasses = async (req, res) => {
  try {
    const { courseId } = req.params;
    console.log(`[GetCourseLiveClasses] Fetching live classes for course: ${courseId}`);
    const liveClasses = await LiveClass.find({ courseId })
      .populate("educatorId", "name email photoUrl")
      .populate("enrolledStudents.studentId", "name email")
      .sort({ scheduledDate: -1 });

    console.log(`[GetCourseLiveClasses] Found ${liveClasses.length} live classes`);
    return res.status(200).json(liveClasses || []);
  } catch (error) {
    console.error("[GetCourseLiveClasses] Error:", error);
    return res.status(500).json({ 
      message: `Fetch live classes failed: ${error.message || error}` 
    });
  }
};

// Get all live classes for student (enrolled courses)
export const getMyLiveClasses = async (req, res) => {
  try {
    console.log(`[GetMyLiveClasses] Fetching live classes for user: ${req.userId}`);
    const user = await User.findById(req.userId).populate("enrolledCourses");
    if (!user) {
      console.log(`[GetMyLiveClasses] User not found: ${req.userId}`);
      return res.status(404).json({ message: "User not found" });
    }

    const courseIds = (user.enrolledCourses || []).map((c) =>
      typeof c === "string" ? c : c._id
    );

    console.log(`[GetMyLiveClasses] User enrolled in ${courseIds.length} courses`);

    if (courseIds.length === 0) {
      console.log(`[GetMyLiveClasses] No enrolled courses, returning empty array`);
      return res.status(200).json([]);
    }

    const liveClasses = await LiveClass.find({
      courseId: { $in: courseIds },
      status: { $in: ["scheduled", "live"] },
    })
      .populate("courseId", "title thumbnail")
      .populate("educatorId", "name email photoUrl")
      .lean()
      .sort({ scheduledDate: 1 });

    console.log(`[GetMyLiveClasses] Found ${liveClasses.length} live classes`);
    
    // Ensure all live classes have proper structure
    const formattedLiveClasses = (liveClasses || []).map(liveClass => ({
      ...liveClass,
      courseId: liveClass.courseId || { _id: liveClass.courseId, title: "Unknown Course" },
      educatorId: liveClass.educatorId || { _id: liveClass.educatorId, name: "Unknown Educator" }
    }));
    
    return res.status(200).json(formattedLiveClasses);
  } catch (error) {
    console.error("[GetMyLiveClasses] Error:", error);
    console.error("[GetMyLiveClasses] Error stack:", error.stack);
    return res.status(500).json({ 
      message: `Fetch my live classes failed: ${error.message || error}`,
      error: process.env.NODE_ENV === 'development' ? error.message : "Internal server error",
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// Get live classes created by educator
export const getEducatorLiveClasses = async (req, res) => {
  try {
    console.log(`[GetEducatorLiveClasses] Fetching live classes for educator: ${req.userId}`);
    const user = await User.findById(req.userId);
    if (!user) {
      console.log(`[GetEducatorLiveClasses] User not found: ${req.userId}`);
      return res.status(404).json({ message: "User not found" });
    }

    if (user.role !== "educator" && user.role !== "admin") {
      console.log(`[GetEducatorLiveClasses] Access denied for role: ${user.role}`);
      return res.status(403).json({ message: "Only educators can view their live classes" });
    }

    const liveClasses = await LiveClass.find({ educatorId: req.userId })
      .populate("courseId", "title thumbnail")
      .populate("enrolledStudents.studentId", "name email photoUrl")
      .lean()
      .sort({ scheduledDate: -1 });

    console.log(`[GetEducatorLiveClasses] Found ${liveClasses.length} live classes`);
    
    // Ensure all live classes have proper structure
    const formattedLiveClasses = (liveClasses || []).map(liveClass => ({
      ...liveClass,
      courseId: liveClass.courseId || { _id: liveClass.courseId, title: "Unknown Course" },
      enrolledStudents: liveClass.enrolledStudents || []
    }));
    
    return res.status(200).json(formattedLiveClasses);
  } catch (error) {
    console.error("[GetEducatorLiveClasses] Error:", error);
    console.error("[GetEducatorLiveClasses] Error stack:", error.stack);
    return res.status(500).json({ 
      message: `Fetch educator live classes failed: ${error.message || error}`,
      error: process.env.NODE_ENV === 'development' ? error.message : "Internal server error",
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// Join live class (student)
export const joinLiveClass = async (req, res) => {
  try {
    const { liveClassId } = req.params;
    const liveClass = await LiveClass.findById(liveClassId);
    if (!liveClass) return res.status(404).json({ message: "Live class not found" });

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Check if student is enrolled in the course
    const course = await Course.findById(liveClass.courseId);
    if (!course) return res.status(404).json({ message: "Course not found" });

    const isEnrolled = course.enrolledStudents.some(
      (id) => id.toString() === req.userId.toString()
    );

    if (!isEnrolled && user.role !== "admin") {
      return res.status(403).json({ message: "You must be enrolled in the course to join" });
    }

    // Check if already joined
    const existingJoin = liveClass.enrolledStudents && Array.isArray(liveClass.enrolledStudents) 
      ? liveClass.enrolledStudents.find(
          (s) => s.studentId.toString() === req.userId.toString()
        )
      : null;

    if (existingJoin) {
      // Check if already joined today (within same session)
      const lastJoinTime = new Date(existingJoin.joinedAt);
      const now = new Date();
      const timeDiff = now - lastJoinTime;
      const minutesDiff = timeDiff / (1000 * 60);

      // If joined within last 5 minutes, consider it duplicate
      if (minutesDiff < 5 && !existingJoin.leftAt) {
        return res.status(200).json({
          message: "You have already joined this live class",
          alreadyJoined: true,
          liveClass: {
            ...liveClass.toObject(),
            meetingLink: liveClass.meetingLink,
            meetingId: liveClass.meetingId,
            meetingPassword: liveClass.meetingPassword,
          },
        });
      }

      // Update join time if rejoining after leaving
      existingJoin.joinedAt = new Date();
      existingJoin.leftAt = null; // Clear left time if rejoining
      existingJoin.attendance = true;
    } else {
      // Initialize enrolledStudents array if it doesn't exist
      if (!liveClass.enrolledStudents) {
        liveClass.enrolledStudents = [];
      }
      // Add new join record
      liveClass.enrolledStudents.push({
        studentId: req.userId,
        joinedAt: new Date(),
        attendance: true,
      });
    }

    await liveClass.save();

    return res.status(200).json({
      message: "Successfully joined the live class",
      alreadyJoined: false,
      liveClass: {
        ...liveClass.toObject(),
        meetingLink: liveClass.meetingLink,
        meetingId: liveClass.meetingId,
        meetingPassword: liveClass.meetingPassword,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: `Join live class failed: ${error.message}` });
  }
};

// Update live class status (educator)
export const updateLiveClassStatus = async (req, res) => {
  try {
    const { liveClassId } = req.params;
    const { status, recordingUrl, notes } = req.body;

    const liveClass = await LiveClass.findById(liveClassId);
    if (!liveClass) return res.status(404).json({ message: "Live class not found" });

    const user = await User.findById(req.userId);
    if (user.role !== "admin" && liveClass.educatorId.toString() !== req.userId.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }

    if (status) {
      if (!["scheduled", "live", "completed", "cancelled"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      liveClass.status = status;
      
      // Generate LiveKit room name when status changes to "live" for portal platform
      if (status === "live" && liveClass.platformType === "portal" && !liveClass.liveKitRoomName) {
        // Create unique room name: liveclass-{liveClassId} (sanitized for LiveKit)
        const roomId = liveClass._id.toString().replace(/[^a-zA-Z0-9_-]/g, '-');
        liveClass.liveKitRoomName = `liveclass-${roomId}`;
        console.log(`[LiveKit] Created room: ${liveClass.liveKitRoomName} for live class: ${liveClass._id}`);
      }
      
      // If starting a class that was scheduled for future, update scheduledDate to now
      // This allows "Start Now" feature to work even if class was scheduled for later
      if (status === "live" && new Date(liveClass.scheduledDate) > new Date()) {
        console.log(`[UpdateLiveClassStatus] Starting class early - was scheduled for ${liveClass.scheduledDate}, starting now`);
        // Keep original scheduled date for reference, but class is now live
        // Optionally, you could update scheduledDate to now if needed
      }
    }

    if (recordingUrl) liveClass.recordingUrl = recordingUrl;
    if (notes) liveClass.notes = notes;

    await liveClass.save();

    return res.status(200).json(liveClass);
  } catch (error) {
    return res.status(500).json({ message: `Update live class failed: ${error.message}` });
  }
};

// Update live class (educator)
export const updateLiveClass = async (req, res) => {
  try {
    const { liveClassId } = req.params;
    const updateData = req.body;

    const liveClass = await LiveClass.findById(liveClassId);
    if (!liveClass) return res.status(404).json({ message: "Live class not found" });

    const user = await User.findById(req.userId);
    if (user.role !== "admin" && liveClass.educatorId.toString() !== req.userId.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }

    if (updateData.scheduledDate) {
      updateData.scheduledDate = new Date(updateData.scheduledDate);
    }

    Object.assign(liveClass, updateData);
    await liveClass.save();

    return res.status(200).json(liveClass);
  } catch (error) {
    return res.status(500).json({ message: `Update live class failed: ${error.message}` });
  }
};

// Delete live class (educator)
export const deleteLiveClass = async (req, res) => {
  try {
    const { liveClassId } = req.params;

    const liveClass = await LiveClass.findById(liveClassId);
    if (!liveClass) return res.status(404).json({ message: "Live class not found" });

    const user = await User.findById(req.userId);
    if (user.role !== "admin" && liveClass.educatorId.toString() !== req.userId.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }

    await liveClass.deleteOne();

    return res.status(200).json({ message: "Live class deleted successfully" });
  } catch (error) {
    return res.status(500).json({ message: `Delete live class failed: ${error.message}` });
  }
};

// Get single live class details
export const getLiveClassById = async (req, res) => {
  try {
    const { liveClassId } = req.params;

    const liveClass = await LiveClass.findById(liveClassId)
      .populate("courseId", "title thumbnail description")
      .populate("educatorId", "name email photoUrl")
      .populate("enrolledStudents.studentId", "name email photoUrl");

    if (!liveClass) return res.status(404).json({ message: "Live class not found" });

    return res.status(200).json(liveClass);
  } catch (error) {
    return res.status(500).json({ message: `Fetch live class failed: ${error.message}` });
  }
};

// WebRTC Signaling - Store for offers/answers/ICE candidates
// Structure: Map<liveClassId, { offers: [], answers: [], iceCandidates: [], lastActivity: Date }>
const webrtcSignaling = new Map();

// Cleanup old signaling data (older than 1 hour)
setInterval(() => {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  for (const [liveClassId, data] of webrtcSignaling.entries()) {
    if (data.lastActivity && new Date(data.lastActivity) < oneHourAgo) {
      webrtcSignaling.delete(liveClassId);
      console.log(`Cleaned up signaling data for live class ${liveClassId}`);
    }
  }
}, 30 * 60 * 1000); // Run every 30 minutes

// Handle WebRTC offer (educator creates offer)
export const handleOffer = async (req, res) => {
  try {
    const { liveClassId } = req.params;
    const { offer } = req.body;

    const liveClass = await LiveClass.findById(liveClassId);
    if (!liveClass) return res.status(404).json({ message: "Live class not found" });

    const user = await User.findById(req.userId);
    if (user.role !== "educator" && user.role !== "admin") {
      return res.status(403).json({ message: "Only educators can create offers" });
    }

    if (liveClass.educatorId.toString() !== req.userId.toString() && user.role !== "admin") {
      return res.status(403).json({ message: "Not authorized" });
    }

    // Store offer
    if (!webrtcSignaling.has(liveClassId)) {
      webrtcSignaling.set(liveClassId, { offers: [], answers: [], iceCandidates: [], lastActivity: new Date() });
    }
    const signaling = webrtcSignaling.get(liveClassId);
    // Keep only the latest offer
    signaling.offers = [{ offer, userId: req.userId, timestamp: new Date() }];
    signaling.lastActivity = new Date();

    return res.status(200).json({ message: "Offer stored" });
  } catch (error) {
    return res.status(500).json({ message: `Handle offer failed: ${error.message}` });
  }
};

// Get WebRTC offer (student gets offer)
export const getOffer = async (req, res) => {
  try {
    const { liveClassId } = req.params;

    const liveClass = await LiveClass.findById(liveClassId);
    if (!liveClass) return res.status(404).json({ message: "Live class not found" });

    const signaling = webrtcSignaling.get(liveClassId);
    if (!signaling || signaling.offers.length === 0) {
      return res.status(200).json({ offer: null });
    }

    // Get the latest offer
    const latestOffer = signaling.offers[signaling.offers.length - 1];
    return res.status(200).json({ offer: latestOffer.offer });
  } catch (error) {
    return res.status(500).json({ message: `Get offer failed: ${error.message}` });
  }
};

// Handle WebRTC answer (student creates answer)
export const handleAnswer = async (req, res) => {
  try {
    const { liveClassId } = req.params;
    const { answer } = req.body;

    const liveClass = await LiveClass.findById(liveClassId);
    if (!liveClass) return res.status(404).json({ message: "Live class not found" });

    if (!webrtcSignaling.has(liveClassId)) {
      webrtcSignaling.set(liveClassId, { offers: [], answers: [], iceCandidates: [], lastActivity: new Date() });
    }
    const signaling = webrtcSignaling.get(liveClassId);
    // Keep only the latest answer from this user
    signaling.answers = signaling.answers.filter(a => a.userId.toString() !== req.userId.toString());
    signaling.answers.push({ answer, userId: req.userId, timestamp: new Date() });
    signaling.lastActivity = new Date();

    return res.status(200).json({ message: "Answer stored" });
  } catch (error) {
    return res.status(500).json({ message: `Handle answer failed: ${error.message}` });
  }
};

// Get WebRTC answer (educator gets answer)
export const getAnswer = async (req, res) => {
  try {
    const { liveClassId } = req.params;

    const liveClass = await LiveClass.findById(liveClassId);
    if (!liveClass) return res.status(404).json({ message: "Live class not found" });

    const user = await User.findById(req.userId);
    if (liveClass.educatorId.toString() !== req.userId.toString() && user.role !== "admin") {
      return res.status(403).json({ message: "Not authorized" });
    }

    const signaling = webrtcSignaling.get(liveClassId);
    if (!signaling || signaling.answers.length === 0) {
      return res.status(200).json({ answer: null });
    }

    // Get the latest answer
    const latestAnswer = signaling.answers[signaling.answers.length - 1];
    return res.status(200).json({ answer: latestAnswer.answer });
  } catch (error) {
    return res.status(500).json({ message: `Get answer failed: ${error.message}` });
  }
};

// Handle ICE candidate
export const handleIceCandidate = async (req, res) => {
  try {
    const { liveClassId } = req.params;
    const { candidate } = req.body;

    const liveClass = await LiveClass.findById(liveClassId);
    if (!liveClass) return res.status(404).json({ message: "Live class not found" });

    if (!webrtcSignaling.has(liveClassId)) {
      webrtcSignaling.set(liveClassId, { offers: [], answers: [], iceCandidates: [], lastActivity: new Date() });
    }
    const signaling = webrtcSignaling.get(liveClassId);
    // Limit ICE candidates to last 50 per user to prevent memory issues
    const userCandidates = signaling.iceCandidates.filter(c => c.userId.toString() === req.userId.toString());
    if (userCandidates.length >= 50) {
      signaling.iceCandidates = signaling.iceCandidates.filter(c => c.userId.toString() !== req.userId.toString());
    }
    signaling.iceCandidates.push({ candidate, userId: req.userId, timestamp: new Date() });
    signaling.lastActivity = new Date();

    return res.status(200).json({ message: "ICE candidate stored" });
  } catch (error) {
    return res.status(500).json({ message: `Handle ICE candidate failed: ${error.message}` });
  }
};

// Get ICE candidates
export const getIceCandidates = async (req, res) => {
  try {
    const { liveClassId } = req.params;

    const liveClass = await LiveClass.findById(liveClassId);
    if (!liveClass) return res.status(404).json({ message: "Live class not found" });

    const signaling = webrtcSignaling.get(liveClassId);
    if (!signaling) {
      return res.status(200).json({ candidates: [] });
    }

    // Return candidates from other users
    const otherCandidates = signaling.iceCandidates.filter(
      (c) => c.userId.toString() !== req.userId.toString()
    );

    return res.status(200).json({ candidates: otherCandidates.map((c) => c.candidate) });
  } catch (error) {
    return res.status(500).json({ message: `Get ICE candidates failed: ${error.message}` });
  }
};

// Leave live class
export const leaveLiveClass = async (req, res) => {
  try {
    const { liveClassId } = req.params;

    const liveClass = await LiveClass.findById(liveClassId);
    if (!liveClass) return res.status(404).json({ message: "Live class not found" });

    const existingJoin = liveClass.enrolledStudents && Array.isArray(liveClass.enrolledStudents)
      ? liveClass.enrolledStudents.find(
          (s) => s.studentId.toString() === req.userId.toString()
        )
      : null;

    if (existingJoin) {
      existingJoin.leftAt = new Date();
      await liveClass.save();
    }

    return res.status(200).json({ message: "Left live class successfully" });
  } catch (error) {
    return res.status(500).json({ message: `Leave live class failed: ${error.message}` });
  }
};

// Get LiveKit access token for joining a live class
export const getLiveKitToken = async (req, res) => {
  try {
    const { liveClassId } = req.params;
    
    console.log(`[LiveKit] Requesting token for live class: ${liveClassId}, User: ${req.userId}`);
    
    const liveClass = await LiveClass.findById(liveClassId).populate("courseId");
    if (!liveClass) {
      console.log(`[LiveKit] Live class not found: ${liveClassId}`);
      return res.status(404).json({ message: "Live class not found" });
    }
    
    console.log(`[LiveKit] Live class found - Status: ${liveClass.status}, Platform: ${liveClass.platformType}, Room: ${liveClass.liveKitRoomName}`);

    // Only allow joining if class is live
    if (liveClass.status !== "live") {
      return res.status(400).json({ 
        message: "Live class is not currently active. Please wait for the educator to start the class." 
      });
    }

    // Only portal platform uses LiveKit
    if (liveClass.platformType !== "portal") {
      return res.status(400).json({ 
        message: "This live class uses an external platform. Please use the provided meeting link." 
      });
    }

    // Ensure room name is set (create if missing)
    if (!liveClass.liveKitRoomName) {
      // Create unique room name: liveclass-{liveClassId} (sanitized for LiveKit)
      const roomId = liveClass._id.toString().replace(/[^a-zA-Z0-9_-]/g, '-');
      liveClass.liveKitRoomName = `liveclass-${roomId}`;
      await liveClass.save();
      console.log(`[LiveKit] Auto-created room: ${liveClass.liveKitRoomName} for live class: ${liveClass._id}`);
    }
    
    // Validate room name format
    if (!liveClass.liveKitRoomName.startsWith('liveclass-')) {
      console.warn(`[LiveKit] Warning: Room name "${liveClass.liveKitRoomName}" doesn't follow expected format`);
    }

    const user = await User.findById(req.userId).populate("enrolledCourses");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if user is educator or admin
    const isEducator = user.role === "educator" || user.role === "admin";
    
    // Check if user is the educator who created this class
    const isClassCreator = liveClass.educatorId.toString() === req.userId.toString();
    
    // If user is the class creator or admin, allow access
    if (isClassCreator || user.role === "admin") {
      // Generate token for educator/admin
      try {
        console.log(`[LiveKit] Generating token for educator/admin - Room: ${liveClass.liveKitRoomName}, User: ${user.name || user.email}`);
        const token = await generateLiveKitToken(
          liveClass.liveKitRoomName,
          user.name || user.email || "Educator",
          req.userId.toString(),
          true // Educators can publish
        );

        console.log(`[LiveKit] Token generated successfully for educator`);
        console.log(`[LiveKit] Response - Token length: ${token.length}, URL: ${getLiveKitURL()}, Room: ${liveClass.liveKitRoomName}`);
        
        return res.status(200).json({
          success: true,
          token,
          url: getLiveKitURL(),
          roomName: liveClass.liveKitRoomName,
        });
      } catch (tokenError) {
        console.error("[LiveKit] Token generation error for educator:", tokenError);
        return res.status(500).json({ 
          message: tokenError.message || "Failed to generate LiveKit token",
          hint: tokenError.message?.includes("LIVEKIT_API_SECRET") ? "Please check your LiveKit API credentials in .env file" : undefined,
          error: process.env.NODE_ENV === "development" ? tokenError.stack : undefined
        });
      }
    }
    
    // For students, check enrollment
    const courseIdString = liveClass.courseId?._id?.toString() || liveClass.courseId?.toString();
    const isEnrolled = courseIdString && user.enrolledCourses?.some(
      (courseId) => {
        const enrolledCourseId = typeof courseId === "string" ? courseId : (courseId?._id?.toString() || courseId?.toString());
        return enrolledCourseId === courseIdString;
      }
    );

    if (!isEnrolled) {
      return res.status(403).json({ 
        message: "You must be enrolled in the course to join this live class" 
      });
    }

    // Generate LiveKit token for student
    try {
      console.log(`[LiveKit] Generating token for student - Room: ${liveClass.liveKitRoomName}, User: ${user.name || user.email}`);
      const token = await generateLiveKitToken(
        liveClass.liveKitRoomName,
        user.name || user.email || "Student",
        req.userId.toString(),
        false // Students can view but publishing is optional
      );

      console.log(`[LiveKit] Token generated successfully for student`);
      console.log(`[LiveKit] Response - Token length: ${token.length}, URL: ${getLiveKitURL()}, Room: ${liveClass.liveKitRoomName}`);
      
      return res.status(200).json({
        success: true,
        token,
        url: getLiveKitURL(),
        roomName: liveClass.liveKitRoomName,
      });
    } catch (tokenError) {
      console.error("[LiveKit] Token generation error for student:", tokenError);
      console.error("[LiveKit] Error details:", {
        message: tokenError.message,
        stack: tokenError.stack,
        roomName: liveClass.liveKitRoomName,
        apiKey: process.env.LIVEKIT_API_KEY ? `${process.env.LIVEKIT_API_KEY.substring(0, 10)}...` : "Missing",
        apiSecret: process.env.LIVEKIT_API_SECRET ? "Set" : "Missing"
      });
      return res.status(500).json({ 
        message: tokenError.message || "Failed to generate LiveKit token",
        hint: tokenError.message?.includes("LIVEKIT_API_SECRET") ? "Please check your LiveKit API credentials in .env file" : "Please verify your LiveKit API key and secret are correct",
        error: process.env.NODE_ENV === "development" ? tokenError.stack : undefined
      });
    }
  } catch (error) {
    console.error("[LiveKit] Get LiveKit token error:", error);
    console.error("[LiveKit] Error stack:", error.stack);
    return res.status(500).json({ 
      message: `Failed to generate LiveKit token: ${error.message}`,
      hint: !process.env.LIVEKIT_API_SECRET ? "LIVEKIT_API_SECRET is missing in .env file" : undefined,
      error: process.env.NODE_ENV === "development" ? error.stack : undefined
    });
  }
};

