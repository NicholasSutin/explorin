# Personal seed personas

Drop one JSON file per person here (gitignored). Shape in `example.persona.json`. Then:

```bash
npm run db:seed-persona -- data/personas/<name>.json   # inserts their reflections as "From someone like you" evidence
```
