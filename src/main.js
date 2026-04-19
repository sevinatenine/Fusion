const server = require("./server");
const adminPanel = require("./adminPanel");

const PORT = 22;
const HOST = "0.0.0.0";

server.run(PORT, HOST);

adminPanel.run();