import { AccessToken } from 'livekit-server-sdk';

// LiveKit configuration - all values should come from environment variables
// No hardcoded defaults for production deployment
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';
const LIVEKIT_URL = process.env.LIVEKIT_URL || '';

/**
 * Generate LiveKit access token for a user
 * @param {string} roomName - Name of the room
 * @param {string} participantName - Name of the participant
 * @param {string} participantIdentity - Unique identity (usually user ID)
 * @param {boolean} isEducator - Whether the participant is an educator (can publish)
 * @returns {string} Access token
 */
export const generateLiveKitToken = async (roomName, participantName, participantIdentity, isEducator = false) => {
  // Validate required parameters
  if (!LIVEKIT_API_KEY || LIVEKIT_API_KEY.trim() === '') {
    throw new Error("LIVEKIT_API_KEY is not configured");
  }
  if (!LIVEKIT_API_SECRET || LIVEKIT_API_SECRET.trim() === '') {
    throw new Error("LIVEKIT_API_SECRET is not configured. Please add it to your .env file");
  }
  if (!roomName || roomName.trim() === '') {
    throw new Error("Room name is required");
  }
  if (!participantIdentity || String(participantIdentity).trim() === '') {
    throw new Error("Participant identity is required");
  }

  // Sanitize room name - LiveKit room names must be alphanumeric, hyphens, underscores only
  // Remove any special characters and ensure it's valid
  let sanitizedRoomName = String(roomName)
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
    .substring(0, 100);
  
  if (!sanitizedRoomName || sanitizedRoomName.length === 0) {
    sanitizedRoomName = `room-${Date.now()}`;
  }
  
  // Sanitize identity - must be a valid string, no spaces
  let sanitizedIdentity = String(participantIdentity)
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_') // Replace multiple underscores with single
    .replace(/^_|_$/g, '') // Remove leading/trailing underscores
    .substring(0, 100);
  
  if (!sanitizedIdentity || sanitizedIdentity.length === 0) {
    sanitizedIdentity = `user-${Date.now()}`;
  }
  
  // Sanitize name - can have spaces but no special chars
  const sanitizedName = (participantName || sanitizedIdentity)
    .replace(/[^a-zA-Z0-9_\s-]/g, '')
    .replace(/\s+/g, ' ') // Replace multiple spaces with single
    .trim()
    .substring(0, 100) || sanitizedIdentity;

  console.log(`[LiveKit] Generating token - Room: ${sanitizedRoomName}, Identity: ${sanitizedIdentity}, Name: ${sanitizedName}`);
  console.log(`[LiveKit] API Key: ${LIVEKIT_API_KEY.substring(0, 10)}..., Secret: ${LIVEKIT_API_SECRET ? 'Set (' + LIVEKIT_API_SECRET.length + ' chars)' : 'Missing'}`);

  try {
    // Create token with explicit expiration (6 hours from now)
    const at = new AccessToken(LIVEKIT_API_KEY.trim(), LIVEKIT_API_SECRET.trim(), {
      identity: sanitizedIdentity,
      name: sanitizedName,
    });

    // Set token expiration (6 hours = 21600 seconds)
    // LiveKit expects TTL in seconds or as a string like '6h'
    at.ttl = '6h';

    // Add grant with all necessary permissions
    const grant = {
      room: sanitizedRoomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      canUpdateOwnMetadata: true,
    };
    
    at.addGrant(grant);

    // toJwt() returns a Promise<string>, so we need to await it
    let token = await at.toJwt();
    
    // Ensure token is a string
    token = String(token);
    
    if (!token || token.length === 0) {
      throw new Error("Generated token is empty");
    }
    
    // Validate token format (JWT should have 3 parts separated by dots)
    const tokenParts = token.split('.');
    if (tokenParts.length !== 3) {
      console.error(`[LiveKit] Invalid token format - Token value:`, token);
      console.error(`[LiveKit] Token type:`, typeof token);
      console.error(`[LiveKit] Token parts count:`, tokenParts.length);
      throw new Error(`Invalid token format: expected 3 parts, got ${tokenParts.length}`);
    }
    
    console.log(`[LiveKit] Token generated successfully:`);
    console.log(`  - Length: ${token.length}`);
    console.log(`  - Room: ${sanitizedRoomName}`);
    console.log(`  - Identity: ${sanitizedIdentity}`);
    console.log(`  - Name: ${sanitizedName}`);
    console.log(`  - Token preview: ${token.substring(0, 50)}...`);
    
    return token;
  } catch (error) {
    console.error("[LiveKit] Token generation error:", error);
    console.error("[LiveKit] Error details:", {
      message: error.message,
      stack: error.stack,
      apiKey: LIVEKIT_API_KEY ? `${LIVEKIT_API_KEY.substring(0, 10)}... (${LIVEKIT_API_KEY.length} chars)` : "Missing",
      apiSecret: LIVEKIT_API_SECRET ? `Set (${LIVEKIT_API_SECRET.length} chars)` : "Missing",
      roomName: sanitizedRoomName,
      identity: sanitizedIdentity,
      url: LIVEKIT_URL
    });
    throw new Error(`Failed to generate LiveKit token: ${error.message}`);
  }
};

export const getLiveKitURL = () => LIVEKIT_URL;

export default {
  generateLiveKitToken,
  getLiveKitURL,
};

