const net = require('net');
const commandHandler = require("./commandHandler");

var clients = new Set();

async function runServer(PORT, HOST) {
    const server = net.createServer((socket) => {
        clients.add(socket);

        commandHandler.handle(socket);

        socket.on('end', () => {
            if (userLoggedIn) {
                players.playerLeft(userLoggedIn);
            }
            
            clients.delete(socket);
        });
    });

    server.listen(PORT, HOST, () => {
        console.log(`Server waiting for commands on tcp://${HOST}:${PORT}`);
    });
}

exports.run = runServer; 