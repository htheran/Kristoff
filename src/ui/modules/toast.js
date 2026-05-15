// Toast Notification System
window.Toast = {
    container: null,

    init() {
        if (this.container) return;
        this.container = document.createElement('div');
        this.container.id = 'toastContainer';
        this.container.className = 'toast-container';
        document.body.appendChild(this.container);

        // Add styles if not present
        if (!document.getElementById('toastStyles')) {
            const style = document.createElement('style');
            style.id = 'toastStyles';
            style.innerHTML = `
                .toast-container {
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    z-index: 3000;
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }
                .toast {
                    background: #2c3e50;
                    color: white;
                    padding: 12px 20px;
                    border-radius: 8px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                    font-size: 14px;
                    min-width: 200px;
                    max-width: 350px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    transform: translateY(20px);
                    opacity: 0;
                    transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
                }
                .toast.show {
                    transform: translateY(0);
                    opacity: 1;
                }
                .toast-success { border-left: 4px solid #27ae60; }
                .toast-error { border-left: 4px solid #e74c3c; }
                .toast-info { border-left: 4px solid #3498db; }
                .toast-close {
                    margin-left: 15px;
                    cursor: pointer;
                    font-size: 18px;
                    opacity: 0.7;
                }
                .toast-close:hover { opacity: 1; }
            `;
            document.head.appendChild(style);
        }
    },

    show(message, type = 'info', duration = 4000) {
        this.init();
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <span class="toast-message">${message}</span>
            <span class="toast-close">&times;</span>
        `;

        this.container.appendChild(toast);

        // Animate in
        setTimeout(() => toast.classList.add('show'), 10);

        const close = () => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        };

        toast.querySelector('.toast-close').onclick = close;

        if (duration > 0) {
            setTimeout(close, duration);
        }
    },

    success(msg) { this.show(msg, 'success'); },
    error(msg) { this.show(msg, 'error'); },
    info(msg) { this.show(msg, 'info'); }
};
