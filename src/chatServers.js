const net = require('net');
const EventEmitter = require('events');

const chalkModule = require('chalk');
const chalk = new chalkModule.Chalk({ level: 1 });

function receive(socket) {
    return new Promise((resolve, reject) => {
        socket.once('data', (data) => resolve(data.toString().trim()));
        socket.once('close', () => reject(new Error('disconnected')));
        socket.once('error', (err) => reject(err));
    });
}

var chatServers = new Set();

exports.createChatServerConnection = async function(address, accessToken, socket, chatEmitter) {
    var [host, port] = address.split(":");
    var sentConnect = false;

    const client = net.createConnection({ port, host }, () => {
        client.write(JSON.stringify(
            {
                type: "login",
                accessToken
            }
        ) + "\n");
    });

    client.setEncoding('utf8');

    chatServers.add(client);

    chatEmitter.on("sendMessage", (data) => {
        console.log("Sending message");
        client.write(JSON.stringify({
            type: "message",
            ...data
        }) + "\n")
    })

    client.on('data', (data) => {
        if (!sentConnect) {
            sentConnect = true;
            chatEmitter.emit("connected");
        }

        try {
            var d = JSON.parse(data);
        } catch (e) {
            return;
        }
        
        if (d.type == "message") {
            socket.write(`\n[Message] ${d.direct ? chalk.cyan("{DIRECT}") : ""} <${d.from}>: ${d.message}\n`);
        }
    });

    client.on('error', () => {
        chatEmitter.emit("connectFail");
        client.end();
    })

    chatEmitter.on("closeChat", () => {
        client.end();
        delete client;
    });
}