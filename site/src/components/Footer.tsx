import { siteContent } from "@/content/site";

export function Footer() {
  const { footer } = siteContent;

  return (
    <footer className="site-footer">
      <p className="footer-copy">
        &copy; {new Date().getFullYear()} {footer.copyright}
      </p>
    </footer>
  );
}
