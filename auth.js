const loginOverlay = document.getElementById("loginOverlay");
const loginEmail = document.getElementById("loginEmail");
const loginBtn = document.getElementById("loginBtn");
const loginMessage = document.getElementById("loginMessage");

function resetLoginForm() {
  loginEmail.value = "";
  loginBtn.disabled = false;
  loginBtn.textContent = "Skicka inloggningslänk";
  loginMessage.textContent = "";
}

async function startAppForSession(context) {
  if (!app.isCurrent(context) || context.started) return;
  context.started = true;
  loginMessage.textContent = "Förbereder din app...";
  try {
    await workspace.load(context);
    app.assertCurrent(context);
    await app.init(context);
    app.assertCurrent(context);
    loginMessage.textContent = "";
    app.reveal(context);
  } catch (error) {
    if (app.isStale(error, context)) return;
    // Fail closed, including partial initialization. Do not reveal cached data.
    app.resetSession();
    resetLoginForm();
    loginMessage.textContent = "Kunde inte starta appen. Ladda om sidan och försök igen.";
    console.error("Kunde inte starta appen:", error);
  }
}

loginBtn.addEventListener("click", async () => {
  const email = loginEmail.value.trim();
  if (!email) {
    loginMessage.textContent = "Ange din e-postadress.";
    return;
  }
  const generation = app.generation;
  loginBtn.disabled = true;
  loginBtn.textContent = "Skickar...";
  loginMessage.textContent = "";
  const { error } = await supabaseClient.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${window.location.origin}${window.location.pathname}`,
      shouldCreateUser: false
    }
  });
  if (generation !== app.generation) return;
  if (error) {
    loginMessage.textContent = `Inloggningen misslyckades: ${error.message}`;
    loginBtn.disabled = false;
    loginBtn.textContent = "Skicka inloggningslänk";
    return;
  }
  loginMessage.textContent = "Klart! Kontrollera din e-post och klicka på inloggningslänken.";
  // Permit another login attempt without requiring a reload after sign-out.
  loginBtn.disabled = false;
  loginBtn.textContent = "Skicka inloggningslänk";
});

// Delegation survives replacement of authenticated markup during a reset.
document.addEventListener("click", async event => {
  if (!event.target.closest("#logoutBtn")) return;
  if (!app.isInitialized) return;
  app.resetSession();
  resetLoginForm();
  loginBtn.disabled = true;
  loginMessage.textContent = "Loggar ut...";
  const generation = app.generation;
  const { error } = await supabaseClient.auth.signOut({ scope: "local" });
  if (generation !== app.generation) return;
  resetLoginForm();
  if (error) {
    loginBtn.disabled = true;
    loginMessage.textContent = "Kunde inte logga ut. Ladda om sidan och försök igen.";
  }
});

// INITIAL_SESSION is the single startup source. Do not race it with getSession().
app.resetSession();
resetLoginForm();
supabaseClient.auth.onAuthStateChange((event, session) => {
  const userId = session?.user?.id || null;
  const context = app.context;
  if (context?.userId === userId) {
    // Same-user reauthentication/token refresh must preserve an active workout.
    context.accessToken = session.access_token;
    return;
  }
  if (!context && !session) return;
  const next = app.resetSession(session);
  resetLoginForm();
  if (next) {
    loginMessage.textContent = "Förbereder din app...";
    // Only synchronous invalidation runs in the SDK's callback/lock.
    window.setTimeout(() => { startAppForSession(next); }, 0);
  }
});
