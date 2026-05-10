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

/*

type: "login"
{
    accessToken: "token"
}

type: "message"
{
    to: "username",
    message: "text"
}

type: "quit"
{
    reason: "reason"
}

*/

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

    if (response == "..." ) {
        return { success: false };
    } else {
        return { success: true, username: response };
    }
}

function broadcast(message) {
    for (var client of clients) {
        client.write(message);
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
            break;
        }

        try {
            decoded = JSON.parse(data);
        } catch (e) {
            socket.write("ERR_NEEDS_TO_BE_JSON\n");
            continue;
        }

        if (!decoded.type) {
            socket.write("ERR_MISSING_TYPE\n");
            continue;
        }

        if (decoded.type === "login") {
            if (!decoded.accessToken) {
                socket.write("ERR_MISSING_ACCESS_TOKEN\n");
                continue;
            }

            var { success, username } = await auth(decoded.accessToken);

            if (!success) {
                socket.write("ERR_INVALID_ACCESS_TOKEN\n");
                continue;
            }

            socket.authenticated = true;
            socket.username = username;

            socket.write("LOGIN_SUCCESS\n");
        } else if (decoded.type === "message") {
            if (!decoded.message) {
                socket.write("ERR_MISSING_MESSAGE\n");
                continue;
            }

            if (!socket.authenticated) {
                socket.write("ERR_NOT_AUTHENTICATED\n");
                continue;
            }
            
            if (!decoded.to) {
                broadcast(`MSG_FROM ${socket.username} ${decoded.message}\n`);
            } else {
                var recipient = Array.from(clients).find(c => c.username === decoded.to);
                if (!recipient) {

                    broadcast(`MSG_FROM ${socket.username} ${decoded.message}\n`);
                } else {
                    recipient.write(`MSG_FROM ${socket.username} ${decoded.message}\n`);
                }
            }

            socket.write("MSG_SENT\n");

        } else if (decoded.type === "quit") {
            socket.write("BYE\n");
            socket.end();
            break;
        } else {
            socket.write("ERR_UNKNOWN_CMD\n");
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