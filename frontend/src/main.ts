import shell from "./legacy-shell.txt";

import "./styles.css";

document.body.className =
  "h-screen w-screen overflow-hidden bg-[#f4f2ed] text-[#1a1c1b] font-sans text-sm antialiased select-none";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Markpad root element is missing");
}

root.innerHTML = shell;

void import("./legacy-controller").catch((error: unknown) => {
  const main = document.createElement("main");
  main.className = "flex h-full items-center justify-center bg-[#f4f2ed] p-8 text-[#1a1c1b]";

  const section = document.createElement("section");
  section.className = "max-w-xl rounded-2xl border border-[#d8d6ce] bg-[#fafaf7] p-6 shadow-xl";

  const heading = document.createElement("h1");
  heading.className = "text-base font-bold";
  heading.textContent = "Markpad could not finish starting";

  const message = document.createElement("p");
  message.className = "mt-3 text-sm leading-6 text-[#6b6e68]";
  message.textContent = error instanceof Error ? error.message : String(error);

  section.append(heading, message);
  main.appendChild(section);
  root.replaceChildren(main);
});
