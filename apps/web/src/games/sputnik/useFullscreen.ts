import { useCallback, useEffect, useState } from "react";

const supported = () => typeof document !== "undefined" && document.fullscreenEnabled === true;

// The page in full screen, for the handheld: on a phone it also asks to be held
// sideways, which Android allows once in full screen. A browser that cannot
// (an iPhone's Safari) offers nothing, and turning the phone by hand does the
// same job there.
export function useFullscreen() {
  const [on, setOn] = useState(() => supported() && document.fullscreenElement !== null);

  useEffect(() => {
    if (!supported()) return;
    const sync = () => setOn(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const toggle = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      await document.documentElement.requestFullscreen({ navigationUI: "hide" });
      // Not every browser lets a page turn the screen; the lock is a wish.
      const orientation = screen.orientation as ScreenOrientation & { lock?: (to: string) => Promise<void> };
      await orientation.lock?.("landscape").catch(() => undefined);
    } catch {
      /* refused (no gesture, an embedded frame): the page stays as it was */
    }
  }, []);

  return { supported: supported(), on, toggle };
}
