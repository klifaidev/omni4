// Grouped inspector for ShapeBlock — picker + Preenchimento, Contorno,
// Geometria, Linha, Sombra. Uses minimal local primitives.

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  type ShapeBlock, type ShapeType, type ShapeStrokeStyle, type ShapeLineDirection,
  SHAPE_GROUPS, SHAPE_LABELS, ensureShapeBlock, isLineFamily,
} from "@/lib/customSlide";
import { ShapeMiniPreview } from "./ShapeRenderer";

type Patch = Partial<ShapeBlock>;

export function ShapeInspector({ block, onChange }: {
  block: ShapeBlock; onChange: (p: Patch) => void;
}) {
  const b = ensureShapeBlock(block);
  const isLine = isLineFamily(b.shape);

  return (
    <div className="space-y-3">
      {/* Picker */}
      <Section title="Forma">
        <div className="space-y-2">
          {SHAPE_GROUPS.map((g) => (
            <div key={g.label}>
              <div className="text-[10px] uppercase text-muted-foreground mb-1">{g.label}</div>
              <div className="grid grid-cols-6 gap-1">
                {g.shapes.map((s) => (
                  <button key={s} type="button" title={SHAPE_LABELS[s]}
                    onClick={() => onChange({ shape: s })}
                    className={cn(
                      "h-9 rounded border bg-background flex items-center justify-center transition-colors",
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

      {/* Preenchimento — hidden for line family */}
      {!isLine && (
        <Section title="Preenchimento">
          <Row>
            <ColorField label="Cor" value={b.fill} allowTransparent
              onTransparentChange={(t) => onChange(t
                ? { fill: "transparent", fillOpacity: 0 }
                : { fill: "EEF2F6", fillOpacity: 100 })}
              onChange={(v) => onChange({ fill: v })} />
            <SliderField label={`Opacidade ${b.fillOpacity}%`} min={0} max={100} step={1}
              value={b.fillOpacity} disabled={b.fill === "transparent"}
              onChange={(v) => onChange({ fillOpacity: v })} />
          </Row>
        </Section>
      )}

      {/* Contorno OR Linha */}
      {isLine ? (
        <Section title="Linha">
          <Row>
            <ColorField label="Cor" value={b.fill} onChange={(v) => onChange({ fill: v })} />
            <NumStepper label="Espessura" value={b.lineThickness} min={1} max={20}
              onChange={(v) => onChange({ lineThickness: v })} />
          </Row>
          <Row>
            <SegField<ShapeStrokeStyle> label="Estilo" value={b.strokeStyle}
              options={[{ v: "solid", l: "Sólido" }, { v: "dashed", l: "Tracejado" }, { v: "dotted", l: "Pontilhado" }]}
              onChange={(v) => onChange({ strokeStyle: v })} />
          </Row>
          <Row>
            <SegField<ShapeLineDirection> label="Direção" value={b.lineDirection}
              options={[
                { v: "horizontal", l: "→" },
                { v: "vertical", l: "↓" },
                { v: "diagonal-down", l: "↘" },
                { v: "diagonal-up", l: "↗" },
              ]}
              onChange={(v) => onChange({ lineDirection: v })} />
          </Row>
          <Row>
            <ToggleField label="Ponta inicial" value={b.arrowStart} onChange={(v) => onChange({ arrowStart: v })} />
            <ToggleField label="Ponta final" value={b.arrowEnd} onChange={(v) => onChange({ arrowEnd: v })} />
          </Row>
        </Section>
      ) : (
        <Section title="Contorno">
          <Row>
            <ColorField label="Cor da borda" value={b.strokeColor} onChange={(v) => onChange({ strokeColor: v })} />
            <NumStepper label="Espessura" value={b.strokeWidth} min={0} max={20}
              onChange={(v) => onChange({ strokeWidth: v })} />
          </Row>
          <Row>
            <SegField<ShapeStrokeStyle> label="Estilo" value={b.strokeStyle}
              options={[{ v: "solid", l: "Sólido" }, { v: "dashed", l: "Tracejado" }, { v: "dotted", l: "Pontilhado" }]}
              onChange={(v) => onChange({ strokeStyle: v })} />
          </Row>
        </Section>
      )}

      {/* Geometria — hide for line family */}
      {!isLine && (
        <Section title="Geometria">
          <Row>
            {(b.shape === "rect" || b.shape === "roundRect" || b.shape === "callout-rect" || b.shape === "callout-rounded") && (
              <NumStepper label="Raio" value={b.radius} min={0} max={200}
                onChange={(v) => onChange({ radius: v })} />
            )}
            <NumStepper label="Rotação°" value={b.rotation} min={0} max={359}
              onChange={(v) => onChange({ rotation: v })} />
          </Row>
        </Section>
      )}

      {/* Sombra */}
      <Section title="Sombra">
        <ToggleField label="Mostrar sombra" value={b.shadowEnabled}
          onChange={(v) => onChange({ shadowEnabled: v })} />
        {b.shadowEnabled && (
          <>
            <Row>
              <ColorField label="Cor" value={b.shadowColor} onChange={(v) => onChange({ shadowColor: v })} />
              <SliderField label={`Opacidade ${b.shadowOpacity}%`} min={0} max={100} step={1}
                value={b.shadowOpacity} onChange={(v) => onChange({ shadowOpacity: v })} />
            </Row>
            <Row>
              <NumStepper label="Desfoque" value={b.shadowBlur} min={0} max={40}
                onChange={(v) => onChange({ shadowBlur: v })} />
            </Row>
            <Row>
              <NumStepper label="X" value={b.shadowX} min={-40} max={40}
                onChange={(v) => onChange({ shadowX: v })} />
              <NumStepper label="Y" value={b.shadowY} min={-40} max={40}
                onChange={(v) => onChange({ shadowY: v })} />
            </Row>
          </>
        )}
      </Section>
    </div>
  );
}

// ---------- primitives ----------
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-card/50 p-2">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-2">{children}</div>;
}
function ColorField({ label, value, onChange, allowTransparent = false, onTransparentChange }: {
  label: string; value: string; onChange: (v: string) => void;
  allowTransparent?: boolean; onTransparentChange?: (t: boolean) => void;
}) {
  const isTransparent = value === "transparent";
  const v = isTransparent ? "" : (value || "").replace("#", "");
  return (
    <div>
      <Label className="text-[10px] uppercase text-muted-foreground">{label}</Label>
      {allowTransparent && (
        <label className="mb-1 mt-0.5 flex cursor-pointer items-center justify-between text-[10px] text-muted-foreground">
          <span>Sem fundo</span>
          <Switch checked={isTransparent} className="scale-75"
            onCheckedChange={(c) => onTransparentChange?.(c)} />
        </label>
      )}
      <div className="flex items-center gap-1">
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" disabled={isTransparent}
              className={cn("h-7 w-7 rounded border border-border shrink-0",
                isTransparent && "cursor-not-allowed opacity-90")}
              style={isTransparent ? CHECKER_BG_STYLE : { background: `#${v || "FFFFFF"}` }} />
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2">
            <input type="color" value={`#${v || "FFFFFF"}`}
              onChange={(e) => onChange(e.target.value.replace("#", ""))}
              className="h-32 w-32 cursor-pointer border-0 bg-transparent" />
          </PopoverContent>
        </Popover>
        <Input className="h-7 text-xs font-mono" value={v} disabled={isTransparent}
          onChange={(e) => onChange(e.target.value.replace("#", ""))} />
      </div>
    </div>
  );
}

const CHECKER_BG_STYLE: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(45deg, rgba(0,0,0,0.08) 25%, transparent 25%)," +
    "linear-gradient(-45deg, rgba(0,0,0,0.08) 25%, transparent 25%)," +
    "linear-gradient(45deg, transparent 75%, rgba(0,0,0,0.08) 75%)," +
    "linear-gradient(-45deg, transparent 75%, rgba(0,0,0,0.08) 75%)",
  backgroundSize: "8px 8px",
  backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0",
  backgroundColor: "#FFFFFF",
};
function NumStepper({ label, value, min, max, onChange }: {
  label: string; value: number; min: number; max: number; onChange: (v: number) => void;
}) {
  return (
    <div>
      <Label className="text-[10px] uppercase text-muted-foreground">{label}</Label>
      <Input type="number" className="h-7 text-xs" value={value} min={min} max={max}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10);
          if (Number.isNaN(n)) return;
          onChange(Math.max(min, Math.min(max, n)));
        }} />
    </div>
  );
}
function SliderField({ label, value, min, max, step, onChange, disabled = false }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; disabled?: boolean;
}) {
  return (
    <div className={disabled ? "opacity-50 pointer-events-none" : ""}>
      <Label className="text-[10px] uppercase text-muted-foreground">{label}</Label>
      <Slider value={[value]} min={min} max={max} step={step}
        onValueChange={(v) => onChange(v[0])} className="mt-2" />
    </div>
  );
}
function SegField<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: { v: T; l: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="col-span-2">
      <Label className="text-[10px] uppercase text-muted-foreground">{label}</Label>
      <div className="flex gap-1 mt-1">
        {options.map((o) => (
          <button key={o.v} type="button" onClick={() => onChange(o.v)}
            className={cn(
              "flex-1 h-7 rounded border text-xs",
              value === o.v ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted",
            )}>
            {o.l}
          </button>
        ))}
      </div>
    </div>
  );
}
function ToggleField({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <Label className="text-xs">{label}</Label>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );
}
