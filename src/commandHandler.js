const chalkModule = require('chalk');
var { AsciiTable3 } = require('ascii-table3');
const crypto = require('crypto');

const mysql = require("./mysql");
const cards = require("./cards");
const secrets = require('./secrets');

const chalk = new chalkModule.Chalk({ level: 1 });

function welcomeMessage(socket) {
    socket.write("Welcome to Fusion!\n");
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

            if (cmd === "login") {
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
            } else if (cmd == "cards") {
                if (!loggedIn) {
                    socket.write("You must be logged in to use this command.\n");
                    continue;
                }

                await displayCards(clientSecret, socket);
            } else if (cmd === "exit" || cmd === "quit") {
                socket.write("Goodbye!\n");
                socket.end();
            } else if (cmd == "whoami") {
                socket.write(`User: ${userLoggedIn}\n`);
            }
        }
    } catch (err) {
        if (err.message !== 'disconnected') {
            console.error('Client error:', err);
        }
        socket.destroy();
    }
}

exports.handle = clientHandler;