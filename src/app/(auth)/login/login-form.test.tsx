// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({
  submitLoginAction: vi.fn(),
}));

import { LoginForm } from "./login-form";

describe("LoginForm", () => {
  it("confirms a completed password change before reauthentication", () => {
    render(
      <LoginForm
        callbackUrl="/home"
        showBootstrapSuccess={false}
        showPasswordChangedSuccess
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Password updated. Sign in with your new password to continue.",
    );
  });
});
