# news-image-20261122 v17 — Sunday 22 November 2026 (Full-Day Edition)

[![competition](https://make.fun/badge/news-image-20261122.svg)](https://make.fun/bounty/news-image-20261122)
[![rank](https://make.fun/badge/news-image-20261122/mohamad824/news-image-20261122-v17/rank.svg)](https://make.fun/bounty/news-image-20261122)
[![reward](https://make.fun/badge/news-image-20261122/mohamad824/news-image-20261122-v17/reward.svg)](https://make.fun/bounty/news-image-20261122)

One-page newspaper front page summing up the world's news of **Sunday 22 November 2026** — full-day edition: COP31 collapses with no deal, the Dymer strike, Iran's Bahrain radar claim, Hong Kong's vote count, the Hormuz tanker fires, and 31 more stories (36 in total), plus a WHERE IT HAPPENED map (15 pins) and a DATE CHECK box.

Built from the v16 layout (top bar, masthead, stats strip, UTC timeline, 3 leads, 10-card grid, 23-wire list) with two fixes: a dotted world map fills the empty space at the bottom (map left + DATE CHECK right, same height), and the right column of the ALSO IN list (items 26–36) is aligned vertically with the "Iran claims" grid card (card 11). All text is rendered from real TTF files (Playfair Display + Barlow Condensed, OFL) parsed and rasterised in `main.ts` — no hand-drawn glyphs.

## Run

```sh
node main.ts   # writes entry.png to $MAKEFUN_OUTPUT_DIR or /output
```

Deterministic: two runs produce byte-identical output. No network.

## Licence

MIT — see [LICENSE](LICENSE). Fonts under `fonts/` are Playfair Display and Barlow Condensed, licensed under the SIL Open Font License (see OFL files in `fonts/`).
