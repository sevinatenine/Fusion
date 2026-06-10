var cards = require("./cards");
var mysql = require("./mysql");

exports.delay = async function(time) {
    return new Promise((resolve) => {
        setTimeout(resolve, time);
    })
}

exports.getPoints = function(cardId) {
    return (((cardId + 1) ** 2) / (500 * Math.cbrt(cardId + 1)));
}

var cachedTotal = null;

exports.getCardIds = async function () {
    const c = await cards.listCards();
    return c.map(e => e.id);
}

exports.getTotalPoints = async function() {
    if (cachedTotal != null) {
        return cachedTotal;
    }

    var total = 0;
    var c = await cards.listCards();
    for (var e of c) {
        var x = exports.getPoints(e.id);
        total += x;
    }

    cachedTotal = total;
    return total;
}

exports.getRandomCard = async function(luck = 1.0) {
    const c = await cards.listCards();
    const pts = c.map(e => exports.getPoints(e.id) * (1 / (e.id + 1)) ** (luck - 1));
    const total = pts.reduce((a, b) => a + b, 0);

    let selectedPoints = Math.random() * total;

    for (let i = 0; i < pts.length; i++) {
        selectedPoints -= pts[i];
        if (selectedPoints <= 0) return c[i].id;
    }

    return c[c.length - 1].id;
}

exports.luckTest = async function() {
    for (const luck of [1.0, 1.1, 1.2, 1.3]) {
        const counts = {};
        for (var i = 0; i < 100; i++) {
            var c = await exports.getRandomCard(luck);
            counts[c] = (counts[c] || 0) + 1;
        }

        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        const maxCount = sorted[0][1];
        const barWidth = 30;

        console.log(`\n--- luck +${Math.round((luck - 1) * 100)}% ---`);
        for (const [id, count] of sorted) {
            const bar = '█'.repeat(Math.round((count / maxCount) * barWidth));
            console.log(`${String(id).padStart(6)} | ${bar.padEnd(barWidth)} ${count}`);
        }
    }
}

exports.clearShopCollections = async function() {
    await mysql.runQueryNoResult(`DELETE FROM collections WHERE card_hash IN (SELECT hash FROM user_cards WHERE user_secret LIKE 'shop_%');
        DELETE FROM collection_desc WHERE collection_id NOT IN (SELECT DISTINCT collection_id FROM collections);
        DELETE FROM user_cards WHERE user_secret LIKE 'shop_%';`);
}