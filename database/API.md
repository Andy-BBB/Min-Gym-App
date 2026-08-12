# Min Gym App – Modul-API

Detta dokument beskriver vilka funktioner varje modul erbjuder.
Moduler får endast kommunicera genom dessa publika funktioner.

---

# app.js

Ansvar

- Startar appen
- Initierar moduler
- Startar rendering

Publika funktioner

init()

---

# plans.js

Plans

Ansvar

- Hantera träningsupplägg

Publika funktioner

init()

load()

create()

edit()

update()

delete()

render()

cancelEdit()

---

# exercises.js

Ansvar

- Ladda och söka i aktivt workspaces övningsbank
- Koppla visningsnamn till stabilt `exercise_id`
- Visa autocomplete och stavningsnära förslag
- Kräva bekräftelse innan en ny övning skapas

Publika funktioner

init()

reload()

getById()

findMatches()

resolveForSave()

attachAutocomplete()

---

# sessions.js

Ansvar

- Hantera aktiva träningspass

Publika funktioner

start()
save()
cancel()
render()

---

# history.js

Ansvar

- Historik
- Personbästa

Publika funktioner

load()
render()
calculatePB()

---

# storage.js

Ansvar

- Kommunikation med databasen

Publika funktioner

loadExercises()

loadPlans()

savePlan()

deletePlan()

loadSessions()

saveSession()

---

# workspace.js

Ansvar

- Aktivt workspace

Publika funktioner

load()
clear()

---

# auth.js

Ansvar

- Inloggning
- Session

Publika funktioner

login()
logout()
currentUser()

---

# utils.js

Ansvar

- Hjälpfunktioner

Publika funktioner

id()
clone()
unique()
esc()
