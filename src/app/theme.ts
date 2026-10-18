import {
  isThemePreference,
  selectResolvedTheme,
  useUiStore,
  type ResolvedTheme,
  type ThemePreference,
} from '@/stores/ui';

/**
 * Light/Dark (mục 7.1, 7.9): class `dark` trên <html>, mặc định theo hệ thống,
 * favicon và `theme-color` đổi theo theme.
 *
 * Lựa chọn của người dùng được nhân bản vào localStorage để `public/theme-init.js`
 * áp dụng đồng bộ trước khi trang vẽ lần đầu (IndexedDB là bất đồng bộ nên sẽ gây
 * nháy màu). Xem docs/DECISIONS.md, ADR 0015.
 */

/** Phải trùng với khóa trong public/theme-init.js. */
export const THEME_STORAGE_KEY = 'paint-online:theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';

/** Phải trùng với --background trong styles/globals.css. */
const THEME_COLORS: Readonly<Record<ResolvedTheme, string>> = {
  light: '#f7f7f9',
  dark: '#1b1b1e',
};

export function readStoredThemePreference(): ThemePreference {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(value) ? value : 'system';
  } catch {
    // localStorage có thể bị chặn (chế độ riêng tư, chính sách trình duyệt).
    return 'system';
  }
}

export function storeThemePreference(preference: ThemePreference): void {
  try {
    if (preference === 'system') window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Không lưu được thì chỉ áp dụng cho phiên hiện tại.
  }
}

function systemThemeQuery(): MediaQueryList | null {
  return typeof window.matchMedia === 'function' ? window.matchMedia(DARK_QUERY) : null;
}

/** Áp dụng theme lên tài liệu: class, color-scheme, theme-color, favicon. */
export function applyTheme(resolved: ResolvedTheme, doc: Document = document): void {
  const root = doc.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  root.style.colorScheme = resolved;
  root.dataset.theme = resolved;

  const themeColor = doc.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (themeColor) themeColor.content = THEME_COLORS[resolved];

  const icon = doc.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (icon) icon.href = `${import.meta.env.BASE_URL}favicon-${resolved}.svg`;
}

/**
 * Đồng bộ uiStore ↔ DOM ↔ localStorage ↔ theme hệ thống. Gọi một lần khi khởi động;
 * trả về hàm hủy (dùng trong test).
 */
export function startThemeSync(): () => void {
  const store = useUiStore;
  const query = systemThemeQuery();

  store.setState({
    themePreference: readStoredThemePreference(),
    systemPrefersDark: query?.matches ?? false,
  });
  applyTheme(selectResolvedTheme(store.getState()));

  const unsubscribeStore = store.subscribe((state, previous) => {
    if (state.themePreference !== previous.themePreference) {
      storeThemePreference(state.themePreference);
    }
    const resolved = selectResolvedTheme(state);
    if (resolved !== selectResolvedTheme(previous)) applyTheme(resolved);
  });

  const onSystemChange = (event: MediaQueryListEvent) => {
    store.getState().setSystemPrefersDark(event.matches);
  };
  query?.addEventListener('change', onSystemChange);

  // Tab khác đổi theme → áp dụng ở tab này.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY) return;
    store
      .getState()
      .setThemePreference(isThemePreference(event.newValue) ? event.newValue : 'system');
  };
  window.addEventListener('storage', onStorage);

  return () => {
    unsubscribeStore();
    query?.removeEventListener('change', onSystemChange);
    window.removeEventListener('storage', onStorage);
  };
}
