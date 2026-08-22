"use client";

import { useState } from "react";

import {
  flattenSupportActions,
  support,
  supportGroupById,
  supportScore,
  type SupportAction,
} from "@/content/support";
import {
  copySupportText,
  isHttpSupportHref,
  runSupportShare,
  supportLinkHref,
} from "@/lib/support-action";
import styles from "@/views/support.module.css";

export function SupportTable() {
  // rq:["../../../reqlan rq/site/support-page.rq".support_page]

  const rows = flattenSupportActions()
    .map((action) => ({
      action,
      group: supportGroupById(action.groupId),
      score: supportScore(action.ease, action.impact),
    }))
    .sort((a, b) => b.score - a.score || b.action.ease - a.action.ease);

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">{support.table.action}</th>
            <th scope="col">{support.table.group}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ action, group }) => (
            <tr key={action.id}>
              <th scope="row">
                <TableAction action={action} />
              </th>
              <td>{group.title}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TableAction({ action }: { action: SupportAction }) {
  const copied = useCopiedFlag();
  const label = copied.flag ? "Copied" : action.title;

  if (action.kind === "copy") {
    return (
      <button
        type="button"
        className={styles.tableAction}
        onClick={() => void copied.run(action.text)}
      >
        {label}
      </button>
    );
  }

  if (action.kind === "share") {
    return (
      <button
        type="button"
        className={styles.tableAction}
        onClick={() =>
          void runSupportShare(action).then((result) => {
            if (result === "copied") {
              copied.set();
            }
          })
        }
      >
        {label}
      </button>
    );
  }

  const href = supportLinkHref(action);
  const isHttp = isHttpSupportHref(href);
  return (
    <a
      className={styles.tableAction}
      href={href}
      {...(isHttp ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {action.title}
    </a>
  );
}

function useCopiedFlag() {
  const [flag, setFlag] = useState(false);

  const run = async (text: string) => {
    try {
      await copySupportText(text);
      set();
    } catch {
      setFlag(false);
    }
  };

  const set = () => {
    setFlag(true);
    window.setTimeout(() => setFlag(false), 1600);
  };

  return { flag, run, set };
}
