# Connecting

You can connect over TCP with Telnet, Netcat or another client.

The server address is `localhost:23`

## Connecting with Windows

First, you need to install Telnet.
If you already have Telnet installed, you can skip this step.

Open powershell or command prompt and run:
```powershell
dism /online /Enable-Feature /FeatureName:TelnetClient
```

Then, connect to Fusion:
```powershell
telnet localhost 23
```

## Connecting with Mac

In order to install Telnet, you need a package manager.
The standard MacOS package manager is Brew.
If you already have Brew installed, you can skip this step (To check, run `brew --version`).

Open Terminal and run:
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Then to install telnet, run:
```bash
brew install telnet
```

Now, you can connect to Fusion with:
```bash
telnet localhost 23
```

## Connecting with Linux

In order to install Telnet, you need to install APT, a package manager.
You probably already have APT installed.

> **Note for Chromebook users**: You need to install the Linux development environment for the Terminal app to work.

To check, run in your Terminal:
```bash
apt --version
```

If the command succeeds, then you can proceed to the next step ([Using APT](https://linuxize.com/post/how-to-use-apt-command/)).

Then, install telnet with APT.

```bash
apt install telnet
```

You can now connect to Fusion with:
```bash
telnet localhost 23
```

## Now what?

Visit [Getting Started](./getting-started.md) to learn how to use Fusion