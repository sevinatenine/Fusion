const server = require("./server");
const httpServer = require("./httpServer");
const adminPanel = require("./adminPanel");
const dbLoader = require("./dbLoader");
const utils = require("./utils");

const PORT = 23;
const HOST = "0.0.0.0";

const HTTP_PORT = 8080;
const HTTP_HOST = "0.0.0.0";

(async function() {
    var loaded = await dbLoader.loadDB();
    console.log("Loaded " + loaded + " files into database.");

    server.run(PORT, HOST);
    httpServer.run(HTTP_PORT, HTTP_HOST);

    await utils.delay(40);

    adminPanel.run();
})();