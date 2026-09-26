const host = new URLSearchParams(location.search).get("host");
if (host && /^[a-z0-9.-]+$/i.test(host)) {
  void chrome.runtime.sendMessage({
    type: "CHECK_URL", hostname: host,
    context: window.top === window ? "navigation" : "iframe",
  }).catch(() => {});
}
