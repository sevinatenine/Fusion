const net = require('net');
const chalkModule = require("chalk");
const chalk = new chalkModule.Chalk({ level: 1 });
const dgram = require("node:dgram");

function receive(socket) {
    return new Promise((resolve, reject) => {
        let buf = "";

        function onData(data) {
            buf += data;
            const i = buf.indexOf("\n");
            if (i !== -1) {
                const line = buf.slice(0, i).trim();
                buf = buf.slice(i + 1);
                socket.off('data', onData);
                socket.off('close', onClose);
                resolve(line);
            }
        }

        function onClose() { reject(new Error('disconnected')); }

        socket.on('data', onData);
        socket.once('close', onClose);
    });
}

function send(socket, payload) {
    socket.write(JSON.stringify(payload) + "\n");
}

var clients = new Set();

async function auth(token) {
    const client = dgram.createSocket('udp4');
    await new Promise(resolve => client.bind(resolve));
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

async function commandHandler(socket) {
    while (true) {
        var cmd = await receive(socket);

        // TODO: Finish

        try {
            var data = JSON.parse(cmd);
        } catch (e) {
            send(socket, JSON.stringify({
                success: false
            }))
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

runServer(9999, "0.0.0.0");