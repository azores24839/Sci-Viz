const DEFAULT_API_URL = 'http://127.0.0.1:3001';
var apiUrl = DEFAULT_API_URL;

async function checkStatus() {
  var dot = document.getElementById('statusDot');
  var text = document.getElementById('statusText');
  if (!dot || !text) return;

  try {
    var res = await fetch(apiUrl + '/api/health');
    if (res.ok) {
      dot.className = 'dot ok';
      text.textContent = '后端连接正常';
    } else {
      dot.className = 'dot err';
      text.textContent = '后端响应异常';
    }
  } catch (_e) {
    dot.className = 'dot err';
    text.textContent = '无法连接后端（后端没启动？）';
  }
}

async function capture(data) {
  try {
    var formData = new FormData();
    formData.append('source_url', data.source_url);
    formData.append('page_title', data.page_title);
    formData.append('context_text', data.context_text || '');
    formData.append('capture_type', data.capture_type);

    if (data.image_blob) {
      formData.append('image_file', data.image_blob, 'capture_' + Date.now() + '.png');
    } else if (data.image_url) {
      formData.append('image_url', data.image_url);
    }

    var res = await fetch(apiUrl + '/api/captures', { method: 'POST', body: formData });
    var result = await res.json();
    if (result.success) {
      alert('✅ 保存成功！');
    } else {
      alert('保存失败: ' + (result.error || '未知错误'));
    }
  } catch (err) {
    alert('❌ 保存失败：无法连接后端服务。\n\n请确认：\n1. 终端里已经启动了后端（npm run dev）\n2. API 地址填写正确（插件弹出框中可设置）');
  }
}

document.addEventListener('DOMContentLoaded', function () {
  var apiUrlInput = document.getElementById('apiUrl');

  chrome.storage.sync.get(['apiUrl'], function (result) {
    if (result.apiUrl) { apiUrl = result.apiUrl; apiUrlInput.value = apiUrl; }
    checkStatus();
  });

  apiUrlInput.addEventListener('change', function () {
    apiUrl = apiUrlInput.value || DEFAULT_API_URL;
    chrome.storage.sync.set({ apiUrl: apiUrl });
    checkStatus();
  });

  document.getElementById('btnScreenshot').addEventListener('click', async function () {
    var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    var tab = tabs[0];
    chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' }, async function (dataUrl) {
      var blob = await (await fetch(dataUrl)).blob();
      await capture({
        source_url: tab.url || '',
        page_title: tab.title || '',
        image_blob: blob,
        capture_type: 'screenshot',
      });
    });
  });

  document.getElementById('btnImages').addEventListener('click', async function () {
    var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    var tab = tabs[0];
    if (!tab.id) return;
    chrome.tabs.sendMessage(tab.id, { action: 'getImages' }, async function (response) {
      if (response && response.images && response.images.length > 0) {
        await capture({
          source_url: tab.url || '',
          page_title: tab.title || '',
          image_url: response.images[0],
          capture_type: 'image',
        });
      } else {
        alert('未找到页面图片');
      }
    });
  });
});
