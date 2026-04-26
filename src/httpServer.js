const express = require("express");
const path = require("path");

async function runServer(PORT, HOST) {
    const app = express();

    app.use(express.static(path.join(__dirname, "../docs/site")));

    app.listen(PORT, HOST, () => {
        console.log(`HTTP server running on http://${HOST}:${PORT}`);
    });
}

exports.run = runServer;