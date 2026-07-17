import { bootstrapEditor } from './pages/editor.js';

bootstrapEditor().catch((error) => {
  document.querySelector('#bootScreen')?.remove();
  const wordmark = document.querySelector('#bootWordmark');
  if (wordmark) {
    wordmark.textContent = '角色打开失败';
    wordmark.removeAttribute('aria-hidden');
  }
  const message = document.createElement('p');
  message.className = 'editor-boot-error';
  message.setAttribute('role', 'alert');
  message.textContent = error.message;
  document.body.append(message);
});
