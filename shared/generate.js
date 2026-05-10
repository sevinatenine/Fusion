const fs = require("fs");
const words = fs.readFileSync("words.txt", "utf8").split("\n");

function makeWord() {
    return words[Math.floor(Math.random() * words.length)];
}

console.log([makeWord(), makeWord(), makeWord()].join("-"))