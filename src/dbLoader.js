const fs = require('fs');
const path = require('path');
const readline = require('readline');
const mysql = require('./mysql');

const FILES = [
    { file: 'data/cards.csv', table: 'cards' },
    { file: 'data/seasons.csv', table: 'seasons' },
];

async function loadTable(filePath, table) {
    const rl = readline.createInterface({
        input: fs.createReadStream(path.resolve(filePath)),
        crlfDelay: Infinity
    });

    const rows = [];
    let headers = null;

    for await (const line of rl) {
        if (!headers) { headers = line.split(',').map(h => h.trim()); continue; }
        if (!line.trim()) continue;

        const cols = line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g)
            ?.map(v => v.replace(/^"|"$/g, '').trim()) ?? [];

        if (!cols[0]) continue;
        rows.push(cols);
    }

    if (rows.length === 0) return;

    await mysql.runRawQuery(`SET FOREIGN_KEY_CHECKS = 0`);
    await mysql.runRawQuery(`DELETE FROM ${table}`);
    await mysql.runRawQuery(`SET FOREIGN_KEY_CHECKS = 1`);

    const placeholders = `(${headers.map(() => '?').join(',')})`;
    const batchSize = 500;
    for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        await mysql.runRawQuery(`SET SESSION sql_mode = 'NO_AUTO_VALUE_ON_ZERO'`);
        await mysql.runRawQuery(
            `INSERT INTO ${table} (${headers.join(',')}) VALUES ${batch.map(() => placeholders).join(',')}`,
            batch.flat()
        );
    }
}

async function loadDB() {
    var loaded = 0;
    for (const { file, table } of FILES) {
        await loadTable(file, table);
        loaded++;
    }

    return loaded;
}

exports.loadDB = loadDB;