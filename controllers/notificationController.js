import Notification from "../models/notificationModel.js";
import User from "../models/userModel.js";
import Course from "../models/courseModel.js";

// Create notification (educator/admin only)
export const createNotification = async (req, res) => {
  try {
    const { title, message, type, courseId, targetAudience, eventDate } = req.body;
    if (!title || !message) {
      return res.status(400).json({ message: "Title and message are required" });
    }

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Only educators and admins can create notifications
    if (user.role !== "educator" && user.role !== "admin") {
      return res.status(403).json({ message: "Only educators and admins can create notifications" });
    }

    // If courseId provided, verify educator owns it (unless admin)
    if (courseId && user.role === "educator") {
      const course = await Course.findById(courseId);
      if (!course) return res.status(404).json({ message: "Course not found" });
      if (course.creator.toString() !== req.userId.toString()) {
        return res.status(403).json({ message: "You can only create notifications for your own courses" });
      }
    }

    const notification = await Notification.create({
      title,
      message,
      type: type || "announcement",
      courseId: courseId || undefined,
      createdBy: req.userId,
      targetAudience: targetAudience || "all",
      eventDate: eventDate || undefined,
    });

    return res.status(201).json(notification);
  } catch (error) {
    return res.status(500).json({ message: `Create notification failed: ${error}` });
  }
};

// Get notifications for current user
export const getMyNotifications = async (req, res) => {
  try {
    console.log(`[GetMyNotifications] Fetching notifications for user: ${req.userId}`);
    const user = await User.findById(req.userId);
    if (!user) {
      console.log(`[GetMyNotifications] User not found: ${req.userId}`);
      return res.status(404).json({ message: "User not found" });
    }

    console.log(`[GetMyNotifications] User role: ${user.role}`);
    let filter = { isActive: true };

    // Filter by target audience
    if (user.role === "student") {
      const enrolledCourses = user.enrolledCourses || [];
      console.log(`[GetMyNotifications] Student enrolled in ${enrolledCourses.length} courses`);
      filter.$or = [
        { targetAudience: "all" },
        { targetAudience: "students" },
        { targetAudience: "course", courseId: { $in: enrolledCourses } },
      ];
    } else if (user.role === "educator") {
      const myCourses = await Course.find({ creator: req.userId }).select("_id");
      const courseIds = myCourses.map(c => c._id);
      console.log(`[GetMyNotifications] Educator created ${courseIds.length} courses`);
      filter.$or = [
        { targetAudience: "all" },
        { targetAudience: "educators" },
        { targetAudience: "course", courseId: { $in: courseIds } },
      ];
    } else if (user.role === "admin") {
      // Admin sees all active notifications
      console.log(`[GetMyNotifications] Admin - fetching all notifications`);
    }

    const notifications = await Notification.find(filter)
      .populate("createdBy", "name email role")
      .populate("courseId", "title")
      .sort({ createdAt: -1 });

    console.log(`[GetMyNotifications] Found ${notifications.length} notifications`);

    // Mark read status
    const notificationsWithReadStatus = notifications.map((notif) => {
      const isRead = notif.isRead.some((r) => r.userId.toString() === req.userId.toString());
      return { ...notif.toObject(), isRead };
    });

    return res.status(200).json(notificationsWithReadStatus || []);
  } catch (error) {
    console.error("[GetMyNotifications] Error:", error);
    return res.status(500).json({ 
      message: `Fetch notifications failed: ${error.message || error}` 
    });
  }
};

// Mark notification as read
export const markAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const notification = await Notification.findById(notificationId);
    if (!notification) return res.status(404).json({ message: "Notification not found" });

    // Check if already read
    const alreadyRead = notification.isRead.some((r) => r.userId.toString() === req.userId.toString());
    if (!alreadyRead) {
      notification.isRead.push({ userId: req.userId });
      await notification.save();
    }

    return res.status(200).json({ message: "Marked as read" });
  } catch (error) {
    return res.status(500).json({ message: `Mark as read failed: ${error}` });
  }
};

// Get all notifications (admin/educator - for management)
export const getAllNotifications = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    let filter = {};

    // Educators see their own notifications
    if (user.role === "educator") {
      const myCourses = await Course.find({ creator: req.userId }).select("_id");
      const courseIds = myCourses.map((c) => c._id);
      filter = {
        $or: [{ createdBy: req.userId }, { courseId: { $in: courseIds } }],
      };
    }
    // Admins see all

    const notifications = await Notification.find(filter)
      .populate("createdBy", "name email role")
      .populate("courseId", "title")
      .sort({ createdAt: -1 });

    return res.status(200).json(notifications);
  } catch (error) {
    return res.status(500).json({ message: `Fetch all notifications failed: ${error}` });
  }
};

// Delete notification (creator/admin only)
export const deleteNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const notification = await Notification.findById(notificationId);
    if (!notification) return res.status(404).json({ message: "Notification not found" });

    const user = await User.findById(req.userId);
    if (user.role !== "admin" && notification.createdBy.toString() !== req.userId.toString()) {
      return res.status(403).json({ message: "Not allowed" });
    }

    notification.isActive = false;
    await notification.save();

    return res.status(200).json({ message: "Notification deleted" });
  } catch (error) {
    return res.status(500).json({ message: `Delete notification failed: ${error}` });
  }
};

