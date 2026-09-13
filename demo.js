// A lightweight tour of genuine native screenshots, not a simulated desktop app.
const shots = {
  notes: ["quillpane-notes.png", "A local Markdown note in Quillpane's reading view", "Read a note: a quiet page, an outline, and your ordinary Markdown file."],
  split: ["markpad-split.png", "Quillpane 0.14.1 with a Markdown draft and its rendered preview side by side", "Write in Split: your Markdown on the left, its preview on the right, with synchronized scrolling."],
  board: ["quillpane-tasks-board.png", "A Markdown task board with workflow columns, tag pills and due dates", "An optional task file: categories become columns; tags and dates keep the next steps organized."],
  calendar: ["quillpane-tasks-calendar.png", "A task calendar with the selected day's agenda on the right", "See the day: choose a date and keep its tasks beside the calendar. No background alarms or account."],
};
const picture = document.getElementById("demo-image");
const caption = document.getElementById("demo-caption");
const full = document.getElementById("demo-full");
for (const button of document.querySelectorAll("[data-demo]")) {
  button.addEventListener("click", () => {
    const [file, alt, text] = shots[button.dataset.demo];
    picture.src = `./photo/${file}`;
    picture.alt = alt;
    full.href = picture.src;
    caption.textContent = text;
    for (const choice of document.querySelectorAll("[data-demo]")) {
      choice.setAttribute("aria-pressed", String(choice === button));
    }
  });
}
