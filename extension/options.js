const form = document.querySelector("form");
const input = document.getElementById("backend-url");
const status = document.getElementById("status");

chrome.storage.sync.get("backendUrl").then(({ backendUrl }) => {
  input.value = backendUrl || "";
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  status.textContent = "";
  status.className = "";

  try {
    const url = new URL(input.value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Use an HTTP or HTTPS URL.");
    }
    await chrome.storage.sync.set({ backendUrl: url.toString() });
    status.textContent = "Settings saved.";
  } catch (error) {
    status.className = "error";
    status.textContent = error instanceof Error ? error.message : "Could not save settings.";
  }
});
