import multer from "multer";
import fs from "fs";
import path from "path";

// Ensure public directory exists
const publicDir = "./public";
if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
}

let storage = multer.diskStorage({
    destination:(req,file,cb)=>{
        cb(null, publicDir)
    },
    filename:(req,file,cb)=>{
        // Generate unique filename to avoid conflicts
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        const name = path.basename(file.originalname, ext);
        cb(null, `${name}-${uniqueSuffix}${ext}`)
    }
})

const upload = multer({
    storage,
    limits: {
        fileSize: 500 * 1024 * 1024 // 500MB limit for videos
    }
})

export default upload