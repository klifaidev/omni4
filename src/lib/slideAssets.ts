// Biblioteca persistida de assets (logos, fundos, ícones) reutilizáveis
// entre slides. Armazenado em localStorage como base64.
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { toast } from "sonner";
import haraldFooterBar from "@/assets/harald-footer-bar.png";
import haraldFooter from "@/assets/harald-footer.png";

export type AssetCategory = "logo" | "background" | "icon" | "other";

export interface SlideAsset {
  id: string;
  name: string;
  src: string; // data URL (base64) ou URL importada
  category: AssetCategory;
  uploadedAt: number;
  builtIn?: boolean;
}

const MAX_ASSETS = 50;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024; // 20MB

const BUILT_IN: SlideAsset[] = [
  {
    id: "builtin-harald-footer-bar",
    name: "Faixa Harald (rodapé)",
    src: haraldFooterBar,
    category: "logo",
    uploadedAt: 0,
    builtIn: true,
  },
  {
    id: "builtin-harald-footer",
    name: "Rodapé Harald corporativo",
    src: haraldFooter,
    category: "background",
    uploadedAt: 0,
    builtIn: true,
  },
  {
    id: "builtin-white-bg",
    name: "Fundo branco simples",
    src:
      "data:image/svg+xml;base64," +
      btoa(
        '<svg xmlns="http://www.w3.org/2000/svg" width="1333" height="750"><rect width="1333" height="750" fill="#FFFFFF"/></svg>',
      ),
    category: "background",
    uploadedAt: 0,
    builtIn: true,
  },
];

function rid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function approxBytes(dataUrl: string): number {
  // base64 length * 0.75 ≈ bytes
  const i = dataUrl.indexOf(",");
  const b64 = i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
  return Math.ceil((b64.length * 3) / 4);
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

interface AssetsState {
  assets: SlideAsset[]; // user-uploaded only (built-ins are merged on read)
  addAsset: (file: File, category?: AssetCategory) => Promise<void>;
  removeAsset: (id: string) => void;
  renameAsset: (id: string, name: string) => void;
}

export const useSlideAssets = create<AssetsState>()(
  persist(
    (set, get) => ({
      assets: [],
      addAsset: async (file, category = "other") => {
        const cur = get().assets;
        if (cur.length >= MAX_ASSETS) {
          toast.error(`Limite de ${MAX_ASSETS} assets atingido. Remova algum antes.`);
          return;
        }
        if (!file.type.startsWith("image/")) {
          toast.error("Apenas arquivos de imagem.");
          return;
        }
        const src = await fileToDataUrl(file);
        const totalBytes = cur.reduce((s, a) => s + approxBytes(a.src), 0) + approxBytes(src);
        if (totalBytes > MAX_TOTAL_BYTES) {
          toast.error("Limite de 20MB de assets atingido.");
          return;
        }
        const asset: SlideAsset = {
          id: rid(),
          name: file.name.replace(/\.[^.]+$/, "").slice(0, 40) || "Asset",
          src,
          category,
          uploadedAt: Date.now(),
        };
        set({ assets: [asset, ...cur] });
        toast.success("Asset adicionado.");
      },
      removeAsset: (id) => {
        set({ assets: get().assets.filter((a) => a.id !== id) });
      },
      renameAsset: (id, name) => {
        set({
          assets: get().assets.map((a) => (a.id === id ? { ...a, name } : a)),
        });
      },
    }),
    { name: "slides-assets-v1" },
  ),
);

/** Retorna built-ins + user assets (built-ins primeiro). */
export function useAllSlideAssets(): SlideAsset[] {
  const userAssets = useSlideAssets((s) => s.assets);
  return [...BUILT_IN, ...userAssets];
}
