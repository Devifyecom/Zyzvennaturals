class SliderComponent extends HTMLElement {
  constructor() {
    super();
    this.slider = this.querySelector('[id^="Slider-"]');
    this.slides = this.querySelectorAll('[id^="Slide-"]');
    this.prevButton = this.querySelector('button[name="previous"]');
    this.nextButton = this.querySelector('button[name="next"]');
    this.currentPage = this.querySelector('.slider-counter--current');
    this.totalPages = this.querySelector('.slider-counter--total');

    if (!this.slider || !this.slides.length) return;

    this.init();
  }

  init() {
    this.update();

    this.prevButton?.addEventListener('click', () => {
      this.slider.scrollBy({
        left: -this.slider.clientWidth,
        behavior: 'smooth'
      });
    });

    this.nextButton?.addEventListener('click', () => {
      this.slider.scrollBy({
        left: this.slider.clientWidth,
        behavior: 'smooth'
      });
    });

    this.slider.addEventListener('scroll', () => {
      this.update();
    });
  }

  update() {
    const index =
      Math.round(this.slider.scrollLeft / this.slider.clientWidth) + 1;

    if (this.currentPage) {
      this.currentPage.textContent = index;
    }

    if (this.totalPages) {
      this.totalPages.textContent = this.slides.length;
    }
  }
}

customElements.define('slider-component', SliderComponent);