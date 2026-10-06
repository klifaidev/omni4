import { describe, expect, it } from "vitest";
import { chartPartFromTarget } from "./chartPartFocus";

function el(html: string, selector: string): Element {
  const root = document.createElement("div");
  root.innerHTML = html;
  return root.querySelector(selector)!;
}

describe("chartPartFromTarget", () => {
  it("título, legenda, eixo, rótulo e série", () => {
    expect(chartPartFromTarget(el('<div data-chart-part="title"><span>x</span></div>', "span"))).toBe("title");
    expect(chartPartFromTarget(el('<div class="recharts-legend-wrapper"><li>A</li></div>', "li"))).toBe("legend");
    expect(chartPartFromTarget(el('<svg><g class="recharts-cartesian-axis"><text class="recharts-label">Eixo</text></g></svg>', "text"))).toBe("axes");
    expect(chartPartFromTarget(el('<svg><g class="recharts-label-list"><text>10</text></g></svg>', "text"))).toBe("dataLabels");
    expect(chartPartFromTarget(el('<svg><g class="recharts-bar-rectangle"><path/></g></svg>', "path"))).toBe("series");
  });

  it("área vazia do gráfico vai para os dados", () => {
    expect(chartPartFromTarget(el('<div data-chart-canvas=""><div class="x"></div></div>', ".x"))).toBe("data");
    expect(chartPartFromTarget(null)).toBe("data");
  });
});
