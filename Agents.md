# Min Gym App — AGENTS.md

## 1. Syfte med dokumentet

Detta dokument beskriver produktens mål, arkitektur, viktiga designbeslut, kodstruktur och utvecklingsprinciper.

AI-agenter som arbetar med repositoryt ska läsa detta dokument innan de föreslår eller genomför kodändringar.

Grundprincip:

> Förstå befintlig funktionalitet innan du ändrar den.

Min Gym App används i verklig träning. Stabilitet och enkelhet är viktigare än stora refaktoreringar eller teknisk elegans.


## 2. Produktöversikt

Min Gym App är en personlig träningsapp för seriös styrketräning.

Appen används som installerbar webbapp/PWA, framför allt på iPhone.

Huvudflödet är:

1. Logga in.
2. Välj träningsupplägg.
3. Starta pass.
4. Registrera vikt och repetitioner.
5. Markera genomförda övningar.
6. Spara pass.
7. Se historik och personbästa.

Användaren skapar normalt sina träningsupplägg i förväg och går därför vanligen direkt från inloggning till **Pass**.


## 3. Produktprinciper

Följ dessa principer vid vidare utveckling:

- Appen ska hjälpa användaren att träna, inte skapa administration.
- Enkelhet prioriteras framför många funktioner.
- Bygg inte funktioner bara för att de tekniskt går att bygga.
- Undvik funktioner som duplicerar ett redan naturligt arbetsflöde.
- Verklig användning ska styra vidare utveckling.
- Små, testbara förändringar föredras framför stora omskrivningar.
- Befintlig fungerande funktionalitet ska bevaras.
- Refaktorera inte stora delar av projektet samtidigt som en funktion byggs eller en kritisk bugg rättas.
- Lägg inte till ny komplexitet utan ett tydligt användarbehov.
- UI ska vara enkelt att använda på mobil i gymmiljö.
- Läsbarhet och tydlig kontrast prioriteras framför subtil design.


## 4. Teknik

### Frontend

- HTML
- CSS
- Vanilla JavaScript
- Ingen React eller annat frontend-framework
- PWA
- GitHub Pages

### Backend

- Supabase
- PostgreSQL
- Supabase Authentication
- Magic Link
- PostgreSQL RPC-funktioner
- Row Level Security (RLS)

### Versionshantering

- Git
- GitHub
- `main` används för publicerad/stabil kod.

### Lokal utveckling

- Visual Studio Code
- Live Server

### Viktigt om Live Server

Live Server kör frontend lokalt men använder samma Supabase-backend som produktionsappen.

Det innebär att databasoperationer som görs från Live Server kan påverka riktig data även om koden inte har committats eller pushats.

Tänk:

> Lokal frontend, riktig backend.


## 5. Övergripande arkitektur

Applikationen följer ungefär detta flöde:

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

Funktionsmoduler ska i möjligaste mån inte känna till detaljer om SQL eller databasimplementation.

`storage.js` fungerar som gränsen mellan frontendlogik och Supabase.


## 6. Aktiv projektstruktur

Den aktiva Version 2-koden är huvudsakligen:

```text
MIN-GYM-APP/
│
├── AGENTS.md
├── README.md
├── index.html
├── style.css
├── manifest.json
├── icon-192.png
├── icon-512.png
│
├── auth.js
├── workspace.js
├── supabase.js
│
├── database/
│   └── SQL-migrationer och RPC-funktioner
│
└── src/
    ├── app.js
    ├── history.js
    ├── plans.js
    ├── sessions.js
    ├── storage.js
    └── utils.js
```

Det finns eller har funnits äldre Version 1-filer med samma namn i projektroten, exempelvis:

- `app.js`
- `history.js`
- `plans.js`
- `sessions.js`
- `utils.js`

Dessa ska betraktas som potentiellt legacy.

Radera dock aldrig filer enbart baserat på filnamn.

Kontrollera först:

- referenser i `index.html`
- referenser från andra JavaScript-filer
- Git-historik vid behov

Den aktiva Version 2-koden laddas från `src/`.


## 7. JavaScript-moduler

### `src/app.js`

Övergripande applikations- och UI-logik.

Ansvarar bland annat för:

- initiering av Version 2
- huvudnavigation/flikar
- profilgränssnitt
- appens rubrik
- medlemshantering i UI
- workspace-väljare

`app.js` ska inte innehålla detaljerad tränings- eller databaslogik.


### `src/plans.js`

Ansvarar för träningsupplägg.

Exempel:

- visa upplägg
- skapa upplägg
- redigera upplägg
- ta bort upplägg
- hantera övningar och set i upplägg


### `src/sessions.js`

Ansvarar för pågående träningspass.

Exempel:

- starta pass från ett upplägg
- skapa aktiv session
- ändra vikt och repetitioner
- markera övningar som genomförda
- lägga till extra övning under ett pågående pass
- lägga till set på extra övning
- spara träningspass

#### Viktig produktregel

Endast övningar markerade som genomförda ska sparas i historiken.

Om en användare hoppar över en övning, exempelvis på grund av trasig eller upptagen maskin, ska den inte registreras som genomförd.

Funktionen **Lägg till övning i dagens pass** är viktig och ska fungera även om övningen inte finns i det ursprungliga upplägget.


### `src/history.js`

Ansvarar för:

- träningshistorik
- visning av tidigare pass
- personbästa (PB)

Historiken är källan till sanningen för genomförd träning.


### `src/storage.js`

Kommunikationslager mellan frontend och Supabase.

Exempel på ansvar:

- `loadPlans()`
- `savePlan()`
- `deletePlan()`
- `loadSessions()`
- `saveSession()`
- `inviteMember()`
- `listMembers()`
- `removeMember()`
- `listMyWorkspaces()`

Övriga moduler ska i möjligaste mån använda `Storage` istället för att själva implementera databaslogik.


### `src/utils.js`

Gemensamma hjälpfunktioner.

Exempel:

- generering av lokala ID:n
- HTML escaping

Undvik att lägga domänlogik här.


## 8. Infrastruktur utanför `src`

### `supabase.js`

Skapar och konfigurerar Supabase-klienten.

Används av övriga moduler för kommunikation med Supabase.


### `auth.js`

Ansvarar för autentisering.

Nuvarande modell:

- Supabase Authentication
- Magic Link
- login
- logout
- återställning av befintlig session
- start av appen efter autentisering


### `workspace.js`

Ansvarar för workspace-kontext.

Workspace-modellen används för att separera träningsdata mellan användare och möjliggöra delning.

Workspace-logiken omfattar bland annat:

- aktivt workspace
- användarens `display_name`
- tillgängliga workspaces
- byte av workspace
- ihågkommet aktivt workspace
- personligt workspace


## 9. Databasmodell

PostgreSQL körs via Supabase.

Viktiga tabeller:

```text
workspaces
workspace_members

exercise_library

workout_plans
plan_exercises
plan_sets

workout_sessions
session_exercises
session_sets
```

Det finns även kategorirelaterad data, exempelvis `categories`, i databasen.


## 10. Workspaces

Workspace är den centrala modellen för ägarskap och delning av träningsdata.

Varje vanlig användare får ett eget personligt workspace.

RPC:

```text
get_or_create_personal_workspace()
```

säkerställer att användaren har ett personligt workspace.

Ett workspace där användaren endast är medlem ska inte räknas som användarens personliga workspace.


## 11. Delade workspaces och medlemmar

Version 2.1 introducerade delade workspaces.

Begreppet i produkten är:

> Medlem

inte:

> PT

En personlig tränare är bara ett av flera möjliga användningsfall.

En medlem kan exempelvis vara:

- PT
- träningskompis
- sambo
- annan person som hjälper till med träningen

Alla medlemmar har i nuläget samma rättigheter.

Undvik att införa avancerade roller eller behörighetsmodeller utan ett konkret behov.


### Viktiga RPC-funktioner

Följande backendfunktioner har byggts:

```text
invite_workspace_member(...)
list_workspace_members(...)
remove_workspace_member(...)
list_my_workspaces()
```

Exakta signaturer ska verifieras mot SQL-filerna i `database/` innan kod ändras.


### Inbjudan

Nuvarande modell kräver att personen redan finns som användare i Supabase Authentication.

Användaradministration sker manuellt i Supabase Dashboard.

Appen behöver inte bygga ett eget administratörsgränssnitt för att skapa nya appanvändare i nuläget.


## 12. Workspace-väljare

En användare kan vara medlem i flera workspaces.

Exempel:

```text
Karin
Andreas Rydén
```

UI:t ska visa workspace-ägarens namn snarare än tekniska workspace-ID:n.

Om användaren bara har ett workspace behöver workspace-väljaren inte visas.

Valt workspace ska kunna kommas ihåg mellan omladdningar.

När workspace byts ska appens data laddas från det valda workspacet.


## 13. Viktig öppen UI-fråga: appens rubrik

Historiskt har appens rubrik visat den inloggade användarens `display_name`.

När delade workspaces infördes upptäcktes att detta kan bli missvisande.

Exempel:

Karin är inloggad men arbetar i Andreas workspace.

Rubriken bör då tydligt visa att det aktiva workspacet tillhör Andreas.

Planerad/rimlig lösning:

- profilnamn = den inloggade användarens namn
- appens huvudrubrik = ägaren till aktivt workspace

Detta ska verifieras mot aktuell kod innan ändring görs.


## 14. Profil och `display_name`

Användarens visningsnamn lagras i:

```text
workspace_members.display_name
```

Inte i `workspaces.name`.

Profilen kan redigeras under Inställningar.

Användarens namn används bland annat för:

- visning i appen
- medlemslistor
- workspace-väljare

Om `display_name` saknas används e-postadress som fallback där det är lämpligt.


## 15. Träningsupplägg

Upplägg är mallar för framtida träningspass.

Ett upplägg innehåller:

- namn
- övningar
- set
- målvikt
- målrepetitioner

Vanligt användningsmönster:

1. Användaren skapar 2–4 upplägg för en träningsperiod.
2. På gymmet väljs ett befintligt upplägg.
3. Passet startas.
4. Faktiskt genomförd träning registreras.


## 16. Standardupplägg uppdateras inte från pass

Tidigare fanns en idé/funktion:

> Uppdatera standardupplägg

Den har medvetet tagits bort.

Exempel:

Upplägget säger:

```text
80 kg × 8
```

En dålig dag klarar användaren:

```text
75 kg × 6
```

Det genomförda resultatet ska sparas i historiken, men upplägget ska fortfarande visa `80 × 8` nästa gång.

Vill användaren ändra standarden görs detta manuellt under:

```text
Upplägg → Redigera
```

Återinför inte automatisk uppdatering av upplägg från träningspass utan ett nytt uttryckligt produktbeslut.


## 17. Historik

När ett pass sparas ska historiken representera vad användaren faktiskt genomförde.

Endast övningar markerade som genomförda sparas.

Historiska pass ska inte förändras när ett träningsupplägg senare redigeras.

Därför används snapshots för bland annat namn i sessionsdata.


## 18. Personbästa (PB)

PB beräknas från historiken.

Det finns ingen separat PB-tabell som är källa till sanningen.

Princip:

> Historiken är sanningen.

Undvik att skapa duplicerad PB-data som kan hamna ur synk med historiken.


## 19. Övningsbank

Databasen innehåller:

```text
exercise_library
```

Övningsbanken är viktig för framtida datakvalitet.

Nuvarande problem:

Fritext kan skapa variationer som:

```text
Bänkpress
bänkpress
Bänk Press
```

För en människa är detta samma övning, men det kan ge separata PB-resultat om övningen identifieras via namn.

Planerad förbättring:

- autocomplete när användaren skriver övningsnamn
- exempel: `Bänk...` föreslår `Bänkpress`
- användaren kan välja befintlig övning
- om övningen inte finns ska ny övning kunna skapas
- övningar bör i framtiden identifieras via `exercise_id`, inte endast namn

Övningsbanken är en viktig kommande förbättring eftersom konsekvent grunddata behövs innan mer avancerad statistik byggs.


## 20. Arkivering av upplägg

Det finns en framtida idé om att kunna arkivera gamla upplägg.

Problemet som ska lösas är inte vem som skapade upplägget utan att listan kan bli lång över tid.

Föredragen modell:

```text
Aktiva upplägg
Arkiverade upplägg
```

Undvik att skapa en särskild PT-mapp för upplägg utan nytt behov.

PT eller andra medlemmar kan vid behov använda fri namngivning, exempelvis:

```text
PT - Gym 1
PT - Ben
```

Arkivering är inte en prioriterad funktion just nu.


## 21. Offline

Offline-stöd har diskuterats och medvetet nedprioriterats/tagits bort från roadmapen.

Motivering:

- gymmet har normalt WiFi
- mobil data fungerar
- datamängderna är mycket små
- offline-synk skulle öka komplexiteten

UI ska inte lova framtida offline-stöd.


## 22. Import

Import av gammal träningshistorik via Excel/CSV har diskuterats men ska inte byggas som appfunktion.

Om historisk data någon gång behöver importeras kan detta göras administrativt via Supabase/SQL.

UI ska inte visa en framtida importfunktion.


## 23. Backup

Separat backupfunktion i användargränssnittet har tagits bort.

Data lagras i Supabase.

Undvik att återinföra en backupsektion utan konkret användarbehov.


## 24. Magic Link och iPhone/PWA

Nuvarande autentisering använder Magic Link.

På iPhone finns ett känt UX-problem:

1. Användaren öppnar installerad PWA.
2. Anger e-post.
3. Magic Link skickas.
4. Länken öppnas i Safari.
5. Om användaren senare trycker på hemskärmsikonen kan PWA:n fortfarande visa sidan som säger att Magic Link skickats, medan den autentiserade sessionen finns i Safari.

### Beslut

Behåll Magic Link.

Inför inte egen SMTP/OTP-lösning i nuläget.

Framtida spår är att undersöka hur Magic Link bättre kan återöppna eller samspela med installerad PWA.

Detta har tidigare kallats **Alternativ B**.


## 25. Supabase Auth och nya användare

Nya användare administreras för närvarande manuellt via Supabase.

Vid nya användare eller Auth-ändringar har tillfälliga fördröjningar observerats.

Undvik aggressiv felsökning direkt efter Auth-förändringar om problemet kan vara tillfälligt.

Verifiera dock alltid verkliga fel via Console/loggar innan slutsats dras.


## 26. RLS och säkerhet

Row Level Security används.

Säkerhetslogik ska inte kringgås från frontend.

RPC-funktioner som behöver läsa exempelvis `auth.users` kan använda `security definer`, men ska:

- kontrollera `auth.uid()`
- verifiera workspace-access
- begränsa execute-rättigheter
- använda tydliga parametrar
- undvika att exponera mer data än nödvändigt

Ändra inte RLS-policyer eller `security definer`-funktioner lättvindigt.


## 27. Databasmigrationer

SQL-filer sparas under:

```text
database/
```

De fungerar både som:

- dokumentation
- versionshistorik över databasändringar

Den faktiska databasen ändras först när SQL körs i Supabase.

Att endast lägga SQL i VS Code ändrar inte Supabase-databasen.

Vid nya databasändringar:

1. Skapa ny numrerad SQL-fil.
2. Kör motsvarande SQL i Supabase.
3. Testa.
4. Commit.


## 28. Git och deployment

GitHub används som versionshantering.

GitHub Pages används för produktion.

Normalt flöde:

```text
Ändra lokalt
↓
Testa med Live Server
↓
Commit
↓
Sync / Push
↓
main
↓
GitHub Pages
```

### Viktigt

Git-commit påverkar endast kodhistoriken.

Databasdata som sparas via appen skickas till Supabase omedelbart och är inte kopplad till Git-commit.


## 29. Live Server

Live Server:

- laddar HTML/CSS/JS från den lokala projektmappen
- kör den senaste lokala koden
- behöver ingen commit
- kommunicerar fortfarande med Supabase över internet

Tänk därför:

> Lokal frontend, riktig backend.

Var försiktig med destruktiva tester.


## 30. Versioner och produktstatus

### Version 2.0

- Supabase-baserad MVP
- upplägg
- pass
- historik
- PB
- authentication
- workspace

### Version 2.0.1

- profil/display name
- förbättrad läsbarhet
- städad Inställningar
- borttagen importinformation
- borttagen offlineinformation
- borttagen backupinformation
- borttagen funktion/text för uppdatering av standardupplägg

### Version 2.1

- delade workspaces
- medlemmar
- bjud in medlem via e-post
- ta bort medlem
- visa e-post om `display_name` saknas
- egen inbjudningsdialog
- lista användarens workspaces
- workspace-väljare

Version 2.1 är nyligen utvecklad och ska testas i verklig användning innan större ny funktionalitet byggs.


## 31. Kända eller nyligen upptäckta problem

### Rubrik vid delat workspace

När en användare arbetar i någon annans workspace måste rubriken tydligt visa vilket workspace/personens träningsmiljö som är aktiv.

Kontrollera aktuell implementation.


### Lägg till övning under pågående pass

En bugg upptäcktes där knappen:

```text
+ Lägg till övning i dagens pass
```

inte gjorde något.

Orsaken var att HTML-formuläret fanns men event handlers/logik saknades i Version 2 `src/sessions.js`.

Funktionen har återställts och ska betraktas som kritisk funktionalitet.

Regressionstesta alltid denna funktion efter ändringar i sessionslogiken.


## 32. Testning efter ändringar

Vid ändringar i träningsflödet bör minst följande testas.

### Upplägg

- skapa upplägg
- redigera upplägg
- ta bort upplägg
- starta pass från upplägg

### Pass

- starta pass
- ändra vikt
- ändra reps
- markera övning genomförd
- lämna övning omarkerad
- lägga till extra övning
- lägga till set på extra övning
- spara pass

### Historik

- endast genomförda övningar sparas
- extra övning sparas
- vikt/reps är korrekta

### PB

- PB uppdateras från historiken
- inga uppenbara dubbletter introduceras

### Medlemmar

- lista medlemmar
- bjuda in medlem
- okänd e-post hanteras
- ta bort medlem
- ägaren kan inte tas bort

### Delade workspaces

- användare ser sitt eget workspace
- användare ser delat workspace
- användare kan byta workspace
- rätt upplägg visas
- rätt historik visas
- rätt medlemmar visas
- aktivt workspace är tydligt i UI


## 33. UI-principer

Appen används huvudsakligen på mobil.

Prioritera:

- stora klickytor
- tydliga knappar
- hög kontrast
- få steg
- tydlig feedback
- minimal administration

Undvik:

- små kontroller
- lågkontrasttext
- onödiga informationsblock
- tekniska termer som användaren inte behöver förstå

Ordet `workspace` används tekniskt men ska helst inte dominera användarupplevelsen.


## 34. Dialoger

Medlemsinbjudan använder en egen HTML-dialog istället för `window.prompt()`.

Undvik att återgå till `window.prompt()` för medlemsinbjudan.

Det finns fortfarande äldre användning av `alert()` och `confirm()` i projektet.

Dessa behöver inte refaktoreras enbart av estetiska skäl.

Gör en sådan refaktorering först när den ger konkret värde.


## 35. Kodändringsprinciper för AI-agenter

Innan kod ändras:

1. Läs denna fil.
2. Läs relevant befintlig kod.
3. Identifiera vilka filer som faktiskt används.
4. Förstå dataflödet.
5. Kontrollera om ändringen påverkar RLS/RPC/databasen.
6. Gör minsta rimliga ändring.

Efter kodändring:

1. Beskriv vad som ändrades.
2. Beskriv vilka filer som ändrades.
3. Beskriv hur ändringen ska testas.
4. Påpeka eventuella migrationssteg.
5. Kör relevanta kontroller om miljön tillåter det.


## 36. Undvik detta

AI-agenter ska inte utan uttrycklig anledning:

- byta frontend-framework
- införa React/Vue/Svelte
- införa TypeScript
- byta backend från Supabase
- göra stora refaktoreringar
- flytta alla filer
- ändra databasmodell för kosmetiska problem
- införa avancerad rollmodell
- bygga offline-synk
- bygga importfunktion
- bygga separat PB-tabell
- automatiskt uppdatera träningsupplägg från genomförda pass
- ta bort fungerande funktioner för att förenkla arkitekturen


## 37. Prioriteringsordning

När flera möjliga förbättringar finns:

1. Kritiska buggar i träningsflödet.
2. Risk för felaktig eller förlorad träningsdata.
3. Oklarhet kring aktivt workspace.
4. Mobil användbarhet.
5. Små UX-förbättringar.
6. Nya funktioner.
7. Refaktorering.


## 38. Roadmap

Närmaste fas:

> Stabilisering och verklig användning av Version 2.1.

Undvik större nyutveckling tills nuvarande version har testats i gymmet och med flera användare.


### Nästa större planerade område

**Övningsbank / autocomplete**

Mål:

- konsekventa övningsnamn
- återanvändning av `exercise_library`
- bättre PB-datakvalitet
- grund för framtida statistik


### Senare

Möjliga områden:

- arkivering av gamla upplägg
- statistik
- träningsanalys
- förbättrad Magic Link/PWA-upplevelse

Dessa ska inte byggas enbart för att de står här.

Verkligt användarbehov ska styra prioriteringen.


## 39. Produktens kärna

Om en ändring riskerar att göra projektet onödigt komplext, återgå till produktens kärna:

> Min Gym App ska göra det snabbt och enkelt att planera, genomföra och följa upp styrketräning — själv eller tillsammans med någon man delar sin träning med.