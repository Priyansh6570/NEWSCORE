/**
 * Blocking inline script that runs before paint to restore a user's saved
 * light/dark choice from localStorage — preventing a dark-mode flash on reload.
 * An explicit `?theme=` in the URL (already applied server-side) always wins, so
 * the script only fills in the persisted preference when the URL didn't force one.
 * This concerns ONLY light/dark; the tenant brand skin is server-injected
 * (see TenantThemeStyle) and never flashes.
 */
const SCRIPT = `(function(){try{
  var url=new URL(window.location.href);
  if(url.searchParams.get('theme'))return;
  var t=localStorage.getItem('newscore-theme');
  if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t);
}catch(e){}})();`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
