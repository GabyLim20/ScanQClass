document.addEventListener('DOMContentLoaded', () => {
  if (!document.querySelector('.swiper.team-slider')) return;

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
});

window.addEventListener('scroll', () => {
  const header = document.querySelector('.site-header');
  if (!header) return;
  if (window.scrollY > 80) header.classList.add('sticky_head');
  else header.classList.remove('sticky_head');
});

