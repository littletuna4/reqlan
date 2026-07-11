import { Footer } from "@/components/Footer";
import { Sidebar } from "@/components/Sidebar";

type SiteShellProps = {
  children: React.ReactNode;
};

export function SiteShell({ children }: SiteShellProps) {
  return (
    <div className="site-shell">
      <Sidebar />

      <div className="site-main">
        {children}
        <Footer />
      </div>
    </div>
  );
}
