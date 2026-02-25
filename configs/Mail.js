import nodemailer from "nodemailer"
import dotenv from "dotenv"
dotenv.config()

// Check if email credentials are configured
const emailConfig = {
  service: "Gmail",
  port: 465,
  secure: true, 
  auth: {
    user: process.env.EMAIL,
    pass: process.env.EMAIL_PASS,
  },
};

// Validate email configuration
if (!process.env.EMAIL || !process.env.EMAIL_PASS) {
  console.warn("⚠️  EMAIL or EMAIL_PASS not set in .env file. Email functionality will not work.");
}

const transporter = nodemailer.createTransport(emailConfig);

// Verify connection on startup
transporter.verify(function (error, success) {
  if (error) {
    console.error("❌ Email transporter verification failed:", error.message);
    console.error("Please check your EMAIL and EMAIL_PASS in .env file");
  } else {
    console.log("✅ Email server is ready to send messages");
  }
});


const sendMail=async (to,otp) => {
    if (!process.env.EMAIL || !process.env.EMAIL_PASS) {
        throw new Error("Email configuration missing. Please set EMAIL and EMAIL_PASS in .env file.");
    }
    try {
        const info = await transporter.sendMail({
            from: process.env.EMAIL,
            to: to,
            subject: "Reset Your Password - RCR",
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #333;">Password Reset Request</h2>
                    <p>You requested to reset your password for RCR (RAJ CHEM REACTOR) account.</p>
                    <div style="background-color: #f4f4f4; padding: 15px; border-radius: 5px; margin: 20px 0;">
                        <p style="margin: 0; font-size: 24px; font-weight: bold; color: #000; text-align: center; letter-spacing: 5px;">
                            ${otp}
                        </p>
                    </div>
                    <p>Enter this OTP to reset your password. This code will expire in 5 minutes.</p>
                    <p style="color: #666; font-size: 12px; margin-top: 30px;">
                        If you didn't request this, please ignore this email.
                    </p>
                </div>
            `
        });
        console.log(`✅ OTP email sent to ${to}. Message ID: ${info.messageId}`);
        return info;
    } catch (error) {
        console.error("❌ Error sending email:", error.message);
        if (error.code === 'EAUTH') {
            throw new Error("Email authentication failed. Please check your EMAIL and EMAIL_PASS in .env file.");
        }
        throw error;
    }
}


export default sendMail