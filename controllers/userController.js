import uploadOnCloudinary from "../configs/cloudinary.js";
import User from "../models/userModel.js";
import Course from "../models/courseModel.js";
import Grade from "../models/gradeModel.js";
import Attendance from "../models/attendanceModel.js";

/* ========================= Get Current User ========================= */
export const getCurrentUser = async (req, res) => {
  try {
    console.log(`[GetCurrentUser] Fetching user: ${req.userId}`);
    const user = await User.findById(req.userId)
      .select("-password");

    if (!user) {
      console.log(`[GetCurrentUser] User not found: ${req.userId}`);
      return res.status(404).json({ message: "User not found" });
    }

    console.log(`[GetCurrentUser] User found: ${user.email}, Role: ${user.role}`);

    // For students, populate enrolled courses
    // For educators/admins, don't populate enrolled courses (they don't enroll)
    if (user.role === "student") {
      await user.populate("enrolledCourses");
      console.log(`[GetCurrentUser] Populated ${user.enrolledCourses?.length || 0} enrolled courses`);
    }

    return res.status(200).json(user);
  } catch (error) {
    console.error("[GetCurrentUser] Error:", error);
    return res.status(500).json({ 
      message: "Get current user error", 
      error: error.message || error 
    });
  }
};


/* ========================= Update Profile ========================= */
export const UpdateProfile = async (req, res) => {
  try {
    const { name, description } = req.body;
    let photoUrl;

    if (req.file) {
      photoUrl = await uploadOnCloudinary(req.file.path);
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.userId,
      { name, description, ...(photoUrl && { photoUrl }) },
      { new: true }
    );

    if (!updatedUser) return res.status(404).json({ message: "User not found" });

    return res.status(200).json(updatedUser);

  } catch (error) {
    return res.status(500).json({ message: `Update profile error ${error}` });
  }
};


/* ========================= Get Enrolled Courses ========================= */
export const getEnrolledCourses = async (req, res) => {
  try {
    console.log(`[GetEnrolledCourses] Fetching for user: ${req.userId}`);
    const user = await User.findById(req.userId);

    if (!user) {
      console.log(`[GetEnrolledCourses] User not found: ${req.userId}`);
      return res.status(404).json({ message: "User not found" });
    }

    // For educators and admins, return courses they created (not enrolled)
    if (user.role === "educator" || user.role === "admin") {
      console.log(`[GetEnrolledCourses] Fetching created courses for ${user.role}`);
      const createdCourses = await Course.find({ creator: req.userId })
        .populate("creator", "name email")
        .populate("enrolledStudents", "name email");
      console.log(`[GetEnrolledCourses] Found ${createdCourses.length} created courses`);
      return res.status(200).json(createdCourses || []);
    }

    // For students, return enrolled courses
    console.log(`[GetEnrolledCourses] Fetching enrolled courses for student`);
    const populatedUser = await User.findById(req.userId)
      .populate("enrolledCourses");
    
    console.log(`[GetEnrolledCourses] Found ${populatedUser.enrolledCourses?.length || 0} enrolled courses`);
    return res.status(200).json(populatedUser.enrolledCourses || []);

  } catch (err) {
    console.error("[GetEnrolledCourses] Error:", err);
    return res.status(500).json({ 
      message: "Error fetching enrolled courses", 
      error: err.message || err 
    });
  }
};

/* ========================= Educator: My Students ========================= */
export const getMyStudents = async (req, res) => {
  try {
    console.log(`[GetMyStudents] Fetching students for user: ${req.userId}`);
    const me = await User.findById(req.userId);
    if (!me) {
      console.log(`[GetMyStudents] User not found: ${req.userId}`);
      return res.status(404).json({ message: "User not found" });
    }
    
    if (me.role !== "educator" && me.role !== "admin") {
      console.log(`[GetMyStudents] Access denied for role: ${me.role}`);
      return res.status(403).json({ message: "Educator or admin access required" });
    }
    
    // Import Order model
    const Order = (await import("../models/orderModel.js")).default;
    
    // For admins, get all students. For educators, get only their students
    let courses;
    if (me.role === "admin") {
      console.log(`[GetMyStudents] Admin - fetching all courses`);
      courses = await Course.find().populate("enrolledStudents", "name email photoUrl class subject totalActiveMinutes lastActiveAt status");
    } else {
      console.log(`[GetMyStudents] Educator - fetching courses created by: ${req.userId}`);
      courses = await Course.find({ creator: req.userId }).populate("enrolledStudents", "name email photoUrl class subject totalActiveMinutes lastActiveAt status");
    }
    
    console.log(`[GetMyStudents] Found ${courses.length} courses`);
    
    const studentsMap = new Map();
    courses.forEach((course) => {
      if (course && course.enrolledStudents && Array.isArray(course.enrolledStudents)) {
        course.enrolledStudents.forEach((s) => {
          if (s && s._id) {
            studentsMap.set(s._id.toString(), {
              ...s.toObject ? s.toObject() : s,
              courseId: course._id,
              courseTitle: course.title
            });
          }
        });
      }
    });
    
    // Get enrollment status from orders for each student
    const students = Array.from(studentsMap.values());
    const studentsWithStatus = await Promise.all(
      students.map(async (student) => {
        // Find orders for this student in courses created by this educator/admin
        const courseIds = me.role === "admin" 
          ? courses.map(c => c._id)
          : courses.filter(c => c.creator.toString() === req.userId.toString()).map(c => c._id);
        
        const orders = await Order.find({
          student: student._id,
          course: { $in: courseIds }
        }).sort({ createdAt: -1 }).lean();
        
        // Determine overall status
        let enrollmentStatus = "pending";
        let lastOrder = null;
        
        if (orders.length > 0) {
          lastOrder = orders[0];
          enrollmentStatus = lastOrder.status || (lastOrder.isPaid ? "success" : "pending");
        } else {
          // Check if student is enrolled (has enrollment but no order record)
          const isEnrolled = courses.some(c => 
            c.enrolledStudents?.some(s => s._id.toString() === student._id.toString())
          );
          enrollmentStatus = isEnrolled ? "success" : "pending";
        }
        
        return {
          ...student,
          enrollmentStatus,
          lastOrder: lastOrder ? {
            orderId: lastOrder._id,
            receiptId: lastOrder.receiptId,
            amount: lastOrder.amount,
            paidAt: lastOrder.paidAt,
            status: lastOrder.status
          } : null,
          totalOrders: orders.length,
          successfulOrders: orders.filter(o => o.status === "success" || o.isPaid).length,
          failedOrders: orders.filter(o => o.status === "failed").length,
          pendingOrders: orders.filter(o => o.status === "pending" && !o.isPaid).length
        };
      })
    );
    
    console.log(`[GetMyStudents] Returning ${studentsWithStatus.length} unique students with status`);
    return res.status(200).json(studentsWithStatus || []);
  } catch (error) {
    console.error("[GetMyStudents] Error:", error);
    return res.status(500).json({ 
      message: "Error fetching students", 
      error: error.message || error 
    });
  }
};

/* ========================= Get All Students in App ========================= */
export const getAllStudents = async (req, res) => {
  try {
    console.log(`[GetAllStudents] Fetching all students for user: ${req.userId}`);
    const me = await User.findById(req.userId);
    if (!me) {
      console.log(`[GetAllStudents] User not found: ${req.userId}`);
      return res.status(404).json({ message: "User not found" });
    }
    
    if (me.role !== "educator" && me.role !== "admin") {
      console.log(`[GetAllStudents] Access denied for role: ${me.role}`);
      return res.status(403).json({ message: "Educator or admin access required" });
    }
    
    // Get all users with role "student"
    const allStudents = await User.find({ role: "student" })
      .select("name email photoUrl class subject totalActiveMinutes lastActiveAt")
      .sort({ name: 1 });
    
    console.log(`[GetAllStudents] Found ${allStudents.length} students in app`);
    return res.status(200).json(allStudents || []);
  } catch (error) {
    console.error("[GetAllStudents] Error:", error);
    return res.status(500).json({ 
      message: "Error fetching all students", 
      error: error.message || error 
    });
  }
};

/* ========================= Get Participant Details by Identity ========================= */
export const getParticipantDetails = async (req, res) => {
  try {
    const { identity } = req.params;
    
    if (!identity) {
      return res.status(400).json({ message: "Identity is required" });
    }
    
    // Try to find user by email or ID
    let user = await User.findOne({ 
      $or: [
        { email: identity },
        { _id: identity }
      ]
    }).select("name email photoUrl role class subject");
    
    if (!user) {
      // If not found, return basic info from identity
      return res.status(200).json({
        name: identity.split('@')[0] || identity,
        email: identity.includes('@') ? identity : "",
        role: "student",
        photoUrl: ""
      });
    }
    
    return res.status(200).json(user);
  } catch (error) {
    console.error("[GetParticipantDetails] Error:", error);
    return res.status(500).json({ 
      message: "Error fetching participant details", 
      error: error.message || error 
    });
  }
};

/* ========================= Get Student Performance ========================= */
export const getStudentPerformance = async (req, res) => {
  try {
    const { studentId } = req.params;
    console.log(`[GetStudentPerformance] Fetching performance for student: ${studentId}, by educator: ${req.userId}`);
    
    const educator = await User.findById(req.userId);
    if (!educator) {
      console.log(`[GetStudentPerformance] Educator not found: ${req.userId}`);
      return res.status(404).json({ message: "Educator not found" });
    }
    
    if (educator.role !== "educator" && educator.role !== "admin") {
      console.log(`[GetStudentPerformance] Access denied for role: ${educator.role}`);
      return res.status(403).json({ message: "Educator access required" });
    }

    const student = await User.findById(studentId).select("-password");
    if (!student) {
      console.log(`[GetStudentPerformance] Student not found: ${studentId}`);
      return res.status(404).json({ message: "Student not found" });
    }
    
    console.log(`[GetStudentPerformance] Student found: ${student.name}, Role: ${student.role}`);

    // Get all courses where educator is creator and student is enrolled
    const educatorCourses = await Course.find({ creator: req.userId });
    console.log(`[GetStudentPerformance] Found ${educatorCourses.length} courses created by educator`);
    
    const courseIds = educatorCourses.map(c => c._id);
    const enrolledCourseIds = educatorCourses
      .filter(c => {
        if (!c.enrolledStudents || !Array.isArray(c.enrolledStudents)) return false;
        return c.enrolledStudents.some(id => {
          const idStr = id.toString ? id.toString() : String(id);
          const studentIdStr = studentId.toString ? studentId.toString() : String(studentId);
          return idStr === studentIdStr;
        });
      })
      .map(c => c._id);
    
    console.log(`[GetStudentPerformance] Student enrolled in ${enrolledCourseIds.length} of educator's courses`);

    // Get all grades for this student in educator's courses
    const grades = await Grade.find({
      studentId,
      courseId: { $in: enrolledCourseIds }
    })
      .populate("courseId", "title")
      .sort({ date: -1 });

    // Calculate grade statistics
    const gradeStats = {
      totalGrades: grades.length,
      averagePercentage: 0,
      gradeDistribution: {
        "A+": 0, "A": 0, "B+": 0, "B": 0, "C+": 0, "C": 0, "D": 0, "F": 0
      },
      byCourse: {}
    };

    if (grades.length > 0) {
      const totalPercentage = grades.reduce((sum, g) => sum + g.percentage, 0);
      gradeStats.averagePercentage = Math.round(totalPercentage / grades.length);

      grades.forEach(grade => {
        gradeStats.gradeDistribution[grade.grade] = (gradeStats.gradeDistribution[grade.grade] || 0) + 1;
        
        const courseId = grade.courseId._id.toString();
        if (!gradeStats.byCourse[courseId]) {
          gradeStats.byCourse[courseId] = {
            courseTitle: grade.courseId.title,
            grades: [],
            averagePercentage: 0
          };
        }
        gradeStats.byCourse[courseId].grades.push(grade);
      });

      // Calculate average for each course
      Object.keys(gradeStats.byCourse).forEach(courseId => {
        const courseGrades = gradeStats.byCourse[courseId].grades;
        const avg = courseGrades.reduce((sum, g) => sum + g.percentage, 0) / courseGrades.length;
        gradeStats.byCourse[courseId].averagePercentage = Math.round(avg);
      });
    }

    // Get attendance records
    const attendanceRecords = await Attendance.find({
      courseId: { $in: enrolledCourseIds },
      "records.studentId": studentId
    })
      .populate("courseId", "title")
      .sort({ date: -1 });

    // Calculate attendance statistics
    const attendanceStats = {
      totalRecords: attendanceRecords.length,
      present: 0,
      absent: 0,
      late: 0,
      attendancePercentage: 0,
      byCourse: {}
    };

    attendanceRecords.forEach(record => {
      const studentRecord = record.records.find(r => r.studentId.toString() === studentId);
      if (studentRecord) {
        if (studentRecord.status === "present") attendanceStats.present++;
        else if (studentRecord.status === "absent") attendanceStats.absent++;
        else if (studentRecord.status === "late") attendanceStats.late++;

        const courseId = record.courseId._id.toString();
        if (!attendanceStats.byCourse[courseId]) {
          attendanceStats.byCourse[courseId] = {
            courseTitle: record.courseId.title,
            present: 0,
            absent: 0,
            late: 0,
            total: 0
          };
        }
        attendanceStats.byCourse[courseId].total++;
        if (studentRecord.status === "present") attendanceStats.byCourse[courseId].present++;
        else if (studentRecord.status === "absent") attendanceStats.byCourse[courseId].absent++;
        else if (studentRecord.status === "late") attendanceStats.byCourse[courseId].late++;
      }
    });

    if (attendanceStats.totalRecords > 0) {
      attendanceStats.attendancePercentage = Math.round(
        ((attendanceStats.present + attendanceStats.late) / attendanceStats.totalRecords) * 100
      );
    }

    // Get enrolled courses
    const enrolledCourses = educatorCourses.filter(c => 
      c.enrolledStudents && Array.isArray(c.enrolledStudents) && c.enrolledStudents.some(id => id.toString() === studentId)
    ).map(c => ({
      _id: c._id,
      title: c.title,
      category: c.category,
      thumbnail: c.thumbnail
    }));

    return res.status(200).json({
      student: {
        _id: student._id,
        name: student.name,
        email: student.email,
        photoUrl: student.photoUrl,
        totalActiveMinutes: student.totalActiveMinutes || 0,
        lastActiveAt: student.lastActiveAt,
        lastLoginAt: student.lastLoginAt
      },
      enrolledCourses,
      grades: grades,
      gradeStats,
      attendance: attendanceRecords,
      attendanceStats,
      activity: {
        totalActiveMinutes: student.totalActiveMinutes || 0,
        lastActiveAt: student.lastActiveAt,
        lastLoginAt: student.lastLoginAt
      }
    });
  } catch (error) {
    return res.status(500).json({ message: `Get student performance failed: ${error.message}` });
  }
};

/* ========================= Activity Tracking ========================= */
export const updateActivity = async (req, res) => {
  try {
    const { minutes } = req.body;
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    const addMinutes = Number(minutes) || 0;
    user.totalActiveMinutes = (user.totalActiveMinutes || 0) + addMinutes;
    user.lastActiveAt = new Date();
    await user.save();
    return res.status(200).json({ totalActiveMinutes: user.totalActiveMinutes, lastActiveAt: user.lastActiveAt });
  } catch (error) {
    return res.status(500).json({ message: "Activity update failed", error });
  }
};
