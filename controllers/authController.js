import { genToken } from "../configs/token.js"
import validator from "validator"

import bcrypt from "bcryptjs"
import User from "../models/userModel.js"
import mongoose from "mongoose"

import sendMail from "../configs/Mail.js"


export const signUp=async (req,res)=>{
 
    try {

        let {name,email,password,role,class:studentClass,subject}= req.body
        
        // Prevent educator/teacher signup - only students can sign up
        if(role && role !== "student"){
            return res.status(403).json({
                message: "Only students can create accounts. Teachers/Educators are created by administrators. Please contact your administrator or use the login page if you already have an account."
            })
        }
        
        // Force student role
        role = "student"
        
        let existUser= await User.findOne({email})
        if(existUser){
            return res.status(400).json({message:"email already exist"})
        }
        if(!validator.isEmail(email)){
            return res.status(400).json({message:"Please enter valid Email"})
        }
        // Enhanced password validation
        if(password.length < 8){
            return res.status(400).json({message:"Password must be at least 8 characters long"})
        }
        if(!/(?=.*[a-z])/.test(password)){
            return res.status(400).json({message:"Password must contain at least one lowercase letter"})
        }
        if(!/(?=.*[A-Z])/.test(password)){
            return res.status(400).json({message:"Password must contain at least one uppercase letter"})
        }
        if(!/(?=.*\d)/.test(password)){
            return res.status(400).json({message:"Password must contain at least one number"})
        }
        
        // Validate class for students (mandatory)
        if(!studentClass){
            return res.status(400).json({message:"Class/Grade is mandatory for students. Please select 9th, 10th, 11th, 12th, or NEET Dropper"})
        }
        
        let hashPassword = await bcrypt.hash(password,10)
        let user = await User.create({
            name ,
            email ,
            password:hashPassword ,
            role: "student", // Always student
            class: studentClass,
            subject: subject || "",
            status:"pending",
            createdByAdmin:false
            })
        let token = await genToken(user._id)
        
        // Cookie settings - use secure in production
        const isProduction = process.env.NODE_ENV === 'production';
        res.cookie("token",token,{
            httpOnly:true,
            secure: isProduction, // Use secure cookies in production (HTTPS only)
            sameSite: isProduction ? "None" : "Lax", // None for cross-site in production, Lax for development
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        })
        
        // Return user without password
        const userResponse = user.toObject();
        delete userResponse.password;
        return res.status(201).json(userResponse)

    } catch (error) {
        console.log("signUp error")
        return res.status(500).json({message:`signUp Error ${error}`})
    }
}

export const login=async(req,res)=>{
    try {
        let {email,password}= req.body
        
        // Validate input
        if(!email || !password){
            return res.status(400).json({message:"Email and password are required"})
        }
        
        // Normalize email (lowercase, trim)
        email = email.toLowerCase().trim()
        
        console.log(`[Login] Attempting login for email: ${email}`);
        console.log(`[Login] Database connection state: ${mongoose.connection.readyState} (1=connected)`);
        
        // Try multiple query methods to find user (case-insensitive)
        // IMPORTANT: Don't use .lean() because we need to save the user later
        let user = null;
        
        // Method 1: Exact match (lowercase)
        user = await User.findOne({email: email});
        console.log(`[Login] Query method 1 (exact lowercase): ${user ? 'Found' : 'Not found'}`);
        
        // Method 2: Case-insensitive regex if first method fails
        if (!user) {
            user = await User.findOne({email: { $regex: new RegExp(`^${email}$`, 'i') }});
            console.log(`[Login] Query method 2 (case-insensitive regex): ${user ? 'Found' : 'Not found'}`);
        }
        
        // Method 3: Try with any case variations
        if (!user) {
            // Get all users and check manually (fallback)
            const allUsers = await User.find({}).select('email').lean();
            console.log(`[Login] Total users in database: ${allUsers.length}`);
            const matchingUser = allUsers.find(u => u.email && u.email.toLowerCase() === email);
            if (matchingUser) {
                // Query again WITHOUT .lean() to get Mongoose document
                user = await User.findOne({email: matchingUser.email});
                console.log(`[Login] Query method 3 (manual match): Found user with email: ${matchingUser.email}`);
            }
        }
        
        if(!user){
            console.log(`[Login] User not found after all query methods: ${email}`);
            // Try to get sample emails for debugging
            try {
                const sampleUsers = await User.find({}).limit(3).select('email').lean();
                console.log(`[Login] Sample emails in database:`, sampleUsers.map(u => u.email));
            } catch (e) {
                console.error(`[Login] Error getting sample users:`, e);
            }
            return res.status(400).json({message:"User does not exist"})
        }
        
        console.log(`[Login] User found - ID: ${user._id}, Email: ${user.email}, Status: ${user.status}, Role: ${user.role}`);
        console.log(`[Login] User has password: ${!!(user.password && user.password.trim())}`);
        console.log(`[Login] User is Mongoose document: ${user instanceof mongoose.Document}`);
        
        // Check account status
        if(user.status === "pending"){
            console.log(`[Login] Account pending approval: ${email}`);
            return res.status(403).json({message:"Account pending approval by admin"})
        }
        if(user.status === "rejected"){
            console.log(`[Login] Account rejected: ${email}`);
            return res.status(403).json({message:"Account rejected by admin"})
        }
        
        // Check if user has a password
        if(!user.password || user.password.trim() === ''){
            console.log(`[Login] User has no password set: ${email}`);
            console.log(`[Login] User password field:`, user.password ? "exists but empty" : "null/undefined");
            return res.status(400).json({
                message:"This account does not have a password set. Please use 'Forgot Password' to set a password, or contact admin.",
                needsPasswordReset: true
            })
        }
        
        // Verify password
        console.log(`[Login] Comparing password for: ${email}`);
        console.log(`[Login] Password hash length: ${user.password.length}`);
        console.log(`[Login] Password hash preview: ${user.password.substring(0, 20)}...`);
        
        let isMatch = false;
        try {
            isMatch = await bcrypt.compare(password, user.password);
            console.log(`[Login] Password comparison result: ${isMatch}`);
        } catch (compareError) {
            console.error(`[Login] Password comparison error:`, compareError);
            return res.status(500).json({
                message:"Error verifying password. Please try again.",
                error: process.env.NODE_ENV === 'development' ? compareError.message : undefined
            })
        }
        
        if(!isMatch){
            console.log(`[Login] Incorrect password for: ${email}`);
            return res.status(400).json({message:"Incorrect password"})
        }
        
        // Update last login - user is a Mongoose document, so save() will work
        try {
            user.lastLoginAt = new Date();
            await user.save();
            console.log(`[Login] Last login time updated successfully`);
        } catch (saveError) {
            console.error(`[Login] Error saving last login time:`, saveError);
            // Don't fail login if save fails, just log the error
        }
        
        // Generate token
        let token;
        try {
            token = await genToken(user._id);
            console.log(`[Login] Token generated successfully for: ${email}`);
        } catch (tokenError) {
            console.error(`[Login] Token generation failed:`, tokenError);
            return res.status(500).json({
                message: "Failed to generate authentication token",
                error: process.env.NODE_ENV === 'development' ? tokenError.message : undefined
            });
        }
        
        // Cookie settings - use secure in production
        const isProduction = process.env.NODE_ENV === 'production';
        const cookieOptions = {
            httpOnly: true,
            secure: isProduction, // Use secure cookies in production (HTTPS only)
            sameSite: isProduction ? "None" : "Lax", // None for cross-site in production, Lax for development
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            path: "/", // Ensure cookie is available for all paths
        };
        
        // Only set domain for production if explicitly needed and known, otherwise let browser handle
        if (isProduction && process.env.COOKIE_DOMAIN) {
            cookieOptions.domain = process.env.COOKIE_DOMAIN;
        }
        
        // Set cookie
        res.cookie("token", token, cookieOptions);
        console.log(`[Login] Cookie set - secure: ${cookieOptions.secure}, sameSite: ${cookieOptions.sameSite}, path: ${cookieOptions.path}`);
        
        // Return user without password
        const userResponse = user.toObject();
        delete userResponse.password;
        
        console.log(`[Login] Login successful for: ${email}, Role: ${user.role}, UserID: ${user._id}`);
        return res.status(200).json(userResponse)

    } catch (error) {
        console.error("[Login] Login error:", error);
        console.error("[Login] Error stack:", error.stack);
        console.error("[Login] Error details:", {
            message: error.message,
            name: error.name,
            email: req.body?.email,
            code: error.code,
            errno: error.errno
        });
        
        // More specific error messages
        let errorMessage = "Login failed. Please try again.";
        if (error.message) {
            if (error.message.includes("JWT_SECRET")) {
                errorMessage = "Server configuration error. Please contact administrator.";
            } else if (error.message.includes("database") || error.message.includes("connection")) {
                errorMessage = "Database connection error. Please try again later.";
            } else if (error.message.includes("token")) {
                errorMessage = "Authentication error. Please try again.";
            } else {
                errorMessage = error.message;
            }
        }
        
        return res.status(500).json({
            message: errorMessage,
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
}




export const logOut = async(req,res)=>{
    try {
        await res.clearCookie("token")
        return res.status(200).json({message:"logOut Successfully"})
    } catch (error) {
        return res.status(500).json({message:`logout Error ${error}`})
    }
}


export const googleSignup = async (req,res) => {
    try {
        const {name , email , role, photoUrl, class: studentClass, subject} = req.body
        
        if (!email) {
            return res.status(400).json({message:"Email is required"})
        }
        
        // Prevent educator/teacher signup - only students can sign up
        if(role && role !== "student"){
            return res.status(403).json({
                message: "Only students can create accounts. Teachers/Educators are created by administrators. Please contact your administrator or use the login page if you already have an account."
            })
        }
        
        // Force student role
        const userRole = "student"
        
        // Validate class for students (mandatory)
        if(!studentClass){
            return res.status(400).json({message:"Class/Grade is mandatory for students. Please select 9th, 10th, 11th, 12th, or NEET Dropper"})
        }
        
        let user = await User.findOne({email})
        
        if(!user){
            // New user - always create as student
            user = await User.create({
                name: name || "User",
                email,
                role: "student", // Always student
                photoUrl: photoUrl || "",
                class: studentClass,
                subject: subject || "",
                status: "approved", // Auto-approve Google signups
                createdByAdmin: false
            })
        } else {
            // Existing user - update last login and photo if provided
            user.lastLoginAt = new Date()
            if (photoUrl && !user.photoUrl) {
                user.photoUrl = photoUrl
            }
            if (name && user.name !== name) {
                user.name = name
            }
            await user.save()
        }
        
        // Check account status
        if(user.status === "pending"){
            return res.status(403).json({message:"Account pending approval by admin"})
        }
        if(user.status === "rejected"){
            return res.status(403).json({message:"Account rejected by admin"})
        }
        
        let token = await genToken(user._id)
        
        // Cookie settings - use secure in production
        const isProduction = process.env.NODE_ENV === 'production';
        const cookieOptions = {
            httpOnly: true,
            secure: isProduction, // Use secure cookies in production (HTTPS only)
            sameSite: isProduction ? "None" : "Lax", // None for cross-site in production, Lax for development
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            path: "/", // Ensure cookie is available for all paths
        };
        
        // Only set domain for production if explicitly needed and known, otherwise let browser handle
        if (isProduction && process.env.COOKIE_DOMAIN) {
            cookieOptions.domain = process.env.COOKIE_DOMAIN;
        }
        
        // Set cookie
        res.cookie("token", token, cookieOptions);
        console.log(`[GoogleSignup] Cookie set - secure: ${cookieOptions.secure}, sameSite: ${cookieOptions.sameSite}, path: ${cookieOptions.path}`);
        
        // Return user without password
        const userResponse = user.toObject()
        delete userResponse.password
        return res.status(200).json(userResponse)

    } catch (error) {
        console.error("Google signup error:", error)
        return res.status(500).json({message:`Google signup error: ${error.message}`})
    }
}

export const sendOtp = async (req,res) => {
    try {
        const {email} = req.body
        
        if(!email){
            return res.status(400).json({message:"Email is required"})
        }
        
        // Normalize email
        const normalizedEmail = email.toLowerCase().trim();
        console.log(`[SendOTP] Request for email: ${normalizedEmail}`);
        
        // Try to find user with case-insensitive search
        let user = await User.findOne({email: normalizedEmail});
        
        // If not found, try case-insensitive regex
        if (!user) {
            user = await User.findOne({email: { $regex: new RegExp(`^${normalizedEmail}$`, 'i') }});
        }
        
        if(!user){
            console.log(`[SendOTP] User not found: ${normalizedEmail}`);
            return res.status(200).json({
                message: "If an account exists for this email, OTP has been sent."
            })
        }
        
        console.log(`[SendOTP] User found: ${user.email}, Generating OTP...`);
        const otp = Math.floor(1000 + Math.random() * 9000).toString()

        user.resetOtp = otp;
        user.otpExpires = Date.now() + 5*60*1000; // 5 minutes
        user.isOtpVerifed = false;

        await user.save()
        console.log(`[SendOTP] OTP saved for user: ${user.email}, OTP: ${otp}`);
        
        // Check email configuration BEFORE attempting to send
        if (!process.env.EMAIL || !process.env.EMAIL_PASS) {
            console.error("[SendOTP] Email configuration missing - EMAIL or EMAIL_PASS not set");
            console.error("[SendOTP] EMAIL:", process.env.EMAIL ? "Set" : "Missing");
            console.error("[SendOTP] EMAIL_PASS:", process.env.EMAIL_PASS ? "Set" : "Missing");
            
            // In development mode, return OTP in response so user can test
            const isDevelopment = !process.env.NODE_ENV || process.env.NODE_ENV === 'development';
            
            if (isDevelopment) {
                console.log(`\n🔑 [SendOTP] DEVELOPMENT MODE - OTP for ${normalizedEmail}: ${otp}`);
                console.log(`[SendOTP] In production, configure EMAIL and EMAIL_PASS to send emails\n`);
                
                return res.status(200).json({
                    message: `OTP generated successfully. In development mode, OTP is: ${otp}`,
                    otp: otp,
                    hint: "Configure EMAIL and EMAIL_PASS in .env to send emails in production"
                });
            }
            
            return res.status(500).json({
                message: "Email service is not configured. Please contact administrator.",
                hint: "EMAIL and EMAIL_PASS environment variables are required"
            });
        }
        
        try {
            console.log(`[SendOTP] Attempting to send email to: ${normalizedEmail}`);
            await sendMail(normalizedEmail, otp)
            console.log(`[SendOTP] Email sent successfully to: ${normalizedEmail}`);
            return res.status(200).json({
                message: "OTP sent successfully to your email. Please check your inbox (and spam folder)."
            })
        } catch (mailError) {
            console.error("[SendOTP] Email send error:", mailError);
            console.error("[SendOTP] Error details:", {
                message: mailError.message,
                code: mailError.code,
                response: mailError.response
            });
            
            // In development, return OTP so user can still test
            const isDevelopment = !process.env.NODE_ENV || process.env.NODE_ENV === 'development';
            
            if (isDevelopment) {
                console.log(`\n🔑 [SendOTP] DEVELOPMENT MODE - Email failed but OTP for ${normalizedEmail}: ${otp}`);
                console.log(`[SendOTP] Check console logs for OTP\n`);
                
                return res.status(200).json({
                    message: `Email sending failed, but OTP generated. In development mode, OTP is: ${otp}`,
                    otp: otp,
                    error: mailError.message,
                    hint: "Configure EMAIL and EMAIL_PASS correctly to send emails"
                });
            }
            
            return res.status(500).json({
                message: "Failed to send email. Please check your email configuration or try again later.",
                error: process.env.NODE_ENV === 'development' ? mailError.message : undefined
            });
        }
    } catch (error) {
        console.error("[SendOTP] Error:", error);
        return res.status(500).json({message:`Send OTP error: ${error.message}`})
    }
}

export const verifyOtp = async (req,res) => {
    try {
        const {email, otp} = req.body
        
        if(!email || !otp){
            return res.status(400).json({message:"Email and OTP are required"})
        }
        
        // Normalize email
        const normalizedEmail = email.toLowerCase().trim();
        console.log(`[VerifyOTP] Verifying OTP for email: ${normalizedEmail}`);
        
        // Try to find user with case-insensitive search
        let user = await User.findOne({email: normalizedEmail});
        
        // If not found, try case-insensitive regex
        if (!user) {
            user = await User.findOne({email: { $regex: new RegExp(`^${normalizedEmail}$`, 'i') }});
        }
        
        if(!user){
            console.log(`[VerifyOTP] User not found: ${normalizedEmail}`);
            return res.status(404).json({message:"User not found with this email address"})
        }
        
        console.log(`[VerifyOTP] User found: ${user.email}, Checking OTP...`);
        
        if(!user.resetOtp){
            console.log(`[VerifyOTP] No OTP found for user: ${user.email}`);
            return res.status(400).json({message:"No OTP found. Please request a new OTP."})
        }
        
        if(user.resetOtp !== otp){
            console.log(`[VerifyOTP] Invalid OTP for user: ${user.email}. Expected: ${user.resetOtp}, Received: ${otp}`);
            return res.status(400).json({message:"Invalid OTP. Please check and try again."})
        }
        
        if(user.otpExpires < Date.now()){
            console.log(`[VerifyOTP] OTP expired for user: ${user.email}. Expires: ${new Date(user.otpExpires)}, Now: ${new Date()}`);
            return res.status(400).json({message:"OTP has expired. Please request a new OTP."})
        }
        
        user.isOtpVerifed = true;
        // Keep OTP until password is reset
        await user.save();
        console.log(`[VerifyOTP] OTP verified successfully for: ${user.email}`);
        
        return res.status(200).json({message:"OTP verified successfully. You can now reset your password."})

    } catch (error) {
        console.error("[VerifyOTP] Error:", error);
        return res.status(500).json({message:`Verify OTP error: ${error.message}`})
    }
}

export const resetPassword = async (req,res) => {
    try {
        const {email ,password } =  req.body
        if(!email || !password){
            return res.status(400).json({message:"Email and password are required"})
        }
        if(password.length < 6){
            return res.status(400).json({message:"Password must be at least 6 characters"})
        }
        
        const normalizedEmail = email.toLowerCase().trim();
        const user = await User.findOne({email: normalizedEmail})
        
        if(!user){
            return res.status(404).json({message:"User not found"})
        }
        
        // Allow password reset if OTP verified OR if user has no password (first time setup)
        const hasNoPassword = !user.password || user.password.trim() === '';
        
        if(!hasNoPassword && !user.isOtpVerifed){
            return res.status(400).json({message:"OTP verification required. Please verify OTP first."})
        }

        console.log(`[ResetPassword] Setting password for: ${normalizedEmail}, HasNoPassword: ${hasNoPassword}, OTPVerified: ${user.isOtpVerifed}`);

        const hashPassword = await bcrypt.hash(password,10)
        user.password = hashPassword
        user.isOtpVerifed=false
        user.resetOtp=undefined
        user.otpExpires=undefined
        await user.save()
        
        console.log(`[ResetPassword] Password reset successfully for: ${normalizedEmail}`);
        return res.status(200).json({message:"Password Reset Successfully"})
    } catch (error) {
        console.error("[ResetPassword] Reset password error:", error);
        return res.status(500).json({message:`Reset Password error: ${error.message}`})
    }
}
