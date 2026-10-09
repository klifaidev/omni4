import { describe, expect, it } from "vitest";
import PptxGenJS from "pptxgenjs";
import JSZip from "jszip";
import { buildFlowItems } from "./exportPpt";
import { itemToFlow } from "./slidesFlow";

async function notesXml(pptx: PptxGenJS): Promise<string[]> {
  const buf = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
  const zip = await JSZip.loadAsync(buf);
  const files = Object.keys(zip.files).filter((f) => /ppt\/notesSlides\/notesSlide\d+\.xml$/.test(f)).sort();
  return Promise.all(files.map((f) => zip.file(f)!.async("string")));
}

describe("notas do apresentador no PPTX", () => {
  it("vão para o slide de cada item; item sem nota fica sem texto", async () => {
    const pptx = new PptxGenJS();
    await buildFlowItems(pptx, [
      { build: (p) => { p.addSlide(); }, notes: "Abrir com o recorde de ROL" },
      { build: (p) => { p.addSlide(); } },
      { build: (p) => { p.addSlide(); p.addSlide(); }, notes: "Bridge: falar de preço" },
    ]);
    const xml = await notesXml(pptx);
    expect(xml.length).toBe(4);
    expect(xml[0]).toContain("Abrir com o recorde de ROL");
    expect(xml[1]).not.toContain("Abrir com o recorde");
    expect(xml[2]).toContain("Bridge: falar de preço");
    expect(xml[3]).not.toContain("Bridge: falar de preço");
  });

  it("itemToFlow leva as notas do slide da esteira", () => {
    const flow = itemToFlow(
      { id: "c1", kind: "cover", config: { title: "Fechamento", variant: "cover", speakerNotes: "  Boas-vindas  " } },
      { pricingRows: [], budgetRows: [], metric: "rol" as never },
    );
    expect(flow.notes).toBe("Boas-vindas");
  });
});
