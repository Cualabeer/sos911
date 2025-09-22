window.addEventListener("load", async () => {
  const diagPopup = document.getElementById("diagPopup");
  const diagResults = document.getElementById("diagResults");

  async function runDiagnostics() {
    diagResults.innerHTML = "Checking mechanic system...<br>";
    try {
      const res = await fetch("/api/bookings");
      const data = await res.json();
      diagResults.innerHTML += `Bookings: ✅ ${data.length} loaded<br>`;
    } catch {
      diagResults.innerHTML += "❌ Failed to load bookings<br>";
    }
    diagPopup.classList.add("hidden");
  }

  runDiagnostics();
});