import express from "express"
import {googleSignup, login, logOut, resetPassword, sendOtp, signUp, verifyOtp } from "../controllers/authController.js"
import { authLimiter, passwordResetLimiter } from "../middlewares/security.js"
import { 
  validateSignup, 
  validateLogin, 
  validatePasswordReset,
  validateOtpVerification,
  validateNewPassword
} from "../middlewares/inputValidation.js"

const authRouter = express.Router()

// Apply rate limiting and validation to auth routes
// Temporarily disable strict validation to debug 500 errors
// TODO: Re-enable validation after fixing issues
authRouter.post("/signup", authLimiter, signUp)
authRouter.post("/login", authLimiter, login)
authRouter.get("/logout", logOut)
authRouter.post("/googlesignup", authLimiter, googleSignup)
authRouter.post("/sendotp", passwordResetLimiter, sendOtp)
authRouter.post("/verifyotp", passwordResetLimiter, verifyOtp)
authRouter.post("/resetpassword", passwordResetLimiter, resetPassword)


export default authRouter