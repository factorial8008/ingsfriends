let currentImages = [];
let currentIndex = 0;
let slideshowInterval;

async function initSlideshow() {
  const data = await chrome.storage.local.get('slideshowImages');
  currentImages = data.slideshowImages;
  
  if (!currentImages || currentImages.length === 0) {
    alert('선택된 이미지가 없습니다.');
    window.close();
    return;
  }
  
  showNextImage();
  slideshowInterval = setInterval(showNextImage, 10000);
}

function showNextImage() {
  const img = document.getElementById('slideshow-image');
  const credit = document.getElementById('credit');
  
  img.src = currentImages[currentIndex].url;
  credit.textContent = `made by ${currentImages[currentIndex].author}`;
  
  currentIndex = (currentIndex + 1) % currentImages.length;
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (slideshowInterval) {
      clearInterval(slideshowInterval);
    }
    window.close();
  }
});

initSlideshow();