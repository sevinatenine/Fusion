const express = require("express");
const path = require("path");

async function runServer(PORT, HOST) {
    const app = express();

    app.use(express.static(path.join(__dirname, "../docs/site")));

    app.get("/api/cards.csv", (req, res) => {
        res.sendFile(path.join(__dirname, "../data/cards.csv"));
    });

    app.get("/api/seasons.csv", (req, res) => {
        res.sendFile(path.join(__dirname, "../data/seasons.csv"));
    });

    app.listen(PORT, HOST, () => {
        console.log(`HTTP server running on http://${HOST}:${PORT}`);
    });
}

exports.run = runServer;