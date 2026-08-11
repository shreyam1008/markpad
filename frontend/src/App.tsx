import { useEffect, useRef, useState } from "react";
import shell from "./legacy-shell.txt";

function App() {
  const started = useRef(false);
  const [startupError, setStartupError] = useState("");

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void import("./legacy-controller")
      .catch((error: unknown) => {
        setStartupError(error instanceof Error ? error.message : String(error));
      });
  }, []);

  if (startupError) {
    return (
      <main className="flex h-full items-center justify-center bg-[#f4f2ed] p-8 text-[#1a1c1b]">
        <section className="max-w-xl rounded-2xl border border-[#d8d6ce] bg-[#fafaf7] p-6 shadow-xl">
          <h1 className="text-base font-bold">Markpad could not finish starting</h1>
          <p className="mt-3 text-sm leading-6 text-[#6b6e68]">{startupError}</p>
        </section>
      </main>
    );
  }

  return <div id="legacy-react-host" dangerouslySetInnerHTML={{ __html: shell }} />;
}

export default App;
