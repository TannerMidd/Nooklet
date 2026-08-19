import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(workspace)/library/actions", () => ({
    addLibraryPathAction: vi.fn(),
}));

import { LibraryPathForm } from "./library-path-form";

describe("LibraryPathForm", () => {
    it("preselects YouTube when opened from the YouTube storage prompt", () => {
        const markup = renderToStaticMarkup(<LibraryPathForm defaultMediaType="youtube" />);

        expect(markup).toContain('<option value="youtube" selected="">YouTube</option>');
        expect(markup).not.toContain('<option value="movie" selected="">Movies</option>');
    });
});
