/**
 * Utility functions for Kristoff
 */

let clipboardClearTimer = null;

window.copyToClipboard = async function(text) {
    if (!text) return;
    
    // v=170: Focus fix for clipboard access after dialogs
    if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
    }
    window.focus();
    
    // Give a tiny moment for focus to settle
    await new Promise(r => setTimeout(r, 100));

    try {
        await navigator.clipboard.writeText(text);
        
        // Clear previous timer if exists
        if (clipboardClearTimer) {
            clearTimeout(clipboardClearTimer);
        }
        
        // Auto-clear clipboard after 15 seconds for security
        clipboardClearTimer = setTimeout(async () => {
            try {
                if (window.api && typeof window.api.clearClipboard === 'function') {
                    await window.api.clearClipboard();
                } else {
                    await navigator.clipboard.writeText('');
                }
            } catch (e) {
                // Clipboard may have been modified by user, ignore
            }
        }, 15000);

        if (window.Toast) {
            Toast.success('Copiado al portapapeles (Auto-limpieza en 15s)');
        } else {
            // console.log('Copiado:', text);
        }
    } catch (err) {
        console.error('Error al copiar:', err);
        // Fallback for older browsers or non-secure contexts
        try {
            const textArea = document.createElement("textarea");
            textArea.value = text;
            textArea.style.position = "fixed";
            textArea.style.left = "-999999px";
            textArea.style.top = "-999999px";
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            if (window.Toast) Toast.success('Copiado (fallback)');
        } catch (e) {
            if (window.Toast) Toast.error('Fallo al copiar');
        }
    }
};

window.formatDate = function(dateStr) {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleString();
};

window.getCredentialIdFromResult = function(result) {
    const data = result?.data || {};
    return data.id || data.credential_id || data.credential?.id || data.data?.id || null;
};

window.generateSecurePassword = function(length = 24) {
    // v2026: Ultra-Safe charset for maximum compatibility (32 chars default)
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*-=_+";
    let retVal = "";
    // Use crypto.getRandomValues for true security if available
    if (window.crypto && window.crypto.getRandomValues) {
        const array = new Uint32Array(length);
        window.crypto.getRandomValues(array);
        for (let i = 0; i < length; i++) {
            retVal += charset.charAt(array[i] % charset.length);
        }
    } else {
        // Fallback to Math.random
        for (let i = 0, n = charset.length; i < length; ++i) {
            retVal += charset.charAt(Math.floor(Math.random() * n));
        }
    }
    return retVal;
};
