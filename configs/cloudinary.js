import { v2 as cloudinary } from "cloudinary";
import fs from "fs";

const sanitizeEnvValue = (value) =>
  String(value || "")
    .trim()
    .replace(/^['"]+|['"]+$/g, "")
    .trim();

const getCloudinaryEnv = () => ({
  cloudName: sanitizeEnvValue(process.env.CLOUDINARY_CLOUD_NAME),
  apiKey: sanitizeEnvValue(process.env.CLOUDINARY_API_KEY),
  apiSecret: sanitizeEnvValue(process.env.CLOUDINARY_API_SECRET),
});

const getMissingConfigKeys = () => {
  const { cloudName, apiKey, apiSecret } = getCloudinaryEnv();
  const missing = [];
  if (!cloudName) missing.push("CLOUDINARY_CLOUD_NAME");
  if (!apiKey) missing.push("CLOUDINARY_API_KEY");
  if (!apiSecret) missing.push("CLOUDINARY_API_SECRET");
  return missing;
};

let configuredSignature = "";

const ensureCloudinaryConfigured = () => {
  const missing = getMissingConfigKeys();
  if (missing.length > 0) {
    console.error("[Cloudinary] Missing configuration:", missing.join(", "));
    return false;
  }

  const { cloudName, apiKey, apiSecret } = getCloudinaryEnv();
  const nextSignature = `${cloudName}|${apiKey}|${apiSecret}`;
  if (configuredSignature === nextSignature) {
    return true;
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
  });
  configuredSignature = nextSignature;
  return true;
};

const cleanupLocalFile = (filePath) => {
  if (!filePath) return;
  if (!fs.existsSync(filePath)) return;
  try {
    fs.unlinkSync(filePath);
  } catch (error) {
    console.error("[Cloudinary] Failed to delete local file:", error?.message || error);
  }
};

const uploadOnCloudinary = async (filePath) => {
  if (!filePath) {
    console.warn("[Cloudinary] No file path provided");
    return null;
  }

  if (!fs.existsSync(filePath)) {
    console.error(`[Cloudinary] File not found: ${filePath}`);
    return null;
  }

  if (!ensureCloudinaryConfigured()) {
    cleanupLocalFile(filePath);
    return null;
  }

  try {
    const uploadResult = await cloudinary.uploader.upload(filePath, {
      resource_type: "auto",
      chunk_size: 6000000,
    });
    cleanupLocalFile(filePath);
    return uploadResult?.secure_url || null;
  } catch (error) {
    cleanupLocalFile(filePath);
    console.error("[Cloudinary] Upload failed:", {
      message: error?.message,
      http_code: error?.http_code,
      name: error?.name,
    });
    return null;
  }
};

export const testCloudinary = async () => {
  if (!ensureCloudinaryConfigured()) {
    return {
      success: false,
      message: "Cloudinary is not configured correctly",
      missing: getMissingConfigKeys(),
    };
  }

  try {
    const result = await cloudinary.api.ping();
    return {
      success: true,
      message: "Cloudinary is configured and reachable",
      status: result?.status,
    };
  } catch (error) {
    return {
      success: false,
      message: "Cloudinary ping failed",
      error: error?.message || "Unknown error",
    };
  }
};

export default uploadOnCloudinary;
