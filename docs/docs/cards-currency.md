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
| 84   | TI-84             |
| 255  | 0xFF              |

## Currency

Fusion uses a custom currency with multiple different coins.

The coins are:

- Megons (10 Kilons)
- Kilons (10 Unons)
- Unons (10 Milons)
- Milons (10 Microns)
- Microns (10 Nanons)
- Nanons (10 Picons)
- Picons

Each coin is worth 10 times the previous.
I.E. 10 Picons = 1 Nanon, 10 Nanons = 1 Micron, etc.

For comparison, 1 Picon is approximately $0.01 USD and 1 Nanon is $0.10 USD.
> **NOTE**: You CAN NOT buy coins for Fusion and anyone claiming to sell them is likely trying to scam you.

If you do not seee a unit, then assume it is in unons.

### Currency Table

|           | Megons   | Kilons  | Unons  | Milons | Micros | Nanons | Picons    |
|-----------|----------|---------|--------|--------|--------|--------|-----------|
| 1 Megon   | 1        | 10      | 100    | 1,000  | 10,000 | 100,000| 1,000,000 |
| 1 Kilon   | 0.1      | 1       | 10     | 100    | 1,000  | 10,000 | 100,000   |
| 1 Unon    | 0.01     | 0.1     | 1      | 10     | 100    | 1,000  | 10,000    |
| 1 Milon   | 0.001    | 0.01    | 0.1    | 1      | 10     | 100    | 1,000     |
| 1 Micro   | 0.0001   | 0.001   | 0.01   | 0.1    | 1      | 10     | 100       |
| 1 Nanon   | 0.00001  | 0.0001  | 0.001  | 0.01   | 0.1    | 1      | 10        |
| 1 Picon   | 0.000001 | 0.00001 | 0.0001 | 0.001  | 0.01   | 0.1    | 1         |

## How to Get Coins?

No one knows. (Submit a pull request)