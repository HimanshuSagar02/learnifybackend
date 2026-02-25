import uploadOnCloudinary from "../configs/cloudinary.js";
import CourseNote from "../models/courseNoteModel.js";
import Course from "../models/courseModel.js";
import User from "../models/userModel.js";

const canManageNote = (note, user) => {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (note.uploaderId.toString() === user._id.toString()) return true;
  return false;
};

export const listCourseNotes = async (req, res) => {
  try {
    const { courseId } = req.query;
    console.log(`[ListCourseNotes] Fetching notes for user: ${req.userId}, courseId: ${courseId || 'all'}`);
    const user = await User.findById(req.userId);
    if (!user) {
      console.log(`[ListCourseNotes] User not found: ${req.userId}`);
      return res.status(404).json({ message: "User not found" });
    }

    let filter = courseId ? { courseId } : {};

    // If user is a student, only show notes from their enrolled courses
    if (user.role === "student") {
      const enrolledCourses = await Course.find({
        enrolledStudents: req.userId,
      }).select("_id");
      const courseIds = enrolledCourses.map((c) => c._id);
      console.log(`[ListCourseNotes] Student enrolled in ${courseIds.length} courses`);
      if (courseIds.length === 0) {
        console.log(`[ListCourseNotes] No enrolled courses, returning empty array`);
        return res.status(200).json([]);
      }
      filter = { ...filter, courseId: { $in: courseIds } };
    } else {
      console.log(`[ListCourseNotes] User role: ${user.role} - can see all notes`);
    }

    const notes = await CourseNote.find(filter)
      .populate("uploaderId", "name email role")
      .populate("courseId", "title")
      .sort({ createdAt: -1 });
    
    console.log(`[ListCourseNotes] Found ${notes.length} notes`);
    return res.status(200).json(notes || []);
  } catch (error) {
    console.error("[ListCourseNotes] Error:", error);
    return res.status(500).json({ 
      message: `Fetch notes failed: ${error.message || error}` 
    });
  }
};

export const createCourseNote = async (req, res) => {
  try {
    const { courseId, title, content } = req.body;
    if (!courseId || !title) {
      return res.status(400).json({ message: "courseId and title are required" });
    }
    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ message: "Course not found" });

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Only educators, admins, or course creators can upload notes
    if (user.role !== "educator" && user.role !== "admin") {
      return res.status(403).json({ message: "Only educators and admins can upload notes" });
    }
    
    // If user is educator, verify they own the course
    if (user.role === "educator" && course.creator.toString() !== req.userId.toString()) {
      return res.status(403).json({ message: "You can only upload notes for your own courses" });
    }

    let fileUrl;
    if (req.file?.path) {
      fileUrl = await uploadOnCloudinary(req.file.path);
    }

    const note = await CourseNote.create({
      courseId,
      uploaderId: req.userId,
      title,
      content,
      fileUrl,
    });

    return res.status(201).json(note);
  } catch (error) {
    return res.status(500).json({ message: `Create note failed: ${error}` });
  }
};

export const deleteCourseNote = async (req, res) => {
  try {
    const { noteId } = req.params;
    const note = await CourseNote.findById(noteId);
    if (!note) return res.status(404).json({ message: "Note not found" });
    const user = await User.findById(req.userId);
    if (!canManageNote(note, user)) {
      return res.status(403).json({ message: "Not allowed" });
    }
    await note.deleteOne();
    return res.status(200).json({ message: "Note deleted" });
  } catch (error) {
    return res.status(500).json({ message: `Delete note failed: ${error}` });
  }
};

