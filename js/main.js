// Header shadow, scroll-in motion, photo flip, before/after slider, and project filters.
// The site works without this file.
(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Header shadow once the page scrolls ----------
  const header = document.querySelector('.site-header');
  if (header) {
    const updateShadow = () => header.classList.toggle('is-scrolled', window.scrollY > 4);
    updateShadow();
    window.addEventListener('scroll', updateShadow, { passive: true });
  }

  // ---------- Scroll-in ----------
  const revealItems = document.querySelectorAll('.reveal');

  if (reduceMotion || !('IntersectionObserver' in window)) {
    revealItems.forEach((el) => el.classList.add('in'));
  } else {
    // Stagger siblings inside grids so cards arrive one after another
    document.querySelectorAll('.card-grid, .figure-row').forEach((group) => {
      Array.from(group.children).forEach((child, i) => child.style.setProperty('--i', i));
    });

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('in');
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -5% 0px' }
    );

    revealItems.forEach((el) => observer.observe(el));
  }

  // ---------- Photo flip (index.html and contact.html) ----------
  const funPhotos = [
    { src: 'assets/profile/fun-1.jpg', pos: '50% 60%', alt: 'Marisa smiling in sunglasses, sitting on a boulder on a mountain hike' },
    { src: 'assets/profile/fun-2.jpg', pos: '50% 70%', alt: 'Marisa backpacking along a trail below red rock canyon walls at sunset' },
    { src: 'assets/profile/fun-3.jpg', pos: '50% 60%', alt: 'Marisa smiling in field waders and a red sun hat, holding a camera, with mountains behind' },
    { src: 'assets/profile/fun-4.jpg', pos: '50% 50%', alt: 'Marisa in a wetsuit and helmet rappelling beside a waterfall' }
  ];

  document.querySelectorAll('.flip').forEach((flip) => {
    const back = flip.querySelector('.flip__back');
    let current = null;

    // Show a random fun photo, never the same one twice in a row
    const showRandomPhoto = () => {
      const options = funPhotos.filter((photo) => photo !== current);
      const next = options[Math.floor(Math.random() * options.length)];
      current = next;

      // Load it first so the card never flips to a blank back
      const loader = new Image();
      loader.onload = () => {
        if (current !== next) return;
        back.src = next.src;
        back.alt = next.alt;
        back.style.objectPosition = next.pos;
      };
      loader.src = next.src;
    };

    const isShowingFront = () =>
      !flip.classList.contains('is-flipped') && !flip.matches(':hover');

    const setFlipped = (on) => {
      flip.classList.toggle('is-flipped', on);
      flip.setAttribute('aria-pressed', String(on));
      back.setAttribute('aria-hidden', String(!on));
    };

    showRandomPhoto();

    flip.tabIndex = 0;
    flip.setAttribute('role', 'button');
    flip.setAttribute('aria-label', 'Photo of Marisa. Press to flip between a professional photo and a fun one.');
    setFlipped(false);

    // Mouse users flip by hovering (CSS); touch users tap
    if (!window.matchMedia('(hover: hover)').matches) {
      flip.addEventListener('click', () => setFlipped(!flip.classList.contains('is-flipped')));
    }

    flip.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      setFlipped(!flip.classList.contains('is-flipped'));
    });

    // Once the card has finished turning back to the front, line up a new photo
    flip.addEventListener('transitionend', (event) => {
      if (event.propertyName !== 'transform' && event.propertyName !== 'opacity') return;
      if (isShowingFront()) showRandomPhoto();
    });
  });

  // ---------- Before / after slider ----------
  document.querySelectorAll('.compare').forEach((compare) => {
    const range = compare.querySelector('.compare__range');
    const update = () => compare.style.setProperty('--pos', `${range.value}%`);
    range.addEventListener('input', update);
    update();
  });

  // ---------- Project carousels (projects.html) ----------
  document.querySelectorAll('.carousel').forEach((carousel) => {
    const track = carousel.querySelector('.carousel__track');
    const makeButton = (dir, label, symbol) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `carousel__btn carousel__btn--${dir}`;
      button.setAttribute('aria-label', label);
      button.textContent = symbol;
      carousel.appendChild(button);
      return button;
    };
    const prev = makeButton('prev', 'Show previous projects', '‹');
    const next = makeButton('next', 'Show more projects', '›');

    const update = () => {
      const max = track.scrollWidth - track.clientWidth;
      prev.disabled = track.scrollLeft <= 2;
      next.disabled = track.scrollLeft >= max - 2;
    };
    const step = () => {
      const card = track.querySelector('.proj:not([hidden])');
      return card ? card.getBoundingClientRect().width + 24 : track.clientWidth;
    };
    const scrollBy = (dir) =>
      track.scrollBy({ left: dir * step(), behavior: reduceMotion ? 'auto' : 'smooth' });

    prev.addEventListener('click', () => scrollBy(-1));
    next.addEventListener('click', () => scrollBy(1));
    track.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    track.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowRight') { event.preventDefault(); scrollBy(1); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); scrollBy(-1); }
    });
    update();
  });

  // ---------- Project filters (projects.html) ----------
  const bar = document.querySelector('.filters');
  if (!bar) return;

  const skillLabels = {
    'python': 'Python', 'c-cpp': 'C/C++', 'matlab': 'MATLAB', 'javascript': 'JavaScript', 'bash': 'Bash',
    'react': 'React', 'django': 'Django', 'postgresql': 'PostgreSQL', 'supabase': 'Supabase',
    'docker': 'Docker', 'aws': 'AWS', 'rest-apis': 'REST APIs', 'security': 'authentication & security', 'testing': 'automated testing', 'arduino': 'Arduino',
    'raspberry-pi': 'Raspberry Pi', 'sensor-integration': 'sensor integration',
    'hyperspectral-imaging': 'hyperspectral imaging', 'epics': 'EPICS', 'pydm': 'PyDM',
    'linux': 'Linux', 'gis': 'GIS', 'ci-cd': 'CI/CD'
  };

  const cards = document.querySelectorAll('.proj[data-tags]');
  const sections = document.querySelectorAll('[data-filter-section]');
  const banner = document.querySelector('.skill-banner');

  const show = (test) => {
    cards.forEach((card) => { card.hidden = !test(card); });
    // Hide a section heading when none of its cards match
    sections.forEach((section) => {
      section.hidden = !section.querySelector('.proj:not([hidden])');
    });
    // Carousel arrows depend on how many cards are left
    document.querySelectorAll('.carousel__track').forEach((track) => {
      track.scrollLeft = 0;
      track.dispatchEvent(new Event('scroll'));
    });
  };

  const setPressed = (pressedButton) => {
    bar.querySelectorAll('button').forEach((b) => {
      b.setAttribute('aria-pressed', String(b === pressedButton));
    });
  };

  bar.hidden = false;

  bar.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-filter]');
    if (!button) return;

    const filter = button.dataset.filter;
    setPressed(button);
    if (banner) banner.hidden = true;
    show((card) => filter === 'all' || card.dataset.tags.split(' ').includes(filter));
  });

  // Arriving from a skill on the resume page: ?skill=python
  const skill = new URLSearchParams(window.location.search).get('skill');
  if (skill && banner) {
    const usesSkill = (card) => (card.dataset.skills || '').split(' ').includes(skill);
    if (Array.from(cards).some(usesSkill)) {
      banner.querySelector('[data-skill-name]').textContent = skillLabels[skill] || skill;
      banner.hidden = false;
      setPressed(null);
      show(usesSkill);
    }
  }
})();
