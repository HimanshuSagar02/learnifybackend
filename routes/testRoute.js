import express from "express";
import User from "../models/userModel.js";
import connectDb from "../configs/db.js";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const router = express.Router();

// Test database connection
router.get("/db", async (req, res) => {
    try {
        const dbState = mongoose.connection.readyState;
        const states = {
            0: "disconnected",
            1: "connected",
            2: "connecting",
            3: "disconnecting"
        };
        
        const response = {
            success: dbState === 1,
            status: states[dbState] || "unknown",
            readyState: dbState,
            message: dbState === 1 ? "Database is connected" : "Database is not connected",
            environment: process.env.NODE_ENV || "development",
            hasMongoUrl: !!process.env.MONGODB_URL,
            mongoUrlPreview: process.env.MONGODB_URL 
                ? process.env.MONGODB_URL.substring(0, 30) + "..." 
                : "Not set"
        };
        
        if (dbState === 1) {
            response.database = mongoose.connection.name;
            response.host = mongoose.connection.host;
            response.port = mongoose.connection.port;
        } else {
            response.hint = "Check MONGODB_URL environment variable and MongoDB Atlas network access";
            
            // Try to reconnect if disconnected
            if (dbState === 0) {
                try {
                    const connectDb = (await import("../configs/db.js")).default;
                    await connectDb();
                    response.reconnectionAttempted = true;
                } catch (err) {
                    response.reconnectionError = err.message;
                }
            }
        }
        
        return res.status(200).json(response);
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Database check failed",
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Test user query
router.get("/users", async (req, res) => {
    try {
        const count = await User.countDocuments();
        const sampleUsers = await User.find().limit(5).select("name email role status").lean();
        
        return res.status(200).json({
            success: true,
            totalUsers: count,
            sampleUsers: sampleUsers,
            message: "User query successful"
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "User query failed",
            error: error.message
        });
    }
});

// Test specific user lookup
router.get("/user/:email", async (req, res) => {
    try {
        const { email } = req.params;
        const user = await User.findOne({ email: email.toLowerCase() }).lean();
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
                email: email
            });
        }
        
        // Check password status without exposing the password
        const hasPassword = !!(user.password && user.password.trim() !== '');
        const passwordInfo = {
            hasPassword: hasPassword,
            passwordLength: user.password ? user.password.length : 0,
            isHashed: hasPassword ? user.password.startsWith('$2') : false // bcrypt hashes start with $2
        };
        
        // Remove password from response
        delete user.password;
        
        return res.status(200).json({
            success: true,
            user: user,
            passwordInfo: passwordInfo,
            message: "User found"
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "User lookup failed",
            error: error.message
        });
    }
});

// Test login endpoint (simulates login without setting cookies)
router.post("/login-test", async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required"
            });
        }
        
        const normalizedEmail = email.toLowerCase().trim();
        const user = await User.findOne({ email: normalizedEmail });
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
                email: normalizedEmail
            });
        }
        
        // Check status
        if (user.status === "pending") {
            return res.status(403).json({
                success: false,
                message: "Account pending approval",
                status: user.status
            });
        }
        
        if (user.status === "rejected") {
            return res.status(403).json({
                success: false,
                message: "Account rejected",
                status: user.status
            });
        }
        
        // Check password
        if (!user.password || user.password.trim() === '') {
            return res.status(400).json({
                success: false,
                message: "User has no password set",
                needsPasswordReset: true
            });
        }
        
        // Compare password
        const isMatch = await bcrypt.compare(password, user.password);
        
        if (!isMatch) {
            return res.status(400).json({
                success: false,
                message: "Incorrect password"
            });
        }
        
        // Success
        return res.status(200).json({
            success: true,
            message: "Login would succeed",
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                status: user.status
            }
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Login test failed",
            error: error.message
        });
    }
});

// Set password for user (for users without passwords)
router.post("/user/:email/set-password", async (req, res) => {
    try {
        const { email } = req.params;
        const { password } = req.body;
        
        if (!password || password.length < 6) {
            return res.status(400).json({
                success: false,
                message: "Password is required and must be at least 6 characters"
            });
        }
        
        const user = await User.findOne({ email: email.toLowerCase() });
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
                email: email
            });
        }
        
        // Hash and set password
        const hashedPassword = await bcrypt.hash(password, 10);
        user.password = hashedPassword;
        await user.save();
        
        return res.status(200).json({
            success: true,
            message: "Password set successfully",
            email: email
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Failed to set password",
            error: error.message
        });
    }
});

// Test notifications
router.get("/notifications", async (req, res) => {
    try {
        const Notification = (await import("../models/notificationModel.js")).default;
        const count = await Notification.countDocuments();
        const notifications = await Notification.find().limit(5).select("title type isActive").lean();
        
        return res.status(200).json({
            success: true,
            totalNotifications: count,
            sampleNotifications: notifications || [],
            message: "Notifications query successful"
        });
    } catch (error) {
        console.error("[Test] Notifications query error:", error);
        return res.status(500).json({
            success: false,
            message: "Notifications query failed",
            error: error.message
        });
    }
});

// Test shared notes
router.get("/shared-notes", async (req, res) => {
    try {
        const CourseNote = (await import("../models/courseNoteModel.js")).default;
        const count = await CourseNote.countDocuments();
        const notes = await CourseNote.find().limit(5).select("title courseId").lean();
        
        return res.status(200).json({
            success: true,
            totalNotes: count,
            sampleNotes: notes || [],
            message: "Shared notes query successful"
        });
    } catch (error) {
        console.error("[Test] Shared notes query error:", error);
        return res.status(500).json({
            success: false,
            message: "Shared notes query failed",
            error: error.message
        });
    }
});

// Test attendance
router.get("/attendance", async (req, res) => {
    try {
        const Attendance = (await import("../models/attendanceModel.js")).default;
        const count = await Attendance.countDocuments();
        const attendance = await Attendance.find().limit(5).select("courseId date").lean();
        
        return res.status(200).json({
            success: true,
            totalRecords: count,
            sampleRecords: attendance || [],
            message: "Attendance query successful"
        });
    } catch (error) {
        console.error("[Test] Attendance query error:", error);
        return res.status(500).json({
            success: false,
            message: "Attendance query failed",
            error: error.message
        });
    }
});

// Test live classes
router.get("/live-classes", async (req, res) => {
    try {
        const LiveClass = (await import("../models/liveClassModel.js")).default;
        const count = await LiveClass.countDocuments();
        const liveClasses = await LiveClass.find().limit(5).select("title courseId status").lean();
        
        return res.status(200).json({
            success: true,
            totalLiveClasses: count,
            sampleLiveClasses: liveClasses || [],
            message: "Live classes query successful"
        });
    } catch (error) {
        console.error("[Test] Live classes query error:", error);
        return res.status(500).json({
            success: false,
            message: "Live classes query failed",
            error: error.message
        });
    }
});

// Test data fetching endpoints
router.get("/courses", async (req, res) => {
    try {
        const Course = (await import("../models/courseModel.js")).default;
        const count = await Course.countDocuments();
        const courses = await Course.find().limit(5).select("title category class subject").lean();
        
        return res.status(200).json({
            success: true,
            totalCourses: count,
            sampleCourses: courses || [],
            message: "Courses query successful"
        });
    } catch (error) {
        console.error("[Test] Courses query error:", error);
        return res.status(500).json({
            success: false,
            message: "Courses query failed",
            error: error.message
        });
    }
});

router.get("/assignments", async (req, res) => {
    try {
        const Assignment = (await import("../models/assignmentModel.js")).default;
        const count = await Assignment.countDocuments();
        const assignments = await Assignment.find().limit(5).select("title courseId").lean();
        
        return res.status(200).json({
            success: true,
            totalAssignments: count,
            sampleAssignments: assignments || [],
            message: "Assignments query successful"
        });
    } catch (error) {
        console.error("[Test] Assignments query error:", error);
        return res.status(500).json({
            success: false,
            message: "Assignments query failed",
            error: error.message
        });
    }
});

// Test authentication endpoint
router.get("/auth-test", async (req, res) => {
    try {
        const jwt = (await import("jsonwebtoken")).default;
        const { token } = req.cookies;
        
        if (!token) {
            return res.status(401).json({
                success: false,
                message: "No token found in cookies",
                hasToken: false
            });
        }
        
        if (!process.env.JWT_SECRET) {
            return res.status(500).json({
                success: false,
                message: "JWT_SECRET not configured"
            });
        }
        
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            return res.status(200).json({
                success: true,
                message: "Token is valid",
                userId: decoded.userId,
                hasToken: true
            });
        } catch (jwtError) {
            return res.status(401).json({
                success: false,
                message: "Token is invalid or expired",
                error: jwtError.name,
                hasToken: true
            });
        }
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Auth test failed",
            error: error.message
        });
    }
});

export default router;
