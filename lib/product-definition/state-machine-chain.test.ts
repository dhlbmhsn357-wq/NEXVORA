import { describe, it, expect } from "vitest";
import {
  stateChainString,
  transitionEndpointOptions,
  transitionReferencesStaleState,
} from "./state-machine-chain";

describe("stateChainString", () => {
  it("يبني سلسلة أسهم بالترتيب المُعطى", () => {
    expect(stateChainString(["Request Received", "Scheduled", "Live", "Evaluated", "Passed"])).toBe(
      "Request Received → Scheduled → Live → Evaluated → Passed"
    );
  });

  it("يتجاهل الحالات الفارغة/المسافات فقط", () => {
    expect(stateChainString(["A", "  ", "", "B"])).toBe("A → B");
  });

  it("يُرجع نص فاضي لمصفوفة فاضية", () => {
    expect(stateChainString([])).toBe("");
  });

  it("يُرجع نص فاضي لمصفوفة كلها فراغات", () => {
    expect(stateChainString(["  ", ""])).toBe("");
  });

  it("حالة واحدة بدون أي سهم", () => {
    expect(stateChainString(["Draft"])).toBe("Draft");
  });

  it("يشيل المسافات الزايدة حوالين كل حالة", () => {
    expect(stateChainString([" A ", " B "])).toBe("A → B");
  });
});

describe("transitionEndpointOptions", () => {
  it("يرجّع نفس قائمة الحالات لو القيمة الحالية موجودة فيها", () => {
    expect(transitionEndpointOptions(["A", "B", "C"], "B")).toEqual(["A", "B", "C"]);
  });

  it("يضيف القيمة الحالية كخيار إضافي في الآخر لو مش موجودة في قائمة الحالات (حالة اتمسحت/اتغيّر اسمها)", () => {
    expect(transitionEndpointOptions(["A", "B"], "Removed State")).toEqual(["A", "B", "Removed State"]);
  });

  it("مايضيفش خيار لو القيمة الحالية فاضية", () => {
    expect(transitionEndpointOptions(["A", "B"], "")).toEqual(["A", "B"]);
  });

  it("مايضيفش خيار لو القيمة الحالية مسافات فقط", () => {
    expect(transitionEndpointOptions(["A", "B"], "   ")).toEqual(["A", "B"]);
  });

  it("يتجاهل الحالات الفارغة في القائمة الأصلية", () => {
    expect(transitionEndpointOptions(["A", "", "B"], "A")).toEqual(["A", "B"]);
  });
});

describe("transitionReferencesStaleState", () => {
  it("false لو الحالتين from/to موجودتين في القائمة الحالية", () => {
    expect(transitionReferencesStaleState({ from: "A", to: "B" }, ["A", "B", "C"])).toBe(false);
  });

  it("true لو from اتمسحت من القائمة", () => {
    expect(transitionReferencesStaleState({ from: "X", to: "B" }, ["A", "B", "C"])).toBe(true);
  });

  it("true لو to اتمسحت من القائمة", () => {
    expect(transitionReferencesStaleState({ from: "A", to: "X" }, ["A", "B", "C"])).toBe(true);
  });

  it("true لو الاتنين اتمسحوا", () => {
    expect(transitionReferencesStaleState({ from: "X", to: "Y" }, ["A", "B"])).toBe(true);
  });
});
