var DEFAULT_API_URL = 'http://127.0.0.1:3001';

chrome.runtime.onInstalled.addListener(function () {
  chrome.contextMenus.create({
    id: 'saveImageToVizHub',
    title: '保存到科研视觉案例库',
    contexts: ['image'],
  });

  chrome.contextMenus.create({
    id: 'saveSelectionToVizHub',
    title: '保存选中内容到科研视觉案例库',
    contexts: ['selection'],
  });
});

chrome.contextMenus.onClicked.addListener(async function (info, tab) {
  if (!tab) return;

  var result = await chrome.storage.sync.get('apiUrl');
  var apiUrl = result.apiUrl || DEFAULT_API_URL;

  if (info.menuItemId === 'saveImageToVizHub' && info.srcUrl) {
    var contextText = '';
    try {
      var response = await chrome.tabs.sendMessage(tab.id, {
        action: 'getContextForImage',
        imageUrl: info.srcUrl,
      });
      contextText = (response && response.contextText) || '';
    } catch (_e) {
      // content script may not be loaded
    }

    var formData = new FormData();
    formData.append('source_url', tab.url || '');
    formData.append('page_title', tab.title || '');
    formData.append('image_url', info.srcUrl);
    formData.append('context_text', contextText);
    formData.append('capture_type', 'image');

    try {
      var res = await fetch(apiUrl + '/api/captures', { method: 'POST', body: formData });
      var resultJson = await res.json();
      if (resultJson.success) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: '保存成功',
          message: '图片已保存到科研视觉案例库',
        });
      }
    } catch (err) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: '保存失败',
        message: '无法连接后端。请确认终端已启动 npm run dev',
      });
    }
  }

  if (info.menuItemId === 'saveSelectionToVizHub') {
    var selectionData = { text: '', images: [] };
    try {
      var selResponse = await chrome.tabs.sendMessage(tab.id, { action: 'getSelection' });
      selectionData = selResponse || selectionData;
    } catch (_e) {
      // content script may not be loaded
    }

    var formData2 = new FormData();
    formData2.append('source_url', tab.url || '');
    formData2.append('page_title', tab.title || '');
    formData2.append('context_text', selectionData.text || info.selectionText || '');
    formData2.append('capture_type', 'page_selection');
    if (selectionData.images && selectionData.images[0]) {
      formData2.append('image_url', selectionData.images[0]);
    }

    try {
      var res2 = await fetch(apiUrl + '/api/captures', { method: 'POST', body: formData2 });
      var result2 = await res2.json();
      if (result2.success) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: '保存成功',
          message: '选中内容已保存到科研视觉案例库',
        });
      }
    } catch (err) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: '保存失败',
        message: '无法连接后端。请确认终端已启动 npm run dev',
      });
    }
  }
});
