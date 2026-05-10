const net = require('net');
const chalkModule = require("chalk");
const chalk = new chalkModule.Chalk({ level: 1 });
const dgram = require("node:dgram");

function receive(socket) {
    return new Promise((resolve, reject) => {
        socket.once('data', (data) => resolve(data.toString().trim()));
        socket.once('close', () => reject(new Error('disconnected')));
        socket.once('error', (err) => reject(err));
    });
}

function send(socket, payload) {
    socket.write(JSON.stringify(payload) + "\n");
}

var clients = new Set();

async function auth(token) {
    const client = dgram.createSocket('udp4');
    client.send(Buffer.from(token), 4167, "localhost");
    let response;
    try {
        response = await new Promise((resolve, reject) => {
            client.once('message', (msg) => resolve(msg.toString().trim()));
            client.once('error', (err) => reject(err));
            setTimeout(() => reject("timeout"), 5000);
        });
    } catch (e) {
        return { success: false };
    }

    console.log("Auth response:", response);

    if (response == "...") {
        return { success: false };
    } else {
        return { success: true, username: response };
    }
}

function broadcast(message) {
    for (var client of clients) {
        send(client, message);
    }
}

async function commandHandler(socket) {
    while (true) {
        var data;
        var decoded;
        try {
            data = await receive(socket);
        } catch (e) {
            console.log(chalk.yellow(`Client ${socket.remoteAddress}:${socket.remotePort} disconnected.`));
            clients.delete(socket);
            break;
        }

        try {
            decoded = JSON.parse(data);
        } catch (e) {
            send(socket, { success: false, error: "ERR_NEEDS_TO_BE_JSON", message: "Request body must be valid JSON." });
            continue;
        }

        if (!decoded.type) {
            send(socket, { success: false, error: "ERR_MISSING_TYPE", message: "Missing required field: type." });
            continue;
        }

        if (decoded.type === "login") {
            if (!decoded.accessToken) {
                send(socket, { success: false, error: "ERR_MISSING_ACCESS_TOKEN", message: "Missing required field: accessToken." });
                continue;
            }

            var { success, username } = await auth(decoded.accessToken);

            if (!success) {
                send(socket, { success: false, error: "ERR_INVALID_ACCESS_TOKEN", message: "The provided access token is invalid or expired." });
                continue;
            }

            socket.authenticated = true;
            socket.username = username;

            send(socket, { success: true, type: "login", message: "Login successful.", username });

        } else if (decoded.type === "message") {
            if (!decoded.message) {
                send(socket, { success: false, error: "ERR_MISSING_MESSAGE", message: "Missing required field: message." });
                continue;
            }

            if (!socket.authenticated) {
                send(socket, { success: false, error: "ERR_NOT_AUTHENTICATED", message: "You must be logged in to send messages." });
                continue;
            }

            const msgPayload = { success: true, type: "message", from: socket.username, message: decoded.message };

            if (!decoded.to) {
                broadcast({ ...msgPayload, direct: false });
            } else {
                var recipient = Array.from(clients).find(c => c.username === decoded.to);
                if (!recipient) {
                    send(socket, { success: false, error: "ERR_USER_NOT_FOUND", message: `User "${decoded.to}" not found or not online.` });
                    continue;
                } else {
                    send(recipient, { ...msgPayload, direct: true });
                }
            }

            send(socket, { success: true, type: "message_sent", message: "Message sent." });

        } else if (decoded.type === "quit") {
            send(socket, { success: true, type: "quit", message: "Goodbye." });
            socket.end();
            break;
        } else {
            send(socket, { success: false, error: "ERR_UNKNOWN_CMD", message: `Unknown command type: "${decoded.type}".` });
            continue;
        }
    }
}

async function runServer(PORT, HOST) {
    const server = net.createServer((socket) => {
        clients.add(socket);
        socket.clientId = Math.round(Math.random() * 10 ** 12).toString(36);

        commandHandler(socket);

        socket.on('end', () => {
            clients.delete(socket);
        });
    });

    server.listen(PORT, HOST, () => {
        console.log(`Server waiting for chat messages on tcp://${HOST}:${PORT}`);
    });
}

runServer(1337, "0.0.0.0");