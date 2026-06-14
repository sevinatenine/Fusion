const schedule = require('node-schedule');
const utils = require("./utils");
const crypto = require("crypto");
const mysql = require("./mysql");

const chalkModule = require('chalk');
const chalk = new chalkModule.Chalk({ level: 1 });

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
    - 4x 5 card ultra rare deck (can't see contents) - 1 kilon

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

var NiceRarity = Object.freeze({
    COMMON: chalk.gray("Common"),
    UNCOMMON: chalk.green("Uncommon"),
    RARE: chalk.cyan("Rare"),
    ULTRARARE: chalk.magenta("Ultra Rare")
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

async function createDeck(rarity = Rarity.COMMON, cards = 5, cost) {
    var ids = await generateDeck(rarity, cards);

    var collectionId = await createShopCollection(ids);

    await mysql.runQueryNoResult("INSERT INTO shop (rarity, count, collection_id, cost) VALUES (?, ?, ?, ?)", [rarity, cards, collectionId, cost]);

    return collectionId;
}

async function listShop() {
    var totals = {};

    var entries = await mysql.runQuery("SELECT * FROM shop");

    for (var i of entries) {
        var id = `id_${i.count}_${i.rarity}`;

        if (id in totals) {
            totals[id].quantity++;
        } else {
            totals[id] = { quantity: 1, cost: i.cost, cards: i.count, rarity: i.rarity };
        }
    }

    return totals;
}

const shopDecks = [
    { rarity: 1.0, qty: 100, count: 5, cost: 10     },
    { rarity: 1.1, qty: 50,  count: 5, cost: 100    },
    { rarity: 1.2, qty: 10,  count: 4, cost: 1000   },
    { rarity: 1.3, qty: 4,   count: 5, cost: 100000 },
    { rarity: 1.0, qty: 200, count: 1, cost: 3      }
];

async function runShopRestock() {
    var decks = [];

    for (var i of shopDecks) {
        for (var j = 0; j < i.qty; j++) {
            decks.push({
                rarity: i.rarity,
                count: i.count,
                cost: i.cost,
                collectionId: await createDeck(i.rarity, i.count, i.cost)
            });
        }
    }
}

async function runRandomAuction() {

}

function startScheduler(auction) {
    var times = [
        [0, 0],
        [0, 12]
    ];

    for (var i of times) {
        var [minute, hour] = i;

        var job = schedule.scheduleJob(`${minute} ${hour} * * *`, () => {
            runRandomAuction();
        });
    }
}

// ;(async function() {
// 	await utils.delay(5000);
// 	await runShopRestock();
//     await listShop();
// })();

exports.startScheduler = startScheduler;
exports.listShop = listShop;
exports.Rarity = Rarity;
exports.NiceRarity = NiceRarity;