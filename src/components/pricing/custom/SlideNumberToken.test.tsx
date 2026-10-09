import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { RichTextContent } from "./RichTextContent";
import { SlideIdContext } from "./SlideIdentity";
import { useSlidesFlow } from "@/store/slidesFlow";
import type { SlideItem } from "@/lib/slidesFlow";

const cover = (id: string, hidden = false): SlideItem =>
  ({ id, kind: "cover", hidden, config: { title: id, variant: "cover" } }) as SlideItem;

describe("{slide} e {total de slides}", () => {
  it("numeram só os slides visíveis", () => {
    useSlidesFlow.setState({ items: [cover("a", true), cover("b"), cover("c"), cover("d")] });
    const { container } = render(
      <SlideIdContext.Provider value="c">
        <RichTextContent text="Slide {slide} de {Total de Slides}" />
      </SlideIdContext.Provider>,
    );
    expect(container.textContent).toBe("Slide 2 de 3");
  });

  it("fora de um deck mostra traço", () => {
    useSlidesFlow.setState({ items: [cover("b")] });
    const { container } = render(<RichTextContent text="{slide}/{total de slides}" />);
    expect(container.textContent).toBe("—/1");
  });
});
