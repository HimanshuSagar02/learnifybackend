import bcrypt from "bcryptjs";
import User from "../models/userModel.js";

export const createUserByAdmin = async (req, res) => {
  try {
    const { name, email, password, role, status = "approved", class: userClass, subject } = req.body;
    
    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: "Name, email, password, role are required" });
    }
    
    // Validate role
    if (!["student", "educator", "admin"].includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }
    
    // Validate status
    if (!["pending", "approved", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }
    
    // Check if email already exists
    const exist = await User.findOne({ email });
    if (exist) {
      return res.status(400).json({ message: "Email already exists" });
    }

    // Hash password
    const hash = await bcrypt.hash(password, 10);
    
    // Create user object
    const userData = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password: hash,
      role,
      status,
      createdByAdmin: true,
    };
    
    // Add class and subject if provided
    if (userClass) {
      userData.class = userClass;
    }
    if (subject) {
      userData.subject = subject;
    }
    
    const user = await User.create(userData);
    
    // Return user without password
    const userResponse = user.toObject();
    delete userResponse.password;
    
    return res.status(201).json(userResponse);
  } catch (error) {
    console.error("Create user error:", error);
    return res.status(500).json({ 
      message: `Create user failed: ${error.message || String(error)}` 
    });
  }
};

export const listUsers = async (req, res) => {
  try {
    console.log(`[ListUsers] Fetching users for admin: ${req.userId}`);
    const { role, status } = req.query;
    const filter = {};
    
    if (role && role.trim() !== "") {
      filter.role = role;
    }
    if (status && status.trim() !== "") {
      filter.status = status;
    }
    
    console.log(`[ListUsers] Filter:`, filter);
    const users = await User.find(filter)
      .select("-password -resetOtp -otpExpires -isOtpVerifed")
      .sort({ createdAt: -1 })
      .lean(); // Use lean() for better performance
    
    console.log(`[ListUsers] Found ${users.length} users`);
    return res.status(200).json(users || []);
  } catch (error) {
    console.error("[ListUsers] Error:", error);
    return res.status(500).json({ 
      message: `List users failed: ${error.message || String(error)}` 
    });
  }
};

export const updateUserStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const { status } = req.body;
    if (!["pending", "approved", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }
    const user = await User.findByIdAndUpdate(userId, { status }, { new: true }).select(
      "-password"
    );
    if (!user) return res.status(404).json({ message: "User not found" });
    return res.status(200).json(user);
  } catch (error) {
    return res.status(500).json({ message: `Update status failed: ${error}` });
  }
};

export const updateUserPassword = async (req, res) => {
  try {
    const { userId } = req.params;
    const { password } = req.body;
    
    if (!password) {
      return res.status(400).json({ message: "Password is required" });
    }
    
    if (password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Prevent admin from changing their own password through this endpoint
    // (they should use regular password change)
    if (user.role === "admin" && user._id.toString() === req.userId.toString()) {
      return res.status(403).json({ message: "Cannot change your own password through this endpoint" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    user.password = hashedPassword;
    await user.save();

    return res.status(200).json({ 
      message: "Password updated successfully",
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    return res.status(500).json({ message: `Update password failed: ${error.message}` });
  }
};

