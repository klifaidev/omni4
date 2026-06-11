## Chart Inspector — UX Revolution

A complete UI overhaul of the right-side inspector panel in the slide editor, following the uploaded `prompt_inspector_revolution.md`. No data logic, schema, or canvas rendering changes — only inspector surface.

### Scope at a glance
- Panel width 300 → **320px** (update grid in `CustomSlideEditor.tsx`).
- Persistent **chart type picker** (icon tiles) at top of panel.
- **3 tabs**: Dados / Visual / Análises (replace flat section list).
- Global typography reset: no uppercase, sentence-case, 12–13px, more breathing room (h-8 inputs, p-3 cards, 12px row gaps).
- **Popover color picker** (`react-colorful`) replacing inline color+hex+swatches.
- All native `<select>` → shadcn `<Select>` (Radix).
- New `stylePresets.ts` with 5 presets (Default, Minimal, Bold, Monochrome, Harald Brand) applied via a new `applyStylePreset` action.

### Tab contents
- **Dados** — source (KE30/Budget segmented), measures, dimension field-wells with icons, sort (segmented + dir toggle), Bridge column builder restyled, and an "Interatividade" section with the cross-filter toggles.
- **Visual** — quick style thumbnails, series color swatches (popover picker), compact typography group (title/labels/axis/legend on inline rows with B/I icon toggles + size dropdowns), contextual chart-body group (per-type controls), canvas group, inline data labels with **visual position selector** per chart type, collapsible Axes disclosure.
- **Análises** — restyled reference lines, trendline, forecast, conditional formatting cards with colored left borders and inline controls.

### New / changed files
- New: `src/components/pricing/custom/chart/stylePresets.ts`
- New: `src/components/pricing/custom/chart/inspector/` directory split:
  - `ChartTypePicker.tsx`
  - `DadosTab.tsx`
  - `VisualTab.tsx`
  - `AnalisesTab.tsx`
  - `ColorPickerPopover.tsx` (using `react-colorful`)
  - `primitives.tsx` (new Field/IconButton/Stepper restyled)
- Rewritten: `src/components/pricing/custom/chart/ChartInspector.tsx` becomes a thin shell (chart type picker + tabs).
- Updated: `src/components/pricing/custom/CustomSlideEditor.tsx` grid template.
- Updated: `src/components/pricing/custom/chart/Inspector.tsx` (kept exports, restyled tokens).
- Optional: scrollbar utility classes in `src/index.css`.

### Dependencies
- Add `react-colorful` (lightweight, ~3kb, no peer issues).

### What stays the same
- All `updStyle` / `updPath` / `updSeries` patch helpers.
- `BridgeColumnBuilder` data-handling logic (only restyled).
- `FilteredInspector` data source logic (Dados tab reuses it).
- Chart canvas rendering, computation, schema.

### Risks / notes
- Big diff in `ChartInspector.tsx`. To keep it safe I'll split into the new `inspector/` files rather than one huge rewrite.
- The "quick style presets" only patch existing style fields — no new schema.
- Empty-state and loading skeletons for the Dados tab are small additions confined to the inspector.

### Out of scope
- Canvas-side empty state ("Sem dados para os filtros selecionados") — Part 7's canvas change is in `ChartCanvas.tsx`; I'll include it as it's a small, additive empty-state branch only, but flag if you'd rather skip.

Approve and I'll implement, then produce the v2 UX audit as requested in §"After completing".