const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

const client = jwksClient({
  jwksUri: 'https://appleid.apple.com/auth/keys',
  cache: true,
  rateLimit: true,
  jwksRequestsPerMin: 5
});

/**
 * Fetch the signing key from Apple's JWKS endpoint based on the kid in token header.
 */
function getApplePublicKey(header, callback) {
  client.getSigningKey(header.kid, function (err, key) {
    if (err) {
      console.error('[AppleAuth] Error fetching signing key:', err);
      return callback(err);
    }
    const signingKey = key.getPublicKey();
    callback(null, signingKey);
  });
}

/**
 * Verifies the Apple identity token JWT and returns its decoded payload.
 * @param {string} identityToken - JWT token from Apple Authentication
 * @returns {Promise<Object>} Decoded Apple token payload
 */
function verifyAppleIdToken(identityToken) {
  return new Promise((resolve, reject) => {
    jwt.verify(
      identityToken,
      getApplePublicKey,
      {
        algorithms: ['RS256'],
        issuer: 'https://appleid.apple.com',
        audience: 'com.pixflow.resumeok' // iOS app bundle ID
      },
      (err, decoded) => {
        if (err) {
          console.error('[AppleAuth] Token verification failed:', err);
          return reject(err);
        }
        resolve(decoded);
      }
    );
  });
}

module.exports = {
  verifyAppleIdToken
};
