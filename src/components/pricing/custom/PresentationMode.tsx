// Presentation Mode (B8.8) — fullscreen viewer of the slide deck.
//
// Renders the full slidesFlow deck. The user can navigate with arrow keys,
// click left/right edges, or use the on-screen arrows. The CURRENT custom
// slide (currentConfig) is rendered with the live editor state when the user
// hasn't switched away from the slide they were editing; for other custom
// slides the saved config from the store is used. Non-custom slides use
// SlidePreview as a fallback (read-only).
//
// Cross-filter: SlideFilterProvider wraps the active slide's blocks so the
// chart blocks emit/respond to filters exactly like in edit mode.
//
// Exit: Escape, ✕ button, or document.exitFullscreen.

import { useEffect, useMemo, useRef, useState } from "react";
import { X, ChevronLeft, ChevronRight, Filter as FunnelIcon, Download, Eye, EyeOff, Image as ImageIcon, Timer } from "lucide-react";
import { exportToPdf } from "@/lib/exportPdf";
import { ScaledPreview } from "@/components/pricing/SlidePreview";
import { Button } from "@/components/ui/button";
import { useSlidesFlow } from "@/store/slidesFlow";
import { CANVAS_W, CANVAS_H, FOOTER_H, type CustomSlideConfig, type CustomBlock } from "@/lib/customSlide";
import { BlockRenderer } from "./BlockRenderer";
import { SlideFilterProvider, useSlideFilters, dimensionLabel } from "./SlideFilterContext";
import haraldFooterPng from "@/assets/harald-footer-bar.png";
import { SLIDE_HEX, SLIDE_RGBA } from "@/lib/slideDesignTokens";

interface Props {
  /** Editor's current slide id — used as initial slide. */
  currentSlideId?: string;
  /** Live config for the slide being edited (so unsaved changes show). */
  currentConfig?: CustomSlideConfig;
  onClose: () => void;
}

export function PresentationMode({ currentSlideId, currentConfig, onClose }: Props) {
  const items = useSlidesFlow((s) => s.items);
  const transition = useSlidesFlow((s) => s.transition);
  // If editor was opened standalone (no items in deck), present just the live slide.
  const standaloneList = useMemo(() => {
    if (items.length > 0) return null;
    if (!currentConfig) return null;
    return [{ id: currentSlideId ?? "live", kind: "custom" as const, config: currentConfig }];
  }, [items.length, currentSlideId, currentConfig]);

  const slides = standaloneList ?? items;
  const initial = Math.max(0, slides.findIndex((s) => s.id === currentSlideId));
  const [idx, setIdx] = useState(initial < 0 ? 0 : initial);
  const [prevIdx, setPrevIdx] = useState<number | null>(null);
  const [animKey, setAnimKey] = useState(0);
  const [presenterMode, setPresenterMode] = useState(false);
  const [screen, setScreen] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [thumbsOpen, setThumbsOpen] = useState(false);
  const [laser, setLaser] = useState(false);
  const [laserPos, setLaserPos] = useState<{ x: number; y: number } | null>(null);
  const [blackout, setBlackout] = useState(false);
  const startedAtRef = useRef<number>(Date.now());
  const [elapsed, setElapsed] = useState(0);

  // Try fullscreen on mount; non-fatal if blocked (overlay still covers viewport).
  useEffect(() => {
    document.documentElement.requestFullscreen?.().catch(() => {});
    return () => { document.exitFullscreen?.().catch(() => {}); };
  }, []);

  useEffect(() => {
    const onResize = () => setScreen({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const goto = (n: number) => {
    if (n < 0 || n >= slides.length || n === idx) return;
    if (transition === "none") {
      setIdx(n);
      setAnimKey((k) => k + 1);
      return;
    }
    setPrevIdx(idx);
    setIdx(n);
    setAnimKey((k) => k + 1);
  };

  // Clear previous slide after transition duration (longest is 350ms).
  useEffect(() => {
    if (prevIdx === null) return;
    const t = setTimeout(() => setPrevIdx(null), 400);
    return () => clearTimeout(t);
  }, [prevIdx, animKey]);

  // Presenter timer — increments every second while presenting.
  useEffect(() => {
    startedAtRef.current = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  // Track mouse for the laser pointer overlay.
  useEffect(() => {
    if (!laser) return;
    const onMove = (e: MouseEvent) => setLaserPos({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [laser]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Blackout: Escape fecha a apresentação; qualquer outra tecla apenas remove o blackout.
      if (blackout) {
        e.preventDefault();
        setBlackout(false);
        if (e.key === "Escape") onClose();
        return;
      }
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key === "ArrowLeft") { e.preventDefault(); goto(idx - 1); return; }
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); goto(idx + 1); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); goto(0); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); goto(slides.length - 1); return; }
      if (e.key === "t" || e.key === "T") { e.preventDefault(); setThumbsOpen((v) => !v); return; }
      if (e.key === "l" || e.key === "L") { e.preventDefault(); setLaser((v) => !v); return; }
      if (e.key === "b" || e.key === "B") { e.preventDefault(); setBlackout(true); return; }
      if ((e.metaKey || e.ctrlKey) && (e.key === "z" || e.key === "Z" || e.key === "y" || e.key === "Y")) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [idx, slides.length, onClose, transition, blackout]);

  const slide = slides[idx];
  const prevSlide = prevIdx !== null ? slides[prevIdx] : null;
  const factor = Math.min(screen.w / CANVAS_W, screen.h / CANVAS_H) * 0.95;
  const progress = slides.length > 1 ? ((idx + 1) / slides.length) * 100 : 100;
  const mmss = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "hsl(0 0% 0%)", color: SLIDE_HEX.white,
        userSelect: "none",
      }}
      onClick={(e) => {
        const x = e.clientX;
        const w = window.innerWidth;
        if (x < w * 0.2) goto(idx - 1);
        else if (x > w * 0.8) goto(idx + 1);
      }}
    >
      {/* Keyframes for transitions + block enter animations */}
      <style>{TRANSITION_CSS}</style>

      {/* Progress bar (top) */}
      <div data-export-hide="true" style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 2,
        background: "rgba(255,255,255,0.08)", zIndex: 20,
      }}>
        <div style={{
          width: `${progress}%`, height: "100%",
          background: "hsl(var(--primary))",
          transition: "width 200ms ease-out",
        }} />
      </div>
      <SlideFilterProvider slideKey={slide?.id}>
        <div
          style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: laser ? "none" : undefined,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {prevSlide && (
            <div
              key={`prev-${animKey}`}
              style={{
                position: "absolute", display: "flex", alignItems: "center", justifyContent: "center",
                inset: 0, animation: exitAnim(transition),
              }}
            >
              <SlideRenderArea slide={prevSlide} factor={factor} animateBlocks={false} />
            </div>
          )}
          {slide && (
            <div
              key={`cur-${animKey}`}
              style={{
                position: "absolute", display: "flex", alignItems: "center", justifyContent: "center",
                inset: 0, animation: enterAnim(transition),
              }}
            >
              <SlideRenderArea
                slide={slide}
                liveConfig={slide.id === currentSlideId ? currentConfig : undefined}
                factor={factor}
                animateBlocks
                animKey={animKey}
              />
            </div>
          )}
        </div>

        {/* Top-left: download PDF */}
        <button
          onClick={async () => {
            const list = items.length > 0 ? items : (slide ? [slide as unknown as import("@/lib/slidesFlow").SlideItem] : []);
            if (list.length === 0) return;
            await exportToPdf(list as import("@/lib/slidesFlow").SlideItem[], "apresentacao.pdf");
          }}
          aria-label="Baixar PDF"
          title="Baixar PDF"
          style={{
            position: "absolute", top: 16, left: 16,
            height: 36, padding: "0 12px", borderRadius: 18,
            background: "hsl(0 0% 100% / 0.1)", color: SLIDE_HEX.white,
            border: "1px solid hsl(0 0% 100% / 0.2)",
            display: "flex", alignItems: "center", gap: 6,
            cursor: "pointer", zIndex: 10, fontSize: 12,
          }}
        >
          <Download className="h-4 w-4" />
          Baixar PDF
        </button>

        {/* Top-left (next to PDF): presenter mode toggle */}
        <button
          onClick={() => setPresenterMode((v) => !v)}
          aria-label={presenterMode ? "Ocultar notas do apresentador" : "Mostrar notas do apresentador"}
          title={presenterMode ? "Modo apresentador (ativado)" : "Modo apresentador"}
          data-export-hide="true"
          style={{
            position: "absolute", top: 16, left: 152,
            height: 36, padding: "0 12px", borderRadius: 18,
            background: presenterMode ? "hsl(var(--editor-selection) / 0.5)" : "hsl(0 0% 100% / 0.1)",
            color: SLIDE_HEX.white,
            border: "1px solid hsl(0 0% 100% / 0.2)",
            display: "flex", alignItems: "center", gap: 6,
            cursor: "pointer", zIndex: 10, fontSize: 12,
          }}
        >
          {presenterMode ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          Notas
        </button>

        {/* Laser pointer toggle */}
        <button
          onClick={() => setLaser((v) => !v)}
          title={laser ? "Laser ligado (L)" : "Ativar laser pointer (L)"}
          data-export-hide="true"
          style={{
            position: "absolute", top: 16, left: 232,
            height: 36, padding: "0 12px", borderRadius: 18,
            background: laser ? "hsl(var(--editor-preflight-error) / 0.6)" : "hsl(0 0% 100% / 0.1)",
            color: SLIDE_HEX.white,
            border: "1px solid hsl(0 0% 100% / 0.2)",
            display: "flex", alignItems: "center", gap: 6,
            cursor: "pointer", zIndex: 10, fontSize: 12,
          }}
        >
          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 4, background: SLIDE_HEX.danger }} />
          Laser
        </button>

        {/* Thumbnails strip toggle */}
        <button
          onClick={() => setThumbsOpen((v) => !v)}
          title={thumbsOpen ? "Ocultar miniaturas (T)" : "Mostrar miniaturas (T)"}
          data-export-hide="true"
          style={{
            position: "absolute", top: 16, left: 312,
            height: 36, padding: "0 12px", borderRadius: 18,
            background: thumbsOpen ? "hsl(var(--editor-selection) / 0.5)" : "hsl(0 0% 100% / 0.1)",
            color: SLIDE_HEX.white,
            border: "1px solid hsl(0 0% 100% / 0.2)",
            display: "flex", alignItems: "center", gap: 6,
            cursor: "pointer", zIndex: 10, fontSize: 12,
          }}
        >
          <ImageIcon className="h-4 w-4" />
          Miniaturas
        </button>

        {/* Presenter timer (only when presenter mode is on) */}
        {presenterMode && (
          <div
            data-export-hide="true"
            style={{
              position: "absolute", top: 60, left: 16,
              padding: "6px 12px", borderRadius: 8,
              background: SLIDE_RGBA.darkOverlay, border: `1px solid ${SLIDE_RGBA.whiteOverlay}`,
              color: SLIDE_HEX.white, fontSize: 13, fontVariantNumeric: "tabular-nums",
              display: "flex", alignItems: "center", gap: 6,
              zIndex: 10,
            }}
          >
            <Timer className="h-3.5 w-3.5 opacity-70" />
            <span>{mmss}</span>
          </div>
        )}

        {/* Top-right close */}
        <button
          onClick={onClose}
          aria-label="Sair da apresentação"
          style={{
            position: "absolute", top: 16, right: 16,
            width: 36, height: 36, borderRadius: 18,
            background: "hsl(0 0% 100% / 0.1)", color: SLIDE_HEX.white,
            border: "1px solid hsl(0 0% 100% / 0.2)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", zIndex: 10,
          }}
        >
          <X className="h-4 w-4" />
        </button>

        {/* Slide counter */}
        <div style={{
          position: "absolute", bottom: 18, left: "50%", transform: "translateX(-50%)",
          padding: "6px 14px", borderRadius: 999,
          background: "rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.12)",
          fontSize: 12, fontVariantNumeric: "tabular-nums",
          zIndex: 10,
        }}>
          {idx + 1} / {slides.length}
        </div>

        {/* Nav arrows (always visible, semi-transparent). */}
        <NavArrow side="left"  disabled={idx === 0}                  onClick={() => goto(idx - 1)} />
        <NavArrow side="right" disabled={idx === slides.length - 1}  onClick={() => goto(idx + 1)} />

        {/* Speaker notes bar (presenter mode only). Hidden from PDF capture. */}
        {presenterMode && slide && (
          <SpeakerNotesBar notes={(slide as DeckSlide).config && ((slide as DeckSlide).config as { speakerNotes?: string }).speakerNotes || ""} />
        )}
        {/* Clear filters bar */}
        <ClearFiltersFloater />

        {/* Thumbnail strip (bottom) */}
        {thumbsOpen && (
          <div
            data-export-hide="true"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute", left: 0, right: 0, bottom: 0,
              padding: "12px 16px 14px",
              background: "linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0))",
              display: "flex", justifyContent: "center", gap: 8,
              overflowX: "auto", zIndex: 15,
            }}
          >
            {slides.map((s, i) => {
              const active = i === idx;
              return (
                <button
                  key={s.id}
                  onClick={(e) => { e.stopPropagation(); goto(i); }}
                  title={`Slide ${i + 1}`}
                  style={{
                    flex: "0 0 auto",
                    width: 144, height: 81,
                    borderRadius: 4, overflow: "hidden",
                    background: SLIDE_HEX.white,
                    border: active ? "2px solid hsl(var(--primary))" : "2px solid rgba(255,255,255,0.15)",
                    cursor: "pointer", padding: 0,
                    boxShadow: active ? "0 0 0 2px rgba(255,255,255,0.2)" : "none",
                    position: "relative",
                  }}
                >
                  <ScaledPreview item={s as never} targetWidth={140} />
                  <span style={{
                    position: "absolute", bottom: 2, left: 4,
                    fontSize: 9, fontWeight: 600, color: SLIDE_HEX.white,
                    background: "rgba(0,0,0,0.6)", padding: "1px 4px", borderRadius: 2,
                    fontVariantNumeric: "tabular-nums",
                  }}>{i + 1}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Laser pointer dot */}
        {laser && laserPos && (
          <div
            data-export-hide="true"
            style={{
              position: "fixed",
              left: laserPos.x - 8, top: laserPos.y - 8,
              width: 16, height: 16, borderRadius: 8,
              background: "radial-gradient(circle, rgba(239,68,68,0.95) 0%, rgba(239,68,68,0.65) 40%, rgba(239,68,68,0) 70%)",
              boxShadow: "0 0 16px rgba(239,68,68,0.7)",
              pointerEvents: "none", zIndex: 9998,
            }}
          />
        )}

        {/* Blackout overlay */}
        {blackout && (
          <div
            data-export-hide="true"
            onClick={() => setBlackout(false)}
            style={{
              position: "fixed", inset: 0, background: "hsl(0 0% 0%)",
              zIndex: 9997, cursor: "pointer",
            }}
          />
        )}
      </SlideFilterProvider>

    </div>
  );
}

function NavArrow({ side, disabled, onClick }: { side: "left" | "right"; disabled: boolean; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      disabled={disabled}
      aria-label={side === "left" ? "Slide anterior" : "Próximo slide"}
      style={{
        position: "absolute", top: "50%", transform: "translateY(-50%)",
        [side]: 16, width: 56, height: 96, borderRadius: 12,
        background: "hsl(0 0% 100% / 0.06)", color: SLIDE_HEX.white,
        border: "1px solid hsl(0 0% 100% / 0.1)",
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.25 : 0.7,
        transition: "opacity 150ms", zIndex: 10,
      } as React.CSSProperties}
      onMouseEnter={(e) => { if (!disabled) (e.currentTarget.style.opacity = "1"); }}
      onMouseLeave={(e) => { if (!disabled) (e.currentTarget.style.opacity = "0.7"); }}
    >
      <Icon className="h-7 w-7" />
    </button>
  );
}

function ClearFiltersFloater() {
  const { filters, clearAll } = useSlideFilters();
  if (filters.length === 0) return null;
  return (
    <div style={{
      position: "absolute", bottom: 18, right: 16,
      padding: "6px 12px", borderRadius: 999,
      background: "hsl(var(--chart-1) / 0.85)", color: SLIDE_HEX.white,
      display: "flex", alignItems: "center", gap: 8, fontSize: 12,
      zIndex: 10,
    }}>
      <FunnelIcon className="h-3.5 w-3.5" />
      <span>{filters.length} filtro{filters.length > 1 ? "s" : ""} ativo{filters.length > 1 ? "s" : ""}</span>
      <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px] text-white hover:bg-white/15"
        onClick={clearAll}>
          Limpar ({filters.length})
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SlideRenderArea — picks the right renderer for the slide's kind.
// Custom slides get the live block renderer (cross-filter active). Others
// fall back to the read-only SlidePreview SVG.
// ---------------------------------------------------------------------------
type DeckSlide = { id: string; kind: string; config?: unknown };

function SlideRenderArea({
  slide, liveConfig, factor, animateBlocks = false, animKey = 0,
}: { slide: DeckSlide; liveConfig?: CustomSlideConfig; factor: number; animateBlocks?: boolean; animKey?: number }) {
  const w = CANVAS_W * factor;
  const h = CANVAS_H * factor;

  const inner = (() => {
    if (slide.kind === "custom") {
      const cfg = liveConfig ?? (slide.config as CustomSlideConfig | undefined);
      if (!cfg) return null;
      return (
        <CustomCanvasReadOnly config={cfg} animateBlocks={animateBlocks} animKey={animKey} />
      );
    }
    // Non-custom: ScaledPreview at full canvas width so it fills the scaled container.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return <ScaledPreview item={slide as any} targetWidth={CANVAS_W} />;
  })();

  // C28: use slide background for the outer shell so transparent custom slides
  // don't render on black. Non-custom slides default to white.
  const customCfg = slide.kind === "custom"
    ? (liveConfig ?? (slide.config as CustomSlideConfig | undefined))
    : undefined;
  const slideBg = customCfg?.background === "transparent" ? SLIDE_HEX.white
    : customCfg ? `#${customCfg.background}`
    : SLIDE_HEX.white;

  return (
    <div style={{
      width: w, height: h,
      background: slideBg,
      boxShadow: "0 12px 60px rgba(0,0,0,0.6)",
      overflow: "hidden",
      borderRadius: 4,
    }}>
      <div style={{
        width: CANVAS_W, height: CANVAS_H,
        transform: `scale(${factor})`, transformOrigin: "top left",
        position: "relative",
      }}>
        {inner}
      </div>
    </div>
  );
}

export function CustomCanvasReadOnly({
  config, animateBlocks = false, animKey = 0,
}: { config: CustomSlideConfig; animateBlocks?: boolean; animKey?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const sorted = [...config.blocks].sort((a, b) => a.z - b.z);
  return (
    <div
      ref={ref}
      style={{
        width: CANVAS_W, height: CANVAS_H,
        background: config.background === "transparent" ? SLIDE_HEX.white : `#${config.background}`,
        position: "relative", overflow: "hidden",
      }}
    >
      {sorted.map((blk: CustomBlock, i) => {
        const anim = animateBlocks ? (blk.enterAnimation ?? "none") : "none";
        const delay = i * 80;
        const animation =
          anim === "fade" ? `blkFade 320ms ease-out ${delay}ms both` :
          anim === "slide-up" ? `blkSlideUp 350ms ease-out ${delay}ms both` :
          anim === "pop" ? `blkPop 320ms cubic-bezier(0.34, 1.56, 0.64, 1) ${delay}ms both` :
          undefined;
        const rotation = readOnlyRotation(blk);
        return (
          <div
            key={`${blk.id}-${animKey}`}
            style={{
              position: "absolute",
              left: blk.x, top: blk.y, width: blk.w, height: blk.h,
              zIndex: blk.z,
              pointerEvents: blk.kind === "chart" ? "auto" : "none",
              animation,
              transform: rotation ? `rotate(${rotation}deg)` : undefined,
              transformOrigin: "50% 50%",
              visibility: blk.hidden ? "hidden" : "visible",
            }}
          >
            <BlockRenderer block={blk} readOnly />
          </div>
        );
      })}
      {config.showHaraldFooter && (
        <img
          src={haraldFooterPng}
          alt=""
          style={{
            position: "absolute", left: 0, bottom: 0,
            width: CANVAS_W, height: FOOTER_H,
            pointerEvents: "none", zIndex: 99999,
          }}
        />
      )}
    </div>
  );
}

function readOnlyRotation(block: CustomBlock): number {
  if (block.kind === "title" || block.kind === "text" || block.kind === "image") {
    return block.rotation ?? 0;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Transition CSS + helpers
// ---------------------------------------------------------------------------
const TRANSITION_CSS = `
@keyframes slideEnterFade { from { opacity: 0; } to { opacity: 1; } }
@keyframes slideExitFade  { from { opacity: 1; } to { opacity: 0; } }
@keyframes slideEnterLeft { from { transform: translateX(100%); } to { transform: translateX(0); } }
@keyframes slideExitLeft  { from { transform: translateX(0); } to { transform: translateX(-100%); } }
@keyframes slideEnterUp   { from { transform: translateY(100%); } to { transform: translateY(0); } }
@keyframes slideExitUp    { from { transform: translateY(0); } to { transform: translateY(-100%); } }
@keyframes slideEnterZoom { from { transform: scale(0.85); opacity: 0; } to { transform: scale(1); opacity: 1; } }
@keyframes slideExitZoom  { from { transform: scale(1); opacity: 1; } to { transform: scale(1.1); opacity: 0; } }
@keyframes blkFade    { from { opacity: 0; } to { opacity: 1; } }
@keyframes blkSlideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
@keyframes blkPop     { from { opacity: 0; transform: scale(0.8); } to { opacity: 1; transform: scale(1); } }
`;

function enterAnim(t: string): string | undefined {
  switch (t) {
    case "fade":       return "slideEnterFade 300ms ease-out both";
    case "slide-left": return "slideEnterLeft 350ms ease-out both";
    case "slide-up":   return "slideEnterUp 350ms ease-out both";
    case "zoom":       return "slideEnterZoom 300ms ease-out both";
    default: return undefined;
  }
}
function exitAnim(t: string): string | undefined {
  switch (t) {
    case "fade":       return "slideExitFade 300ms ease-out both";
    case "slide-left": return "slideExitLeft 350ms ease-out both";
    case "slide-up":   return "slideExitUp 350ms ease-out both";
    case "zoom":       return "slideExitZoom 300ms ease-out both";
    default: return undefined;
  }
}

function SpeakerNotesBar({ notes }: { notes: string }) {
  return (
    <div
      data-export-hide="true"
      data-html2canvas-ignore="true"
      style={{
        position: "absolute", left: 16, right: 16, bottom: 60,
        maxHeight: "22vh", overflowY: "auto",
        padding: "12px 16px", borderRadius: 8,
        background: SLIDE_RGBA.darkOverlayStrong, color: SLIDE_HEX.white,
        border: `1px solid ${SLIDE_RGBA.whiteOverlay}`,
        fontSize: 14, lineHeight: 1.5,
        zIndex: 9,
        whiteSpace: "pre-wrap",
      }}
    >
      {notes.trim()
        ? notes
        : <span style={{ opacity: 0.5, fontStyle: "italic" }}>Sem anotações para este slide.</span>}
    </div>
  );
}
