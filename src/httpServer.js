const express = require("express");
const http = require("http");
const net = require("net");
const path = require("path");
const { WebSocketServer } = require("ws");

// Strips telnet IAC negotiation from the stream and politely refuses all options.
function createIacFilter(socket) {
    let state = 0, cmd = 0;
    return (chunk) => {
        const out = [];
        for (const b of chunk) {
            switch (state) {
                case 0: // normal data
                    if (b === 255) state = 1; else out.push(b);
                    break;
                case 1: // after IAC
                    if (b === 255) { out.push(255); state = 0; }
                    else if (b >= 251 && b <= 254) { cmd = b; state = 2; }
                    else if (b === 250) state = 3; // subnegotiation
                    else state = 0;
                    break;
                case 2: // option byte after WILL/WONT/DO/DONT
                    if (cmd === 251) socket.write(Buffer.from([255, 254, b])); // WILL -> DONT
                    else if (cmd === 253) socket.write(Buffer.from([255, 252, b])); // DO -> WONT
                    state = 0;
                    break;
                case 3: if (b === 255) state = 4; break;
                case 4: state = b === 240 ? 0 : 3; break; // IAC SE ends subnegotiation
            }
        }
        return Buffer.from(out);
    };
}

async function runServer(PORT, HOST, { telnetHost = "localhost", telnetPort = 1234 } = {}) {
    const app = express();

    console.log("serving modules from:", path.join(__dirname, "public/modules"));

    app.use("/terminal/modules", express.static(path.join(__dirname, "public/modules")));
    app.use("/terminal", express.static(path.join(__dirname, "public")));

    // docs site
    app.use(express.static(path.join(__dirname, "../docs/site")));

    app.get("/api/cards.csv", (req, res) => {
        res.sendFile(path.join(__dirname, "../data/cards.csv"));
    });

    app.get("/api/seasons.csv", (req, res) => {
        res.sendFile(path.join(__dirname, "../data/seasons.csv"));
    });

    const server = http.createServer(app);

    // WebSocket <-> telnet bridge, attached to the same server at /ws
    const wss = new WebSocketServer({ server, path: "/ws" });

    wss.on("connection", (ws) => {
        console.log("A new client connected!");
        const tcp = net.connect(telnetPort, telnetHost);
        const filter = createIacFilter(tcp);

        tcp.on("data", (data) => {
            const clean = filter(data);
            if (clean.length && ws.readyState === ws.OPEN) ws.send(clean);
        });
        tcp.on("error", (err) => {
            if (ws.readyState === ws.OPEN) ws.send(`\r\nConnection error: ${err.message}\r\n`);
        });
        tcp.on("close", () => ws.close());

        ws.on("message", (data) => {
            const str = Buffer.from(data).toString().replace(/\r\n|\r/g, "\n");
            tcp.write(str);
        });
        ws.on("close", () => tcp.destroy());
    });

    server.listen(PORT, HOST, () => {
        console.log(`HTTP server running on http://${HOST}:${PORT}`);
        console.log(`Web terminal at http://${HOST}:${PORT}/terminal/ (ws path /ws)`);
    });
}

exports.run = runServer;