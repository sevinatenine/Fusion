const net = require('net');
const chalkModule = require("chalk");
const chalk = new chalkModule.Chalk({ level: 1 });
const dgram = require("node:dgram");
var fs = require("fs");
var crypto = require("crypto");

const delay = async function(time) {
    return new Promise((resolve) => {
        setTimeout(resolve, time);
    })
}

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

        function onClose() { console.log("Disconnect") }

        socket.on('data', onData);
        socket.once('close', onClose);
        socket.on('error', console.log);
    });
}

// function send(socket, payload) {
//     socket.write(JSON.stringify(payload) + "\n");
// }

var clients = new Set();

const serverName = "leaky-solon-grief";

async function auth(token) {
    const client = dgram.createSocket('udp4');
    await new Promise(resolve => client.bind(resolve));
    client.send(Buffer.from(`${token};${serverName}`), 4167, "localhost");
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

var secrets = Object.fromEntries(fs.readFileSync("src/.trading.secrets").toString().split("\n").map(e => e.split("=")));

function makeReceiver(socket) {
    let buf = "";

    socket.on('data', (data) => { buf += data; });

    return function receive() {
        return new Promise((resolve, reject) => {
            function check() {
                const i = buf.indexOf("\n");
                if (i !== -1) {
                    const line = buf.slice(0, i).trim();
                    buf = buf.slice(i + 1);
                    socket.off('data', check);
                    socket.off('close', onClose);
                    resolve(line);
                }
            }

            function onClose() { reject(new Error('disconnected')); }

            socket.on('data', check);
            socket.once('close', onClose);
            check(); // in case data already buffered
        });
    };
}

var client;

async function receiveN(receive, socket, n) {
    var data = "";
    var cnt = 0;

    while (cnt < n) {
        data += await receive(socket) + "\n";
        cnt++;
    }

    return data;
}

async function send(client, d) {
    client.write(d);
}

function receiveUntilIdle(socket, timeout = 100) {
    return new Promise((resolve) => {
        let buf = "";
        let timer;

        function onData(data) {
            buf += data;
            clearTimeout(timer);
            timer = setTimeout(finish, timeout);
        }

        function finish() {
            socket.off('data', onData);
            resolve(buf);
        }

        timer = setTimeout(finish, timeout);
        socket.on('data', onData);
    });
}

async function loginToFusion() {
    var tradingSecret = secrets["TRADING_SECRET"];
    
    client = net.createConnection({ port: 23, host: "localhost" }, async function() {
        const receive = makeReceiver(client);
        try {
            await receiveUntilIdle(client);
            await send(client, "login\n");
            await receiveUntilIdle(client);
            await send(client, tradingSecret + "\n");
            console.log(await receiveUntilIdle(client));
        } catch (err) {
            console.error("loop ended:", err);
        }
    });

    // client.on('data', (data) => {
    //     console.log('Received: ' + data.toString());
    //     client.end(); // Close connection after receiving a response
    // });

    // client.on('end', () => {
    //     console.log('Disconnected from server');
    // });

    // client.on('error', (err) => {
    //     console.error('Connection error: ' + err.message);
    // });

}

async function recol(collectionId) {
    await send(client, `recol ${collectionId}\n`);
    var newId = await receiveUntilIdle(client);
    console.log("New collection ID:", newId);
    const match = newId.trim().match(/[0-9a-f]{32}/);
    if (match) {
        return match[0];
    } else {
        return null;
    }

}

async function getCollection(collectionId) {
    await send(client, `peek-api ${collectionId}\n`);

    var data = await receiveUntilIdle(client);
    var lines = data.trim().split("\n");
    var worthLine = lines.find(l => l.startsWith("WORTH: "));
    var hasLine = lines.find(l => l.startsWith("HAS: "));

    if (!worthLine || !hasLine) {
        return null;
    }

    var worthVal = worthLine.slice(7).trim();
    var hasVal = hasLine.slice(5).trim();

    if (!worthVal || !hasVal) {
        return null;
    }

    var money = parseInt(worthVal);
    var cards = hasVal.split(",").filter(s => s.trim() !== "").map(s => parseInt(s.trim()));

    return { money, cards };
}

loginToFusion();

/*


Request:
(Client -> Server)

{
    type: <string (type)>,
    data: <varies>
}

Response:
(Server -> Client)

{
    success: <bool (true|false)>,
    type: <string (type)>
    (if not success) error: <string>,
    data: <varies>
}
    


|-< Request - type: createBond
|  data: {}
|
|
+-> Response - type: bondCreated
|  data: {
|      bondId: <string>
|  }

+-< Request - type: joinBond
|  data: {
|      bondId: <string>
|  }
|
+-> Response - type bondJoined
|   data: {}
|   success: true
|
+-> Response - type bondJoined
|   data: {}
|   success: false
|   error: "ERR_INVALID_BOND_ID"
|
+-> Response - type bondJoined
|  data: {}
|  success: false
|  error: "ERR_BOND_HAS_TWO"
|
+-> Response (w/ no request) - type bondReady
|  data: {}
|  success: true

+-< Request - type bondData
|  data: {
|      bondId: <string>,
|      expected: {
|          picons: <number>,
|          cards: <Array<number>>
|      },
|      offer: <string (collectionID)>
|  }
|
+-> Respond - type tradeResponse
|  success: true
|  data: {
|       traded: true,
|       otherOffer: <string (collectionID)>
|  }
+-> Respond - type tradeResponse
|  success: true
|  data: {
|      traded: false,
|      reason: <string (timeout|invalid|no_match)>,
|      yourOffer: <string (collectionID)>
|  }
+-> Respond - type requestInvalid
|  success: false
|  data: {}
|  error: "ERR_BAD_REQUEST"
+-> Respond - type invalidType
|  success: false
|  data: {}
|  error: "ERR_INVALID_TYPE"
*/

const errors = {
    "requestInvalid": "ERR_BAD_REQUEST",
    "invalidType": "ERR_INALID_TYPE"
}

function sendError(socket, errorType, errMsg) {
    send(socket, JSON.stringify({
        type: errorType,
        success: false,
        data: {},
        error: errMsg || errors[errorType] || "NO_ERR_DEFINED"
    }) + "\n")
}

function sendResponse(socket, type, data) {
    send(socket, JSON.stringify({
        success: true,
        type,
        data
    }) + "\n")
}

var bonds = new Set();

function makeBondID() {
    return crypto.randomBytes(16).toString("hex");
}

class Bond {
    constructor (creator, creatorSocket) {
        this.clients = new Set();
        this.offers = {
            client0: null,
            client1: null
        };

        this.id = makeBondID();
        this.creator = creatorSocket;
        this.creatorId = creator;

        this.clients.add(creator);
    }

    addClient(id) {
        if (this.clients.size < 2) {
            this.clients.add(id);
            return true;
        } else {
            return false;
        }
    }
}


async function commandHandler(socket) {
    while (true) {
        var cmd = await receive(socket);

        console.log(cmd);

        try {
            var data = JSON.parse(cmd.trim());

            if (!data.type) {
                sendError(socket, "requestInvalid", "ERR_NO_TYPE");
                continue;
            }

            switch (data.type) {
                case "createBond": {
                    var newBond = new Bond(socket.clientId, socket);
                    bonds.add(newBond)

                    sendResponse(socket, "bondCreated", {bondId: newBond.id});

                    break;
                }
                case "joinBond": {

                    if (!data.data.bondId) {
                        sendError(socket, "requestInvalid", "ERR_NO_BOND_ID");
                        break;
                    }

                    var failed = false;
                    var found = false;

                    for (var i of bonds.values()) {
                        if (failed) break;
                        
                        if (i.id == data.data.bondId) {
                            found = true;
                            if (i.addClient(socket.clientId)) {
                                sendResponse(socket, "bondJoined", {});

                                i.joiner = socket;

                                if (i.clients.size == 2) {
                                    sendResponse(socket, "bondReady", {});
                                    sendResponse(i.creator, "bondReady", {});
                                }

                            } else {
                                sendError(socket, "bondJoined", "ERR_BOND_HAS_TWO");
                                failed = true;
                            }
                                                            
                            continue;
                        }
                    }

                    if(!found) {
                        if (!failed) {
                            sendError(socket, "bondJoined", "ERR_INVALID_BOND_ID");
                        }
                    }

                    break;
                }
                case "bondData": {
                    if (!data.data.bondId) {
                        sendError(socket, "requestInvalid", "ERR_NO_BOND_ID");
                        break;
                    }

                    if (!data.data.offer) {
                        sendError(socket, "requestInvalid", "ERR_NO_OFFER");
                        break;
                    }

                    if (!data.data.expected) {
                        sendError(socket, "requestInvalid", "ERR_NO_EXPECTED");
                        break;
                    }

                    if (data.data.expected.picons === undefined || data.data.expected.picons === null || !Array.isArray(data.data.expected.cards)) {
                        console.log(data.data.expected);
                        sendError(socket, "requestInvalid", "ERR_INVALID_EXPECTED");
                        break;
                    }

                    var bondFound = [...bonds].find(e => e.id == data.data.bondId);
                    if (!bondFound) {
                        sendError(socket, "bondData", "ERR_INVALID_BOND_ID");
                        break;
                    }

                    if (bondFound.clients.size < 2) {
                        sendError(socket, "bondData", "ERR_BOND_NOT_READY");
                        break;
                    }


                    var id = await recol(data.data.offer);
                    console.log(id);
                    if (!id) {
                        sendError(socket, "bondData", "ERR_INVALID_OFFER");
                        break;
                    }
                    var collection = await getCollection(id);

                    bondFound.offers[socket.clientId == bondFound.creatorId ? "client0" : "client1"] = {
                        offer: id,
                        expected: data.data.expected,
                        collectionDeal: collection
                    };

                    if (bondFound.offers.client0 && bondFound.offers.client1) {
                        if (bondFound.offers.client0.expected.picons == bondFound.offers.client1.collectionDeal.picons &&
                            bondFound.offers.client0.expected.cards.every(c => bondFound.offers.client1.collectionDeal.cards.includes(c)) &&
                            bondFound.offers.client1.expected.picons == bondFound.offers.client0.collectionDeal.picons &&
                            bondFound.offers.client1.expected.cards.every(c => bondFound.offers.client0.collectionDeal.cards.includes(c))) {
                                sendResponse(bondFound.creator, "tradeResponse", {traded: true, otherOffer: bondFound.offers.client1.offer});
                                for (var c of bondFound.clients) {
                                    if (c != bondFound.creatorId) {
                                        sendResponse(bondFound.joiner, "tradeResponse", {traded: true, otherOffer: bondFound.offers.client0.offer});
                                    }
                                }
                        } else {
                            sendResponse(bondFound.creator, "tradeResponse", {traded: false, reason: "no_match", yourOffer: bondFound.offers.client0.offer});
                            for (var c of bondFound.clients) {
                                if (c != bondFound.creatorId) {
                                    sendResponse(bondFound.joiner, "tradeResponse", {traded: false, reason: "no_match", yourOffer: bondFound.offers.client1.offer});
                                }
                            }
                        }
                        
                        bonds.delete(bondFound);
                    }

                    break;
                }
                default: {
                    sendError(socket, "invalidType");
                }
            } 
        } catch (e) {
            console.log(e);
            sendError(socket, "requestInvalid", "ERR_INVALID_JSON");
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