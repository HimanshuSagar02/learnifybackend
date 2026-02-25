import User from "../models/userModel.js";

const isAdmin = async (req, res, next) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ message: "Authentication required" });
    }
    
    const user = await User.findById(req.userId).select("role");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    if (user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    
    next();
  } catch (error) {
    console.error("isAdmin middleware error:", error);
    return res.status(500).json({ message: `Admin verification failed: ${error.message || error}` });
  }
};

export default isAdmin;

