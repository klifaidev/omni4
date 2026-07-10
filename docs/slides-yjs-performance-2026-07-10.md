# Slides Yjs Performance - 2026-07-10

## Scenario

- Page: `#/slides`
- Room: persistent Supabase room, created through the real UI flow
- Sessions: 2 isolated Chrome headless profiles, one Host and one Viewer
- Slide: 1 custom slide with 30 blocks
- Blocks: 24 title/text blocks and 6 chart blocks
- Update stream: 80 frequent speaker-notes text updates from Host to Viewer
- Measurement: optional render counters enabled via `window.__OMNI_SLIDES_PERF__`

## Baseline Before Fix

80 text updates over about 4.26s:

| Session | CustomSlideEditor | BlockRenderer | ChartCanvas | Result |
| --- | ---: | ---: | ---: | --- |
| Host | 82 | 0 | 0 | Host text stayed responsive |
| Viewer | 60 | 6,960 | 1,392 | Every block/chart re-rendered repeatedly |

Finding: remote Yjs text updates caused the viewer to rebuild the custom slide config with new block object references, defeating `React.memo` and forcing all 30 blocks to render.

## Intermediate Attempt

After preserving block references and debouncing store sync at 120ms:

| Session | CustomSlideEditor | BlockRenderer | ChartCanvas | Result |
| --- | ---: | ---: | ---: | --- |
| Viewer | 53 | 5,880 | 1,176 | Slightly better, still not acceptable |

Finding: some unchanged blocks still arrived as new objects, so reference-only memo comparison was not enough.

## Final Fix

Changes:

- `BlockRenderer` now uses a content comparator for unchanged block objects.
- `ChartCanvas` now uses a content comparator for unchanged chart block objects.
- Yjs-to-store reflection keeps stable block references where possible.
- Yjs-to-store reflection is debounced at `120ms`.
- Supabase Yjs provider throttle for custom slide updates is `120ms`.

80 text updates over about 3.39s:

| Session | CustomSlideEditor | BlockRenderer | ChartCanvas | Result |
| --- | ---: | ---: | ---: | --- |
| Host | 86 | 0 | 0 | Host text stayed responsive |
| Viewer | 51 | 0 | 0 | Viewer received live text without canvas re-render cascade |

The final isolated update (`perf-update-81`) arrived on the viewer after the batch, confirming the room still synchronized after the high-frequency test.

## Conclusion

The Yjs flow is not visibly worse than the previous event-based collaboration for this scenario. The expensive cascade has been removed: frequent text updates no longer re-render every block/chart on the slide. Fase 12.8 can proceed from this baseline.
