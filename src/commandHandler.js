const chalkModule = require('chalk');
var { AsciiTable3 } = require('ascii-table3');
const crypto = require('crypto');
const EventEmitter = require('events');

const mysql = require("./mysql");
const cards = require("./cards");
const secrets = require('./secrets');
const utils = require('./utils');
const chatServers = require("./chatServers");
const shop = require("./shop");
const sysLogins = require('./sysLogins').sysLogins();
const players = require("./players");

const http = require('http');

const chalk = new chalkModule.Chalk({ level: 1 });

function welcomeMessage(socket) {
    socket.write("Welcome to Fusion!\n\n");
    socket.write("Type 'login' to login or 'register' to create a new account.\n");
    socket.write("Fusion is in early development, so expect bugs and missing features.\n");
    socket.write("If you encounter any issues, please report them on GitHub\n\n");
}

const validColors = ['black',           'red',            'green',
    'yellow',          'blue',           'magenta',
    'cyan',            'white',          'blackBright',
    'gray',            'grey',           'redBright',
    'greenBright',     'yellowBright',   'blueBright',
    'magentaBright',   'cyanBright',     'whiteBright',
    'bgBlack',         'bgRed',          'bgGreen',
    'bgYellow',        'bgBlue',         'bgMagenta',
    'bgCyan',          'bgWhite',        'bgBlackBright',
    'bgGray',          'bgGrey',         'bgRedBright',
    'bgGreenBright',   'bgYellowBright', 'bgBlueBright',
    'bgMagentaBright', 'bgCyanBright',   'bgWhiteBright'
];

// function receive(socket) {
//     return new Promise((resolve, reject) => {
//         let buf = "";

//         function onData(data) {
//             buf += data;
//             const i = buf.indexOf("\n");
//             if (i !== -1) {
//                 const line = buf.slice(0, i).trim();
//                 buf = buf.slice(i + 1);
//                 socket.off('data', onData);
//                 socket.off('close', onClose);
//                 resolve(line);
//             }
//         }

//         function onClose() { reject(new Error('disconnected')); }

//         socket.on('data', onData);
//         socket.once('close', onClose);
//         socket.on('error', console.log);
//     });
// }

function formatUsername(username) {
    var out = username;
    if (Object.keys(sysLogins).includes(username)) {
        out = chalk[sysLogins[username].prefixColor || "reset"](sysLogins[username].prefix || "") + chalk[sysLogins[username].color || "reset"](username);
    }
    return out;
}

async function isUsernameTaken(username) {
    return new Promise((resolve) => {
        mysql.runQuerySingle("SELECT 1 FROM users WHERE username = ?", [username]).then((result) => {
            resolve(!!result);
        });
    });
}

async function registerUser(username, secret) {
    const id = crypto.randomBytes(16).toString('hex');
    await mysql.runQueryNoResult(
        "INSERT INTO users (id, username, secret) VALUES (?, ?, ?)",
        [id, username, secret]
    );
}

async function displayCards(secret, socket) {
    var out = "";
    const totals = await cards.getCardTotals(secret);

    for (var [id, count] of totals) {
        var cardDetails = await cards.getCardDetails(id);
        var colorFunc = chalk[cardDetails.color] || chalk.reset;
        out += `${count}x ${colorFunc(cardDetails.name + " (" + cardDetails.season + ")")}\n`;
    }

    socket.write(out);
}

var units = [
    "p",
    "n",
    "µ",
    "m",
    "u",
    "k",
    "M",
];

var commands = {
    "help": "Show this message",
    "login": "Login to your account",
    "register": "Register a new account",
    "cards [username]": "Show [your|usernames] cards",
    "money [username]": "Show [your|usernames] money",
    "stats [username]": "Show [your|usernames] stats",
    "search-cards <query>": "Search for cards by name",
    "search-users <query>": "Search for users by username",
    "search-seasons <query>": "Search for seasons by name",
    "whoami": "Show your username",
    "token <+|-|list|get|def> [name (except list)] [server_id]": "Configure identification tokens for external services",
    "servers <+|-|list|get> [name (except list)]": "Attach chat servers to names",
    "connect-chat <server-url|server-name> [token-name]": "Connect to the chat server",
    "message <message> [@username]": "Send a message to the chat (optionally to a specific user)",
    "chat-console": "Enters the chat console. Use exit command to leave.",
    "logout": "Logout of your account",
    "collect <picons> [<card1>,<card2>...<cardN>]": "Make a collection with some picons and cards. Returns a collection ID and removes these resources from your account",
    "redeem <id>": "Redeem collection with id <id>",
    "peek <id>": "View the contents of collection with id <id>",
    "exit": "Exit the program",
}

function formatMoney(picons) {
    var index = 0;
    var value = picons;

    while (value >= 10 && index < units.length - 1) {
        value /= 10;
        index++;
    }

    return `${value.toFixed(2)} ${units[index]}`;
}

const hasNonAscii = (str) => /[^\x00-\x7F]/.test(str);

function createReceiver(socket) {
    socket.setEncoding('utf8');   // handles split multibyte chars
    let buf = "";
    const lines = [];
    let pending = null;
    let closed = false;

    const flush = () => {
        if (!pending) return;
        if (lines.length) {
            const { resolve } = pending;
            pending = null;
            resolve(lines.shift());
        } else if (closed) {
            const { reject } = pending;
            pending = null;
            reject(new Error('disconnected'));
        }
    };

    socket.on('data', (data) => {
        data = data.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');  // drop arrow keys etc.
        for (const ch of data) {
            if (ch === '\n') { lines.push(buf.trim()); buf = ""; }
            else if (ch === '\x7f' || ch === '\b') buf = buf.slice(0, -1);
            else if (ch !== '\r') buf += ch;
        }
        flush();
    });

    socket.on('close', () => { closed = true; flush(); });
    socket.on('error', console.log);

    return () => new Promise((resolve, reject) => {
        pending = { resolve, reject };
        flush();
    });
}

async function clientHandler(socket) {
    const receiveLine = createReceiver(socket);
    const receive = () => receiveLine();

    var loggedIn = false;
    var clientSecret = "";

    var userLoggedIn = "";
    var defaultToken = "";
    var connectedServer = "";
    var usedToken = "";
    var chatEmitter;
    var streak = 0;

    welcomeMessage(socket);

    try {
        while (true) {
            socket.write("> ");

            const command = await receive(socket);
            const cmdSplit = command.split(" ").filter(s => s.length > 0);

            if (cmdSplit.length === 0) {
                continue;
            }

            const cmd = cmdSplit[0].toLowerCase();
            if(cmd == "whatareyou") {
                streak++;
                if(streak >= 3) {
                    socket.write(`I am Node.JS ${process.version} And please stop asking me questions!\n`);
                } else socket.write("Unkown command.\n");
                continue;
            } else streak = 0;

            if (hasNonAscii(cmd)) {
                socket.write("I knew it! You're a chromebook user.\n");
            }

            switch(cmd) {
                case "login": case "🪵in": {
                    if (loggedIn) {
                        socket.write("Already logged in.\n");
                        continue;
                    } else {
                        socket.write("Enter secret: ");

                        clientSecret = await receive(socket);
                        var results = await secrets.verifySecret(clientSecret);


                        if (!results) {
                            socket.write("Invalid secret.\n");
                            continue;
                        }

                        loggedIn = true;

                        var user = await mysql.runQuerySingle("SELECT username FROM users WHERE secret = ?", [clientSecret]);
                        var username = user.username;

                        userLoggedIn = username;

                        var tokenRow = await mysql.runQuerySingle(
                            "SELECT default_token FROM users WHERE secret = ?",
                            [clientSecret]
                        );
                        if (tokenRow?.default_token) defaultToken = tokenRow.default_token;

                        socket.write(`Login successful.\nWelcome ${formatUsername(username)}.\n`);


                        // TODO: ::NOTE:: - Spot marker for user logged in

                        players.playerJoined(username);


                    }
                    break;
                }
                case "whatami": {
                    socket.write("Didn't your parent tell you?...\n");
                    break;
                }
                case "whyami": {
                    socket.write("I don't think I should be the one to tell you that. Ask you parents\n");
                    break;
                }
                case "whereami": {
                    socket.write("Up my butt and around the corner\n");
                    break;
                }
                case "whenareyou": {
                    socket.write("Well, time is universal! When are you???\n");
                    break;
                }
                case "whenami": {
                    socket.write(`Now - ${new Date().toUTCString()}\n`);
                    break;
                }
                case "register": {
                    if (loggedIn) {
                        socket.write("Already logged in.\n");
                        continue;
                    } else {
                        socket.write("Enter a username: ");

                        var username = null;

                        while (username === null) {
                            var receivedUsername = await receive(socket);

                            var validUsername = !(await isUsernameTaken(receivedUsername));

                            if (!validUsername) {
                                socket.write("Username already taken.\nEnter a username: ");
                                continue;
                            }

                            if (receivedUsername.length < 3 || receivedUsername.length > 20) {
                                socket.write("Username must be between 3 and 20 characters.\nEnter a username: ");
                                continue;
                            }

                            if (!/^[a-zA-Z0-9_]+$/.test(receivedUsername)) {
                                socket.write("Username can only contain letters, numbers, and underscores.\nEnter a username: ");
                                continue;
                            }

                            username = receivedUsername;
                        }

                        socket.write("\n");
                        socket.write("*#*#*#*#*#*#*#*#*#*#*#*#*#*#*#*#*#*#*#*#*#*#*#*#*\n");
                        socket.write("# WARNING: DO NOT SHARE YOUR SECRET WITH ANYONE #\n");
                        socket.write("*  It will allow anyone to login as you!        *\n");
                        socket.write("#  Do not lose your secret or you can't login!  #\n");
                        socket.write("*#*#*#*#*#*#*#*#*#*#*#*#*#*#*#*#*#*#*#*#*#*#*#*#*\n\n")

                        clientSecret = secrets.generateSecret();

                        socket.write("Your secret: " + chalk.cyan(clientSecret) + "\n\n");

                        socket.write("Copy this down. This is the only way to login!!\n");
                        socket.write("(seriously - don't lose it!)\n\n");

                        socket.write("Registration successful.\n");

                        socket.write("As a registration reward, you get 5 random cards!\n");

                        for (var i = 0; i < 5; i++) {
                            var id = await utils.getRandomCard();
                            var cardDetails = await cards.getCardDetails(id);
                            var colorFunc = chalk[cardDetails.color] || chalk.reset;

                            socket.write(` - ${colorFunc(cardDetails.name + " (" + cardDetails.season + ")")}\n`);

                            await cards.giveCard(clientSecret, id);
                        }

                        socket.write("\nView your cards with the \"cards\" command!\n\n")

                        userLoggedIn = username;

                        loggedIn = true;

                        await registerUser(username, clientSecret);
                    }
                    break;
                }
                case "help": {
                    socket.write("Available commands:\n");
                    for (var key in commands) {
                        socket.write(`  ${key}: ${commands[key]}\n`);
                    }
                    break;
                }
                case "cards": {
                    if (cmdSplit.length == 2) {
                        var user = cmdSplit[1];

                        var userData = await mysql.runQuerySingle("SELECT secret FROM users WHERE username = ?", [user]);

                        if (!userData) {
                            socket.write("User not found.\n");
                            continue;
                        }

                        await displayCards(userData.secret, socket);
                        continue;
                    }

                    if (!loggedIn) {
                        socket.write("You must be logged in to use this command.\n");
                        continue;
                    }

                    await displayCards(clientSecret, socket);
                    break;
                } 
                case "exit": case "quit": {
                    if (userLoggedIn) players.playerLeft(userLoggedIn);
                    socket.write("Goodbye!\n");
                    socket.end();
                    return;
                } case "whoami": {
                    if (!loggedIn) {
                        socket.write("You are not logged in.\n");
                        continue;
                    }
                    socket.write(`User: ${formatUsername(userLoggedIn)}\n`);
                    break;
                }
                case "whoareyou": {
                    socket.write(`$ whoami\n${require('os').userInfo().username}\n`);
                    socket.write("The better question is \x1b[3mwhat\x1b[0m am I????????????????????????????");

                    await utils.delay(1000);

                    for (let i = 0; i <= 0x10FFFF; i++) {
                        if (i >= 1000) {
                            break;
                        }
                        try {
                            socket.write(String.fromCodePoint(i));
                        } catch (e) {
                        }
                    }
                    break;
                }
                case "whereareyou": {
                    http.get('http://ip-api.com/json/', (res) => {
                        let data = '';
                        res.on('data', (chunk) => data += chunk);
                        res.on('end', () => {
                            const location = JSON.parse(data);
                            socket.write(`${location.city}, ${location.country}\n`);
                        });
                    }).on('error', (err) => {
                        console.error('Error: ' + err.message);
                    });

                    await utils.delay(500);

                    break;
                }
                case "meaningoflife": {
                    socket.write("42\n");
                    break;
                }
                case "money": {
                    if (cmdSplit.length == 2) {
                        var user = cmdSplit[1];

                        var money = await mysql.runQuerySingle("SELECT money FROM users WHERE username = ?", [user]);

                        if (!money) {
                            socket.write("User not found.\n");
                        } else {
                            socket.write(`Money for ${formatUsername(user)}: ${formatMoney(money.money)}\n`);
                        }

                        continue;
                    }

                    if (!loggedIn) {
                        socket.write("You must be logged in to use this command.\n");
                        continue;
                    }

                    var money = await mysql.runQuerySingle("SELECT money FROM users WHERE secret = ?", [clientSecret]);
                    socket.write(`Money: ${formatMoney(money.money)}\n`);
                    break;
                } case "stats": {
                    if (cmdSplit.length == 2) {
                        var user = cmdSplit[1];

                        var stats = await mysql.runQuerySingle(
                            `SELECT 
                                u.username,
                                u.money,
                                COUNT(uc.card_id) AS total_cards,
                                COUNT(DISTINCT uc.card_id) AS unique_cards,
                                COUNT(DISTINCT c.season_id) AS total_seasons
                            FROM users u
                            LEFT JOIN user_cards uc ON u.secret = uc.user_secret
                            LEFT JOIN cards c ON uc.card_id = c.id
                            WHERE u.username = ?
                            GROUP BY u.username, u.money`,
                            [user]
                        );

                        if (!stats) {
                            socket.write("User not found.\n");
                        } else {
                            socket.write(`Stats for ${stats.username}:\n`);
                            socket.write(`  Money: ${formatMoney(stats.money)}\n`);
                            socket.write(`  Total Cards: ${stats.total_cards}\n`);
                            socket.write(`  Unique Cards: ${stats.unique_cards}\n`);
                            socket.write(`  Total Seasons: ${stats.total_seasons}\n`);
                        }

                        continue;
                    }

                    if (!loggedIn) {
                        socket.write("You must be logged in to use this command.\n");
                        continue;
                    }

                    var stats = await mysql.runQuerySingle(
                        `SELECT 
                            u.username,
                            u.money,
                            COUNT(uc.card_id) AS total_cards,
                            COUNT(DISTINCT uc.card_id) AS unique_cards,
                            COUNT(DISTINCT c.season_id) AS total_seasons
                        FROM users u
                        LEFT JOIN user_cards uc ON u.secret = uc.user_secret
                        LEFT JOIN cards c ON uc.card_id = c.id
                        WHERE u.secret = ?
                        GROUP BY u.username, u.money`,
                        [clientSecret]
                    );

                    socket.write(`Stats for ${stats.username}:\n`);
                    socket.write(`  Money: ${formatMoney(stats.money)}\n`);
                    socket.write(`  Total Cards: ${stats.total_cards}\n`);
                    socket.write(`  Unique Cards: ${stats.unique_cards}\n`);
                    socket.write(`  Total Seasons: ${stats.total_seasons}\n`);
                    break;
                }
                case "search-cards": {
                    if (cmdSplit.length < 2) {
                        socket.write("Usage: search-cards <query>\n");
                        continue;
                    }

                    var query = cmdSplit.slice(1).join(" ");
                    var results = await mysql.runQuery(
                        "SELECT c.name, s.name AS season FROM cards c JOIN seasons s ON c.season_id = s.id WHERE c.name LIKE ?",
                        [`%${query}%`]
                    );

                    if (results.length === 0) {
                        socket.write("No cards found.\n");
                    } else {
                        socket.write(`Cards matching "${query}":\n`);
                        for (var card of results) {
                            socket.write(`  ${card.name} (${card.season})\n`);
                        }
                    }
                    break;
                } case "search-seasons": {
                    if (cmdSplit.length < 2) {
                        socket.write("Usage: search-seasons <query>\n");
                        continue;
                    }

                    var query = cmdSplit.slice(1).join(" ");
                    var results = await mysql.runQuery(
                        "SELECT name FROM seasons WHERE name LIKE ?",
                        [`%${query}%`]
                    );

                    if (results.length === 0) {
                        socket.write("No seasons found.\n");
                    } else {
                        socket.write(`Seasons matching "${query}":\n`);
                        for (var season of results) {
                            socket.write(`  ${season.name}\n`);
                        }
                    }
                    break;
                } case "search-users": {
                    if (cmdSplit.length < 2) {
                        socket.write("Usage: search-users <query>\n");
                        continue;
                    }

                    var query = cmdSplit.slice(1).join(" ");
                    var results = await mysql.runQuery(
                        "SELECT username FROM users WHERE username LIKE ?",
                        [`%${query}%`]
                    );

                    if (results.length === 0) {
                        socket.write("No users found.\n");
                    } else {
                        socket.write(`Users matching "${query}":\n`);
                        for (var user of results) {
                            socket.write(`  ${formatUsername(user.username)}\n`);
                        }
                    }
                    break;
                } case "token": {
                    if (!loggedIn) {
                        socket.write("You must be logged in to use this command.\n");
                        continue;
                    }

                    if (cmdSplit.length < 2) {
                        socket.write("Usage: token <+|-|list|get|def> [name (except list)] [server_id]\n");
                        continue;
                    }

                    if (cmdSplit[1] === "+") {
                        var name = cmdSplit[2];
                        var serverFor = cmdSplit[3];
                        if (!(name || serverFor)) {
                            socket.write("Usage: token + <name> <server_id>\n");
                            continue;
                        }

                        var value = crypto.randomBytes(16).toString('hex');
                        var id = crypto.randomBytes(16).toString('hex');

                        await mysql.runQueryNoResult(
                            "INSERT INTO tokens (id, user_secret, name, value, server_for) VALUES (?, ?, ?, ?, ?)",
                            [id, clientSecret, name, value, serverFor]
                        );

                        socket.write(`Created token ${name} with value ${value}\n`);
                    } else if (cmdSplit[1] === "-") {
                        var name = cmdSplit[2];
                        if (!name) {
                            socket.write("Usage: token - <name>\n");
                            continue;
                        }

                        await mysql.runQueryNoResult(
                            "DELETE FROM tokens WHERE user_secret = ? AND name = ?",
                            [clientSecret, name]
                        );

                        socket.write(`Deleted token ${name}\n`);
                    } else if (cmdSplit[1] === "list") {
                        var tokens = await mysql.runQuery(
                            "SELECT name, server_for FROM tokens WHERE user_secret = ?",
                            [clientSecret]
                        );

                        if (tokens.length === 0) {
                            socket.write("No tokens found.\n");
                        } else {
                            socket.write("Tokens:\n");
                            for (var token of tokens) {
                                socket.write(`  ${token.name} (intended for ${token.server_for})\n`);
                            }
                        }
                    } else if (cmdSplit[1] === "get") {
                        var token = await mysql.runQuerySingle(
                            "SELECT value, server_for FROM tokens WHERE user_secret = ? AND name = ?",
                            [clientSecret, cmdSplit[2]]
                        );

                        if (!token) {
                            socket.write("Token not found.\n");
                        } else {
                            socket.write(`Value for token ${cmdSplit[2]} (intented for ${token.server_for}): ${token.value}\n`);
                        }
                    } else if (cmdSplit[1] == "def") {
                        if (!cmdSplit[2]) {
                            socket.write("Usage: token def <name>\n");
                            continue;
                        }

                        var token = await mysql.runQuerySingle(
                            "SELECT value FROM tokens WHERE user_secret = ? AND name = ?",
                            [clientSecret, cmdSplit[2]]
                        );

                        if (!token) {
                            socket.write("Token not found.\n");
                            continue;
                        }

                        await mysql.runQueryNoResult(
                            "UPDATE users SET default_token = ? WHERE secret = ?",
                            [token.value, clientSecret]
                        );

                        defaultToken = token.value;
                        socket.write(`Set default token: ${cmdSplit[2]}\n`);
                    } else {
                        socket.write("Usage: token <+|-|list|get|def> [name (except list)] [server_id]\n");
                        continue;
                    }

                    break;
                } case "server": case "servers": {
                    if (!loggedIn) {
                        socket.write("You must be logged in to use this command.\n");
                        continue;
                    }

                    if (cmdSplit.length < 2) {
                        socket.write("Usage: servers <+|-|list|get> [name (except list)]\n");
                        continue;
                    }

                    if (cmdSplit[1] === "+") {
                        if (!cmdSplit[2] || !cmdSplit[3]) {
                            socket.write("Usage: servers + <name> <url>\n");
                            continue;
                        }

                        var id = crypto.randomBytes(16).toString('hex');

                        await mysql.runQueryNoResult(
                            "INSERT INTO servers (id, user_secret, name, value) VALUES (?, ?, ?, ?)",
                            [id, clientSecret, cmdSplit[2], cmdSplit[3]]
                        );

                        socket.write(`Created server ${cmdSplit[2]} pointing to ${cmdSplit[3]}\n`);
                    } else if (cmdSplit[1] === "-") {
                        if (!cmdSplit[2]) {
                            socket.write("Usage: servers - <name>\n");
                            continue;
                        }

                        await mysql.runQueryNoResult(
                            "DELETE FROM servers WHERE user_secret = ? AND name = ?",
                            [clientSecret, cmdSplit[2]]
                        );

                        socket.write(`Deleted server ${cmdSplit[2]}\n`);
                    } else if (cmdSplit[1] === "list") {
                        var servers = await mysql.runQuery(
                            "SELECT name, value FROM servers WHERE user_secret = ?",
                            [clientSecret]
                        );

                        if (servers.length === 0) {
                            socket.write("No servers found.\n");
                        } else {
                            socket.write("Servers:\n");
                            for (var server of servers) {
                                socket.write(`  ${server.name}: ${server.value}\n`);
                            }
                        }
                    } else if (cmdSplit[1] === "get") {
                        if (!cmdSplit[2]) {
                            socket.write("Usage: servers get <name>\n");
                            continue;
                        }

                        var server = await mysql.runQuerySingle(
                            "SELECT value FROM servers WHERE user_secret = ? AND name = ?",
                            [clientSecret, cmdSplit[2]]
                        );

                        if (!server) {
                            socket.write("Server not found.\n");
                        } else {
                            socket.write(`Value for server ${cmdSplit[2]}: ${server.value}\n`);
                        }
                    } else {
                        socket.write("Usage: servers <+|-|list|get> [name (except list)]\n");
                    }

                    break;
                } case "connect-chat": {
                    if (!loggedIn) {
                        socket.write("You must be logged in to use this command.\n");
                        continue;
                    }

                    if (cmdSplit.length < 2) {
                        socket.write("Usage: connect-chat <server-url|server-name> [token-name]\n");
                        continue;
                    }

                    if (cmdSplit[1].split(":").length != 2) {
                        var server = await mysql.runQuerySingle(
                            "SELECT value FROM servers WHERE user_secret = ? AND name = ?",
                            [clientSecret, cmdSplit[1]]
                        );
                        if (!server) {
                            socket.write("Server not found.\n");
                            continue;
                        }

                        console.log(server.value);

                        connectedServer = server.value;
                    } else {
                        connectedServer = cmdSplit[1];
                    }

                    if (cmdSplit[2]) {
                        var token = await mysql.runQuerySingle(
                            "SELECT value FROM tokens WHERE user_secret = ? AND name = ?",
                            [clientSecret, cmdSplit[2]]
                        );

                        if (!token) {
                            socket.write("Token not found.\n");
                            continue;
                        } else {
                            usedToken = token.value;
                    }

                    } else {
                        if (defaultToken == "") {
                            socket.write("No default token selected. Run token def <token_name>.\n");
                            continue;
                        } else {
                            usedToken = defaultToken;
                        }
                    }
                    
                    socket.write(`Connecting...\n`);

                    if (chatEmitter) {
                        chatEmitter.emit("closeChat");
                    }

                    chatEmitter = new EventEmitter();

                    chatEmitter.on("connectFail", function() {
                        chatEmitter = null;
                        socket.write("\rFailed to connect.\n> ")
                    });

                    chatEmitter.on("connected", function() {
                        socket.write("\rConnected.\n> ")
                    });

                    console.log(connectedServer, usedToken);

                    chatServers.createChatServerConnection(connectedServer, usedToken, socket, chatEmitter);

                    break;
                } case "chat-console": {
                    if (!loggedIn) {
                        socket.write("You must be logged in to use this command.\n");
                        continue;
                    }

                    if (!chatEmitter) {
                        socket.write("You are not connected to a server.\n");
                        continue;
                    }

                    socket.write("Valid chat commands are: /exit, /color <color> <message>\nUse /exit to exit.\n\n");

                    while (true) {
                        socket.write("[Chat] > ");

                        var message = (await receive(socket)).trim();
                        var messageSplit = message.split(" ");

                        if (messageSplit.length > 0) {

                            if (messageSplit[0] == "/exit") {
                                break;
                            }

                            if (messageSplit[0] == "/color") {
                                if (messageSplit.length > 2) {
                                    if (validColors.includes(messageSplit[1])) {
                                        const colorFn = chalk[messageSplit[1]];
                                        const remaining = messageSplit.slice(2);

                                        var toUser = undefined;
                                        if (messageSplit.length >= 2 && messageSplit[messageSplit.length - 1][0] === "@") {
                                            toUser = remaining[remaining.length - 1].slice(1);
                                            remaining.pop();
                                        }

                                        const msgText = colorFn(remaining.join(" ")) + chalk.reset("");
                                        chatEmitter.emit("sendMessage", { message: msgText, to: toUser });
                                        continue;
                                    } else {
                                        socket.write("Invalid color.\nValid colors:\n");

                                        const colWidth = Math.max(...validColors.map(c => c.length)) + 2;

                                        for (var i = 0; i < validColors.length; i++) {
                                            socket.write(validColors[i].padEnd(colWidth));
                                            if (i % 3 === 2) {
                                                socket.write("\n");
                                            }
                                        }
                                        if (validColors.length % 3 !== 0) {
                                            socket.write("\n");
                                        }
                                        continue;
                                    }
                                } else {
                                    socket.write("Usage: /color <color> <message>\n");
                                    continue;
                                }
                            }

                            var toUser = undefined;
                            if (messageSplit.length >= 2 && messageSplit[messageSplit.length - 1][0] === "@") {
                                toUser = messageSplit[messageSplit.length - 1].slice(1);
                            }

                            const msgText = toUser
                                ? messageSplit.slice(0, messageSplit.length - 1).join(" ")
                                : message;

                            chatEmitter.emit("sendMessage", { message: msgText, to: toUser });
                        }
                    }

                    break;
                } case "message": {
                    if (!loggedIn) {
                        socket.write("You must be logged in to use this command.\n");
                        continue;
                    }

                    if (!chatEmitter) {
                        socket.write("You are not connected to a server.\n");
                        continue;
                    }

                    if (cmdSplit.length < 2) {
                        socket.write("Usage: message <message> [@username]\n");
                        continue;
                    }

                    var toUser = undefined;
                    if (cmdSplit.length >= 3 && cmdSplit[cmdSplit.length - 1][0] === "@") {
                        toUser = cmdSplit[cmdSplit.length - 1].slice(1);
                    }

                    const msgText = toUser
                        ? cmdSplit.slice(1, cmdSplit.length - 1).join(" ")  // strip @username
                        : cmdSplit.slice(1).join(" ");

                    chatEmitter.emit("sendMessage", { message: msgText, to: toUser });
                    break;
                } case "collect": {
                    if (!loggedIn) {
                        socket.write("You need to be logged in to use this command.\n");
                    }

                    try {
                        let money = parseInt(cmdSplit[1]);

                        if (money < 0) {
                            socket.write("Your account has been terminated for trying to scam people.\n");
                            await utils.delay(2500);
                            socket.write("Just kidding ;)\n");
                            break;
                        }

                        let cards = cmdSplit[2] ? cmdSplit[2].split(",").map(a => parseInt(a)) : [];

                        console.log(cmdSplit[2].split(","));

                        var userMoney = await mysql.runQuerySingle("SELECT money FROM users WHERE secret = ?", [clientSecret]);
                        if (!userMoney) {
                            socket.write("Uh-oh!!!! Where is your money?????\n");
                            break;
                        }

                        userMoney = parseInt(userMoney.money);

                        if(isNaN(money) || userMoney < money) {
                            socket.write("Not enough money and/or money specified improperly.\n");
                            break;
                        }
                        let userCards = await (mysql.runQuery("SELECT card_id FROM user_cards WHERE user_secret = ?", [clientSecret]));
                        
                        console.log(userCards);

                        if (!userCards) {
                            socket.write("You have no cards??\n");
                        }
                        
                        userCards = userCards.map(a => parseInt(a.card_id));

                        console.log("U,C: ", userCards, cards);

                        let flag = false;
                        for(var i of cards) {
                            let idx = userCards.indexOf(i);
                            if(idx == -1) {
                                socket.write("One or more cards specified is not available in your account.\n");
                                flag = true;
                                break;
                            }
                            userCards.splice(idx, 1);
                        }

                        var collectionId = crypto.randomBytes(16).toString("hex");

                        if(flag) break;
                        await mysql.runQueryNoResult("UPDATE users SET money = money - ? WHERE secret = ?", [money, clientSecret]);
                        await mysql.runQueryNoResult("INSERT INTO collection_desc (collection_id, money) VALUES (?, ?)", [collectionId, money]);
                        for(var i of cards) {
                            var selectedCard = await mysql.runQuerySingle("SELECT hash FROM user_cards WHERE card_id = ? AND user_secret = ?", [i, clientSecret]);

                            if (!selectedCard) {
                                socket.write("Error: something screwed up.\n");
                            }

                            await mysql.runQueryNoResult("UPDATE user_cards SET user_secret = 'floating_card' WHERE hash = ?", [selectedCard.hash]);
                            await mysql.runQueryNoResult("INSERT INTO collections (collection_id, card_hash) VALUES (?, ?)", [collectionId, selectedCard.hash]);
                        }
                        
                        socket.write(`Created collection with id: ${collectionId}\n`);
                    } catch (e) {
                        console.log(e);
                        socket.write("Usage: collect <picons> <<card1>,[card2],[card3]...,[cardN]>\n")
                    }
                    break;
                } case "redeem": {
                    if (cmdSplit.length < 2) {
                        socket.write("Usage: redeem <collection-ID>\n");
                        break;
                    }

                    var collections = await mysql.runQuery("SELECT card_hash FROM collections WHERE collection_id = ?", [cmdSplit[1]]);
                    var collectionDesc = await mysql.runQuerySingle("SELECT money FROM collection_desc WHERE collection_id = ?", [cmdSplit[1]]);

                    if (!collections || collections.length == 0 || !collectionDesc) {
                        socket.write("Collection not found!\n");
                        break;
                    }

                    for (var i of collections) {
                        var collectionHash = i.card_hash;

                        // Give the cards
                        await mysql.runQueryNoResult("UPDATE user_cards SET user_secret = ? WHERE hash =  ?", [clientSecret, collectionHash]);
                    }

                    // Delete collection entries
                    await mysql.runQueryNoResult("DELETE FROM collections WHERE collection_id = ?", [cmdSplit[1]]);
                    
                    console.log(`Money: ${collectionDesc.money}`);

                    // Add the money to the user
                    await mysql.runQueryNoResult("UPDATE users SET money = money + ? WHERE secret = ?", [collectionDesc.money, clientSecret])
                    
                    // Delete collection_desc entry
                    await mysql.runQueryNoResult("DELETE FROM collection_desc WHERE collection_id = ?", [cmdSplit[1]]);

                    break;
                } case "recol": {
                    if (cmdSplit.length < 2) {
                        socket.write("Usage: recol <collection-ID>\n");
                        break;
                    }

                    var collections = await mysql.runQuery("SELECT card_hash FROM collections WHERE collection_id = ?", [cmdSplit[1]]);
                    var collectionDesc = await mysql.runQuerySingle("SELECT money FROM collection_desc WHERE collection_id = ?", [cmdSplit[1]]);

                    if (!collections || collections.length == 0 || !collectionDesc) {
                        socket.write("Collection not found!\n");
                        break;
                    }

                    var newId = crypto.randomBytes(16).toString('hex');

                    await mysql.runQueryNoResult("UPDATE collections SET collection_id = ? WHERE collection_id = ?", [newId, cmdSplit[1]]);       // ← array
                    await mysql.runQueryNoResult("UPDATE collection_desc SET collection_id = ? WHERE collection_id = ?", [newId, cmdSplit[1]]);   // ← fixed table name, array

                    socket.write(`Your new id is: ${newId}\n`);

                    break;
                } case "peek": {
                    if (cmdSplit.length < 2) {
                        socket.write("Usage: peek <collection-ID>\n");
                        break;
                    }

                    var collections = await mysql.runQuery("SELECT card_hash FROM collections WHERE collection_id = ?", [cmdSplit[1]]);
                    var collectionDesc = await mysql.runQuerySingle("SELECT money FROM collection_desc WHERE collection_id = ?", [cmdSplit[1]]);

                    if (!collections || collections.length == 0 || !collectionDesc) {
                        socket.write("Collection not found!\n");
                    } else {
                        var moneyVal = collectionDesc.money;

                        socket.write("This collection is worth: ");
                        socket.write(formatMoney(moneyVal));
                        socket.write("\nThis collection has: \n");
                        var cardTotals = {};

                        for (var i of collections) {
                            var selected_card = await mysql.runQuerySingle("SELECT card_id FROM user_cards WHERE hash = ?", [i.card_hash]);

                            if (!selected_card) {
                                socket.write("[WARNING] Invalid card stored in collection (The card might have been deleted?)");
                            } else {
                                if (!cardTotals[selected_card.card_id]) {
                                    cardTotals[selected_card.card_id] = 0;
                                }
                                cardTotals[selected_card.card_id]++;
                            }
                        }

                        for (var i of Object.keys(cardTotals)) {
                            var cardDetails = await cards.getCardDetails(i);
                                var colorFunc = chalk[cardDetails.color] || chalk.reset;
                                socket.write(`${cardTotals[i]}x ${colorFunc(cardDetails.name + " (" + cardDetails.season + ")")}\n`);
                        }
                    }

                    break;
                } case "peek-api": {
                    if (cmdSplit.length < 2) {
                        socket.write("Usage: peek-api <collection-ID>\n");
                        break;
                    }

                    var collections = await mysql.runQuery("SELECT card_hash FROM collections WHERE collection_id = ?", [cmdSplit[1]]);
                    var collectionDesc = await mysql.runQuerySingle("SELECT money FROM collection_desc WHERE collection_id = ?", [cmdSplit[1]]);

                    if (!collections || collections.length == 0 || !collectionDesc) {
                        socket.write("COLLECTION_NOT_FOUND\n");
                    } else {
                        var moneyVal = collectionDesc.money;

                        socket.write("WORTH: ");
                        socket.write(moneyVal.toString());
                        socket.write("\nHAS: ");
                        const cardIds = [];
                        
                        for (var i of collections) {
                            var selected_card = await mysql.runQuerySingle("SELECT card_id FROM user_cards WHERE hash = ?", [i.card_hash]);
                            cardIds.push(selected_card.card_id);
                        }

                        socket.write(cardIds.join(","));
                        socket.write("\n");
                    }

                    break;
                } case "poke": {
                    socket.write("Ouch! That tickles.\n");
                } case "shop": {
                    if (cmdSplit.length < 2) {
                        socket.write("Usage: shop <list|buy> [args]\n");
                        break;
                    }

                    if (cmdSplit[1] == "list") {
                        var shopContent = Object.values(await shop.listShop());

                        for (var i of shopContent) {
                            socket.write(`${formatMoney(i.cost)} - ${i.quantity} left: ${shop.NiceRarity[Object.keys(shop.Rarity).find(key => Math.round(shop.Rarity[key] * 10) === Math.round(i.rarity * 10))]} deck (${i.cards})\n`);
                        } 

                    } else if (cmdSplit[1] == "buy") {
                        if (cmdSplit.length < 3) {
                            socket.write("Usage: shop buy <rarity:count>\n");
                            break;
                        }

                        // shop buy rarity:count
                        // shop buy common:1
                        var [rarity, count] = cmdSplit[2].split(":");
                        rarity = rarity.toLowerCase();
                        count = parseInt(count);

                        if (!rarity || !shop) {
                            socket.write("Usage: shop buy <rarity:count>\n");
                            break;
                        }

                        var raritiesTable = {};

                        for (var i of Object.keys(shop.Rarity)) {
                            raritiesTable[i.toLowerCase()] = shop.Rarity[i];
                        }

                        console.log(rarity, count, raritiesTable, raritiesTable[rarity]);

                        var shopContent = await shop.listShop();
                        shopContent = Object.values(shopContent);

                        var found = false;

                        for (var i of shopContent) {
                            if (toString(i.rarity) === toString(raritiesTable[rarity])) {
                                if (i.cards == count) {
                                    found = true;
                                    break;
                                }
                            }
                        }

                        console.log(rarity, count);

                        if (!found) {
                            socket.write("Rarity/count not found.\n");
                        }

                        var entry = await mysql.runQuerySingle("SELECT * FROM shop WHERE rarity = ? AND count = ? LIMIT 1", [raritiesTable[rarity], count]);

                        if (!entry) {
                            socket.write("No stock left of this type.\n");
                            continue;
                        }

                        var money = await mysql.runQuerySingle("SELECT money FROM users WHERE username = ?", [user.username]);
                        console.log(money, user);

                        if (!money) {
                            socket.write("You have no money lol.\n");
                            continue;
                        } else if (money.money < i.cost) {
                            socket.write("You don't have enough money to buy this.\n");
                            continue;
                        }

                        var colID = entry.collection_id;

                        await mysql.runQueryNoResult("UPDATE users SET money = money - ? WHERE username = ?", [entry.cost, user.username]);
                        await mysql.runQueryNoResult("DELETE FROM shop WHERE rarity = ? AND count = ? LIMIT 1", [raritiesTable[rarity], count]);

                        socket.write(`Your collection id is: ${colID}\nRedeem with: redeem ${colID}\n`);
                    }

                    break;
                } case "logout": case "🪵out": {
                    if (userLoggedIn) players.playerLeft(userLoggedIn);
                    loggedIn = false;
                    clientSecret = "";
                    userLoggedIn = "";
                    chatEmitter = "";
                    defaultToken = "";
                    usedToken = "";
                    connectedServer = null;
                    socket.write("Logged out.\n");
                    break;
                } case "yawn": {
                    socket.write(" * Yawns *\n");
                } default: {
                    socket.write("Unknown command.\n");
                }
            }
        }
    } catch (err) {
        if (err.message !== 'disconnected') {
            console.error('Client error:', err);
        }
        if (userLoggedIn) {
            players.playerLeft(userLoggedIn);
        }
        socket.destroy();
        return;
    }
}

exports.handle = clientHandler;