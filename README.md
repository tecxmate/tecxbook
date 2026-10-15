# tecxbook

Live classroom games: the projector is the stage, students' phones are the
answer pads (scan a QR code, type a nickname, no app or account).

This repo starts as an as-is copy of the games from the AI Scribe pilot class
(15 Oct 2026), moved out of `nikolasdoan/dental-ai`
(branch `claude/ai-scribe-student-demo-1v40ux`, commit `eba1982`):

1. **Spot the error**: groups find three planted mistakes in an AI note.
2. **The 8-second test**: would you sign a note you saw for 8 seconds?
3. **The Clinic**: a pixel-art team role-play, one dentist and two nurses.
4. **Build StyleMod's AI**: teams build a system from cards, a simulation
   breaks it, they fix one box and run it again.

How to run a class, the rules and scoring: [docs/classroom-demo.md](docs/classroom-demo.md).

## Commands

```bash
npm install
npm run check        # typecheck, lint, tests, build
npm run demo         # build and serve locally (Worker on :8787)
npm run demo:deploy  # build and publish to https://ai.tecxmate.com
```

## Layout

The paths are the same as in dental-ai, so the build output is byte-for-byte
the same. A leaner layout comes with the template work.

- `demo/worker.ts`, `demo/wrangler.jsonc`: the Cloudflare Worker (one Durable
  Object per room keeps players, answers and scores)
- `demo/index.html`, `src/demo/`: the page (projector and phones)
- `tests/`: server tests that run the Worker in memory (`tests/harness.ts`)

## Deploying

`demo/wrangler.jsonc` publishes the same Worker (`ai-scribe-clinic`) as
dental-ai's class branch. Deploy from one repo only (this one from now on).
Otherwise the two copies overwrite each other.
