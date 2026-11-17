// @vitest-environment happy-dom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SavedItemVM } from "@/lib/savedIntel";
const state = vi.hoisted(() => ({ put: vi.fn(), rows: [], ready: true, isLoading: false, isSaving: false }));
vi.mock("@/hooks/useResearchState", () => ({ useResearchState: () => state }));
import { ResearchReview } from "@/components/saved/ResearchReview";
const item = { key: "company:DIS", live: true, conviction: 50, status: "developing", risk: null, watch: "Check earnings", latestChange: null } as SavedItemVM;
afterEach(() => { cleanup(); state.put.mockReset(); state.isLoading = false; });
describe("research review rendering", () => {
  it("requires an explicit review and retains a failed draft", async () => {
    state.put.mockRejectedValue(new Error("offline"));
    render(<ResearchReview item={item} />);
    expect(state.put).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Review current evidence" }));
    fireEvent.change(screen.getByLabelText("Research note"), { target: { value: "My research hypothesis" } });
    fireEvent.click(screen.getByRole("button", { name: "Save review" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("could not be saved"));
    expect((screen.getByLabelText("Research note") as HTMLTextAreaElement).value).toBe("My research hypothesis");
  });
  it("does not allow a checkpoint for unavailable intelligence", () => {
    render(<ResearchReview item={{ ...item, live: false }} />);
    expect((screen.getByRole("button", { name: "Review current evidence" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("hides private drafts while auth/state are loading", () => {
    const view = render(<ResearchReview item={item} />);
    fireEvent.click(screen.getByRole("button", { name: "Review current evidence" }));
    state.isLoading = true; view.rerender(<ResearchReview item={item} />);
    expect(screen.queryByLabelText("Research note")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("Loading");
  });
});
