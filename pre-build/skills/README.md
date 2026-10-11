# skills

Reference copies of two public agent skills. Pulled for ideas on how to structure a
preference-gathering conversation and for their bundled reference data. Not installed,
not a dependency, and not the project's stack (see ../PLAN.md).

| Skill | Source | Useful for |
|---|---|---|
| [kontour-travel-planner/](kontour-travel-planner/) | github.com/bookingdesk-ai/kontour-travel-planner (v1.1.57, MIT-0) | 9-dimension progressive questioning model; `references/destinations.json`, `airports.json`, `activities.json`, `budget-benchmarks.json`; `scripts/export-gmaps.sh` builds Google Maps links and KML with no API key |
| [travel-planner/](travel-planner/) | github.com/ailabs-393/ai-labs-claude-skills (packages/skills/travel-planner) | Preference schema (budget level, style, interests, dietary); `references/cultural_etiquette.md`, `travel_guidelines.md`; `scripts/travel_db.py` is a simple JSON preference store |

`skills-lock.json` records the upstream sources and content hashes as fetched.

Removed from the originals: Kontour's `.openclaw/` marketplace CI evidence, and the
placeholder `index.js` / `package.json` in travel-planner. Everything else is verbatim,
including Kontour's `embed-snippets.json` and `socket-review-check.sh`, which SKILL.md references.
