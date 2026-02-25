import Feedback from "../models/feedbackModel.js";
import User from "../models/userModel.js";

// Create feedback (Student only)
export const createFeedback = async (req, res) => {
  try {
    const { feedbackType, teacherId, teacherName, rating, comment, category, isAnonymous } = req.body;
    const studentId = req.userId;

    // Validation
    if (!feedbackType || !rating || !comment) {
      return res.status(400).json({ message: "Feedback type, rating, and comment are required" });
    }

    if (feedbackType === "teacher" && !teacherId && !teacherName) {
      return res.status(400).json({ message: "Teacher ID or name is required for teacher feedback" });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({ message: "Rating must be between 1 and 5" });
    }

    // Get teacher name if teacherId is provided
    let finalTeacherName = teacherName;
    if (teacherId && !teacherName) {
      const teacher = await User.findById(teacherId);
      if (!teacher || teacher.role !== "educator") {
        return res.status(404).json({ message: "Teacher not found" });
      }
      finalTeacherName = teacher.name;
    }

    const feedback = await Feedback.create({
      studentId,
      feedbackType,
      teacherId: feedbackType === "teacher" ? teacherId : undefined,
      teacherName: feedbackType === "teacher" ? finalTeacherName : undefined,
      rating,
      comment,
      category: category || "overall",
      isAnonymous: isAnonymous || false
    });

    return res.status(201).json({
      message: "Feedback submitted successfully",
      feedback
    });
  } catch (error) {
    console.error("Create feedback error:", error);
    return res.status(500).json({ message: `Create feedback failed: ${error.message}` });
  }
};

// Get all feedback (Admin only)
export const getAllFeedback = async (req, res) => {
  try {
    const { feedbackType, status, teacherId, startDate, endDate } = req.query;
    
    let filter = {};
    
    if (feedbackType) {
      filter.feedbackType = feedbackType;
    }
    
    if (status) {
      filter.status = status;
    }
    
    if (teacherId) {
      filter.teacherId = teacherId;
    }
    
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) {
        filter.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        filter.createdAt.$lte = new Date(endDate);
      }
    }

    const feedbacks = await Feedback.find(filter)
      .populate("studentId", "name email class")
      .populate("teacherId", "name email")
      .sort({ createdAt: -1 });

    return res.status(200).json(feedbacks);
  } catch (error) {
    console.error("Get all feedback error:", error);
    return res.status(500).json({ message: `Get feedback failed: ${error.message}` });
  }
};

// Get feedback statistics (Admin only)
export const getFeedbackStats = async (req, res) => {
  try {
    const totalFeedbacks = await Feedback.countDocuments();
    const teacherFeedbacks = await Feedback.countDocuments({ feedbackType: "teacher" });
    const facilitiesFeedbacks = await Feedback.countDocuments({ feedbackType: "facilities" });
    
    const avgRating = await Feedback.aggregate([
      {
        $group: {
          _id: null,
          avgRating: { $avg: "$rating" }
        }
      }
    ]);

    const teacherAvgRating = await Feedback.aggregate([
      {
        $match: { feedbackType: "teacher" }
      },
      {
        $group: {
          _id: null,
          avgRating: { $avg: "$rating" }
        }
      }
    ]);

    const facilitiesAvgRating = await Feedback.aggregate([
      {
        $match: { feedbackType: "facilities" }
      },
      {
        $group: {
          _id: null,
          avgRating: { $avg: "$rating" }
        }
      }
    ]);

    const ratingDistribution = await Feedback.aggregate([
      {
        $group: {
          _id: "$rating",
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    const statusCounts = await Feedback.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 }
        }
      }
    ]);

    return res.status(200).json({
      totalFeedbacks,
      teacherFeedbacks,
      facilitiesFeedbacks,
      avgRating: avgRating[0]?.avgRating || 0,
      teacherAvgRating: teacherAvgRating[0]?.avgRating || 0,
      facilitiesAvgRating: facilitiesAvgRating[0]?.avgRating || 0,
      ratingDistribution,
      statusCounts
    });
  } catch (error) {
    console.error("Get feedback stats error:", error);
    return res.status(500).json({ message: `Get feedback stats failed: ${error.message}` });
  }
};

// Update feedback status (Admin only)
export const updateFeedbackStatus = async (req, res) => {
  try {
    const { feedbackId } = req.params;
    const { status, adminResponse } = req.body;

    if (!status || !["pending", "reviewed", "resolved"].includes(status)) {
      return res.status(400).json({ message: "Valid status is required" });
    }

    const feedback = await Feedback.findByIdAndUpdate(
      feedbackId,
      { status, adminResponse: adminResponse || "" },
      { new: true }
    ).populate("studentId", "name email");

    if (!feedback) {
      return res.status(404).json({ message: "Feedback not found" });
    }

    return res.status(200).json({
      message: "Feedback status updated successfully",
      feedback
    });
  } catch (error) {
    console.error("Update feedback status error:", error);
    return res.status(500).json({ message: `Update feedback status failed: ${error.message}` });
  }
};

// Get student's own feedback
export const getMyFeedback = async (req, res) => {
  try {
    const studentId = req.userId;
    const feedbacks = await Feedback.find({ studentId })
      .populate("teacherId", "name email")
      .sort({ createdAt: -1 });

    return res.status(200).json(feedbacks);
  } catch (error) {
    console.error("Get my feedback error:", error);
    return res.status(500).json({ message: `Get my feedback failed: ${error.message}` });
  }
};

// Get teachers list for feedback (Students only)
export const getTeachersList = async (req, res) => {
  try {
    const teachers = await User.find({ role: "educator", status: "approved" })
      .select("name email")
      .sort({ name: 1 });

    return res.status(200).json(teachers);
  } catch (error) {
    console.error("Get teachers list error:", error);
    return res.status(500).json({ message: `Get teachers list failed: ${error.message}` });
  }
};

