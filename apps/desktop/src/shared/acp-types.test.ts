import { describe, expect, it } from "vitest";
import { buildDevinClientAdvertisement } from "./acp-types";

describe("Devin client capability advertisement", () => {
  it("places implemented vendor capabilities in clientCapabilities._meta", () => {
    expect(buildDevinClientAdvertisement()).toEqual({
      clientCapabilities: {
        elicitation: { form: {}, url: {} },
        _meta: {
          "cognition.ai/editableCommands": true,
          "cognition.ai/commandRevision": true,
          "cognition.ai/chains": true,
        },
      },
    });
  });

  it("omits every capability whose handler is disabled", () => {
    expect(buildDevinClientAdvertisement({
      elicitationForm: false,
      elicitationUrl: false,
      editableCommands: false,
      commandRevision: false,
      chains: false,
    })).toEqual({ clientCapabilities: {} });
  });
});
