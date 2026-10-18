// Áp dụng theme trước lần vẽ đầu tiên để tránh nháy màu (docs/adr/0015-theme-bootstrap.md).
// File tĩnh, chạy đồng bộ trong <head>; không inline để tuân thủ CSP `script-src 'self'`.
// Logic phải khớp với src/app/theme.ts.
(function () {
  var preference = 'system';
  try {
    var stored = window.localStorage.getItem('paint-online:theme');
    if (stored === 'light' || stored === 'dark') preference = stored;
  } catch (_) {
    // localStorage bị chặn: theo hệ thống.
  }
  var dark =
    preference === 'dark' ||
    (preference === 'system' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);
  var root = document.documentElement;
  root.classList.toggle('dark', dark);
  root.style.colorScheme = dark ? 'dark' : 'light';
  root.dataset.theme = dark ? 'dark' : 'light';
  // Favicon theo theme (mục 7.9); <link rel="icon"> phải đứng trước script này.
  var icon = document.querySelector('link[rel="icon"]');
  var href = icon && icon.getAttribute('href');
  if (href) {
    icon.setAttribute(
      'href',
      href.replace(/favicon-(light|dark)\.svg$/, dark ? 'favicon-dark.svg' : 'favicon-light.svg'),
    );
  }
})();
