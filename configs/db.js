import mongoose from "mongoose";

// Connection retry configuration
const MAX_RETRIES = 5;
const RETRY_DELAY = 5000; // 5 seconds

const connectDb = async (retryCount = 0) => {
    try {
        // Check if already connected
        if (mongoose.connection.readyState === 1) {
            console.log("✅ MongoDB already connected");
            return;
        }

        if (!process.env.MONGODB_URL) {
            console.error("❌ MONGODB_URL is not configured in environment variables");
            console.error("   Please set MONGODB_URL in your .env file or Render environment variables");
            console.error("   Current NODE_ENV:", process.env.NODE_ENV || "not set");
            console.error("   Available env vars:", Object.keys(process.env).filter(k => k.includes('MONGO')).join(", ") || "none");
            
            // In production, retry after delay
            if (process.env.NODE_ENV === 'production' && retryCount < MAX_RETRIES) {
                console.log(`⏳ Retrying database connection in ${RETRY_DELAY/1000} seconds... (Attempt ${retryCount + 1}/${MAX_RETRIES})`);
                setTimeout(() => connectDb(retryCount + 1), RETRY_DELAY);
            }
            return;
        }
        
        const mongoUrl = process.env.MONGODB_URL.trim();
        
        // Validate connection string format
        if (!mongoUrl.startsWith('mongodb://') && !mongoUrl.startsWith('mongodb+srv://')) {
            console.error("❌ Invalid MONGODB_URL format. Must start with 'mongodb://' or 'mongodb+srv://'");
            return;
        }
        
        console.log("🔌 Attempting to connect to MongoDB...");
        console.log("   Environment:", process.env.NODE_ENV || "development");
        console.log("   Connection string preview:", mongoUrl.substring(0, 30) + "...");
        console.log("   Retry attempt:", retryCount + 1);
        
        // Close existing connection if any
        if (mongoose.connection.readyState !== 0) {
            await mongoose.connection.close();
        }
        
        await mongoose.connect(mongoUrl, {
            serverSelectionTimeoutMS: 30000, // 30 seconds for production
            socketTimeoutMS: 45000,
            connectTimeoutMS: 30000,
            maxPoolSize: 10,
            retryWrites: true,
            w: 'majority'
        });
        
        console.log("✅ DB connected successfully");
        console.log("   Database:", mongoose.connection.name);
        console.log("   Host:", mongoose.connection.host);
        console.log("   Port:", mongoose.connection.port || "default");
        console.log("   Ready State:", mongoose.connection.readyState, "(1=connected)");
        console.log("   Connection ID:", mongoose.connection.id);
        
        // Set up connection event listeners
        mongoose.connection.on('error', (err) => {
            console.error("❌ MongoDB connection error:", err.message || err);
            console.error("   Error code:", err.code);
            console.error("   Error name:", err.name);
        });
        
        mongoose.connection.on('disconnected', () => {
            console.warn("⚠️  MongoDB disconnected");
            console.warn("   Attempting to reconnect...");
            // Auto-reconnect after delay
            setTimeout(() => {
                if (mongoose.connection.readyState === 0) {
                    connectDb(0);
                }
            }, RETRY_DELAY);
        });
        
        mongoose.connection.on('reconnected', () => {
            console.log("✅ MongoDB reconnected successfully");
        });
        
        mongoose.connection.on('connecting', () => {
            console.log("🔄 MongoDB connecting...");
        });
        
        mongoose.connection.on('connected', () => {
            console.log("✅ MongoDB connected event fired");
        });
        
    } catch (error) {
        console.error("❌ DB connection error:", error.message || error);
        console.error("   Error name:", error.name);
        console.error("   Error code:", error.code);
        
        if (error.message) {
            console.error("   Error details:", error.message);
        }
        
        console.error("   Please check:");
        console.error("   1. MONGODB_URL is correct and properly formatted");
        console.error("   2. MongoDB Atlas network access allows your IP (0.0.0.0/0 for all)");
        console.error("   3. Database credentials are correct");
        console.error("   4. MongoDB Atlas cluster is running");
        console.error("   5. Connection string includes database name");
        
        // Retry logic for production
        if (process.env.NODE_ENV === 'production' && retryCount < MAX_RETRIES) {
            console.log(`⏳ Retrying database connection in ${RETRY_DELAY/1000} seconds... (Attempt ${retryCount + 1}/${MAX_RETRIES})`);
            setTimeout(() => connectDb(retryCount + 1), RETRY_DELAY);
        } else if (retryCount >= MAX_RETRIES) {
            console.error("❌ Maximum retry attempts reached. Database connection failed.");
            console.error("   Server will continue running but database operations will fail.");
        }
    }
};

// Helper function to check if database is connected
export const isDbConnected = () => {
    const state = mongoose.connection.readyState;
    const states = {
        0: 'disconnected',
        1: 'connected',
        2: 'connecting',
        3: 'disconnecting'
    };
    console.log(`[DB Check] Connection state: ${state} (${states[state] || 'unknown'})`);
    return state === 1;
};

// Helper function to wait for database connection
export const waitForDb = async (maxWait = 30000) => {
    const startTime = Date.now();
    while (!isDbConnected() && (Date.now() - startTime) < maxWait) {
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    return isDbConnected();
};

export default connectDb;