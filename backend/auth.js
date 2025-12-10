const https = require('https');

/**
 * Verifies the Google Access Token.
 * Returns the user info if valid, throws error otherwise.
 * @param {string} token - The access token
 * @returns {Promise<object>} User info (sub, email, etc.)
 */
async function verifyToken(token) {
    return new Promise((resolve, reject) => {
        const url = `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${token}`;

        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    try {
                        const payload = JSON.parse(data);
                        // Optional: Check if aud matches your client ID if you want to be strict
                        // if (payload.aud !== process.env.GOOGLE_CLIENT_ID) reject(new Error('Invalid Client ID'));
                        resolve(payload);
                    } catch (e) {
                        reject(new Error('Failed to parse token info'));
                    }
                } else {
                    reject(new Error(`Invalid token: ${res.statusCode} ${data}`));
                }
            });
        }).on('error', (e) => {
            reject(e);
        });
    });
}

module.exports = { verifyToken };
