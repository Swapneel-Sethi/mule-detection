import Sidebar from "@/components/Sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a href="#main-content" className="skip-nav">Skip to main content</a>

      <Sidebar />
      {/* tabIndex={-1} lets the skip link move focus, not just scroll; focus:outline-none
          stops :focus-visible from drawing a full-page ring around the landmark */}
      <main id="main-content" tabIndex={-1} className="flex-1 lg:ml-[200px] max-lg:pt-14 min-h-screen focus:outline-none">
        {children}
      </main>
    </>
  );
}
