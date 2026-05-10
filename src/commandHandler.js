const chalkModule = require('chalk');
var { AsciiTable3 } = require('ascii-table3');
const crypto = require('crypto');
const EventEmitter = require('events');

const mysql = require("./mysql");
const cards = require("./cards");
const secrets = require('./secrets');
const utils = require('./utils');
const chatServers = require("./chatServers");
const sysLogins = require('./sysLogins').sysLogins();

const chalk = new chalkModule.Chalk({ level: 1 });

function welcomeMessage(socket) {
    socket.write("Welcome to Fusion!\n\n");
    socket.write("Type 'login' to login or 'register' to create a new account.\n");
    socket.write("Fusion is in early development, so expect bugs and missing features.\n");
    socket.write("If you encounter any issues, please report them on GitHub\n\n");
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

        function onClose() { reject(new Error('disconnected')); }

        socket.on('data', onData);
        socket.once('close', onClose);
    });
}

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
    "",
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
    "token <+|-|list|get|def> [name (except list)]": "Configure identification tokens for external services",
    "servers <+|-|list|get> [name (except list)]": "Attach chat servers to names",
    "connect-chat <server-url|server-name> [token-name]": "Connect to the chat server",
    "message <message> [@username]": "Send a message to the chat (optionally to a specific user)",
    "chat-console": "Enters the chat console. Use exit command to leave.",
    "logout": "Logout of your account",
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

async function clientHandler(socket) {
    var loggedIn = false;
    var clientSecret = "";

    var userLoggedIn = "";
    var defaultToken = "";
    var connectedServer = "";
    var usedToken = "";
    var chatEmitter;

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
                    }
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
                    socket.write("The better question is \x1b[3mwhat\x1b[0m am I????????????????????????????");

                    await utils.delay(1000);

                    for (let i = 0; i <= 0x10FFFF; i++) {
                        try {
                            socket.write(String.fromCodePoint(i));
                        } catch (e) {
                        }
                    }
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
                        socket.write("Usage: token <+|-|list|get> [name (except list)]\n");
                        continue;
                    }

                    if (cmdSplit[1] === "+") {
                        var name = cmdSplit[2];
                        if (!name) {
                            socket.write("Usage: token + <name>\n");
                            continue;
                        }

                        var value = crypto.randomBytes(16).toString('hex');
                        var id = crypto.randomBytes(16).toString('hex');

                        await mysql.runQueryNoResult(
                            "INSERT INTO tokens (id, user_secret, name, value) VALUES (?, ?, ?, ?)",
                            [id, clientSecret, name, value]
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
                            "SELECT name FROM tokens WHERE user_secret = ?",
                            [clientSecret]
                        );

                        if (tokens.length === 0) {
                            socket.write("No tokens found.\n");
                        } else {
                            socket.write("Tokens:\n");
                            for (var token of tokens) {
                                socket.write(`  ${token.name}\n`);
                            }
                        }
                    } else if (cmdSplit[1] === "get") {
                        var token = await mysql.runQuerySingle(
                            "SELECT value FROM tokens WHERE user_secret = ? AND name = ?",
                            [clientSecret, cmdSplit[2]]
                        );

                        if (!token) {
                            socket.write("Token not found.\n");
                        } else {
                            socket.write(`Value for token ${cmdSplit[2]}: ${token.value}\n`);
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
                        socket.write("Usage: token <+|-|list|get> [name (except list)]\n");
                        continue;
                    }

                    break;
                } case "servers": {
                    if (!loggedIn) {
                        socket.write("You must be logged in to use this command.\n");
                        continue;
                    }

                    if (cmdSplit.length < 2) {
                        socket.write("Usage: servers [+|-|list|get] [name (except list)]\n");
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
                        socket.write("Usage: servers [+|-|list|get] [name (except list)]\n");
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
                } case "logout": case "🪵out": {
                    loggedIn = false;
                    clientSecret = "";
                    userLoggedIn = "";
                    socket.write("Logged out.\n");
                    break;
                }
                default: {
                    socket.write("Unknown command.\n");
                }
            }
        }
    } catch (err) {
        if (err.message !== 'disconnected') {
            console.error('Client error:', err);
        }
        socket.destroy();
        return;
    }
}

exports.handle = clientHandler;