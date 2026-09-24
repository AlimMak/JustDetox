document.getElementById("go-back")?.addEventListener("click", () => history.back());
document.getElementById("open-rules")?.addEventListener("click", () => {
  void chrome.tabs.create({ url: chrome.runtime.getURL("src/ui/options/options.html#preview") });
});

const host = new URLSearchParams(location.search).get("host");
if (host && /^[a-z0-9.-]+$/i.test(host)) {
  const message = document.getElementById("msg");
  if (message) message.textContent = `${host} was stopped before it loaded.`;
  void chrome.runtime.sendMessage({
    type: "CHECK_URL", hostname: host,
    context: window.top === window ? "navigation" : "iframe",
  }).then((response) => {
    if (response?.blocked === false) {
      if (message) message.textContent = "This rule has changed. Go back and try the page again.";
      return;
    }
    if (response?.source) {
      const reason = document.getElementById("reason");
      if (reason) reason.textContent = `Why: ${response.source}`;
    }
    if (response?.nextCheckTs) {
      const until = document.getElementById("until");
      if (until) until.textContent = `${response.nextChangeLabel ?? "Check again"}: ${new Date(response.nextCheckTs).toLocaleString()}`;
    }
  }).catch(() => {});
}
