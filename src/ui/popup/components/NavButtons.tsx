function openOptions() {
  chrome.runtime.openOptionsPage();
}

export function NavButtons() {
  return (
    <div className="popup-nav">
      <button className="btn-secondary popup-nav-btn" onClick={openOptions}>
        Dashboard
      </button>
      <button className="btn-secondary popup-nav-btn" onClick={openOptions}>
        Settings
      </button>
    </div>
  );
}
