var fs = require('fs');

exports.sysLogins = function() {
    var logins = [];
    var data = fs.readFileSync('private/syslogins.json', 'utf-8');
    try {
        logins = JSON.parse(data);
    } catch (e) {
        console.error('Error parsing syslogins.json:', e);
    }
    return logins;
}