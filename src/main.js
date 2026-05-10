const server = require("./server");
const httpServer = require("./httpServer");
const adminPanel = require("./adminPanel");
const authServer = require("./authServer");
const dbLoader = require("./dbLoader");
const utils = require("./utils");

const PORT = 23;
const HTTP_PORT = 8080;
const AUTH_PORT = 4167;

const HOST = "0.0.0.0";

(async function() {
    var loaded = await dbLoader.loadDB();
    console.log("Loaded " + loaded + " files into database.");

    server.run(PORT, HOST);
    httpServer.run(HTTP_PORT, HOST);
    authServer.run(AUTH_PORT, HOST);

    await utils.delay(40);

    adminPanel.run();
})();