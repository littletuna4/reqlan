import { SiteShell } from "@/components/SiteShell";
import { PASS_RATIO, assessments } from "@/content/assessment";
import { assessmentPath } from "@/lib/certs-paths";
import { sitePath } from "@/lib/paths";
import shared from "@/components/shared.module.css";
import styles from "@/views/assessment.module.css";

export function AssessmentListPage() {
  // rq:["../../../reqlan rq/site/certs.rq".assessment_page]
  return (
    <SiteShell>
      <main className={styles.page}>
        <header className={styles.header}>
          <p className={styles.kicker}>
            <a href={sitePath("/tutorials/")}>Tutorials</a>
            <span aria-hidden> / </span>
            Certification
          </p>
          <h1 className={shared.sectionTitle}>Assessments</h1>
          <p className={styles.lede}>
            Pass at {Math.round(PASS_RATIO * 100)}% for a certificate of
            completion.
          </p>
        </header>

        <ul className={styles.catalog}>
          {assessments.map((assessment) => (
            <li key={assessment.id}>
              <a
                className={styles.catalogLink}
                href={sitePath(assessmentPath(assessment.id))}
              >
                <span className={styles.catalogTitle}>{assessment.title}</span>
                <span className={styles.catalogBlurb}>{assessment.blurb}</span>
              </a>
            </li>
          ))}
        </ul>
      </main>
    </SiteShell>
  );
}
