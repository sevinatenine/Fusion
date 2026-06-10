const schedule = require('node-schedule');
const utils = require("./utils");
const crypto = require("crypto");
const mysql = require("./mysql");

/*
 - Card 0: 1 point
 - Next 2^2 cards: 2 points
 - Next 3^2 cards: 3 points

 - p(x) = round(((x + 1) ^ 2) / 500 * cbrt(x+1))
*/

/*
Rarities:
  Common: 1.0       +0%
  Uncommon: 1.1     +10%
  Rare: 1.2         +0%
  Ultra rare: 1.3   +10%

*/

/*

Shop:
  Details:
    - Gets refreshed when stock runs out
  Items:
    - 100x 5 card common deck (can't see contents) - 1 nanon
    - 50x 5 card uncommon deck (can't see contents) - 1 micron
    - 10x 4 card rare deck (can't see contents) - 1 milon
    - 4x 5 card ultra rare deck (can't see contents) - 1 megon

    - 200x Random card - 3 picons

Auction :
  Details:
    - Last for 12 hours
    - Each bid must be higher than previous one by at least 3 nanons
  Items:
    - 30x cards (can see)
    - 1x 10 card ultra rare deck (can see contents)
*/

const Rarity = Object.freeze({
  COMMON: 1.0,
  UNCOMMON: 1.1,
  RARE: 1.2,
  ULTRARARE: 1.3
});

async function generateDeck(rarity = Rarity.COMMON, cards = 5) {
    return Promise.all(Array.from({ length: cards }, () => utils.getRandomCard(rarity)));
}

async function createShopCollection(cardIds) {
    const collectionId = crypto.randomBytes(16).toString("hex");
    const shopSecret = 'shop_' + crypto.randomBytes(8).toString("hex");

    await mysql.runQueryNoResult("INSERT INTO collection_desc (collection_id, money) VALUES (?, ?)", [collectionId, 0]);

    for (var id of cardIds) {
        var cardHash = crypto.randomBytes(16).toString("hex");
        await mysql.runQueryNoResult("INSERT INTO user_cards (hash, card_id, user_secret) VALUES (?, ?, ?)", [cardHash, id, shopSecret]);
        await mysql.runQueryNoResult("INSERT INTO collections (collection_id, card_hash) VALUES (?, ?)", [collectionId, cardHash]);
    }

    return collectionId;
}

async function createDeck(rarity = Rarity.COMMON, cards = 5) {
    var ids = generateDeck(rarity, cards);

    return await createShopCollection(ids);
}

const shopDecks = [
    { rarity: 1.0, qty: 100, count: 5 },
    { rarity: 1.1, qty: 50,  count: 5 },
    { rarity: 1.2, qty: 10,  count: 4 },
    { rarity: 1.3, qty: 4,   count: 5 },
    { rarity: 1.0, qty: 200, count: 1 }
];

async function runShopRestock() {
    var decks = [];

    for (var i of shopDecks) {
        for (var j = 0; j < i.qty; j++) {
            decks.push({
                rarity: i.rarity,
                count: i.count,
                collectionId: await createShopCollection(await generateDeck(i.rarity, i.count))
            });
        }
    }

    console.log(decks);
}

async function runRandomAuction() {

}

function startScheduler(auction) {
    var times = [
        [0, 0],
        [0, 12]
    ];

    for (var i of times) {
        var minute, hour = i;

        var job = schedule.scheduleJob(`${minute} ${hour} * * *`, () => {
            runRandomAuction();
        });
    }
}

;(async function() {
	await utils.delay(1000);
	await runShopRestock();
})();

exports.startScheduler = startScheduler;