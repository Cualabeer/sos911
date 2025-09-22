window.addEventListener("load", async () => {
  const diagPopup = document.getElementById("diagPopup");
  const diagResults = document.getElementById("diagResults");

  async function runDiagnostics() {
    diagResults.innerHTML = "Checking admin system...<br>";
    try {
      const res = await fetch("/api/services");
      const data = await res.json();
      diagResults.innerHTML += `Services: ✅ ${data.length} loaded<br>`;
    } catch {
      diagResults.innerHTML += "❌ Failed to load services<br>";
    }
    diagPopup.classList.add("hidden");
  }

  runDiagnostics();
});