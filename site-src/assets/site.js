(() => {
  document.documentElement.classList.add('js');

  const menuButton = document.querySelector('[data-menu-button]');
  const navigation = document.querySelector('[data-site-nav]');

  if (menuButton && navigation) {
    const closeMenu = () => {
      menuButton.setAttribute('aria-expanded', 'false');
      navigation.classList.remove('is-open');
    };
    menuButton.addEventListener('click', () => {
      const open = menuButton.getAttribute('aria-expanded') === 'true';
      menuButton.setAttribute('aria-expanded', String(!open));
      navigation.classList.toggle('is-open', !open);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeMenu();
    });
    window.addEventListener('resize', () => {
      if (window.innerWidth > 720) closeMenu();
    });
  }

  document.querySelectorAll('[data-filter-root]').forEach((root) => {
    const cards = [...root.querySelectorAll('[data-filter-item]')];
    const search = root.querySelector('[data-search-input]');
    const volume = root.querySelector('[data-volume-filter]');
    const status = root.querySelector('[data-status-filter]');
    const visibleCount = root.querySelector('[data-visible-count]');
    const emptyState = root.querySelector('[data-empty-state]');

    const applyFilters = () => {
      const term = (search?.value || '').trim().toLowerCase();
      const volumeValue = volume?.value || '';
      const statusValue = status?.value || '';
      let count = 0;

      cards.forEach((card) => {
        const searchable = (card.dataset.search || '').toLowerCase();
        const matches = (!term || searchable.includes(term))
          && (!volumeValue || card.dataset.volume === volumeValue)
          && (!statusValue || card.dataset.status === statusValue);
        card.classList.toggle('is-hidden', !matches);
        if (matches) count += 1;
      });

      if (visibleCount) visibleCount.textContent = String(count);
      if (emptyState) emptyState.hidden = count > 0;
    };

    search?.addEventListener('input', applyFilters);
    volume?.addEventListener('change', applyFilters);
    status?.addEventListener('change', applyFilters);
  });
})();
