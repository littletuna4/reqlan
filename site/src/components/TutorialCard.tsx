import type { TutorialDeck } from "@/content/tutorial-model";
import {
  completionGlyph,
  completionLabel,
  type CompletionState,
} from "@/lib/tutorial-progress";
import { sitePath } from "@/lib/paths";
import styles from "./TutorialCard.module.css";

type TutorialCardProps = {
  tutorial: TutorialDeck;
  completion?: CompletionState;
  onToggleComplete?: () => void;
};

export function TutorialCard({
  tutorial,
  completion = "none",
  onToggleComplete,
}: TutorialCardProps) {
  const href = sitePath(`/tutorials/${tutorial.slug}/`);
  const labels = completionLabel(completion, tutorial.title);

  return (
    <div className={styles.row}>
      <button
        type="button"
        className={styles.completeToggle}
        data-complete={completion}
        aria-pressed={completion === "complete"}
        aria-label={labels.aria}
        title={labels.title}
        onClick={(event) => {
          event.preventDefault();
          onToggleComplete?.();
        }}
      >
        {completionGlyph(completion)}
      </button>
      <a href={href} className={styles.card}>
        <span className={styles.order} aria-hidden>
          {String(tutorial.order).padStart(2, "0")}
        </span>
        <span className={styles.body}>
          <span className={styles.title}>{tutorial.title}</span>
          <span className={styles.blurb}>{tutorial.blurb}</span>
        </span>
      </a>
    </div>
  );
}
