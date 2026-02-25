import User from "../models/userModel.js";
import Course from "../models/courseModel.js";
import Assignment from "../models/assignmentModel.js";
import LiveClass from "../models/liveClassModel.js";
import Attendance from "../models/attendanceModel.js";
import Notification from "../models/notificationModel.js";
import Grade from "../models/gradeModel.js";
import Feedback from "../models/feedbackModel.js";
import Submission from "../models/submissionModel.js";
import mongoose from "mongoose";

// Get portal statistics
export const getPortalStats = async (req, res) => {
  try {
    console.log("[GetPortalStats] Fetching portal statistics for admin:", req.userId);
    
    // Check database connection
    if (mongoose.connection.readyState !== 1) {
      console.error("[GetPortalStats] Database not connected");
      return res.status(503).json({ 
        message: "Database connection unavailable",
        error: "Database not connected"
      });
    }

    // User statistics
    const totalUsers = await User.countDocuments();
    const students = await User.countDocuments({ role: "student" });
    const educators = await User.countDocuments({ role: "educator" });
    const admins = await User.countDocuments({ role: "admin" });
    const pendingUsers = await User.countDocuments({ status: "pending" });
    const approvedUsers = await User.countDocuments({ status: "approved" });
    const rejectedUsers = await User.countDocuments({ status: "rejected" });

    // Course statistics
    const totalCourses = await Course.countDocuments();
    const publishedCourses = await Course.countDocuments({ isPublished: true });
    const draftCourses = await Course.countDocuments({ isPublished: false });

    // Enrollment statistics
    const coursesWithEnrollments = await Course.find().select("enrolledStudents");
    const totalEnrollments = coursesWithEnrollments.reduce((sum, course) => {
      return sum + (course.enrolledStudents?.length || 0);
    }, 0);
    const activeEnrollments = totalEnrollments; // Can be enhanced with active status

    // Activity statistics (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentUsers = await User.countDocuments({ createdAt: { $gte: thirtyDaysAgo } });
    const recentCourses = await Course.countDocuments({ createdAt: { $gte: thirtyDaysAgo } });
    const recentEnrollments = await Course.aggregate([
      { $unwind: "$enrolledStudents" },
      { $match: { "enrolledStudents.enrolledAt": { $gte: thirtyDaysAgo } } },
      { $count: "count" }
    ]);

    // User growth (last 7 days)
    const userGrowth = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);
      
      const count = await User.countDocuments({
        createdAt: { $gte: date, $lt: nextDate }
      });
      userGrowth.push({
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        users: count
      });
    }

    // Section activity counts
    const sectionActivity = [
      { name: "Courses", value: totalCourses },
      { name: "Assignments", value: await Assignment.countDocuments() },
      { name: "Live Classes", value: await LiveClass.countDocuments() },
      { name: "Attendance", value: await Attendance.countDocuments() },
      { name: "Notifications", value: await Notification.countDocuments() },
      { name: "Grades", value: await Grade.countDocuments() },
      { name: "Feedback", value: await Feedback.countDocuments() }
    ].filter(item => item.value > 0);

    // Problem statistics
    const activeProblems = await getActiveProblemsCount();
    const criticalProblems = await getCriticalProblemsCount();

    // Activity counts
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayActivity = await getActivityCount(today);

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekActivity = await getActivityCount(weekAgo);

    const monthAgo = new Date();
    monthAgo.setDate(monthAgo.getDate() - 30);
    const monthActivity = await getActivityCount(monthAgo);

    // Database status
    const dbConnected = mongoose.connection.readyState === 1;
    const dbSize = await getDatabaseSize();
    const collections = Object.keys(mongoose.connection.collections).length;
    const totalDocuments = await getTotalDocumentsCount();

    // Server status (basic - can be enhanced)
    const uptime = process.uptime();
    const memoryUsage = process.memoryUsage();
    const memoryUsageMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);

    return res.status(200).json({
      // User stats
      totalUsers,
      students,
      educators,
      admins,
      pendingUsers,
      approvedUsers,
      rejectedUsers,
      
      // Course stats
      totalCourses,
      publishedCourses,
      draftCourses,
      
      // Enrollment stats
      totalEnrollments,
      activeEnrollments,
      
      // Activity stats
      userGrowth,
      sectionActivity,
      todayActivity,
      weekActivity,
      monthActivity,
      
      // Problem stats
      activeProblems,
      criticalProblems,
      
      // Database stats
      dbConnected,
      dbSize,
      collections,
      totalDocuments,
      
      // Server stats
      uptime: formatUptime(uptime),
      memoryUsage: `${memoryUsageMB} MB`,
      cpuUsage: "N/A" // Can be enhanced with system stats
    });
  } catch (error) {
    console.error("[GetPortalStats] Error:", error);
    console.error("[GetPortalStats] Error stack:", error.stack);
    return res.status(500).json({ 
      message: "Failed to fetch portal statistics", 
      error: process.env.NODE_ENV === 'development' ? error.message : "Internal server error",
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// Get activities by section
export const getActivities = async (req, res) => {
  try {
    console.log("[GetActivities] Fetching activities for admin:", req.userId);
    
    const { section, days } = req.query;
    const activities = [];

    // Date filter
    let dateFilter = {};
    if (days) {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - parseInt(days));
      dateFilter = { createdAt: { $gte: daysAgo } };
    }

    // Authentication activities
    if (!section || section === "all" || section === "authentication") {
      const recentUsers = await User.find(dateFilter)
        .select("name email role status createdAt")
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();
      
      recentUsers.forEach(user => {
        activities.push({
          section: "authentication",
          action: user.status === "pending" ? "User Signup" : "User Created",
          description: `${user.role} ${user.name} (${user.email})`,
          type: user.status === "pending" ? "info" : "success",
          timestamp: user.createdAt,
          user: user.name
        });
      });
    }

    // Course activities
    if (!section || section === "all" || section === "courses") {
      const recentCourses = await Course.find(dateFilter)
        .populate("creator", "name email")
        .select("title isPublished createdAt creator")
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();
      
      recentCourses.forEach(course => {
        activities.push({
          section: "courses",
          action: course.isPublished ? "Course Published" : "Course Created",
          description: `Course: ${course.title}`,
          type: course.isPublished ? "success" : "info",
          timestamp: course.createdAt,
          user: course.creator?.name || "Unknown"
        });
      });
    }

    // Assignment activities
    if (!section || section === "all" || section === "assignments") {
      const recentAssignments = await Assignment.find(dateFilter)
        .populate("courseId", "title")
        .select("title courseId createdAt")
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();
      
      recentAssignments.forEach(assignment => {
        activities.push({
          section: "assignments",
          action: "Assignment Created",
          description: `Assignment: ${assignment.title} in ${assignment.courseId?.title || "Unknown Course"}`,
          type: "info",
          timestamp: assignment.createdAt,
          user: "System"
        });
      });
    }

    // Live class activities
    if (!section || section === "all" || section === "live-classes") {
      const recentLiveClasses = await LiveClass.find(dateFilter)
        .populate("educatorId", "name email")
        .select("title status scheduledDate educatorId createdAt")
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();
      
      recentLiveClasses.forEach(liveClass => {
        activities.push({
          section: "live-classes",
          action: `Live Class ${liveClass.status}`,
          description: `Live Class: ${liveClass.title}`,
          type: liveClass.status === "live" ? "success" : "info",
          timestamp: liveClass.createdAt,
          user: liveClass.educatorId?.name || "Unknown"
        });
      });
    }

    // Attendance activities
    if (!section || section === "all" || section === "attendance") {
      const recentAttendance = await Attendance.find(dateFilter)
        .populate("courseId", "title")
        .select("date courseId records createdAt")
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();
      
      recentAttendance.forEach(attendance => {
        const presentCount = attendance.records?.filter(r => r.status === "present").length || 0;
        activities.push({
          section: "attendance",
          action: "Attendance Marked",
          description: `Attendance for ${attendance.courseId?.title || "Unknown Course"}: ${presentCount} present`,
          type: "info",
          timestamp: attendance.createdAt,
          user: "System"
        });
      });
    }

    // Notification activities
    if (!section || section === "all" || section === "notifications") {
      const recentNotifications = await Notification.find(dateFilter)
        .populate("createdBy", "name email")
        .select("title createdAt createdBy")
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();
      
      recentNotifications.forEach(notification => {
        activities.push({
          section: "notifications",
          action: "Notification Sent",
          description: `Notification: ${notification.title}`,
          type: "info",
          timestamp: notification.createdAt,
          user: notification.createdBy?.name || "System"
        });
      });
    }

    // Sort by timestamp (newest first)
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Limit to 100 most recent
    return res.status(200).json(activities.slice(0, 100));
  } catch (error) {
    console.error("[GetActivities] Error:", error);
    console.error("[GetActivities] Error stack:", error.stack);
    return res.status(500).json({ 
      message: "Failed to fetch activities", 
      error: process.env.NODE_ENV === 'development' ? error.message : "Internal server error",
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// Get portal problems/issues
export const getProblems = async (req, res) => {
  try {
    console.log("[GetProblems] Fetching problems for admin:", req.userId);
    
    const problems = [];

    // Check for pending user approvals
    const pendingUsersCount = await User.countDocuments({ status: "pending" });
    if (pendingUsersCount > 0) {
      problems.push({
        title: "Pending User Approvals",
        description: `${pendingUsersCount} users are waiting for approval`,
        section: "authentication",
        severity: pendingUsersCount > 10 ? "high" : "medium",
        status: "active",
        detectedAt: new Date(),
        affectedUsers: pendingUsersCount,
        solution: "Review and approve/reject pending user accounts in the User Management section"
      });
    }

    // Check for database connection
    const dbConnected = mongoose.connection.readyState === 1;
    if (!dbConnected) {
      problems.push({
        title: "Database Connection Issue",
        description: "Database is not connected. Portal functionality may be limited.",
        section: "database",
        severity: "critical",
        status: "active",
        detectedAt: new Date(),
        solution: "Check database connection string and MongoDB server status"
      });
    }

    // Check for courses without enrollments
    const coursesWithoutEnrollments = await Course.find({
      $or: [
        { enrolledStudents: { $exists: false } },
        { enrolledStudents: { $size: 0 } }
      ],
      isPublished: true
    }).countDocuments();
    
    if (coursesWithoutEnrollments > 5) {
      problems.push({
        title: "Courses Without Enrollments",
        description: `${coursesWithoutEnrollments} published courses have no enrollments`,
        section: "courses",
        severity: "low",
        status: "active",
        detectedAt: new Date(),
        solution: "Review course content and marketing to increase enrollments"
      });
    }

    // Check for assignments without submissions
    try {
      const assignmentsWithoutSubmissions = await Assignment.aggregate([
        {
          $lookup: {
            from: "submissions",
            localField: "_id",
            foreignField: "assignmentId",
            as: "submissions"
          }
        },
        {
          $match: {
            submissions: { $size: 0 }
          }
        },
        {
          $count: "count"
        }
      ]);

      if (assignmentsWithoutSubmissions.length > 0 && assignmentsWithoutSubmissions[0].count > 10) {
        problems.push({
          title: "Assignments Without Submissions",
          description: `${assignmentsWithoutSubmissions[0].count} assignments have no submissions`,
          section: "assignments",
          severity: "low",
          status: "active",
          detectedAt: new Date(),
          solution: "Remind students about pending assignments or review assignment deadlines"
        });
      }
    } catch (error) {
      console.log("[GetProblems] Assignment submission check skipped:", error.message);
    }

    // Check for live classes that are stuck in "live" status
    const stuckLiveClasses = await LiveClass.find({
      status: "live",
      scheduledDate: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } // More than 24 hours ago
    }).countDocuments();

    if (stuckLiveClasses > 0) {
      problems.push({
        title: "Stuck Live Classes",
        description: `${stuckLiveClasses} live classes are stuck in "live" status for more than 24 hours`,
        section: "live-classes",
        severity: "medium",
        status: "active",
        detectedAt: new Date(),
        solution: "Review and manually end live classes that should have been completed"
      });
    }

    // Check for low attendance rates
    const recentAttendance = await Attendance.find({
      date: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    }).limit(10).lean();

    if (recentAttendance.length > 0) {
      let lowAttendanceCount = 0;
      recentAttendance.forEach(attendance => {
        const total = attendance.records?.length || 0;
        const present = attendance.records?.filter(r => r.status === "present").length || 0;
        const attendanceRate = total > 0 ? (present / total) * 100 : 0;
        if (attendanceRate < 50 && total > 5) {
          lowAttendanceCount++;
        }
      });

      if (lowAttendanceCount > 3) {
        problems.push({
          title: "Low Attendance Rates",
          description: `${lowAttendanceCount} recent attendance records show attendance below 50%`,
          section: "attendance",
          severity: "medium",
          status: "active",
          detectedAt: new Date(),
          solution: "Investigate reasons for low attendance and engage with students"
        });
      }
    }

    // Check for negative feedback
    const negativeFeedback = await Feedback.find({
      rating: { $lte: 2 },
      status: "active"
    }).countDocuments();

    if (negativeFeedback > 5) {
      problems.push({
        title: "Negative Feedback Received",
        description: `${negativeFeedback} feedback entries have ratings of 2 or below`,
        section: "feedback",
        severity: "high",
        status: "active",
        detectedAt: new Date(),
        solution: "Review feedback and address concerns to improve user satisfaction"
      });
    }

    return res.status(200).json(problems);
  } catch (error) {
    console.error("[GetProblems] Error:", error);
    console.error("[GetProblems] Error stack:", error.stack);
    return res.status(500).json({ 
      message: "Failed to fetch problems", 
      error: process.env.NODE_ENV === 'development' ? error.message : "Internal server error",
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// Helper functions
async function getActiveProblemsCount() {
  // This would check for active problems
  // For now, return a simple count
  return 0;
}

async function getCriticalProblemsCount() {
  // This would check for critical problems
  return 0;
}

async function getActivityCount(sinceDate) {
  // Count activities since date
  const userCount = await User.countDocuments({ createdAt: { $gte: sinceDate } });
  const courseCount = await Course.countDocuments({ createdAt: { $gte: sinceDate } });
  const assignmentCount = await Assignment.countDocuments({ createdAt: { $gte: sinceDate } });
  const liveClassCount = await LiveClass.countDocuments({ createdAt: { $gte: sinceDate } });
  const attendanceCount = await Attendance.countDocuments({ createdAt: { $gte: sinceDate } });
  const notificationCount = await Notification.countDocuments({ createdAt: { $gte: sinceDate } });
  
  return userCount + courseCount + assignmentCount + liveClassCount + attendanceCount + notificationCount;
}

async function getDatabaseSize() {
  try {
    const stats = await mongoose.connection.db.stats();
    const sizeInMB = (stats.dataSize / 1024 / 1024).toFixed(2);
    return `${sizeInMB} MB`;
  } catch (error) {
    return "N/A";
  }
}

async function getTotalDocumentsCount() {
  try {
    const collections = mongoose.connection.collections;
    let total = 0;
    for (const collectionName in collections) {
      const count = await collections[collectionName].countDocuments();
      total += count;
    }
    return total;
  } catch (error) {
    return 0;
  }
}

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
}

