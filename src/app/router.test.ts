import { describe, expect, it } from 'vitest';
import { parseHash, routeToHash, type Route } from './router';

const ID = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b';

describe('parseHash', () => {
  it.each(['', '#', '#/', '#//'])('"%s" là trang chủ', (hash) => {
    expect(parseHash(hash)).toEqual({ name: 'home' });
  });

  it('nhận project id dạng UUID', () => {
    expect(parseHash(`#/project/${ID}`)).toEqual({ name: 'project', projectId: ID });
  });

  it('chuẩn hóa UUID về chữ thường', () => {
    expect(parseHash(`#/project/${ID.toUpperCase()}`)).toEqual({ name: 'project', projectId: ID });
  });

  it('chấp nhận dấu / ở cuối', () => {
    expect(parseHash(`#/project/${ID}/`)).toEqual({ name: 'project', projectId: ID });
  });

  it.each([
    ['#/project', 'thiếu id'],
    ['#/project/abc', 'id không phải UUID'],
    [`#/project/${ID}/extra`, 'thừa đoạn'],
    ['#/settings', 'route lạ'],
    ['#/%E0%A4%A', 'percent-encoding hỏng'],
  ])('"%s" → not-found (%s)', (hash) => {
    expect(parseHash(hash).name).toBe('not-found');
  });
});

describe('routeToHash', () => {
  it.each<Route>([{ name: 'home' }, { name: 'project', projectId: ID }])(
    'round-trip %o',
    (route) => {
      expect(parseHash(routeToHash(route))).toEqual(route);
    },
  );
});
