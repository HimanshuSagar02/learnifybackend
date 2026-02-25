import Assignment from "../models/assignmentModel.js";
import Submission from "../models/submissionModel.js";
import Course from "../models/courseModel.js";
import User from "../models/userModel.js";
import uploadOnCloudinary from "../configs/cloudinary.js";

const ensureEducatorForCourse = async (courseId, userId) => {
  const user = await User.findById(userId);
  if (!user || user.role !== "educator") {
    throw { status: 403, message: "Only educators can perform this action" };
  }

  const course = await Course.findById(courseId);
  if (!course) throw { status: 404, message: "Course not found" };
  if (course.creator.toString() !== userId.toString()) {
    throw { status: 403, message: "Not course owner" };
  }

  return course;
};

export const createAssignment = async (req, res) => {
  try {
    const { courseId, title, description, dueDate, resourceUrl, attachmentUrl, maxScore } =
      req.body;

    if (!courseId || !title) {
      return res.status(400).json({ message: "Course and title are required" });
    }

    await ensureEducatorForCourse(courseId, req.userId);

    let uploadedAttachment = attachmentUrl;
    if (req.file?.path) {
      uploadedAttachment = await uploadOnCloudinary(req.file.path);
    }

    const assignment = await Assignment.create({
      courseId,
      creatorId: req.userId,
      title,
      description,
      dueDate,
      resourceUrl,
      attachmentUrl: uploadedAttachment,
      maxScore,
    });

    return res.status(201).json(assignment);
  } catch (error) {
    const status = error?.status || 500;
    return res.status(status).json({ message: error?.message || `Create failed: ${error}` });
  }
};

export const getAssignmentsByCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    console.log(`[GetAssignments] Fetching assignments for course: ${courseId}`);
    const assignments = await Assignment.find({ courseId }).sort({ createdAt: -1 });
    console.log(`[GetAssignments] Found ${assignments.length} assignments`);
    return res.status(200).json(assignments || []);
  } catch (error) {
    console.error("[GetAssignments] Error:", error);
    return res.status(500).json({ 
      message: `Fetch assignments failed: ${error.message || error}` 
    });
  }
};

export const updateAssignment = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const { title, description, dueDate, resourceUrl, attachmentUrl, maxScore } = req.body;

    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) return res.status(404).json({ message: "Assignment not found" });

    await ensureEducatorForCourse(assignment.courseId, req.userId);

    if (title) assignment.title = title;
    if (description !== undefined) assignment.description = description;
    if (dueDate !== undefined) assignment.dueDate = dueDate;
    if (resourceUrl !== undefined) assignment.resourceUrl = resourceUrl;
    if (attachmentUrl !== undefined) assignment.attachmentUrl = attachmentUrl;
    if (maxScore !== undefined) assignment.maxScore = maxScore;

    await assignment.save();
    return res.status(200).json(assignment);
  } catch (error) {
    const status = error?.status || 500;
    return res.status(status).json({ message: error?.message || `Update failed: ${error}` });
  }
};

export const deleteAssignment = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) return res.status(404).json({ message: "Assignment not found" });

    await ensureEducatorForCourse(assignment.courseId, req.userId);
    await assignment.deleteOne();
    return res.status(200).json({ message: "Assignment deleted" });
  } catch (error) {
    const status = error?.status || 500;
    return res.status(status).json({ message: error?.message || `Delete failed: ${error}` });
  }
};

export const submitAssignment = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const { submissionUrl, attachmentUrl, comment } = req.body;

    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) return res.status(404).json({ message: "Assignment not found" });

    let uploadedAttachment = attachmentUrl;
    if (req.file?.path) {
      uploadedAttachment = await uploadOnCloudinary(req.file.path);
    }

    const existing = await Submission.findOne({
      assignmentId,
      studentId: req.userId,
    });

    if (existing) {
      // Update existing submission
      existing.submissionUrl = submissionUrl || existing.submissionUrl;
      existing.attachmentUrl = uploadedAttachment || existing.attachmentUrl;
      existing.comment = comment || existing.comment;
      existing.status = "submitted";
      existing.submittedAt = new Date();
      await existing.save();
      return res.status(200).json({
        message: "Assignment submission updated successfully",
        alreadySubmitted: true,
        submission: existing,
      });
    }

    const submission = await Submission.create({
      assignmentId,
      studentId: req.userId,
      submissionUrl,
      attachmentUrl: uploadedAttachment,
      comment,
      submittedAt: new Date(),
    });

    return res.status(201).json({
      message: "Assignment submitted successfully",
      alreadySubmitted: false,
      submission,
    });
  } catch (error) {
    return res.status(500).json({ message: `Submit failed: ${error}` });
  }
};

export const getMySubmission = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const submission = await Submission.findOne({
      assignmentId,
      studentId: req.userId,
    });

    if (!submission) return res.status(404).json({ message: "No submission found" });
    return res.status(200).json(submission);
  } catch (error) {
    return res.status(500).json({ message: `Fetch submission failed: ${error}` });
  }
};

export const getSubmissionsForAssignment = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) return res.status(404).json({ message: "Assignment not found" });

    await ensureEducatorForCourse(assignment.courseId, req.userId);

    const submissions = await Submission.find({ assignmentId })
      .populate("studentId", "name email")
      .sort({ createdAt: -1 });

    return res.status(200).json(submissions);
  } catch (error) {
    const status = error?.status || 500;
    return res.status(status).json({ message: error?.message || `Fetch failed: ${error}` });
  }
};

export const gradeSubmission = async (req, res) => {
  try {
    const { submissionId } = req.params;
    const { score, feedback } = req.body;

    const submission = await Submission.findById(submissionId);
    if (!submission) return res.status(404).json({ message: "Submission not found" });

    const assignment = await Assignment.findById(submission.assignmentId);
    if (!assignment) return res.status(404).json({ message: "Assignment not found" });

    await ensureEducatorForCourse(assignment.courseId, req.userId);

    if (score !== undefined) submission.score = score;
    if (feedback !== undefined) submission.feedback = feedback;
    submission.status = "graded";
    await submission.save();

    return res.status(200).json(submission);
  } catch (error) {
    const status = error?.status || 500;
    return res.status(status).json({ message: error?.message || `Grade failed: ${error}` });
  }
};

