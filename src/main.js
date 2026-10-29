const server = require("./server");
// console.log("Required server");
const httpServer = require("./httpServer");
// console.log("Required httpServer");
const adminPanel = require("./adminPanel");
//console.log("Required adminPanel");
const authServer = require("./authServer");
//console.log("Required authServer");
const dbLoader = require("./dbLoader");
//console.log("Required dbLoader");
const utils = require("./utils");
//console.log("Required utils");
const auction = require("./shop");
//console.log("Required shop");
const quests = require("./quests");
const players = require("./players");

const PORT = 23;
const HTTP_PORT = 80;
const AUTH_PORT = 4167;

const HOST = "0.0.0.0";

(async function() {
    console.log("Running?");
    var loaded = await dbLoader.loadDB();
    console.log("Loaded " + loaded + " files into database.");

    server.run(PORT, HOST);
    httpServer.run(HTTP_PORT, HOST);
    authServer.run(AUTH_PORT, HOST);

    quests.startQuests();
    players.startTracking();

    await utils.delay(40);

    adminPanel.run();
})();