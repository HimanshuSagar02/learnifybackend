import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { AccessToken } from 'livekit-server-sdk';

// Make the script async
(async () => {

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL;

console.log('\n=== LiveKit Credentials Test ===\n');

// Check if credentials are set
if (!LIVEKIT_API_KEY) {
  console.error('❌ LIVEKIT_API_KEY is not set in .env file');
  process.exit(1);
}

if (!LIVEKIT_API_SECRET) {
  console.error('❌ LIVEKIT_API_SECRET is not set in .env file');
  process.exit(1);
}

if (!LIVEKIT_URL) {
  console.error('❌ LIVEKIT_URL is not set in .env file');
  process.exit(1);
}

console.log('✅ All environment variables are set');
console.log(`   API Key: ${LIVEKIT_API_KEY.substring(0, 10)}... (${LIVEKIT_API_KEY.length} chars)`);
console.log(`   API Secret: ${'*'.repeat(Math.min(LIVEKIT_API_SECRET.length, 20))}... (${LIVEKIT_API_SECRET.length} chars)`);
console.log(`   URL: ${LIVEKIT_URL}\n`);

// Validate API key format (should start with "AP")
if (!LIVEKIT_API_KEY.startsWith('AP')) {
  console.warn('⚠️  Warning: LiveKit API keys typically start with "AP"');
  console.warn('   Your API key might be incorrect or incomplete\n');
}

// Test token generation
try {
  console.log('Testing token generation...');
  
  const at = new AccessToken(LIVEKIT_API_KEY.trim(), LIVEKIT_API_SECRET.trim(), {
    identity: 'test-user-123',
    name: 'Test User',
  });

  // Set TTL (6 hours)
  at.ttl = '6h';

  // Add grant
  at.addGrant({
    room: 'test-room-123',
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    canUpdateOwnMetadata: true,
  });

  // toJwt() returns a Promise<string>
  const token = String(await at.toJwt());
  
  if (!token || token.length === 0) {
    throw new Error('Generated token is empty');
  }

  // Validate token format (JWT should have 3 parts)
  const tokenParts = token.split('.');
  if (tokenParts.length !== 3) {
    throw new Error(`Invalid token format: expected 3 parts, got ${tokenParts.length}`);
  }

  console.log('✅ Token generated successfully!');
  console.log(`   Token length: ${token.length}`);
  console.log(`   Token format: Valid JWT (${tokenParts.length} parts)`);
  console.log(`   Token preview: ${token.substring(0, 50)}...\n`);

  // Try to decode the token (just the header and payload, not verifying signature)
  try {
    const header = JSON.parse(Buffer.from(tokenParts[0], 'base64url').toString());
    const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64url').toString());
    
    console.log('Token decoded successfully:');
    console.log('   Header:', JSON.stringify(header, null, 2));
    console.log('   Payload:', JSON.stringify(payload, null, 2));
    console.log('\n✅ Token structure is valid!\n');
    
    // Check if room name matches
    if (payload.video?.room !== 'test-room-123') {
      console.warn('⚠️  Warning: Room name in token does not match expected value');
    }
    
    // Check expiration
    if (payload.exp) {
      const expDate = new Date(payload.exp * 1000);
      console.log(`   Expires at: ${expDate.toISOString()}`);
      console.log(`   Expires in: ${Math.round((payload.exp - Date.now() / 1000) / 60)} minutes\n`);
    }
    
  } catch (decodeError) {
    console.error('❌ Failed to decode token:', decodeError.message);
    console.error('   This might indicate the token format is incorrect\n');
  }

  console.log('✅ All tests passed! Your LiveKit credentials appear to be valid.');
  console.log('   If you still get "invalid authorization token" errors,');
  console.log('   please verify that the API key and secret match in your LiveKit dashboard.\n');

} catch (error) {
  console.error('❌ Token generation failed:', error.message);
  console.error('\nPossible issues:');
  console.error('   1. API key and secret do not match');
  console.error('   2. API key or secret is incorrect');
  console.error('   3. LiveKit SDK version mismatch');
  console.error('\nError details:', error);
  process.exit(1);
}
})();

