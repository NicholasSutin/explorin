# ADR-0012: Reflections are human-written only

**Status:** Accepted
**Date:** 2026-11-21
**Deciders:** Nick Sutin

## Context

After a day out, the person writes a note and it becomes their scrapbook page. Until now one Gemini call also wrote a "story" from the note: two or three warm sentences in the second person, under 220 characters so they fit the page's handwritten lines. The page printed that story, not the note, unless the person cleared it. The same call picked a "nearly verbatim" sentence to share as a "people like you" quote, which other people see in quotation marks under the writer's first name.

Both put words in the person's mouth. The story is shown in their handwriting as if they wrote it. The quote could be quietly reworded and still be attributed to them. "People like you" only works if the quotes are real people's words.

## Decision

Anything shown as a person's reflection is their own text.

- **The page is the note.** `/api/trip/:id/draft` no longer returns a story. The reflection step fills the page text with the note, word for word, and the person may trim or edit it. `noteFit` (`src/lib/scrapbook/layout.ts`) wraps it exactly as the page does, so the step says when it fits and roughly how many characters would be cut with "…".
- **Shared quotes are copied, never rewritten.** Gemini is asked to copy one sentence or phrase character for character. `inNote` (`src/lib/keepsake.ts`) keeps it only if the note contains it word for word, forgiving only spacing, case, wrapping quotation marks and a closing full stop, and returns the note's own spelling. Matches must start and end on whole words, have at least three words, and be 10–240 characters long. `/finish` runs `inNote` again before storing, so a client can't attach a line that isn't in the note. Without AI, the first sentence that passes is offered.
- **AI still suggests the rest.** The title, emotions, "best for" tags and learned phrases stay AI suggestions. They are labelled as such ("Title and tags suggested from your note"), and the title can be edited.
- **No backfill.** Pages saved before this change keep the AI-drafted story their owners reviewed and saved. `layoutPage` still prints `trips.story`, falling back to the note.

## Options considered

- **Keep the story, prompt for "close to their words".** Rejected: still a rewrite, and nothing could check it.
- **Pick the quote by sentence index.** Simple, but dictated notes often have no punctuation, so the only "sentence" would be the whole note. Verifying a copied span handles both.
- **Cap the note at what fits on the page.** Rejected: the full note is also the reflection body, its embedding and the source of learned phrases. People trim the page text instead.
- **Shrink the handwriting to fit long notes.** Possible later. It changes every page's look, including saved ones.

## Consequences

- Long notes are cut on the page unless the person trims them. The book page holds about 200 characters, and the Instagram story export about 130.
- A day finished with photos and no note has blank ruled lines instead of a generated "A day around …" line.
- If Gemini rewords its pick, nothing is offered for sharing that day rather than an altered line.
- Seed "Explorin field notes" (`scripts/seed-reflections.ts`) are curated quotes, not member reflections, and are out of scope here.
