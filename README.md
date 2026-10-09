# ⚽ MatchPlanner

En rättvis byteshanterare för ungdomsfotboll. Statisk PWA, inga runtime-beroenden,
hostas gratis på GitHub Pages.

**Live-status:** v1 stödjer 7v7. 5v5/9v9/11v11 är förberedda i arkitekturen men
väntar på riktiga zon-konfigurationer (se `src/core/formations.ts`).

## Varför den här stacken

| Alternativ | Varför inte |
|---|---|
| Go + WASM | Löser ett prestandaproblem vi inte har. Tyngre toolchain för ingen vinst. |
| Flutter / native app | Kräver App Store eller Apple Developer-konto (99 USD/år) för iPhone. |
| React/Vue-ramverk | Onödigt för en app av den här storleken. Fler beroenden = större attackyta. |
| **Vanilla TypeScript + PWA** | **Noll runtime-beroenden, installeras utan publicering (Lägg till på hemskärmen), funkar identiskt på Android och iPhone.** |

## Arkitektur

```
src/
  core/            <- Ren logik. Ingen DOM. 100 % testbar.
    types.ts         Domänmodeller (Player, FormatConfig, RotationAssignment, ...)
    formations.ts    Zon-konfiguration per format (7v7 klar, fler kan läggas till)
    scheduler.ts      Den generella rättvise-algoritmen (se nedan)
    storage.ts        JSON-schema + validering för trupp-export/import
  ui/              <- DOM-rendering och eventhantering, importerar bara från core/
    match.ts, roster.ts, sessionStorage.ts, style.css
  main.ts          <- Startpunkt
tests/             <- Vitest, testar bara core/ (behöver ingen webbläsare)
public/            <- Statiska filer som kopieras rakt av (manifest, service worker, ikoner)
```

**Regeln:** `core/` vet ingenting om DOM eller `ui/`. Det gör kärnlogiken
testbar i vanlig Node, och gör det möjligt att byta ut hela UI-lagret (eller
lägga till en CLI, eller en annan frontend) utan att röra reglerna för
rättvis rotation.

### Schemaläggnings-algoritmen

Istället för handräknade tabeller (vilket inte skalar till spelare som blir
sjuka i sista sekunden) genererar `generateRotation()` nästa byte live, varje
gång, utifrån **hur mycket speltid varje spelare faktiskt har hittills**:

1. För varje zon (minst antal platser först) väljs de spelare som får stå
   där utan att bryta regeln "aldrig icke-angränsande zoner" (`canAssignZone`),
   och bland dem väljs de som spelat minst i just den zonen, sedan minst
   totalt.
2. Den som blir kvar sitter på bänken den perioden.

Det här är en enda girig algoritm - ingen separat "vem vilar"-logik behövs,
för den uppstår automatiskt ur samma urval. Testad i `tests/scheduler.test.ts`
med property-tester som kör hela matcher för 8-11 spelare och bevisar att
ingen någonsin ackumulerar två icke-angränsande zoner, och att spridningen i
speltid håller sig inom en rimlig gräns.

**Ärlig brasklapp:** perfekt matematisk jämnhet är inte alltid möjligt (t.ex.
om ni är en spelare kort mitt i matchen) - då prioriterar algoritmen att
aldrig bryta zon-regeln, och kastar ett tydligt fel istället för att tyst
bryta den. Se `SchedulingError`.

## Kom igång lokalt

```bash
npm install
npm run dev        # lokal dev-server med hot reload
npm test           # kör alla enhetstester
npm run typecheck  # strikt TypeScript, inga implicita any
npm run build      # produktionsbygge till dist/
npm run preview    # förhandsgranska produktionsbygget lokalt
```

## Release och deploy

Vi använder [release-please](https://github.com/googleapis/release-please):
skriv commits enligt [Conventional Commits](https://www.conventionalcommits.org/)
(`feat: ...`, `fix: ...`, `chore: ...`) så håller release-please en PR med
uppdaterad `CHANGELOG.md` och version öppen. Vi kör inte commitlint/husky för att
hålla `devDependencies` minimala - skriv commits enligt konventionen manuellt.

Var testerna körs:

- **Pull requests** (`.github/workflows/ci.yml`): `check`, `typecheck`,
  enhetstester med täckningskrav, `build` och e2e-tester (Playwright, byggt med
  GitHub Pages sökväg). Här testas koden innan den når `main`. Release-PR:er
  (bara version och changelog) hoppar över dem.
- **Merge till `main`**: inga tester körs igen. Regeluppsättningen för `main`
  kräver att grenen är uppdaterad mot `main` innan merge, så `main` får exakt
  den kod som testades. `release.yml` uppdaterar bara release-PR:en.
- **Release** (när release-PR:en slås ihop, `.github/workflows/release.yml`):
  1. **build** - `check`, `typecheck`, enhetstester och `build` en enda gång.
     Inga e2e-tester, koden är redan testad.
  2. **release** - först när build är grön skapas tagg och GitHub Release
     (`matchplanner-vX.Y.Z`) på exakt den committen.
  3. **deploy** - det redan byggda artefaktet publiceras till GitHub Pages.

Misslyckas build skapas varken tagg, release eller deploy. Versionen visas
i appens sidfot (kommer från `package.json`).

Node-versionen styrs av `mise.toml` (används både lokalt och i CI). Renovate
öppnar en PR när en ny stabil Node släpps; att uppgradera är att slå ihop den.

Setup: Repo Settings → Pages → Source: **GitHub Actions**. Appen är helt
statisk - ingen backend, inga hemligheter, ingen databas.

## Dela trupper mellan tränare

**Spara trupp** på startsidan skapar en `.json`-fil (schemaversionerad, se
`src/core/storage.ts`). Vem som helst kan hämta den i sin egen instans av
appen med **Hämta trupp** - ingen inloggning, inget konto, ingen delad
databas. All data lagras lokalt i webbläsarens `localStorage` hos varje
tränare.

Sidan **Data** (`/data/`) samlar allt som flyttar data: den läser in filer
eller en hel mapp och ser på innehållet, inte namnet, vad varje fil är
(matchfil, truppfil, anteckningar, krypterad export eller Drive-fil), skickar
ut allt i en krypterad fil och säkerhetskopierar till Google Drive. Inläsning
tar bara till: den tar aldrig bort data, och samma filer två gånger ändrar
ingenting.

## Säkerhet

- **Noll runtime-npm-beroenden.** Allt i `dependencies` är tomt; bara
  `devDependencies` (TypeScript, Vite, Vitest) används, och de skeppas
  aldrig till webbläsaren.
- Alla spelarnamn renderas med `textContent`, aldrig `innerHTML` - en
  importerad JSON-fil med skadlig kod i ett namn kan aldrig köras.
- All importerad JSON valideras strikt (`parseRosterFile`) innan den rör
  vid resten av appen - se testerna i `tests/storage.test.ts` för vad som
  avvisas.
- Ingen backend = ingen server-attackyta. GitHub Pages serverar över HTTPS.

## Vad som **inte** är med i v1 (medvetna avgränsningar)

- Endast 7v7. Andra format kräver en ny `FormatConfig` i `formations.ts`
  plus motsvarande tester - ingen ändring av `scheduler.ts` behövs.
- Ingen målvakts-hantering (målvakten antas vara fast och rör sig inte,
  så den behöver ingen schemaläggning).
- Ingen delad/synkad data mellan tränare i realtid - bara export/import av
  fil. Skulle det behövas krävs en backend, vilket är ett medvetet v2-beslut.

## Varför fungerar det så här? Källor för reglerna

Reglerna för vem som spelar, vilar och var de står finns på ett ställe, `src/core/policy.ts`. Varje
regel är antingen hämtad ur ett dokument (med citat, datum och länk) eller markerad som
MatchPlanners eget val. Appen förklarar dem på sidan **Varför fungerar det så här?**, som nås från
startsidan och matchmenyn. Dokumenten:

**Riksidrottsförbundet (RF)**
- [Riktlinjer för barn- och ungdomsidrott](https://www.rf.se/rf-arbetar-med/barn--och-ungdomsidrott/riktlinjer-for-barn--och-ungdomsidrott)
- [Riktlinjerna i sin helhet (PDF)](https://www.rf.se/download/18.407871d3183abb2a6133d5/1665042792026/Riktlinjer%20barn-%20och%20ungdomsidrott.pdf)
- [Riktlinjerna, kortversion (PDF)](https://www.rf.se/download/18.bb2bb9e1900fe9007258a4/1718272991496/Riktlinjer_barn_ung_utskrift.pdf)
- [Selektering och nivåindelning](https://www.rf.se/rf-arbetar-med/barn--och-ungdomsidrott/selektering-och-nivaindelning)

**Svenska Fotbollförbundet (SvFF)**
- [Barn- och ungdomsfotboll](https://aktiva.svenskfotboll.se/spelare/spela/barn-och-ungdom/)
- [Spelformer: speltid och byten](https://aktiva.svenskfotboll.se/tranare/spelformer/)
- [Tävlingsbestämmelser för barn- och ungdomsfotboll (PDF)](https://www.svenskfotboll.se/4aefde/globalassets/svff/dokumentdokumentblock/tavling/tavlingsforeskrifter/tb-barn--och-ungdomsfotboll.pdf)
- [Tävlingsbestämmelser 2026 (PDF)](https://www.svenskfotboll.se/49e87f/globalassets/svff/dokumentdokumentblock/tavling/tavlingsforeskrifter/2026/tb-2026-v2-202603242.pdf)
- [Svensk fotbolls spelarutbildningsplan](https://aktiva.svenskfotboll.se/tranare/spelarutbildning/spelarutbildningsplan/)
- [Riktlinjer och utbildningsmaterial](https://aktiva.svenskfotboll.se/spelare/utbildningsmaterial/utbildningsmaterial/)

**Skånes Fotbollförbund (Skånebollen)**
- [Uppdaterade spelregler barn- och ungdomsfotboll 2025](https://www.skaneboll.se/nyheter/2025/april/uppdaterade-spelregler-barn--unga/)
- [Information kring spelregler 2025–2026 (PDF)](https://www.skaneboll.se/49666a/globalassets/distrikt/skane/dokument/tavling/tavlingsbestammelser/info-kring-spelregler-for-barn--och-ungdomsfotboll-2025-2026.pdf)
- [Bestämmelser och föreskrifter](https://www.skaneboll.se/tavling/bestammelser/)

Kontrollerat mot dokumenten 2026-09-28. Matchtiderna i seriespel kommer från SvFF:s sida om
spelformer (5 mot 5: 3 x 15, 7 mot 7: 3 x 20, 9 mot 9: 3 x 25, 11 mot 11: 2 x 40 för 15-åringar). Cuper
har egna regler, till exempel 2 x 12 minuter: tränaren ändrar då perioder och minuter i appen.

Bytena skiljer sig mellan serier (kontrollerat 2026-10-09). I barn- och ungdomsfotboll är bytena fria
och en utbytt spelare får komma in igen (Tävlingsbestämmelser för barn- och ungdomsfotboll, 5 §). I
förbundsserierna får högst fem spelare bytas in, vid högst tre tillfällen under pågående spel, och en
utbytt spelare får inte komma in igen. I distriktsserier som använder ersättare får högst fem bytas in
och en utbytt spelare får inte komma in igen; där anges inget antal tillfällen (Tävlingsbestämmelser
2026, 4 kap. 5 §). Varje regel i appen anger vilken sorts byten den gäller.

Kontrollera att citaten fortfarande står på sidorna och i PDF:erna (kräver nät):

```sh
npm run check:policy
```

Ändras en policy: uppdatera `src/core/policy.ts` (länkarna här kontrolleras av ett test).
