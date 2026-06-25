(function () {
  var scriptTag = document.currentScript;
  var measurementId = scriptTag && scriptTag.getAttribute('data-ga-measurement-id');

  if (!measurementId) {
    return;
  }

  window.dataLayer = window.dataLayer || [];
  if (!window.gtag) {
    window.gtag = function () {
      window.dataLayer.push(arguments);
    };
  }

  var dataset = scriptTag ? scriptTag.dataset || {} : {};
  var gtagSrc = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(measurementId);
  if (!document.querySelector('script[src="' + gtagSrc + '"]')) {
    var gaScript = document.createElement('script');
    gaScript.async = true;
    gaScript.src = gtagSrc;
    document.head.appendChild(gaScript);
  }

  window.trackAnalytics = function (eventName, params) {
    if (!eventName) {
      return;
    }
    window.gtag('event', eventName, Object.assign({send_to: measurementId}, params || {}));
  };

  window.trackPageView = function (options) {
    window.gtag('event', 'page_view', Object.assign({send_to: measurementId}, options || {}));
  };

  window.gtag('js', new Date());
  window.gtag('config', measurementId, {
    send_page_view: dataset.trackPageView !== '0',
    anonymize_ip: dataset.anonymizeIp !== '0'
  });
})();
