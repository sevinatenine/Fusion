# Fusion

Fusion is a CLI TCG game that lives in your terminal. You can collect and trade cards with other players, as well as the server. We encourage bots that can make trades and buy from the server and auctions.

Collaborated with [@Cesium72](https://github.com/Cesium72) on this project.

## Connecting

Try with the web terminal [here](https://fusion.simon312.hackclub.app/terminal).

Or connect over telnet:

```bash
telnet 2a01:4f9:3080:3192::2144 1234
```

## Docs

View the docs [here](https://fusion.simon312.hackclub.app/).

## Running the server yourself

First you need to clone the repo with:

```bash
git clone https://github.com/sevinatenine/Fusion
```

Then install dependencies with `npm install`

Then either run with `npm run serve`

Or run with:
```bash
node src/main.js
```

Then connect to `localhost:23` with:

```bash
telnet localhost 23
```

## Doc Generation
Install python packages with `pip3 install -r requirements.txt`
Run
```bash
cd docs
mkdocs build
```