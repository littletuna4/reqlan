import { Footer } from "@/components/Footer";
import { Sidebar } from "@/components/Sidebar";
import styles from "./SiteShell.module.css";

type SiteShellProps = {
  children: React.ReactNode;
};

export function SiteShell({ children }: SiteShellProps) {
  return (
    <div className={styles.shell}>
      <Sidebar />

      <div className={styles.main}>
        {children}
        <Footer />
      </div>
    </div>
  );
}
