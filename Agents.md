# Min Gym App — AGENTS.md

## 1. Syfte och grundprincip

Detta dokument beskriver produktens mål, arkitektur, viktiga beslut och utvecklingsregler.

AI-agenter ska läsa dokumentet och relevant befintlig kod innan de föreslår eller genomför ändringar.

> Förstå befintlig funktionalitet innan du ändrar den.

Min Gym App används i verklig träning. Stabilitet, korrekt data och enkelhet är viktigare än stora refaktoreringar eller teknisk elegans.

Gör minsta rimliga ändring och bevara fungerande funktionalitet.

---

## 2. Produktöversikt

Min Gym App är en personlig träningsapp för styrketräning.

Appen används som installerbar PWA, främst på iPhone.

Huvudflöde:

1. Logga in.
2. Välj träningsupplägg.
3. Starta pass.
4. Registrera vikt och repetitioner.
5. Markera genomförda övningar.
6. Spara pass.
7. Se historik och personbästa.

Användaren skapar normalt upplägg i förväg. `Pass` är därför normalt startvy efter inloggning.

### Produktprinciper

* Appen ska hjälpa användaren att träna, inte skapa administration.
* Enkelhet prioriteras framför många funktioner.
* Bygg inte funktioner enbart för att de tekniskt går att bygga.
* Undvik funktioner som duplicerar naturliga arbetsflöden.
* Verklig användning ska styra utvecklingen.
* Små, testbara förändringar föredras.
* Befintlig fungerande funktionalitet ska bevaras.
* Refaktorera inte stora delar samtidigt som en funktion eller kritisk bugg ändras.
* Lägg inte till komplexitet utan tydligt användarbehov.
* Mobil användbarhet, läsbarhet och kontrast prioriteras.

---

## 3. Teknik

### Frontend

* HTML
* CSS
* Vanilla JavaScript
* Ingen React/Vue/Svelte eller annat frontend-framework
* PWA
* GitHub Pages

### Backend

* Supabase
* PostgreSQL
* Supabase Authentication
* Magic Link
* PostgreSQL RPC
* Row Level Security (RLS)

### Utveckling

* Git/GitHub
* `main` = publicerad/stabil kod
* Visual Studio Code
* Live Server

### Live Server

Live Server kör lokal frontend men använder samma Supabase-backend som produktionen.

> Lokal frontend, riktig backend.

Databasoperationer från Live Server kan därför påverka riktig data även om koden inte är committad eller pushad.

Var försiktig med destruktiva tester.

---

## 4. Arkitektur

```text
UI
↓
Funktionsmoduler
↓
Storage
↓
Supabase API / RPC
↓
PostgreSQL
```

`src/storage.js` är gränsen mellan frontendlogik och Supabase.

Funktionsmoduler ska normalt använda `Storage` istället för att implementera egen databaslogik.

---

## 5. Aktiv projektstruktur

```text
MIN-GYM-APP/
├── AGENTS.md
├── README.md
├── index.html
├── style.css
├── manifest.json
├── icon-192.png
├── icon-512.png
├── auth.js
├── workspace.js
├── supabase.js
├── database/
│   └── SQL-migrationer och RPC-funktioner
└── src/
    ├── app.js
    ├── exercises.js
    ├── history.js
    ├── plans.js
    ├── sessions.js
    ├── storage.js
    └── utils.js
```

Den aktiva Version 2-koden laddas huvudsakligen från `src/`.

Äldre Version 1-filer kan finnas i projektroten med samma namn som filer under `src/`.

Betrakta dem som potentiellt legacy men radera aldrig filer enbart baserat på filnamn.

Kontrollera först:

* `index.html`
* referenser från andra JavaScript-filer
* Git-historik vid behov

---

## 6. Modulansvar

### `src/app.js`

Övergripande app- och UI-logik:

* initiering
* navigation/flikar
* profil
* appens rubrik
* medlemshantering i UI
* workspace-väljare

Lägg inte detaljerad tränings- eller databaslogik här.

### `src/exercises.js`

Övningsbank och autocomplete:

* ladda aktiva övningar
* autocomplete
* stavningsnära förslag
* bevara `exercise_id`
* bekräfta innan ny övning skapas

### `src/plans.js`

Träningsupplägg:

* visa
* skapa
* redigera
* ta bort
* hantera övningar och set

### `src/sessions.js`

Pågående träningspass:

* starta pass från upplägg
* skapa aktiv session
* ändra vikt/reps
* markera genomförda övningar
* lägga till extra övning
* lägga till set
* spara pass

**Kritisk produktregel:**

Endast övningar markerade som genomförda ska sparas i historiken.

En hoppad övning ska inte registreras som genomförd.

`Lägg till övning i dagens pass` är kritisk funktionalitet och ska fungera även om övningen inte finns i ursprungligt upplägg.

Regressionstesta funktionen efter ändringar i sessionslogiken.

### `src/history.js`

Ansvarar för:

* träningshistorik
* tidigare pass
* PB

> Historiken är sanningen för genomförd träning.

### `src/storage.js`

Kommunikationslager mellan frontend och Supabase.

Ansvarar bland annat för:

* övningar
* upplägg
* sessioner
* medlemmar
* workspaces

Övriga moduler ska normalt använda `Storage`.

### `src/utils.js`

Gemensamma hjälpfunktioner, exempelvis:

* lokala ID:n
* HTML escaping

Lägg inte domänlogik här.

### `supabase.js`

Skapar och konfigurerar Supabase-klienten.

### `auth.js`

Ansvarar för:

* Magic Link
* login/logout
* återställning av session
* start av app efter autentisering

### `workspace.js`

Ansvarar för:

* aktivt workspace
* tillgängliga workspaces
* workspace-byte
* ihågkommet workspace
* personligt workspace
* `display_name`

---

## 7. Databas

PostgreSQL körs via Supabase.

Viktiga tabeller:

```text
workspaces
workspace_members
categories
exercise_library
workout_plans
plan_exercises
plan_sets
workout_sessions
session_exercises
session_sets
```

Verifiera aktuell databasmodell och exakta RPC-signaturer mot SQL-filerna i `database/` innan backendrelaterad kod ändras.

---

## 8. Workspaces och medlemmar

Workspace är den centrala modellen för ägarskap och delning av träningsdata.

Varje vanlig användare har ett personligt workspace.

RPC:

```text
get_or_create_personal_workspace()
```

Ett workspace där användaren endast är medlem får inte räknas som användarens personliga workspace.

En användare kan tillhöra flera workspaces.

Produktbegreppet är **medlem**, inte PT.

En medlem kan exempelvis vara:

* PT
* träningskompis
* partner
* annan person som hjälper till med träningen

Alla medlemmar har för närvarande samma rättigheter.

Inför inte avancerade roller eller behörighetsmodeller utan konkret behov.

### Viktiga RPC-funktioner

```text
invite_workspace_member(...)
list_workspace_members(...)
remove_workspace_member(...)
list_my_workspaces()
```

Verifiera exakta signaturer mot `database/`.

### Inbjudan

Nuvarande modell kräver att personen redan finns i Supabase Authentication.

Användaradministration sker manuellt i Supabase Dashboard.

Bygg inte eget administratörsgränssnitt för att skapa användare utan nytt behov.

---

## 9. Workspace-UI och profil

Workspace-väljaren ska visa workspace-ägarens namn, inte tekniska ID:n.

Om användaren endast har ett workspace behöver väljaren inte visas.

Valt workspace ska kunna kommas ihåg mellan omladdningar.

När workspace byts ska relevant data laddas från det nya workspacet.

### Aktivt workspace

När en användare arbetar i någon annans workspace måste UI tydligt visa vems träningsmiljö som är aktiv.

Princip:

* profilnamn = inloggad användare
* appens huvudrubrik = ägare till aktivt workspace

Verifiera aktuell implementation innan ändring.

### `display_name`

Visningsnamn lagras i:

```text
workspace_members.display_name
```

Inte i `workspaces.name`.

E-post används som fallback där det är lämpligt.

---

## 10. Träningsupplägg och pass

Upplägg är mallar för framtida träningspass.

Ett upplägg innehåller:

* namn
* övningar
* set
* målvikt
* målrepetitioner

Det faktiska träningsresultatet registreras i passet och sparas i historiken.

### Standardupplägg uppdateras inte automatiskt

Ett genomfört pass får inte automatiskt ändra standardupplägget.

Resultatet från passet sparas i historiken.

Vill användaren ändra standardvärden görs det manuellt:

`Upplägg → Redigera`

Återinför inte automatisk uppdatering utan nytt uttryckligt produktbeslut.

---

## 11. Historik och PB

Historiken ska representera vad användaren faktiskt genomförde.

* Endast genomförda övningar sparas.
* Extra övningar ska kunna sparas.
* Vikt/reps ska motsvara det genomförda passet.
* Historiska pass får inte förändras när upplägg senare redigeras.
* Sessionsdata använder snapshots där historisk information måste bevaras.

PB beräknas från historiken.

Det finns ingen separat PB-tabell som källa till sanningen.

> Historiken är sanningen.

Skapa inte duplicerad PB-data som kan hamna ur synk.

---

## 12. Övningsbank

`exercise_library` används för konsekventa övningsidentiteter och datakvalitet.

Fritext kan skapa flera namn för samma övning och därmed felaktiga PB-resultat.

Implementerad modell:

* autocomplete
* befintliga övningar kan väljas
* stavningsnära namn visas som förslag men slås inte automatiskt ihop
* nya övningar kräver bekräftelse
* övningar identifieras via `exercise_id`
* historiska namn bevaras i `exercise_name_snapshot`
* PB grupperas via `exercise_id`
* normaliserat namn används som legacy-fallback

Undvik att återgå till ren namnmatchning som primär övningsidentitet.

Konsekvent övningsdata är grund för framtida statistik.

---

## 13. Beslut som ska bevaras

### Offline

Offline-stöd är medvetet nedprioriterat.

Skäl:

* WiFi/mobildata finns normalt
* små datamängder
* offline-synk ökar komplexiteten

Bygg inte offline-synk och lova inte offline-stöd i UI utan nytt produktbeslut.

### Import

Excel/CSV-import ska inte byggas som appfunktion.

Eventuell historisk import görs administrativt via Supabase/SQL.

Visa inte framtida importfunktion i UI.

### Backup

Separat backupfunktion i UI är borttagen.

Data lagras i Supabase.

Återinför inte backupsektion utan konkret behov.

### Arkivering

Arkivering av gamla upplägg är en möjlig framtida funktion men inte prioriterad.

Problemet är listans längd över tid, inte vem som skapade upplägget.

Föredragen framtida modell:

```text
Aktiva upplägg
Arkiverade upplägg
```

Skapa inte särskilda PT-mappar utan nytt behov.

---

## 14. Magic Link och iPhone/PWA

Autentisering använder Supabase Magic Link.

På iPhone finns ett känt UX-problem där Magic Link kan öppnas i Safari medan den installerade PWA:n har ett annat sessionsläge.

Beslut:

* behåll Magic Link
* inför inte egen SMTP/OTP-lösning nu
* framtida förbättring får fokusera på bättre samspel mellan Magic Link och installerad PWA

Detta har tidigare kallats **Alternativ B**.

---

## 15. Supabase Auth och användare

Nya användare administreras för närvarande manuellt via Supabase.

Vid Auth-ändringar har tillfälliga fördröjningar observerats.

Vid problem:

* kontrollera Console/loggar
* verifiera verkliga fel innan större ändringar görs
* undvik aggressiv felsökning om problemet rimligen kan vara tillfälligt

---

## 16. RLS och säkerhet

Row Level Security används.

Säkerhetslogik får inte kringgås från frontend.

RPC-funktioner som använder `security definer` ska:

* kontrollera `auth.uid()`
* verifiera workspace-access
* begränsa execute-rättigheter
* använda tydliga parametrar
* exponera minsta nödvändiga data

Ändra inte RLS-policyer eller `security definer`-funktioner utan att förstå säkerhetskonsekvenserna.

---

## 17. Databasmigrationer

SQL-filer sparas i:

```text
database/
```

De fungerar som dokumentation och versionshistorik.

Den faktiska databasen ändras först när SQL körs i Supabase.

Att endast skapa SQL-filen lokalt ändrar inte databasen.

Vid databasändring:

1. Skapa ny numrerad SQL-fil.
2. Kör motsvarande SQL i Supabase.
3. Testa.
4. Commit.

---

## 18. Git och deployment

GitHub används för versionshantering.

GitHub Pages används för produktion.

Normalt flöde:

```text
Ändra lokalt
↓
Testa med Live Server
↓
Commit
↓
Push till main
↓
GitHub Pages
```

Git-commit påverkar endast kodhistoriken.

Databasoperationer via appen skickas direkt till Supabase och är oberoende av Git.

---

## 19. Produktstatus och roadmap

Version 2.1 innehåller bland annat:

* delade workspaces
* medlemmar
* medlemsinbjudan
* borttagning av medlem
* workspace-listning
* workspace-väljare
* `display_name`/e-post-fallback

Nuvarande fokus:

> Stabilisering och verklig användning av Version 2.1.

Undvik större nyutveckling tills versionen testats i verklig användning och med flera användare.

Övningsbank/autocomplete är ett viktigt område för:

* konsekventa övningsnamn
* återanvändning av `exercise_library`
* bättre PB-datakvalitet
* grund för framtida statistik

Möjliga senare områden:

* arkivering av upplägg
* statistik
* träningsanalys
* förbättrad Magic Link/PWA-upplevelse

Bygg inte funktioner enbart för att de finns på roadmapen.

---

## 20. UI-principer

Appen används huvudsakligen på mobil i gymmiljö.

Prioritera:

* stora klickytor
* tydliga knappar
* hög kontrast
* få steg
* tydlig feedback
* minimal administration

Undvik:

* små kontroller
* lågkontrasttext
* onödiga informationsblock
* tekniska termer användaren inte behöver förstå

`workspace` är ett tekniskt begrepp och bör inte dominera användarupplevelsen.

### Dialoger

Medlemsinbjudan använder egen HTML-dialog.

Återgå inte till `window.prompt()` för medlemsinbjudan.

Äldre `alert()` och `confirm()` behöver inte refaktoreras enbart av estetiska skäl.

---

## 21. Regressionstest

Testa relevanta delar efter varje ändring.

### Upplägg

* skapa
* redigera
* ta bort
* starta pass

### Pass

* starta pass
* ändra vikt/reps
* markera övning genomförd
* lämna övning omarkerad
* lägga till extra övning
* lägga till set på extra övning
* spara pass

### Historik/PB

* endast genomförda övningar sparas
* extra övning sparas
* vikt/reps är korrekta
* PB uppdateras från historiken
* inga uppenbara dubbletter introduceras

### Medlemmar

* lista medlemmar
* bjuda in medlem
* hantera okänd e-post
* ta bort medlem
* ägaren kan inte tas bort

### Delade workspaces

* eget workspace visas
* delat workspace visas
* workspace-byte fungerar
* rätt upplägg visas
* rätt historik visas
* rätt medlemmar visas
* aktivt workspace är tydligt

---

## 22. Arbetsregler för AI-agent

### Innan kod ändras

1. Läs denna fil.
2. Läs relevant befintlig kod.
3. Identifiera vilka filer som faktiskt används.
4. Förstå dataflödet.
5. Kontrollera påverkan på databas, RPC och RLS.
6. Gör minsta rimliga ändring.

Gissa inte hur befintlig kod fungerar när detta kan verifieras.

### Efter kodändring

Redovisa:

1. vad som ändrades
2. vilka filer som ändrades
3. hur ändringen ska testas
4. eventuella migrationssteg
5. relevanta kontroller som körts

---

## 23. Gör inte detta utan uttryckligt beslut

AI-agenten ska inte utan konkret behov eller uttryckligt beslut:

* byta frontend-framework
* införa React/Vue/Svelte
* införa TypeScript
* byta backend från Supabase
* göra stora refaktoreringar
* flytta hela kodstrukturen
* ändra databasmodell av kosmetiska skäl
* införa avancerad rollmodell
* bygga offline-synk
* bygga importfunktion
* skapa separat PB-tabell
* automatiskt uppdatera upplägg från genomförda pass
* ta bort fungerande funktioner för arkitektonisk elegans

---

## 24. Prioriteringsordning

När flera förbättringar är möjliga:

1. Kritiska buggar i träningsflödet.
2. Risk för felaktig eller förlorad träningsdata.
3. Oklarhet kring aktivt workspace.
4. Mobil användbarhet.
5. Små UX-förbättringar.
6. Nya funktioner.
7. Refaktorering.

---

## 25. Produktens kärna

> Min Gym App ska göra det snabbt och enkelt att planera, genomföra och följa upp styrketräning — själv eller tillsammans med någon man delar sin träning med.

När teknisk elegans står mot enkelhet, stabilitet och fungerande träningsflöden: välj enkelhet och stabilitet.
