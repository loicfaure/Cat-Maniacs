// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button, Checkbox, DateInput, DateTimeInput, FieldGroup, Notification } from "../ui";

let root: Root | undefined;
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
  vi.useRealTimers();
});

async function render(element: ReactNode) {
  if (!root) {
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  }
  await act(async () => root?.render(element));
}

describe("shared UI behavior", () => {
  it("uses native date and datetime pickers and submits their local values unchanged", async () => {
    await render(
      createElement(
        "form",
        null,
        createElement(DateInput, { name: "date", defaultValue: "2026-10-22" }),
        createElement(DateTimeInput, { name: "time", defaultValue: "2026-10-22T14:30" }),
      ),
    );
    const form = document.querySelector("form")!;
    expect(form.querySelector<HTMLInputElement>('[name="date"]')?.type).toBe("date");
    expect(form.querySelector<HTMLInputElement>('[name="time"]')?.type).toBe("datetime-local");
    expect([...new FormData(form).entries()]).toEqual([
      ["date", "2026-10-22"],
      ["time", "2026-10-22T14:30"],
    ]);
  });
  it("preserves native form actions and submitted checkbox values", async () => {
    const submit = vi.fn((event: React.FormEvent<HTMLFormElement>) => event.preventDefault());
    await render(
      createElement(
        "form",
        { onSubmit: submit },
        createElement(FieldGroup, {
          label: "Profils acceptés",
          children: createElement(Checkbox, {
            name: "profiles",
            value: "adult",
            description: "Animaux adultes uniquement.",
            children: "Adultes",
          }),
        }),
        createElement(Button, { type: "button", children: "Annuler" }),
        createElement(Button, { type: "submit", children: "Enregistrer" }),
      ),
    );
    expect(document.querySelector("label label")).toBeNull();
    const checkbox = document.querySelector("input")!;
    const description = document.getElementById(checkbox.getAttribute("aria-describedby")!);
    expect(description?.textContent).toBe("Animaux adultes uniquement.");
    await act(async () => document.querySelector("label")?.click());
    expect(new FormData(document.querySelector("form")!).getAll("profiles")).toEqual(["adult"]);
    const buttons = document.querySelectorAll("button");
    await act(async () => buttons[0].click());
    expect(submit).not.toHaveBeenCalled();
    await act(async () => buttons[1].click());
    expect(submit).toHaveBeenCalledOnce();
  });

  it("gives each new notification a full 30 seconds without an older timer dismissing it", async () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    await render(
      createElement(Notification, {
        notice: { kind: "success", text: "Enregistré." },
        onDismiss,
      }),
    );
    await act(async () => vi.advanceTimersByTime(29_000));
    expect(onDismiss).not.toHaveBeenCalled();
    await render(
      createElement(Notification, {
        notice: { kind: "error", text: "Connexion interrompue." },
        onDismiss,
      }),
    );
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      "Connexion interrompue.",
    );
    await act(async () => vi.advanceTimersByTime(29_999));
    expect(onDismiss).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(1));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("allows manual notification dismissal and cancels the timer on unmount", async () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    await render(
      createElement(Notification, {
        notice: { kind: "success", text: "Enregistré." },
        onDismiss,
      }),
    );
    await act(async () => document.querySelector("button")?.click());
    expect(onDismiss).toHaveBeenCalledOnce();
    await render(null);
    await act(async () => vi.advanceTimersByTime(30_000));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
