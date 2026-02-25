import jwt from "jsonwebtoken"

// Enhanced token generation with security options
export const genToken = async (userId) => {
    try {
        if (!process.env.JWT_SECRET) {
            throw new Error("JWT_SECRET is not configured");
        }
        
        if (!userId) {
            throw new Error("User ID is required for token generation");
        }
        
        const token = jwt.sign(
            { 
                userId,
                iat: Math.floor(Date.now() / 1000) // Issued at time
            }, 
            process.env.JWT_SECRET, 
            {
                expiresIn: "7d",
                issuer: "rcr-platform",
                audience: "rcr-users"
            }
        );
        
        return token;
    } catch (error) {
        console.error("[Token] Token generation error:", error);
        throw error;
    }
}

// Verify token with enhanced security
export const verifyToken = (token) => {
    try {
        if (!process.env.JWT_SECRET) {
            throw new Error("JWT_SECRET is not configured");
        }
        
        const decoded = jwt.verify(token, process.env.JWT_SECRET, {
            issuer: "rcr-platform",
            audience: "rcr-users"
        });
        
        return decoded;
    } catch (error) {
        if (error.name === "TokenExpiredError") {
            throw new Error("Token has expired");
        }
        if (error.name === "JsonWebTokenError") {
            throw new Error("Invalid token");
        }
        throw error;
    }
}