// rq:["../../../reqlan rq/site/site.rq".tutorial_player_transport]
import { sitePath } from "./paths";

export type TransportDir = "prev" | "next";

export type TransportNeighbor = {
  slug: string;
  title: string;
  slideCount: number;
};

export type TransportStep =
  | { kind: "slide"; dir: TransportDir }
  | {
      kind: "lesson";
      dir: TransportDir;
      slug: string;
      title: string;
      slide: number;
    }
  | { kind: "none"; dir: TransportDir };

export function resolveTransportStep(
  dir: TransportDir,
  canMoveSlide: boolean,
  neighbor: TransportNeighbor | null,
): TransportStep {
  if (canMoveSlide) {
    return { kind: "slide", dir };
  }
  if (!neighbor) {
    return { kind: "none", dir };
  }
  return {
    kind: "lesson",
    dir,
    slug: neighbor.slug,
    title: neighbor.title,
    slide: dir === "prev" ? Math.max(1, neighbor.slideCount) : 1,
  };
}

export function transportControlCopy(
  step: TransportStep,
  slideLabel: string,
): { aria: string; tooltip: string; disabled: boolean } {
  if (step.kind === "slide") {
    const which = step.dir === "prev" ? "Previous" : "Next";
    const key = step.dir === "prev" ? "←" : "→";
    return {
      aria: `${which} slide (${slideLabel})`,
      tooltip: `${which} slide · ${slideLabel} (${key})`,
      disabled: false,
    };
  }
  if (step.kind === "lesson") {
    const which = step.dir === "prev" ? "Previous" : "Next";
    const key = step.dir === "prev" ? "←" : "→";
    return {
      aria: `${which} lesson: ${step.title}`,
      tooltip: `${which} lesson · ${step.title} (${key})`,
      disabled: false,
    };
  }
  return {
    aria: step.dir === "prev" ? "Previous slide" : "Next slide",
    tooltip: step.dir === "prev" ? "Start of deck" : "End of deck",
    disabled: true,
  };
}

export function tutorialLessonHref(slug: string, slide = 1): string {
  const path = sitePath(`/tutorials/${slug}/`);
  if (slide <= 1) {
    return path;
  }
  return `${path}?slide=${String(slide)}`;
}

export function tutorialPlayerSrc(deckId: string, slide = 1): string {
  const params = new URLSearchParams({
    deck: deckId,
    embed: "1",
    slide: String(Math.max(1, slide)),
  });
  return sitePath(`/presentations/player/?${params.toString()}`);
}
