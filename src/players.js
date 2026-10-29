const players = new Map();
const EventEmitter = require('node:events');

const mysql = require("./mysql");

const playerEvents = new EventEmitter();

const starterData = {
    data: {
        time: 0
    }
};

function playerJoined(player) {
    players.set(player, {
        data: {
            time: 0
        }
    });
}

function playerLeft(player) {
    players.delete(player);
}

function getPlayers() {
    return players.keys();
}

function playerOnline(player) {
    return players.has(player);
}

function storePlayerData(player, field, data) {
    const p = players.get(player);
    if (!p) {
        return undefined;
    }

    p.data[field] = data;
    return data;
}

function storeQuestsCompleted(player, data) {
    mysql.runQueryNoResult(
        "UPDATE users SET quests_completed = ? WHERE username = ?;",
        [JSON.stringify(data), player]
    );
}

function getQuestsCompleted(player) {
    return mysql.runQuerySingle(
        "SELECT quests_completed FROM users WHERE username = ?;",
        [player]
    );
}

function getPlayerData(player, field) {
    return players.get(player)?.data?.[field];
}

var loop;

function startTracking() {
    loop = setInterval(function() {
        var times = {};

        for (i of getPlayers()) {
            times[i] = storePlayerData(i, "time", getPlayerData(i, "time") + 1);
        }

        playerEvents.emit('timeUpdate', times);
    }, 1000);
}

module.exports = {
    playerJoined,
    playerLeft,
    getPlayers,
    storePlayerData,
    getPlayerData,
    storeQuestsCompleted,
    getQuestsCompleted,
    startTracking,
    playerEvents
};