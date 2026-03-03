const el = document.getElementById('copyright') as HTMLDivElement;

export function showCopyright(text: string): void {
  el.textContent = text;
  el.style.display = 'block';
  el.style.opacity = '0';
  // Tiny fade-in delay so it doesn't compete with the panorama fade
  setTimeout(() => {
    el.style.transition = 'opacity 0.8s ease';
    el.style.opacity = '1';
  }, 800);
}

export function hideCopyright(): void {
  el.style.display = 'none';
}
