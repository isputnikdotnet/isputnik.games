import { useEffect, useState } from "react";

// What the top bar needs to know about the home app it stands in for: which
// sections the household uses (the admin's Sections card), whether video is set
// up for this person, and how much is in each library. The games are served on
// the home origin, so these are home's own answers, asked once per page load.
// Any that fails leaves the bar as the home app would draw it with nothing known:
// every section on, no video, no counts.

export interface HomeSections {
  audiobooks: boolean;
  ebooks: boolean;
  gallery: boolean;
  familyTree: boolean;
  stories: boolean;
  video: boolean;
}

export interface HomeCounts {
  audiobooks?: number;
  ebooks?: number;
  photos?: number;
  video?: number;
}

export interface HomeNav {
  sections: HomeSections;
  video: boolean;
  counts: HomeCounts;
}

const ALL_ON: HomeSections = { audiobooks: true, ebooks: true, gallery: true, familyTree: true, stories: true, video: true };

export const UNKNOWN_HOME: HomeNav = { sections: ALL_ON, video: false, counts: {} };

async function homeJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { credentials: "same-origin" });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("json")) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function videoTitles(): Promise<number | undefined> {
  const total = (kind: string) => homeJson<{ total?: number }>(`/video/api/${kind}?pageSize=1`).then((page) => page?.total);
  const [movies, shows] = await Promise.all([total("movies"), total("shows")]);
  return movies === undefined && shows === undefined ? undefined : (movies ?? 0) + (shows ?? 0);
}

async function load(): Promise<HomeNav> {
  const [setup, video, counts] = await Promise.all([
    homeJson<{ sections?: Partial<HomeSections> }>("/api/setup/status"),
    homeJson<{ enabled?: boolean }>("/api/video/status"),
    homeJson<HomeCounts>("/api/home/libraries")
  ]);
  const sections = { ...ALL_ON, ...setup?.sections };
  const videoOn = Boolean(video?.enabled) && sections.video;
  return {
    sections,
    video: videoOn,
    counts: { ...counts, ...(videoOn ? { video: await videoTitles() } : {}) }
  };
}

let pending: Promise<HomeNav> | null = null;
let known: HomeNav | null = null;

export function useHomeNav(): HomeNav {
  const [nav, setNav] = useState<HomeNav>(known ?? UNKNOWN_HOME);
  useEffect(() => {
    let live = true;
    pending ??= load().then((next) => (known = next));
    void pending.then((next) => {
      if (live) setNav(next);
    });
    return () => {
      live = false;
    };
  }, []);
  return nav;
}

/** Tests only: forget what home said. */
export function resetHomeNav(): void {
  pending = null;
  known = null;
}
