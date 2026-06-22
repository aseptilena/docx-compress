if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .catch(err => console.error('Registrasi Service Worker gagal:', err));
    });
}

function compressImage(base64Str, mimeType, qualityScale, formatOption, bgColor) {
    return new Promise((resolve, reject) => {
        let img = new Image();
        img.onload = () => {
            let canvas = document.createElement('canvas');
            canvas.width = img.width * qualityScale;
            canvas.height = img.height * qualityScale;
            
            let ctx = canvas.getContext('2d');
            
            let outputMime = (formatOption === 'forceJpg') ? 'image/jpeg' : mimeType;
            let outputExt = (outputMime === 'image/jpeg') ? '.jpg' : (mimeType === 'image/png' ? '.png' : '.jpg');
            
            if (outputMime === 'image/jpeg') {
                ctx.fillStyle = (bgColor === 'black') ? '#000000' : '#FFFFFF';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
            
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            
            let compressedDataUrl = canvas.toDataURL(outputMime, qualityScale);
            let resultBase64 = compressedDataUrl.split(',')[1];
            
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            canvas.width = 0;
            canvas.height = 0;
            img.src = '';
            img = null;
            
            resolve({ base64: resultBase64, extension: outputExt });
        };
        img.onerror = reject;
        img.src = `data:${mimeType};base64,${base64Str}`;
    });
}

// ---------------------------------------------------------
// MODUL BARU: Logika Reset Antarmuka
// ---------------------------------------------------------
document.getElementById('resetBtn').addEventListener('click', () => {
    // Mengembalikan input ke nilai bawaan
    document.getElementById('docFile').value = '';
    document.getElementById('quality').value = '0.5';
    document.getElementById('formatOption').value = 'forceJpg';
    document.getElementById('bgColorOption').value = 'white';
    
    // Pembersihan status dan tombol I/O
    document.getElementById('status').innerText = 'Antarmuka berhasil direset. Silakan unggah berkas baru.';
    
    const compressBtn = document.getElementById('compressBtn');
    compressBtn.disabled = false;
    compressBtn.innerText = 'Eksekusi Kompresi';
    
    const downloadLink = document.getElementById('downloadLink');
    if (downloadLink) downloadLink.style.display = 'none';
});

// ---------------------------------------------------------
// MODUL UTAMA: Eksekusi Kompresi
// ---------------------------------------------------------
document.getElementById('compressBtn').addEventListener('click', async () => {
    const fileInput = document.getElementById('docFile');
    const statusTxt = document.getElementById('status');
    const quality = parseFloat(document.getElementById('quality').value);
    const formatOption = document.getElementById('formatOption').value;
    const bgColorOption = document.getElementById('bgColorOption').value;
    const downloadLinkElement = document.getElementById('downloadLink');
    const compressBtnElement = document.getElementById('compressBtn');

    if (fileInput.files.length === 0) {
        statusTxt.innerText = "Peringatan: Harap unggah berkas arsip terlebih dahulu.";
        return;
    }

    compressBtnElement.disabled = true;
    if (downloadLinkElement) downloadLinkElement.style.display = 'none';
    statusTxt.innerText = "Memulai dekonstruksi memori dan pemrosesan arsip...";

    const file = fileInput.files[0];
    const zip = new JSZip();

    try {
        const doc = await zip.loadAsync(file);
        
        const hasMedia = Object.keys(doc.files).some(path => path.startsWith("word/media/"));
        if (!hasMedia) {
            statusTxt.innerText = "Operasi dibatalkan: Media tertanam tidak terdeteksi pada struktur arsip.";
            compressBtnElement.disabled = false;
            return;
        }

        let processedCount = 0;
        let renamingMap = new Map();

        for (let filename in doc.files) {
            if (filename.startsWith("word/media/") && filename.match(/\.(png|jpe?g)$/i)) {
                let fileObj = doc.files[filename];
                if (fileObj.dir) continue;
                
                let base64Data = await fileObj.async("base64");
                let mimeType = filename.toLowerCase().endsWith('png') ? 'image/png' : 'image/jpeg';
                
                let compressedData = await compressImage(base64Data, mimeType, quality, formatOption, bgColorOption);
                
                let pureFilename = filename.split('/').pop(); 
                let newPureFilename = pureFilename.replace(/\.[^/.]+$/, "") + compressedData.extension;
                
                if (pureFilename !== newPureFilename) {
                    renamingMap.set(pureFilename, newPureFilename);
                    doc.remove(filename); 
                }
                
                let newFilename = filename.replace(/\.[^/.]+$/, "") + compressedData.extension;
                doc.file(newFilename, compressedData.base64, {base64: true});
                processedCount++;
            }
        }

        if (renamingMap.size > 0) {
            const relsFile = doc.file("word/_rels/document.xml.rels");
            if (relsFile) {
                let relsText = await relsFile.async("string");
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(relsText, "application/xml");
                const relationships = xmlDoc.getElementsByTagName("Relationship");
                
                let xmlChanged = false;
                for (let i = 0; i < relationships.length; i++) {
                    let target = relationships[i].getAttribute("Target");
                    let mediaName = target.split('/').pop();
                    
                    if (renamingMap.has(mediaName)) {
                        let newTarget = target.replace(mediaName, renamingMap.get(mediaName));
                        relationships[i].setAttribute("Target", newTarget);
                        xmlChanged = true;
                    }
                }
                
                if (xmlChanged) {
                    const serializer = new XMLSerializer();
                    doc.file("word/_rels/document.xml.rels", serializer.serializeToString(xmlDoc));
                }
            }
        }

        statusTxt.innerText = "Mengeksekusi kompilasi biner berkas...";
        const content = await doc.generateAsync({ type: "blob", compression: "DEFLATE" });
        
        const objectUrl = URL.createObjectURL(content);
        
        if (downloadLinkElement) {
            downloadLinkElement.href = objectUrl;
            downloadLinkElement.download = `Optimal_${file.name}`;
            downloadLinkElement.style.display = 'inline-block';
            downloadLinkElement.innerText = `Simpan Berkas: Optimal_${file.name}`;
            
            compressBtnElement.innerText = "Kompresi Selesai";
            statusTxt.innerText = `Pemrosesan sukses. ${processedCount} berkas dioptimalkan.`;
        }
        
    } catch (error) {
        statusTxt.innerText = "Kegagalan arsitektural: " + error.message;
        console.error(error);
        compressBtnElement.disabled = false;
        compressBtnElement.innerText = "Eksekusi Kompresi";
    }
});
