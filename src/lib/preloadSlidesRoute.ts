let slidesRoutePreload: Promise<typeof import("@/pages/SlidesBeta.tsx")> | null = null;

export function preloadSlidesRoute() {
  if (!slidesRoutePreload) {
    slidesRoutePreload = import("@/pages/SlidesBeta.tsx").catch((error) => {
      slidesRoutePreload = null;
      throw error;
    });
  }
  return slidesRoutePreload;
}
