// Chmurowe zapisy galaxy.click (slot 0). Działa tylko, gdy gra jest otwarta w iframe na
// galaxy.click – API to postMessage do window.top. Limit slotu to 256 000 bajtów, a save
// Celestial ma ~280 kB, więc zapisujemy go skompresowanego (deflate + base64, prefiks "ctb1:").
// Wczytanie rozpoznaje też zwykły, nieskompresowany string z eksportu gry.

const ORIGIN = "https://galaxy.click";
const SLOT = 0;
const PREFIX = "ctb1:";
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

async function pack(saveString) {
  const z = await pipe(new TextEncoder().encode(saveString), new CompressionStream("deflate-raw"));
  return PREFIX + toB64(z);
}
async function unpack(content) {
  if (!content.startsWith(PREFIX)) return content.trim();
  const raw = await pipe(fromB64(content.slice(PREFIX.length)), new DecompressionStream("deflate-raw"));
  return new TextDecoder().decode(raw);
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

/** Zapisuje bieżący stan gry do slotu 0. Zwraca rozmiar w bajtach. */
export async function cloudSave() {
  if (!inGalaxyFrame()) throw new Error("otwórz grę przez galaxy.click/play/470");
  window.save?.(true);
  const plain = btoa(unescape(encodeURIComponent(JSON.stringify(window.player))));
  const data = await pack(plain);
  if (data.length > LIMIT) throw new Error(`save za duży (${Math.round(data.length / 1000)} kB po kompresji)`);
  const r = await request({ action: "save", slot: SLOT, label: label(), data }, "saved");
  if (r.error) throw new Error(why(r.message));
  return data.length;
}

/** Pobiera slot 0. Zwraca { label, save } – save to string gotowy dla importSave. */
export async function cloudFetch() {
  if (!inGalaxyFrame()) throw new Error("otwórz grę przez galaxy.click/play/470");
  const r = await request({ action: "load", slot: SLOT }, "save_content");
  if (r.error) throw new Error(why(r.message));
  return { label: r.label, save: await unpack(r.content) };
}
