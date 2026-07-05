import { Contact } from "@/components/Contact";
import { Example } from "@/components/Example";
import { Footer } from "@/components/Footer";
import { Hero } from "@/components/Hero";
import { Motivation } from "@/components/Motivation";
import { Sidebar } from "@/components/Sidebar";
import { Syntax } from "@/components/Syntax";

export default function Home() {
  return (
    <div className="site-shell">
      <Sidebar />

      <div className="site-main">
        <main>
          <Hero />
          <Motivation />
          <Syntax />
          <Example />
          <Contact />
        </main>

        <Footer />
      </div>
    </div>
  );
}
