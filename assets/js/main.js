document.addEventListener('DOMContentLoaded', () => {
  const swiperRoot = document.querySelector('.swiper.team-slider');
  if (swiperRoot) {
    new Swiper('.swiper.team-slider', {
      slidesPerView: 1,
      spaceBetween: 24,
      loop: true,
      navigation: {
        nextEl: '.swiper-button-next',
        prevEl: '.swiper-button-prev'
      },
      pagination: {
        el: '.swiper-pagination',
        clickable: true
      },
      breakpoints: {
        768: { slidesPerView: 2 },
        1200: { slidesPerView: 3 }
      }
    });
  }

  const navigation = document.querySelector('.main-navigation');
  const menuToggle = document.querySelector('.menu-toggle');
  const headerMenu = document.querySelector('.header-menu');
  const menuLinks = document.querySelectorAll('.header-menu a');

  if (!navigation || !menuToggle || !headerMenu) return;

  function setMenuOpen(isOpen) {
    navigation.classList.toggle('toggled', isOpen);
    menuToggle.setAttribute('aria-expanded', String(isOpen));
    document.body.classList.toggle('body-fixed', isOpen && window.innerWidth <= 991);
  }

  menuToggle.setAttribute('aria-expanded', 'false');
  menuToggle.setAttribute('aria-label', 'Abrir menú de navegación');

  menuToggle.addEventListener('click', () => {
    setMenuOpen(!navigation.classList.contains('toggled'));
  });

  menuLinks.forEach((link) => {
    link.addEventListener('click', () => {
      if (window.innerWidth <= 991) setMenuOpen(false);
    });
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 991) {
      setMenuOpen(false);
    }
  });
});

window.addEventListener('scroll', () => {
  const header = document.querySelector('.site-header');
  if (!header) return;
  if (window.scrollY > 80) header.classList.add('sticky_head');
  else header.classList.remove('sticky_head');
});
