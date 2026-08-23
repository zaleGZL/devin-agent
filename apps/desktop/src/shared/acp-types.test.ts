import { describe, expect, it } from "vitest";
import { buildDevinClientAdvertisement } from "./acp-types";

describe("Devin client capability advertisement", () => {
  it("advertises only implemented client capabilities in their verified initialize locations", () => {
    expect(buildDevinClientAdvertisement()).toEqual({
      clientCapabilities: {
        elicitation: { form: {}, url: {} },
        _meta: {
          "cognition.ai/chains": true,
        },
      },
    });
  });

  it("omits every capability whose handler is disabled", () => {
    expect(buildDevinClientAdvertisement({
      elicitationForm: false,
      elicitationUrl: false,
      chains: false,
    })).toEqual({ clientCapabilities: {} });
  });
});
