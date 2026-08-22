"use client";

import { Icon } from "@iconify/react/dist/offline";
import graphOutline from "@iconify-icons/mdi/graph-outline";
import table from "@iconify-icons/mdi/table";
import viewGridOutline from "@iconify-icons/mdi/view-grid-outline";
import { useState } from "react";

import { PhonebookIcon } from "@/components/PhonebookIcon";
import { SiteShell } from "@/components/SiteShell";
import shared from "@/components/shared.module.css";
import {
  support,
  type SupportAction,
  type SupportCopyAction,
  type SupportShareAction,
  type SupportView,
} from "@/content/support";
import {
  getPhonebookLink,
  type PhonebookIconRef,
} from "@/lib/phonebook";
import {
  copySupportText,
  isHttpSupportHref,
  runSupportShare,
  supportLinkHref,
} from "@/lib/support-action";
import { SupportGraph } from "@/views/SupportGraph";
import { SupportTable } from "@/views/SupportTable";
import styles from "@/views/support.module.css";

const views = ["graph", "tiles", "table"] as const satisfies readonly SupportView[];

const viewIcons = {
  graph: graphOutline,
  tiles: viewGridOutline,
  table,
} as const;

export function SupportPage() {
  // rq:["../../../reqlan rq/site/support-page.rq".support_page]
  // rq:["../../../reqlan rq/phonebook.rq".phonebook]

  const [view, setView] = useState<SupportView>("graph");

  return (
    <SiteShell>
      <main className={styles.page}>
        <header className={styles.header}>
          <div className={styles.headerCopy}>
            <h1 className={shared.sectionTitle}>{support.title}</h1>
            <p className={styles.intro}>{support.lead}</p>
          </div>
          <div
            className={styles.viewToggle}
            role="tablist"
            aria-label={support.viewsLabel}
          >
            {views.map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-label={support.views[id]}
                aria-selected={view === id}
                data-tooltip={support.views[id]}
                onClick={() => setView(id)}
              >
                <Icon icon={viewIcons[id]} className={styles.viewIcon} aria-hidden />
              </button>
            ))}
          </div>
        </header>

        {view === "graph" ? <SupportGraph /> : null}
        {view === "table" ? <SupportTable /> : null}
        {view === "tiles" ? <SupportTiles /> : null}
      </main>
    </SiteShell>
  );
}

function SupportTiles() {
  return (
    <div className={styles.sections}>
      {support.sections.map((section) => (
        <section
          key={section.id}
          id={section.id}
          className={styles.section}
          aria-labelledby={`${section.id}-title`}
        >
          <h2 id={`${section.id}-title`} className={styles.sectionTitle}>
            {section.title}
          </h2>
          <ul className={styles.actions}>
            {section.actions.map((action) => (
              <li
                key={action.id}
                className={action.id === "star" ? styles.featured : undefined}
              >
                <SupportActionCard action={action} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function SupportActionCard({ action }: { action: SupportAction }) {
  const icon = getPhonebookLink(action.iconId).icon;

  if (action.kind === "copy") {
    return <CopyActionCard action={action} icon={icon} />;
  }
  if (action.kind === "share") {
    return <ShareActionCard action={action} icon={icon} />;
  }

  const href = supportLinkHref(action);
  const isHttp = isHttpSupportHref(href);

  return (
    <a
      className={styles.action}
      href={href}
      {...(isHttp ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      <ActionBody icon={icon} title={action.title} blurb={action.blurb} />
    </a>
  );
}

function CopyActionCard({
  action,
  icon,
}: {
  action: SupportCopyAction;
  icon?: PhonebookIconRef;
}) {
  const copied = useCopiedFlag();

  return (
    <button
      type="button"
      className={styles.action}
      onClick={() => void copied.run(action.text)}
    >
      <ActionBody
        icon={icon}
        title={action.title}
        blurb={action.blurb}
        hint={copied.flag ? "Copied" : "Copy"}
      />
    </button>
  );
}

function ShareActionCard({
  action,
  icon,
}: {
  action: SupportShareAction;
  icon?: PhonebookIconRef;
}) {
  const copied = useCopiedFlag();

  const onShare = async () => {
    const result = await runSupportShare(action);
    if (result === "copied") {
      copied.mark();
    }
  };

  return (
    <button type="button" className={styles.action} onClick={() => void onShare()}>
      <ActionBody
        icon={icon}
        title={action.title}
        blurb={action.blurb}
        hint={copied.flag ? "Copied" : "Share"}
      />
    </button>
  );
}

function ActionBody({
  icon,
  title,
  blurb,
  hint,
}: {
  icon?: PhonebookIconRef;
  title: string;
  blurb: string;
  hint?: string;
}) {
  return (
    <>
      <PhonebookIcon icon={icon} className={styles.actionIcon} />
      <span className={styles.actionCopy}>
        <span className={styles.actionTitle}>{title}</span>
        <span className={styles.actionBlurb}>{blurb}</span>
      </span>
      {hint ? <span className={styles.actionHint}>{hint}</span> : null}
    </>
  );
}

function useCopiedFlag() {
  const [flag, setFlag] = useState(false);

  const mark = () => {
    setFlag(true);
    window.setTimeout(() => setFlag(false), 1600);
  };

  const run = async (text: string) => {
    try {
      await copySupportText(text);
      mark();
    } catch {
      setFlag(false);
    }
  };

  return { flag, run, mark };
}
