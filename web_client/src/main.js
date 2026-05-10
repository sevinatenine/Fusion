const http = require("http");
const { WebSocketServer } = require("ws");
const fs = require("fs");
const path = require("path");

const { spawn } = require('node:child_process');

const HTTP_PORT = 81;
const WS_PORT = 82;
const FWD_PORT = 23;
const FWD_HOST = "0.0.0.0";

http.createServer((req, res) => {
    if(req.url == "/") {
        res.setHeader("Content-Type", "text/html");
        res.write(fs.readFileSync(path.join(__dirname, "../public/index.html")));
        res.end();
        return;
    }
    try {
        res.setHeader("Content-Type", "text/" + path.extname(req.url).slice(1));
        res.write(fs.readFileSync(path.join(__dirname, "../public", req.url)));
    } catch {
        res.setHeader("Content-Type", "text/plain");
        res.write("HTTP Error 404: Resource not found\nFusion TCG web client server")
    }

    res.end();
}).listen(HTTP_PORT, function() {
    console.log("Listening on http://0.0.0.0:" + HTTP_PORT);
});

const wss = new WebSocketServer({ port: WS_PORT });

wss.on('connection', (socket) => {
    const child = spawn('telnet', ['localhost', '23']);

    child.stdout.on('data', (data) => {
        socket.send(data);
    });

    child.stderr.on("data", (data) => {
        socket.send(data);
    });

    child.on('close', () => socket.terminate());

    console.log('A new client connected!');

    socket.on("message", (data) => {
        // Normalise \r\n or bare \r → \n so the server gets clean lines
        const str = Buffer.from(data).toString().replace(/\r\n|\r/g, '\n');
        child.stdin.write(str);
    });


    socket.on('close', () => {
        child.kill();
    });
});

console.log('WebSocket server is running on ws://localhost:82');