const net = require('net');
const commandHandler = require("./commandHandler");

var clients = new Set();

function runServer(PORT, HOST) {
    const server = net.createServer((socket) => {
        clients.add(socket);

        commandHandler.handle(socket);

        socket.on('end', () => {
            clients.delete(socket);
        });
    });

    server.listen(PORT, HOST, () => {
        console.log(`Server waiting for commands on tcp://${HOST}:${PORT}`);
    });
}

exports.run = runServer; 