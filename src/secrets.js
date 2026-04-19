const mysql = require('./mysql');

function generateSecret() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let secret = '';
    for (let i = 0; i < 32; i++) {
        secret += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return secret;
}

async function verifySecret(secret) {
    const result = await mysql.runQuerySingle(
        "SELECT 1 FROM users WHERE secret = ?",
        [secret]
    );
    return !!result;
}

exports.generateSecret = generateSecret;
exports.verifySecret = verifySecret;