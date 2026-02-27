import nodemailer from "nodemailer";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const toBool = (value, fallback = false) => {
  if (typeof value === "boolean") return value;
  const normalized = String(value || "").trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
};

const EMAIL = String(process.env.EMAIL || "").trim();
const EMAIL_PASS = String(process.env.EMAIL_PASS || "").trim();
const SMTP_HOST = String(process.env.SMTP_HOST || "smtp.gmail.com").trim();
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_SECURE = toBool(process.env.SMTP_SECURE, SMTP_PORT === 465);
const MAIL_FROM = String(process.env.EMAIL_FROM || EMAIL).trim();

const SEND_GRID_API_KEY = String(
  process.env.SEND_GRID_API_KEY || process.env.SENDGRID_API_KEY || ""
).trim();
const SEND_GRID_FROM_EMAIL = String(
  process.env.SEND_GRID_FROM_EMAIL || process.env.EMAIL_FROM || EMAIL || ""
).trim();
const SEND_GRID_FROM_NAME = String(process.env.SEND_GRID_FROM_NAME || "Learnify").trim();

const MAIL_TIMEOUT_MS = 15000;

const isSendGridConfigured = Boolean(SEND_GRID_API_KEY && SEND_GRID_FROM_EMAIL);
const isSmtpConfigured = Boolean(EMAIL && EMAIL_PASS);
const activeMailProvider = isSendGridConfigured ? "sendgrid" : isSmtpConfigured ? "smtp" : "none";

export const isMailConfigured = activeMailProvider !== "none";
export const getMailProvider = () => activeMailProvider;

if (!isMailConfigured) {
  console.warn(
    "Email provider not configured. Set SEND_GRID_API_KEY (+ EMAIL as sender) or EMAIL + EMAIL_PASS."
  );
} else {
  console.log(`[Mail] Active provider: ${activeMailProvider}`);
}

const smtpTransporter = isSmtpConfigured
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number.isFinite(SMTP_PORT) ? SMTP_PORT : 465,
      secure: SMTP_SECURE,
      auth: {
        user: EMAIL,
        pass: EMAIL_PASS,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
      dnsTimeout: 10000,
    })
  : null;

if (activeMailProvider === "smtp" && smtpTransporter) {
  smtpTransporter.verify((error) => {
    if (error) {
      console.error("SMTP transporter verification failed:", error.message);
      console.error("Please check EMAIL and EMAIL_PASS in .env file");
    } else {
      console.log("SMTP email server is ready to send messages");
    }
  });
}

const getOtpHtml = (otp) => `
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
`;

const sendViaSendGrid = async (to, otp) => {
  const response = await axios.post(
    "https://api.sendgrid.com/v3/mail/send",
    {
      personalizations: [{ to: [{ email: to }] }],
      from: {
        email: SEND_GRID_FROM_EMAIL,
        name: SEND_GRID_FROM_NAME || "Learnify",
      },
      subject: "Reset Your Password - Learnify",
      content: [{ type: "text/html", value: getOtpHtml(otp) }],
    },
    {
      timeout: MAIL_TIMEOUT_MS,
      headers: {
        Authorization: `Bearer ${SEND_GRID_API_KEY}`,
        "Content-Type": "application/json",
      },
      validateStatus: () => true,
    }
  );

  if (response.status < 200 || response.status >= 300) {
    const apiErrors = Array.isArray(response.data?.errors)
      ? response.data.errors
          .map((item) => String(item?.message || "").trim())
          .filter(Boolean)
          .join("; ")
      : "";

    const error = new Error(`SendGrid request failed (${response.status}). ${apiErrors}`.trim());
    error.code = "SENDGRID_API_ERROR";
    throw error;
  }

  const messageId = response.headers?.["x-message-id"] || "n/a";
  console.log(`OTP email sent to ${to} via SendGrid. Message ID: ${messageId}`);
  return { messageId };
};

const sendViaSmtp = async (to, otp) => {
  if (!smtpTransporter) {
    throw new Error("SMTP transporter is not initialized.");
  }

  let timeoutId;
  try {
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error("Email service timeout. Please try again in a moment."));
      }, MAIL_TIMEOUT_MS);
    });

    const sendPromise = smtpTransporter.sendMail({
      from: `"Learnify" <${MAIL_FROM}>`,
      to,
      subject: "Reset Your Password - Learnify",
      html: getOtpHtml(otp),
    });

    const info = await Promise.race([sendPromise, timeoutPromise]);
    console.log(`OTP email sent to ${to} via SMTP. Message ID: ${info.messageId}`);
    return info;
  } finally {
    clearTimeout(timeoutId);
  }
};

const sendMail = async (to, otp) => {
  if (!isMailConfigured) {
    throw new Error("Email configuration missing. Set SEND_GRID_API_KEY or EMAIL + EMAIL_PASS.");
  }

  try {
    if (activeMailProvider === "sendgrid") {
      return await sendViaSendGrid(to, otp);
    }

    return await sendViaSmtp(to, otp);
  } catch (error) {
    console.error("Error sending email:", error.message);

    if (activeMailProvider === "smtp" && error.code === "EAUTH") {
      throw new Error("SMTP authentication failed. Check EMAIL and EMAIL_PASS.");
    }

    if (
      error.code === "ETIMEDOUT" ||
      error.code === "ECONNABORTED" ||
      /timeout/i.test(String(error.message || ""))
    ) {
      throw new Error("Email service timed out. Please try again.");
    }

    if (
      error.code === "ECONNECTION" ||
      error.code === "ESOCKET" ||
      error.code === "ENOTFOUND"
    ) {
      throw new Error("Unable to connect to email service. Please try again later.");
    }

    if (activeMailProvider === "sendgrid" && error.code === "SENDGRID_API_ERROR") {
      if (/401|403/.test(String(error.message || ""))) {
        throw new Error("SendGrid authentication failed. Check SEND_GRID_API_KEY.");
      }
      throw new Error(`SendGrid email failed. ${error.message}`);
    }

    throw error;
  }
};

export default sendMail;
