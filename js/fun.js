// Fun Things page: opens the prints and film frames in a full-screen viewer.
// Without this file each photo is a plain link to the full-size image.
(() => {
  const dialog = document.querySelector('.lightbox');
  if (!dialog || typeof dialog.showModal !== 'function') return;

  const img = dialog.querySelector('.lightbox__img');
  const caption = dialog.querySelector('.lightbox__caption');
  const count = dialog.querySelector('.lightbox__count');
  const prev = dialog.querySelector('.lightbox__nav--prev');
  const next = dialog.querySelector('.lightbox__nav--next');

  let items = [];
  let index = 0;

  const show = (i) => {
    index = (i + items.length) % items.length;
    const link = items[index];
    img.src = link.href;
    img.alt = link.querySelector('img').alt;
    caption.textContent = link.dataset.caption || '';
    caption.hidden = !link.dataset.caption;
    count.textContent = `${index + 1} / ${items.length}`;

    // Warm the cache for the neighbours so arrowing through feels instant
    [index - 1, index + 1].forEach((n) => {
      new Image().src = items[(n + items.length) % items.length].href;
    });
  };

  const open = (link) => {
    items = Array.from(link.closest('[data-gallery]').querySelectorAll('a[href]'));
    prev.hidden = next.hidden = items.length < 2;
    show(items.indexOf(link));
    dialog.showModal();
  };

  document.addEventListener('click', (event) => {
    const link = event.target.closest('.print, .frame');
    if (!link || event.metaKey || event.ctrlKey) return;
    event.preventDefault();
    open(link);
  });

  prev.addEventListener('click', () => show(index - 1));
  next.addEventListener('click', () => show(index + 1));
  dialog.querySelector('.lightbox__close').addEventListener('click', () => dialog.close());

  // Clicking the dark backdrop closes the viewer
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });

  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') show(index - 1);
    if (event.key === 'ArrowRight') show(index + 1);
  });

  // Swipe left or right on touch screens
  let startX = null;
  dialog.addEventListener('pointerdown', (event) => { startX = event.clientX; });
  dialog.addEventListener('pointerup', (event) => {
    if (startX === null || items.length < 2) return;
    const dx = event.clientX - startX;
    startX = null;
    if (Math.abs(dx) > 60) show(index + (dx < 0 ? 1 : -1));
  });

  dialog.addEventListener('close', () => { img.removeAttribute('src'); });
})();
