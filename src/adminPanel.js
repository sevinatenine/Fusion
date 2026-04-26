const readline = require('node:readline/promises');
const { stdin: input, stdout: output, exit } = require('node:process');
const chalkModule = require('chalk');

const mysql = require("./mysql");
const cards = require("./cards");

const chalk = new chalkModule.Chalk({ level: 1 });

async function displayCards(userSecret) {
    const totals = await cards.getCardTotals(userSecret);

    if (totals.size === 0) {
        console.log("  No cards.");
        return;
    }

    for (var [id, count] of totals) {
        var cardDetails = await cards.getCardDetails(id);
        var colorFunc = chalk[cardDetails.color] || chalk.reset;
        console.log(`  ${count}x ${colorFunc(cardDetails.name + " (" + cardDetails.season + ")")}`);
    }
}

exports.run = async function() {
    const rl = readline.createInterface({ input, output });

    console.log("\nFusion Admin Panel");
    console.log("Commands: users, cards <username>, give <username> <cardId>, money <username> <amount>, quit\n");

    while (true) {
        try {
        const line = await rl.question('admin> ');
        const cmdSplit = line.split(" ").filter(s => s.length > 0);

        if (cmdSplit.length === 0) continue;

        const cmd = cmdSplit[0].toLowerCase();

        if (cmd === "users") {
            const users = await mysql.runQuery("SELECT id, username, money, created_at FROM users", []);
            if (users.length === 0) {
                console.log("No users.");
            } else {
                for (const user of users) {
                    console.log(`  ${chalk.cyan(user.username)} | $${user.money} | ${user.created_at} | ${user.id}`);
                }
            }

        } else if (cmd === "cards") {
            const username = cmdSplit[1];
            if (!username) { console.log("Usage: cards <username>"); continue; }

            const user = await mysql.runQuerySingle("SELECT secret FROM users WHERE username = ?", [username]);
            if (!user) { console.log("User not found."); continue; }

            console.log(`Cards for ${chalk.cyan(username)}:`);
            await displayCards(user.secret);

        } else if (cmd === "give") {
            const username = cmdSplit[1];
            const cardId = parseInt(cmdSplit[2]);
            if (!username || cmdSplit[2] === undefined || isNaN(cardId)) { console.log("Usage: give <username> <cardId>"); continue; }

            const user = await mysql.runQuerySingle("SELECT secret FROM users WHERE username = ?", [username]);
            if (!user) { console.log("User not found."); continue; }

            const card = await mysql.runQuerySingle("SELECT c.name FROM cards c WHERE c.id = ?", [cardId]);
            if (!card) { console.log("Card not found."); continue; }

            const hash = await cards.giveCard(user.secret, cardId);
            console.log(`Gave ${chalk.green(card.name)} to ${chalk.cyan(username)} (hash: ${hash})`);

        } else if (cmd === "money") {
            const username = cmdSplit[1];
            const amount = parseInt(cmdSplit[2]);
            if (!username || isNaN(amount)) { console.log("Usage: money <username> <amount>"); continue; }

            const result = await mysql.runQueryNoResult(
                "UPDATE users SET money = money + ? WHERE username = ?",
                [amount, username]
            );
            console.log(`Gave ${chalk.yellow('$' + amount)} to ${chalk.cyan(username)}.`);

        } else if (cmd === "quit" || cmd === "exit") {
            console.log("Bye.");
            rl.close();
            process.exit(0);

        } else {
            console.log(`Unknown command: ${cmd}`);
        }
    } catch (AbortError) {
        console.log("^C\nGoodbye.")
        exit();
    }
    }
}