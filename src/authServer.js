const dgram = require('node:dgram');
const mysql = require("./mysql");
const server = dgram.createSocket('udp4'); // Use 'udp6' for IPv6

exports.run = async (port, host) => {
    server.on('error', (err) => {
    console.error(`Server error:\n${err.stack}`);
    server.close();
    });

    server.on('message', async (msg, rinfo) => {
        console.log(`Server received: ${msg} from ${rinfo.address}:${rinfo.port}`);
        let str = msg.toString("utf-8").trim();
        let res = await (mysql.runQuery("SELECT * FROM tokens WHERE value = ?", [str]));

        if (res.length === 0) {
            server.send(Buffer.from("...\n"), rinfo.port, rinfo.address);
            return;
        }

        let user = await mysql.runQuerySingle("SELECT * FROM users WHERE secret = ?", [res[0].user_secret]);

        if (!user) {
            server.send(Buffer.from("...\n"), rinfo.port, rinfo.address);
            return;
        }
        console.log(user.username);
        const response = Buffer.from(user.username + "\n");
        server.send(response, rinfo.port, rinfo.address);
    });

    server.on('listening', async () => {
        const address = server.address();
        console.log(`Server listening on ${address.address}:${address.port}`);
    });

    server.bind(port, host);
}