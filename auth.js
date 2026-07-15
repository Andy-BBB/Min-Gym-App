const loginOverlay = document.getElementById("loginOverlay");
const loginEmail = document.getElementById("loginEmail");
const loginBtn = document.getElementById("loginBtn");
const loginMessage = document.getElementById("loginMessage");
const logoutBtn = document.getElementById("logoutBtn");
const logoutMessage = document.getElementById("logoutMessage");

function showLogin() {
  loginOverlay.style.display = "flex";
}

function hideLogin() {
  loginOverlay.style.display = "none";
}

async function startAppForSession(session) {
  if (!session) {
    workspace.clear();
    showLogin();
    return;
  }

  showLogin();
  loginMessage.textContent = "Förbereder din app...";

  try {
    await workspace.load();
    await app.init();

    loginMessage.textContent = "";
    hideLogin();

    console.log("Inloggad som:", session.user.email);
    console.log("Workspace klart:", workspace.id);
  } catch (error) {
    console.error("Kunde inte starta appen:", error);

    workspace.clear();
    showLogin();

    loginMessage.textContent =
      "Kunde inte starta appen. Ladda om sidan och försök igen.";
  }
}

async function updateLoginState() {
  const {
    data: { session },
    error
  } = await supabaseClient.auth.getSession();

  if (error) {
    console.error("Kunde inte läsa inloggningsstatus:", error);
    showLogin();
    return;
  }

  await startAppForSession(session);
}

loginBtn.addEventListener("click", async () => {
  const email = loginEmail.value.trim();

  if (!email) {
    loginMessage.textContent = "Ange din e-postadress.";
    return;
  }

  loginBtn.disabled = true;
  loginBtn.textContent = "Skickar...";
  loginMessage.textContent = "";

  const redirectUrl =
    `${window.location.origin}${window.location.pathname}`;

  const { error } = await supabaseClient.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectUrl,
      shouldCreateUser: false
    }
  });

  if (error) {
    console.error("Fel vid inloggning:", error);

    loginMessage.textContent =
      "Inloggningen kunde inte genomföras. Kontrollera e-postadressen.";

    loginBtn.disabled = false;
    loginBtn.textContent = "Skicka inloggningslänk";
    return;
  }

  loginMessage.textContent =
    "Klart! Kontrollera din e-post och klicka på inloggningslänken.";

  loginBtn.textContent = "Länk skickad";
});

if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    logoutBtn.disabled = true;
    logoutBtn.textContent = "Loggar ut...";

    if (logoutMessage) {
      logoutMessage.textContent = "";
    }

    const { error } = await supabaseClient.auth.signOut({
      scope: "local"
    });

    if (error) {
      console.error("Utloggningen misslyckades:", error);

      if (logoutMessage) {
        logoutMessage.textContent =
          "Kunde inte logga ut. Försök igen.";
      }

      logoutBtn.disabled = false;
      logoutBtn.textContent = "Logga ut";
      return;
    }

    workspace.clear();

    if (window.app?.state) {
      app.state.plans = [];
      app.state.sessions = [];
      app.state.exerciseBank = [];
      app.isInitialized = false;
    }

    logoutBtn.disabled = false;
    logoutBtn.textContent = "Logga ut";
  });
}

supabaseClient.auth.onAuthStateChange((event, session) => {
  console.log("Auth-händelse:", event);

  /*
   * Körs efter att Supabase har avslutat sin interna
   * hantering av autentiseringshändelsen.
   */
  window.setTimeout(() => {
    startAppForSession(session);
  }, 0);
});

updateLoginState();