const fadeEl = document.getElementById('fade') as HTMLDivElement;
const statusEl = document.getElementById('transition-status') as HTMLDivElement | null;

export function showFadeOverlay(): Promise<void> {
  fadeEl.style.opacity = '1';
  return new Promise((resolve) => {
    fadeEl.addEventListener('transitionend', () => resolve(), { once: true });
    // Fallback if transition doesn't fire (e.g. already at target opacity)
    setTimeout(resolve, 500);
  });
}

export function hideFadeOverlay(): Promise<void> {
  fadeEl.style.opacity = '0';
  return new Promise((resolve) => {
    fadeEl.addEventListener('transitionend', () => resolve(), { once: true });
    setTimeout(resolve, 500);
  });
}

export function setTransitionStatus(msg: string): void {
  if (statusEl) statusEl.textContent = msg;
}
