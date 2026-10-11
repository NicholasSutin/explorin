# pre-build

Context gathered before writing code for the AI Engineer NYC Hackathon project (Oct 11, 2026).
Read this folder before building. Nothing in here is application code.

## Start here

| File | What it is | Authority |
|---|---|---|
| [PLAN.md](PLAN.md) | Product scope, stack, data model, Gemini and Nimble jobs, timeline, demo script | **Source of truth for scope.** Do not add features outside its Golden Path without asking. |
| [event/event-info.md](event/event-info.md) | Date, hours, location, hosts, rules links, submission flow | Facts scraped from Luma and MLH on 2026-10-11 |
| [event/judging-criteria.md](event/judging-criteria.md) | The four judging criteria | From the organizers' slide |
| [event/prizes.md](event/prizes.md) | All six prize categories with sponsor links | Scraped from MLH on 2026-10-11 |

## research/

Background research done before the plan was written. Useful for judge questions and for
understanding why things were cut. Not instructions.

| File | Topic | Status vs PLAN.md |
|---|---|---|
| [research/google-maps-user-data.md](research/google-maps-user-data.md) | Can "Sign in with Google" expose saved places, reviews, timeline? | Not used. Google sign-in is cut; Maps grounding via Gemini is used instead. |
| [research/chatbot-memory-access.md](research/chatbot-memory-access.md) | Can we read a user's memory from Claude / ChatGPT / Copilot? | Not used. Profile is built from the user's own photos. |
| [research/oauth/facebook.md](research/oauth/facebook.md), [instagram.md](research/oauth/instagram.md), [linkedin.md](research/oauth/linkedin.md) | OAuth scopes and what user data each exposes | **Cut.** PLAN.md section 2 removes all OAuth; anonymous cookie session only. |

## skills/

Two third-party agent skills pulled as reference for travel-planning conversation design and
reference data. They are **not** installed into this project and are not part of the stack.
See [skills/README.md](skills/README.md).

## What was removed during cleanup

- Raw scraped HTML-to-markdown dumps of the Luma and MLH pages (nav, duplicated headers, image links). Their facts live in `event/`.
- A duplicate scrape of the Tiger Data challenge page.
- Marketplace CI artifacts inside the Kontour skill (`.openclaw/` evidence logs) and the empty `index.js` / `package.json` stub in `travel-planner`.
- `.DS_Store` files.
