/**
 * Open the options page at a specific section via location.hash.
 *
 * chrome.runtime.openOptionsPage() focuses an existing options tab but can't
 * control the hash. We use chrome.tabs.create for precision — the popup closes
 * immediately anyway so a new tab is the expected UX.
 */
function openAt(hash: string) {
  void chrome.tabs.create({
    url: chrome.runtime.getURL("src/ui/options/options.html") + hash,
  });
}

export function NavButtons() {
  return (
    <div className="popup-nav">
      <button
        className="btn-secondary popup-nav-btn"
        onClick={() => openAt("#dashboard")}
      >
        Dashboard
      </button>
      <button
        className="btn-secondary popup-nav-btn"
        onClick={() => openAt("#settings")}
      >
        Settings
      </button>
    </div>
  );
}
