# Personal seed personas

Drop one JSON file per person here (gitignored). Shape in `example.persona.json`. Then:

```bash
npm run db:seed-persona -- data/personas/<name>.json   # inserts their reflections as "From someone like you" evidence
```

The preset-profile chips on the onboarding screen list every file here automatically (dev server only).
