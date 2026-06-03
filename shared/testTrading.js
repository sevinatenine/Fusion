const net = require("net");
const readline = require('node:readline/promises');
const { stdin: input, stdout: output } = require('node:process');

async function prompt(q) {
  // 1. Create the stream interface
  const rl = readline.createInterface({ input, output });

  try {
    // 2. Await the answers sequentially
    return await rl.question(q);
   
  } catch (error) {
    console.error('An error occurred:', error);
  } finally {
    rl.close();
  }
}

var client = new net.Socket();
client.connect(9999, "localhost", () => {
    //console.log("Connected to server");
});

function handleMessage(msg) {
    console.log("Received message from server:", msg);
}

let buf = "";
client.on("data", (data) => {
    buf += data.toString();
    let i;
    while ((i = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (line) handleMessage(JSON.parse(line));
    }
});

async function send(type, data) {
    client.write(`${JSON.stringify({type, data})}\n`);
}

async function receive() {
    return new Promise((resolve, reject) => {
        client.once("data", (data) => {
            resolve(JSON.parse(data.toString()));
        });
    });
}

async function run() {
    var currentBondId;
    while(true) {
        var answer = await prompt("Create / join bond? (c/j) ");

        if (answer.toLowerCase() == "c") {
            await send("createBond", {});
            var res = await receive();
            console.log("Created bond with id " + res.data.bondId);
            currentBondId = res.data.bondId;
            break;
        } else if (answer.toLowerCase() == "j") {
            var bondId = await prompt("Enter bond id: ");
            await send("joinBond", { bondId });
            var res = await receive();
            if (res.success) {
                console.log("Joined bond with id " + bondId);
                currentBondId = bondId;
            } else {
                console.log("Failed to join bond with id " + bondId);
            }
            break;
        } else {
            console.log("Invalid input");
        }
    }

    var collectionId = await prompt("Enter collection id: ");
    var expectedPicons = await prompt("Enter expected picons: ");
    var expectedCards = await prompt("Enter expected cards (comma separated): ");

    await send("bondData", { bondId: currentBondId, offer: collectionId, expected: { picons: parseInt(expectedPicons), cards: expectedCards.split(",").map(x => parseInt(x.trim())) } });
    var res = await receive();

    if (res.data.traded) {
        console.log("Trade successful!");
        console.log("New collection id: " + res.data.otherOffer);
    } else {
        console.log("Trade failed: " + res.data.reason);
        console.log("Your offer: " + res.data.yourOffer);
    }
}

run();