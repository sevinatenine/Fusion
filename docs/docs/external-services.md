# External Services

## Tokens

External services allow you to connect Fusion to other things.
Some examples include:

- Chat servers
- etc.

In order to conenct an external service, you first need to make a token.
A token is a large number that can be used to authenticate yourself with these services.

We do not recommend reusing tokens for multiple services because this could lead to security issues.

In order to make a token, you can run the command:
`token + <name>` where `<name>` is whatever you would like to call the token.

Once you have created a token, you can use it to connect to external services.

## Auth Server Protocal

The auth server uses a UDP protocal that lets you get a username from a token.
You send a UDP packet with the access token as a string, terminated by a new line (`\n`);

The server will then reply with a username if the token is valid, or `...` if not. Both are terminated by a new line.

For example:

```
Client --> Server:      628efc1596b8fdff931cd9c087defbc8
Server --> Client:      simon

Client2 --> Server:     notarealtoken1234
Server  --> Client2:    ...
```

## Chat Server Protocal

The chat server uses a TCP connection sending JSON data.
Every request has a `type` field which identifies the packet type and every response has a `success` field which indicates if the response succeeded.

A succesful response also had a `type` field.
A failed response has a `error` field which details the error.
Both responses have `message` field.

Request:
```json
{
    "type": "<type>",
    ...
}
```

Succesful response:
```json
{
    "success": true,
    "type": "<packet_type",
    "message": "<readable_message>"
}
```

Failed response:
```json
{
    "success": false,
    "error": "<error_message>",
    "message": "<readable_message>"
}
```

### Request types

There are three request types: `login`, `message`, and `quit`.

#### `login`

The `login` command takes in an `accessToken` field.

```json
{
    "type": "login",
    "accessToken": "628efc1596b8fdff931cd9c087defbc8"
}
```

The chat server will then verify with the authentication server.

**Success**
```json
{
    "success": true,
    "type": "login",
    "message": "Login successful.",
    "username": "simon"
}
```

**Failure**
```json
{
    "success": false,
    "error": "ERR_MISSING_ACCESS_TOKEN",
    "message": "Missing required field: accessToken."
}
```
```json
{
    "success": false,
    "error": "ERR_INVALID_ACCESS_TOKEN",
    "message": "The provided access token is invalid or expired."
}
```

---

#### `message`

> Note: You must be logged in to send this command.

The `message` command takes in a `message` field and optionally a `to` field.
If no `to` field is sent, then it is broadcasted to everybody.

```json
{
    "type": "message",
    "message": "Hello, Everyone!",
    [OPTIONALLY] "to": "bob"
}
```

**Success** — sent to the sender after the message is delivered
```json
{
    "success": true,
    "type": "message_sent",
    "message": "Message sent."
}
```

**Received** — sent to the recipient(s)
```json
{
    "success": true,
    "type": "message",
    "from": "simon",
    "message": "Hello, Everyone!",
    "direct": false
}
```

The `direct` field is `true` if the message was sent to a specific user via the `to` field, and `false` if it was broadcast.

**Failure**
```json
{
    "success": false,
    "error": "ERR_NOT_AUTHENTICATED",
    "message": "You must be logged in to send messages."
}
```
```json
{
    "success": false,
    "error": "ERR_MISSING_MESSAGE",
    "message": "Missing required field: message."
}
```
```json
{
    "success": false,
    "error": "ERR_USER_NOT_FOUND",
    "message": "User \"bob\" not found or not online."
}
```

---

#### `quit`

Disconnects from the server.

```json
{
    "type": "quit"
}
```

**Success**
```json
{
    "success": true,
    "type": "quit",
    "message": "Goodbye."
}
```

---

### General errors

These can be returned for any request.

```json
{
    "success": false,
    "error": "ERR_NEEDS_TO_BE_JSON",
    "message": "Request body must be valid JSON."
}
```
```json
{
    "success": false,
    "error": "ERR_MISSING_TYPE",
    "message": "Missing required field: type."
}
```
```json
{
    "success": false,
    "error": "ERR_UNKNOWN_CMD",
    "message": "Unknown command type: \"<type>\"."
}
```
