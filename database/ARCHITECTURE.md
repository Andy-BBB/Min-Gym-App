# Min Gym App – Arkitektur

## Syfte

Min Gym App är en personlig träningsapp med fokus på styrketräning.

Appen ska vara enkel att använda och hjälpa användaren att planera, genomföra och följa upp sin träning utan onödig komplexitet.

Målet är att användaren ska fokusera på träningen – inte på appen.

---

# Arkitektur

Frontend

- HTML
- CSS
- JavaScript
- GitHub Pages

Backend

- Supabase
- PostgreSQL
- Row Level Security (RLS)
- PostgreSQL Functions (RPC)

Autentisering

- Supabase Auth
- Magic Link
- Invite Only

---

# Projektstruktur

```
/
│
├── index.html
├── style.css
│
├── auth.js
├── workspace.js
├── supabase.js
│
├── src/
│   ├── app.js
│   ├── utils.js
│   ├── storage.js
│   ├── plans.js
│   ├── sessions.js
│   └── history.js
│
├── database/
│
└── README.md
```

---

# Ansvarsområden

## auth.js

Ansvarar för:

- Inloggning
- Magic Link
- Session
- Start av appen

Har ingen träningslogik.

---

## workspace.js

Ansvarar för:

- Aktivt workspace
- Skapa personligt workspace
- Ladda workspace
- Byta workspace (framtid)

---

## supabase.js

Ansvarar för:

- Anslutning mot Supabase

Innehåller ingen affärslogik.

---

## src/app.js

Ansvarar för:

- Initiering
- Gemensamma variabler
- Start av rendering

Har ingen lagringslogik.

---

## src/utils.js

Generella hjälpfunktioner.

Exempel:

- id()
- clone()
- esc()
- unique()

---

## src/storage.js

Ansvarar för all lagring.

Exempel:

- loadPlans()
- savePlan()
- deletePlan()

Senare:

- Offline-cache
- Synkning

Ingen UI-logik.

---

## src/exercises.js

Ansvarar för övningsbanken och kopplingen mellan övningsnamn och
`exercise_library.id`.

Exempel:

- Ladda aktiva övningar för valt workspace
- Prefixsökning och stavningsnära förslag
- Autocomplete i upplägg och pågående pass
- Bekräftelse innan en ny övning skapas

Modulen visar namn i UI men bevarar `exercise_id` som stabil identitet.

---

## src/plans.js

Ansvarar för fliken:

Upplägg

Exempel:

- Skapa upplägg
- Redigera upplägg
- Ta bort upplägg
- Rendera upplägg

---

## src/sessions.js

Ansvarar för:

Pass

Exempel:

- Starta pass
- Spara pass
- Lägga till extra övning under ett pågående pass

---

## src/history.js

Ansvarar för:

- Historik
- Personbästa

---

# Grundprinciper

En fil har ett ansvar.

All affärslogik ligger i JavaScript eller PostgreSQL.

Ingen SQL skrivs direkt i UI-koden.

Ingen HTML innehåller JavaScript-logik.

Historiken är alltid sanningen.

Personbästa grupperas efter `exercise_id`. Historiska namn bevaras som
snapshots och används som fallback för äldre data.

Standardupplägg är mallar.

Workspace är grunden för all data.

---

# Dataflöde

```
Användare

↓

auth.js

↓

workspace.js

↓

storage.js

↓

Supabase

↓

PostgreSQL
```

---

# Versionsplan

## Version 1

- Magic Link
- Workspace
- Träningsupplägg
- Pass
- Historik
- Personbästa

## Framtida utveckling

- Offline-stöd
- Synkning
- Excel-import
- PT-inbjudningar
- Flera workspaces
- Pushnotiser vid ett verifierat behov

---

# Designprincip

Min Gym App ska vara enkel.

Varje ny funktion ska motiveras av ett verkligt behov.

Komplexitet ska alltid döljas bakom en enkel användarupplevelse.

Teknisk arkitektur får aldrig styra användarupplevelsen.

# Arkitekturprinciper

- Varje fil ska ha ett tydligt ansvarsområde.
- Frontend, lagring, autentisering och databaslogik ska hållas separerade.
- All träningsdata ska tillhöra ett workspace.
- Historiken är sanningen. Träningsupplägg är mallar.
- Appen ska fungera bra för en ensam användare men kunna delas med en PT.
- Nya funktioner ska införas först när de fyller ett konkret behov.
- Teknisk komplexitet ska inte införas i förväg.
- Webbappen och GitHub Pages behålls så länge de uppfyller appens behov.

## Kodprinciper

- Koden ska optimeras för läsbarhet, inte för få rader.
- Funktioner och variabler ska ha beskrivande namn.
- Varje modul har ett tydligt ansvar.
- Ingen modul känner till hur en annan modul är implementerad.

Sprint 1

Status: Klar ✅

Version 2 kan nu hantera träningsupplägg helt mot Supabase.
Ingen LocalStorage används för träningsupplägg.
