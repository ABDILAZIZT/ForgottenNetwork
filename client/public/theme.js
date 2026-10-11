// Run before styles paint; only a local visual preference is read.
try {
  document.documentElement.dataset.theme =
    localStorage.getItem('fn_studio_theme') === 'light' ? 'light' : 'dark';
} catch {
  document.documentElement.dataset.theme = 'dark';
}
