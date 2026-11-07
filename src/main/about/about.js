const version = new URLSearchParams(window.location.search).get('v');
if (version && /^[0-9A-Za-z.+-]{1,40}$/.test(version)) {
  document.getElementById('version').textContent = `Version ${version}`;
}
