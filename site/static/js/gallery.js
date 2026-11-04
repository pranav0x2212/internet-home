(function () {
    const modal = document.getElementById('lightbox-modal');
    const lightboxImage = document.getElementById('lightbox-image');
    const lightboxCaption = document.querySelector('.lightbox-caption');
    const closeBtn = document.querySelector('.lightbox-close');
    const prevBtn = document.querySelector('.lightbox-prev');
    const nextBtn = document.querySelector('.lightbox-next');
    const thumbnails = document.querySelectorAll('.gallery-thumbnail');

    thumbnails.forEach((thumbnail) => {
        const probe = new Image();
        probe.onload = () => {
            thumbnail.parentElement.style.setProperty('--ar', probe.naturalWidth / probe.naturalHeight);
        };
        probe.src = thumbnail.getAttribute('src');
    });

    let currentIndex = 0;
    let totalImages = thumbnails.length;
    let captionsMap = {};

    async function loadCaptions() {
        try {
            const response = await fetch('/data/gallery_captions.json');
            if (response.ok) {
                captionsMap = await response.json();
            }
        } catch (error) {
            console.debug('Gallery captions JSON not found or failed to load');
        }
    }

    function generateCaption(filename) {
        return filename
            .replace(/\.[^/.]+$/, '')
            .replace(/_/g, ' ')
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }

    function getCaption(filename) {
        if (captionsMap[filename]) {
            return captionsMap[filename];
        }
        return generateCaption(filename);
    }

    function openLightbox(index) {
        if (index < 0 || index >= totalImages) return;
        currentIndex = index;
        updateLightboxContent();
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        lightboxImage.focus();
    }

    function closeLightbox() {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }

    function updateLightboxContent() {
        const thumbnail = thumbnails[currentIndex];
        const filename = thumbnail.getAttribute('data-filename');
        const src = thumbnail.getAttribute('src');
        const caption = getCaption(filename);

        lightboxImage.src = src;
        lightboxImage.alt = caption;
        lightboxCaption.textContent = caption;

        if (currentIndex > 0) {
            new Image().src = thumbnails[currentIndex - 1].getAttribute('src');
        }
        if (currentIndex < totalImages - 1) {
            new Image().src = thumbnails[currentIndex + 1].getAttribute('src');
        }
    }

    function previousImage() {
        let newIndex = currentIndex - 1;
        if (newIndex < 0) {
            newIndex = totalImages - 1;
        }
        openLightbox(newIndex);
    }

    function nextImage() {
        let newIndex = currentIndex + 1;
        if (newIndex >= totalImages) {
            newIndex = 0;
        }
        openLightbox(newIndex);
    }

    thumbnails.forEach((thumbnail, index) => {
        thumbnail.addEventListener('click', () => openLightbox(index));
    });

    closeBtn.addEventListener('click', closeLightbox);
    prevBtn.addEventListener('click', previousImage);
    nextBtn.addEventListener('click', nextImage);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeLightbox();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (!modal.classList.contains('active')) return;

        if (e.key === 'Escape') {
            closeLightbox();
        } else if (e.key === 'ArrowLeft') {
            previousImage();
        } else if (e.key === 'ArrowRight') {
            nextImage();
        }
    });

    modal.addEventListener('wheel', (e) => {
        if (modal.classList.contains('active')) {
            e.preventDefault();
        }
    }, { passive: false });

    loadCaptions();
})();
