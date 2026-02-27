import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const toBool = (value, fallback = false) => {
  if (typeof value === "boolean") return value;
  const normalized = String(value || "").trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
};

const EMAIL_USER = String(
  process.env.EMAIL || process.env.SMTP_USER || process.env.MAIL_USER || ""
).trim();
const EMAIL_PASS = String(
  process.env.EMAIL_PASS ||
    process.env.SMTP_PASS ||
    process.env.MAIL_PASS ||
    process.env.GMAIL_APP_PASSWORD ||
    ""
).trim();
const SMTP_HOST = String(process.env.SMTP_HOST || "smtp.gmail.com").trim();
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_SECURE = toBool(process.env.SMTP_SECURE, SMTP_PORT === 465);
const MAIL_FROM = String(process.env.EMAIL_FROM || EMAIL_USER).trim();
const MAIL_TIMEOUT_MS = 15000;
const isEmailConfigured = Boolean(EMAIL_USER && EMAIL_PASS);

if (!isEmailConfigured) {
  console.warn("EMAIL or EMAIL_PASS not set in .env file. Email functionality will not work.");
}

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: Number.isFinite(SMTP_PORT) ? SMTP_PORT : 465,
  secure: SMTP_SECURE,
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS,
  },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 15000,
  dnsTimeout: 10000,
});

if (isEmailConfigured) {
  transporter.verify((error) => {
    if (error) {
      console.error("Email transporter verification failed:", error.message);
      console.error("Please check your EMAIL and EMAIL_PASS in .env file");
    } else {
      console.log("Email server is ready to send messages");
    }
  });
}

const sendMail = async (to, otp) => {
  if (!isEmailConfigured) {
    throw new Error("Email configuration missing. Please set EMAIL and EMAIL_PASS in .env file.");
  }

  let timeoutId;
  try {
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error("Email service timeout. Please try again in a moment."));
      }, MAIL_TIMEOUT_MS);
    });

    const sendPromise = transporter.sendMail({
      from: `"Learnify" <${MAIL_FROM}>`,
      to,
      subject: "Reset Your Password - Learnify",
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Password Reset Request</h2>
          <p>You requested to reset your password for Learnify account.</p>
          <div style="background-color: #f4f4f4; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 0; font-size: 24px; font-weight: bold; color: #000; text-align: center; letter-spacing: 5px;">
              ${otp}
            </p>
          </div>
          <p>Enter this OTP to reset your password. This code will expire in 5 minutes.</p>
          <p style="color: #666; font-size: 12px; margin-top: 30px;">
            If you did not request this, please ignore this email.
          </p>
        </div>
      `,
    });

    const info = await Promise.race([sendPromise, timeoutPromise]);
    clearTimeout(timeoutId);

    console.log(`OTP email sent to ${to}. Message ID: ${info.messageId}`);
    return info;
  } catch (error) {
    clearTimeout(timeoutId);

    console.error("Error sending email:", error.message);

    if (error.code === "EAUTH") {
      throw new Error("Email authentication failed. Check EMAIL/EMAIL_PASS or SMTP credentials.");
    }

    if (error.code === "ETIMEDOUT" || /timeout/i.test(String(error.message || ""))) {
      throw new Error("Email service timed out. Please try again.");
    }

    if (error.code === "ECONNECTION" || error.code === "ESOCKET") {
      throw new Error("Unable to connect to email service. Please try again later.");
    }

    throw error;
  }
};

export default sendMail;
