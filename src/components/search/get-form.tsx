"use client";
import type { ComponentProps } from "react";

/** Native GET form that leaves empty fields out of the URL (?q=x, not ?q=x&cpc=&ipc=). */
export function GetForm(props: Omit<ComponentProps<"form">, "onSubmit">) {
  return (
    <form
      {...props}
      onSubmit={(event) => {
        const empty = [...event.currentTarget.elements].filter(
          (element): element is HTMLInputElement | HTMLSelectElement =>
            (element instanceof HTMLInputElement ||
              element instanceof HTMLSelectElement) &&
            Boolean(element.name) &&
            !element.value.trim(),
        );
        empty.forEach((element) => (element.disabled = true));
        // Re-enable after the browser has captured the form data.
        requestAnimationFrame(() =>
          empty.forEach((element) => (element.disabled = false)),
        );
      }}
    />
  );
}
