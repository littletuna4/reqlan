"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { SiteShell } from "@/components/SiteShell";
import { assessments, getAssessment } from "@/content/assessment";
import {
  parseCertificateToken,
  type CertificateClaims,
} from "@/lib/certificate-token";
import {
  CERTIFICATE_JUST_COMPLETED_PARAM,
  CERTIFICATE_TOKEN_PARAM,
  assessmentPath,
  assessmentsEntryPath,
  certificatePath,
  isJustCompletedParam,
} from "@/lib/certs-paths";
import { googleFormEmbedSrc } from "@/lib/google-form-embed";
import { getPhonebookLink } from "@/lib/phonebook";
import { sitePath } from "@/lib/paths";
import styles from "@/views/certificate.module.css";

export function CertificatePage() {
  // rq:["../../../reqlan rq/site/certs.rq".certificate_page]
  return (
    <SiteShell>
      <Suspense fallback={<CertificateLoading />}>
        <CertificateFromQuery />
      </Suspense>
    </SiteShell>
  );
}

function CertificateLoading() {
  return (
    <main className={styles.page}>
      <p className={styles.status}>Reading certificate…</p>
    </main>
  );
}

function CertificateFromQuery() {
  const searchParams = useSearchParams();
  const token = searchParams.get(CERTIFICATE_TOKEN_PARAM);
  const justCompleted = isJustCompletedParam(
    searchParams.get(CERTIFICATE_JUST_COMPLETED_PARAM),
  );
  const [claims, setClaims] = useState<CertificateClaims | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "invalid">("loading");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!token) {
        if (!cancelled) setStatus("invalid");
        return;
      }
      const parsed = await parseCertificateToken(token);
      if (cancelled) return;
      if (!parsed) {
        setClaims(null);
        setStatus("invalid");
        return;
      }
      setClaims(parsed);
      setStatus("ok");
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const shareableHref = token ? certificatePath(token) : null;
  const [shareableAbsolute, setShareableAbsolute] = useState<string | null>(null);

  useEffect(() => {
    if (!shareableHref) {
      setShareableAbsolute(null);
      return;
    }
    setShareableAbsolute(`${window.location.origin}${sitePath(shareableHref)}`);
  }, [shareableHref]);

  const stickerForm = getPhonebookLink("sticker-form");
  const stickerEmbedSrc = useMemo(() => {
    if (!justCompleted) return null;
    try {
      return googleFormEmbedSrc(stickerForm.href);
    } catch {
      return null;
    }
  }, [justCompleted, stickerForm.href]);

  const onCopy = async () => {
    if (!shareableAbsolute) return;
    try {
      await navigator.clipboard.writeText(shareableAbsolute);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  if (status === "loading") {
    return (
      <main className={styles.page}>
        <p className={styles.status}>Reading certificate…</p>
      </main>
    );
  }

  if (status === "invalid" || !claims) {
    return (
      <main className={styles.page}>
        <div className={styles.invalid}>
          <h1 className={styles.invalidTitle}>Couldn’t read this certificate</h1>
          <p className={styles.invalidBody}>
            The link is missing or damaged. Retake the assessment to mint a new
            one.
          </p>
          <a
            className={styles.backLink}
            href={sitePath(assessmentsEntryPath(assessments))}
          >
            Back to assessment
          </a>
        </div>
      </main>
    );
  }

  const completed = new Date(claims.d);
  const completedLabel = Number.isNaN(completed.getTime())
    ? claims.d
    : completed.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
  const assessment = getAssessment(claims.a);
  const assessmentTitle = assessment?.title ?? "reqlan";
  const quizHref = assessment
    ? assessmentPath(assessment.id)
    : assessmentsEntryPath(assessments);

  return (
    <main className={styles.page}>
      <article className={styles.cert} aria-label="reqlan certificate">
        <img
          className={styles.logo}
          src={sitePath("/logo.svg")}
          alt=""
          width={56}
          height={56}
        />
        <p className={styles.brand}>reqlan</p>
        <h1 className={styles.heading}>Certificate of completion</h1>
        <p className={styles.line}>This certifies that</p>
        <p className={styles.name}>{claims.n}</p>
        <p className={styles.line}>
          completed the{" "}
          <a className={styles.assessmentLink} href={sitePath(quizHref)}>
            {assessmentTitle}
          </a>{" "}
          assessment
        </p>
        <p className={styles.date}>{completedLabel}</p>
        <p className={styles.footnote}>semantic engineering with reqlan</p>
      </article>

      {justCompleted && shareableAbsolute ? (
        <section className={styles.share} aria-label="Shareable certificate link">
          <p className={styles.shareLead}>Share or bookmark this link.</p>
          <div className={styles.linkRow}>
            <input
              className={styles.linkInput}
              readOnly
              value={shareableAbsolute}
              aria-label="Certificate link"
            />
            <button type="button" className={styles.secondary} onClick={() => void onCopy()}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </section>
      ) : null}

      <div className={styles.toolbar}>
        <button type="button" className={styles.print} onClick={() => window.print()}>
          Print / save PDF
        </button>
        <a className={styles.backLink} href={sitePath("/tutorials/")}>
          Tutorials
        </a>
      </div>

      {justCompleted ? (
        <section className={styles.sticker} aria-labelledby="sticker-form-title">
          <h2 id="sticker-form-title" className={styles.stickerTitle}>
            {stickerForm.label}
          </h2>
          <p className={styles.stickerLead}>Fill in the form to get stickers.</p>
          {stickerEmbedSrc ? (
            <iframe
              className={styles.stickerFrame}
              src={stickerEmbedSrc}
              title={stickerForm.label}
            />
          ) : null}
          <a
            className={styles.stickerOpen}
            href={stickerForm.href}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open form
          </a>
        </section>
      ) : null}
    </main>
  );
}
