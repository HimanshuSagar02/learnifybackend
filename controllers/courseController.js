import uploadOnCloudinary from "../configs/cloudinary.js";
import Course from "../models/courseModel.js";
import Lecture from "../models/lectureModel.js";
import User from "../models/userModel.js";


/* ============================= Create Course ============================= */
export const createCourse = async (req, res) => {
  try {
    const { title, category, class: courseClass, branch, subject } = req.body;
    const courseBranch = String(branch || courseClass || "").trim();

    if (!title || !category) {
      return res.status(400).json({ message: "Title & Category is required" });
    }
    if (!courseBranch) {
      return res.status(400).json({ message: "Branch is required (for example: CSE, IT, ECE or General)" });
    }
    if (!subject) {
      return res.status(400).json({ message: "Subject is required" });
    }

    const course = await Course.create({
      title,
      category,
      class: courseBranch,
      subject,
      creator: req.userId,
    });

    return res.status(201).json(course);

  } catch (error) {
    return res.status(500).json({ message: `Create Course Error: ${error}` });
  }
};


/* ============================= Get All Courses ============================= */
export const getAllCourse = async (req, res) => {
  try {
    console.log("[GetAllCourses] Fetching all courses...");
    const courses = await Course.find()
      .populate("lectures")
      .populate("creator", "name email photoUrl")
      .lean();
    console.log(`[GetAllCourses] Found ${courses.length} courses`);
    return res.status(200).json(courses || []);

  } catch (error) {
    console.error("[GetAllCourses] Error:", error);
    console.error("[GetAllCourses] Error stack:", error.stack);
    return res.status(500).json({ 
      message: "Fetching all course failed", 
      error: process.env.NODE_ENV === "development" ? error.message : "Internal server error"
    });
  }
};


/* ===================== Get Only Published for Home UI ====================== */
export const getPublishedCourses = async (req, res) => {
  try {
    console.log("[GetPublishedCourses] Fetching published courses...");
    const courses = await Course.find({ isPublished: true }).populate("lectures reviews");
    console.log(`[GetPublishedCourses] Found ${courses.length} published courses`);
    return res.status(200).json(courses || []);

  } catch (error) {
    console.error("[GetPublishedCourses] Error:", error);
    return res.status(500).json({ 
      message: `Fetch Published Error: ${error.message || error}` 
    });
  }
};


/* ========================== Creator Course Fetch =========================== */
export const getCreatorCourses = async (req, res) => {
  try {
    const userId = req.userId;
    console.log(`[GetCreatorCourses] Fetching courses for creator: ${userId}`);
    
    if (!userId) {
      console.log(`[GetCreatorCourses] userId is missing`);
      return res.status(400).json({ message: "User ID is required" });
    }
    
    const courses = await Course.find({ creator: userId })
      .populate("lectures", "lectureTitle videoUrl isPreviewFree")
      .populate("reviews", "rating comment")
      .populate("enrolledStudents", "name email photoUrl class subject")
      .lean(); // Use lean() for better performance in production
    
    console.log(`[GetCreatorCourses] Found ${courses.length} courses for creator`);
    
    // Ensure all courses have required fields and convert to plain objects
    const formattedCourses = (courses || []).map(course => ({
      ...course,
      lectures: course.lectures || [],
      reviews: course.reviews || [],
      enrolledStudents: course.enrolledStudents || [],
      enrolledStudentsCount: course.enrolledStudents?.length || 0
    }));
    
    return res.status(200).json(formattedCourses);

  } catch (error) {
    console.error("[GetCreatorCourses] Error:", error);
    return res.status(500).json({ 
      message: `Creator Course Fetch Failed: ${error.message || error}` 
    });
  }
};


/* ============================= Edit Course ============================= */
export const editCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { title, subTitle, description, category, level, price, isPublished } = req.body;

    const updateData = { title, subTitle, description, category, level, price, isPublished };

    if (req.file) {
      const thumbnail = await uploadOnCloudinary(req.file.path);
      if (thumbnail) {
        updateData.thumbnail = thumbnail;
      }
    }

    const updatedCourse = await Course.findByIdAndUpdate(courseId, updateData, { new: true });
    if (!updatedCourse) {
      return res.status(404).json({ message: "Course not found" });
    }
    
    return res.status(200).json(updatedCourse);

  } catch (error) {
    console.error("Edit Course Error:", error);
    return res.status(500).json({ message: `Course Update Error: ${error.message || error}` });
  }
};


/* ============================= Single Course ============================= */
export const getCourseById = async (req, res) => {
  try {
    const { courseId } = req.params;
    console.log(`[GetCourseById] Fetching course: ${courseId}`);

    const course = await Course.findById(courseId).populate("lectures reviews");
    if (!course) {
      console.log(`[GetCourseById] Course not found: ${courseId}`);
      return res.status(404).json({ message: "Course Not Found" });
    }

    console.log(`[GetCourseById] Course found: ${course.title}, Lectures: ${course.lectures?.length || 0}`);
    return res.status(200).json(course);

  } catch (error) {
    console.error("[GetCourseById] Error:", error);
    return res.status(500).json({ 
      message: `Get Course Error: ${error.message || error}` 
    });
  }
};

/* ============================= Course Students ============================= */
export const getCourseStudents = async (req, res) => {
  try {
    const { courseId } = req.params;
    const course = await Course.findById(courseId).populate("enrolledStudents", "name email totalActiveMinutes lastActiveAt");
    if (!course) return res.status(404).json({ message: "Course Not Found" });
    return res.status(200).json(course.enrolledStudents || []);
  } catch (error) {
    return res.status(500).json({ message: `Get Course Students Error: ${error}` });
  }
};


/* ============================= Remove Course ============================= */
export const removeCourse = async (req, res) => {
  try {
    const { courseId } = req.params;

    const exist = await Course.findById(courseId);
    if (!exist) return res.status(404).json({ message: "Course Not Found" });

    await exist.deleteOne();

    return res.status(200).json({ message: "Course Deleted Successfully" });

  } catch (error) {
    return res.status(500).json({ message: `Remove Failed: ${error}` });
  }
};


/* ============================= Create Lecture ============================= */
export const createLecture = async (req, res) => {
  try {
    const { lectureTitle } = req.body;
    const { courseId } = req.params;

    if (!lectureTitle) return res.status(400).json({ message: "Lecture Title Required" });

    const lecture = await Lecture.create({ lectureTitle });
    const course = await Course.findById(courseId);

    course.lectures.push(lecture._id);
    await course.populate("lectures");
    await course.save();

    return res.status(201).json({ lecture, course });

  } catch (error) {
    return res.status(500).json({ message: `Create Lecture Error: ${error}` });
  }
};


/* ============================= Get Lectures ============================= */
export const getCourseLecture = async (req, res) => {
  try {
    const { courseId } = req.params;
    
    if (!courseId) {
      return res.status(400).json({ message: "Course ID is required" });
    }

    const course = await Course.findById(courseId).populate("lectures");

    if (!course) {
      return res.status(404).json({ message: "Course Not Found" });
    }

    // Log lecture data for debugging
    console.log(`Found course: ${course.title}, Lectures count: ${course.lectures?.length || 0}`);
    if (course.lectures && course.lectures.length > 0) {
      course.lectures.forEach((lecture, index) => {
        console.log(`Lecture ${index + 1}: ${lecture.lectureTitle}, Video URL: ${lecture.videoUrl ? 'Present' : 'Missing'}`);
      });
    }

    return res.status(200).json(course);

  } catch (error) {
    console.error("Get Course Lecture Error:", error);
    return res.status(500).json({ message: `Fetching Lecture Error: ${error.message || error}` });
  }
};


/* ============================= Edit Lecture ============================= */
export const editLecture = async (req, res) => {
  try {
    const { lectureId } = req.params;
    const { lectureTitle, isPreviewFree } = req.body;

    const lecture = await Lecture.findById(lectureId);
    if (!lecture) return res.status(404).json({ message: "Lecture Not Found" });

    if (req.file) {
      const videoUrl = await uploadOnCloudinary(req.file.path);
      if (videoUrl) {
        lecture.videoUrl = videoUrl;
      }
    }
    if (lectureTitle) lecture.lectureTitle = lectureTitle;

    // Handle isPreviewFree - convert string to boolean if needed
    if (isPreviewFree !== undefined) {
      lecture.isPreviewFree = isPreviewFree === true || isPreviewFree === "true";
    }
    
    await lecture.save();

    return res.status(200).json(lecture);

  } catch (error) {
    console.error("Edit Lecture Error:", error);
    return res.status(500).json({ message: `Lecture Update Error: ${error.message || error}` });
  }
};


/* ============================= Remove Lecture ============================= */
export const removeLecture = async (req, res) => {
  try {
    const { lectureId } = req.params;

    await Lecture.findByIdAndDelete(lectureId);
    await Course.updateOne({ lectures: lectureId }, { $pull: { lectures: lectureId } });

    return res.status(200).json({ message: "Lecture Removed" });

  } catch (error) {
    return res.status(500).json({ message: `Lecture Delete Error: ${error}` });
  }
};


/* ============================= Enroll Course ============================= */
/* ============================= Enroll Course ============================= */
export const enrollCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.userId;

    const course = await Course.findById(courseId);
    const user = await User.findById(userId);

    if (!course) return res.status(404).json({ message: "Course Not Found" });
    if (!user) return res.status(404).json({ message: "User Not Found" });

    const normalizedUserId = userId?.toString?.() || String(userId || "");
    const coursePrice = Number(course.price);
    const isPaidCourse = Number.isFinite(coursePrice) && coursePrice > 0;

    // Paid courses should go through payment flow only.
    if (isPaidCourse) {
      return res.status(400).json({
        message: "This course is paid. Please complete payment to enroll.",
        code: "PAYMENT_REQUIRED",
      });
    }

    // Prevent educators and admins from enrolling in courses
    if (user.role === "educator" || user.role === "admin") {
      return res.status(403).json({ 
        message: "Educators and admins cannot enroll in courses. They can only create and manage their own courses." 
      });
    }

    // Prevent enrolling in own course (if somehow a student created a course)
    const creatorId = course.creator?.toString?.();
    if (creatorId && creatorId === normalizedUserId) {
      return res.status(403).json({ 
        message: "You cannot enroll in your own course." 
      });
    }

    // Check if already enrolled
    const isAlreadyEnrolledInCourse =
      Array.isArray(course.enrolledStudents) &&
      course.enrolledStudents.some((id) => id?.toString?.() === normalizedUserId);
    const isAlreadyEnrolledInUser =
      Array.isArray(user.enrolledCourses) &&
      user.enrolledCourses.some((id) => id?.toString?.() === courseId?.toString?.());
    const isAlreadyEnrolled = isAlreadyEnrolledInCourse || isAlreadyEnrolledInUser;

    if (isAlreadyEnrolled) {
      // Heal partial enrollment state if one side is missing.
      const fixes = [];
      if (!isAlreadyEnrolledInCourse) {
        fixes.push(
          Course.updateOne(
            { _id: courseId },
            { $addToSet: { enrolledStudents: user._id } }
          )
        );
      }
      if (!isAlreadyEnrolledInUser) {
        fixes.push(
          User.updateOne(
            { _id: userId },
            { $addToSet: { enrolledCourses: course._id } }
          )
        );
      }
      if (fixes.length) {
        await Promise.all(fixes);
      }

      return res.status(200).json({ 
        message: "You are already enrolled in this course",
        alreadyEnrolled: true
      });
    }

    // Add enrollment atomically on both documents.
    await Promise.all([
      Course.updateOne(
        { _id: courseId },
        { $addToSet: { enrolledStudents: user._id } }
      ),
      User.updateOne(
        { _id: userId },
        { $addToSet: { enrolledCourses: course._id } }
      ),
    ]);

    return res.status(200).json({ 
      message: "Successfully enrolled in the course",
      alreadyEnrolled: false
    });

  } catch (error) {
    console.error("[EnrollCourse] Error:", error);
    return res.status(500).json({ message: `Enrollment Error: ${error.message || error}` });
  }
};


/* ============================= Get Instructor ============================= */
export const getCreatorById = async (req, res) => {
  try {
    const { userId } = req.body;
    console.log(`[GetCreatorById] Fetching creator: ${userId}`);

    if (!userId) {
      console.log(`[GetCreatorById] userId is required`);
      return res.status(400).json({ message: "User ID is required" });
    }

    const user = await User.findById(userId).select("-password");
    if (!user) {
      console.log(`[GetCreatorById] User not found: ${userId}`);
      return res.status(404).json({ message: "Instructor Not Found" });
    }

    console.log(`[GetCreatorById] Creator found: ${user.name}, Role: ${user.role}`);
    return res.status(200).json(user);

  } catch (error) {
    console.error("[GetCreatorById] Error:", error);
    return res.status(500).json({ 
      message: "Creator Fetch Error", 
      error: error.message || error 
    });
  }
};
