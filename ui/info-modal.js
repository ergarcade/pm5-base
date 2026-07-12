// Wires up the standard "i" info button next to an app's <h1> and the
// open/close behavior of its companion <dialog>. The dialog's content is
// app-specific and stays in that app's own index.html -- this only owns the
// button + show/close/backdrop-click wiring, so every app doesn't hand-roll
// the same few lines. DOM-touching by design (unlike lib/, which is DOM-free).
function initInfoModal({ titleSelector = 'header h1', dialogSelector = '#info-modal' } = {}) {
    const title = document.querySelector(titleSelector);
    const dialog = document.querySelector(dialogSelector);

    const button = document.createElement('button');
    button.id = 'info-toggle';
    button.className = 'info-toggle';
    button.type = 'button';
    button.setAttribute('aria-label', 'About this app');
    button.textContent = 'i';
    title.insertAdjacentElement('afterend', button);

    button.addEventListener('click', () => dialog.showModal());
    dialog.querySelector('[data-close]')?.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
}
