## Command Reference

### General

#### `help`
Show the command reference.

- `help` — Prints all available commands

#### `whoami`
Show your current username.

- `whoami` — Prints the logged-in username

#### `exit`
Exit the program.

- `exit` — Closes the client

---

### Account

#### `login`
Login to your account.

- `login` — Prompts for credentials interactively

#### `register`
Register a new account.

- `register` — Prompts for a new username and password

#### `logout`
Logout of your account.

- `logout` — Ends the current session

---

### Profile

#### `cards [username]`
Show cards.

- `cards` — Show your own cards
- `cards alice` — Show alice's cards

#### `money [username]`
Show balance.

- `money` — Show your own balance
- `money alice` — Show alice's balance

#### `stats [username]`
Show stats.

- `stats` — Show your own stats
- `stats alice` — Show alice's stats

---

### Search

#### `search-cards <query>`
Search cards by name.

- `search-cards dragon` — Find all cards with "dragon" in the name
- `search-cards "fire sword"` — Exact phrase search

#### `search-users <query>`
Search users by username.

- `search-users ali` — Find users whose name contains "ali"

#### `search-seasons <query>`
Search seasons by name.

- `search-seasons winter` — Find seasons matching "winter"

---

### Configuration

#### `token <+|-|list|get> [name]`
Manage auth tokens.

- `token list` — List all saved tokens
- `token + mytoken` — Create a new token named "mytoken"
- `token - mytoken` — Delete the token named "mytoken"
- `token get mytoken` — Print the value of "mytoken"

#### `servers <+|-|list|get> [name]`
Manage server aliases.

- `servers list` — List all saved servers
- `servers + prod` — Add a server aliased "prod"
- `servers - prod` — Remove the server aliased "prod"
- `servers get prod` — Print the URL for "prod"

---

### Chat

#### `connect-chat <url|name> [token]`
Connect to a chat server.

- `connect-chat prod` — Connect using saved server alias "prod"
- `connect-chat tcp://localhost:1337` — Connect by URL directly
- `connect-chat prod mytoken` — Connect using alias "prod" and token "mytoken"

#### `message <message> [username]`
Send a chat message.

- `message "hello everyone"` — Broadcast to all connected users
- `message "hey" alice` — Send directly to alice

#### `chat-console`
Enter interactive chat mode.

- `chat-console` — Opens the console — type `exit` to leave

---

> `<required>` `[optional]`