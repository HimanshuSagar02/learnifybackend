import Doubt from "../models/doubtModel.js";
import User from "../models/userModel.js";
import Course from "../models/courseModel.js";

// Create doubt (student)
export const createDoubt = async (req, res) => {
  try {
    const { courseId, subject, title, description, category, priority } = req.body;

    if (!title || !description) {
      return res.status(400).json({ message: "Title and description are required" });
    }

    const user = await User.findById(req.userId);
    if (!user || user.role !== "student") {
      return res.status(403).json({ message: "Only students can create doubts" });
    }

    // Auto-assign to course educator if courseId provided
    let assignedTo = null;
    let assignedToRole = "admin"; // Default to admin

    if (courseId) {
      const course = await Course.findById(courseId).populate("creator");
      if (course && course.creator) {
        assignedTo = course.creator._id || course.creator;
        assignedToRole = "educator";
      }
    }

    const doubt = await Doubt.create({
      studentId: req.userId,
      courseId: courseId || null,
      subject: subject || null,
      title,
      description,
      category: category || "general",
      priority: priority || "medium",
      assignedTo,
      assignedToRole,
      status: "pending",
    });

    const populatedDoubt = await Doubt.findById(doubt._id)
      .populate("studentId", "name email photoUrl")
      .populate("courseId", "title")
      .populate("assignedTo", "name email photoUrl");

    return res.status(201).json({
      message: "Doubt created successfully",
      doubt: populatedDoubt,
    });
  } catch (error) {
    return res.status(500).json({ message: `Create doubt failed: ${error.message}` });
  }
};

// Get my doubts (student)
export const getMyDoubts = async (req, res) => {
  try {
    const { status, category } = req.query;
    const filter = { studentId: req.userId };

    if (status) filter.status = status;
    if (category) filter.category = category;

    const doubts = await Doubt.find(filter)
      .populate("courseId", "title thumbnail")
      .populate("assignedTo", "name email photoUrl")
      .sort({ createdAt: -1 });

    return res.status(200).json(doubts);
  } catch (error) {
    return res.status(500).json({ message: `Get doubts failed: ${error.message}` });
  }
};

// Get doubts assigned to me (educator/admin)
export const getAssignedDoubts = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const { status, priority } = req.query;
    const filter = {};

    if (user.role === "admin") {
      // Admin can see all doubts or doubts assigned to admin
      filter.$or = [
        { assignedToRole: "admin" },
        { assignedTo: null }, // Unassigned doubts
      ];
    } else if (user.role === "educator") {
      // Educator sees doubts assigned to them or from their courses
      const myCourses = await Course.find({ creator: req.userId });
      const courseIds = myCourses.map((c) => c._id);

      filter.$or = [
        { assignedTo: req.userId },
        { courseId: { $in: courseIds } },
      ];
    } else {
      return res.status(403).json({ message: "Access denied" });
    }

    if (status) filter.status = status;
    if (priority) filter.priority = priority;

    const doubts = await Doubt.find(filter)
      .populate("studentId", "name email photoUrl")
      .populate("courseId", "title thumbnail")
      .populate("assignedTo", "name email photoUrl")
      .sort({ createdAt: -1 });

    return res.status(200).json(doubts);
  } catch (error) {
    return res.status(500).json({ message: `Get assigned doubts failed: ${error.message}` });
  }
};

// Get all doubts (admin only)
export const getAllDoubts = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    const { status, priority, category } = req.query;
    const filter = {};

    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (category) filter.category = category;

    const doubts = await Doubt.find(filter)
      .populate("studentId", "name email photoUrl")
      .populate("courseId", "title thumbnail")
      .populate("assignedTo", "name email photoUrl")
      .sort({ createdAt: -1 });

    return res.status(200).json(doubts);
  } catch (error) {
    return res.status(500).json({ message: `Get all doubts failed: ${error.message}` });
  }
};

// Get single doubt
export const getDoubtById = async (req, res) => {
  try {
    const { doubtId } = req.params;

    const doubt = await Doubt.findById(doubtId)
      .populate("studentId", "name email photoUrl")
      .populate("courseId", "title thumbnail")
      .populate("assignedTo", "name email photoUrl")
      .populate("responses.respondedBy", "name email photoUrl role")
      .populate("resolvedBy", "name email photoUrl");

    if (!doubt) {
      return res.status(404).json({ message: "Doubt not found" });
    }

    // Check access
    const user = await User.findById(req.userId);
    const hasAccess =
      doubt.studentId._id.toString() === req.userId.toString() ||
      doubt.assignedTo?._id?.toString() === req.userId.toString() ||
      user.role === "admin";

    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    return res.status(200).json(doubt);
  } catch (error) {
    return res.status(500).json({ message: `Get doubt failed: ${error.message}` });
  }
};

// Add response to doubt
export const addResponse = async (req, res) => {
  try {
    const { doubtId } = req.params;
    const { response } = req.body;

    if (!response || !response.trim()) {
      return res.status(400).json({ message: "Response is required" });
    }

    const doubt = await Doubt.findById(doubtId);
    if (!doubt) {
      return res.status(404).json({ message: "Doubt not found" });
    }

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Check access
    const hasAccess =
      doubt.studentId.toString() === req.userId.toString() ||
      doubt.assignedTo?.toString() === req.userId.toString() ||
      user.role === "admin";

    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Add response
    doubt.responses.push({
      respondedBy: req.userId,
      response: response.trim(),
      role: user.role,
    });

    // Update status if educator/admin responds
    if ((user.role === "educator" || user.role === "admin") && doubt.status === "pending") {
      doubt.status = "in-progress";
    }

    await doubt.save();

    const populatedDoubt = await Doubt.findById(doubt._id)
      .populate("studentId", "name email photoUrl")
      .populate("courseId", "title thumbnail")
      .populate("assignedTo", "name email photoUrl")
      .populate("responses.respondedBy", "name email photoUrl role")
      .populate("resolvedBy", "name email photoUrl");

    return res.status(200).json({
      message: "Response added successfully",
      doubt: populatedDoubt,
    });
  } catch (error) {
    return res.status(500).json({ message: `Add response failed: ${error.message}` });
  }
};

// Update doubt status
export const updateDoubtStatus = async (req, res) => {
  try {
    const { doubtId } = req.params;
    const { status } = req.body;

    if (!["pending", "in-progress", "resolved", "closed"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const doubt = await Doubt.findById(doubtId);
    if (!doubt) {
      return res.status(404).json({ message: "Doubt not found" });
    }

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Check access (only assigned educator/admin or admin can update)
    const hasAccess =
      doubt.assignedTo?.toString() === req.userId.toString() ||
      user.role === "admin" ||
      (user.role === "educator" && doubt.assignedToRole === "educator");

    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    doubt.status = status;

    if (status === "resolved" || status === "closed") {
      doubt.resolvedAt = new Date();
      doubt.resolvedBy = req.userId;
    }

    await doubt.save();

    const populatedDoubt = await Doubt.findById(doubt._id)
      .populate("studentId", "name email photoUrl")
      .populate("courseId", "title thumbnail")
      .populate("assignedTo", "name email photoUrl")
      .populate("responses.respondedBy", "name email photoUrl role")
      .populate("resolvedBy", "name email photoUrl");

    return res.status(200).json({
      message: "Doubt status updated successfully",
      doubt: populatedDoubt,
    });
  } catch (error) {
    return res.status(500).json({ message: `Update doubt status failed: ${error.message}` });
  }
};

// Assign doubt to educator/admin
export const assignDoubt = async (req, res) => {
  try {
    const { doubtId } = req.params;
    const { assignedTo, assignedToRole } = req.body;

    const user = await User.findById(req.userId);
    if (user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    const doubt = await Doubt.findById(doubtId);
    if (!doubt) {
      return res.status(404).json({ message: "Doubt not found" });
    }

    if (assignedTo) {
      const assignee = await User.findById(assignedTo);
      if (!assignee) {
        return res.status(404).json({ message: "Assignee not found" });
      }

      if (assignedToRole && !["educator", "admin"].includes(assignedToRole)) {
        return res.status(400).json({ message: "Invalid assignedToRole" });
      }

      doubt.assignedTo = assignedTo;
      doubt.assignedToRole = assignedToRole || assignee.role;
    } else {
      doubt.assignedTo = null;
      doubt.assignedToRole = "admin";
    }

    await doubt.save();

    const populatedDoubt = await Doubt.findById(doubt._id)
      .populate("studentId", "name email photoUrl")
      .populate("courseId", "title thumbnail")
      .populate("assignedTo", "name email photoUrl");

    return res.status(200).json({
      message: "Doubt assigned successfully",
      doubt: populatedDoubt,
    });
  } catch (error) {
    return res.status(500).json({ message: `Assign doubt failed: ${error.message}` });
  }
};

// Delete doubt (student can delete their own, admin can delete any)
export const deleteDoubt = async (req, res) => {
  try {
    const { doubtId } = req.params;

    const doubt = await Doubt.findById(doubtId);
    if (!doubt) {
      return res.status(404).json({ message: "Doubt not found" });
    }

    const user = await User.findById(req.userId);
    const hasAccess =
      doubt.studentId.toString() === req.userId.toString() || user.role === "admin";

    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    await Doubt.findByIdAndDelete(doubtId);

    return res.status(200).json({ message: "Doubt deleted successfully" });
  } catch (error) {
    return res.status(500).json({ message: `Delete doubt failed: ${error.message}` });
  }
};

