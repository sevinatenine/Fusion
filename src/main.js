const server = require("./server");
const adminPanel = require("./adminPanel");
const utils = require("./utils");

const PORT = 22;
const HOST = "0.0.0.0";

(async function() {
    server.run(PORT, HOST);

    await utils.delay(40);

    adminPanel.run();
})();