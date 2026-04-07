import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useRouter } from "next/navigation";
import CreateHeistForm from "@/components/CreateHeistForm";

vi.mock("@/lib/firebase", () => ({ auth: {} }));
vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));

const mockUseRouter = vi.mocked(useRouter);
let mockFetch: ReturnType<typeof vi.fn>;
let mockPush: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockPush = vi.fn();
  mockUseRouter.mockReturnValue({ push: mockPush } as never);
  mockFetch = vi.fn();
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderAndFill(title = "The Big Score", description = "Rob the vault") {
  render(<CreateHeistForm />);
  if (title)
    fireEvent.change(screen.getByLabelText(/title/i), {
      target: { value: title },
    });
  if (description)
    fireEvent.change(screen.getByLabelText(/description/i), {
      target: { value: description },
    });
}

function submitForm() {
  fireEvent.submit(
    screen.getByRole("button", { name: /create heist/i }).closest("form")!,
  );
}

describe("CreateHeistForm", () => {
  it("renders title, description, assignee fields and submit button", () => {
    render(<CreateHeistForm />);
    expect(screen.getByLabelText(/title/i)).toBeDefined();
    expect(screen.getByLabelText(/description/i)).toBeDefined();
    expect(screen.getByLabelText(/assignee/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /create heist/i })).toBeDefined();
  });

  it("shows a validation error and does not call the API when title is empty", async () => {
    renderAndFill("", "Rob the vault");
    submitForm();
    await waitFor(() => {
      expect(screen.getByText(/title is required/i)).toBeDefined();
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("shows a validation error and does not call the API when description is empty", async () => {
    renderAndFill("The Big Score", "");
    submitForm();
    await waitFor(() => {
      expect(screen.getByText(/description is required/i)).toBeDefined();
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('shows "Submitting…" and disables the button while saving', async () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    renderAndFill();
    submitForm();
    await waitFor(() => {
      const btn = screen.getByRole("button", { name: /submitting/i });
      expect(btn).toBeDefined();
      expect(btn).toHaveProperty("disabled", true);
    });
  });

  it("redirects to /heists on successful save", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: "new-heist-id" }),
    });
    renderAndFill();
    submitForm();
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/heists");
    });
  });

  it("shows an error message and preserves form values on save failure", async () => {
    mockFetch.mockResolvedValue({ ok: false });
    renderAndFill();
    submitForm();
    await waitFor(() => {
      expect(screen.getByText(/something went wrong/i)).toBeDefined();
    });
    expect((screen.getByLabelText(/title/i) as HTMLInputElement).value).toBe(
      "The Big Score",
    );
    expect(
      (screen.getByLabelText(/description/i) as HTMLInputElement).value,
    ).toBe("Rob the vault");
  });

  it("fetches all users immediately when the assignee field is focused", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ users: [] }),
    });
    render(<CreateHeistForm />);
    fireEvent.focus(screen.getByLabelText(/assignee/i));
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/users"),
        expect.anything(),
      );
    });
  });

  it("calls /api/heists with null assignee fields when no assignee is selected", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: "new-heist-id" }),
    });
    renderAndFill();
    submitForm();
    await waitFor(() => {
      const [, options] = mockFetch.mock.calls.find(([url]) =>
        url.includes("/api/heists"),
      )!;
      const body = JSON.parse((options as RequestInit).body as string);
      expect(body.assignedTo).toBeNull();
      expect(body.assignedToCodename).toBeNull();
    });
  });

  describe("assignee search", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.runAllTimers();
      vi.useRealTimers();
    });

    it("queries the users API after the debounce delay when typing in the assignee field", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ users: [] }),
      });
      render(<CreateHeistForm />);
      fireEvent.focus(screen.getByLabelText(/assignee/i));
      fireEvent.change(screen.getByLabelText(/assignee/i), {
        target: { value: "Bold" },
      });
      await vi.runAllTimersAsync();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/users?q=Bold"),
        expect.anything(),
      );
    });

    it("shows matching results in the dropdown", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            users: [{ id: "uid-456", codename: "BoldRavenGhost" }],
          }),
      });
      render(<CreateHeistForm />);
      fireEvent.focus(screen.getByLabelText(/assignee/i));
      fireEvent.change(screen.getByLabelText(/assignee/i), {
        target: { value: "Bold" },
      });
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      expect(screen.getByText("BoldRavenGhost")).toBeDefined();
    });

    it("selecting a result clears the search input and shows the selected codename", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            users: [{ id: "uid-456", codename: "BoldRavenGhost" }],
          }),
      });
      render(<CreateHeistForm />);
      fireEvent.focus(screen.getByLabelText(/assignee/i));
      fireEvent.change(screen.getByLabelText(/assignee/i), {
        target: { value: "Bold" },
      });
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      expect(screen.getByText("BoldRavenGhost")).toBeDefined();
      fireEvent.click(screen.getByRole("button", { name: "BoldRavenGhost" }));
      expect(screen.getByText("BoldRavenGhost")).toBeDefined();
      expect(screen.queryByPlaceholderText(/search by codename/i)).toBeNull();
    });
  });
});
