import type { RouteObject } from "react-router";
import type { RegisteredFeatures, SliceRoute } from "@org/slice-kit";

/**
 * 切片的路由 → react-router 的路由（C239，Q74）。
 *
 * 契約自己定路由型別、由這裡轉換，因為 react-router 的路由沒有 `name`，而命名空間
 * 檢查與選單都掛在 name 上。name 放進 `id`：react-router 要求 id 唯一，而切片契約
 * 保證 name 帶切片前綴、composition-root 的測試守著跨切片不重複。
 */
export function toRouteObject(route: SliceRoute): RouteObject {
  return {
    id: route.name,
    path: route.path,
    lazy: async () => ({ Component: (await route.component()).default }),
    children: route.children?.map(toRouteObject),
  };
}

export interface MenuLink {
  readonly routeName: string;
  readonly labelKey: string;
  readonly path: string;
}

/**
 * 選單項目 → 連結的完整路徑。
 *
 * react-router 沒有具名路由，選單的 `routeName` 要在這裡換成路徑。找不到就丟 ——
 * 否則畫面上是一個指向 `undefined` 的連結，點了沒反應、也不報錯。
 */
export function menuLinks(registered: RegisteredFeatures): readonly MenuLink[] {
  const paths = new Map<string, string>();
  const walk = (routes: readonly SliceRoute[], parent: string): void => {
    for (const route of routes) {
      // 巢狀路由的 path 相對於父層（同 defineFeature 的規則）。
      const path = route.path.startsWith("/") ? route.path : `${parent}/${route.path}`;
      if (route.name !== undefined) paths.set(route.name, path);
      if (route.children) walk(route.children, path);
    }
  };
  walk(registered.routes, "");

  return registered.menu.map((item) => {
    const path = paths.get(item.routeName);
    if (path === undefined) {
      throw new Error(`選單項目 "${item.labelKey}" 指向不存在的路由 "${item.routeName}"`);
    }
    return { routeName: item.routeName, labelKey: item.labelKey, path };
  });
}
