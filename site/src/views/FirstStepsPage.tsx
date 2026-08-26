// rq:["../../../reqlan rq/marketing_and_media/first-steps.rq".first_steps_page]
// rq:["../../../reqlan rq/site/site.rq".tutorials_section]
import Link from "next/link";
import type { Route } from "next";

import { RqCode } from "@/components/RqCode";
import { SiteShell } from "@/components/SiteShell";
import { firstStepsContent } from "@/content/first-steps";
import { sitePath } from "@/lib/paths";
import shared from "@/components/shared.module.css";
import styles from "./FirstStepsPage.module.css";

function StepDemo({
  language,
  label,
  code,
}: {
  language: "rq" | "ts" | "sh";
  label: string;
  code: string;
}) {
  return (
    <figure className={styles.demo}>
      <figcaption className={styles.demoLabel}>{label}</figcaption>
      {language === "rq" ? (
        <RqCode code={code} />
      ) : (
        <pre className={styles.plainPre}>
          <code>{code}</code>
        </pre>
      )}
    </figure>
  );
}

export function FirstStepsPage() {
  const { title, kicker, intro, timeEstimate, steps } = firstStepsContent;

  return (
    <SiteShell>
      <main className={styles.page}>
        <header className={styles.header}>
          <Link href={"/quickstart" as Route} className={styles.back}>
            ← Get started
          </Link>
          <p className={styles.kicker}>{kicker}</p>
          <h1 className={shared.sectionTitle}>{title}</h1>
          <p className={styles.intro}>{intro}</p>
          <p className={styles.timeEstimate}>{timeEstimate}</p>
        </header>

        <ol className={styles.steps}>
          {steps.map((step, index) => (
            <li key={step.id} id={step.id} className={styles.step}>
              <div className={styles.stepHeader}>
                <span className={styles.stepNumber} aria-hidden>
                  {index + 1}
                </span>
                <h2 className={styles.stepTitle}>{step.title}</h2>
              </div>
              <p className={styles.stepGoal}>{step.goal}</p>
              <ol className={styles.stepActions}>
                {step.actions.map((action) => (
                  <li key={action}>{action}</li>
                ))}
              </ol>
              {step.demo ? (
                <StepDemo
                  language={step.demo.language}
                  label={step.demo.label}
                  code={step.demo.code}
                />
              ) : null}
              <p className={styles.stepResult}>
                <span className={styles.resultLabel}>You will see</span>{" "}
                {step.result}
              </p>
              <p className={styles.lessonRow}>
                <span className={styles.lessonLabel}>Watch this step</span>
                <a
                  href={sitePath(`/tutorials/${step.lesson.id}/`)}
                  className={styles.lessonLink}
                >
                  {step.lesson.label}
                </a>
              </p>
            </li>
          ))}
        </ol>

        <section className={styles.next} aria-labelledby="first-steps-next">
          <h2 id="first-steps-next" className={styles.nextTitle}>
            Keep going
          </h2>
          <ul className={styles.nextList}>
            <li>
              <Link
                className={styles.nextLink}
                href={"/tutorials" as Route}
              >
                Watch the video course
              </Link>
            </li>
            <li>
              <Link className={styles.nextLink} href={"/showcase" as Route}>
                See reqlan against real problems
              </Link>
            </li>
            <li>
              <Link className={styles.nextLink} href={"/faq" as Route}>
                Read the FAQ
              </Link>
            </li>
          </ul>
        </section>
      </main>
    </SiteShell>
  );
}
