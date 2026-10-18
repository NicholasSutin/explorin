# Personal seed personas

Drop one JSON file per person here (gitignored). The shape is what onboarding collects (blurb, interests, audience, tier-list grades) plus their reflections; see `example.persona.json.example`, and `PROMPT.md` to have an agent build one. Then:

```bash
npm run db:seed-persona -- data/personas/<name>.json   # inserts their reflections as "From someone like you" evidence
```
