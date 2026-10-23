import { useEffect } from "react";

// A game that wears a theme of its own (Star Battle's dark space) marks the
// document while its page is up, so the stylesheet can dress the page body and
// widen the main column without touching the app bar or the dialogs.
export function useArena(name: string): void {
  useEffect(() => {
    document.body.dataset.arena = name;
    return () => {
      delete document.body.dataset.arena;
    };
  }, [name]);
}
