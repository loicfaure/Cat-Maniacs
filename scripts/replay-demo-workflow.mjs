import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";

const electronName = process.platform === "win32" ? "electron.exe" : "electron";
const electron = process.env.ELECTRON_BINARY ?? resolve("node_modules/electron/dist", electronName);
if (!existsSync(electron)) {
  throw new Error(
    "Electron est introuvable. Définissez ELECTRON_BINARY vers un binaire Electron déjà installé.",
  );
}

const port = process.env.CAT_DEMO_DEBUG_PORT
  ? Number(process.env.CAT_DEMO_DEBUG_PORT)
  : await findFreePort();
const environment = {
  ...process.env,
  CAT_DISPENSER_DEMO: "1",
  CAT_DISPENSER_DEMO_RESET: "1",
};
const args = [];
if (process.env.CAT_DISPENSER_NO_SANDBOX === "1") {
  args.push("--no-sandbox");
}
args.push(`--remote-debugging-port=${port}`, ".");

const child = spawn(electron, args, { stdio: "inherit", env: environment });
let childExit;
child.once("exit", (code, signal) => {
  childExit = { code, signal };
});

try {
  await replay();
  console.log("\nParcours démo réussi. La fenêtre reste ouverte pour l'exploration manuelle.");
} catch (error) {
  console.error("\nÉchec du parcours démo :", error);
  child.kill();
  process.exitCode = 1;
}

if (process.exitCode !== 1 && !childExit) {
  await new Promise((resolveExit) => child.once("exit", resolveExit));
}

async function replay() {
  const deadline = Date.now() + 30_000;
  let page;
  while (!page && Date.now() < deadline) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      page = targets.find((target) => target.type === "page" && target.url.startsWith("file://"));
    } catch {}
    if (!page) {
      await delay(250);
    }
  }
  if (!page) {
    throw new Error(`Aucune fenêtre Electron détectée sur le port DevTools ${port}.`);
  }

  const cdp = await connect(page.webSocketDebuggerUrl);
  try {
    await waitFor(
      cdp,
      "!!document.querySelector('main h1')",
      "L'application ne s'est pas chargée.",
    );
    await clickText(cdp, "Explorer la démonstration", { optional: true });

    const pages = [
      "Vue d'ensemble",
      "Chats",
      "Le refuge",
      "Familles d'accueil",
      "Adoptions",
      "Journées adoption",
      "Parrainages",
      "Rappels",
      "E-mails",
      "Importer",
    ];
    for (const title of pages) {
      await clickText(cdp, title, { selector: "nav button" });
      await waitFor(
        cdp,
        `document.querySelector('main h1')?.innerText === ${JSON.stringify(title)}`,
        `La section « ${title} » ne s'est pas ouverte.`,
      );
    }

    await clickText(cdp, "Chats", { selector: "nav button" });
    await clickText(cdp, "+ Nouveau chat", { selector: "main button" });
    await waitFor(
      cdp,
      "!!document.querySelector('input[name=name]')",
      "Le formulaire de création de chat ne s'est pas ouvert.",
    );
    const qaName = `QA Replay ${Date.now()}`;
    await evaluate(
      cdp,
      `(() => {
      const form = document.querySelector('form');
      const name = form.elements.namedItem('name');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(name, ${JSON.stringify(qaName)});
      name.dispatchEvent(new Event('input', { bubbles: true }));
      form.requestSubmit();
    })()`,
    );
    await waitFor(
      cdp,
      `!document.querySelector('input[name=name]') && document.querySelector('nav button:nth-child(2)')?.innerText.includes('65')`,
      "Le chat de contrôle n'a pas été enregistré.",
    );

    await evaluate(
      cdp,
      `(() => {
      const search = document.querySelector('input[placeholder*="Nom, ICAD"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(search, ${JSON.stringify(qaName)});
      search.dispatchEvent(new Event('input', { bubbles: true }));
    })()`,
    );
    await waitFor(
      cdp,
      `Array.from(document.querySelectorAll('tbody tr')).some(row => row.innerText.includes(${JSON.stringify(qaName)}))`,
      "Le chat de contrôle n'apparaît pas dans le registre.",
    );
    await evaluate(
      cdp,
      `Array.from(document.querySelectorAll('tbody tr')).find(row => row.innerText.includes(${JSON.stringify(qaName)})).click()`,
    );
    await waitFor(
      cdp,
      "!!document.querySelector('.cat-detail-dialog')",
      "La fiche du chat ne s'est pas ouverte.",
    );
    const newsDisabled = await evaluate(
      cdp,
      `Array.from(document.querySelectorAll('.cat-detail-header button')).find(button => button.innerText.includes('Donner des nouvelles'))?.disabled`,
    );
    if (!newsDisabled) {
      throw new Error(
        "Le bouton « Donner des nouvelles » devrait être désactivé sans parrain actif.",
      );
    }

    await clickText(cdp, "+ Événement", { selector: ".cat-detail-header button" });
    await waitFor(
      cdp,
      "!!document.querySelector('.cat-history-sidebar input[name=title]')",
      "Le formulaire d'événement ne s'est pas ouvert.",
    );
    await evaluate(
      cdp,
      `(() => {
      const form = Array.from(document.forms).find(candidate => candidate.elements.namedItem('title'));
      const title = form.elements.namedItem('title');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(title, 'Événement de contrôle');
      title.dispatchEvent(new Event('input', { bubbles: true }));
      form.requestSubmit();
    })()`,
    );
    await waitFor(
      cdp,
      `document.querySelector('.cat-history-sidebar')?.innerText.includes('Événement de contrôle') && !document.querySelector('input[name=title]')`,
      "L'événement n'a pas été ajouté au panneau de droite ou le formulaire est resté ouvert.",
    );
    await evaluate(cdp, "window.confirm = () => true");
    await evaluate(
      cdp,
      `Array.from(document.querySelectorAll('.cat-history-sidebar button')).find(button => button.title.includes('Supprimer'))?.click()`,
    );
    await waitFor(
      cdp,
      `!document.querySelector('.cat-history-sidebar')?.innerText.includes('Événement de contrôle')`,
      "L'événement de contrôle n'a pas été supprimé.",
    );
    await clickText(cdp, "×", { selector: ".cat-detail-header button" });
    await waitFor(
      cdp,
      "!document.querySelector('.cat-detail-dialog')",
      "La fiche du chat ne s'est pas fermée.",
    );

    await evaluate(
      cdp,
      `(() => {
      const search = document.querySelector('input[placeholder*="Nom, ICAD"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(search, 'Amande');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    })()`,
    );
    await waitFor(
      cdp,
      `Array.from(document.querySelectorAll('tbody tr')).some(row => row.innerText.includes('Amande'))`,
      "Le chat de démonstration parrainé n'apparaît pas dans le registre.",
    );
    await evaluate(
      cdp,
      `Array.from(document.querySelectorAll('tbody tr')).find(row => row.innerText.includes('Amande')).click()`,
    );
    await waitFor(
      cdp,
      "!!document.querySelector('.cat-detail-dialog')",
      "La fiche du chat parrainé ne s'est pas ouverte.",
    );
    await clickText(cdp, "Donner des nouvelles", { selector: ".cat-detail-header button" });
    await waitFor(
      cdp,
      `!document.querySelector('.cat-detail-dialog') && document.querySelector('main h1')?.innerText === 'E-mails'`,
      "Le bouton « Donner des nouvelles » n'a pas ouvert l'écran e-mail.",
    );
    const sponsorEmailReady = await evaluate(
      cdp,
      `document.querySelector('select')?.value === 'sponsorNews' && document.querySelectorAll('select')[1]?.selectedOptions[0]?.textContent === 'Amande' && document.querySelector('input[readonly]')?.value.includes('camille.petit@example.test')`,
    );
    if (!sponsorEmailReady) {
      throw new Error("L'écran e-mail n'a pas été préparé avec le chat et son parrain.");
    }

    console.log(`✓ ${pages.length} sections ouvertes`);
    console.log("✓ Création d'un chat de contrôle dans le registre démo");
    console.log("✓ Action « Donner des nouvelles » désactivée sans parrain actif");
    console.log("✓ Ajout puis suppression d'un événement depuis le panneau de droite");
    console.log("✓ « Donner des nouvelles » ferme la fiche et prépare l'e-mail au parrain actif");
  } finally {
    cdp.close();
  }
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

async function findFreePort() {
  const server = createServer();
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  await new Promise((resolveClose, rejectClose) =>
    server.close((error) => (error ? rejectClose(error) : resolveClose())),
  );
  if (!address || typeof address === "string") {
    throw new Error("Impossible de réserver un port DevTools local.");
  }
  return address.port;
}

async function waitFor(cdp, expression, message) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (await evaluate(cdp, expression)) {
      return;
    }
    await delay(100);
  }
  throw new Error(message);
}

async function clickText(cdp, text, { selector = "button", optional = false } = {}) {
  const result = await evaluate(
    cdp,
    `(() => {
    const button = Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(element => element.innerText.trim().includes(${JSON.stringify(text)}));
    if (!button) return false;
    button.click();
    return true;
  })()`,
  );
  if (!result && !optional) {
    throw new Error(`Bouton introuvable : « ${text} ».`);
  }
  await delay(120);
}

async function evaluate(cdp, expression) {
  const response = await cdp.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.text ?? "Erreur JavaScript dans l'application.");
  }
  return response.result?.value;
}

async function connect(url) {
  const socket = new WebSocket(url);
  await new Promise((resolveOpen, rejectOpen) => {
    socket.onopen = resolveOpen;
    socket.onerror = rejectOpen;
  });
  let nextId = 0;
  const pending = new Map();
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  };
  return {
    close: () => socket.close(),
    send: (method, params = {}) =>
      new Promise((resolveMessage) => {
        const id = ++nextId;
        pending.set(id, resolveMessage);
        socket.send(JSON.stringify({ id, method, params }));
      }),
  };
}
