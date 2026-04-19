const chalkModule = require('chalk');
var { AsciiTable3 } = require('ascii-table3');

const chalk = new chalkModule.Chalk({level: 1});

function welcomeMessage(socket) {
    socket.write("Welcome to Fusion!\n");
    socket.write("Type 'login' to login or 'register' to create a new account.\n");
    socket.write("Fusion is in early development, so expect bugs and missing features.\n");
    socket.write("If you encounter any issues, please report them on GitHub\n\n");
}

function receive(socket) {
    return new Promise((resolve) => {
        socket.once('data', (data) => resolve(data.toString().trim()));
    });
}

async function verifySecret(secret, socket) {
    return new Promise((resolve) => {
        resolve(true);
    });
}

function generateSecret() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let secret = '';
    for (let i = 0; i < 32; i++) {
        secret += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return secret;
}

async function isUsernameTaken(username) {
    return new Promise((resolve) => {
        resolve(false);
    });
}

async function registerUser(username, secret) {
    return new Promise((resolve) => {
        resolve();
    });
}

async function getCardsForUser(secret) {
    return new Promise((resolve) => {
        resolve([
            {
                secret: 6,
                id: 2
            },
            {
                secret: 45,
                id: 1
            },
            {
                secret: 66,
                id: 3
            },
            {
                secret: 67,
                id: 3
            },
            {
                secret: 68,
                id: 4
            },
            {
                secret: 69,
                id: 1
            }
        ]);
    });
}

const CARDS = {
    1: {
        name: "Fireball",
        season: "Basic"
    },
    2: {
        name: "Water Elemental",
        season: "Christmas"
    },
    3: {
        name: "Frostbolt",
        season: "Halloween"
    },
    4: {
        name: "Arcane Intellect",
        season: "Halloween"
    }
};

const SEASONS = {
    "Basic": {
        color: chalk.gray
    },
    "Christmas": {
        color: chalk.green
    },
    "Halloween": {
        color: chalk.magenta
    }
}

async function getCardDetails(card) {
    return new Promise((resolve) => {
        resolve({
            name: CARDS[card.id]?.name || "Unknown Card",
            season: CARDS[card.id]?.season || "Unknown"
        });
    });
}

async function displayCards(secret, socket) {
    return new Promise(async (resolve) => {
    
        var out = "";

        var cards = await getCardsForUser(secret);

        var totals = new Map();

        for (var i of cards) {
            totals.set(i.id, (totals.get(i.id) || 0) + 1);
        }

        for (var [id, count] of totals) {
            var cardDetails = await getCardDetails({ id });

            var colorFunc = SEASONS[cardDetails.season]?.color || chalk.reset;

            out += `${count}x ${colorFunc(cardDetails.name + " " + cardDetails.season)}\n`;
        }

        socket.write(out);

        resolve();
    });
}

async function clientHandler(socket) {
    var loggedIn = false;
    var clientSecret = "";

    welcomeMessage(socket);

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

                var valid = await verifySecret(clientSecret, socket);

                if (!valid) {
                    socket.write("Invalid secret.\n");
                    continue;
                }

                loggedIn = true;
                socket.write("Login successful.\n");
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
                        socket.write("Username already taken.\n");
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

                clientSecret = generateSecret();
                socket.write("Your secret: " + chalk.cyan(clientSecret) + "\n\n");

                socket.write("Copy this down. This is the only way to login!!\n");
                socket.write("(seriously - don't lose it!)\n\n");

                socket.write("Registration successful.\n");

                await registerUser(username, clientSecret);
            }
        } else if (cmd == "cards") {
            if (!loggedIn) {
                socket.write("You must be logged in to use this command.\n");
                continue;
            }

            await displayCards(clientSecret, socket);
        }
    }
}

exports.handle = clientHandler;