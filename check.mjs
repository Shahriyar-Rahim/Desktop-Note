import { _electron as electron } from 'playwright-core';
import electronPath from 'electron';

const mode = process.argv[2] || 'prod';
const env = { ...process.env };
if(mode === 'dev') env.VITE_DEV_SERVER_URL = "http://127.0.0.1:5173";
const app = await electron.launch({
  executablePath: electronPath,
  args: ["--no-sandbox", "--disable-gpu", "."],
  env
});
const page = await app.firstWindow();
await page.waitForSelector('h1');
const ok = [];
const check = (n, c, x = "") => {
  ok.push(c);
  console.log(`${c ? "PASS" : "FAIL"} ${n} ${x}`);
};
check(
  "heading rendered by React",
  (await page.locator("h1").textContent()) === "Hello, Desktop Notes",
);
const bg = await page
  .locator("div")
  .first()
  .evaluate((e) => getComputedStyle(e.firstElementChild).backgroundColor);

check("Tailwind CSS is applied", bg !== "rgba(0, 0, 0, 0)", bg);

check(mode === 'dev' ? 'page comes from the Vite dev server' : 'page comes from dist/index.html', mode === 'dev' ?
    page.url().startsWith('http://127.0.0.1:5173') : page.url().startsWith('file://') && page.url().endsWith('/dist/index.html'), page.url());


    check(
      "no Node.js in the page",
      await page.evaluate(
        () => typeof require === "undefined" && typeof process === "undefined",
      ),
    );


await page.getByRole("button", { name: "Ping the main process" }).click();

await page.waitForFunction(
  () => document.querySelector("[data-testid=reply]").textContent.length > 0,
);

const reply = await page.getByTestId("reply").textContent();

check(
  "IPC round trip (React -> preload -> main -> back)",
  reply.startsWith("pong: hello from React"),
  reply,
);

await app.close();
process.exit(ok.every(Boolean) ? 0 : 1);