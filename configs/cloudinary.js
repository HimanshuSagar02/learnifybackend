import { v2 as cloudinary } from 'cloudinary';
import fs from "fs"

// Validate Cloudinary configuration
const validateCloudinaryConfig = () => {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    
    if (!cloudName || !apiKey || !apiSecret) {
        console.error("❌ Cloudinary Configuration Missing:");
        if (!cloudName) console.error("   - CLOUDINARY_CLOUD_NAME is missing");
        if (!apiKey) console.error("   - CLOUDINARY_API_KEY is missing");
        if (!apiSecret) console.error("   - CLOUDINARY_API_SECRET is missing");
        return false;
    }
    return true;
}

// Configure Cloudinary
const configureCloudinary = () => {
    if (!validateCloudinaryConfig()) {
        return false;
    }
    
    cloudinary.config({ 
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
        api_key: process.env.CLOUDINARY_API_KEY, 
        api_secret: process.env.CLOUDINARY_API_SECRET 
    });
    
    return true;
}

// Initialize configuration
const isConfigured = configureCloudinary();

const uploadOnCloudinary = async(filePath)=>{
    // Check if Cloudinary is configured
    if (!isConfigured) {
        console.error("❌ Cloudinary is not configured. Please check your .env file.");
        return null;
    }
    
    try {
       if(!filePath){
        console.warn("⚠️ No file path provided to uploadOnCloudinary");
        return null
       }
       
       // Check if file exists
       if (!fs.existsSync(filePath)) {
           console.error(`❌ File not found: ${filePath}`);
           return null;
       }
       
       console.log(`📤 Uploading to Cloudinary: ${filePath}`);
       
       const uploadResult = await cloudinary.uploader.upload(filePath,{
           resource_type:'auto',
           chunk_size: 6000000 // 6MB chunks for video uploads
       })
       
       console.log(`✅ Upload successful! URL: ${uploadResult.secure_url}`);
       
       // Clean up local file
       if (fs.existsSync(filePath)) {
           fs.unlinkSync(filePath)
           console.log(`🗑️ Deleted local file: ${filePath}`);
       }
       
       return uploadResult.secure_url
    } catch (error) {
        // Clean up local file even on error
        if (fs.existsSync(filePath)) {
            try {
                fs.unlinkSync(filePath)
            } catch (unlinkError) {
                console.error("Error deleting file:", unlinkError);
            }
        }
        console.error("❌ Cloudinary upload error:", error.message || error);
        console.error("   Error details:", {
            message: error.message,
            http_code: error.http_code,
            name: error.name
        });
        return null;
    }
}

// Test Cloudinary connection
export const testCloudinary = async () => {
    if (!isConfigured) {
        return {
            success: false,
            message: "Cloudinary is not configured. Please check your .env file.",
            details: {
                cloudName: process.env.CLOUDINARY_CLOUD_NAME ? "Set" : "Missing",
                apiKey: process.env.CLOUDINARY_API_KEY ? "Set" : "Missing",
                apiSecret: process.env.CLOUDINARY_API_SECRET ? "Set" : "Missing"
            }
        };
    }
    
    try {
        // Test API connection by getting account details
        const result = await cloudinary.api.ping();
        return {
            success: true,
            message: "Cloudinary is configured and working!",
            status: result.status,
            cloudName: process.env.CLOUDINARY_CLOUD_NAME
        };
    } catch (error) {
        return {
            success: false,
            message: "Cloudinary configuration test failed",
            error: error.message || error,
            details: {
                cloudName: process.env.CLOUDINARY_CLOUD_NAME ? "Set" : "Missing",
                apiKey: process.env.CLOUDINARY_API_KEY ? "Set" : "Missing",
                apiSecret: process.env.CLOUDINARY_API_SECRET ? "Set" : "Missing"
            }
        };
    }
}

export default uploadOnCloudinary