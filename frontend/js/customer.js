window.addEventListener("load", async () => {
  const diagPopup = document.getElementById("diagPopup");
  const diagResults = document.getElementById("diagResults");

  async function runDiagnostics() {
    diagResults.innerHTML = "Checking system status...<br>";
    try {
      const res = await fetch("/api/db-status");
      const data = await res.json();
      diagResults.innerHTML += `Database: ${data.connected ? "✅ Connected" : "❌ Not Connected"}<br>`;
    } catch {
      diagResults.innerHTML += "❌ Database check failed<br>";
    }
    diagPopup.classList.add("hidden");
  }

  runDiagnostics();
});