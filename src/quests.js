const fs = require("fs");

const players = require("./players");
const mysql = require("./mysql");

const quests = JSON.parse(fs.readFileSync("data/quests.json"));

function findQuestsByType(type) {
    return Object.entries(quests)
        .filter(([_, quest]) =>
            quest.requirements.some(req => req.type === type)
        );
}

var completeQuestsCache = {};

function userCompletedQuests() {

}

const playtimeQuests = findQuestsByType("time");

async function startQuests() {
    console.log(playtimeQuests);

    players.playerEvents.on("timeUpdate", async function(times) {
        for (const i of Object.keys(times)) {
            for (const [questName, quest] of playtimeQuests) {
                for (const req of quest.requirements) {
                    if (times[i] >= req.value) {
                        const result = await players.getQuestsCompleted(i);

                        const d = result?.quests_completed || [];

                        if (d.includes(questName)) {
                            continue;
                        }

                        console.log(questName, "complete for", i);

                        d.push(questName);
                        await players.storeQuestsCompleted(i, d);
                    }
                }
            }
        }
    });
}

exports.startQuests = startQuests;