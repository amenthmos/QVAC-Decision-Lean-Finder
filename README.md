# QVAC Decision Lean Finder

Enter a decision you're facing plus your own pros and cons, and an on-device AI gives a balanced summary and states which way your pros/cons actually lean — grounded only in what you listed, never inventing new ones. No cloud call, no API key.

## Run

```bash
npm install
npm start
```

Then open http://localhost:32020

## QVAC SDK version

`@qvac/sdk` ^0.19.0 (see `package.json`).

## How it works

Built on [Tether's QVAC SDK](https://www.npmjs.com/package/@qvac/sdk) — all inference runs on-device, no cloud call, no API key. The app loads `LLAMA_3_2_1B_INST_Q4_0` locally with `loadModel()`, generates with `completion()` (streamed via `tokenStream`), and releases the model with `unloadModel()` on shutdown.

The "which way it leans" verdict is always computed deterministically in code from the number of pros vs. cons you listed — never left for the model to assert — and a grounding check confirms every pro and con you entered is mentioned in the summary before showing it.

## License

MIT
