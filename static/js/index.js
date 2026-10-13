document.addEventListener('DOMContentLoaded', function () {
  var videos = Array.from(document.querySelectorAll('video[data-autoplay]'));
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (videos.length && !reduceMotion) {
    function playVideo(video) {
      var promise = video.play();
      if (promise && typeof promise.catch === 'function') {
        promise.catch(function () {
          // Browser autoplay policies can still require manual playback.
        });
      }
    }

    if (!('IntersectionObserver' in window)) {
      videos.forEach(playVideo);
    } else {
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            playVideo(entry.target);
          } else {
            entry.target.pause();
          }
        });
      }, {
        rootMargin: '120px 0px',
        threshold: 0.2
      });

      videos.forEach(function (video) {
        observer.observe(video);
      });
    }
  }

  var methodFigure = document.querySelector('.method-interactive');
  var methodDescription = document.getElementById('method-stage-description');
  var methodHotspots = methodFigure ? Array.from(methodFigure.querySelectorAll('.method-hotspot')) : [];

  if (methodFigure && methodDescription && methodHotspots.length) {
    var descriptionTitle = methodDescription.querySelector('strong');
    var descriptionText = methodDescription.querySelector('span');
    var defaultTitle = descriptionTitle.textContent;
    var defaultText = descriptionText.textContent;

    function showMethodStage(hotspot) {
      methodHotspots.forEach(function (item) {
        var active = item === hotspot;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      descriptionTitle.textContent = hotspot.dataset.title;
      descriptionTitle.hidden = false;
      descriptionText.textContent = hotspot.dataset.description;
    }

    function resetMethodStage() {
      methodHotspots.forEach(function (item) {
        item.classList.remove('is-active');
        item.setAttribute('aria-pressed', 'false');
      });
      descriptionTitle.textContent = defaultTitle;
      descriptionTitle.hidden = !defaultTitle;
      descriptionText.textContent = defaultText;
    }

    methodHotspots.forEach(function (hotspot) {
      hotspot.setAttribute('aria-pressed', 'false');
      hotspot.addEventListener('mouseenter', function () { showMethodStage(hotspot); });
      hotspot.addEventListener('focus', function () { showMethodStage(hotspot); });
      hotspot.addEventListener('click', function () { showMethodStage(hotspot); });
    });

    methodFigure.addEventListener('mouseleave', function () {
      if (!methodFigure.contains(document.activeElement)) {
        resetMethodStage();
      }
    });
  }

});
