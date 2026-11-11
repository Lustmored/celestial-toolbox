# Celestial Toolbox

Prywatny zestaw makr QoL do [Celestial Incremental](https://icecreamdudes.github.io/celestial_incremental/).
Panel po prawej stronie okna. Każde makro można włączyć, wyłączyć i skonfigurować bez otwierania konsoli.

## Instalacja

1. Zainstaluj Violentmonkey (albo Tampermonkey).
2. Otwórz `https://<user>.github.io/<repo>/` i kliknij link do `celestial-toolbox.user.js`.
3. Userscript to mały loader: przy każdym wejściu do gry pobiera aktualny toolbox z Pages, więc po pushu na `main` wystarczy odświeżyć stronę (Pages mogą mieć do kilku minut opóźnienia po deployu).

Bez wtyczki: na tej samej stronie jest bookmarklet.

## Obsługa

- `Alt+M`: zwija/rozwija panel.
- `Alt+P`: pauzuje wszystkie makra.
- Kropka statusu: zielona — działa, żółta — czeka (warstwa niedostępna), niebieska — pauza, czerwona — makro wyłączyło się po 3 błędach z rzędu.
- `⋯` przy makrze: opis, parametry, „Uruchom raz”, ostatni status.
- Ustawienia są w `localStorage` (osobno od sejwa gry). Eksport/Import w stopce.
- Konsola: `CelestialToolbox.list()`, `.enable(id)`, `.disable(id)`, `.runOnce(id)`.

## Jak to działa

- Toolbox opakowuje `gameLoop` gry (The Modding Tree). Makra działają po każdym ticku gry (~50 ms), każde według własnego interwału. Nie używają osobnych `setInterval`.
- Makra wywołują funkcje gry (`clickClickable`, `buyBuyable`, `buyUpgrade`, `onHover` siatek), a nie klikają w DOM.
- Błąd w makrze nie psuje pętli gry. Po 3 błędach z rzędu makro samo się wyłącza.

## Makra

CB Claim All, Dot Knight, Fragmentation, Singularity Pets, Pet Points, Fragment Shop, Rocket Passengers, Moonstone Killer, Repli-Grass, Hex of Vexes, Dream Realm, Casino Killer, SMA Auto-enter, Dark Grass, Normality: reset + rebuy, Farma core fragmentów (preset haltera + Auto Singularity pod wybrany typ CF), Space Dust, Fuel & Parts, Walka statkami: bot (polowanie + uniki, tylko wirtualne WASD), BH skill buttons.
Singularity Pets i Space Dust używają wspólnej reguły „zapełniło się → wydaj” (`src/macros/lib/spendWhenFull.js`).

## Dodanie makra

Nowy plik w `src/macros/` (albo dopisanie do istniejącego) i wpis w `src/macros/index.js`:

```js
export const mojeMakro = {
  id: "moje-makro",            // unikalne, klucz ustawień
  name: "Moje makro",
  group: "Check Back",         // sekcja w panelu
  every: 1,                    // domyślny interwał w sekundach
  description: "Co robi.",
  params: [{ key: "limit", label: "Limit", type: "number", default: 10 }], // number | text | bool
  available: g => g.layerActive("cb"),   // false = makro czeka
  onEnable(ctx) {},            // opcjonalne
  run(ctx) {
    if (ctx.click("cb", 99)) ctx.did();  // ctx.p.limit, ctx.status("..."), ctx.log(...)
  },
};
```

Przełącznik bez pętli (np. zmiana wyglądu): zamiast `every` i `run` daj `toggle: true` oraz `onEnable`/`onDisable`.

Helpery w `ctx`: `click(layer, id, {refresh})`, `canClick`, `buyOne`, `layerActive`, `D()`, `parseIds("13 22 11")`.
`refresh: true` przelicza `tmp` przed kliknięciem. Jest potrzebne, gdy makro zmieniło stan, od którego zależy `canClick` (np. `bannerIndex`).

## Build

```
npm ci
npm run build      # dist/celestial-toolbox.user.js, dist/celestial-toolbox.js, dist/index.html
```

GitHub Actions (`.github/workflows/pages.yml`) buduje projekt i publikuje `dist/` na GitHub Pages.
Wymaga włączenia Pages w ustawieniach repo (Source: GitHub Actions).

## Chmura galaxy.click

Przyciski „☁ Zapisz” / „☁ Wczytaj” w stopce panelu zapisują i wczytują grę ze slotu 0 galaxy.click.
Działają tylko, gdy gra jest otwarta przez https://galaxy.click/play/470 (API galaxy to postMessage do okna nadrzędnego).
Zapis zawiera save gry i ustawienia toolboxa (skompresowane, prefiks `ctb2:`), bo surowy save przekracza limit 256 kB slotu – taki zapis wczytasz tylko przez toolbox. Wczytanie rozpoznaje też starszy `ctb1:` i zwykły eksport gry.
