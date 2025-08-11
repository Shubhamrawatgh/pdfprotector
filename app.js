// Set the workerSrc for pdf.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.worker.min.js`;

const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const fileInfoDiv = document.getElementById('file-info');
const fileNameSpan = document.getElementById('file-name');
const pageCountSpan = document.getElementById('page-count');
const optionsForm = document.getElementById('options-form');
const protectBtn = document.getElementById('protect-btn');
const statusLog = document.getElementById('status-log');
const openPasswordInput = document.getElementById('open-password');
const permissionsPasswordInput = document.getElementById('permissions-password');
const permissionsFieldset = document.getElementById('permissions-fieldset');
const allowPrintingCheckbox = document.getElementById('allow-printing');
const allowCopyingCheckbox = document.getElementById('allow-copying');

let selectedFile = null;

// --- File Handling & UI ---

dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFileSelect(files[0]);
    }
});
fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFileSelect(e.target.files[0]);
    }
});

function handleFileSelect(file) {
    if (file.type !== 'application/pdf') {
        showStatus('Please select a PDF file.', 'error');
        return;
    }
    selectedFile = file;
    fileNameSpan.textContent = file.name;
    pageCountSpan.textContent = '...';

    fileInfoDiv.classList.remove('hidden');
    optionsForm.classList.remove('hidden');
    statusLog.innerHTML = '';
    statusLog.className = '';

    showPdfPreview(file);
}

async function showPdfPreview(file) {
    try {
        const reader = new FileReader();
        reader.onload = async (e) => {
            const typedarray = new Uint8Array(e.target.result);
            const pdf = await pdfjsLib.getDocument({ data: typedarray }).promise;
            pageCountSpan.textContent = pdf.numPages;
        };
        reader.readAsArrayBuffer(file);
    } catch (error) {
        console.error("Error getting page count:", error);
        pageCountSpan.textContent = 'Could not read page count.';
    }
}

// Enable/disable permissions fieldset based on permissions password
permissionsPasswordInput.addEventListener('input', () => {
    if (permissionsPasswordInput.value) {
        permissionsFieldset.disabled = false;
    } else {
        permissionsFieldset.disabled = true;
    }
});

// --- Encryption Logic ---

optionsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!selectedFile) return;

    const openPassword = openPasswordInput.value;
    const permissionsPassword = permissionsPasswordInput.value;

    if (!openPassword && !permissionsPassword) {
        showStatus('You must provide at least one password.', 'error');
        return;
    }

    protectBtn.disabled = true;
    protectBtn.textContent = 'Processing...';
    showStatus('Reading file...', 'info');

    const pdfBytes = await selectedFile.arrayBuffer();

    const options = {
        userPassword: openPassword,
        ownerPassword: permissionsPassword || openPassword, // qpdf requires an owner password if any protection is set
        permissions: {
            print: allowPrintingCheckbox.checked ? 'full' : 'none',
            copy: allowCopyingCheckbox.checked,
        }
    };

    try {
        // ** PRIMARY METHOD: Call WebAssembly (qpdf) **
        // This function is a placeholder. If qpdf.wasm is compiled and loaded,
        // this call would attempt the high-quality PDF encryption.
        const encryptedPdfBytes = await encryptPdfWasm(new Uint8Array(pdfBytes), options);

        // If WASM succeeded:
        showStatus('PDF encryption successful! Downloading...', 'success');
        const blob = new Blob([encryptedPdfBytes], { type: 'application/pdf' });
        downloadFile(blob, `${stripExtension(selectedFile.name)}.protected.pdf`);

    } catch (error) {
        // ** FALLBACK METHOD: Create Password-Protected ZIP **
        console.warn(`WASM encryption failed: ${error.message}. Falling back to ZIP encryption.`);
        
        if (!openPassword) {
            showStatus('An "Open Password" is required for ZIP encryption fallback.', 'error');
            resetProtectButton();
            return;
        }

        showStatus('WASM not available. Using password-protected ZIP fallback...', 'info');
        
        try {
            const zippedBytes = createEncryptedZip(new Uint8Array(pdfBytes), selectedFile.name, openPassword);
            const blob = new Blob([zippedBytes], { type: 'application/zip' });
            showStatus('ZIP creation successful! Downloading...', 'success');
            downloadFile(blob, `${stripExtension(selectedFile.name)}.protected.zip`);
        } catch (zipError) {
            showStatus(`Failed to create ZIP file: ${zipError.message}`, 'error');
            console.error(zipError);
        }
    } finally {
        resetProtectButton();
    }
});

/**
 * Placeholder for the WASM-based PDF encryption function.
 * This function should be replaced by the actual wrapped C++ function from Emscripten.
 * It takes the PDF data and an options object and returns the encrypted PDF data.
 *
 * @param {Uint8Array} pdfBytes - The raw bytes of the PDF file.
 * @param {object} options - The encryption options.
 * @returns {Promise<Uint8Array>} The encrypted PDF bytes.
 */
function encryptPdfWasm(pdfBytes, options) {
    // To enable WASM:
    // 1. Compile qpdf to WASM (see wasm/qpdf-readme.txt).
    // 2. Load the generated qpdf.js script in index.html.
    // 3. Initialize the module and use cwrap to get the real function.
    // 4. Replace this entire function with the real implementation.
    return Promise.reject(new Error("WASM module not loaded."));
}

/**
 * Fallback function to create a password-protected ZIP file using fflate.
 *
 * @param {Uint8Array} fileBytes - The raw bytes of the file to zip.
 * @param {string} fileName - The name of the file inside the zip.
 * @param {string} password - The password for AES encryption.
 * @returns {Uint8Array} The encrypted ZIP file bytes.
 */
function createEncryptedZip(fileBytes, fileName, password) {
    const fileData = {
        [fileName]: fileBytes
    };
    
    // fflate's zipSync function with password protection (AES)
    const zipped = fflate.zipSync(fileData, {
        password: password,
        level: 0 // No compression, just store and encrypt
    });
    
    return zipped;
}


// --- Utility Functions ---

function showStatus(message, type) {
    statusLog.textContent = message;
    statusLog.className = `status-${type}`;
}

function downloadFile(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function resetProtectButton() {
    protectBtn.disabled = false;
    protectBtn.textContent = 'Protect PDF';
}

function stripExtension(filename) {
    return filename.substring(0, filename.lastIndexOf('.')) || filename;
}