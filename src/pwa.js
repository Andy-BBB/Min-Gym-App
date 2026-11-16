if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register(
        "./service-worker.js",
        { updateViaCache: "none" }
      );

      const showUpdateNotice = () => {
        if (document.getElementById("app-update-notice")) return;
        const notice = document.createElement("aside");
        notice.id = "app-update-notice";
        notice.setAttribute("role", "status");
        notice.style.cssText = "position:fixed;left:1rem;right:1rem;bottom:1rem;z-index:1000;padding:1rem;border:1px solid #666;border-radius:12px;background:#111;color:#fff;max-width:36rem;margin:auto";
        const message = document.createElement("p");
        message.textContent = "En uppdatering finns. Avsluta och spara ditt pass. Stäng sedan alla appfönster och öppna appen igen.";
        const dismiss = document.createElement("button");
        dismiss.type = "button";
        dismiss.textContent = "Stäng meddelandet";
        dismiss.addEventListener("click", () => { notice.hidden = true; });
        notice.append(message, dismiss);
        document.body.append(notice);
      };

      const observeInstallingWorker = () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            showUpdateNotice();
          }
        });
      };

      registration.addEventListener("updatefound", observeInstallingWorker);
      observeInstallingWorker();
      if (registration.waiting && navigator.serviceWorker.controller) {
        showUpdateNotice();
      }

      const checkForUpdate = () => {
        registration.update().catch(error => {
          console.warn("Kunde inte kontrollera appuppdatering:", error);
        });
      };
      checkForUpdate();
      window.addEventListener("online", checkForUpdate);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") checkForUpdate();
      });
      // No controllerchange reload, skipWaiting message, or session mutation.
    } catch (error) {
      console.error("Service worker kunde inte registreras:", error);
    }
  });
}
