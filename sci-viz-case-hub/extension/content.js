chrome.runtime.onMessage.addListener(function (request, _sender, sendResponse) {
  if (request.action === 'getImages') {
    var imgs = Array.from(document.querySelectorAll('img'));
    var images = imgs
      .filter(function (img) { return img.naturalWidth >= 200 && img.naturalHeight >= 200; })
      .map(function (img) { return img.src; })
      .slice(0, 10);
    sendResponse({ images: images });
  }

  if (request.action === 'getContextForImage') {
    var img = null;
    var imgs = document.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) {
      if (imgs[i].src === request.imageUrl) {
        img = imgs[i];
        break;
      }
    }
    var contextText = '';
    if (img) {
      var parent = img.parentElement;
      if (parent) contextText = (parent.textContent || '').trim().substring(0, 500);
      var alt = img.getAttribute('alt') || '';
      contextText = [alt, contextText].filter(Boolean).join(' - ');
    }
    sendResponse({ contextText: contextText });
  }

  if (request.action === 'getSelection') {
    var selection = window.getSelection();
    var text = selection ? selection.toString() : '';
    var images = [];
    if (selection && selection.rangeCount > 0) {
      var range = selection.getRangeAt(0);
      var container = range.commonAncestorContainer.parentElement;
      if (container) {
        var imgTags = container.querySelectorAll('img');
        images = Array.from(imgTags).map(function (img) { return img.src; }).filter(Boolean);
      }
    }
    sendResponse({ text: text, images: images });
  }

  return true;
});
