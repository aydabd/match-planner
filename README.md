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

Pipeline (`.github/workflows/release.yml`, körs vid varje push till `main`):

1. **build** - `check`, `typecheck`, tester och `build` körs en enda gång.
2. **release** - först när build är grön skapas tagg och GitHub Release
   (`matchplanner-vX.Y.Z`) på exakt den testade committen.
3. **deploy** - det redan byggda artefaktet publiceras till GitHub Pages.
   Inget byggs eller testas om.

Misslyckas build/test skapas varken tagg, release eller deploy. Versionen visas
i appens sidfot (kommer från `package.json`). Pull requests kontrolleras av `ci.yml`.

Node-versionen styrs av `mise.toml` (används både lokalt och i CI). Renovate
öppnar en PR när en ny stabil Node släpps; att uppgradera är att slå ihop den.

Setup: Repo Settings → Pages → Source: **GitHub Actions**. Appen är helt
statisk - ingen backend, inga hemligheter, ingen databas.

## Dela trupper mellan tränare

Export-knappen i appen skapar en `.json`-fil (schemaversionerad, se
`src/core/storage.ts`). Vem som helst kan importera den filen i sin egen
instans av appen - ingen inloggning, inget konto, ingen delad databas. All
data lagras lokalt i webbläsarens `localStorage` hos varje tränare.

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
