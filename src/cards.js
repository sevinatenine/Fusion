const crypto = require('crypto');
const mysql = require('./mysql');

async function getCardsForUser(secret) {
    return mysql.runQuery(
        "SELECT card_id as id, hash FROM user_cards WHERE user_secret = ?",
        [secret]
    );
}

async function getCardDetails(cardId) {
    const result = await mysql.runQuerySingle(
        `SELECT c.name, s.name as season, s.color 
         FROM cards c JOIN seasons s ON c.season_id = s.id 
         WHERE c.id = ?`,
        [cardId]
    );
    return {
        name: `${result.name || ""} | Card #${cardId}`,
        season: result?.season || "Unknown",
        color: result?.color || "reset"
    };
}

async function listCards() {
    const result = await mysql.runQuery(`SELECT * FROM cards`);

    return result;
}

async function giveCard(userSecret, cardId) {
    const hash = crypto.randomBytes(16).toString('hex');
    await mysql.runQueryNoResult(
        "INSERT INTO user_cards (user_secret, card_id, hash) VALUES (?, ?, ?)",
        [userSecret, cardId, hash]
    );
    return hash;
}

async function getCardTotals(secret) {
    const cards = await getCardsForUser(secret);
    const totals = new Map();
    for (const card of cards) {
        totals.set(card.id, (totals.get(card.id) || 0) + 1);
    }
    return totals;
}

exports.getCardsForUser = getCardsForUser;
exports.getCardDetails = getCardDetails;
exports.giveCard = giveCard;
exports.getCardTotals = getCardTotals;
exports.listCards = listCards;