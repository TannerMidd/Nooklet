// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import axe from "axe-core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FormField } from "./form-field";
import { Input } from "./input";

describe("FormField accessibility", () => {
  it("associates label, description, and validation error with its input", async () => {
    const { container } = render(
      <FormField
        label="Indexer URL"
        description="Use the HTTPS origin supplied by the provider."
        error="Enter a valid URL."
        required
      >
        {(controlProps) => <Input {...controlProps} name="baseUrl" />}
      </FormField>,
    );

    const input = screen.getByRole("textbox", { name: /Indexer URL/ });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(
      "Use the HTTPS origin supplied by the provider. Enter a valid URL.",
    );

    const result = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(result.violations.filter((violation) => (
      violation.impact === "serious" || violation.impact === "critical"
    ))).toEqual([]);
  });
});
