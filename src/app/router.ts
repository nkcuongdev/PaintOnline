import { useMemo, useSyncExternalStore } from 'react';

/**
 * Hash route tối giản (mục 7.9): `#/` là trang chủ, `#/project/<id>` là editor.
 * Reload giữ đúng project, nút Back của trình duyệt quay về trang chủ.
 */
export type Route =
  { name: 'home' } | { name: 'project'; projectId: string } | { name: 'not-found'; path: string };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isProjectId(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/** Đổi `location.hash` thành Route. Hàm thuần, có unit test. */
export function parseHash(hash: string): Route {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  let path: string;
  try {
    path = decodeURIComponent(raw);
  } catch {
    return { name: 'not-found', path: raw };
  }

  const segments = path.split('/').filter((segment) => segment.length > 0);
  if (segments.length === 0) return { name: 'home' };

  if (segments.length === 2) {
    const [head = '', id = ''] = segments;
    if (head === 'project' && isProjectId(id)) {
      return { name: 'project', projectId: id.toLowerCase() };
    }
  }
  return { name: 'not-found', path };
}

export function routeToHash(route: Route): string {
  switch (route.name) {
    case 'home':
      return '#/';
    case 'project':
      return `#/project/${route.projectId}`;
    case 'not-found':
      return `#/${route.path.replace(/^\/+/, '')}`;
  }
}

/**
 * Chuyển route. `replace` thay mục lịch sử hiện tại (không tạo bước Back mới) —
 * `history.replaceState` không phát `hashchange` nên phát thủ công.
 */
export function navigate(route: Route, options: { replace?: boolean } = {}): void {
  const hash = routeToHash(route);
  if (window.location.hash === hash) return;

  if (options.replace) {
    const url = `${window.location.pathname}${window.location.search}${hash}`;
    window.history.replaceState(window.history.state, '', url);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = hash;
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => {
    window.removeEventListener('hashchange', onChange);
  };
}

function getHash(): string {
  return window.location.hash;
}

/** Route hiện tại (ngoài React: lệnh, Command Palette). */
export function readRoute(): Route {
  return parseHash(window.location.hash);
}

/** Route hiện tại, cập nhật khi hash đổi. */
export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, getHash, () => '');
  return useMemo(() => parseHash(hash), [hash]);
}
