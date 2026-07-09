/**
 * Tailwind class strings for the dashboard page scaffolding shared by
 * every dashboard route (shell, header, title, card grid).
 */
export const dashboardShellClass =
  'mx-auto max-w-[1920px] px-5 pt-8 pb-12 max-[768px]:px-3.5 max-[768px]:pt-4 max-[768px]:pb-8';

export const dashboardHeaderClass =
  'flex items-start justify-between gap-5 border-b border-line pb-6 max-[900px]:flex-col max-[900px]:items-stretch max-[768px]:gap-3';

export const dashboardTitleClass = 'm-0 text-soft-white text-[clamp(28px,4vw,44px)] leading-[1.05]';

export const cardGridClass =
  'grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4 max-[768px]:grid-cols-1';
