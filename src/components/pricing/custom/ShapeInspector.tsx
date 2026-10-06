// Inspector da Forma — escolha da forma + Preenchimento, Contorno/Linha,
// Geometria, Sombra. Usa as MESMAS primitivas do resto do painel
// (chart/Inspector): antes tinha gramática própria (grade de 2 colunas,
// rótulos empilhados, cor no seletor nativo do sistema + campo hex).

import { cn } from "@/lib/utils";
import {
  type ShapeBlock, type ShapeStrokeStyle, type ShapeLineDirection,
  SHAPE_GROUPS, SHAPE_LABELS, ensureShapeBlock, isLineFamily, deriveLineEndpoints,
} from "@/lib/customSlide";
import { ShapeMiniPreview } from "./ShapeRenderer";
import {
  Section, Row, ToggleField, NumberStepper, ColorField, Segmented, Slider, MoreOptions,
} from "./chart/Inspector";
import { strings } from "@/lib/i18n";

const t = strings.slides.editor.inspectors.shape;

type Patch = Partial<ShapeBlock>;

/** Forma guarda cor como hex sem '#' (ou "transparent"); o seletor usa '#'. */
const toPicker = (hex: string) => hex === "transparent" ? "transparent" : `#${(hex || "FFFFFF").replace("#", "")}`;
const fromPicker = (c: string) => c.replace("#", "").toUpperCase();

export function ShapeInspector({ block, onChange }: {
  block: ShapeBlock; onChange: (p: Patch) => void;
}) {
  const b = ensureShapeBlock(block);
  const isLine = isLineFamily(b.shape);
  const strokeOptions: { value: ShapeStrokeStyle; label: string }[] = [
    { value: "solid", label: t.strokeStyle.solid },
    { value: "dashed", label: t.strokeStyle.dashed },
    { value: "dotted", label: t.strokeStyle.dotted },
  ];
  const hasRadius = b.shape === "rect" || b.shape === "roundRect"
    || b.shape === "callout-rect" || b.shape === "callout-rounded";

  return (
    <div className="space-y-2">
      <Section title={t.sections.shape} defaultOpen>
        <div className="space-y-2">
          {SHAPE_GROUPS.map((g) => (
            <div key={g.label}>
              <div className="mb-1 slides-type-helper">{g.label}</div>
              <div className="grid grid-cols-6 gap-1">
                {g.shapes.map((s) => (
                  <button key={s} type="button" title={SHAPE_LABELS[s]} aria-label={SHAPE_LABELS[s]}
                    aria-pressed={b.shape === s}
                    onClick={() => onChange({ shape: s })}
                    className={cn(
                      "flex h-9 items-center justify-center rounded border bg-surface-base transition-colors",
                      b.shape === s ? "border-primary ring-1 ring-primary" : "border-border hover:border-foreground/40",
                    )}>
                    <ShapeMiniPreview shape={s} size={22} />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {!isLine && (
        <Section title={t.sections.fill} defaultOpen>
          <Row label={t.color}>
            <ColorField allowTransparent value={toPicker(b.fill)}
              onChange={(c) => onChange(c === "transparent"
                ? { fill: "transparent", fillOpacity: 0 }
                : b.fill === "transparent"
                  ? { fill: fromPicker(c), fillOpacity: 100 }
                  : { fill: fromPicker(c) })} />
          </Row>
          {b.fill !== "transparent" && (
            <Row label={t.opacity}>
              <Slider value={b.fillOpacity} onChange={(v) => onChange({ fillOpacity: v })} />
            </Row>
          )}
        </Section>
      )}

      {isLine ? (
        <Section title={t.sections.line} defaultOpen>
          <Row label={t.color}>
            <ColorField value={toPicker(b.fill)} onChange={(c) => onChange({ fill: fromPicker(c) })} />
          </Row>
          <Row label={t.thickness}>
            <NumberStepper value={b.lineThickness} min={1} max={20} suffix="px"
              onChange={(v) => onChange({ lineThickness: v })} />
          </Row>
          <Row label={t.style}>
            <Segmented value={b.strokeStyle} onChange={(v) => onChange({ strokeStyle: v })} options={strokeOptions} />
          </Row>
          <Row label={t.direction}>
            <Segmented<ShapeLineDirection> value={b.lineDirection}
              onChange={(v) => onChange({ lineDirection: v, ...deriveLineEndpoints(v, b.x, b.y, b.w, b.h) })}
              options={[
                { value: "horizontal", label: "→" },
                { value: "vertical", label: "↓" },
                { value: "diagonal-down", label: "↘" },
                { value: "diagonal-up", label: "↗" },
              ]} />
          </Row>
          <ToggleField label={t.arrowStart} value={b.arrowStart} onChange={(v) => onChange({ arrowStart: v })} />
          <ToggleField label={t.arrowEnd} value={b.arrowEnd} onChange={(v) => onChange({ arrowEnd: v })} />
        </Section>
      ) : (
        <Section title={t.sections.outline}>
          <Row label={t.thickness}>
            <NumberStepper value={b.strokeWidth} min={0} max={20} suffix="px"
              onChange={(v) => onChange({ strokeWidth: v })} />
          </Row>
          {b.strokeWidth > 0 && (
            <>
              <Row label={t.color}>
                <ColorField value={toPicker(b.strokeColor)} onChange={(c) => onChange({ strokeColor: fromPicker(c) })} />
              </Row>
              <Row label={t.style}>
                <Segmented value={b.strokeStyle} onChange={(v) => onChange({ strokeStyle: v })} options={strokeOptions} />
              </Row>
            </>
          )}
        </Section>
      )}

      {!isLine && (
        <Section title={t.sections.geometry}>
          {hasRadius && (
            <Row label={t.radius}>
              <NumberStepper value={b.radius} min={0} max={200} suffix="px"
                onChange={(v) => onChange({ radius: v })} />
            </Row>
          )}
          <Row label={t.rotationDeg}>
            <NumberStepper value={b.rotation} min={0} max={359} suffix="°"
              onChange={(v) => onChange({ rotation: v })} />
          </Row>
        </Section>
      )}

      <Section title={t.sections.shadow}>
        <ToggleField label={t.showShadow} value={b.shadowEnabled}
          onChange={(v) => onChange({ shadowEnabled: v })} />
        {b.shadowEnabled && (
          <>
            <Row label={t.color}>
              <ColorField value={toPicker(b.shadowColor)} onChange={(c) => onChange({ shadowColor: fromPicker(c) })} />
            </Row>
            <Row label={t.opacity}>
              <Slider value={b.shadowOpacity} onChange={(v) => onChange({ shadowOpacity: v })} />
            </Row>
            <MoreOptions customized={b.shadowBlur !== 8 || b.shadowX !== 2 || b.shadowY !== 2}>
              <Row label={t.blur}>
                <NumberStepper value={b.shadowBlur} min={0} max={40} suffix="px"
                  onChange={(v) => onChange({ shadowBlur: v })} />
              </Row>
              <Row label={t.shiftX}>
                <NumberStepper value={b.shadowX} min={-40} max={40} suffix="px"
                  onChange={(v) => onChange({ shadowX: v })} />
              </Row>
              <Row label={t.shiftY}>
                <NumberStepper value={b.shadowY} min={-40} max={40} suffix="px"
                  onChange={(v) => onChange({ shadowY: v })} />
              </Row>
            </MoreOptions>
          </>
        )}
      </Section>
    </div>
  );
}
