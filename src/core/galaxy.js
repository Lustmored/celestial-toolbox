// Chmurowe zapisy galaxy.click (slot 0). Działa tylko, gdy gra jest otwarta w iframe na
// galaxy.click – API to postMessage do window.top. Limit slotu to 256 000 bajtów, a save
// Celestial ma ~280 kB, więc zapisujemy go skompresowanego (deflate + base64).
// Format "ctb3:" = skompresowane „ustawienia toolboxa \0 surowy JSON gracza”. Surowy JSON kompresuje się
// o ~1/3 lepiej niż base64 eksportu (stary "ctb2:" = JSON { save, toolbox } z save'em w base64).
// Wczytanie rozpoznaje też "ctb2:", "ctb1:" (sam save) i zwykły string z eksportu gry.

const ORIGIN = "https://galaxy.click";
const SLOT = 0;
const PREFIX1 = "ctb1:";
const PREFIX2 = "ctb2:";
const PREFIX3 = "ctb3:";
const LIMIT = 256000;

export const inGalaxyFrame = () => window.top !== window.self;

function request(msg, type, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      window.removeEventListener("message", onMsg);
      reject(new Error("brak odpowiedzi z galaxy.click"));
    }, timeoutMs);
    function onMsg(e) {
      if (e.origin !== ORIGIN || e.data?.type !== type || e.data.slot !== SLOT) return;
      clearTimeout(timer);
      window.removeEventListener("message", onMsg);
      resolve(e.data);
    }
    window.addEventListener("message", onMsg);
    window.top.postMessage(msg, ORIGIN);
  });
}

async function pipe(bytes, stream) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}
function toB64(u8) {
  let s = "";
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}
const fromB64 = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

async function deflate(text) {
  return toB64(await pipe(new TextEncoder().encode(text), new CompressionStream("deflate-raw")));
}
async function inflate(b64) {
  return new TextDecoder().decode(await pipe(fromB64(b64), new DecompressionStream("deflate-raw")));
}
const toSaveString = json => btoa(unescape(encodeURIComponent(json)));
async function pack(playerJson, toolbox) {
  return PREFIX3 + await deflate((toolbox ?? "") + "\0" + playerJson);
}
/** Zwraca { save, toolbox } – toolbox to JSON ustawień albo null (starsze formaty). */
async function unpack(content) {
  if (content.startsWith(PREFIX3)) {
    const text = await inflate(content.slice(PREFIX3.length));
    const i = text.indexOf("\0");
    return { save: toSaveString(text.slice(i + 1)), toolbox: i > 0 ? text.slice(0, i) : null };
  }
  if (content.startsWith(PREFIX2)) {
    const obj = JSON.parse(await inflate(content.slice(PREFIX2.length)));
    return { save: obj.save, toolbox: obj.toolbox ?? null };
  }
  if (content.startsWith(PREFIX1)) return { save: await inflate(content.slice(PREFIX1.length)), toolbox: null };
  return { save: content.trim(), toolbox: null };
}

const ERRORS = {
  no_account: "nie jesteś zalogowany na galaxy.click",
  too_big: "save za duży nawet po kompresji",
  invalid_slot: "zły slot",
  empty_slot: "slot 0 jest pusty",
  server_error: "błąd serwera galaxy.click",
};
const why = m => ERRORS[m] ?? m ?? "nieznany błąd";

function label() {
  const p = window.player;
  let pts = "";
  try { pts = window.format(p.points) + " pkt · "; } catch {}
  return `Celestial Toolbox · ${pts}${new Date().toLocaleString("pl-PL")}`;
}

/** Zapisuje bieżący stan gry (i ustawienia toolboxa) do slotu 0. Zwraca rozmiar w bajtach. */
export const _test = { pack, unpack };

export async function cloudSave(toolboxSettings) {
  if (!inGalaxyFrame()) throw new Error("otwórz grę przez galaxy.click/play/470");
  window.save?.(true);
  const data = await pack(JSON.stringify(window.player), toolboxSettings);
  if (data.length > LIMIT) {
    const kb = n => Math.round(n / 1000);
    throw new Error(`save za duży: ${kb(data.length)} kB po kompresji, limit ${kb(LIMIT)} kB ` +
      `(gra ${kb(JSON.stringify(window.player).length)} kB, ustawienia toolboxa ${kb((toolboxSettings ?? "").length)} kB przed kompresją)`);
  }
  const r = await request({ action: "save", slot: SLOT, label: label(), data }, "saved");
  if (r.error) throw new Error(why(r.message));
  return data.length;
}

/** Pobiera slot 0. Zwraca { label, save, toolbox } – save to string gotowy dla importSave. */
export async function cloudFetch() {
  if (!inGalaxyFrame()) throw new Error("otwórz grę przez galaxy.click/play/470");
  const r = await request({ action: "load", slot: SLOT }, "save_content");
  if (r.error) throw new Error(why(r.message));
  return { label: r.label, ...(await unpack(r.content)) };
}
