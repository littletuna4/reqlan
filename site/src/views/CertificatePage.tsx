"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { SiteShell } from "@/components/SiteShell";
import {
  parseCertificateToken,
  type CertificateClaims,
} from "@/lib/certificate-token";
import { sitePath } from "@/lib/paths";
import styles from "@/views/certificate.module.css";

export function CertificatePage() {
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
  const token = searchParams.get("c");
  const [claims, setClaims] = useState<CertificateClaims | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "invalid">("loading");

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
          <a className={styles.backLink} href={sitePath("/tutorials/assessment/")}>
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

  return (
    <main className={styles.page}>
      <article className={styles.cert} aria-label="reqlan tutorial certificate">
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
          completed the reqlan tutorial assessment
        </p>
        <p className={styles.date}>{completedLabel}</p>
        <p className={styles.footnote}>
          semantic engineering with reqlan
        </p>
      </article>
      <div className={styles.toolbar}>
        <button type="button" className={styles.print} onClick={() => window.print()}>
          Print / save PDF
        </button>
        <a className={styles.backLink} href={sitePath("/tutorials/")}>
          Tutorials
        </a>
      </div>
    </main>
  );
}
