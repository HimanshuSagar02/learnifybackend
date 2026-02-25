import express from "express";
import bcrypt from "bcryptjs";
import User from "../models/userModel.js";

const router = express.Router();

// One-time endpoint to create first admin (only works if no admin exists)
router.post("/create-first-admin", async (req, res) => {
  try {
    // Check if any admin exists
    const existingAdmin = await User.findOne({ role: "admin" });
    if (existingAdmin) {
      return res.status(403).json({ 
        message: "Admin account already exists. Use /api/admin/users to create more admins." 
      });
    }

    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ 
        message: "Name, email, and password are required" 
      });
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const admin = await User.create({
      name,
      email,
      password: hashedPassword,
      role: "admin",
      status: "approved",
      createdByAdmin: true,
    });

    return res.status(201).json({
      message: "First admin account created successfully!",
      admin: {
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: `Create admin failed: ${error.message}` });
  }
});

export default router;

