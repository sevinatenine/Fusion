const chalkModule = require('chalk');
var { AsciiTable3 } = require('ascii-table3');
const crypto = require('crypto');

const mysql = require("./mysql");
const cards = require("./cards");
const secrets = require('./secrets');

const chalk = new chalkModule.Chalk({ level: 1 });

function welcomeMessage(socket) {
    socket.write("Welcome to Fusion!\n\n");
    socket.write("Type 'login' to login or 'register' to create a new account.\n");
    socket.write("Fusion is in early development, so expect bugs and missing features.\n");
    socket.write("If you encounter any issues, please report them on GitHub\n\n");
}

function receive(socket) {
    return new Promise((resolve, reject) => {
        socket.once('data', (data) => resolve(data.toString().trim()));
        socket.once('close', () => reject(new Error('disconnected')));
        socket.once('error', (err) => reject(err));
    });
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

            if (cmd === "login" || cmd === "🪵in") {
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

                    socket.write(`Login successful.\nWelcome ${username}.\n`);
                }
            } else if (cmd === "register") {
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

                    await registerUser(username, clientSecret);
                }
            } else if (cmd =="help") {
                socket.write("Available commands:\n");
                for (var key in commands) {
                    socket.write(`  ${key}: ${commands[key]}\n`);
                }
            } else if (cmd == "cards") {
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
            } else if (cmd === "exit" || cmd === "quit") {
                socket.write("Goodbye!\n");
                socket.end();
                return;
            } else if (cmd == "whoami") {
                socket.write(`User: ${userLoggedIn}\n`);
            } else if (cmd == "money") {
                if (cmdSplit.length == 2) {
                    var user = cmdSplit[1];

                    var money = await mysql.runQuerySingle("SELECT money FROM users WHERE username = ?", [user]);

                    if (!money) {
                        socket.write("User not found.\n");
                    } else {
                        socket.write(`Money for ${user}: ${formatMoney(money.money)}\n`);
                    }

                    continue;
                }

                if (!loggedIn) {
                    socket.write("You must be logged in to use this command.\n");
                    continue;
                }

                var money = await mysql.runQuerySingle("SELECT money FROM users WHERE secret = ?", [clientSecret]);
                socket.write(`Money: ${formatMoney(money.money)}\n`);
            } else if (cmd == "stats") {
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
            } else if (cmd == "search-cards") {
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
            } else if (cmd == "search-seasons") {
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
            } else if (cmd == "search-users") {
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
                        socket.write(`  ${user.username}\n`);
                    }
                }
            } else if (cmd === "logout" || cmd === "🪵out") {
                loggedIn = false;
                clientSecret = "";
                userLoggedIn = "";
                socket.write("Logged out.\n");
            } else {
                socket.write("Unknown command.\n");
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