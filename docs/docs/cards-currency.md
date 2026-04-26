# Cards and Currency

## Cards

Fusion cards all have an ID and some have a name.
The id's range from 0 to 65535 - the uint16_t limit.
Some cards have a name, whilst other's just an id.
The name typically corresponds to something relate to the id.

Here are some example cards.

| Id   | Name              |
| ---- | ----------------- |
| 0    | Stdin             |
| 1    | Stdout            |
| 2    | Stderr            |
| 3    | USB 3.0           |
| 4    | IPv4              |
| 5    | Raspberry Pi 5    |
| 6    | Unix V6           |
| 7    | Windows 7         |
| 8    | uint8_t           |
| 10   | OS-X              |
| 16   | Base 16 - Hex     |
| 21   | FTP - Port 21     |
| 22   | SSH - Port 22     |
| 23   | Telnet - Port 23  |
| 64   | Commodore 64      |
| 80   | HTTP - Port 80    |
| 84   | Ti 84             |
| 255  | 0xFF              |

## Currency

Fusion uses a custom currency with multiple different coins.

The coins are

- Megons
- Kilons
- Unons
- Milons
- Micros
- Nanons
- Picons
