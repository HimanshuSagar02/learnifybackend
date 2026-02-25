import Grade from "../models/gradeModel.js";
import Course from "../models/courseModel.js";
import User from "../models/userModel.js";

// Create/Upload grade (educator only)
export const createGrade = async (req, res) => {
  try {
    const {
      studentId,
      courseId,
      subject,
      assignmentName,
      examType,
      marksObtained,
      totalMarks,
      remarks,
      date,
      isPublished,
    } = req.body;

    if (!studentId || !courseId || !subject || marksObtained === undefined || !totalMarks) {
      return res.status(400).json({
        message: "Student, course, subject, marks obtained, and total marks are required",
      });
    }

    const educator = await User.findById(req.userId);
    if (!educator) return res.status(404).json({ message: "User not found" });

    if (educator.role !== "educator" && educator.role !== "admin") {
      return res.status(403).json({ message: "Only educators can upload grades" });
    }

    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ message: "Course not found" });

    // Verify educator owns the course (unless admin)
    if (educator.role === "educator" && course.creator.toString() !== req.userId.toString()) {
      return res.status(403).json({ message: "You can only upload grades for your own courses" });
    }

    // Verify student is enrolled in the course
    const student = await User.findById(studentId);
    if (!student) return res.status(404).json({ message: "Student not found" });

    if (!course.enrolledStudents || !Array.isArray(course.enrolledStudents) || !course.enrolledStudents.includes(studentId)) {
      return res.status(403).json({ message: "Student is not enrolled in this course" });
    }

    // Check for duplicate grade (same student, course, subject, assignment, exam type)
    const gradeDate = date ? new Date(date) : new Date();
    const existingGrade = await Grade.findOne({
      studentId,
      courseId,
      subject,
      assignmentName: assignmentName || "",
      examType: examType || "assignment",
    });

    if (existingGrade) {
      return res.status(200).json({
        message: "A grade for this student, subject, and assignment already exists",
        alreadyExists: true,
        grade: existingGrade,
      });
    }

    const grade = await Grade.create({
      studentId,
      courseId,
      educatorId: req.userId,
      subject,
      assignmentName: assignmentName || "",
      examType: examType || "assignment",
      marksObtained,
      totalMarks,
      remarks: remarks || "",
      date: gradeDate,
      isPublished: isPublished !== undefined ? isPublished : false,
    });

    return res.status(201).json({
      message: "Grade recorded successfully",
      alreadyExists: false,
      grade,
    });
  } catch (error) {
    return res.status(500).json({ message: `Create grade failed: ${error.message}` });
  }
};

// Get grades for a course (educator view - all students)
export const getCourseGrades = async (req, res) => {
  try {
    const { courseId } = req.params;

    const educator = await User.findById(req.userId);
    if (!educator) return res.status(404).json({ message: "User not found" });

    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ message: "Course not found" });

    // Verify educator owns the course (unless admin)
    if (educator.role === "educator" && course.creator.toString() !== req.userId.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const grades = await Grade.find({ courseId })
      .populate("studentId", "name email photoUrl")
      .populate("courseId", "title")
      .sort({ date: -1, subject: 1 });

    return res.status(200).json(grades);
  } catch (error) {
    return res.status(500).json({ message: `Fetch course grades failed: ${error.message}` });
  }
};

// Get student's grades (student view)
export const getMyGrades = async (req, res) => {
  try {
    const student = await User.findById(req.userId);
    if (!student) return res.status(404).json({ message: "User not found" });

    const grades = await Grade.find({ studentId: req.userId })
      .populate("courseId", "title thumbnail category")
      .populate("educatorId", "name email")
      .sort({ date: -1, courseId: 1, subject: 1 });

    return res.status(200).json(grades);
  } catch (error) {
    return res.status(500).json({ message: `Fetch my grades failed: ${error.message}` });
  }
};

// Get grades for a specific student in a course (educator view)
export const getStudentGrades = async (req, res) => {
  try {
    const { courseId, studentId } = req.params;

    const educator = await User.findById(req.userId);
    if (!educator) return res.status(404).json({ message: "User not found" });

    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ message: "Course not found" });

    // Verify educator owns the course (unless admin)
    if (educator.role === "educator" && course.creator.toString() !== req.userId.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const grades = await Grade.find({ courseId, studentId })
      .populate("studentId", "name email")
      .populate("courseId", "title")
      .sort({ date: -1, subject: 1 });

    return res.status(200).json(grades);
  } catch (error) {
    return res.status(500).json({ message: `Fetch student grades failed: ${error.message}` });
  }
};

// Update grade (educator only)
export const updateGrade = async (req, res) => {
  try {
    const { gradeId } = req.params;
    const updateData = req.body;

    const grade = await Grade.findById(gradeId);
    if (!grade) return res.status(404).json({ message: "Grade not found" });

    const educator = await User.findById(req.userId);
    if (educator.role !== "admin" && grade.educatorId.toString() !== req.userId.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }

    // Recalculate percentage and grade if marks are updated
    if (updateData.marksObtained !== undefined || updateData.totalMarks !== undefined) {
      const marksObtained = updateData.marksObtained !== undefined 
        ? updateData.marksObtained 
        : grade.marksObtained;
      const totalMarks = updateData.totalMarks !== undefined 
        ? updateData.totalMarks 
        : grade.totalMarks;
      
      if (totalMarks > 0) {
        updateData.percentage = Math.round((marksObtained / totalMarks) * 100);
        
        if (updateData.percentage >= 90) updateData.grade = "A+";
        else if (updateData.percentage >= 80) updateData.grade = "A";
        else if (updateData.percentage >= 70) updateData.grade = "B+";
        else if (updateData.percentage >= 60) updateData.grade = "B";
        else if (updateData.percentage >= 50) updateData.grade = "C+";
        else if (updateData.percentage >= 40) updateData.grade = "C";
        else if (updateData.percentage >= 30) updateData.grade = "D";
        else updateData.grade = "F";
      }
    }

    Object.assign(grade, updateData);
    await grade.save();

    return res.status(200).json(grade);
  } catch (error) {
    return res.status(500).json({ message: `Update grade failed: ${error.message}` });
  }
};

// Delete grade (educator only)
export const deleteGrade = async (req, res) => {
  try {
    const { gradeId } = req.params;

    const grade = await Grade.findById(gradeId);
    if (!grade) return res.status(404).json({ message: "Grade not found" });

    const educator = await User.findById(req.userId);
    if (educator.role !== "admin" && grade.educatorId.toString() !== req.userId.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }

    await grade.deleteOne();

    return res.status(200).json({ message: "Grade deleted successfully" });
  } catch (error) {
    return res.status(500).json({ message: `Delete grade failed: ${error.message}` });
  }
};

// Bulk upload grades (educator only)
export const bulkUploadGrades = async (req, res) => {
  try {
    const { courseId, grades } = req.body;

    if (!courseId || !Array.isArray(grades) || grades.length === 0) {
      return res.status(400).json({ message: "Course ID and grades array are required" });
    }

    const educator = await User.findById(req.userId);
    if (!educator) return res.status(404).json({ message: "User not found" });

    if (educator.role !== "educator" && educator.role !== "admin") {
      return res.status(403).json({ message: "Only educators can upload grades" });
    }

    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ message: "Course not found" });

    if (educator.role === "educator" && course.creator.toString() !== req.userId.toString()) {
      return res.status(403).json({ message: "You can only upload grades for your own courses" });
    }

    const createdGrades = [];
    const errors = [];

    for (const gradeData of grades) {
      try {
        const { studentId, subject, assignmentName, examType, marksObtained, totalMarks, remarks } = gradeData;

        if (!studentId || !subject || marksObtained === undefined || !totalMarks) {
          errors.push({ gradeData, error: "Missing required fields" });
          continue;
        }

        // Verify student is enrolled
        if (!course.enrolledStudents || !Array.isArray(course.enrolledStudents) || !course.enrolledStudents.includes(studentId)) {
          errors.push({ gradeData, error: "Student not enrolled in course" });
          continue;
        }

        // Check for duplicate grade
        const existingGrade = await Grade.findOne({
          studentId,
          courseId,
          subject,
          assignmentName: assignmentName || "",
          examType: examType || "assignment",
        });

        if (existingGrade) {
          errors.push({ 
            gradeData, 
            error: "Grade already exists for this student, subject, and assignment",
            existingGrade: existingGrade._id
          });
          continue;
        }

        const grade = await Grade.create({
          studentId,
          courseId,
          educatorId: req.userId,
          subject,
          assignmentName: assignmentName || "",
          examType: examType || "assignment",
          marksObtained,
          totalMarks,
          remarks: remarks || "",
          date: new Date(),
          isPublished: false,
        });

        createdGrades.push(grade);
      } catch (error) {
        errors.push({ gradeData, error: error.message });
      }
    }

    return res.status(200).json({
      message: `Successfully created ${createdGrades.length} grades`,
      created: createdGrades,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    return res.status(500).json({ message: `Bulk upload failed: ${error.message}` });
  }
};

// Get grade statistics for a course
export const getGradeStatistics = async (req, res) => {
  try {
    const { courseId } = req.params;

    const educator = await User.findById(req.userId);
    if (!educator) return res.status(404).json({ message: "User not found" });

    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ message: "Course not found" });

    if (educator.role === "educator" && course.creator.toString() !== req.userId.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const grades = await Grade.find({ courseId });

    const stats = {
      totalGrades: grades.length,
      averagePercentage: 0,
      gradeDistribution: {
        "A+": 0,
        "A": 0,
        "B+": 0,
        "B": 0,
        "C+": 0,
        "C": 0,
        "D": 0,
        "F": 0,
      },
      subjectStats: {},
    };

    if (grades.length > 0) {
      const totalPercentage = grades.reduce((sum, g) => sum + g.percentage, 0);
      stats.averagePercentage = Math.round(totalPercentage / grades.length);

      grades.forEach((grade) => {
        stats.gradeDistribution[grade.grade] = (stats.gradeDistribution[grade.grade] || 0) + 1;
        
        if (!stats.subjectStats[grade.subject]) {
          stats.subjectStats[grade.subject] = {
            count: 0,
            averagePercentage: 0,
            totalPercentage: 0,
          };
        }
        stats.subjectStats[grade.subject].count++;
        stats.subjectStats[grade.subject].totalPercentage += grade.percentage;
      });

      // Calculate average for each subject
      Object.keys(stats.subjectStats).forEach((subject) => {
        const subjectStat = stats.subjectStats[subject];
        subjectStat.averagePercentage = Math.round(subjectStat.totalPercentage / subjectStat.count);
      });
    }

    return res.status(200).json(stats);
  } catch (error) {
    return res.status(500).json({ message: `Fetch statistics failed: ${error.message}` });
  }
};

