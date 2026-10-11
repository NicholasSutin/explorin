# Explorin brand kit

Generated from `marketing-images/logo-monocular.png` (spyglass traced to vector with potrace) and a wordmark set in Avenir Next Heavy, converted to outlines. Every SVG is self-contained; PNG filenames end in their pixel width.

| Asset | Use |
|---|---|
| `lockup-horizontal-*` | Primary logo for headers, decks, wide placements |
| `lockup-stacked-*` | Square / portrait placements, splash screens |
| `mark-*` | Spyglass alone (ink, cream, orange, green, sepia) |
| `wordmark-*` | Name alone with orange full stop |
| `app-icon-*` | 1024 rounded tiles; `app-icon-square-green` for iOS (OS masks corners) |
| `favicon`, `glyph-*` | Simplified geometric spyglass for 16 to 64 px |
| `avatar-*` | Circular social avatars |
| `og-card-*` | 1200×630 Open Graph / Twitter cards |
| `banner-*` | 1500×500 profile headers |
| `pattern-tile` | Subtle moss-on-cream background tile |

Palette: ink `#203d32`, cream `#f8f6ef`, green `#285c47`, orange `#d96738`, moss `#e5ebdf`, heritage sepia `#2b1608`.

Regenerate everything (needs `rsvg-convert`) with `python3 source/gen.py source .` from this folder. The potrace traces live in `source/trace/`; the original trace command was:

```
potrace mask.pbm -s --flat -t 6 -a 1.2 -O 0.3
```
