// Lets non-React code (axios interceptor) navigate with React Router.
let navigateFn: ((to: string) => void) | null = null;

export function registerNavigate(fn: (to: string) => void) {
  navigateFn = fn;
}

export function navigateTo(to: string) {
  if (navigateFn) navigateFn(to);
  else window.location.assign(to);
}
